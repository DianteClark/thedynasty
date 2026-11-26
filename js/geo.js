// Geography for 2.x worlds: landmasses, the open sea, ports, named wilds, territories and sea routes.
// Everything here is derived from the biome grid, so it can be rebuilt for old saves.

const WILD_BIOMES = ['forest', 'swamp', 'mountain', 'tundra', 'wasteland'];
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

function hash32(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const LAND_A = ['Ael', 'Bor', 'Cal', 'Dra', 'Ery', 'Fen', 'Gal', 'Hal', 'Ith', 'Kor', 'Lun', 'Mor', 'Nar', 'Oss', 'Pell', 'Quel', 'Rhun', 'Sar', 'Tal', 'Ul', 'Val', 'Wyr', 'Xan', 'Yr', 'Zar'];
const LAND_B = ['adon', 'amar', 'endor', 'heim', 'ithra', 'mere', 'oria', 'undar', 'avel', 'esh', 'goth', 'wynd', 'ara', 'ond', 'oth'];
const WILD_A = ['Ash', 'Black', 'Bone', 'Briar', 'Cinder', 'Crow', 'Dusk', 'Ember', 'Fang', 'Frost', 'Gloom', 'Grey', 'Hollow', 'Iron', 'Mist', 'Moon', 'Raven', 'Red', 'Rot', 'Salt', 'Shade', 'Silver', 'Stone', 'Storm', 'Thorn', 'Weeping', 'Whisper', 'Wolf', 'Wyrm', 'Bleak'];
const WILD_B = { forest: ['wood', 'weald', 'wild', 'grove', 'thicket'], swamp: ['mire', 'fen', 'bog', 'marsh', 'sump'], mountain: ['peaks', 'fangs', 'crags', 'spine', 'teeth'], tundra: ['wastes', 'barrens', 'reach', 'expanse', 'drifts'], wasteland: ['sands', 'barrens', 'dunes', 'flats', 'scar'] };
const BEAST_A = ['Gor', 'Vor', 'Skar', 'Mal', 'Grim', 'Thra', 'Ur', 'Kha', 'Zul', 'Mor', 'Bra', 'Sha'];
const BEAST_B = ['gath', 'fang', 'moth', 'rok', 'zel', 'vash', 'drik', 'nox', 'gul', 'thar'];
const EPITHET = ['the Hungering', 'the Old', 'the Pale', 'Bonecruncher', 'the Unseen', 'Widowmaker', 'the Ravenous', 'the Patient', 'Many-Eyes', 'the Drowned'];

export function cap(s) { return s[0].toUpperCase() + s.slice(1); }
export function beastName(r) { return BEAST_A[Math.floor(r() * BEAST_A.length)] + BEAST_B[Math.floor(r() * BEAST_B.length)] + ' ' + EPITHET[Math.floor(r() * EPITHET.length)]; }

// Flood-fill land into landmasses, mark the open sea, name continents and islands, find named wilds.
export function buildGeo(W, keepNames = true) {
  const w = W.w, h = W.h, N = w * h, G = W.grid;
  const R = rng(hash32(W.seed + '|geo'));
  const landId = new Array(N).fill(0), ocean = new Array(N).fill(0);
  // the open sea: water connected to the map edge
  const q = [];
  for (let x = 0; x < w; x++) for (const y of [0, h - 1]) if (G[y][x] === 'water' && !ocean[y * w + x]) { ocean[y * w + x] = 1; q.push(y * w + x); }
  for (let y = 0; y < h; y++) for (const x of [0, w - 1]) if (G[y][x] === 'water' && !ocean[y * w + x]) { ocean[y * w + x] = 1; q.push(y * w + x); }
  while (q.length) { const i = q.pop(), x = i % w, y = (i / w) | 0; for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const j = ny * w + nx; if (!ocean[j] && G[ny][nx] === 'water') { ocean[j] = 1; q.push(j); } } }
  // landmasses
  const old = keepNames && W.lands ? W.lands : [];
  const lands = [];
  for (let s = 0; s < N; s++) {
    if (landId[s] || G[(s / w) | 0][s % w] === 'water') continue;
    const id = lands.length + 1; let n = 0, sx = 0, sy = 0; const st = [s]; landId[s] = id;
    while (st.length) { const i = st.pop(), x = i % w, y = (i / w) | 0; n++; sx += x; sy += y; for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const j = ny * w + nx; if (!landId[j] && G[ny][nx] !== 'water') { landId[j] = id; st.push(j); } } }
    lands.push({ id, size: n, cx: sx / n, cy: sy / n });
  }
  const big = Math.max(40, N * 0.04);
  for (const L of lands) {
    L.kind = L.size >= big ? 'continent' : L.size >= 12 ? 'island' : 'isle';
    const prev = old.find(o => Math.hypot(o.cx - L.cx, o.cy - L.cy) < 6 && Math.abs(o.size - L.size) < Math.max(20, o.size * 0.3));
    let nm = prev && prev.name;
    for (let k = 0; !nm || (k < 30 && lands.some(o => o !== L && o.name === nm)); k++) nm = (L.kind === 'continent' ? '' : 'Isle of ') + LAND_A[Math.floor(R() * LAND_A.length)] + LAND_B[Math.floor(R() * LAND_B.length)];
    L.name = nm;
  }
  // named wilds: big connected stretches of one wild biome
  const wildId = new Array(N).fill(0); const wilds = [];
  const oldW = keepNames && W.wilds ? W.wilds : [];
  const used = new Set(oldW.map(x => x.name));
  for (let s = 0; s < N; s++) {
    const b = G[(s / w) | 0][s % w]; if (wildId[s] || !WILD_BIOMES.includes(b)) continue;
    const cells = [s]; const seen = new Set([s]); const st = [s];
    while (st.length) { const i = st.pop(), x = i % w, y = (i / w) | 0; for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const j = ny * w + nx; if (!seen.has(j) && G[ny][nx] === b) { seen.add(j); cells.push(j); st.push(j); } } }
    if (cells.length < 22) { for (const c of cells) wildId[c] = -1; continue; }
    // the label sits on the cell nearest the middle
    let mx = 0, my = 0; for (const c of cells) { mx += c % w; my += (c / w) | 0; } mx /= cells.length; my /= cells.length;
    let best = cells[0], bd = 1e9; for (const c of cells) { const d = (c % w - mx) ** 2 + (((c / w) | 0) - my) ** 2; if (d < bd) { bd = d; best = c; } }
    const id = wilds.length + 1;
    const prev = oldW.find(o => o.biome === b && cells.includes(o.y * w + o.x));
    let name = prev && prev.name;
    for (let k = 0; !name && k < 30; k++) { const n = `the ${WILD_A[Math.floor(R() * WILD_A.length)]} ${cap(WILD_B[b][Math.floor(R() * WILD_B[b].length)])}`; if (!used.has(n)) name = n; }
    if (!name) name = `the ${cap(b)} of ${id}`; used.add(name);
    wilds.push({ id, name, biome: b, size: cells.length, x: best % w, y: (best / w) | 0, land: landId[best] });
    for (const c of cells) wildId[c] = id;
  }
  for (let i = 0; i < N; i++) if (wildId[i] < 0) wildId[i] = 0;
  W.landId = landId; W.ocean = ocean; W.lands = lands; W.wildId = wildId; W.wilds = wilds;
  W._sea = new Map();
  buildPorts(W); buildTerritory(W);
}

