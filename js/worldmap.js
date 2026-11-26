// The overworld: a living map drawn with HAS tiles. Pan, pinch-zoom, tap anything.
import { BUILDINGS, MONSTER_ROWS, BIOMES } from '../assets/world/world.js';
import { UNITS } from './battle.js';
import { cultureById } from './names.js';
import { MON } from './sim.js';

const T = 16; // pixels per world cell
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const img = {}; let ready = null;
function load(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
function loadArt() {
  if (ready) return ready;
  ready = Promise.all([
    load('assets/world/terrain.png').then(i => img.terrain = i),
    load('assets/world/buildings.png').then(i => img.buildings = i),
    load('assets/world/monsters.png').then(i => img.monsters = i),
    load('assets/world/ship.png').then(i => img.ship = i),
    ...Object.keys(UNITS).map(f => load(`assets/units/${f}.png`).then(i => img['u_' + f] = i)),
  ]);
  return ready;
}

let W = null, root = null, canvas, g, mini, mg, terrainKey = '', ownerKey = '';
const CH = 32; // cells per map chunk (512px): only the chunks on screen are ever drawn
const tChunks = new Map(), oChunks = new Map(), fChunks = new Map(); let fogKey = '';
const BCOL = { water: [34, 66, 104], plains: [112, 168, 76], forest: [44, 112, 54], swamp: [78, 104, 86], wasteland: [196, 168, 104], tundra: [226, 232, 238], mountain: [118, 100, 90] };
let cam = { x: 0, y: 0, z: 1, follow: true }, raf = 0, sel = null, cb = {}, dpr = 1;
// movers glide between where they were at the start of the month and where they are now
function at(key, o) {
  const p = W._prev && W._prev.get(key); const f = W._frac || 0;
  if (!p) return { x: o.x, y: o.y };
  // follow the road actually taken this month (around coasts, through ports), not a straight line
  const tr = o.trail; if (tr && tr.length > 2 && Math.abs(tr[0].x - p[0]) < 0.01 && Math.abs(tr[0].y - p[1]) < 0.01) {
    let total = 0; for (let i = 1; i < tr.length; i++) total += Math.hypot(tr[i].x - tr[i - 1].x, tr[i].y - tr[i - 1].y);
    let want = total * f; for (let i = 1; i < tr.length; i++) { const seg = Math.hypot(tr[i].x - tr[i - 1].x, tr[i].y - tr[i - 1].y); if (want <= seg || i === tr.length - 1) { const k = seg ? Math.min(1, want / seg) : 1; return { x: tr[i - 1].x + (tr[i].x - tr[i - 1].x) * k, y: tr[i - 1].y + (tr[i].y - tr[i - 1].y) * k }; } want -= seg; }
  }
  return { x: p[0] + (o.x - p[0]) * f, y: p[1] + (o.y - p[1]) * f };
}

export async function mountMap(container, world, callbacks) {
  W = world; cb = callbacks;
  container.innerHTML = '<div class="empty">Unrolling the map…</div>';
  await loadArt();
  root = document.createElement('div'); root.className = 'wmap';
  root.innerHTML = `<canvas class="wm"></canvas><canvas class="wmini" width="168" height="112"></canvas>
    <button class="bbtn wzoom" data-w="fit" aria-label="Zoom out">⤢</button><button class="bbtn wfollow" data-w="follow" aria-label="Back to you" hidden>⌖ You</button><div class="wcard" id="wcard" hidden></div>`;
  container.innerHTML = ''; container.appendChild(root);
  document.body.classList.add('map-mode');
  canvas = root.querySelector('.wm'); g = canvas.getContext('2d'); mini = root.querySelector('.wmini'); mg = mini.getContext('2d');
  fit(); window.addEventListener('resize', fit);
  if (!cam.init || cam.world !== W) { const P = W.player && W.player.alive ? W.player : biggestCapital(); cam = { x: P ? P.x * T : W.w * T / 2, y: P ? P.y * T : W.h * T / 2, z: 1.8, init: true, world: W, follow: true }; }
  bind();
  cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
}
export function unmountMap() { cancelAnimationFrame(raf); window.removeEventListener('resize', fit); document.body.classList.remove('map-mode'); root = null; }
export function setWorld(world) { W = world; if (cam.world !== world) cam.init = false; }

function biggestCapital() { const r = W.realmList().sort((a, b) => W.realmSetts(b).length - W.realmSetts(a).length)[0]; return r && W.sett(r.capital); }
function fit() {
  if (!root) return;
  const top = document.querySelector('header.top').getBoundingClientRect().bottom;
  const bottom = document.querySelector('#tabs').getBoundingClientRect().height;
  root.style.top = top + 'px'; root.style.bottom = bottom + 'px';
  dpr = Math.min(2, window.devicePixelRatio || 1);
  const r = root.getBoundingClientRect();
  canvas.width = r.width * dpr; canvas.height = r.height * dpr; canvas.style.width = r.width + 'px'; canvas.style.height = r.height + 'px';
  root._w = r.width; root._h = r.height;
}

// ---------- layers ----------
function hash(x, y, k = 0) { let h = (x * 374761393 + y * 668265263 + k * 1442695041) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function invalidate() {
  const key = W.seed + W.size + ':' + (W.terrainRev || 0);
  if (terrainKey !== key) { terrainKey = key; tChunks.clear(); mini && (mini._bg = null); W._nearSett = null; }
  const live = W.setts.filter(s => !s.destroyed && s.realmId && W.realm(s.realmId)?.alive);
  const ok = live.map(s => s.id + ':' + s.realmId).join(',');
  if (ok !== ownerKey) { ownerKey = ok; oChunks.clear(); mini && (mini._bg = null); }
  const fk = (W.known ? 'k' : 'n') + (W.knownRev || 0);
  if (fk !== fogKey) { fogKey = fk; fChunks.clear(); mini && (mini._bg = null); }
}
// the cartographer's map: land you've never seen is blank parchment, with a soft edge
const kn = (x, y) => !W.known || (x >= 0 && y >= 0 && x < W.w && y < W.h && W.known[y * W.w + x] === 1);
function fogChunk(cx, cy) {
  return lru(fChunks, cx + ',' + cy, () => {
    const x0 = cx * CH, y0 = cy * CH, x1 = Math.min(W.w, x0 + CH), y1 = Math.min(W.h, y0 + CH);
    const c = document.createElement('canvas'); c.width = CH * T; c.height = CH * T; const f = c.getContext('2d');
    f.translate(-x0 * T, -y0 * T);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (!kn(x, y)) { f.fillStyle = (x + y) % 2 ? '#211a12' : '#1f1811'; f.fillRect(x * T, y * T, T, T); continue; }
      let edge = 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!kn(x + dx, y + dy)) edge++;
      if (edge) { f.fillStyle = `rgba(31,24,17,${0.25 + 0.12 * edge})`; f.fillRect(x * T, y * T, T, T); }
    }
    return c;
  });
}
function lru(map, key, make) {
  let c = map.get(key); if (c) { map.delete(key); map.set(key, c); return c; }
  c = make(); map.set(key, c); if (map.size > 28) map.delete(map.keys().next().value); return c;
}
function nearSett() {
  if (W._nearSett) return W._nearSett;
  const set = new Set(); for (const s of W.setts) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) set.add((s.y + dy) * W.w + s.x + dx);
  return (W._nearSett = set);
}
function terrainChunk(cx, cy) {
  return lru(tChunks, cx + ',' + cy, () => {
    const x0 = cx * CH, y0 = cy * CH, x1 = Math.min(W.w, x0 + CH), y1 = Math.min(W.h, y0 + CH);
    const c = document.createElement('canvas'); c.width = CH * T; c.height = CH * T; const t = c.getContext('2d'); t.imageSmoothingEnabled = false;
    t.translate(-x0 * T, -y0 * T);
    const bi = b => Math.max(0, BIOMES.indexOf(b));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const b = W.grid[y][x];
      if (b === 'water') { t.drawImage(img.terrain, 288, 0, 16, 16, x * T, y * T, T, T); continue; }
      const v = hash(x, y) < 0.7 ? 0 : hash(x, y, 1) < 0.5 ? 1 : 2;
      t.drawImage(img.terrain, bi(b) * 48 + v * 16, 0, 16, 16, x * T, y * T, T, T);
    }
    t.fillStyle = 'rgba(0,0,0,.18)';
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (W.grid[y][x] === 'water' && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => W.grid[y + dy]?.[x + dx] && W.grid[y + dy][x + dx] !== 'water')) t.fillRect(x * T, y * T, T, T);
    // trees and peaks may hang over the chunk edge, so neighbours' objects are drawn too (clipped by the canvas)
    const objs = []; const near = nearSett();
    for (let y = Math.max(0, y0 - 2); y < Math.min(W.h, y1 + 3); y++) for (let x = Math.max(0, x0 - 2); x < Math.min(W.w, x1 + 2); x++) {
      const b = W.grid[y][x]; if (b === 'water' || near.has(y * W.w + x)) continue;
      if (b === 'mountain') objs.push({ y: y * T + 14, draw: () => t.drawImage(img.terrain, bi(b) * 32, 40, 32, 32, x * T - 8 + hash(x, y, 2) * 4, y * T - 14, 32, 32) });
      const density = b === 'forest' ? 2 : b === 'swamp' ? 0.6 : b === 'tundra' ? 0.45 : b === 'plains' ? 0.12 : b === 'wasteland' ? 0.1 : 0;
      for (let k = 0; k < 2; k++) if (hash(x, y, 3 + k) < density / 2) {
        const ox = hash(x, y, 5 + k) * 10 - 5, oy = hash(x, y, 7 + k) * 8 - 4, v = hash(x, y, 9 + k) < 0.5 ? 0 : 1;
        objs.push({ y: y * T + oy + 12, draw: () => t.drawImage(img.terrain, bi(b) * 48 + v * 24, 16, 24, 24, x * T - 4 + ox, y * T - 10 + oy, 24, 24) });
      }
    }
    objs.sort((a, b) => a.y - b.y).forEach(o => o.draw());
    return c;
  });
}
function landSeen(L) {
  if (!W.known) return true;
  if (W._landSeenRev !== W.knownRev) { W._landSeenRev = W.knownRev; W._landSeen = new Set(); for (let i = 0; i < W.known.length; i++) if (W.known[i] && W.landId[i]) W._landSeen.add(W.landId[i]); }
  return W._landSeen.has(L.id);
}
function ownerAt(x, y) {
  if (x < 0 || y < 0 || x >= W.w || y >= W.h) return null;
  const sid = W.terr[y * W.w + x]; if (!sid) return null;
  const s = W.sett(sid); if (!s || s.destroyed) return null;
  const r = W.realm(s.realmId); return r && r.alive ? r.id : null;
}
function ownerChunk(cx, cy) {
  return lru(oChunks, cx + ',' + cy, () => {
    const x0 = cx * CH, y0 = cy * CH, x1 = Math.min(W.w, x0 + CH), y1 = Math.min(W.h, y0 + CH);
    const c = document.createElement('canvas'); c.width = CH * T; c.height = CH * T; const o = c.getContext('2d');
    o.translate(-x0 * T, -y0 * T);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const id = ownerAt(x, y); if (!id) continue; const col = W.realm(id).color;
      o.globalAlpha = 0.2; o.fillStyle = col; o.fillRect(x * T, y * T, T, T); o.globalAlpha = 0.95;
      if (ownerAt(x + 1, y) !== id) o.fillRect(x * T + T - 2, y * T, 2, T);
      if (ownerAt(x - 1, y) !== id) o.fillRect(x * T, y * T, 2, T);
      if (ownerAt(x, y + 1) !== id) o.fillRect(x * T, y * T + T - 2, T, 2);
      if (ownerAt(x, y - 1) !== id) o.fillRect(x * T, y * T, T, 2);
    }
    return c;
  });
}

