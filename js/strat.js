// Warlord 3.2: stratagem cards (drawn during battle, played with command points that refill)
// and battlefield events (landslides, bridge collapses, floods, wildfires and storms) that close roads.
import { UNITS } from '../assets/units/units.js';
import { buildRaster, routeNodes } from './bmap.js';

// target: none | point | own (one of your divisions) | foe (an enemy division) | edge:<kinds>
export const CARDS = {
  fire: { name: 'Fire arrows', icon: '🔥', cost: 3, target: 'point', text: 'A volley of fire on any spot. Burns into a base\'s garrison. Not in a storm.' },
  rally: { name: 'War drums', icon: '🥁', cost: 4, target: 'none', text: 'Every officer\'s troops take heart; a broken division with men left turns and rallies.' },
  march: { name: 'Forced march', icon: '👢', cost: 2, target: 'own', text: 'One division moves 45% faster for 25 seconds.' },
  wall: { name: 'Shield wall', icon: '🛡️', cost: 3, target: 'own', text: 'One division takes far less harm for 20 seconds.' },
  discord: { name: 'Sow discord', icon: '🗣', cost: 3, target: 'foe', text: 'Rumours and false orders: an enemy division loses heart.' },
  rockfall: { name: 'Rockfall', icon: '🪨', cost: 5, target: 'edge:pass,road', text: 'Bring the hillside down on a pass or road: it closes for good and crushes whoever is on it.' },
  burn: { name: 'Burn the bridge', icon: '🌉', cost: 3, target: 'edge:bridge', text: 'Fire a bridge: it falls into the river with anyone on it.' },
  relief: { name: 'Relief column', icon: '🏳', cost: 6, target: 'none', text: 'Fresh troops march out of your main camp under a new captain.' },
};
const DECK = ['fire', 'fire', 'rally', 'rally', 'march', 'march', 'wall', 'wall', 'discord', 'discord', 'rockfall', 'burn', 'relief'];
export const CP_MAX = 10, CP_EVERY = 6, HAND = 4;

