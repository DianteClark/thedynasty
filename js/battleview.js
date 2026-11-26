// Battle screen: setup, live battlefield (pan, pinch-zoom, minimap), orders, stratagem, results.
import { Battle, FIELD, ORDERS, UNITS, RESERVE_ORDERS, layoutBases, fieldFor, BASE_CAPS } from './battle.js';
import { BUILDINGS, BIOMES } from '../assets/world/world.js';
import { walkable, nearestNode } from './bmap.js';
import { CARDS, CP_MAX, CP_EVERY, cardBlock, canClose } from './strat.js';
import { CULTURES, cultureById } from './names.js';

const FACTIONS = Object.keys(UNITS);
const role = (f, u) => UNITS[f][u].role;
const TERRAINS = ['plains', 'forest', 'swamp', 'wasteland', 'tundra', 'mountain'];
const ROLE_LABEL = { inf: 'Infantry', heavy: 'Heavy', ranged: 'Ranged', magic: 'Casters', cav: 'Cavalry', flyer: 'Fliers' };
const SIZES = { skirmish: 0.45, battle: 1, war: 1.6 };
const GLYPH = { hold: '■', advance: '➜', charge: '⚔', flankL: '↰', flankR: '↱', retreat: '↩', defend: '◈', push: '»', follow: '⇢' };
const MID = 0.9;
const MAP_ORDERS = { hold: 'Hold position', advance: 'Advance', charge: 'Charge', flankL: 'Take another road', retreat: 'Fall back to camp' };
let goingTo = false, cardSel = null; // cardSel: { slot, id, edges } while a stratagem card waits for a target
const orderLabel = o => !o ? '' : o.startsWith('goto:') ? 'Marching to a base' : o.startsWith('follow') ? RESERVE_ORDERS.follow : (B && B.map ? MAP_ORDERS[o] : null) || ORDERS[o] || RESERVE_ORDERS[o] || o;
const glyphOf = o => !o ? '•' : o.startsWith('goto:') ? '📍' : GLYPH[o] || '•'; // the camera never zooms out past Mid: you follow your officers, not the whole field
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

let unitNames = null, images = {}, assetsReady = null;
function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
function flipped(img) { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.translate(img.width, 0); g.scale(-1, 1); g.drawImage(img, 0, 0); return c; }
function loadAssets() {
  if (assetsReady) return assetsReady;
  assetsReady = (async () => {
    unitNames = Object.fromEntries(FACTIONS.map(f => [f, UNITS[f].map(u => u.name)]));
    await Promise.all(FACTIONS.map(async f => { const im = await loadImg(`assets/units/${f}.png`); images[f] = { r: im, l: flipped(im) }; }));
    images.ammo = await loadImg('assets/ammo.png');
    images.buildings = await loadImg('assets/world/buildings.png');
    images.terrain = await loadImg('assets/world/terrain.png');
    await Promise.all(TERRAINS.map(async t => { images['g_' + t] = await loadImg(`assets/ground/${t}.png`); }));
  })();
  return assetsReady;
}

// ---------- setup ----------
const setup = {
  you: 'aldmark', foe: 'undying', terrain: 'plains', size: 'battle', ai: 'balanced', bases: '2-2-1',
  picks: { aldmark: [0, 1, 5] },
};
function rnd(a) { return a[Math.floor(Math.random() * a.length)]; }
function makeOfficer(faction) {
  const c = cultureById(faction); const female = Math.random() < 0.45;
  const name = female ? rnd(c.f) + rnd(c.fe) : rnd(c.m) + rnd(c.me);
  const st = () => 5 + Math.floor(Math.random() * 12);
  return { name, female, stats: { lea: st(), mig: st(), int: st(), cha: st() }, level: 1 + Math.floor(Math.random() * 6) };
}
function defaultPicks(f) {
  const r = UNITS[f].map(u => u.role); const pick = [];
  const want = [['inf', 'heavy'], ['ranged', 'magic'], ['cav', 'flyer']];
  for (const w of want) { const i = r.findIndex((x, k) => w.includes(x) && UNITS[f][k].entry && !pick.includes(k)); const j = i >= 0 ? i : r.findIndex((x, k) => w.includes(x) && !pick.includes(k)); pick.push(j >= 0 ? j : 0); }
  return pick;
}
const officers = {};
function officersFor(side, f) { const k = side + f; if (!officers[k]) officers[k] = [makeOfficer(f), makeOfficer(f), makeOfficer(f)]; return officers[k]; }