// ---------- sprites ----------
function settSprite(s) {
  if (s.destroyed) return 'ruins';
  const r = W.realm(s.realmId); const cul = s.culture;
  if (r && r.capital === s.id && r.tier === 'Kingdom') return 'cap_' + cul;
  if (r && r.capital === s.id && r.tier === 'Lordship') return 'town_' + cul;
  if (s.pop > 1100) return 'town_' + cul;
  const special = { dwarf: ['vil_dwarf'], woodelf: ['vil_woodelf'], orc: ['vil_orc', 'vil_orc2'], lizard: ['vil_lizard', 'vil_lizard2'], undying: ['graveyard', 'vil_seer'] }[cul];
  const list = special || (s.biome === 'swamp' ? ['vil_water'] : s.biome === 'forest' ? ['vil_saw', 'vil_seer'] : ['vil_mill', 'vil_trade', 'vil_water']);
  return list[s.id % list.length];
}
function drawBuilding(name, cx, by, h) {
  const b = BUILDINGS[name]; if (!b) return;
  const k = h / Math.max(b[2], b[3]); const w = b[2] * k, hh = b[3] * k;
  g.drawImage(img.buildings, b[0], b[1], b[2], b[3], cx - w / 2, by - hh, w, hh);
}
function drawUnitSprite(f, u, x, y, flip, t, scale = 1) {
  const im = img['u_' + f]; if (!im) return;
  const fr = Math.floor(t * 5) % 4 + 4; // walk cycle
  g.save(); g.translate(x, y); if (flip) g.scale(-1, 1);
  g.drawImage(im, fr * 16, u * 16, 16, 16, -8 * scale, -15 * scale, 16 * scale, 16 * scale); g.restore();
}

