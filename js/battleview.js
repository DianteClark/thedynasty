// Battle screen: setup, live battlefield (pan, pinch-zoom, minimap), orders, stratagem, results.
import { Battle, FIELD, ORDERS, UNITS } from './battle.js';
import { CULTURES, cultureById } from './names.js';

const FACTIONS = Object.keys(UNITS);
const role = (f, u) => UNITS[f][u].role;
const TERRAINS = ['plains', 'forest', 'swamp', 'wasteland', 'tundra', 'mountain'];
const ROLE_LABEL = { inf: 'Infantry', heavy: 'Heavy', ranged: 'Ranged', magic: 'Casters', cav: 'Cavalry', flyer: 'Fliers' };
const SIZES = { skirmish: 0.45, battle: 1, war: 1.6 };
const GLYPH = { hold: '■', advance: '➜', charge: '⚔', flankL: '↰', flankR: '↱', retreat: '↩' };
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
    await Promise.all(TERRAINS.map(async t => { images['g_' + t] = await loadImg(`assets/ground/${t}.png`); }));
  })();
  return assetsReady;
}

// ---------- setup ----------
const setup = {
  you: 'aldmark', foe: 'undying', terrain: 'plains', size: 'battle', ai: 'balanced',
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
let B = null, cam = null, raf = 0, speed = 1, paused = false, root = null, spectator = null, acc = 0, mySide = 0, command = null, canvas, g, mini, mg, groundCanvas, corpseCanvas, sel = null, targeting = false, seenEvents = 0, lastT = 0, toasts = [];

function startBattle() {
  const scale = SIZES[setup.size];
  const youPicks = setup.picks[setup.you];
  const foePicks = defaultPicks(setup.foe);
  const counts = [350, 250, 160].map(n => Math.round(n * scale));
  const mkSide = (faction, picks, offs, name, color, ai) => ({ faction, name, color, ai, divisions: picks.map((u, i) => ({ unit: u, count: Math.max(30, Math.round(counts[i] * (role(faction, u) === 'cav' || role(faction, u) === 'heavy' ? 0.8 : 1) * (UNITS[faction][u].entry ? 1 : 0.75))), level: offs[i].level, officer: offs[i] })) });
  B = new Battle({ seed: Math.floor(Math.random() * 1e9), terrain: setup.terrain, sides: [
    mkSide(setup.you, youPicks, officersFor('you', setup.you), `Your army`, '#4fa3ff', null),
    mkSide(setup.foe, foePicks, officersFor('foe', setup.foe), `The ${cultureById(setup.foe).name} host`, '#ff5a4a', setup.ai),
  ] });
  for (const k of Object.keys(officers)) delete officers[k]; // fresh officers next time
  spectator = null; command = null; mySide = 0;
  buildScreen();
}

// Command your own side in a battle from the living world.
export async function commandBattle(cfg, info, side, onDone) {
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
    ${spectator ? '<button class="bbtn fire" data-b="skip">⏭ Skip to the end</button>' : `<div class="bfirebar"><button class="bbtn" data-b="fire">🔥 Fire volley</button>${command ? '<button class="bbtn" data-b="handover">🎖 Let your generals finish</button>' : ''}</div>`}
    <div class="bdivs" id="bdivs"></div>
    <div class="border" id="border" hidden></div>
    <div class="bresult" id="bresult" hidden></div>`;
  document.body.appendChild(root); document.body.classList.add('in-battle');
  canvas = root.querySelector('.bf'); g = canvas.getContext('2d');
  mini = root.querySelector('.bmini'); mg = mini.getContext('2d');
  buildGround();
  const fit = () => { const dpr = Math.min(2, window.devicePixelRatio || 1); canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px'; cam.dpr = dpr; };
  cam = spectator ? { x: FIELD.w / 2, y: FIELD.h / 2, z: Math.max(0.35, innerWidth / FIELD.w * 1.05), dpr: 1 } : { x: mySide === 0 ? 300 : FIELD.w - 300, y: FIELD.h / 2, z: 1.5, dpr: 1 };
  fit(); window.addEventListener('resize', fit); root._fit = fit;
  if (!spectator) { const own = B.divisions.filter(d => d.side === mySide); if (own.length) { cam.x = own.reduce((a, d) => a + d.cx, 0) / own.length + (mySide === 0 ? 120 : -120); cam.y = own.reduce((a, d) => a + d.cy, 0) / own.length; } }
  bindInput();
  seenEvents = 0; sel = null; targeting = false; speed = 1; paused = false; lastT = performance.now(); acc = 0; if (!spectator) toasts = [];
  renderDivCards();
  raf = requestAnimationFrame(frame);
}

function buildGround() {
  groundCanvas = document.createElement('canvas'); groundCanvas.width = FIELD.w; groundCanvas.height = FIELD.h;
  const gg = groundCanvas.getContext('2d'); const tiles = images['g_' + B.terrain];
  let seed = 12345; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let y = 0; y < FIELD.h; y += 16) for (let x = 0; x < FIELD.w; x += 16) { const k = r() < 0.75 ? 0 : r() < 0.5 ? 1 : 2; gg.drawImage(tiles, k * 16, 0, 16, 16, x, y, 16, 16); }
  for (let i = 0; i < 260; i++) { const k = Math.floor(r() * 5); gg.drawImage(tiles, 48 + k * 16, 0, 16, 16, Math.floor(r() * FIELD.w), Math.floor(r() * FIELD.h), 16, 16); }
  for (let i = 0; i < 120; i++) { const k = Math.floor(r() * 6); gg.drawImage(tiles, k * 16, 16, 16, 16, Math.floor(r() * FIELD.w), Math.floor(r() * FIELD.h), 16, 16); }
  corpseCanvas = document.createElement('canvas'); corpseCanvas.width = FIELD.w; corpseCanvas.height = FIELD.h;
}

function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  if (!paused && !B.over) { acc += dt * speed; let n = 0; while (acc >= 1 / 30 && n++ < 16) { B.step(1 / 30); acc -= 1 / 30; } if (n >= 16) acc = 0; }
  // bake finished deaths into the corpse layer
  if (B.corpses.length) { const cg = corpseCanvas.getContext('2d'); cg.globalAlpha = 0.85; for (const s of B.corpses) drawUnit(cg, s, 1, 4, 3); cg.globalAlpha = 1; B.corpses.length = 0; }
  draw(); drawMini(); hud();
  raf = requestAnimationFrame(frame);
}

function worldToScreen(x, y) { return { x: (x - cam.x) * cam.z + innerWidth / 2, y: (y - cam.y) * cam.z + innerHeight / 2 }; }
function screenToWorld(x, y) { return { x: (x - innerWidth / 2) / cam.z + cam.x, y: (y - innerHeight / 2) / cam.z + cam.y }; }
function clampCam() {
  const hw = innerWidth / 2 / cam.z, hh = innerHeight / 2 / cam.z;
  cam.x = Math.max(Math.min(hw, FIELD.w / 2), Math.min(FIELD.w - Math.min(hw, FIELD.w / 2), cam.x));
  cam.y = Math.max(Math.min(hh, FIELD.h / 2) - 60 / cam.z, Math.min(FIELD.h - Math.min(hh, FIELD.h / 2) + 160 / cam.z, cam.y));
}

function drawUnit(ctx, s, scale, animOverride, frameOverride) {
  const img = images[s.div.faction]; const sheet = s.flip ? img.l : img.r;
  const anim = animOverride ?? s.anim; const fr = frameOverride ?? (Math.floor(s.at) % 4);
  let col = anim * 4 + fr; if (s.flip) col = 19 - col;
  ctx.drawImage(sheet, col * 16, s.div.unit * 16, 16, 16, Math.round(s.x - 8 * scale), Math.round(s.y - 14 * scale), 16 * scale, 16 * scale);
}

function draw() {
  clampCam();
  const d = cam.dpr; g.setTransform(d, 0, 0, d, 0, 0); g.imageSmoothingEnabled = false;
  g.fillStyle = '#111'; g.fillRect(0, 0, innerWidth, innerHeight);
  g.setTransform(cam.z * d, 0, 0, cam.z * d, (innerWidth / 2 - cam.x * cam.z) * d, (innerHeight / 2 - cam.y * cam.z) * d);
  g.drawImage(groundCanvas, 0, 0); g.drawImage(corpseCanvas, 0, 0);
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
  // selection ring + orders
  for (const div of B.divisions) {
    if (B.aliveCount(div) <= 0) continue;
    const c = div.c || B.centroid(div);
    if (div === sel) { g.strokeStyle = '#ffd76a'; g.lineWidth = 2 / cam.z; g.beginPath(); g.ellipse(c.x, c.y, div.cols * div.spacing * 0.75, div.cols * div.spacing * 0.75, 0, 0, 7); g.stroke(); }
    if (div.side === mySide && !spectator && !div.routed) {
      const ord = div.pending ? div.pending.order : div.state; const gy = c.y - div.cols * div.spacing * 0.5 - 18;
      g.font = `700 ${Math.round(14 / Math.max(0.6, cam.z) * 1)}px sans-serif`; g.textAlign = 'center';
      g.fillStyle = 'rgba(16,12,8,.8)'; g.beginPath(); g.arc(c.x, gy - 5, 11 / Math.max(0.6, cam.z), 0, 7); g.fill();
      g.strokeStyle = div.pending ? `rgba(255,215,106,${0.5 + 0.5 * Math.sin(B.t * 6)})` : '#ffd76a'; g.lineWidth = 1.5 / cam.z; g.stroke();
      g.fillStyle = div.pending ? '#ffd76a' : '#fff4dc'; g.fillText(GLYPH[ord] || '•', c.x, gy);
    }
    if (div.side === mySide && div.pending) { const m = div.pending; g.strokeStyle = 'rgba(255,215,106,.6)'; g.setLineDash([4, 5]); g.lineWidth = 1.5 / cam.z; g.beginPath(); g.moveTo(m.x, m.y); g.lineTo(div.officer.x, div.officer.y); g.stroke(); g.setLineDash([]); }
  }
  // soldiers sorted by y, with team color under their feet
  const live = B.soldiers.filter(s => (s.alive || s.dying > 0) && !s.fled);
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
  for (const t of B.trees) g.drawImage(tiles, t.alt && !['plains', 'forest'].includes(B.terrain) ? 112 : 96, 16, 16, 16, t.x - 12, t.y - 20, 24, 24);
  // HQ tents
  for (const s of B.sides) { g.fillStyle = s.color; g.fillRect(s.hq.x - 8, s.hq.y - 8, 16, 16); g.fillStyle = '#fff'; g.font = 'bold 10px sans-serif'; g.textAlign = 'center'; g.fillText('HQ', s.hq.x, s.hq.y + 4); }
}

function drawMini() {
  const W = mini.width, H = mini.height, sx = W / FIELD.w, sy = H / FIELD.h;
  mg.fillStyle = 'rgba(20,16,12,.85)'; mg.fillRect(0, 0, W, H);
  for (const s of B.soldiers) { if (!s.alive || s.fled || Math.random() < 0.5) continue; mg.fillStyle = s.div.routed ? '#888' : s.div.color; mg.fillRect(s.x * sx, s.y * sy, 1.5, 1.5); }
  for (const f of B.fires) if (B.t < f.end) { mg.fillStyle = 'rgba(255,120,40,.6)'; mg.beginPath(); mg.arc(f.x * sx, f.y * sy, f.r * sx, 0, 7); mg.fill(); }
  const hw = innerWidth / 2 / cam.z, hh = innerHeight / 2 / cam.z;
  mg.strokeStyle = '#ffd76a'; mg.lineWidth = 1; mg.strokeRect((cam.x - hw) * sx, (cam.y - hh) * sy, hw * 2 * sx, hh * 2 * sy);
}

function fmt(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; }
let lastCards = 0;
function hud() {
  root.querySelector('#btime').textContent = fmt(B.t);
  const fb = root.querySelector('[data-b=fire]'); if (fb) { fb.hidden = B.sides[mySide].canFire === false; fb.disabled = B.sides[mySide].fireUsed || !!B.sides[mySide].ai; fb.classList.toggle('on', targeting); fb.textContent = targeting ? 'Tap the map to aim…' : B.sides[mySide].fireUsed ? '🔥 Volley spent' : '🔥 Fire volley'; }
  while (seenEvents < B.events.length) { const e = B.events[seenEvents++]; if (e.t > 0.1) toast(e); }
  const tb = root.querySelector('#btoasts'); const now = performance.now();
  toasts = toasts.filter(t => now - t.at < 5000); tb.innerHTML = toasts.slice(-4).map(t => `<div class="btoast ${t.cls}">${esc(t.text)}</div>`).join('');
  if (now - lastCards > 250) { lastCards = now; renderDivCards(); }
  if (B.over && root.querySelector('#bresult').hidden) showResult();
}
function toast(e) {
  if (spectator) { toasts.push({ text: e.text, cls: e.kind === 'strat' ? 'strat' : '', at: performance.now() }); return; }
  const mine = e.side === mySide; let cls = '';
  if (e.kind === 'bad') cls = mine ? 'bad' : 'good'; else if (e.kind === 'good') cls = mine ? 'good' : 'bad'; else if (e.kind === 'strat') cls = 'strat';
  toasts.push({ text: e.text, cls, at: performance.now() });
}
function renderDivCards() {
  const box = root.querySelector('#bdivs');
  const showSides = spectator ? [0, 1] : [mySide];
  box.classList.toggle('two', !!spectator);
  box.innerHTML = B.divisions.filter(d => showSides.includes(d.side)).map(d => {
    const alive = B.aliveCount(d); const st = d.routed ? 'Routing!' : alive <= 0 ? 'Destroyed' : d.pending ? `Messenger: ${ORDERS[d.pending.order]} (${Math.max(0, d.pending.eta - B.t).toFixed(0)}s)` : ORDERS[d.state] || d.state;
    if (spectator) return `<button class="bdiv mini ${d.routed ? 'rout' : ''}" data-b="sel" data-id="${d.id}" style="border-top:3px solid ${d.color}"><span class="bdname">${esc(d.unitName)}</span><span class="bdcount">${alive}</span><span class="bmor"><i style="width:${Math.max(0, Math.min(100, d.morale))}%;background:${d.morale < 30 ? '#e2553f' : d.morale < 55 ? '#e0b040' : '#6fbf73'}"></i></span></button>`;
    return `<button class="bdiv ${d === sel ? 'on' : ''} ${d.routed ? 'rout' : ''}" data-b="sel" data-id="${d.id}">
      <span class="bdname">${esc(d.unitName)}</span><span class="bdcount">${alive}</span>
      <span class="bmor"><i style="width:${Math.max(0, Math.min(100, d.morale))}%;background:${d.morale < 30 ? '#e2553f' : d.morale < 55 ? '#e0b040' : '#6fbf73'}"></i></span>
      <span class="bdst">${esc(d.officer.alive ? (d.officer.captured ? d.officer.name + ' (captured)' : d.officer.name) : d.officer.name + ' (slain)')} · ${d.pending ? '<b style="color:#ffd76a">' + GLYPH[d.pending.order] + '</b> ' : GLYPH[d.state] ? GLYPH[d.state] + ' ' : ''}${esc(st)}</span></button>`;
  }).join('');
}
function openOrders(div) {
  if (spectator || B.sides[mySide].ai) return;
  sel = div; const box = root.querySelector('#border');
  if (div.routed || B.aliveCount(div) <= 0) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<div class="bordtitle">${esc(div.unitName)} · ${esc(div.officer.name)}<button class="bbtn" data-b="closeorders">✕</button></div>
    <div class="bordgrid">${Object.entries(ORDERS).map(([k, l]) => `<button class="bbtn ${div.pending && div.pending.order === k ? 'pend' : !div.pending && div.state === k ? 'on' : ''}" data-b="order" data-o="${k}">${GLYPH[k]} ${l}</button>`).join('')}</div>
    ${div.pending ? `<div class="sub" style="margin-top:6px;color:#ffd76a">Messenger riding with "${ORDERS[div.pending.order]}": about ${Math.max(0, div.pending.eta - B.t).toFixed(0)}s away.</div>` : ''}
    <div class="sub" style="margin-top:6px">Leadership ${div.officer.stats.lea}: a messenger takes about ${(Math.hypot(div.officer.x - B.sides[mySide].hq.x, div.officer.y - B.sides[mySide].hq.y) / (150 * (0.8 + div.officer.stats.lea * 0.025))).toFixed(1)}s to reach them.</div>`;
}
function showResult() {
  const sum = B.summary(); const box = root.querySelector('#bresult'); box.hidden = false;
  const won = B.winner === mySide;
  box.innerHTML = `<h2>${spectator ? esc(B.sides[B.winner].name) + ' wins' : won ? 'Victory' : 'Defeat'}</h2><div class="sub">${esc(B.events[B.events.length - 1].text)} Battle lasted ${fmt(B.t)}.</div>
    ${sum.map(s => `<h3 style="color:${s.color}">${esc(s.name)}</h3>${s.divisions.map(d => `<div class="bres"><b>${esc(d.unit)}</b> under ${esc(d.officer)} <span class="sub">(${d.fate})</span><div class="sub">${d.left} of ${d.start} standing · ${d.dead} fallen${d.routed ? ' · routed' : ''}${d.rallied ? ' · rallied once' : ''}</div></div>`).join('')}`).join('')}
    ${spectator || command ? '<button class="btn" data-b="done">Continue the chronicle</button>' : '<button class="btn" data-b="again">Fight another battle</button><button class="btn ghost" data-b="exit">Back to the world</button>'}`;
}

function bindInput() {
  const pts = new Map(); let pinch = null, dragged = false, start = null;
  canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); dragged = false; start = { x: e.clientX, y: e.clientY };
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.z }; } });
  canvas.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId); if (!p) return;
    if (pts.size === 2 && pinch) { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); const [a, b] = [...pts.values()]; cam.z = Math.max(0.35, Math.min(4, pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d)); dragged = true; return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y; if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) dragged = true;
    cam.x -= dx / cam.z; cam.y -= dy / cam.z; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  const up = e => {
    pts.delete(e.pointerId); if (pts.size < 2) pinch = null;
    if (!dragged && e.type === 'pointerup') tapAt(e.clientX, e.clientY);
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => { e.preventDefault(); cam.z = Math.max(0.35, Math.min(4, cam.z * (e.deltaY < 0 ? 1.12 : 0.89))); }, { passive: false });
  mini.addEventListener('pointerdown', e => { const r = mini.getBoundingClientRect(); cam.x = (e.clientX - r.left) / r.width * FIELD.w; cam.y = (e.clientY - r.top) / r.height * FIELD.h; });
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
    if (b === 'zoom') { const far = Math.max(0.35, innerWidth / FIELD.w * 1.05); if (cam.z > far + 0.1) { cam.z = far; cam.x = FIELD.w / 2; cam.y = FIELD.h / 2; } else cam.z = 1.5; }
    if (b === 'sel') { const d = B.divisions[+t.dataset.id]; openOrders(d); const c = d.c || B.centroid(d); cam.x = c.x; cam.y = c.y; }
    if (b === 'closeorders') { sel = null; root.querySelector('#border').hidden = true; }
    if (b === 'order' && sel) { B.issue(sel, t.dataset.o); openOrders(sel); toasts.push({ text: `Messenger rides to ${sel.officer.name}: ${ORDERS[t.dataset.o]}`, cls: 'strat', at: performance.now() }); }
  });
}
function tapAt(x, y) {
  const w = screenToWorld(x, y);
  if (targeting) { B.fireAttack(mySide, w.x, w.y); targeting = false; return; }
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