// A settlement near the open sea gets a dock; every inhabited landmass gets at least one.
export function buildPorts(W) {
  const w = W.w, h = W.h;
  const nearestOcean = (s, R) => {
    let best = null, bd = 1e9;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const x = s.x + dx, y = s.y + dy; if (x < 0 || y < 0 || x >= w || y >= h || !W.ocean[y * w + x]) continue;
      const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = { x, y }; }
    }
    return best;
  };
  for (const s of W.setts) { const d = nearestOcean(s, 2); s.dock = d; s.port = !!d; }
  for (const L of W.lands) {
    const mine = W.setts.filter(s => W.landId[s.y * w + s.x] === L.id);
    if (!mine.length || mine.some(s => s.port)) continue;
    let best = null, bd = 1e9;
    for (const s of mine) { const d = nearestOcean(s, 7); if (d) { const dd = (d.x - s.x) ** 2 + (d.y - s.y) ** 2; if (dd < bd) { bd = dd; best = [s, d]; } } }
    if (best) { best[0].dock = best[1]; best[0].port = true; }
  }
}

// Each land cell belongs to the nearest settlement on the same landmass (within reach): its territory.
export function buildTerritory(W) {
  const w = W.w, h = W.h, R = 6;
  const terr = new Array(w * h).fill(0), bd = new Array(w * h).fill(1e9);
  for (const s of W.setts) {
    const lid = W.landId[s.y * w + s.x];
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const x = s.x + dx, y = s.y + dy; if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const i = y * w + x; if (W.landId[i] !== lid) continue;
      const d = dx * dx + dy * dy; if (d < bd[i] && d <= R * R) { bd[i] = d; terr[i] = s.id; }
    }
  }
  W.terr = terr;
}