// sailing ship: side-on for east/west, bow-on for north/south
function drawShip(x, y, dx, dy, t, scale = 1) {
  if (!img.ship) return;
  const col = Math.abs(dy) > Math.abs(dx) * 1.6 ? 0 : 1; const fr = Math.floor(t * 2) % 2;
  g.save(); g.translate(x, y); if (dx < 0) g.scale(-1, 1);
  g.drawImage(img.ship, col * 16, fr * 16, 16, 16, -8 * scale, -14 * scale, 16 * scale, 16 * scale); g.restore();
}
function pathLine(x, y, path, dest) {
  g.beginPath(); g.moveTo(x, y);
  for (const p of path || []) g.lineTo(p.x * T + 8, p.y * T + 8);
  if (!path || !path.length) g.lineTo(dest.x * T + 8, dest.y * T + 8);
  g.stroke();
}

// ---------- frame ----------
function frame(now) {
  if (!root) return;
  draw(now / 1000); drawMini();
  raf = requestAnimationFrame(frame);
}
function clamp() {
  const vw = root._w / cam.z, vh = root._h / cam.z, MW = W.w * T, MH = W.h * T;
  cam.x = vw >= MW ? MW / 2 : Math.max(vw / 2, Math.min(MW - vw / 2, cam.x));
  cam.y = vh >= MH ? MH / 2 : Math.max(vh / 2, Math.min(MH - vh / 2, cam.y));
}
function draw(t) {
  invalidate();
  const P0 = W.player;
  if (cam.follow && P0 && P0.alive && P0.x != null) { const p = at('p' + P0.id, P0); cam.x += (p.x * T + 8 - cam.x) * 0.12; cam.y += (p.y * T + 8 - cam.y) * 0.12; }
  const fb = root.querySelector('[data-w=follow]'); if (fb) fb.hidden = cam.follow || !(P0 && P0.alive);
  clamp();
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.imageSmoothingEnabled = false;
  g.fillStyle = '#0d1820'; g.fillRect(0, 0, root._w, root._h);
  g.setTransform(cam.z * dpr, 0, 0, cam.z * dpr, (root._w / 2 - cam.x * cam.z) * dpr, (root._h / 2 - cam.y * cam.z) * dpr);
  const vw = root._w / cam.z, vh = root._h / cam.z, vx0 = cam.x - vw / 2, vy0 = cam.y - vh / 2;
  const cs = CH * T;
  for (let cy = Math.max(0, Math.floor(vy0 / cs)); cy <= Math.min(Math.ceil(W.h / CH) - 1, Math.floor((vy0 + vh) / cs)); cy++)
    for (let cx = Math.max(0, Math.floor(vx0 / cs)); cx <= Math.min(Math.ceil(W.w / CH) - 1, Math.floor((vx0 + vw) / cs)); cx++) {
      g.drawImage(terrainChunk(cx, cy), cx * cs, cy * cs); g.drawImage(ownerChunk(cx, cy), cx * cs, cy * cs);
    }
  const fogChunks = [];
  if (W.known) for (let cy = Math.max(0, Math.floor(vy0 / cs)); cy <= Math.min(Math.ceil(W.h / CH) - 1, Math.floor((vy0 + vh) / cs)); cy++)
    for (let cx = Math.max(0, Math.floor(vx0 / cs)); cx <= Math.min(Math.ceil(W.w / CH) - 1, Math.floor((vx0 + vw) / cs)); cx++) fogChunks.push([cx, cy]);
  const vis = (x, y, m = 3) => x * T > vx0 - m * T && x * T < vx0 + vw + m * T && y * T > vy0 - m * T && y * T < vy0 + vh + m * T && kn(Math.round(x), Math.round(y));
  const now = W.year * 12 + W.month;
  // harbours: a dock on the water, and a lighthouse at the bigger ports
  for (const s of W.setts) {
    if (!s.port || !s.dock || !vis(s.dock.x, s.dock.y)) continue;
    const b = BUILDINGS['dock' + (s.id % 4)]; if (b) g.drawImage(img.buildings, b[0], b[1], b[2], b[3], s.dock.x * T - 8, s.dock.y * T - 8, 32, 32);
    const r = W.realm(s.realmId);
    if (!s.destroyed && r && r.capital === s.id && r.tier !== 'Village') { const L = BUILDINGS.lighthouse; g.drawImage(img.buildings, L[0], L[1], L[2], L[3], s.dock.x * T + 10, s.dock.y * T - 22, 16, 32); }
  }
  // monster lairs
  for (const L of W.lairs) {
    if (!L.alive || !vis(L.x, L.y)) continue;
    if (L.cave) { const C = BUILDINGS.cave; g.drawImage(img.buildings, C[0], C[1], C[2], C[3], L.x * T - 4, L.y * T - 12, 24, 24); }
    if (L.strength < 15) continue;
    const row = MONSTER_ROWS.indexOf(L.key); if (row < 0) continue;
    const s = L.key === 'dragon' ? 1.6 : 1 + Math.min(0.5, L.strength / 120);
    if (L.strength > 50) { g.fillStyle = `rgba(255,60,40,${0.18 + 0.12 * Math.sin(t * 4)})`; g.beginPath(); g.arc(L.x * T + 8, L.y * T + 6, 13 * s, 0, 7); g.fill(); }
    g.drawImage(img.monsters, (Math.floor(t * 4 + L.id) % 4) * 24, row * 24, 24, 24, L.x * T + 8 - 12 * s, L.y * T + 12 - 24 * s, 24 * s, 24 * s);
  }
  // settlements, drawn top to bottom
  const setts = [...W.setts].sort((a, b) => a.y - b.y);
  for (const s of setts) {
    if (!vis(s.x, s.y)) continue;
    const name = settSprite(s); const r = W.realm(s.realmId);
    const h = name.startsWith('cap_') ? 44 : name.startsWith('town_') ? 32 : name === 'ruins' ? 20 : 22;
    drawBuilding(name, s.x * T + 8, s.y * T + 14, h);
    if (s.famine && !s.destroyed) { g.fillStyle = '#ffcf70'; g.font = '9px sans-serif'; g.textAlign = 'center'; g.fillText('🌾', s.x * T + 16, s.y * T - 10); }
    if (s.id === sel?.id && sel.kind === 'sett') { g.strokeStyle = '#ffd76a'; g.lineWidth = 2 / cam.z; g.strokeRect(s.x * T - 12, s.y * T - 20, 40, 38); }
  }
  // recent battles
  g.textAlign = 'center'; g.font = '14px sans-serif';
  for (const b of W.battleSites || []) if (now - b.at < 4) { g.globalAlpha = 1 - (now - b.at) / 5; g.fillText('⚔️', b.x * T + 8, b.y * T - 18); g.globalAlpha = 1; }
  // marching hosts
  for (const w of W.wars) {
    const m = w.march; if (!m) continue;
    const att = W.realm(m.att), tgt = W.sett(m.target); if (!att || !tgt) continue;
    const offs = m.officers.map(id => W.char(id)).filter(o => o && o.alive && o.army);
    const mp = at('w' + w.id, m); if (!vis(mp.x, mp.y, 6)) continue; const mx = mp.x * T + 8, my = mp.y * T + 10;
    g.strokeStyle = att.color; g.lineWidth = 1.5 / cam.z; g.setLineDash([4, 4]); pathLine(mx, my, m.path, tgt); g.setLineDash([]);
    const nxt = m.path && m.path[0] || tgt; const flip = nxt.x < m.x;
    if (m.atSea) { drawShip(mx, my, nxt.x - m.x, nxt.y - m.y, t, 1.6); drawShip(mx - 12, my + 6, nxt.x - m.x, nxt.y - m.y, t + 0.5, 1.2); }
    else {
      // each officer rides with a couple of their soldiers
      offs.slice(0, 3).forEach((o, i) => {
        const ox = mx + (i - 1) * 22 * (flip ? -1 : 1) * 0.8, oy = my + (i % 2) * 7;
        g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.ellipse(ox, oy + 1, 13, 4, 0, 0, 7); g.fill();
        drawUnitSprite(o.army.faction, o.army.unit, ox + (flip ? 7 : -7), oy - 4, flip, t + i * 0.3 + 0.2, 0.95);
        drawUnitSprite(o.army.faction, o.army.unit, ox + (flip ? 8 : -8), oy + 3, flip, t + i * 0.3 + 0.5, 0.95);
        const lead = W.pickUnitView(o, o.army.faction);
        drawUnitSprite(o.army.faction, lead, ox, oy, flip, t + i * 0.3, 1.3);
      });
    }
    g.fillStyle = att.color; g.fillRect(mx - 1, my - 34, 2, 16); g.fillRect(mx + (flip ? -11 : 1), my - 34, 10, 7);
    if (sel?.kind === 'march' && sel.war === w) { g.strokeStyle = '#ffd76a'; g.lineWidth = 2 / cam.z; g.beginPath(); g.arc(mx, my - 6, 18, 0, 7); g.stroke(); }
  }
  // agents on the road
  const pr = W.playerRealm && W.playerRealm();
  for (const a of W.agents || []) {
    const mine = pr && a.owner === pr.id;
    if (W.hiddenKind(a) && !a.revealed && !mine) continue;
    const ap = at('a' + a.id, a); if (!vis(ap.x, ap.y)) continue;
    const ax = ap.x * T + 8, ay = ap.y * T + 10;
    if (a.atSea && a.kind !== 'rumor') { const nx = a.path && a.path[0]; drawShip(ax, ay, nx ? nx.x - a.x : 1, nx ? nx.y - a.y : 0, t + a.id * 0.2, 1); }
    else if (a.kind === 'rumor') {
      g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.ellipse(ax, ay - 10, 7, 5, 0, 0, 7); g.fill(); g.beginPath(); g.moveTo(ax - 2, ay - 6); g.lineTo(ax - 5, ay - 2); g.lineTo(ax + 1, ay - 6); g.fill();
      g.fillStyle = '#6b5226'; g.fillRect(ax - 4, ay - 11, 2, 2); g.fillRect(ax - 1, ay - 11, 2, 2); g.fillRect(ax + 2, ay - 11, 2, 2);
    } else {
      const roles = a.kind === 'caravan' || a.kind === 'envoy' ? ['cav'] : ['inf', 'ranged'];
      const u = Math.max(0, UNITS[a.culture].findIndex(x => x.entry && roles.includes(x.role)));
      const dest = a.follow ? W.char(a.follow) : W.sett(a.to);
      drawUnitSprite(a.culture, u, ax, ay, dest ? dest.x < a.x : false, t + a.id * 0.1, 0.9);
      const col = { caravan: '#e9c46a', envoy: '#f4f1e6', spy: '#9aa4b0', assassin: '#e2553f', agitator: '#ff8a3d' }[a.kind];
      g.fillStyle = col; g.strokeStyle = '#111'; g.lineWidth = 1 / cam.z;
      if (a.kind === 'envoy') { g.fillRect(ax + 5, ay - 18, 1.5, 10); g.fillRect(ax + 6.5, ay - 18, 6, 4); }
      else { g.beginPath(); g.arc(ax + 7, ay - 14, 3.2, 0, 7); g.fill(); g.stroke(); }
      if (W.hiddenKind(a) && a.revealed && !mine) { g.strokeStyle = `rgba(226,85,63,${0.6 + 0.4 * Math.sin(t * 6)})`; g.lineWidth = 2 / cam.z; g.beginPath(); g.arc(ax, ay - 6, 12, 0, 7); g.stroke(); }
    }
    if (sel?.kind === 'agent' && sel.agent === a) { g.strokeStyle = '#ffd76a'; g.lineWidth = 2 / cam.z; g.beginPath(); g.arc(ax, ay - 6, 14, 0, 7); g.stroke(); }
  }
  // you
  const P = W.player;
  if (P && P.alive && P.x != null && !(P.role !== 'vagabond' && !P.task && !P.atSea)) {
    const pp = at('p' + P.id, P); const px = pp.x * T + 8, py = pp.y * T + 10;
    const dest = P.task ? (P.task.lair ? W.lairs.find(l => l.id === P.task.lair) : P.task.bandit ? W.char(P.task.bandit) : W.sett(P.task.to)) : null;
    if (dest) { g.strokeStyle = '#ffd76a'; g.lineWidth = 1.5 / cam.z; g.setLineDash([3, 4]); pathLine(px, py, P.path, dest); g.setLineDash([]); }
    g.strokeStyle = '#ffd76a'; g.lineWidth = 2 / cam.z; g.beginPath(); g.ellipse(px, py + 1, 11, 4, 0, 0, 7); g.stroke();
    const f = P.army ? P.army.faction : P.culture, u = P.army ? P.army.unit : W.pickUnitView(P);
    const nx = P.path && P.path[0] || dest;
    if (P.atSea && nx) drawShip(px, py, nx.x - P.x, nx.y - P.y, t, 1.5);
    else drawUnitSprite(f, u, px, py, nx ? nx.x < P.x : false, P.task ? t : 0, 1.4);
    g.font = '600 8px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(px - 11, py - 34, 22, 10); g.fillStyle = '#ffd76a'; g.fillText('You', px, py - 26);
  }
  if (P && P.alive && P.x != null && P.role !== 'vagabond' && !P.task && !P.atSea) {
    const pp = at('p' + P.id, P); const px = pp.x * T + 8, py = pp.y * T - 22;
    g.font = '600 8px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = 'rgba(0,0,0,.75)'; g.fillRect(px - 12, py - 9, 24, 11); g.fillStyle = '#ffd76a'; g.fillText('You', px, py);
  }
  for (const [cx, cy] of fogChunks) g.drawImage(fogChunk(cx, cy), cx * cs, cy * cs);
  // labels: continents and islands when zoomed out, named wilds up close
  g.textBaseline = 'middle'; g.textAlign = 'center';
  if (cam.z < 1.15) for (const L of W.lands || []) {
    if (L.kind === 'isle' || (L.kind === 'island' && cam.z < 0.7) || !landSeen(L)) continue;
    const size = L.kind === 'continent' ? 30 : 14; g.font = `italic 700 ${size}px Georgia, serif`;
    g.lineWidth = 4; g.strokeStyle = 'rgba(16,12,8,.55)'; g.fillStyle = 'rgba(255,244,220,.85)';
    g.strokeText(L.name.toUpperCase(), L.cx * T, L.cy * T); g.fillText(L.name.toUpperCase(), L.cx * T, L.cy * T);
  }
  if (cam.z >= 0.7) {
    g.font = 'italic 9px Georgia, serif'; g.lineWidth = 3; g.strokeStyle = 'rgba(16,12,8,.7)'; g.fillStyle = '#e9dcb8';
    for (const wd of W.wilds || []) { if (wd.size < 35 || !vis(wd.x, wd.y) || W.setts.some(st => Math.abs(st.x - wd.x) <= 2 && Math.abs(st.y - wd.y) <= 2)) continue; const nm = wd.name[0].toUpperCase() + wd.name.slice(1); g.strokeText(nm, wd.x * T + 8, wd.y * T + 8); g.fillText(nm, wd.x * T + 8, wd.y * T + 8); }
  }
  g.textBaseline = 'bottom';
  for (const r of W.realmList()) {
    if (r.tier === 'Village' && cam.z < 2.2) continue;
    const s = W.sett(r.capital); if (!s || !vis(s.x, s.y) || !W.knowsRealm(r)) continue;
    const war = W.wars.some(w => !w.over && (w.a === r.id || w.b === r.id));
    const label = (war ? '⚔ ' : '') + r.name;
    const size = r.tier === 'Kingdom' ? 11 : 9;
    g.font = `600 ${size}px Georgia, serif`;
    const tw = g.measureText(label).width; const lx = s.x * T + 8, ly = s.y * T + 26;
    g.fillStyle = 'rgba(16,12,8,.75)'; g.fillRect(lx - tw / 2 - 4, ly - size - 3, tw + 8, size + 5);
    g.fillStyle = r.color; g.fillRect(lx - tw / 2 - 4, ly - size - 3, 2, size + 5);
    g.fillStyle = war ? '#ffb4a6' : '#fff4dc'; g.fillText(label, lx, ly);
  }
  if (cam.z >= 2.2) {
    g.font = '7px sans-serif'; g.fillStyle = '#fff4dc';
    for (const s of W.setts) { const r = W.realm(s.realmId); if ((r && r.capital === s.id) || !vis(s.x, s.y)) continue; g.strokeStyle = 'rgba(0,0,0,.7)'; g.lineWidth = 2; g.strokeText(s.name, s.x * T + 8, s.y * T + 24); g.fillText(s.name, s.x * T + 8, s.y * T + 24); }
  }
}
function drawMini() {
  const MW = mini.width, MH = mini.height, sx = MW / (W.w * T), sy = MH / (W.h * T);
  if (!mini._bg) {
    const c = document.createElement('canvas'); c.width = W.w; c.height = W.h; const m = c.getContext('2d'); const id = m.createImageData(W.w, W.h);
    const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    for (let y = 0; y < W.h; y++) for (let x = 0; x < W.w; x++) {
      let col = BCOL[W.grid[y][x]] || BCOL.plains; const o = kn(x, y) ? ownerAt(x, y) : null;
      if (!kn(x, y)) col = [33, 26, 18];
      if (o) { const rc = hex(W.realm(o).color); col = col.map((v, k) => Math.round(v * 0.55 + rc[k] * 0.45)); }
      const i = (y * W.w + x) * 4; id.data[i] = col[0]; id.data[i + 1] = col[1]; id.data[i + 2] = col[2]; id.data[i + 3] = 255;
    }
    m.putImageData(id, 0, 0); mini._bg = c;
  }
  mg.imageSmoothingEnabled = false; mg.drawImage(mini._bg, 0, 0, MW, MH);
  for (const w of W.wars) if (w.march && kn(Math.round(w.march.x), Math.round(w.march.y))) { mg.fillStyle = W.realm(w.march.att)?.color || '#fff'; mg.fillRect(w.march.x * T * sx - 2, w.march.y * T * sy - 2, 4, 4); }
  const vw = root._w / cam.z, vh = root._h / cam.z;
  mg.strokeStyle = '#ffd76a'; mg.lineWidth = 1.5; mg.strokeRect((cam.x - vw / 2) * sx, (cam.y - vh / 2) * sy, vw * sx, vh * sy);
}

