// Battle maps for Warlord: Dynasty Warriors fields of bases joined by roads, passes and bridges.
// Everything between the paths is cliff, wood or water. Troops walk only where there is road.

const CELL = 16;
function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const WIDTH = { road: 220, pass: 120, bridge: 100, ford: 140 };

// pattern: bases per side, front row to the main camp, e.g. '2-2-1'
export function generateMap({ seed = 1, total = 6000, terrain = 'plains', pattern = '2-2-1' }) {
  const R = rng(seed * 7919 + 17);
  const k = Math.max(1, Math.sqrt(total / 2400));
  const w = Math.round(2200 * k), h = Math.round(1300 * k);
  const rows = pattern.split('-').map(Number);
  const lanes = Math.max(2, Math.min(4, Math.max(...rows) + (R() < 0.4 ? 1 : 0)));
  const COLS = 7; // camp | 0 1 2 | 3 (middle) | 4 5 6 | camp
  const nodes = [], edges = [];
  const node = (x, y, kind = 'road') => { nodes.push({ id: nodes.length, x, y, kind }); return nodes.length - 1; };
  const edge = (a, b, kind = 'road') => { edges.push({ id: edges.length, a, b, kind, w: WIDTH[kind], open: true }); };
  // a river down the middle on wet or open ground; the middle column then crosses it by bridges
  const river = ['plains', 'swamp', 'forest'].includes(terrain) && R() < 0.65;
  const laneY = []; for (let l = 0; l < lanes; l++) laneY.push(h * (l + 1) / (lanes + 1));
  const grid = [];
  for (let l = 0; l < lanes; l++) {
    grid.push([]);
    for (let c = 0; c < COLS; c++) {
      const x = w * (0.16 + c * (0.68 / (COLS - 1)));
      const y = Math.max(h * 0.12, Math.min(h * 0.88, laneY[l] + (R() - 0.5) * h / (lanes + 1) * 0.55));
      grid[l].push(node(x, y));
    }
  }
  // mirror the right half so both sides get a fair field
  for (let l = 0; l < lanes; l++) for (let c = 0; c < 3; c++) { const a = nodes[grid[l][c]], b = nodes[grid[l][COLS - 1 - c]]; b.y = a.y; b.x = w - a.x; }
  const camps = [node(w * 0.06, h / 2, 'camp'), node(w * 0.94, h / 2, 'camp')];
  for (let l = 0; l < lanes; l++) {
    edge(camps[0], grid[l][0]); edge(camps[1], grid[l][COLS - 1]);
    for (let c = 0; c < COLS - 1; c++) edge(grid[l][c], grid[l][c + 1], river && (c === 2 || c === 3) ? 'bridge' : 'road');
  }
  // cross-links between neighbouring lanes: narrow passes over the ridges
  for (let l = 0; l < lanes - 1; l++) for (const c of [1, 3, 5]) if (c === 3 ? R() < 0.7 : R() < 0.55) edge(grid[l][c], grid[l + 1][c], c === 3 && river ? 'ford' : 'pass');
  // bases: front row at column 2 (and 4 for the other side), the next row further back, the main camp at the camp node
  const bases = [];
  for (const side of [0, 1]) {
    rows.forEach((n, ri) => {
      const last = ri === rows.length - 1;
      const col = last ? 0 : Math.max(0, 2 - ri);
      const lanesFor = spread(n - (last ? 1 : 0), lanes);
      if (last) bases.push({ side, kind: 'main', node: camps[side] });
      for (const l of lanesFor) { const c = side === 0 ? col : COLS - 1 - col; bases.push({ side, kind: last ? 'fort' : ri === 0 ? 'outpost' : 'fort', node: grid[l][c] }); }
    });
  }
  for (const b of bases) { const nd = nodes[b.node]; b.fx = nd.x / w; b.fy = nd.y / h; nd.base = true; }
  const map = { w, h, nodes, edges, bases, lanes, river, terrain, seed, camps, grid };
  buildRaster(map);
  return map;
}
function spread(n, lanes) { if (n <= 0) return []; if (n >= lanes) return [...Array(lanes).keys()]; const out = []; for (let i = 0; i < n; i++) out.push(Math.round((i + 0.5) * lanes / n - 0.5)); return [...new Set(out)]; }