export function initCards(B) {
  const bridges = B.map && B.map.edges.some(e => e.kind === 'bridge');
  for (const side of B.sides) {
    side.cp = 3; side.cpT = 0; side.hand = []; side.drawAt = 0; side.fireUsed = true; // the old one-shot volley gives way to the deck
    side.deck = shuffle(B, DECK.filter(c => c !== 'burn' || bridges));
    while (side.hand.length < HAND) draw(B, side);
  }
  B.buffs = []; B.hazards = []; B.warns = []; B.reopen = [];
}
function shuffle(B, a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(B.r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function draw(B, side) { if (!side.deck.length) side.deck = shuffle(B, DECK.filter(c => c !== 'burn' || (B.map && B.map.edges.some(e => e.kind === 'bridge' && e.open)))); side.hand.push(side.deck.shift()); }

export function cardsTick(B, dt) {
  for (const side of B.sides) {
    side.cpT += dt; while (side.cpT >= CP_EVERY) { side.cpT -= CP_EVERY; side.cp = Math.min(CP_MAX, side.cp + 1); }
    if (side.hand.length < HAND && B.t >= side.drawAt) { draw(B, side); side.drawAt = B.t + 5; }
  }
  for (let i = B.buffs.length - 1; i >= 0; i--) { const f = B.buffs[i]; if (B.t >= f.end) { f.div.stats[f.key] /= f.mult; B.buffs.splice(i, 1); } }
}

// can this card be played on this target right now? returns a reason string when not
export function cardBlock(B, sideIdx, id, target) {
  const side = B.sides[sideIdx], c = CARDS[id];
  if (B.over) return 'The battle is over.';
  if (side.cp < c.cost) return `Needs ${c.cost} command points.`;
  if (id === 'fire' && B.storm && B.t < B.storm.end) return 'The rain puts out fire arrows.';
  if (c.target === 'own' || c.target === 'foe') { const d = target != null && B.divisions[target]; if (!d || d.routed || B.aliveCount(d) <= 0 || (c.target === 'own') !== (d.side === sideIdx) || d.garrison) return c.target === 'own' ? 'Pick one of your divisions.' : 'Pick an enemy division.'; }
  if (c.target.startsWith('edge')) { const e = target != null && B.map && B.map.edges[target]; if (!e || !e.open || !c.target.slice(5).split(',').includes(e.kind)) return 'Pick a ' + c.target.slice(5).replace(',', ' or ') + '.'; if (!canClose(B, e)) return B.map.camps.includes(e.a) || B.map.camps.includes(e.b) ? 'The roads out of a main camp can\'t be closed.' : 'Closing that would cut a base off from the field.'; }
  return null;
}
export function playCard(B, sideIdx, slot, target, scripted = false) {
  const side = B.sides[sideIdx]; const id = side.hand[slot]; if (!id) return 'No card.';
  const why = cardBlock(B, sideIdx, id, target); if (why) return why;
  if (!scripted && !side.ai) B.recorded.push({ step: B.steps, type: 'card', side: sideIdx, slot, target });
  side.cp -= CARDS[id].cost; side.hand.splice(slot, 1); side.drawAt = Math.max(side.drawAt, B.t + 4);
  const who = side.name;
  switch (id) {
    case 'fire': B.fires.push({ x: target.x, y: target.y, r: 75, land: B.t + 2.2, end: B.t + 7, side: sideIdx, hit: false, from: { ...side.hq } }); B.log(`${who} looses a volley of fire arrows.`, sideIdx, 'strat'); break;
    case 'rally': {
      let n = 0;
      for (const d of B.divisions) if (d.side === sideIdx && !d.garrison && B.aliveCount(d) > 0) {
        if (d.routed && B.aliveCount(d) > d.start * 0.3) { d.routed = false; d.state = 'hold'; d.morale = 38; d.rallied++; const c = B.centroid(d); d.cx = c.x; d.cy = c.y; n++; }
        else if (!d.routed) d.morale = Math.min(d.baseMorale + 12, d.morale + 22);
      }
      B.log(`${who}'s war drums thunder${n ? `: ${n} broken division${n > 1 ? 's turn' : ' turns'} and rally` : ''}!`, sideIdx, 'good'); break;
    }
    case 'march': case 'wall': { const d = B.divisions[target]; const key = id === 'march' ? 'spd' : 'def', mult = id === 'march' ? 1.45 : 2.2; d.stats[key] *= mult; B.buffs.push({ div: d, key, mult, end: B.t + (id === 'march' ? 25 : 20) }); B.log(id === 'march' ? `The ${d.unitName} of ${d.officer.name} march at the double.` : `The ${d.unitName} of ${d.officer.name} lock shields.`, sideIdx, 'good'); break; }
    case 'discord': { const d = B.divisions[target]; d.morale -= 26; B.log(`False orders spread among the ${d.unitName} of ${d.officer.name}.`, d.side, 'bad'); break; }
    case 'rockfall': closeEdge(B, B.map.edges[target], 'slide', `${who} brings the hillside down on ${edgeName(B, B.map.edges[target])}!`, sideIdx); break;
    case 'burn': closeEdge(B, B.map.edges[target], 'bridge', `${who} fires ${edgeName(B, B.map.edges[target])}. It falls into the river!`, sideIdx); break;
    case 'relief': {
      const main = B.bases.find(b => b.home === sideIdx && b.kind === 'main' && b.side === sideIdx); if (!main) { side.cp += CARDS[id].cost; return 'Your main camp is lost.'; }
      const start = B.divisions.filter(d => d.side === sideIdx).reduce((a, d) => a + d.start, 0);
      const f = side.faction; const unit = Math.max(0, UNITS[f].findIndex(u => u.entry && (u.role === 'inf' || u.role === 'heavy')));
      const div = B.makeDivision(side, { faction: f, unit, count: Math.max(30, Math.round(start * 0.05)), level: 2, at: { x: main.x + side.dir * 60, y: main.y }, officer: { name: 'Relief captain', stats: { lea: 9, mig: 8, int: 7, cha: 10 } } }, 0, 1);
      div.state = 'advance'; B.log(`A relief column marches out of ${main.name}: ${div.start} ${div.unitName}.`, sideIdx, 'good'); break;
    }
  }
  return null;
}

// ---------- roads that close ----------
export function edgeName(B, e) {
  const M = B.map; const mid = { x: (M.nodes[e.a].x + M.nodes[e.b].x) / 2, y: (M.nodes[e.a].y + M.nodes[e.b].y) / 2 };
  const kind = { pass: 'the pass', bridge: 'the bridge', ford: 'the ford', road: 'the road' }[e.kind];
  const ns = mid.y < M.h * 0.38 ? 'north' : mid.y > M.h * 0.62 ? 'south' : 'middle';
  const b = B.bases.slice().sort((p, q) => Math.hypot(p.x - mid.x, p.y - mid.y) - Math.hypot(q.x - mid.x, q.y - mid.y))[0];
  return b && Math.hypot(b.x - mid.x, b.y - mid.y) < 700 ? `${kind} by ${b.name}` : `${kind} in the ${ns}`;
}
// a road may close only if every base can still be reached from both camps
export function canClose(B, e) {
  const M = B.map; if (!M || !e.open) return false;
  if (M.camps.includes(e.a) || M.camps.includes(e.b)) return false; // the roads out of each camp are too wide and too well kept
  e.open = false;
  let ok = !!routeNodes(M, M.camps[0], M.camps[1]);
  if (ok) for (const b of M.bases) { if (!routeNodes(M, M.camps[0], b.node) || !routeNodes(M, M.camps[1], b.node)) { ok = false; break; } }
  e.open = true; return ok;
}
function segDist(M, e, x, y) { const a = M.nodes[e.a], b = M.nodes[e.b]; const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L)); return Math.hypot(x - a.x - dx * t, y - a.y - dy * t); }
export function closeEdge(B, e, cause, text, bySide = null, reopenAfter = 0) {
  const M = B.map; e.open = false; e.closed = cause;
  // whoever stands on it (and not inside a base) is crushed, swept away or drowned
  const lethal = cause === 'flood' ? 0.35 : 0.8; let dead = 0; const hitDivs = new Set();
  const inBase = s => B.bases.some(b => (s.x - b.x) ** 2 + (s.y - b.y) ** 2 < (b.r + 40) ** 2);
  for (const s of B.soldiers) if (s.alive && !s.fled && segDist(M, e, s.x, s.y) < e.w / 2 + 6 && !inBase(s)) { hitDivs.add(s.div); if (B.r() < lethal) { B.hit(s, 1e6, null); dead++; } }
  for (const d of hitDivs) { d.morale -= 15; const o = d.officer; if (o.alive && !o.captured && segDist(M, e, o.x, o.y) < e.w / 2 + 6 && B.r() < (cause === 'flood' ? 0.3 : 0.65)) B.officerDown(d, false); }
  B.log(text + (dead === 1 ? ' One man is lost.' : dead ? ` ${dead.toLocaleString()} are lost.` : ''), bySide, 'strat');
  if (reopenAfter) B.reopen.push({ e, at: B.t + reopenAfter });
  buildRaster(M);
}