export function landAt(W, p) { const x = Math.max(0, Math.min(W.w - 1, Math.round(p.x))), y = Math.max(0, Math.min(W.h - 1, Math.round(p.y))); return W.landId[y * W.w + x]; }

// A* over open sea between two dock cells, 8 directions. Cached per pair of docks.
function seaPath(W, a, b) {
  const key = a.x + ',' + a.y + '>' + b.x + ',' + b.y;
  if (W._sea.has(key)) return W._sea.get(key);
  const w = W.w, h = W.h, start = a.y * w + a.x, goal = b.y * w + b.x;
  const g = new Map([[start, 0]]), from = new Map(); const open = [[0, start]];
  const H = i => Math.hypot(i % w - b.x, ((i / w) | 0) - b.y);
  const push = (f, i) => { open.push([f, i]); let k = open.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (open[p][0] <= open[k][0]) break; [open[p], open[k]] = [open[k], open[p]]; k = p; } };
  const pop = () => { const top = open[0], last = open.pop(); if (open.length) { open[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < open.length && open[l][0] < open[m][0]) m = l; if (r < open.length && open[r][0] < open[m][0]) m = r; if (m === k) break; [open[m], open[k]] = [open[k], open[m]]; k = m; } } return top; };
  let found = false, guard = 0;
  while (open.length && guard++ < 60000) {
    const [, i] = pop(); if (i === goal) { found = true; break; }
    const x = i % w, y = (i / w) | 0;
    for (const [dx, dy] of N8) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx; if (!W.ocean[j] && j !== goal) continue;
      const ng = g.get(i) + (dx && dy ? 1.414 : 1);
      if (ng < (g.get(j) ?? 1e9)) { g.set(j, ng); from.set(j, i); push(ng + H(j), j); }
    }
  }
  let path = null;
  if (found) {
    const cells = []; let c = goal; while (c !== undefined && c !== start) { cells.push(c); c = from.get(c); } cells.reverse();
    path = cells.filter((_, k) => k % 3 === 2 || k === cells.length - 1).map(i => ({ x: i % w, y: (i / w) | 0, sea: true }));
  }
  W._sea.set(key, path);
  return path;
}

// Waypoints from one place to another. Same landmass: straight overland. Otherwise: to a port, by ship, and on.
export function route(W, from, to) {
  const la = landAt(W, from), lb = landAt(W, to);
  if (!la || !lb || la === lb) return [{ x: to.x, y: to.y }];
  const ports = L => W.setts.filter(s => s.port && !s.destroyed && W.landId[s.y * W.w + s.x] === L);
  const near = (list, p) => list.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
  const pa = near(ports(la), from), pb = near(ports(lb), to);
  if (!pa || !pb) return [{ x: to.x, y: to.y }];
  const sea = seaPath(W, pa.dock, pb.dock);
  if (!sea) return [{ x: to.x, y: to.y }];
  return [{ x: pa.x, y: pa.y, port: pa.id }, { x: pa.dock.x, y: pa.dock.y }, ...sea, { x: pb.x, y: pb.y, sea: true, port: pb.id }, { x: to.x, y: to.y }];
}

// Move an object one month along its route. Returns true on arrival.
export function advance(W, obj, dest, landSpeed, seaSpeed) {
  const key = Math.round(dest.x * 10) + ',' + Math.round(dest.y * 10);
  if (obj.pathKey !== key || !obj.path) { obj.path = route(W, obj, dest); obj.pathKey = key; }
  let budget = 1;
  const trail = [{ x: obj.x, y: obj.y }];
  while (obj.path.length && budget > 1e-6) {
    const wp = obj.path[0]; const sp = wp.sea ? seaSpeed : landSpeed;
    const dx = wp.x - obj.x, dy = wp.y - obj.y, d = Math.hypot(dx, dy);
    const need = d / sp;
    if (need <= budget) { obj.x = wp.x; obj.y = wp.y; budget -= need; obj.path.shift(); }
    else { obj.x += dx / d * sp * budget; obj.y += dy / d * sp * budget; budget = 0; }
    trail.push({ x: obj.x, y: obj.y });
  }
  obj.trail = trail;
  obj.atSea = !!(obj.path.length && obj.path[0].sea);
  if (!obj.path.length) { obj.path = null; obj.pathKey = null; obj.atSea = false; return true; }
  return false;
}

// Months a trip should take, following the real route.
export function tripMonths(W, from, to, landSpeed, seaSpeed) {
  let t = 0, p = { x: from.x, y: from.y };
  for (const wp of route(W, from, to)) { t += Math.hypot(wp.x - p.x, wp.y - p.y) / (wp.sea ? seaSpeed : landSpeed); p = wp; }
  return Math.max(1, Math.ceil(t));
}