// Walkable cells and, for every blocked cell, the nearest safe point on a path
export function buildRaster(map) {
  const gw = Math.ceil(map.w / CELL), gh = Math.ceil(map.h / CELL);
  const walk = new Uint8Array(gw * gh), px = new Float32Array(gw * gh), py = new Float32Array(gw * gh);
  const segs = map.edges.filter(e => e.open).map(e => ({ a: map.nodes[e.a], b: map.nodes[e.b], hw: e.w / 2 }));
  const discs = map.nodes.filter(n => n.base || n.kind === 'camp').map(n => ({ x: n.x, y: n.y, r: Math.max(n.kind === 'camp' ? 260 : 200, n.discR || 0) }));
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const x = gx * CELL + CELL / 2, y = gy * CELL + CELL / 2; const i = gy * gw + gx;
    let best = 1e9, bx = x, by = y, ok = false;
    for (const s of segs) {
      const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, L = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - s.a.x) * dx + (y - s.a.y) * dy) / L));
      const qx = s.a.x + dx * t, qy = s.a.y + dy * t, d = Math.hypot(x - qx, y - qy);
      if (d <= s.hw) { ok = true; break; }
      const slack = d - s.hw; if (slack < best) { best = slack; const k = Math.max(0, s.hw - 14) / d; bx = qx + (x - qx) * k; by = qy + (y - qy) * k; }
    }
    if (!ok) for (const c of discs) { const d = Math.hypot(x - c.x, y - c.y); if (d <= c.r) { ok = true; break; } const slack = d - c.r; if (slack < best) { best = slack; const k = Math.max(0, c.r - 14) / d; bx = c.x + (x - c.x) * k; by = c.y + (y - c.y) * k; } }
    walk[i] = ok ? 1 : 0; px[i] = bx; py[i] = by;
  }
  map.raster = { gw, gh, cell: CELL, walk, px, py };
  map.rev = (map.rev || 0) + 1;
}
export function walkable(map, x, y) { const R = map.raster; const gx = (x / R.cell) | 0, gy = (y / R.cell) | 0; if (gx < 0 || gy < 0 || gx >= R.gw || gy >= R.gh) return false; return R.walk[gy * R.gw + gx] === 1; }
// push a point back onto the paths if it has strayed into rock, wood or water
export function clampToPath(map, s) {
  const R = map.raster; const gx = Math.max(0, Math.min(R.gw - 1, (s.x / R.cell) | 0)), gy = Math.max(0, Math.min(R.gh - 1, (s.y / R.cell) | 0)); const i = gy * R.gw + gx;
  if (R.walk[i]) return false;
  s.x = R.px[i]; s.y = R.py[i]; return true;
}

// shortest open route between two nodes (Dijkstra; the graphs are tiny)
export function routeNodes(map, from, to, avoid = null) {
  const N = map.nodes.length, dist = new Array(N).fill(Infinity), prev = new Array(N).fill(-1), done = new Array(N).fill(false);
  dist[from] = 0;
  for (;;) {
    let u = -1, bd = Infinity; for (let i = 0; i < N; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; u = i; }
    if (u < 0 || u === to) break; done[u] = true;
    for (const e of map.edges) {
      if (!e.open || (e.a !== u && e.b !== u)) continue;
      const v = e.a === u ? e.b : e.a; const a = map.nodes[u], b = map.nodes[v];
      const cost = Math.hypot(a.x - b.x, a.y - b.y) * (avoid && avoid.has(e.id) ? 3 : 1);
      if (dist[u] + cost < dist[v]) { dist[v] = dist[u] + cost; prev[v] = u; }
    }
  }
  if (dist[to] === Infinity) return null;
  const path = []; for (let v = to; v !== from; v = prev[v]) path.unshift(v);
  return path;
}
export function nearestNode(map, x, y) { let best = 0, bd = Infinity; for (const n of map.nodes) { const d = (n.x - x) ** 2 + (n.y - y) ** 2; if (d < bd) { bd = d; best = n.id; } } return best; }
export function edgeBetween(map, a, b) { return map.edges.find(e => (e.a === a && e.b === b) || (e.a === b && e.b === a)); }