// ---------- nature ----------
const EVENT_W = { // weights by terrain
  landslide: { mountain: 5, wasteland: 3, tundra: 3, plains: 1, forest: 1, swamp: 0.5 },
  bridge: { plains: 2, forest: 2, swamp: 3 }, flood: { swamp: 4, plains: 2, forest: 2, tundra: 1 },
  wildfire: { forest: 4, plains: 3, wasteland: 2 }, storm: { plains: 2, forest: 1.5, swamp: 2, tundra: 2, mountain: 2, wasteland: 1 },
};
export function eventsTick(B) {
  if (!B.map) return;
  if (B.nextEvent == null) B.nextEvent = 35 + B.r() * 30;
  for (let i = B.reopen.length - 1; i >= 0; i--) if (B.t >= B.reopen[i].at) { const { e } = B.reopen[i]; e.open = true; e.closed = null; B.reopen.splice(i, 1); buildRaster(B.map); B.log(`The waters fall: ${edgeName(B, e)} can be crossed again.`, null, 'strat'); }
  for (let i = B.warns.length - 1; i >= 0; i--) { const w = B.warns[i]; if (B.t >= w.at) { B.warns.splice(i, 1); w.go(); } }
  for (const h of B.hazards) if (B.t < h.end && (B.steps % 6) === 0) for (const s of B.soldiers) if (s.alive && !s.fled && (s.x - h.x) ** 2 + (s.y - h.y) ** 2 < h.r * h.r && B.r() < 0.06) { B.hit(s, 6 + B.r() * 6, null); s.div.morale -= 0.15; }
  if (B.storm && B.t >= B.storm.end) { B.storm = null; B.log('The storm passes.', null, 'strat'); }
  if (B.t < B.nextEvent) return;
  B.nextEvent = B.t + 45 + B.r() * 40;
  B.nEvents = (B.nEvents || 0) + 1; if (B.nEvents > 2 + Math.floor(B.limit / 150)) { B.nextEvent = Infinity; return; }
  const opts = Object.entries(EVENT_W).map(([k, w]) => [k, w[B.terrain] || 0]).filter(([k, w]) => w > 0 && eventPossible(B, k));
  const tot = opts.reduce((a, [, w]) => a + w, 0); if (!tot) return;
  let r = B.r() * tot, kind = opts[0][0]; for (const [k, w] of opts) { if ((r -= w) <= 0) { kind = k; break; } }
  startEvent(B, kind);
}
function candidates(B, kinds) { return B.map.edges.filter(e => e.open && kinds.includes(e.kind) && !B.warns.some(w => w.e === e) && canClose(B, e)); }
function eventPossible(B, k) {
  if (k === 'landslide') return candidates(B, ['pass', 'road']).length > 0;
  if (k === 'bridge') return candidates(B, ['bridge']).length > 0;
  if (k === 'flood') return candidates(B, B.map.river ? ['ford', 'bridge'] : ['road']).length > 0;
  if (k === 'storm') return !B.storm && (B.nStorms || 0) < 2;
  return true;
}
// pick the busiest of the candidate roads now and then, so events land where they matter
function pickEdge(B, list) {
  if (B.r() < 0.5) return list[Math.floor(B.r() * list.length)];
  const M = B.map; let best = list[0], bn = -1;
  for (const e of list) { let n = 0; for (let i = 0; i < B.soldiers.length; i += 7) { const s = B.soldiers[i]; if (s.alive && !s.fled && segDist(M, e, s.x, s.y) < e.w / 2) n++; } if (n > bn) { bn = n; best = e; } }
  return best;
}
function startEvent(B, kind) {
  const M = B.map; const mid = e => ({ x: (M.nodes[e.a].x + M.nodes[e.b].x) / 2, y: (M.nodes[e.a].y + M.nodes[e.b].y) / 2 });
  const warn = (e, text, at, go) => { const m = mid(e); B.warns.push({ e, x: m.x, y: m.y, at: B.t + at, kind, go }); B.log(text, null, 'warn'); };
  if (kind === 'landslide') { const e = pickEdge(B, candidates(B, ['pass', 'road'])); warn(e, `The ground rumbles above ${edgeName(B, e)}…`, 5, () => canClose(B, e) && closeEdge(B, e, 'slide', `A landslide buries ${edgeName(B, e)}! That way is closed.`)); }
  if (kind === 'bridge') { const e = pickEdge(B, candidates(B, ['bridge'])); warn(e, `${edgeName(B, e)[0].toUpperCase() + edgeName(B, e).slice(1)} groans under the weight…`, 4, () => canClose(B, e) && closeEdge(B, e, 'bridge', `${edgeName(B, e)[0].toUpperCase() + edgeName(B, e).slice(1)} collapses into the river!`)); }
  if (kind === 'flood') { const e = pickEdge(B, candidates(B, M.river ? ['ford', 'bridge'] : ['road'])); warn(e, `The water is rising near ${edgeName(B, e)}…`, 5, () => canClose(B, e) && closeEdge(B, e, 'flood', `Flood! ${edgeName(B, e)[0].toUpperCase() + edgeName(B, e).slice(1)} is under water for a while.`, null, 50)); }
  if (kind === 'wildfire') {
    const e = pickEdge(B, M.edges.filter(x => x.open && x.kind === 'road')); if (!e) return; const m = mid(e);
    B.warns.push({ e: null, x: m.x, y: m.y, at: B.t + 3, kind, go: () => { B.hazards.push({ x: m.x, y: m.y, r: 150, end: B.t + 35, kind: 'wildfire' }); B.log(`Wildfire sweeps out of the woods onto ${edgeName(B, e)}!`, null, 'strat'); } });
    B.log(`Smoke rises from the woods by ${edgeName(B, e)}…`, null, 'warn');
  }
  if (kind === 'storm') { B.nStorms = (B.nStorms || 0) + 1; B.storm = { end: B.t + 45 }; B.log('A storm breaks over the field: arrows fly short and fire will not take.', null, 'strat'); }
}