export async function renderBattleSetup(view) {
  view.innerHTML = '<div class="empty">Loading the battlefield…</div>';
  try { await loadAssets(); } catch (e) { view.innerHTML = '<div class="empty">Could not load the sprites.</div>'; return; }
  if (!setup.picks[setup.you]) setup.picks[setup.you] = defaultPicks(setup.you);
  const picks = setup.picks[setup.you];
  const offs = officersFor('you', setup.you);
  const facBtns = (key) => FACTIONS.map(f => `<button class="chip ${setup[key] === f ? 'on' : ''}" data-bset="${key}" data-val="${f}">${cultureById(f).name}</button>`).join('');
  view.innerHTML = `
    <div class="card"><h3>⚔ Battle sandbox</h3><div class="sub">Command three divisions on a battle map. Orders ride out by messenger, so they take time to arrive, and faster for officers with high Leadership. Morale decides who breaks. You get one stratagem: a volley of fire.</div></div>
    <h2 class="sec">Your army</h2><div class="chips">${facBtns('you')}</div>
    ${picks.map((u, i) => divisionPicker(i, u, offs[i])).join('')}
    <h2 class="sec">The enemy</h2><div class="chips">${facBtns('foe')}</div>
    <div class="chips">${['reckless', 'balanced', 'cautious'].map(a => `<button class="chip ${setup.ai === a ? 'on' : ''}" data-bset="ai" data-val="${a}">${a[0].toUpperCase() + a.slice(1)} general</button>`).join('')}</div>
    <h2 class="sec">Battlefield</h2><div class="chips">${TERRAINS.map(t => `<button class="chip ${setup.terrain === t ? 'on' : ''}" data-bset="terrain" data-val="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>
    <div class="chips">${Object.keys(SIZES).map(s => `<button class="chip ${setup.size === s ? 'on' : ''}" data-bset="size" data-val="${s}">${s[0].toUpperCase() + s.slice(1)} (${Math.round(2200 * SIZES[s]).toLocaleString()} troops)</button>`).join('')}</div>
    <div class="chips">${['none', '2-1', '2-2-1', '3-2', '1-3-1'].map(b => `<button class="chip ${setup.bases === b ? 'on' : ''}" data-bset="bases" data-val="${b}">${b === 'none' ? 'Open field' : 'Bases ' + b}</button>`).join('')}</div>
    <div class="sub" style="margin:4px 2px">With bases you attack: burn their main camp before nightfall. Garrisons sleep until you come near. Your own reserve takes simple orders.</div>
    <button class="btn" id="startBattle">Begin the battle</button>
    <p class="note">A practice battle outside your world. Unit art: HAS by Aleksandr Makarov.</p>`;
}
function divisionPicker(i, u, off) {
  const r = UNITS[setup.you].map(x => x.role);
  return `<div class="card"><div style="display:flex;align-items:center;gap:10px">${spriteIcon(setup.you, u)}<div style="flex:1"><b>${esc(unitNames[setup.you][u])}</b> <span class="sub">${ROLE_LABEL[r[u]]}${UNITS[setup.you][u].entry ? '' : ' · upgraded'}</span><div class="sub">Officer ${esc(off.name)} · Lead ${off.stats.lea} · Might ${off.stats.mig} · Int ${off.stats.int} · Cha ${off.stats.cha}</div></div></div>
    <div class="chips" style="margin-top:8px">${r.map((role, k) => `<button class="chip ${k === u ? 'on' : ''}" data-div="${i}" data-unit="${k}">${esc(unitNames[setup.you][k])}</button>`).join('')}</div></div>`;
}
function spriteIcon(f, u) {
  return `<span style="width:40px;height:40px;flex:none;background:url(assets/units/${f}.png) 0 -${u * 40}px / 800px auto no-repeat;image-rendering:pixelated;display:inline-block"></span>`;
}
export function handleBattleSetupClick(t, view) {
  if (t.dataset.bset) { setup[t.dataset.bset] = t.dataset.val; if (t.dataset.bset === 'you' && setup.picks[setup.you]?.some(u => u >= UNITS[setup.you].length)) delete setup.picks[setup.you]; renderBattleSetup(view); return true; }
  if (t.dataset.div != null && t.dataset.unit != null) { setup.picks[setup.you][+t.dataset.div] = +t.dataset.unit; renderBattleSetup(view); return true; }
  if (t.id === 'startBattle') { startBattle(); return true; }
  return false;
}

// ---------- live battle ----------
let B = null, cam = null, raf = 0, speed = 1, paused = false, root = null, spectator = null, acc = 0, mySide = 0, command = null, canvas, g, mini, mg, sel = null, targeting = false, seenEvents = 0, lastT = 0, toasts = [];

function startBattle() {
  const scale = SIZES[setup.size];
  const youPicks = setup.picks[setup.you];
  const foePicks = defaultPicks(setup.foe);
  const counts = [350, 250, 160].map(n => Math.round(n * scale));
  const mkSide = (faction, picks, offs, name, color, ai) => ({ faction, name, color, ai, divisions: picks.map((u, i) => ({ unit: u, count: Math.max(30, Math.round(counts[i] * (role(faction, u) === 'cav' || role(faction, u) === 'heavy' ? 0.8 : 1) * (UNITS[faction][u].entry ? 1 : 0.75))), level: offs[i].level, officer: offs[i] })) });
  const sides = [
    mkSide(setup.you, youPicks, officersFor('you', setup.you), `Your army`, '#4fa3ff', null),
    mkSide(setup.foe, foePicks, officersFor('foe', setup.foe), `The ${cultureById(setup.foe).name} host`, '#ff5a4a', setup.ai),
  ];
  let bases = [], field;
  if (setup.bases !== 'none') {
    const ent = (f, roles) => Math.max(0, UNITS[f].findIndex(u => u.entry && roles.includes(u.role)));
    const gar = { main: 700, fort: 300, outpost: 150 };
    for (const side of [0, 1]) for (const b of layoutBases(setup.bases, side)) { const f = side ? setup.foe : setup.you; bases.push({ ...b, faction: f, unit: ent(f, b.kind === 'fort' ? ['ranged', 'magic'] : ['inf', 'heavy']), count: Math.round(gar[b.kind] * scale), name: (side ? 'their ' : 'your ') + (b.kind === 'main' ? 'main camp' : b.kind) }); }
    sides[0].reserve = { count: Math.round(300 * scale), unit: 0 }; sides[1].reserve = { count: Math.round(300 * scale), unit: 0 };
    field = fieldFor(sides.reduce((a, s) => a + s.divisions.reduce((x, d) => x + d.count, 0) + s.reserve.count, 0) + bases.reduce((a, b) => a + b.count, 0));
  }
  B = new Battle({ seed: Math.floor(Math.random() * 1e9), terrain: setup.terrain, sides, bases, field });
  for (const k of Object.keys(officers)) delete officers[k]; // fresh officers next time
  spectator = null; command = null; mySide = 0;
  buildScreen();
}

// Command your own side in a battle from the living world.
export async function commandBattle(cfg, info, side, onDone) {
  window.__wl = { B: () => B, cam: () => cam }; // for the automated tests
  await loadAssets();
  B = new Battle(cfg);
  spectator = null; command = { info, onDone }; mySide = side;
  toasts = [];
  buildScreen();
  toasts.push({ text: info.title, cls: 'strat', at: performance.now() + 3000 });
}

// Watch a battle from the living world: both sides are led by their own generals.
export async function watchBattle(cfg, info, onDone) {
  await loadAssets();
  B = new Battle(cfg);
  spectator = { info, onDone }; command = null; mySide = 0;
  toasts = [];
  buildScreen();
  toasts.push({ text: info.title, cls: 'strat', at: performance.now() + 3000 });
}

function buildScreen() {
  root = document.createElement('div'); root.className = 'battle';
  root.innerHTML = `
    <canvas class="bf"></canvas>
    <div class="bhud btop"><button class="bbtn" data-b="exit">✕</button><span class="btime" id="btime">0:00</span><button class="bbtn" data-b="zoom" aria-label="Zoom">⤢</button>
      <div class="bspeed">${[['pause', '❚❚'], ['1', '1×'], ['2', '2×'], ['4', '4×']].map(([k, l]) => `<button class="bbtn ${k === '1' ? 'on' : ''}" data-b="speed" data-v="${k}">${l}</button>`).join('')}</div></div>
    <div class="btoasts" id="btoasts"></div>
    <canvas class="bmini" width="160" height="100"></canvas>
    ${spectator ? '<button class="bbtn fire" data-b="skip">⏭ Skip to the end</button>' : `<div class="bfirebar">${B.cards ? '<div class="bcardtip" id="bcardtip" hidden></div><div class="bcards" id="bcards"></div>' : '<button class="bbtn" data-b="fire">🔥 Fire volley</button>'}${command ? '<button class="bbtn" data-b="handover">🎖 Let your generals finish</button>' : ''}</div>`}
    <div class="bdivs" id="bdivs"></div>
    <div class="border" id="border" hidden></div>
    <div class="bresult" id="bresult" hidden></div>`;
  document.body.appendChild(root); document.body.classList.add('in-battle');
  canvas = root.querySelector('.bf'); g = canvas.getContext('2d');
  mini = root.querySelector('.bmini'); mg = mini.getContext('2d');
  buildGround();
  const fit = () => { const dpr = Math.min(2, window.devicePixelRatio || 1); canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px'; cam.dpr = dpr; };
  cam = spectator ? { x: B.fw / 2, y: B.fh / 2, z: MID, dpr: 1, follow: true } : { x: mySide === 0 ? 300 : B.fw - 300, y: B.fh / 2, z: 1.5, dpr: 1 };
  fit(); window.addEventListener('resize', fit); root._fit = fit;
  if (!spectator) { const own = B.divisions.filter(d => d.side === mySide && !d.garrison && !d.reserve); if (own.length) { const first = B.map ? own[0] : null; cam.x = first ? first.cx : own.reduce((a, d) => a + d.cx, 0) / own.length + (mySide === 0 ? 120 : -120); cam.y = first ? first.cy : own.reduce((a, d) => a + d.cy, 0) / own.length; } }
  bindInput();
  seenEvents = 0; sel = null; targeting = false; cardSel = null; goingTo = false; groundRev = B.map ? B.map.rev : 0; speed = 1; paused = false; lastT = performance.now(); acc = 0; if (!spectator) toasts = [];
  renderDivCards();
  raf = requestAnimationFrame(frame);
}

// the field is drawn in 512px chunks, only where the camera looks (big maps would not fit one canvas)
const CK = 512; let gChunks = new Map(), cChunks = new Map(), groundRev = 0;
function hsh(x, y, k = 0) { let h = (x * 374761393 + y * 668265263 + k * 1442695041) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function buildGround() { gChunks = new Map(); cChunks = new Map(); }
function groundChunk(cx, cy) {
  const key = cx + ',' + cy; let c = gChunks.get(key); if (c) return c;
  c = document.createElement('canvas'); c.width = CK; c.height = CK; const gg = c.getContext('2d'); gg.imageSmoothingEnabled = false;
  const tiles = images['g_' + B.terrain]; const x0 = cx * CK, y0 = cy * CK; gg.translate(-x0, -y0);
  for (let y = y0; y < y0 + CK; y += 16) for (let x = x0; x < x0 + CK; x += 16) { const k = hsh(x, y) < 0.75 ? 0 : hsh(x, y, 1) < 0.5 ? 1 : 2; gg.drawImage(tiles, k * 16, 0, 16, 16, x, y, 16, 16); }
  for (let y = y0; y < y0 + CK; y += 16) for (let x = x0; x < x0 + CK; x += 16) if (hsh(x, y, 2) < 0.05) gg.drawImage(tiles, 48 + Math.floor(hsh(x, y, 3) * 5) * 16, 0, 16, 16, x, y, 16, 16);
  const M = B.map;
  if (M) {
    const bi = Math.max(0, BIOMES.indexOf(B.terrain)); const riverX = M.w / 2;
    const closed = M.edges.filter(e => e.closed && !e.open), near = (e, x, y, pad) => { const a = M.nodes[e.a], b = M.nodes[e.b]; const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L)); return Math.hypot(x - a.x - dx * t, y - a.y - dy * t) < e.w / 2 + pad; };
    const isWater = (x, y) => (M.river && Math.abs(x - riverX) < 95 + Math.sin(y / 140) * 25) || closed.some(e => e.closed === 'flood' && near(e, x, y, 0));
    const isSlide = (x, y) => closed.some(e => e.closed === 'slide' && near(e, x, y, 24));
    // roads: packed earth over the grass; bridges over the river
    for (let y = y0; y < y0 + CK; y += 16) for (let x = x0; x < x0 + CK; x += 16) {
      const w = walkable(M, x + 8, y + 8);
      if (isWater(x + 8, y + 8)) { gg.drawImage(images.terrain, 288, 0, 16, 16, x, y, 16, 16); if (w) { gg.fillStyle = '#7a5a34'; gg.fillRect(x, y + 2, 16, 12); gg.fillStyle = '#5b4026'; gg.fillRect(x, y + 6, 16, 1); gg.fillRect(x, y + 11, 16, 1); } continue; }
      if (w) {
        gg.fillStyle = `rgba(150,112,66,${0.5 + hsh(x, y, 4) * 0.12})`; gg.fillRect(x, y, 16, 16);
        if (hsh(x, y, 5) < 0.15) { gg.fillStyle = 'rgba(90,66,40,.35)'; gg.fillRect(x + hsh(x, y, 6) * 12, y + hsh(x, y, 7) * 12, 3, 2); } // pebbles and ruts
        gg.fillStyle = 'rgba(70,52,30,.45)'; // the road's edge where it meets the wild
        if (!walkable(M, x + 24, y + 8)) gg.fillRect(x + 14, y, 2, 16); if (!walkable(M, x - 8, y + 8)) gg.fillRect(x, y, 2, 16);
        if (!walkable(M, x + 8, y + 24)) gg.fillRect(x, y + 14, 16, 2); if (!walkable(M, x + 8, y - 8)) gg.fillRect(x, y, 16, 2);
      }
    }
    // everything off the roads: woods and rock, drawn top to bottom
    const objs = [];
    for (let y = y0 - 32; y < y0 + CK + 32; y += 16) for (let x = x0 - 32; x < x0 + CK + 32; x += 16) {
      if (walkable(M, x + 8, y + 8) || isWater(x + 8, y + 8) || x < 0 || y < 0 || x >= M.w || y >= M.h) continue;
      const rocky = isSlide(x, y) || B.terrain === 'mountain' || B.terrain === 'wasteland' || (B.terrain !== 'forest' && hsh(x >> 7, y >> 7, 6) < 0.35);
      if (rocky && (hsh(x, y, 7) < 0.55 || isSlide(x, y))) objs.push({ y: y + 14, f: () => gg.drawImage(images.terrain, 5 * 32, 40, 32, 32, x - 8 + hsh(x, y, 8) * 4, y - 14, 32, 32) });
      else for (let k = 0; k < 2; k++) if (hsh(x, y, 9 + k) < 0.8) { const ox = hsh(x, y, 11 + k) * 10 - 5, oy = hsh(x, y, 13 + k) * 8 - 4, v = hsh(x, y, 15 + k) < 0.5 ? 0 : 1; const tb = rocky ? 5 : bi === 0 ? 1 : bi; objs.push({ y: y + oy + 12, f: () => gg.drawImage(images.terrain, tb * 48 + v * 24, 16, 24, 24, x - 4 + ox, y - 10 + oy, 24, 24) }); }
    }
    objs.sort((a, b) => a.y - b.y).forEach(o => o.f());
  } else {
    for (let i = 0; i < 40; i++) { const k = Math.floor(hsh(cx, cy, 20 + i) * 6); gg.drawImage(tiles, k * 16, 16, 16, 16, x0 + hsh(cx, cy, 60 + i) * CK, y0 + hsh(cx, cy, 90 + i) * CK, 16, 16); }
  }
  gChunks.set(key, c); return c;
}
function corpseChunk(cx, cy) { const key = cx + ',' + cy; let c = cChunks.get(key); if (!c) { c = document.createElement('canvas'); c.width = CK; c.height = CK; cChunks.set(key, c); } return c; }

function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  // a heavy clash slows the battle a touch instead of stuttering: never more than a few steps a frame, and no catching up
  if (!paused && !B.over) { acc += dt * speed; let n = 0; const cap = Math.max(2, Math.ceil(speed)); while (acc >= 1 / 30 && n++ < cap) { B.step(1 / 30); acc -= 1 / 30; } if (acc > 1 / 30) acc = 0; }
  // bake finished deaths into the corpse layer
  if (B.corpses.length) { for (const s of B.corpses) { const cx = Math.floor(s.x / CK), cy = Math.floor(s.y / CK); const cg = corpseChunk(cx, cy).getContext('2d'); cg.save(); cg.translate(-cx * CK, -cy * CK); cg.globalAlpha = 0.85; drawUnit(cg, s, 1, 4, 3); cg.restore(); } B.corpses.length = 0; }
  draw(); drawMini(); hud();
  raf = requestAnimationFrame(frame);
}

function worldToScreen(x, y) { return { x: (x - cam.x) * cam.z + innerWidth / 2, y: (y - cam.y) * cam.z + innerHeight / 2 }; }
function screenToWorld(x, y) { return { x: (x - innerWidth / 2) / cam.z + cam.x, y: (y - innerHeight / 2) / cam.z + cam.y }; }
function clampCam() {
  const hw = innerWidth / 2 / cam.z, hh = innerHeight / 2 / cam.z;
  cam.x = Math.max(Math.min(hw, B.fw / 2), Math.min(B.fw - Math.min(hw, B.fw / 2), cam.x));
  cam.y = Math.max(Math.min(hh, B.fh / 2) - 60 / cam.z, Math.min(B.fh - Math.min(hh, B.fh / 2) + 160 / cam.z, cam.y));
}

function drawUnit(ctx, s, scale, animOverride, frameOverride) {
  const img = images[s.div.faction]; const sheet = s.flip ? img.l : img.r;
  const anim = animOverride ?? s.anim; const fr = frameOverride ?? (Math.floor(s.at) % 4);
  let col = anim * 4 + fr; if (s.flip) col = 19 - col;
  ctx.drawImage(sheet, col * 16, s.div.unit * 16, 16, 16, Math.round(s.x - 8 * scale), Math.round(s.y - 14 * scale), 16 * scale, 16 * scale);
}

function draw() {
  if (cam.follow) {
    // follow the fighting; while the armies are still far apart, ride with the attackers
    const sx = [0, 0], sy = [0, 0], sn = [0, 0];
    for (let i = 0; i < B.soldiers.length; i += 5) { const s = B.soldiers[i]; if (s.alive && !s.fled && !s.div.dormant && (s.div.inCombat || !s.div.garrison)) { sx[s.side] += s.x; sy[s.side] += s.y; sn[s.side]++; } }
    if (sn[0] + sn[1]) {
      let tx = (sx[0] + sx[1]) / (sn[0] + sn[1]), ty = (sy[0] + sy[1]) / (sn[0] + sn[1]);
      if (sn[0] && sn[1] && Math.abs(sx[0] / sn[0] - sx[1] / sn[1]) > innerWidth / cam.z * 0.8) { tx = sx[0] / sn[0] + 140; ty = sy[0] / sn[0]; }
      cam.x += (tx - cam.x) * 0.06; cam.y += (ty - cam.y) * 0.06;
    }
  }
  clampCam();
  if (B.map && B.map.rev !== groundRev) { groundRev = B.map.rev; gChunks = new Map(); if (cardSel) cardSel.edges = eligibleEdges(cardSel.id); }
  const d = cam.dpr; g.setTransform(d, 0, 0, d, 0, 0); g.imageSmoothingEnabled = false;
  g.fillStyle = '#111'; g.fillRect(0, 0, innerWidth, innerHeight);
  g.setTransform(cam.z * d, 0, 0, cam.z * d, (innerWidth / 2 - cam.x * cam.z) * d, (innerHeight / 2 - cam.y * cam.z) * d);
  { const vw = innerWidth / cam.z, vh = innerHeight / cam.z, vx = cam.x - vw / 2, vy = cam.y - vh / 2;
    for (let cy = Math.max(0, Math.floor(vy / CK)); cy <= Math.min(Math.ceil(B.fh / CK) - 1, Math.floor((vy + vh) / CK)); cy++)
      for (let cx = Math.max(0, Math.floor(vx / CK)); cx <= Math.min(Math.ceil(B.fw / CK) - 1, Math.floor((vx + vw) / CK)); cx++) { g.drawImage(groundChunk(cx, cy), cx * CK, cy * CK); const cc = cChunks.get(cx + ',' + cy); if (cc) g.drawImage(cc, cx * CK, cy * CK); } }
  // fire zones
  for (const f of B.fires) {
    if (!f.hit) { // incoming volley
      const k = Math.max(0, Math.min(1, 1 - (f.land - B.t) / 2.2));
      g.strokeStyle = 'rgba(255,120,40,.7)'; g.setLineDash([6, 6]); g.lineWidth = 2; g.beginPath(); g.arc(f.x, f.y, f.r, 0, 7); g.stroke(); g.setLineDash([]);
      for (let i = 0; i < 14; i++) { const a = i / 14 * 6.28, x = f.from.x + (f.x + Math.cos(a) * f.r * 0.7 - f.from.x) * k, y = f.from.y + (f.y + Math.sin(a) * f.r * 0.7 - f.from.y) * k - Math.sin(k * Math.PI) * 120; g.drawImage(images.ammo, 16, 0, 8, 8, x - 6, y - 6, 12, 12); }
    } else if (B.t < f.end) {
      g.fillStyle = `rgba(255,${90 + Math.random() * 60},30,${0.18 + Math.random() * 0.08})`; g.beginPath(); g.arc(f.x, f.y, f.r, 0, 7); g.fill();
      for (let i = 0; i < 10; i++) { const a = Math.random() * 6.28, rr = Math.random() * f.r * 0.8; g.drawImage(images.ammo, 16, 0, 8, 8, f.x + Math.cos(a) * rr - 8, f.y + Math.sin(a) * rr - 8, 16, 16); }
    }
  }
  // wildfires on the roads
  for (const h of B.hazards || []) if (B.t < h.end) {
    g.fillStyle = `rgba(255,${80 + Math.random() * 60},20,${0.16 + Math.random() * 0.06})`; g.beginPath(); g.arc(h.x, h.y, h.r, 0, 7); g.fill();
    for (let i = 0; i < 16; i++) { const a = Math.random() * 6.28, rr = Math.random() * h.r * 0.9; g.drawImage(images.ammo, 16, 0, 8, 8, h.x + Math.cos(a) * rr - 8, h.y + Math.sin(a) * rr - 8, 16, 16); }
  }
  // warnings: something is about to happen here
  for (const w of B.warns || []) { const p = 0.5 + 0.5 * Math.sin(B.t * 8); g.strokeStyle = `rgba(255,90,60,${0.5 + p * 0.5})`; g.lineWidth = 4 / cam.z; g.setLineDash([12, 8]); g.beginPath(); g.arc(w.x, w.y, 110 + p * 20, 0, 7); g.stroke(); g.setLineDash([]); g.font = `700 ${Math.round(30 / Math.max(0.6, cam.z))}px sans-serif`; g.textAlign = 'center'; g.fillStyle = '#ffb04a'; g.fillText('⚠', w.x, w.y + 10); }
  // a stratagem waiting for its target: show what it can be played on
  if (cardSel) {
    const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 160);
    if (cardSel.edges) for (const e of cardSel.edges) { const a = B.map.nodes[e.a], b = B.map.nodes[e.b]; g.lineCap = 'round'; g.strokeStyle = `rgba(255,215,106,${0.12 + pulse * 0.16})`; g.lineWidth = e.w; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.lineCap = 'butt';
      g.strokeStyle = `rgba(255,215,106,${pulse})`; g.lineWidth = 8 / cam.z; g.setLineDash([24, 14]); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.setLineDash([]); }
    const tk = CARDS[cardSel.id].target;
    if (tk === 'own' || tk === 'foe') for (const dv of B.divisions) { if (dv.garrison || dv.routed || B.aliveCount(dv) <= 0 || (tk === 'own') !== (dv.side === mySide)) continue; const c = dv.c || B.centroid(dv); g.strokeStyle = tk === 'own' ? `rgba(120,200,255,${pulse})` : `rgba(255,110,90,${pulse})`; g.lineWidth = 3 / cam.z; g.beginPath(); g.arc(c.x, c.y, dv.cols * dv.spacing * 0.8 + 10, 0, 7); g.stroke(); }
  }
  // bases: palisade ring in the owner's colour, the building, and how many still hold it
  for (const b of B.bases) {
    const col = B.sides[b.side].color; const alive = b.div && b.div.side === b.side ? B.aliveCount(b.div) : 0;
    g.strokeStyle = col; g.globalAlpha = 0.6; g.lineWidth = (b.kind === 'main' ? 5 : 3) / Math.max(0.6, cam.z); g.setLineDash(b.kind === 'main' ? [] : [10, 6]);
    g.beginPath(); g.arc(b.x, b.y, b.r, 0, 7); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
    const name = b.kind === 'main' ? 'cap_' + b.faction : b.kind === 'fort' ? 'town_' + b.faction : 'vil_trade'; const bb = BUILDINGS[name] || BUILDINGS.vil_trade;
    const h = b.kind === 'main' ? 88 : b.kind === 'fort' ? 56 : 40; const k = h / Math.max(bb[2], bb[3]);
    g.drawImage(images.buildings, bb[0], bb[1], bb[2], bb[3], b.x - bb[2] * k / 2, b.y - b.r - bb[3] * k + 18, bb[2] * k, bb[3] * k);
    g.font = `700 ${Math.round(11 / Math.max(0.7, cam.z) * 1.2)}px sans-serif`; g.textAlign = 'center';
    const label = `${b.kind === 'main' ? '◆ ' : ''}${alive.toLocaleString()}`; const tw = g.measureText(label).width;
    g.fillStyle = 'rgba(16,12,8,.8)'; g.fillRect(b.x - tw / 2 - 5, b.y - b.r - 2, tw + 10, 16); g.fillStyle = col; g.fillRect(b.x - tw / 2 - 5, b.y - b.r - 2, 3, 16);
    g.fillStyle = '#fff4dc'; g.fillText(label, b.x, b.y - b.r + 10);
  }
  // selection ring + orders
  for (const div of B.divisions) {
    if (B.aliveCount(div) <= 0) continue;
    const c = div.c || B.centroid(div);
    if (div === sel) { g.strokeStyle = '#ffd76a'; g.lineWidth = 2 / cam.z; g.beginPath(); g.ellipse(c.x, c.y, div.cols * div.spacing * 0.75, div.cols * div.spacing * 0.75, 0, 0, 7); g.stroke(); }
    if (div.side === mySide && !spectator && !div.routed && !div.garrison) {
      const ord = div.pending ? div.pending.order : div.state; const gy = c.y - div.cols * div.spacing * 0.5 - 18;
      g.font = `700 ${Math.round(14 / Math.max(0.6, cam.z) * 1)}px sans-serif`; g.textAlign = 'center';
      g.fillStyle = 'rgba(16,12,8,.8)'; g.beginPath(); g.arc(c.x, gy - 5, 11 / Math.max(0.6, cam.z), 0, 7); g.fill();
      g.strokeStyle = div.pending ? `rgba(255,215,106,${0.5 + 0.5 * Math.sin(B.t * 6)})` : '#ffd76a'; g.lineWidth = 1.5 / cam.z; g.stroke();
      g.fillStyle = div.pending ? '#ffd76a' : '#fff4dc'; g.fillText(glyphOf(ord), c.x, gy);
    }
    if (div.side === mySide && div.pending) { const m = div.pending; g.strokeStyle = 'rgba(255,215,106,.6)'; g.setLineDash([4, 5]); g.lineWidth = 1.5 / cam.z; g.beginPath(); g.moveTo(m.x, m.y); g.lineTo(div.officer.x, div.officer.y); g.stroke(); g.setLineDash([]); }
  }
  // soldiers sorted by y, with team color under their feet
  const hw = innerWidth / 2 / cam.z + 24, hh = innerHeight / 2 / cam.z + 24;
  const live = B.soldiers.filter(s => (s.alive || s.dying > 0) && !s.fled && Math.abs(s.x - cam.x) < hw && Math.abs(s.y - cam.y) < hh);
  live.sort((a, b) => a.y - b.y);
  for (const s of live) {
    g.fillStyle = s.div.routed ? '#999' : s.div.color; g.fillRect(Math.round(s.x - 4), Math.round(s.y + 1), 8, 2);
    drawUnit(g, s, 1, s.alive ? undefined : 4, s.alive ? undefined : Math.min(3, Math.floor(s.at)));
  }
  // officers with banners
  for (const div of B.divisions) {
    const o = div.officer; if (!o.alive || o.captured || B.aliveCount(div) <= 0) continue;
    if (div.eliteUnit == null) { let u = div.unit; for (let i = 0; i < 6 && UNITS[div.faction][u].up != null; i++) u = UNITS[div.faction][u].up; div.eliteUnit = u; }
    const fake = { x: o.x, y: o.y, div: { faction: div.faction, unit: div.eliteUnit }, flip: div.facing < 0, at: B.t * 4, anim: 0 };
    g.fillStyle = div.color; g.fillRect(o.x - 1, o.y - 34, 2, 22); g.fillRect(o.x + (div.facing < 0 ? -11 : 1), o.y - 34, 10, 7);
    drawUnit(g, fake, 1.3);
    if (cam.z > 0.7) { g.font = '600 8px sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(0,0,0,.6)'; g.fillText(o.name, o.x + 0.5, o.y + 9.5); g.fillStyle = '#fff'; g.fillText(o.name, o.x, o.y + 9); }
  }
  // messengers
  for (const m of B.messengers) { g.fillStyle = B.sides[m.side].color; g.beginPath(); g.arc(m.x, m.y, 4, 0, 7); g.fill(); g.fillStyle = '#fff'; g.fillRect(m.x - 1, m.y - 10, 2, 8); g.fillStyle = B.sides[m.side].color; g.fillRect(m.x + 1, m.y - 10, 5, 3); }
  // projectiles
  for (const p of B.projectiles) {
    if (p.ammo === 0) { const a = Math.atan2(p.y - (p.py ?? p.y), p.x - (p.px ?? p.x)); g.save(); g.translate(p.x, p.y); g.rotate(a); g.drawImage(images.ammo, 0, 0, 8, 8, -4, -4, 8, 8); g.restore(); }
    else g.drawImage(images.ammo, p.ammo * 8, 0, 8, 8, p.x - 4, p.y - 4, 8, 8);
  }
  // trees on top (cover)
  const tiles = images['g_' + B.terrain];
  if (!B.map) for (const t of B.trees) g.drawImage(tiles, t.alt && !['plains', 'forest'].includes(B.terrain) ? 112 : 96, 16, 16, 16, t.x - 12, t.y - 20, 24, 24);
  // HQ tents
  if (B.storm) { // rain and gloom, drawn over the field in screen space
    g.setTransform(d, 0, 0, d, 0, 0); g.fillStyle = 'rgba(20,28,40,.32)'; g.fillRect(0, 0, innerWidth, innerHeight);
    g.strokeStyle = 'rgba(190,210,235,.35)'; g.lineWidth = 1; g.beginPath(); const T = performance.now() / 4;
    for (let i = 0; i < 140; i++) { const x = (i * 97.13 + T * 0.9) % (innerWidth + 60) - 30, y = (i * 53.7 + T * 2.3) % (innerHeight + 40) - 20; g.moveTo(x, y); g.lineTo(x - 5, y + 14); }
    g.stroke(); return;
  }
  if (!B.bases.length) for (const s of B.sides) { g.fillStyle = s.color; g.fillRect(s.hq.x - 8, s.hq.y - 8, 16, 16); g.fillStyle = '#fff'; g.font = 'bold 10px sans-serif'; g.textAlign = 'center'; g.fillText('HQ', s.hq.x, s.hq.y + 4); }
}

function drawMini() {
  const W = mini.width, H = mini.height, sx = W / B.fw, sy = H / B.fh;
  mg.fillStyle = 'rgba(20,16,12,.85)'; mg.fillRect(0, 0, W, H);
  if (B.map) {
    if (!mini._paths || mini._rev !== B.map.rev) { const c = document.createElement('canvas'); c.width = W; c.height = H; const m = c.getContext('2d'); const R = B.map.raster; m.fillStyle = 'rgba(160,130,90,.55)'; for (let gy = 0; gy < R.gh; gy += 2) for (let gx = 0; gx < R.gw; gx += 2) if (R.walk[gy * R.gw + gx]) m.fillRect(gx * R.cell * sx, gy * R.cell * sy, 2 * R.cell * sx + 0.6, 2 * R.cell * sy + 0.6); mini._paths = c; mini._rev = B.map.rev; }
    mg.drawImage(mini._paths, 0, 0);
  }
  for (const s of B.soldiers) { if (!s.alive || s.fled || Math.random() < 0.5) continue; mg.fillStyle = s.div.routed ? '#888' : s.div.color; mg.fillRect(s.x * sx, s.y * sy, 1.5, 1.5); }
  for (const b of B.bases) { mg.strokeStyle = B.sides[b.side].color; mg.lineWidth = b.kind === 'main' ? 2 : 1; mg.beginPath(); mg.arc(b.x * sx, b.y * sy, Math.max(3, b.r * sx), 0, 7); mg.stroke(); }
  for (const f of B.fires) if (B.t < f.end) { mg.fillStyle = 'rgba(255,120,40,.6)'; mg.beginPath(); mg.arc(f.x * sx, f.y * sy, f.r * sx, 0, 7); mg.fill(); }
  for (const w of B.warns || []) { mg.fillStyle = '#ff5a3c'; mg.beginPath(); mg.arc(w.x * sx, w.y * sy, 4 + Math.sin(B.t * 8) * 1.5, 0, 7); mg.fill(); }
  for (const h of B.hazards || []) if (B.t < h.end) { mg.fillStyle = 'rgba(255,120,40,.6)'; mg.beginPath(); mg.arc(h.x * sx, h.y * sy, h.r * sx, 0, 7); mg.fill(); }
  const hw = innerWidth / 2 / cam.z, hh = innerHeight / 2 / cam.z;
  mg.strokeStyle = '#ffd76a'; mg.lineWidth = 1; mg.strokeRect((cam.x - hw) * sx, (cam.y - hh) * sy, hw * 2 * sx, hh * 2 * sy);
}

function fmt(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; }
let lastCards = 0;
function hud() {
  root.querySelector('#btime').textContent = fmt(B.t) + (B.bases.length ? ` · ◆ ${B.basesHeld(mySide)} v ${B.basesHeld(1 - mySide)}` : '');
  const fb = root.querySelector('[data-b=fire]'); if (fb) { fb.hidden = B.sides[mySide].canFire === false; fb.disabled = B.sides[mySide].fireUsed || !!B.sides[mySide].ai; fb.classList.toggle('on', targeting); fb.textContent = targeting ? 'Tap the map to aim…' : B.sides[mySide].fireUsed ? '🔥 Volley spent' : '🔥 Fire volley'; }
  if (B.cards) renderCards();
  while (seenEvents < B.events.length) { const e = B.events[seenEvents++]; if (e.t > 0.1) toast(e); }
  const tb = root.querySelector('#btoasts'); const now = performance.now();
  toasts = toasts.filter(t => now - t.at < 5000); tb.innerHTML = toasts.slice(-4).map(t => `<div class="btoast ${t.cls}">${esc(t.text)}</div>`).join('');
  if (now - lastCards > 250) { lastCards = now; renderDivCards(); }
  if (B.over && root.querySelector('#bresult').hidden) showResult();
}
function toast(e) {
  if (spectator) { toasts.push({ text: e.text, cls: e.kind === 'strat' ? 'strat' : '', at: performance.now() }); return; }
  const mine = e.side === mySide; let cls = '';
  if (e.kind === 'bad') cls = mine ? 'bad' : 'good'; else if (e.kind === 'good') cls = mine ? 'good' : 'bad'; else if (e.kind === 'strat') cls = 'strat'; else if (e.kind === 'warn') cls = 'warn';
  toasts.push({ text: e.text, cls, at: performance.now() });
}
let cardsKey = '';
function renderCards() {
  const side = B.sides[mySide]; const box = root.querySelector('#bcards'); if (!box) return;
  const key = side.hand.join() + '|' + side.cp + '|' + (cardSel ? cardSel.slot : '') + '|' + !!side.ai + '|' + !!B.storm;
  const pct = Math.round((side.cp >= CP_MAX ? 1 : side.cpT / CP_EVERY) * 100);
  if (key !== cardsKey) {
    cardsKey = key;
    box.innerHTML = `<span class="bcp" title="Command points"><b>${side.cp}</b><small>⚡</small><i><u style="width:${pct}%"></u></i></span>` + side.hand.map((id, i) => { const c = CARDS[id]; const off = side.cp < c.cost || !!side.ai || (id === 'fire' && B.storm); return `<button class="bcard ${cardSel && cardSel.slot === i ? 'on' : ''} ${off ? 'off' : ''}" data-b="card" data-i="${i}" aria-label="${esc(c.name)}"><span>${c.icon}</span><small>${c.cost}</small></button>`; }).join('');
  } else { const u = box.querySelector('.bcp u'); if (u) u.style.width = pct + '%'; }
  const tip = root.querySelector('#bcardtip');
  if (cardSel) { const c = CARDS[cardSel.id]; const need = { point: 'Tap the map to aim.', own: 'Tap one of your divisions.', foe: 'Tap an enemy division.' }[c.target] || (c.target.startsWith('edge') ? 'Tap a glowing road.' : ''); const html = `<b>${c.icon} ${esc(c.name)}</b> · ${c.cost} ⚡<div>${esc(c.text)}</div><div class="bctnext">${need}</div><button class="bbtn" data-b="cardcancel">Cancel</button>`; if (tip.dataset.k !== cardSel.slot + cardSel.id) { tip.innerHTML = html; tip.dataset.k = cardSel.slot + cardSel.id; } tip.hidden = false; }
  else if (!tip.hidden) { tip.hidden = true; tip.dataset.k = ''; }
}
function eligibleEdges(id) { const t = CARDS[id].target; if (!t.startsWith('edge') || !B.map) return null; const kinds = t.slice(5).split(','); return B.map.edges.filter(e => e.open && kinds.includes(e.kind) && canClose(B, e)); }
function tryCard(target) {
  const why = B.playCard(mySide, cardSel.slot, target);
  if (why) { toasts.push({ text: why, cls: 'bad', at: performance.now() }); return false; }
  cardSel = null; cardsKey = ''; return true;
}
function cardTap(w) {
  const tk = CARDS[cardSel.id].target;
  if (tk === 'point') return tryCard({ x: w.x, y: w.y });
  if (tk === 'own' || tk === 'foe') {
    let best = null, bd = (90 / cam.z + 40) ** 2;
    for (const dv of B.divisions) { if (dv.garrison || dv.routed || B.aliveCount(dv) <= 0 || (tk === 'own') !== (dv.side === mySide)) continue; const c = dv.c || B.centroid(dv); const r = dv.cols * dv.spacing * 0.8; const dd = Math.max(0, Math.hypot(c.x - w.x, c.y - w.y) - r) ** 2; if (dd < bd) { bd = dd; best = dv; } }
    if (!best) { toasts.push({ text: tk === 'own' ? 'Tap closer to one of your divisions.' : 'Tap closer to an enemy division.', cls: 'bad', at: performance.now() }); return; }
    return tryCard(best.id);
  }
  if (cardSel.edges) {
    let best = null, bd = 90 / cam.z + 60;
    for (const e of cardSel.edges) { const a = B.map.nodes[e.a], b = B.map.nodes[e.b]; const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((w.x - a.x) * dx + (w.y - a.y) * dy) / L)); const d = Math.hypot(w.x - a.x - dx * t, w.y - a.y - dy * t) - e.w / 2; if (d < bd) { bd = d; best = e; } }
    if (!best) { toasts.push({ text: 'Tap one of the glowing roads.', cls: 'bad', at: performance.now() }); return; }
    return tryCard(best.id);
  }
}
function renderDivCards() {
  const box = root.querySelector('#bdivs'); const keep = box.scrollLeft;
  const showSides = spectator ? [0, 1] : [mySide];
  box.classList.toggle('two', !!spectator);
  box.innerHTML = B.divisions.filter(d => showSides.includes(d.side) && !d.garrison).map(d => {
    const alive = B.aliveCount(d); const st = d.routed ? 'Routing!' : alive <= 0 ? 'Destroyed' : d.pending ? `Messenger: ${orderLabel(d.pending.order)} (${Math.max(0, d.pending.eta - B.t).toFixed(0)}s)` : orderLabel(d.state);
    if (spectator) return `<button class="bdiv mini ${d.routed ? 'rout' : ''}" data-b="sel" data-id="${d.id}" style="border-top:3px solid ${d.color}"><span class="bdname">${esc(d.reserve ? 'Reserve' : d.officer.name)}</span><span class="bdcount">${alive}</span><span class="bmor"><i style="width:${Math.max(0, Math.min(100, d.morale))}%;background:${d.morale < 30 ? '#e2553f' : d.morale < 55 ? '#e0b040' : '#6fbf73'}"></i></span></button>`;
    const portrait = `<span class="bport" style="background:url(assets/units/${d.faction}.png) 0 -${d.unit * 28}px / 560px auto no-repeat"></span>`;
    return `<button class="bdiv ${d === sel ? 'on' : ''} ${d.routed ? 'rout' : ''} ${d.reserve ? 'res' : ''}" data-b="sel" data-id="${d.id}">
      <span class="bdname">${portrait}${esc(d.reserve ? "Lord's reserve" : d.officer.name)}</span><span class="bdcount">${alive}</span>
      <span class="bmor"><i style="width:${Math.max(0, Math.min(100, d.morale))}%;background:${d.morale < 30 ? '#e2553f' : d.morale < 55 ? '#e0b040' : '#6fbf73'}"></i></span>
      <span class="bdst">${esc(d.reserve ? d.unitName : d.officer.alive ? (d.officer.captured ? d.unitName + ' · captured' : d.unitName) : d.unitName + ' · slain')} · ${d.pending ? '<b style="color:#ffd76a">' + glyphOf(d.pending.order) + '</b> ' : glyphOf(d.state) + ' '}${esc(st)}</span></button>`;
  }).join('');
  box.scrollLeft = keep;
}
function openOrders(div) {
  if (spectator || B.sides[mySide].ai) return;
  sel = div; const box = root.querySelector('#border');
  if (div.routed || B.aliveCount(div) <= 0) { box.hidden = true; return; }
  box.hidden = false;
  if (div.reserve) {
    const offs = B.divisions.filter(d => d.side === mySide && !d.garrison && !d.reserve && !d.routed && B.aliveCount(d) > 0);
    box.innerHTML = `<div class="bordtitle">Lord's reserve · ${B.aliveCount(div).toLocaleString()} ${esc(div.unitName)}<button class="bbtn" data-b="closeorders">✕</button></div>
      <div class="bordgrid">${['defend', 'push'].map(k => `<button class="bbtn ${div.pending && div.pending.order === k ? 'pend' : !div.pending && div.state === k ? 'on' : ''}" data-b="order" data-o="${k}">${GLYPH[k]} ${RESERVE_ORDERS[k]}</button>`).join('')}</div>
      <div class="sub" style="margin-top:6px">${GLYPH.follow} Reinforce an officer who is outnumbered:</div>
      <div class="bordgrid">${offs.map(o => `<button class="bbtn ${div.state === 'follow' && div.follow === o.id ? 'on' : ''}" data-b="order" data-o="follow:${o.id}">${esc(o.officer.name)} (${B.aliveCount(o)})</button>`).join('')}</div>`;
    return;
  }
  box.innerHTML = `<div class="bordtitle">${esc(div.unitName)} · ${esc(div.officer.name)}<button class="bbtn" data-b="closeorders">✕</button></div>
    <div class="bordgrid">${Object.entries(B.map ? MAP_ORDERS : ORDERS).map(([k, l]) => `<button class="bbtn ${div.pending && div.pending.order === k ? 'pend' : !div.pending && div.state === k ? 'on' : ''}" data-b="order" data-o="${k}">${GLYPH[k]} ${l}</button>`).join('')}${B.map ? `<button class="bbtn ${goingTo ? 'on' : ''}" data-b="goto">📍 ${goingTo ? 'Tap a base…' : 'Go to a base'}</button>` : ''}</div>
    ${div.pending ? `<div class="sub" style="margin-top:6px;color:#ffd76a">Messenger riding with "${ORDERS[div.pending.order]}": about ${Math.max(0, div.pending.eta - B.t).toFixed(0)}s away.</div>` : ''}
    <div class="sub" style="margin-top:6px">Leadership ${div.officer.stats.lea}: a messenger takes about ${(Math.hypot(div.officer.x - B.sides[mySide].hq.x, div.officer.y - B.sides[mySide].hq.y) / (150 * (0.8 + div.officer.stats.lea * 0.025))).toFixed(1)}s to reach them.</div>`;
}
function showResult() {
  const sum = B.summary(); const box = root.querySelector('#bresult'); box.hidden = false;
  const won = B.winner === mySide;
  box.innerHTML = `<h2>${spectator ? esc(B.sides[B.winner].name) + ' wins' : won ? 'Victory' : 'Defeat'}</h2><div class="sub">${esc(B.events[B.events.length - 1].text)} Battle lasted ${fmt(B.t)}.</div>
    ${B.bases.length ? `<div class="sub" style="margin-top:6px">Bases held at the end: ${esc(B.sides[0].name)} ${B.basesHeld(0)}, ${esc(B.sides[1].name)} ${B.basesHeld(1)}.${B.mainTaken ? ' The main camp was stormed.' : ''}</div>` : ''}
    ${sum.map(s => `<h3 style="color:${s.color}">${esc(s.name)}</h3>${s.divisions.filter(d => !d.garrison).map(d => `<div class="bres"><b>${esc(d.unit)}</b> under ${esc(d.officer)} <span class="sub">(${d.fate})</span><div class="sub">${d.left} of ${d.start} standing · ${d.dead} fallen${d.routed ? ' · routed' : ''}${d.rallied ? ' · rallied once' : ''}</div></div>`).join('')}`).join('')}
    ${spectator || command ? '<button class="btn" data-b="done">Continue the chronicle</button>' : '<button class="btn" data-b="again">Fight another battle</button><button class="btn ghost" data-b="exit">Back to the world</button>'}`;
}

function bindInput() {
  const pts = new Map(); let pinch = null, dragged = false, start = null;
  canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); dragged = false; start = { x: e.clientX, y: e.clientY };
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.z }; } });
  canvas.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId); if (!p) return;
    if (pts.size === 2 && pinch) { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); const [a, b] = [...pts.values()]; cam.z = Math.max(MID, Math.min(4, pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d)); dragged = true; return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y; if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) dragged = true;
    cam.x -= dx / cam.z; cam.y -= dy / cam.z; if (dragged) cam.follow = false; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  const up = e => {
    pts.delete(e.pointerId); if (pts.size < 2) pinch = null;
    if (!dragged && e.type === 'pointerup') tapAt(e.clientX, e.clientY);
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => { e.preventDefault(); cam.z = Math.max(MID, Math.min(4, cam.z * (e.deltaY < 0 ? 1.12 : 0.89))); }, { passive: false });
  mini.addEventListener('pointerdown', e => { const r = mini.getBoundingClientRect(); cam.x = (e.clientX - r.left) / r.width * B.fw; cam.y = (e.clientY - r.top) / r.height * B.fh; });
  root.addEventListener('click', e => {
    const t = e.target.closest('[data-b]'); if (!t) return;
    const b = t.dataset.b;
    if (b === 'exit') { if (spectator) { skipToEnd(); return; } if (command) { B.takeover(mySide); skipToEnd(); return; } return exitBattle(); }
    if (b === 'handover') { B.takeover(mySide); return; }
    if (b === 'skip') return skipToEnd();
    if (b === 'done') { const sp = spectator || command, bb = B; exitBattle(); spectator = null; command = null; sp.onDone(bb); return; }
    if (b === 'again') { exitBattle(); return startBattle(); }
    if (b === 'speed') { root.querySelectorAll('[data-b=speed]').forEach(x => x.classList.toggle('on', x === t)); if (t.dataset.v === 'pause') paused = true; else { paused = false; speed = +t.dataset.v; } }
    if (b === 'fire' && !B.sides[mySide].fireUsed) { targeting = !targeting; }
    if (b === 'card') { const i = +t.dataset.i, id = B.sides[mySide].hand[i]; cardsKey = ''; goingTo = false;
      if (cardSel && cardSel.slot === i) { cardSel = null; return; }
      const c = CARDS[id]; if (c.target === 'none') { cardSel = { slot: i, id }; const pre = cardBlock(B, mySide, id, null); if (pre) { toasts.push({ text: `${c.icon} ${c.name}: ${pre}`, cls: 'bad', at: performance.now() }); cardSel = null; return; } tryCard(null); return; }
      cardSel = { slot: i, id, edges: eligibleEdges(id) };
      if (cardSel.edges && !cardSel.edges.length) { toasts.push({ text: `${c.icon} ${c.name}: there is no ${c.target.slice(5).replace(',', ' or ')} it can close right now.`, cls: 'bad', at: performance.now() }); }
      if (cardSel.edges && cardSel.edges.length) cam.z = MID;
      return; }
    if (b === 'cardcancel') { cardSel = null; cardsKey = ''; return; }
    if (b === 'zoom') cam.z = cam.z > MID + 0.1 ? MID : 1.6;
    if (b === 'sel') { cam.follow = false; const d = B.divisions[+t.dataset.id]; openOrders(d); const c = d.c || B.centroid(d); cam.x = c.x; cam.y = c.y; }
    if (b === 'goto' && sel) { goingTo = !goingTo; targeting = false; openOrders(sel); return; }
    if (b === 'closeorders') { sel = null; root.querySelector('#border').hidden = true; }
    if (b === 'order' && sel) { const o = t.dataset.o; B.issue(sel, o); openOrders(sel); const label = orderLabel(o) + (o.startsWith('follow:') ? ': ' + B.divisions[+o.slice(7)].officer.name : ''); toasts.push({ text: `Messenger rides to ${sel.reserve ? 'your reserve' : sel.officer.name}: ${label}`, cls: 'strat', at: performance.now() }); }
  });
}
function tapAt(x, y) {
  const w = screenToWorld(x, y);
  if (targeting) { B.fireAttack(mySide, w.x, w.y); targeting = false; return; }
  if (cardSel) { cardTap(w); return; }
  if (goingTo && sel && B.map) { // send the officer down the roads to the base nearest the tap
    const base = B.bases.slice().sort((a, b) => Math.hypot(a.x - w.x, a.y - w.y) - Math.hypot(b.x - w.x, b.y - w.y))[0];
    const node = base && Math.hypot(base.x - w.x, base.y - w.y) < base.r + 120 ? nearestNode(B.map, base.x, base.y) : nearestNode(B.map, w.x, w.y);
    B.issue(sel, 'goto:' + node); goingTo = false; toasts.push({ text: `Messenger rides to ${sel.reserve ? 'your reserve' : sel.officer.name}: go to ${base && Math.hypot(base.x - w.x, base.y - w.y) < base.r + 120 ? base.name : 'that road'}`, cls: 'strat', at: performance.now() }); openOrders(sel); return;
  }
  let best = null, bd = (64 / cam.z) ** 2 + 900;
  for (const d of B.divisions) {
    if (d.side !== mySide || B.aliveCount(d) <= 0 || B.sides[mySide].ai) continue;
    const c = d.c || B.centroid(d); const span = d.cols * d.spacing * 0.75;
    const inBlock = (c.x - w.x) ** 2 + (c.y - w.y) ** 2 < span * span;
    if (inBlock) { const dd = ((c.x - w.x) ** 2 + (c.y - w.y) ** 2) * 0.25; if (dd < bd) { bd = dd; best = d; } }
    const o = d.officer; if (o.alive && !o.captured) { const dd = (o.x - w.x) ** 2 + (o.y - 20 - w.y) ** 2; if (dd < bd) { bd = dd; best = d; } }
    for (const s of d.soldiers) { if (!s.alive || s.fled) continue; const dd = (s.x - w.x) ** 2 + (s.y - w.y) ** 2; if (dd < bd) { bd = dd; best = d; } }
  }
  if (best) openOrders(best); else if (sel) { sel = null; root.querySelector('#border').hidden = true; }
}
function skipToEnd() { let n = 0; while (!B.over && n++ < 40000) B.step(1 / 30); }
function exitBattle() {
  cancelAnimationFrame(raf); window.removeEventListener('resize', root._fit); root.remove(); document.body.classList.remove('in-battle'); B = null;
}