// ---------- input ----------
function bind() {
  const pts = new Map(); let pinch = null, start = null, moved = false;
  canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); start = { x: e.clientX, y: e.clientY }; moved = false;
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.z }; } });
  canvas.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId); if (!p) return;
    if (pts.size === 2 && pinch) { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); const [a, b] = [...pts.values()]; cam.z = Math.max(0.5, Math.min(5, pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d)); moved = true; return; }
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) moved = true;
    if (moved) { cam.follow = false; cam.x -= (e.clientX - p.x) / cam.z; cam.y -= (e.clientY - p.y) / cam.z; }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  const up = e => { const wasPinch = pts.size > 1; pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!moved && !wasPinch && e.type === 'pointerup') tap(e); };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => { e.preventDefault(); cam.z = Math.max(0.5, Math.min(5, cam.z * (e.deltaY < 0 ? 1.12 : 0.89))); }, { passive: false });
  mini.addEventListener('pointerdown', e => { cam.follow = false; const r = mini.getBoundingClientRect(); cam.x = (e.clientX - r.left) / r.width * W.w * T; cam.y = (e.clientY - r.top) / r.height * W.h * T; });
  root.querySelector('[data-w=fit]').onclick = () => { cam.z = cam.z > 0.8 ? 0.5 : 1.8; };
  root.querySelector('[data-w=follow]').onclick = () => { cam.follow = true; };
  root.querySelector('#wcard').addEventListener('click', e => {
    const t = e.target.closest('[data-wr],[data-wc],[data-wclose],[data-wact]'); if (!t) return;
    if (t.dataset.wact) { cb.act(JSON.parse(t.dataset.wact)); return; }
    if (t.dataset.wclose != null) { sel = null; card(); return; }
    if (t.dataset.wr) cb.realm(+t.dataset.wr);
    if (t.dataset.wc) cb.char(+t.dataset.wc);
  });
}
function tap(e) {
  const r = canvas.getBoundingClientRect();
  const wx = (e.clientX - r.left - root._w / 2) / cam.z + cam.x, wy = (e.clientY - r.top - root._h / 2) / cam.z + cam.y;
  const reach = Math.max(14, 26 / cam.z);
  let best = null, bd = reach * reach;
  const consider = (kind, x, y, obj) => { if (!kn(Math.round((x - 8) / T), Math.round(y / T))) return; const d = (x - wx) ** 2 + (y - wy) ** 2; if (d < bd) { bd = d; best = { kind, ...obj }; } };
  for (const w of W.wars) if (w.march) { const mp = at('w' + w.id, w.march); consider('march', mp.x * T + 8, mp.y * T + 2, { war: w }); }
  for (const L of W.lairs) if (L.alive && (L.strength >= 15 || L.cave)) consider('lair', L.x * T + 8, L.y * T, { lair: L });
  const prr = W.playerRealm && W.playerRealm();
  for (const a of W.agents || []) { if (W.hiddenKind(a) && !a.revealed && !(prr && a.owner === prr.id)) continue; const ap = at('a' + a.id, a); consider('agent', ap.x * T + 8, ap.y * T + 4, { agent: a }); }
  for (const s of W.setts) consider('sett', s.x * T + 8, s.y * T + 4, { id: s.id });
  sel = best; card();
}
function card() {
  const box = root.querySelector('#wcard');
  if (!sel) { box.hidden = true; return; }
  box.hidden = false;
  const close = '<button class="close" data-wclose aria-label="Close">✕</button>';
  if (sel.kind === 'sett') {
    const s = W.sett(sel.id); const r = W.realm(s.realmId); const ruler = r && W.char(r.rulerId);
    box.innerHTML = `${close}<h3>${esc(s.name)}${s.destroyed ? ' (ruins)' : ''}</h3>
      <div class="sub">${s.destroyed ? 'Destroyed. Someone may rebuild it one day.' : `${cultureById(s.culture).race} ${s.biome} ${r && r.capital === s.id ? 'capital' : 'settlement'} · ${r ? (r.setts.size === 1 ? 'free village' : esc(r.name)) : ''}`}</div>
      ${s.destroyed ? '' : `<div class="kv"><div><b>${s.pop}</b><small>People</small></div><div><b>${Math.round(s.unrest)}</b><small>Unrest</small></div><div><b>${s.famine ? 'Famine' : Math.round(s.food)}</b><small>Food</small></div></div>
      <div class="wrow">${ruler ? `<button class="pill" data-wc="${ruler.id}">${esc(W.rulerTitle(r, ruler))} ${esc(ruler.name)}</button>` : ''}${r && W.knowsRealm(r) ? `<button class="pill" data-wr="${r.id}">Open ${esc(r.name)}</button>` : ''}<span class="tag">Guard: ${s.guard}</span>${s.port ? '<span class="tag">⚓ Port</span>' : ''}</div><div class="sub" style="margin-top:4px">${esc(W.landName(s))}${W.wildOf(s) ? ` · by ${esc(W.wildOf(s).name)}` : ''}</div>`}
      ${youCanTravel() && s.id !== W.player.settId && !s.destroyed ? `<button class="abtn" style="margin-top:8px" data-wact='${JSON.stringify({ type: 'travel', to: s.id })}'>🧭 Travel here · ${(n => n + ' month' + (n === 1 ? '' : 's'))(W.tripMonths(W.player, s))}${W.landName(s) !== W.landName(W.player) ? ' by sea' : ''}</button>` : ''}`;
  } else if (sel.kind === 'march') {
    const m = sel.war.march; if (!m) { sel = null; return card(); }
    const att = W.realm(m.att), def = W.realm(m.def), tgt = W.sett(m.target);
    const offs = m.officers.map(id => W.char(id)).filter(o => o && o.alive && o.army);
    const total = offs.reduce((a, o) => a + o.army.size, 0);
    const months = W.tripMonths(m, tgt);
    box.innerHTML = `${close}<h3>⚔ Host of ${esc(att.name)}</h3><div class="sub">${total.toLocaleString()} troops marching on ${esc(tgt.name)} (${esc(def.name)}) · about ${months} month${months === 1 ? '' : 's'} away</div>
      <div class="wrow">${offs.map(o => `<button class="pill" data-wc="${o.id}">${esc(o.name)} · ${o.army.size} ${esc(W.plural(W.unitName(o.army)))}</button>`).join('')}</div>`;
  } else if (sel.kind === 'agent') {
    const a = sel.agent; if (!(W.agents || []).includes(a)) { sel = null; return card(); }
    const owner = W.realm(a.owner); const dest = a.follow ? W.char(a.follow) : W.sett(a.to);
    const prr = W.playerRealm && W.playerRealm(); const mine = prr && a.owner === prr.id;
    const what = { caravan: `A caravan of ${owner ? owner.name : 'merchants'} bound for ${dest?.name || '?'}, worth about ${a.data.value || 0} gold.`, envoy: a.data.proposal ? `Envoys of ${owner?.name || '?'} riding to ${dest?.name || '?'} with an offer.` : `Envoys of ${owner?.name || '?'} riding to ${dest?.name || '?'} to sue for peace.`, spy: `${mine ? 'Your' : `A`} spy posing as ${a.data.cover}, heading for ${dest?.name || '?'}.`, assassin: `${mine ? 'Your' : 'An'} assassin posing as ${a.data.cover}, heading for ${dest?.name || '?'}.`, agitator: `${mine ? 'Your' : 'An'} agitator posing as ${a.data.cover}, stirring trouble at ${dest?.name || '?'}.`, rumor: `A rumor travels town to town${a.data.about && W.char(a.data.about) ? ` about ${W.char(a.data.about).name}` : ''}.` }[a.kind];
    const P = W.player;
    const canSeize = !mine && W.hiddenKind(a) && a.revealed && W.playerRules && W.playerRules();
    const canRaid = a.kind === 'caravan' && P && P.alive && P.role === 'vagabond' && W.dist(a, P) <= 3;
    box.innerHTML = `${close}<h3>${W.agentLabel(a)}</h3><div class="sub">${esc(what)}</div>
      ${canSeize ? `<button class="abtn" style="margin-top:8px" data-wact='${JSON.stringify({ type: 'seize', id: a.id })}'>Seize them (10 gold)</button>` : ''}
      ${canRaid ? `<button class="abtn" style="margin-top:8px" data-wact='${JSON.stringify({ type: 'raid', id: a.id })}'>Raid the caravan (${a.data.guards} guards)</button><div class="sub">Raiding makes you an outlaw in their eyes and earns a reputation.</div>` : ''}`;
  } else if (sel.kind === 'lair') {
    const L = sel.lair; const danger = L.strength > 50 ? 'Ready to break out' : L.strength > 30 ? 'Growing restless' : 'Stirring';
    const nm = MON[L.key] ? MON[L.key].the : L.key;
    box.innerHTML = `${close}<h3>${L.cave ? 'Cave' : 'Lair'} of ${esc(W.lairName(L))}</h3><div class="sub">${danger} · strength ${Math.round(L.strength * L.base)}</div><div class="sub" style="margin-top:6px">Left alone, monsters grow until they break out and ravage nearby settlements. Heroes may slay, trap or tame them.</div>
      ${youVagabond() ? `<div class="abtns">${['slay', 'trap', 'tame'].filter(a => a === 'slay' || (a === 'tame' ? MON[L.key].tame : !MON[L.key].rift && L.key !== 'dragon')).map(a => `<button class="abtn" data-wact='${JSON.stringify({ type: 'contract', kind: 'lair', id: L.id, approach: a })}'>${a[0].toUpperCase() + a.slice(1)} · ${Math.round(W.huntOdds(L, a) * 100)}%</button>`).join('')}</div>` : ''}`;
  }
}
function youCanTravel() { const p = W.player; return p && p.alive && !p.prisonerOf && !W.gameOver; }
function youVagabond() { const p = W.player; return p && p.alive && p.role === 'vagabond' && !W.gameOver; }
export function debugCam() { return cam; }
export function refreshCard() { if (root && sel) card(); }