// ---------- the CPU general's hand ----------
export function aiCards(B, side) {
  const st = side.ai; const keep = st === 'cautious' ? 3 : st === 'reckless' ? 0 : 1; // command points held back for emergencies
  const mine = B.divisions.filter(d => d.side === side.index && !d.garrison && B.aliveCount(d) > 0);
  const foes = B.divisions.filter(d => d.side !== side.index && !d.routed && !d.dormant && B.aliveCount(d) > 0);
  const tryPlay = (id, target) => { const slot = side.hand.indexOf(id); return slot >= 0 && !playCard(B, side.index, slot, target); };
  // emergencies first
  if (mine.some(d => d.routed && B.aliveCount(d) > d.start * 0.3) || (mine.length && mine.reduce((a, d) => a + d.morale, 0) / mine.length < 35)) if (tryPlay('rally')) return;
  const hard = mine.find(d => !d.routed && d.inCombat && d.morale < 50); if (hard && tryPlay('wall', hard.id)) return;
  if (side.cp - keep < 3) return;
  if (B.r() < 0.4) for (const f of foes) { const c = f.c || B.centroid(f); if (B.aliveCount(f) < 80) continue; const ownNear = B.soldiers.some(s => s.side === side.index && s.alive && !s.fled && (s.x - c.x) ** 2 + (s.y - c.y) ** 2 < 120 * 120); if (!ownNear && tryPlay('fire', { x: c.x, y: c.y })) return; }
  const engaged = foes.find(f => f.inCombat && !f.garrison && f.morale < 55); if (engaged && B.r() < 0.4 && tryPlay('discord', engaged.id)) return;
  if (B.map && side.cp - keep >= 5 && B.r() < 0.35) { // drop a road on enemies marching down it, if none of ours are there
    const M = B.map;
    for (const id of ['burn', 'rockfall']) { if (!side.hand.includes(id)) continue; const kinds = CARDS[id].target.slice(5).split(',');
      for (const e of M.edges) { if (!e.open || !kinds.includes(e.kind) || M.camps.includes(e.a) || M.camps.includes(e.b)) continue; let them = 0, us = 0; for (let i = 0; i < B.soldiers.length; i += 3) { const s = B.soldiers[i]; if (!s.alive || s.fled || s.div.garrison || segDist(M, e, s.x, s.y) > e.w / 2 || B.bases.some(b => (s.x - b.x) ** 2 + (s.y - b.y) ** 2 < (b.r + 40) ** 2)) continue; if (s.side === side.index) us++; else them++; } if (them > 25 && us === 0 && tryPlay(id, e.id)) return; } }
  }
  const mover = mine.find(d => !d.routed && !d.reserve && !d.inCombat && d.state !== 'hold'); if (mover && B.t < 90 && B.r() < 0.2 && tryPlay('march', mover.id)) return;
  if (side.cp >= 8 && tryPlay('relief')) return;
}
