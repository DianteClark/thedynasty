// The Dynasty — living world simulation.
// Runs month by month. Everything that happens is written to the Chronicle.
import { CULTURES, DYNASTY_PARTS, DYNASTY_SUFFIX, cultureById } from './names.js';
import { Battle, UNITS, layoutBases, fieldFor, BASE_LAYOUTS, BASE_CAPS } from './battle.js';
import { buildGeo, buildTerritory, landAt, advance, tripMonths, beastName } from './geo.js';
import { installKnowledge } from './know.js';
import { installCourt, COURT_ACTS, HANDLERS } from './court.js';
import { installEvents, resolveEvent } from './events.js';
import { installCeremonies, resolveCeremony } from './ceremonies.js';
import { installDiplomacy, resolveDiplomacy } from './diplomacy.js';

// ---------- Seeded random ----------
function hashStr(s) { let h = 1779033703 ^ s.length; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return h >>> 0; }
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export const SIZES = {
  small: { w: 96, h: 64, setts: 70, conts: 2, isles: 6, label: 'Small' },
  large: { w: 140, h: 92, setts: 140, conts: 3, isles: 10, label: 'Large' },
  enormous: { w: 180, h: 120, setts: 220, conts: 4, isles: 16, label: 'Enormous' },
};
// how far things move in a month, in map cells
export const MOVE = { land: 13, sea: 30 };

export const SEASONS = ['Winter', 'Winter', 'Spring', 'Spring', 'Spring', 'Summer', 'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn', 'Winter'];
export const MONTHS = ['Deepfrost', 'Thawmonth', 'Seedtime', 'Rainmonth', 'Bloomtide', 'Highsun', 'Goldmonth', 'Harvestide', 'Reaping', 'Leaffall', 'Mistmonth', 'Longnight'];
const GUARD = { Light: { catch: 0.25, unrest: 0, cost: 0 }, Watchful: { catch: 0.45, unrest: 0.15, cost: 2 }, 'Locked Down': { catch: 0.7, unrest: 0.6, cost: 6 } };
const TROOP_TIERS = ['Levies', 'Regulars', 'Veterans', 'Elite'];
// Every monster here has a sprite in the HAS pack (wildlife sheet, boss sheets, elementals).
const MONSTERS = [
  { key: 'wolves', horde: 'A great wolf pack', the: 'the wolf pack', power: 1, biomes: ['forest', 'plains', 'tundra'], tame: true },
  { key: 'boars', horde: 'A herd of giant boars', the: 'the giant boars', power: 1.2, biomes: ['forest', 'plains'], tame: true },
  { key: 'serpents', horde: 'A nest of venom serpents', the: 'the serpent nest', power: 1, biomes: ['swamp', 'wasteland'], tame: false },
  { key: 'bloodbloom', horde: 'A patch of man-eating bloodblooms', the: 'the bloodblooms', power: 1.8, biomes: ['forest', 'swamp'], tame: false },
  { key: 'panther', horde: 'A shadow panther', the: 'the shadow panther', power: 2, biomes: ['forest'], tame: true },
  { key: 'hag', horde: 'A night hag', the: 'the night hag', power: 2.2, biomes: ['swamp', 'tundra'], tame: false },
  { key: 'hydra', horde: 'A two-headed hydra', the: 'the two-headed hydra', power: 2.4, biomes: ['swamp'], tame: false },
  { key: 'lurker', horde: 'The mire lurker', the: 'the mire lurker', power: 2.6, biomes: ['swamp'], tame: false },
  { key: 'basilisk', horde: 'A basilisk', the: 'the basilisk', power: 2.6, biomes: ['wasteland', 'mountain'], tame: true },
  { key: 'pale', horde: 'A pale horror', the: 'the pale horror', power: 2.8, biomes: ['tundra'], tame: false },
  { key: 'eye', horde: 'An eye horror', the: 'the eye horror', power: 3.2, biomes: ['mountain'], tame: false },
  { key: 'fire', horde: 'A fire elemental rift', the: 'the fire rift', power: 2.4, biomes: ['wasteland'], tame: false, rift: true },
  { key: 'ice', horde: 'An ice elemental rift', the: 'the ice rift', power: 2.4, biomes: ['tundra'], tame: false, rift: true },
  { key: 'earth', horde: 'An earth elemental rift', the: 'the earth rift', power: 2.4, biomes: ['mountain'], tame: false, rift: true },
  { key: 'storm', horde: 'A storm elemental rift', the: 'the storm rift', power: 2.4, biomes: ['plains'], tame: false, rift: true },
  { key: 'water', horde: 'A water elemental rift', the: 'the water rift', power: 2.2, biomes: ['swamp'], tame: false, rift: true },
  { key: 'void', horde: 'A void rift', the: 'the void rift', power: 3.4, biomes: ['wasteland', 'tundra', 'mountain'], tame: false, rift: true },
  { key: 'dragon', horde: 'The red dragon', the: 'the red dragon', power: 5, biomes: ['mountain'], tame: false },
];
const MON = Object.fromEntries(MONSTERS.map(m => [m.key, m]));

const TRAITS = ['ambitious', 'honorable', 'greedy', 'reckless', 'cautious', 'cruel', 'kind', 'loyal', 'deceitful', 'brave', 'content'];
const OPPOSITE = { ambitious: 'content', content: 'ambitious', honorable: 'deceitful', deceitful: 'honorable', reckless: 'cautious', cautious: 'reckless', cruel: 'kind', kind: 'cruel' };

// Mods can rename cultures and change their name pools, and tune how often things happen.
const ORIGINAL = JSON.parse(JSON.stringify(CULTURES));
export function applyMod(mod) {
  CULTURES.forEach((c, i) => Object.assign(c, JSON.parse(JSON.stringify(ORIGINAL[i]))));
  if (!mod || !mod.cultures) return;
  for (const [id, over] of Object.entries(mod.cultures)) {
    const c = CULTURES.find(x => x.id === id); if (!c || typeof over !== 'object') continue;
    for (const k of ['name', 'race', 'color']) if (typeof over[k] === 'string') c[k] = over[k].slice(0, 30);
    for (const k of ['m', 'f', 'me', 'fe', 'p1', 'p2']) if (Array.isArray(over[k]) && over[k].length) c[k] = over[k].filter(x => typeof x === 'string').map(x => x.slice(0, 16)).slice(0, 60);
  }
}

export class World {
  constructor(seed = 'dynasty', size = 'large', mod = null) {
    this.mod = mod || null;
    this.tune = { war: 1, monsters: 1, famine: 1, plots: 1, tournaments: 1, ...(mod && mod.tune || {}) };
    applyMod(mod);
    this.seed = String(seed);
    this.size = SIZES[size] ? size : 'large';
    this.rs = hashStr(this.seed + '|' + this.size) | 0;
    this.year = 1; this.month = 0;
    this.nextId = 1;
    this.chars = new Map();
    this.realms = new Map();
    this.setts = [];
    this.lairs = [];
    this.wars = [];
    this.mercs = [];
    this.chronicle = [];
    this.unique = { strongest: null };
    this.playerId = null; this.actions = []; this.line = []; this.plots = []; this.gameOver = null; this.mode = 'ironman'; this.spared = false; this.battleLog = {}; this.replayLog = null; this.replaying = false;
    this.stats = { battles: 0, wars: 0, uprisings: 0, assassinations: 0, foiled: 0, duels: 0, famines: 0, outbreaks: 0, destroyed: 0, realmsFallen: 0, realmsRisen: 0, marriages: 0, births: 0, deaths: 0, tournaments: 0, defections: 0, spies: 0 };
    this.generate();
  }

  // ---------- random helpers ----------
  r() { let a = this.rs = (this.rs + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  ri(a, b) { return a + Math.floor(this.r() * (b - a + 1)); }
  chance(p) { return this.r() < p; }
  pick(a) { return a[Math.floor(this.r() * a.length)]; }
  shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  id() { return this.nextId++; }
  get season() { return SEASONS[this.month]; }
  dateLabel() { return `${MONTHS[this.month]}, Year ${this.year}`; }

  // ---------- generation ----------
  generate() {
    const { w, h } = SIZES[this.size];
    this.w = w; this.h = h;
    const noise = (scale) => {
      const gw = Math.ceil(w / scale) + 2, gh = Math.ceil(h / scale) + 2;
      const g = Array.from({ length: gh }, () => Array.from({ length: gw }, () => this.r()));
      return (x, y) => {
        const fx = x / scale, fy = y / scale, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
        const s = t => t * t * (3 - 2 * t);
        const a = g[y0][x0] + (g[y0][x0 + 1] - g[y0][x0]) * s(tx);
        const b = g[y0 + 1][x0] + (g[y0 + 1][x0 + 1] - g[y0 + 1][x0]) * s(tx);
        return a + (b - a) * s(ty);
      };
    };
    const S = SIZES[this.size];
    const e2 = noise(5), e3 = noise(2.5), m1 = noise(14), m2 = noise(5), wx = noise(12), wy = noise(12), ridge = noise(7), lat = noise(10);
    // continents: big warped ellipses spread over the map; islands: small ones in the gaps
    const blobs = [];
    const fits = (x, y, r, k = 1.15) => blobs.every(b => Math.hypot(b.x - x, b.y - y) > (b.r + r) * k);
    const contR = Math.sqrt(w * h * 0.3 / S.conts / Math.PI);
    for (let i = 0, tries = 0; i < S.conts && tries < 400; tries++) {
      const r = contR * (0.8 + this.r() * 0.4), x = r * 0.85 + this.r() * (w - r * 1.7), y = r * 0.7 + this.r() * (h - r * 1.4);
      if (fits(x, y, r, tries > 250 ? 0.95 : 1.2) || tries > 380) { blobs.push({ x, y, r, sx: 1 + this.r() * 0.5, sy: 0.75 + this.r() * 0.3 }); i++; }
    }
    for (let i = 0, tries = 0; i < S.isles && tries < 600; tries++) {
      const r = 2.5 + this.r() * 4.5, x = 6 + this.r() * (w - 12), y = 6 + this.r() * (h - 12);
      if (fits(x, y, r + 2, 1)) { blobs.push({ x, y, r, sx: 1, sy: 1, isle: true }); i++; }
    }
    this.grid = [];
    for (let y = 0; y < h; y++) {
      const row = [];
      for (let x = 0; x < w; x++) {
        const qx = x + (wx(x, y) - 0.5) * 22, qy = y + (wy(x, y) - 0.5) * 22;
        let e = 0;
        for (const B of blobs) { const d = Math.hypot((qx - B.x) / B.sx, (qy - B.y) / B.sy) / B.r; e = Math.max(e, 1 - d); }
        e += (e2(x, y) - 0.5) * 0.35 + (e3(x, y) - 0.5) * 0.12;
        const edge = Math.min(x, y, w - 1 - x, h - 1 - y); if (edge < 3) e -= (3 - edge) * 0.3;
        const m = m1(x, y) * 0.7 + m2(x, y) * 0.3;
        const ly = y / h + (lat(x, y) - 0.5) * 0.08;
        let b;
        if (e < 0.08) b = 'water';
        else if (e > 0.42 && ridge(x, y) > 0.6) b = 'mountain';
        else if (ly < 0.13 || ly > 0.93) b = 'tundra';
        else if (m > 0.6 && e < 0.32) b = 'swamp';
        else if (m < 0.36 && ly > 0.45) b = 'wasteland';
        else if (m < 0.3) b = 'wasteland';
        else if (m > 0.5) b = 'forest';
        else b = 'plains';
        row.push(b);
      }
      this.grid.push(row);
    }
    this.setts = [];
    buildGeo(this, false);
    // Culture homelands, spread out so continents feel different
    const land = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (this.grid[y][x] !== 'water') land.push({ x, y, l: this.landId[y * w + x] });
    const mainLand = land.filter(p => this.lands[p.l - 1].kind === 'continent');
    const centers = [];
    for (const c of this.shuffle([...CULTURES])) {
      let fitsC = mainLand.filter(p => c.home.includes(this.grid[p.y][p.x])); if (!fitsC.length) fitsC = mainLand.length ? mainLand : land;
      let best = null, bs = -1;
      for (let k = 0; k < 40; k++) { const p = this.pick(fitsC); const sc = centers.length ? Math.min(...centers.map(cc => Math.hypot(cc.x - p.x, cc.y - p.y))) : 0; if (sc > bs) { bs = sc; best = p; } }
      centers.push({ c, x: best.x, y: best.y, l: best.l });
    }
    const cultureAt = (x, y) => {
      const l = this.landId[y * w + x]; const pool = centers.some(cc => cc.l === l) ? centers.filter(cc => cc.l === l) : centers;
      let best = null, bd = 1e9;
      for (const cc of pool) { const d = (cc.x - x) ** 2 + (cc.y - y) ** 2 - (cc.c.home.includes(this.grid[y][x]) ? 60 : 0); if (d < bd) { bd = d; best = cc.c; } }
      return best;
    };
    // Settlements
    const target = SIZES[this.size].setts;
    const spots = this.shuffle(land.filter(p => this.lands[p.l - 1].size >= 12 && (this.grid[p.y][p.x] !== 'mountain' || this.chance(0.25))));
    const minD = Math.max(3, Math.sqrt(land.length / target) * 0.8);
    // every island big enough to live on gets at least one village
    for (const L of this.lands.filter(L => L.kind === 'island')) { const i = spots.findIndex(p => p.l === L.id); if (i > 0) spots.unshift(spots.splice(i, 1)[0]); }
    for (const p of spots) {
      if (this.setts.length >= target) break;
      if (this.setts.some(s => (s.x - p.x) ** 2 + (s.y - p.y) ** 2 < minD * minD)) continue;
      const cul = cultureAt(p.x, p.y);
      this.setts.push({
        id: this.id(), name: this.placeName(cul), x: p.x, y: p.y, biome: this.grid[p.y][p.x], culture: cul.id,
        pop: this.ri(150, 700), food: this.ri(60, 160), unrest: this.ri(0, 20), realmId: null, destroyed: false, famine: false,
        guard: 'Light', headmanId: null,
      });
    }
    buildGeo(this, true); buildTerritory(this);
    // Monster lairs in wild places, mostly inside the named wilds
    const wild = land.filter(p => ['forest', 'swamp', 'mountain', 'tundra', 'wasteland'].includes(this.grid[p.y][p.x]) && !this.setts.some(s => (s.x - p.x) ** 2 + (s.y - p.y) ** 2 < 9) && (this.wildId[p.y * w + p.x] || this.chance(0.3)));
    const lairCount = Math.round(target / 5);
    const peaks = wild.filter(p => this.grid[p.y][p.x] === 'mountain'); if (peaks.length) wild.unshift(this.pick(peaks));
    for (let i = 0; i < lairCount && wild.length; i++) {
      const p = i === 0 ? wild[0] : this.pick(wild);
      const b = this.grid[p.y][p.x];
      const opts = MONSTERS.filter(m => m.key !== 'dragon' && m.biomes.includes(b));
      const m = i === 0 ? MON.dragon : this.pick(opts.length ? opts : [MON.wolves]);
      this.lairs.push(this.newLair(p, m, this.ri(10, 30)));
    }
    // unexplored caves in the mountains and badlands: quiet now, but things live in the dark
    const deep = wild.filter(p => this.grid[p.y][p.x] === 'mountain' || this.grid[p.y][p.x] === 'wasteland');
    for (let i = 0; i < Math.round(target / 18) && deep.length; i++) { const p = this.pick(deep); const opts = MONSTERS.filter(m => m.key !== 'dragon' && !m.rift && m.biomes.includes(this.grid[p.y][p.x])); this.lairs.push({ ...this.newLair(p, this.pick(opts.length ? opts : [MON.basilisk]), this.ri(2, 8)), cave: true }); }
    // Realms: capitals grab nearby settlements
    const nCap = Math.max(3, Math.round(target / 10));
    const caps = [];
    for (const s of this.shuffle([...this.setts])) {
      if (caps.length >= nCap) break;
      if (caps.some(c => (c.x - s.x) ** 2 + (c.y - s.y) ** 2 < (w * h) / nCap / 2)) continue;
      caps.push(s);
    }
    const R = Math.sqrt((w * h) / nCap) * 0.55;
    for (const cap of caps) {
      cap.pop += 900;
      const realm = this.makeRealm(cap, null);
      for (const s of this.setts) {
        if (s.realmId || this.dist(s, cap) > R) continue;
        const nearest = caps.reduce((a, c) => (this.dist(s, c) < this.dist(s, a) ? c : a));
        if (this.landId[s.y * w + s.x] !== this.landId[cap.y * w + cap.x]) continue;
        if (nearest === cap) this.joinRealm(s, realm);
      }
    }
    // Independent villages
    for (const s of this.setts) if (!s.realmId) this.makeRealm(s, null);
    for (const realm of this.realms.values()) this.populateRealm(realm);
    this.initDefences();
    // Vagabonds, bandits
    const vagCount = Math.round(target * 0.45);
    for (let i = 0; i < vagCount; i++) {
      const s = this.pick(this.setts);
      const c = this.makeChar({ culture: s.culture, age: this.ri(17, 40), role: this.chance(0.3) ? 'bandit' : 'vagabond' });
      c.settId = s.id; c.x = s.x; c.y = s.y;
      if (c.role === 'bandit') { c.band = this.ri(10, 40); c.fame = this.ri(0, 10); }
    }
    // Mercenary companies
    for (let i = 0; i < Math.max(2, Math.round(target / 25)); i++) {
      const s = this.pick(this.setts);
      const cap = this.makeChar({ culture: s.culture, age: this.ri(25, 45), role: 'merc' });
      cap.settId = s.id;
      const name = `The ${this.pick(['Black', 'Crimson', 'Iron', 'Free', 'Grey', 'Golden', 'Broken'])} ${this.pick(['Company', 'Lances', 'Blades', 'Banners', 'Hounds', 'Shields'])}`;
      this.mercs.push({ id: this.id(), name, captainId: cap.id, size: this.ri(150, 400), level: this.ri(2, 5), employer: null, wage: 0, until: 0, faction: cap.culture, unit: this.pickUnit(cap, cap.culture) });
      cap.mercId = this.mercs[this.mercs.length - 1].id;
    }
    this.updateTiers(true);
    this.log(3, 'world', `The chronicle begins. ${this.realmList().filter(r => r.tier === 'Kingdom').length} kingdoms, ${this.realmList().filter(r => r.tier === 'Lordship').length} lordships and ${this.realmList().filter(r => r.tier === 'Village').length} free villages share the land.`, []);
  }

  // distance on the map; places across the sea count as much farther apart
  dist(a, b) { const d = Math.hypot(a.x - b.x, a.y - b.y); if (!this.landId) return d; const la = landAt(this, a), lb = landAt(this, b); return la && lb && la !== lb ? d + 30 : d; }
  newLair(p, m, strength) {
    const L = { id: this.id(), x: p.x, y: p.y, key: m.key, base: m.power, strength, alive: true, wild: this.wildId ? this.wildId[p.y * this.w + p.x] || 0 : 0 };
    if (m.power >= 2.4 && m.key !== 'dragon' && !m.rift && this.chance(0.6)) L.name = beastName(() => this.r());
    return L;
  }
  tripMonths(from, to) { return tripMonths(this, from, to, MOVE.land * 1.05 * (this.season === 'Winter' ? 0.75 : 1), MOVE.sea); }
  wildOf(p) { const id = this.wildId && this.wildId[Math.round(p.y) * this.w + Math.round(p.x)]; return id ? this.wilds[id - 1] : null; }
  lairName(L) { const M = MON[L.key]; const wd = L.wild && this.wilds[L.wild - 1]; return `${L.name ? `${L.name}, ${M.the}` : M.the}${wd ? ` of ${wd.name}` : ''}`; }
  landName(p) { const l = this.landId && landAt(this, p); return l ? this.lands[l - 1].name : ''; }
  placeName(cul) { let n; let guard = 0; do { n = this.pick(cul.p1) + this.pick(cul.p2); guard++; } while (this.setts.some(s => s.name === n) && guard < 20); return n; }
  personName(cul, female) { return female ? this.pick(cul.f) + this.pick(cul.fe) : this.pick(cul.m) + this.pick(cul.me); }
  dynastyName() { return this.pick(DYNASTY_PARTS) + this.pick(DYNASTY_SUFFIX); }
  sett(id) { return this.setts.find(s => s.id === id); }
  realm(id) { return this.realms.get(id); }
  char(id) { return this.chars.get(id); }
  realmList() { return [...this.realms.values()].filter(r => r.alive); }
  living() { return [...this.chars.values()].filter(c => c.alive); }
  age(c) { return this.year - c.born; }
  realmSetts(r) { return [...r.setts].map(id => this.sett(id)).filter(s => s && !s.destroyed); }
  realmPop(r) { return this.realmSetts(r).reduce((a, s) => a + s.pop, 0); }
  fullName(c) { if (!c) return 'someone'; const t = c.titles.rep ? ` ${c.titles.rep}` : ''; return `${c.name}${c.dynasty ? ' ' + c.dynasty : ''}${t}`; }
  rulerTitle(r, c) {
    const f = c && c.female;
    return r.tier === 'Kingdom' ? (f ? 'Queen' : 'King') : r.tier === 'Lordship' ? (f ? 'Lady' : 'Lord') : (f ? 'Headwoman' : 'Headman');
  }

  makeRealm(capital, rulerId) {
    const cul = cultureById(capital.culture);
    const r = { id: this.id(), name: capital.name, capital: capital.id, setts: new Set(), rulerId, heirId: null, culture: cul.id, color: this.realmColor(cul.color),
      treasury: this.ri(40, 150), tier: 'Village', alive: true, founded: this.year, dynasty: null, allies: new Set(), truce: new Map(), mercs: [], fame: 0, aidGiven: 0, reserve: 0 };
    this.realms.set(r.id, r);
    this.joinRealm(capital, r);
    return r;
  }
  realmColor(base) {
    const n = parseInt(base.slice(1), 16); const j = () => this.ri(-40, 40);
    const c = [(n >> 16) + j(), ((n >> 8) & 255) + j(), (n & 255) + j()].map(v => Math.max(30, Math.min(230, v)));
    return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  }
  joinRealm(s, r) {
    if (s.realmId) { const old = this.realm(s.realmId); if (old) old.setts.delete(s.id); }
    s.realmId = r.id; r.setts.add(s.id);
  }
  populateRealm(r) {
    const cap = this.sett(r.capital);
    const cul = cultureById(r.culture);
    const dyn = this.dynastyName();
    r.dynasty = dyn;
    const ruler = this.makeChar({ culture: cul.id, age: this.ri(28, 55), role: 'ruler', dynasty: dyn, noble: true });
    ruler.realmId = r.id; ruler.settId = cap.id; r.rulerId = ruler.id;
    if (this.chance(0.75)) {
      const sp = this.makeChar({ culture: cul.id, age: Math.max(18, this.age(ruler) + this.ri(-8, 4)), female: !ruler.female, role: 'courtier', dynasty: this.dynastyName(), noble: true });
      this.marry(ruler, sp, true);
      const kids = this.ri(0, 3);
      for (let i = 0; i < kids; i++) {
        const k = this.makeChar({ culture: cul.id, age: this.ri(1, Math.max(1, this.age(ruler) - 18)), role: 'child', dynasty: dyn, noble: true });
        this.setParents(k, ruler, sp);
      }
    }
    const nOff = r.setts.size >= 3 ? this.ri(2, 4) : this.ri(0, 1);
    for (let i = 0; i < nOff; i++) this.addOfficer(r, this.makeChar({ culture: cul.id, age: this.ri(20, 50), role: 'officer', dynasty: this.dynastyName(), noble: true }));
    ruler.army = this.newArmy(ruler, r.setts.size >= 3 ? 1 : 0.35);
    this.pickHeir(r);
  }
  // ---------- 2.4 troop caps, the lord's reserve and garrisons ----------
  troopCap(c) { const r = this.realm(c.realmId); return Math.round((100 + c.stats.lea * 40 + (c.level - 1) * 30) * (r && r.tier === 'Village' ? 0.5 : 1)); }
  garrisonCap(s) { const r = this.realm(s.realmId); return Math.min(BASE_CAPS.main, Math.round(s.pop * (r && r.capital === s.id ? 0.8 : 0.5))); }
  reserveCap(r) { return r.tier === 'Village' ? 0 : Math.min(5000, Math.round(this.realmPop(r) * 0.06)); }
  initDefences() {
    for (const s of this.setts) if (s.garrison == null) s.garrison = s.destroyed ? 0 : Math.round(this.garrisonCap(s) * (0.2 + this.r() * 0.3));
    for (const r of this.realms.values()) if (r.reserve == null) r.reserve = r.alive ? Math.round(this.reserveCap(r) * (0.2 + this.r() * 0.3)) : 0;
  }
  // AI lords put spare gold into walls and their own household troops
  investDefences(r) {
    if (r.treasury < 150) return;
    let gold = Math.min((r.treasury - 150) * 0.3, 200); if (gold <= 0) return;
    const roomR = Math.max(0, this.reserveCap(r) - r.reserve);
    const toR = Math.min(roomR, Math.round(gold * 2 * 0.5)); r.reserve += toR; r.treasury -= toR / 2; gold -= toR / 2;
    // the holding nearest a rival gets the walls
    const foes = this.neighbours(r); const mine = this.realmSetts(r);
    const exposed = mine.slice().sort((a, b) => Math.min(...foes.flatMap(o => this.realmSetts(o).map(x => this.dist(x, a))), 99) - Math.min(...foes.flatMap(o => this.realmSetts(o).map(x => this.dist(x, b))), 99))[0];
    if (exposed && gold > 0) { const n = Math.min(Math.round(gold * 3), this.garrisonCap(exposed) - exposed.garrison); if (n > 0) { exposed.garrison += n; r.treasury -= n / 3; } }
  }
  newArmy(c, scale = 1, faction = c.culture) { return { size: Math.round((80 + c.stats.lea * 18) * scale), level: this.ri(1, 3), xp: 0, wins: 0, losses: 0, faction, unit: this.pickUnit(c, faction) }; }
  pickUnit(c, faction) {
    // officers raise troops that suit them: leaders ride, thinkers shoot or cast, fighters hold the line
    const units = UNITS[faction].map((u, i) => ({ ...u, i })).filter(u => u.entry);
    const s = c.stats; const pref = s.lea >= s.mig && s.lea >= s.int ? ['cav', 'flyer'] : s.int > s.mig ? ['ranged', 'magic'] : ['inf', 'heavy'];
    const fit = units.filter(u => pref.includes(u.role));
    return this.pick(fit.length ? fit : units).i;
  }
  pickUnitView(c, faction = c.culture) {
    const units = UNITS[faction].map((u, i) => ({ ...u, i })).filter(u => u.entry);
    const s = c.stats; const pref = s.lea >= s.mig && s.lea >= s.int ? ['cav', 'flyer'] : s.int > s.mig ? ['ranged', 'magic'] : ['inf', 'heavy'];
    return (units.find(u => pref.includes(u.role)) || units[0]).i;
  }
  unitName(a) { return a && a.faction && UNITS[a.faction][a.unit] ? UNITS[a.faction][a.unit].name : 'troops'; }
  plural(n) {
    if (/Shaman$/.test(n)) return n + 's';
    if (/man$/.test(n)) return n.replace(/man$/, 'men');
    if (/(Deer|Djinn|Naga)$/.test(n)) return n;
    if (/Dwarf$/.test(n)) return n.replace(/Dwarf$/, 'Dwarves');
    if (/[^aeiou]y$/.test(n)) return n.slice(0, -1) + 'ies';
    if (/(ch|sh|s|x)$/.test(n)) return n + 'es';
    return n + 's';
  }
  addOfficer(r, c) {
    c.role = 'officer'; c.realmId = r.id; c.liegeId = r.rulerId; c.settId = r.capital; c.loyalty = this.ri(45, 85);
    if (!c.army) c.army = this.newArmy(c, r.tier === 'Village' ? 0.4 : 1);
    const ruler = this.char(r.rulerId); if (ruler) this.opine(c, ruler, this.ri(10, 40));
  }
  makeChar({ culture, age, role, dynasty = null, female, noble = false }) {
    const cul = cultureById(culture);
    const fem = female ?? this.chance(0.45);
    const st = () => this.ri(2, 12) + (this.chance(0.12) ? this.ri(3, 7) : 0);
    const traits = [];
    while (traits.length < 2) { const t = this.pick(TRAITS); if (!traits.includes(t) && !traits.includes(OPPOSITE[t])) traits.push(t); }
    const c = {
      id: this.id(), name: this.personName(cul, fem), female: fem, culture, dynasty, noble, born: this.year - age, alive: true, died: null, cause: null,
      stats: { lea: st(), mig: st(), int: st(), pol: st(), cha: st() }, traits, titles: { rank: null, deed: null, rep: null },
      role, realmId: null, settId: null, liegeId: null, spouseId: null, parents: [], children: [], fame: 0, rel: {}, loyalty: 60, oath: [],
      level: 1, xp: 0, army: null, wardOf: null, prisonerOf: null, wounded: 0, rumors: {}, log: [], heirDesignate: null, x: 0, y: 0, kills: 0, duelWins: 0, aid: 0,
    };
    this.chars.set(c.id, c);
    return c;
  }
  setParents(k, a, b) { k.parents = [a.id, b.id]; a.children.push(k.id); b.children.push(k.id); k.realmId = a.realmId; k.settId = a.settId; }
  opine(a, b, d) { a.rel[b.id] = Math.max(-100, Math.min(100, (a.rel[b.id] || 0) + d)); }
  op(a, b) { return a.rel[b.id] || 0; }
  has(c, t) { return c.traits.includes(t); }
  power(c) { return c.army ? c.army.size * (1 + 0.12 * (c.army.level - 1)) * (1 + 0.03 * c.stats.lea) : 0; }
  troopTier(a) { return TROOP_TIERS[Math.min(3, Math.floor((a.level - 1) / 3))]; }

  // ---------- chronicle ----------
  log(importance, type, text, ids) {
    const e = { y: this.year, m: this.month, importance, type, text, ids };
    if (this.recentDuels && this.recentDuels.length) { e.duels = this.recentDuels; this.recentDuels = []; }
    this.chronicle.push(e);
    for (const id of ids) { const c = this.char(id); if (c) c.log.push(this.chronicle.length - 1); }
    if (this.kn) this.hear(e);
  }

  // ---------- main loop ----------
  tick() {
    // where every mover was at the start of the month, so the map can glide them along in real time
    const prev = this._prev = new Map();
    for (const w of this.wars) if (w.march) prev.set('w' + w.id, [w.march.x, w.march.y]);
    for (const a of this.agents || []) prev.set('a' + a.id, [a.x, a.y]);
    const P = this.player; if (P) prev.set('p' + P.id, [P.x, P.y]);
    this.month++;
    if (this.month >= 12) { this.month = 0; this.year++; this.yearly(); }
    this.economy();
    this.unrestAndUprisings();
    this.monsters();
    this.worldEvents();
    this.outlaws();
    this.warfare();
    this.intrigue();
    this.caravans();
    this.agentsTick();
    this.playerTick();
    this.monthlyLife();
    if (this.kn) this.knowledgeTick();
    if (this.playerId) { this.jobsTick(); this.ceremoniesTick(); this.councilTick(); this.missionsTick(); this.eventsTick(); this.decisionsTick(); }
    if (this.month === 4) this.planTournaments();
    if (this.month === 6) this.tournaments();
    if (this.month % 3 === 0) this.updateTiers();
    if (this.pendingBattle && this.pendingBattle.replay) {
      // a battle you watched or fought: fight it again, step for step, so the world stays the same
      const ctx = this.pendingBattle; this.pendingBattle = null;
      this.finishBattle(ctx, this.runChoice(ctx, ctx.choice), ctx.choice);
    }
  }
  runYears(n) { for (let i = 0; i < n * 12; i++) this.tick(); }

  // ---------- economy, seasons, famine ----------
  economy() {
    const harvest = this.month === 8;
    const drought = harvest && this.chance(Math.min(0.95, 0.4 * this.tune.famine)) ? { x: this.ri(0, this.w), y: this.ri(0, this.h), r: this.ri(5, 11) } : null;
    const yieldOf = { plains: 1.3, forest: 1.1, swamp: 1.0, wasteland: 0.85, tundra: 0.85, mountain: 0.85 };
    for (const s of this.setts) {
      if (s.destroyed) continue;
      s.food -= s.pop * 0.0105;
      if (harvest) {
        let y = yieldOf[s.biome] || 1;
        if (drought && this.dist(s, drought) < drought.r) y *= 0.3;
        s.food += s.pop * 0.17 * y * (0.7 + this.r() * 0.6);
      }
      const r = this.realm(s.realmId);
      if (s.food < 0) {
        if (!s.famine) {
          s.famine = true; this.stats.famines++;
          this.log(1, 'famine', `Famine strikes ${s.name}${r && r.setts.size > 1 ? ` in the realm of ${r.name}` : ''}. The granaries are empty.`, []);
        }
        s.pop = Math.max(20, Math.round(s.pop * 0.985)); s.unrest += 2; s.food = Math.max(s.food, -s.pop * 0.1);
      } else if (s.famine && s.food > s.pop * 0.05) { s.famine = false; s.aided = false; }
      else if (s.food > 0) {
        // the land can only feed so many: growth slows toward its capacity
        const r0 = this.realm(s.realmId); const cap = ({ plains: 2400, forest: 1700, swamp: 1300, wasteland: 1100, tundra: 1000, mountain: 1100 }[s.biome] || 1500) * (r0 && r0.capital === s.id ? 1.6 : 1);
        s.pop = Math.max(20, Math.round(s.pop * (1 + 0.0016 * (s.biome === 'plains' ? 1.3 : 1) * (1 - s.pop / cap))));
      }
      s.food = Math.min(s.food, s.pop * 0.45); // granaries only hold so much
      if (r) r.treasury += s.pop * 0.004 * (1 + ((this.steward(r) || this.char(r.rulerId))?.stats.pol || 5) / 20) * (r.tax === 'low' ? 0.6 : r.tax === 'high' ? 1.5 : 1) - GUARD[s.guard].cost * 0.2;
    }
    if (this.month % 2 === 1) for (const r of this.realmList()) this.stewardWork(r);
    // Food aid to starving neighbours
    if (this.month % 2 === 0) {
      for (const s of this.setts.filter(s => s.famine && !s.destroyed)) {
        const donors = this.realmList().filter(r => r.id !== s.realmId && r.treasury > 80 && this.realmSetts(r).some(x => this.dist(x, s) < 8));
        for (const r of this.shuffle(donors)) {
          const ruler = this.char(r.rulerId); if (!ruler || this.isPlayer(ruler) || this.has(ruler, 'greedy') || this.has(ruler, 'cruel')) continue;
          if (s.aided || !this.chance(this.has(ruler, 'kind') ? 0.3 : 0.08)) continue;
          s.aided = true;
          r.treasury -= 40; s.food += s.pop * 0.12; s.famine = false; s.unrest = Math.max(0, s.unrest - 20);
          ruler.aid++; ruler.fame += 3; r.aidGiven++;
          const owner = this.realm(s.realmId);
          if (owner && owner.setts.size === 1 && !this.isPlayer(this.char(owner.rulerId)) && this.chance(0.45)) {
            const oldRuler = this.char(owner.rulerId);
            this.log(2, 'aid', `${this.rulerTitle(r, ruler)} ${this.fullName(ruler)} of ${r.name} sends grain to starving ${s.name}. Grateful, the village pledges itself to ${r.name}.`, [ruler.id, oldRuler?.id].filter(Boolean));
            this.annexVillage(owner, r);
          } else {
            this.log(1, 'aid', `${this.fullName(ruler)} of ${r.name} sends grain to starving ${s.name}. Songs of their mercy spread.`, [ruler.id]);
            if (owner) { const or = this.char(owner.rulerId); if (or) this.opine(or, ruler, 15); }
          }
          this.spreadRumor(ruler, 'merciful', 1);
          break;
        }
      }
    }
  }

  annexVillage(village, into) {
    for (const sid of [...village.setts]) this.joinRealm(this.sett(sid), into);
    const old = this.char(village.rulerId);
    if (old && old.alive) {
      old.realmId = into.id;
      if (old.stats.lea + old.stats.mig > 14) this.addOfficer(into, old); else old.role = 'courtier';
    }
    this.killRealm(village, null);
  }

  killRealm(r, how) {
    r.alive = false; this.stats.realmsFallen += r.tier !== 'Village' ? 1 : 0;
    for (const w of this.wars) if (w.a === r.id || w.b === r.id) w.over = true;
    for (const c of this.living()) if (c.realmId === r.id && c.role !== 'officer' && c.role !== 'courtier') { /* stays */ }
    if (how) this.log(3, 'fall', how, []);
  }

  // ---------- unrest, overextension, uprisings ----------
  unrestAndUprisings() {
    for (const r of this.realmList()) {
      const ruler = this.char(r.rulerId);
      const cap = this.sett(r.capital);
      const setts = this.realmSetts(r);
      const limit = 4 + (ruler ? ruler.stats.pol / 3 : 2);
      const over = Math.max(0, setts.length - limit);
      for (const s of setts) {
        const d = cap ? this.dist(s, cap) : 0;
        let du = -0.8 + over * 0.08 * (1 + d / 20) + GUARD[s.guard].unrest;
        if (s.culture !== r.culture) du += 0.25;
        if (r.tax === 'low') du -= 0.25; else if (r.tax === 'high') du += 0.35;
        if (ruler && this.has(ruler, 'cruel')) du += 0.2;
        if (ruler && this.has(ruler, 'kind')) du -= 0.2;
        if (r.treasury < 0) du += 0.5;
        s.unrest = Math.max(0, Math.min(140, s.unrest + du));
        if (s.unrest > 100 && setts.length > 1 && s.id !== r.capital && this.chance(0.2)) this.uprising(s, r, over > 0);
      }
    }
  }

  uprising(s, r, overextended) {
    this.stats.uprisings++;
    let leader = this.living().find(c => (c.role === 'vagabond' || c.role === 'bandit') && !this.isPlayer(c) && !c.companionOf && this.dist(c, s) < 5 && c.fame > 8);
    if (!leader) leader = this.makeChar({ culture: s.culture, age: this.ri(22, 45), role: 'rebel' });
    const cause = s.famine ? 'hunger' : overextended ? 'neglect from a distant crown' : 'heavy taxes and harsh rule';
    const ruler = this.char(r.rulerId);
    const rebels = Math.round(s.pop * 0.25);
    const defenders = this.realmOfficers(r).filter(o => o.army && !o.prisonerOf);
    const def = defenders.length ? this.pick(defenders) : null;
    const defPow = def ? this.power(def) * (0.6 + this.r() * 0.6) : 0;
    const rebPow = rebels * (1 + leader.stats.lea * 0.04) * (0.6 + this.r() * 0.8);
    if (rebPow > defPow) {
      const nr = this.makeRealm(s, leader.id);
      nr.dynasty = leader.dynasty || this.dynastyName(); leader.dynasty = nr.dynasty;
      leader.role = 'ruler'; leader.realmId = nr.id; leader.settId = s.id; leader.fame += 15;
      leader.army = { size: Math.round(rebels * 0.6), level: 1, xp: 0, wins: 1, losses: 0, faction: leader.culture, unit: this.pickUnit(leader, leader.culture) };
      s.unrest = 20; this.stats.realmsRisen++;
      if (ruler) this.opine(leader, ruler, -60);
      this.log(3, 'uprising', `${s.name} rises in revolt over ${cause}. Led by ${this.fullName(leader)}${leader.role === 'ruler' && leader.fame > 20 ? ', a wanderer of some renown,' : ''}, the rebels ${def ? `rout ${this.fullName(def)} and ` : ''}throw off the rule of ${r.name}.`, [leader.id, def?.id, ruler?.id].filter(Boolean));
    } else {
      s.unrest = 35; s.pop = Math.round(s.pop * 0.85);
      if (def) { def.army.xp += 20; def.fame += 2; }
      if (ruler && this.has(ruler, 'cruel')) { this.spreadRumor(ruler, 'butcher', 2); }
      leader.alive = false; leader.died = this.year; leader.cause = 'executed after a failed revolt';
      this.log(2, 'uprising', `${s.name} revolts over ${cause}, but ${def ? this.fullName(def) : 'the garrison'} crushes the rising. ${this.fullName(leader)} is executed${ruler && this.has(ruler, 'cruel') ? ' and the village is put to the torch' : ''}.`, [leader.id, def?.id].filter(Boolean));
    }
  }

  // ---------- monsters ----------
  monsters() {
    for (const L of this.lairs) {
      if (!L.alive) continue;
      L.strength += this.r() * 0.6 * (this.season === 'Winter' ? 0.5 : 1) * this.tune.monsters;
      if (L.strength > 55 && this.chance(0.04)) {
        const targets = this.setts.filter(s => !s.destroyed && this.dist(s, L) < 9).sort((a, b) => this.dist(a, L) - this.dist(b, L));
        const s = targets[0]; if (!s) continue;
        this.stats.outbreaks++;
        const force = L.strength * L.base;
        const r = this.realm(s.realmId);
        if (force > 200 && s.pop < 500 && (!r || s.id !== r.capital || r.setts.size === 1) && this.chance(0.5)) {
          s.destroyed = true; s.pop = 0; this.stats.destroyed++;
          if (r) { r.setts.delete(s.id); if (r.setts.size === 0) this.killRealm(r, null); else if (r.capital === s.id) this.moveCapital(r); }
          const M = MON[L.key]; const wd = this.wildOf(L); this.log(3, 'monster', M.key === 'dragon' ? `The red dragon descends from ${wd ? wd.name : 'the peaks'} on ${s.name} and burns it to the ground. Only ash and bones remain.` : `${L.name ? L.name + ', ' + M.horde.toLowerCase().replace(/^(a|an|the) /, 'a ') + ',' : M.horde} ${M.rift ? 'tears open beside' : `pours out of ${wd ? wd.name : 'the wilds'} and falls upon`} ${s.name}, destroying it. Only ruins remain.`, []);
        } else {
          s.pop = Math.round(s.pop * (0.75 + this.r() * 0.15)); s.unrest += 15; s.food -= s.pop * 0.05;
          this.log(2, 'monster', `${L.name || MON[L.key].horde} ${L.cave ? 'crawls out of a cave and ravages' : 'ravages'} the lands around ${s.name}. The survivors beg for a champion.`, []);
        }
        L.strength *= 0.7;
      }
      // Heroes answer the call
      if (L.strength > 25 && this.chance(L.strength > 50 ? 0.06 : 0.03)) {
        const heroes = this.living().filter(c => ['vagabond', 'officer', 'merc'].includes(c.role) && !this.isPlayer(c) && !c.companionOf && !c.prisonerOf && this.age(c) >= 17 && this.dist(c, L) < 14 && c.stats.mig + c.stats.int > 12);
        if (!heroes.length) continue;
        const h = this.pick(heroes);
        const skill = h.stats.mig * 1.4 + h.stats.int * 0.6 + (h.army ? Math.sqrt(h.army.size) : 4) + this.r() * 25;
        const threat = L.strength * L.base * 0.35 + this.r() * 20;
        if (skill > threat) {
          const M = MON[L.key];
          const mode = M.tame && h.stats.cha > 12 && this.chance(0.3) ? 'tame' : !M.rift && M.key !== 'dragon' && h.stats.int > 11 && this.chance(0.35) ? 'trap' : 'slay';
          h.fame += Math.round(8 * L.base); this.gainXp(h, 40);
          let title = null;
          if (mode === 'tame') { title = 'Beast Tamer'; if (h.army) h.army.size += Math.round(30 * L.base); }
          else if (mode === 'trap') title = 'Trapper';
          else title = L.base >= 2.8 ? 'Giant Slayer' : 'Monster Slayer';
          if (M.key === 'dragon' && mode === 'slay') title = 'Dragonslayer';
          const got = this.grantDeed(h, title);
          L.alive = mode === 'trap' || mode === 'tame' ? false : false;
          const verb = mode === 'tame' ? `tames ${this.lairName(L)} and leads the beasts home to fight in their army` : mode === 'trap' ? `captures ${this.lairName(L)} alive in cunning snares` : M.rift ? `fights through the elementals and closes ${this.lairName(L)}` : `slays ${this.lairName(L)}`;
          this.log(L.base >= 2.8 ? 3 : 2, 'monster', `${this.fullName(h)} ${verb}.${got ? ` Bards now call them ${title}.` : ''}`, [h.id]);
          // a new lair may form somewhere later
          if (this.chance(0.6)) this.respawnLair(L);
        } else if (this.chance(0.5)) {
          this.die(h, `killed by ${this.lairName(L)}`);
          this.log(2, 'monster', `${this.fullName(h)} rides out to face ${this.lairName(L)} and does not return.`, [h.id]);
        } else {
          h.wounded = 6;
          this.log(1, 'monster', `${this.fullName(h)} is driven back, badly wounded, by ${this.lairName(L)}.`, [h.id]);
        }
      }
    }
  }
  // ---------- 2.1 the land itself: earthquakes, wildfires, floods ----------
  worldEvents() {
    const k = this.setts.length / 140; // bigger worlds see more of it
    const mi = this.year * 12 + this.month;
    const mark = (x, y, r, what) => { (this.changes || (this.changes = [])).push({ x, y, r, what, at: mi }); this.terrainRev = (this.terrainRev || 0) + 1; if (this.changes.length > 200) this.changes.shift(); if (this.known) this.refog(x, y, r, { earthquake: 'an earthquake', wildfire: 'a great wildfire', flood: 'floods' }[what]); };
    const live = this.setts.filter(s => !s.destroyed);
    // earthquake: a cave yawns open and something crawls out of it
    if (this.chance(0.012 * k)) {
      const s = this.pick(live); const wd = this.wildOf(s); const r = this.realm(s.realmId);
      s.pop = Math.round(s.pop * (0.85 + this.r() * 0.1)); s.unrest += 10;
      const spots = [];
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) { const x = s.x + dx, y = s.y + dy, b = this.grid[y]?.[x]; if (b && b !== 'water' && Math.abs(dx) + Math.abs(dy) > 2 && landAt(this, { x, y }) === landAt(this, s)) spots.push({ x, y, b }); }
      const p = spots.length ? this.pick(spots) : null;
      let cave = '';
      if (p && this.chance(0.7)) {
        const opts = MONSTERS.filter(m => m.key !== 'dragon' && !m.rift && m.biomes.includes(p.b === 'plains' ? 'forest' : p.b));
        const L = { ...this.newLair(p, this.pick(opts.length ? opts : [MON.wolves]), this.ri(12, 26)), cave: true };
        this.lairs.push(L); cave = ` A cave yawns open nearby. Out of it comes ${this.lairName(L)}.`;
      }
      mark(s.x, s.y, 5, 'earthquake');
      if (s.pop < 120 && this.chance(0.3)) this.wipeOut(s, `An earthquake levels ${s.name}${r && r.setts.size > 1 ? ` in ${r.name}` : ''}. Nothing is left standing.${cave}`);
      else this.log(2, 'quake', `The earth shakes around ${s.name}${wd ? ` near ${wd.name}` : ''}. Houses fall and people die.${cave}`, []);
    }
    // wildfire in a summer forest: the wood burns back to open land
    if (this.season === 'Summer' && this.chance(0.025 * k)) {
      const woods = this.wilds.filter(w => w.biome === 'forest' && w.size > 30);
      if (woods.length) {
        const wd = this.pick(woods); let burned = 0; const st = [[wd.x, wd.y]]; const seen = new Set();
        while (st.length && burned < this.ri(15, 45)) { const [x, y] = st.shift(); const key = y * this.w + x; if (seen.has(key)) continue; seen.add(key); if (this.grid[y]?.[x] !== 'forest') continue; this.grid[y][x] = 'plains'; burned++; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.chance(0.8)) st.push([x + dx, y + dy]); }
        if (burned) {
          mark(wd.x, wd.y, 5, 'wildfire');
          const hit = live.find(s => Math.hypot(s.x - wd.x, s.y - wd.y) < 4);
          if (hit && hit.pop < 250 && this.chance(0.35)) this.wipeOut(hit, `Wildfire sweeps out of ${wd.name} and burns ${hit.name} to the ground.`);
          else { if (hit) { hit.food -= hit.pop * 0.1; hit.unrest += 8; } this.log(2, 'fire', `Wildfire rages through ${wd.name}${hit ? `, and smoke hangs over ${hit.name}` : ''}. Much of the wood is ash.`, []); }
        }
      }
    }
    // spring floods on low ground by the sea
    if (this.season === 'Spring' && this.chance(0.02 * k)) {
      const coast = live.filter(s => s.port && (s.biome === 'plains' || s.biome === 'swamp'));
      if (coast.length) {
        const s = this.pick(coast); let n = 0;
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const x = s.x + dx, y = s.y + dy; if (this.grid[y]?.[x] === 'plains' && this.chance(0.45) && (dx || dy)) { this.grid[y][x] = 'swamp'; n++; } }
        mark(s.x, s.y, 4, 'flood');
        s.food -= s.pop * 0.15; s.unrest += 6;
        if (s.pop < 150 && this.chance(0.25)) this.wipeOut(s, `The sea rises and swallows ${s.name}. Only drowned fields remain.`);
        else this.log(2, 'flood', `Floods drown the fields around ${s.name}${n > 6 ? ', and the land turns to marsh' : ''}.`, []);
      }
    }
  }
  wipeOut(s, text) {
    const r = this.realm(s.realmId);
    s.destroyed = true; s.pop = 0; this.stats.destroyed++;
    if (r) { r.setts.delete(s.id); if (r.setts.size === 0) this.killRealm(r, null); else if (r.capital === s.id) this.moveCapital(r); }
    this.log(3, 'disaster', text, []);
  }
  respawnLair(L) {
    const land = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (['forest', 'swamp', 'mountain', 'tundra', 'wasteland'].includes(this.grid[y][x])) land.push({ x, y });
    const p = this.pick(land); const b = this.grid[p.y][p.x];
    const opts = MONSTERS.filter(m => m.key !== 'dragon' && m.biomes.includes(b)); const m = this.pick(opts.length ? opts : [MON.wolves]);
    this.lairs.push(this.newLair(p, m, 5));
  }

  // ---------- vagabonds, bandits, mercenaries ----------
  outlaws() {
    for (const c of this.living()) {
      if (c.prisonerOf) continue;
      if (c.wounded > 0) c.wounded--;
      if (this.isPlayer(c) || (c.companionOf && this.char(c.companionOf)?.alive && this.isPlayer(this.char(c.companionOf)))) continue;
      if (c.role === 'vagabond' || c.role === 'bandit') {
        // wander
        if (this.chance(0.3)) { const s = this.pick(this.setts.filter(s => !s.destroyed && this.dist(s, c) < 10) || this.setts); if (s) { c.x = s.x; c.y = s.y; c.settId = s.id; } }
      }
      if (c.role === 'bandit' && this.chance(0.05)) {
        const s = this.sett(c.settId); if (!s || s.destroyed) continue;
        const r = this.realm(s.realmId);
        s.food -= c.band * 0.8; s.unrest += 4; c.fame += 1; c.band += this.ri(0, 4);
        if (r && r.setts.size === 1 && c.band > 45 && this.chance(0.25) && s.id === r.capital) {
          const old = this.char(r.rulerId);
          if (old && old.alive) this.die(old, `slain by the bandit ${c.name}`);
          r.rulerId = c.id; c.role = 'ruler'; c.realmId = r.id; c.dynasty = c.dynasty || this.dynastyName(); r.dynasty = c.dynasty; c.army = { size: c.band * 2, level: 2, xp: 0, wins: 1, losses: 0, faction: c.culture, unit: this.pickUnit(c, c.culture) };
          this.stats.realmsRisen++;
          this.log(3, 'rise', `The bandit chief ${this.fullName(c)} storms ${s.name}, kills ${old ? this.fullName(old) : 'its headman'} and makes the village their own.`, [c.id, old?.id].filter(Boolean));
        } else if (this.chance(0.1)) this.log(1, 'bandit', `Bandits under ${this.fullName(c)} raid ${s.name}.`, [c.id]);
      }
      if (c.role === 'vagabond' && this.chance(0.008)) {
        // bandit-hunting contract
        const b = this.living().find(x => x.role === 'bandit' && this.dist(x, c) < 8);
        if (b) {
          const win = c.stats.mig + this.r() * 12 + c.fame * 0.1 > b.stats.mig * 0.6 + Math.sqrt(b.band) + this.r() * 12;
          if (win) { this.die(b, `hunted down by ${c.name}`); c.fame += 6; c.kills++; this.gainXp(c, 25); this.log(c.fame > 20 ? 2 : 1, 'contract', `${this.fullName(c)} takes a village's coin and hunts down the bandit ${this.fullName(b)}.`, [c.id, b.id]); }
          else if (this.chance(0.4)) { this.die(c, `killed by the bandit ${b.name}`); b.fame += 4; this.log(1, 'contract', `${this.fullName(c)} hunts the bandit ${this.fullName(b)} and is cut down.`, [c.id, b.id]); }
        }
      }
      // famous vagabond invited to lead or serve
      if (c.role === 'vagabond' && c.fame > 25 && this.chance(0.03)) {
        const s = this.sett(c.settId); const r = s && this.realm(s.realmId);
        if (r && r.tier !== 'Village' && this.realmOfficers(r).length < 2 + r.setts.size / 2) {
          this.addOfficer(r, c); c.army = this.newArmy(c, 0.7);
          this.log(2, 'rise', `The wanderer ${this.fullName(c)}, famed across the land, swears service to ${this.rulerTitle(r, this.char(r.rulerId))} ${this.fullName(this.char(r.rulerId))} of ${r.name}.`, [c.id, r.rulerId]);
        }
      }
    }
    // a vagabond can form a mercenary company
    // mercenary contracts expire
    for (const m of this.mercs) if (m.employer && (this.year * 12 + this.month) > m.until) { m.employer = null; }
  }

  // ---------- warfare ----------
  realmOfficers(r) { return this.living().filter(c => c.realmId === r.id && (c.role === 'officer' || c.role === 'ruler') && c.army && !c.prisonerOf && this.age(c) >= 16); }
  realmStrength(r) { return this.realmOfficers(r).reduce((a, c) => a + this.power(c), 0) + r.mercs.reduce((a, mid) => { const m = this.mercs.find(x => x.id === mid); return a + (m ? m.size * (1 + 0.12 * m.level) : 0); }, 0); }
  neighbours(r, range = 9) {
    const mine = this.realmSetts(r);
    return this.realmList().filter(o => o.id !== r.id && this.realmSetts(o).some(s => mine.some(m => this.dist(s, m) < range)));
  }
  atWar(a, b) { return this.wars.some(w => !w.over && ((w.a === a.id && w.b === b.id) || (w.a === b.id && w.b === a.id))); }

  warfare() {
    // declarations, checked monthly with low chance
    for (const r of this.shuffle(this.realmList())) {
      const ruler = this.char(r.rulerId); if (!ruler || ruler.prisonerOf || this.isPlayer(ruler)) continue;
      if (this.wars.some(w => !w.over && (w.a === r.id || w.b === r.id))) continue;
      const aggro = (this.has(ruler, 'ambitious') ? 2 : 1) * (this.has(ruler, 'content') ? 0.3 : 1) * (this.has(ruler, 'reckless') ? 1.5 : 1) * (this.has(ruler, 'cautious') ? 0.6 : 1);
      if (!this.chance(0.006 * aggro * this.tune.war)) continue;
      const myStr = this.realmStrength(r);
      let near = this.neighbours(r);
      // with no rivals at hand, a realm with a harbour may look across the water
      if (!near.length && this.realmSetts(r).some(s => s.port) && this.chance(0.35)) near = this.neighbours(r, 48).filter(o => this.realmSetts(o).some(s => s.port));
      const targets = near.filter(o => !r.allies.has(o.id) && !((r.truce.get(o.id) || 0) > this.year) && this.realmStrength(o) < myStr * (this.has(ruler, 'reckless') ? 1.3 : 0.9));
      if (!targets.length) continue;
      const t = this.pick(targets);
      this.declareWar(r, t, this.pick(['a border dispute', 'an old grudge', 'a claim on their lands', 'insults at court', 'raids along the border']));
    }
    for (const w of this.wars) {
      if (w.over) continue;
      const A = this.realm(w.a), B = this.realm(w.b);
      if (!A || !B || !A.alive || !B.alive) { w.over = true; continue; }
      w.months++;
      if (w.march) { this.marchStep(w); }
      else if (this.season === 'Winter' && this.chance(0.5)) continue; // winter slows campaigns
      else if (this.chance(0.3)) this.campaign(w, A, B);
      if (w.over) continue;
      const exhausted = w.months > 36 || Math.abs(w.score) > 8 || (w.months > 14 && this.chance(0.04));
      if (exhausted && !w.envoy) { w.envoy = true; const loser = w.score >= 0 ? B : A, winner = w.score >= 0 ? A : B; const e = this.spawnAgent('envoy', loser.id, this.sett(loser.capital), this.sett(winner.capital), { war: w.id }); if (!e) this.makePeace(w, A, B); }
    }
    this.wars = this.wars.filter(w => !w.over || w.endYear > this.year - 3);
  }

  declareWar(a, b, reason) {
    this.stats.wars++;
    const w = { id: this.id(), a: a.id, b: b.id, start: this.year, months: 0, score: 0, over: false, reason, battles: 0, intel: {} };
    this.wars.push(w);
    const ra = this.char(a.rulerId), rb = this.char(b.rulerId);
    if (ra && rb) { this.opine(ra, rb, -30); this.opine(rb, ra, -40); }
    this.log(3, 'war', `${a.name} declares war on ${b.name} over ${reason}.`, [ra?.id, rb?.id].filter(Boolean));
    // hire mercenaries
    for (const r of [a, b]) {
      const m = this.mercs.find(m => !m.employer && this.char(m.captainId)?.alive);
      if (m && r.treasury > 120 && this.chance(0.6)) { r.treasury -= 80; m.employer = r.id; m.until = this.year * 12 + this.month + 18; r.mercs.push(m.id); this.log(1, 'merc', `${r.name} hires ${m.name} for the war.`, [m.captainId]); }
    }
  }

  campaign(w, A, B) {
    const sa = this.realmStrength(A), sb = this.realmStrength(B);
    const attackerIsA = this.chance(sa >= sb ? 0.75 : 0.25);
    const att = attackerIsA ? A : B, def = attackerIsA ? B : A;
    const sAtt = attackerIsA ? sa : sb, sDef = attackerIsA ? sb : sa;
    if (sAtt < sDef * 0.35) return; // no sane general marches out this outnumbered
    // mercenaries may be bought out
    for (const mid of [...att.mercs]) {
      const m = this.mercs.find(x => x.id === mid);
      if (m && def.treasury > att.treasury + 120 && this.chance(0.08)) {
        att.mercs = att.mercs.filter(x => x !== mid); def.mercs.push(mid); m.employer = def.id; def.treasury -= 100; this.stats.defections++;
        this.log(2, 'merc', `${m.name} takes ${def.name}'s gold and turns on ${att.name} mid-war.`, [m.captainId]);
      }
    }
    // you only ride to war yourself if you've chosen to lead in person
    const inPerson = o => !this.isPlayer(o) || o.role !== 'ruler' || this.realm(o.realmId)?.leadInPerson;
    const aOff = this.realmOfficers(att).filter(o => !o.wounded && inPerson(o)).sort((x, y) => this.power(y) - this.power(x)).slice(0, 8);
    const dOff = this.realmOfficers(def).filter(o => !o.wounded).sort((x, y) => this.power(y) - this.power(x)).slice(0, 8);
    if (!aOff.length) return;
    const targets = this.realmSetts(def).sort((x, y) => Math.min(...this.realmSetts(att).map(s => this.dist(s, x))) - Math.min(...this.realmSetts(att).map(s => this.dist(s, y))));
    const target = targets[0]; if (!target) { w.over = true; return; }
    // the host gathers at the nearest friendly holding and marches on the target
    const home = this.realmSetts(att).sort((x, y) => this.dist(x, target) - this.dist(y, target))[0] || this.sett(att.capital);
    const m = { att: att.id, def: def.id, attackerIsA, officers: aOff.map(o => o.id), target: target.id, x: home.x, y: home.y, sx: home.x, sy: home.y, started: this.year * 12 + this.month };
    w.march = m;
    for (const o of aOff) { o.x = m.x; o.y = m.y; }
    if (this.dist(home, target) > 3 && this.chance(0.5)) this.log(1, 'war', `The host of ${att.name} marches from ${home.name} on ${target.name}${aOff[0] ? `, led by ${this.fullName(aOff[0])}` : ''}.`, aOff.map(o => o.id));
    this.marchStep(w);
  }

  marchStep(w) {
    const m = w.march; const att = this.realm(m.att), def = this.realm(m.def), target = this.sett(m.target);
    if (!att || !def || !att.alive || !def.alive || !target || target.destroyed || target.realmId !== def.id) { w.march = null; return; }
    const offs = m.officers.map(id => this.char(id)).filter(o => o && o.alive && !o.prisonerOf && o.realmId === att.id && o.army);
    if (!offs.length) { w.march = null; return; }
    const g = this.grid[Math.max(0, Math.min(this.h - 1, Math.round(m.y)))]?.[Math.max(0, Math.min(this.w - 1, Math.round(m.x)))];
    let speed = MOVE.land * (this.season === 'Winter' ? 0.7 : 1);
    if (g === 'swamp' || g === 'mountain') speed *= 0.6;
    if (g === 'forest') speed *= 0.8;
    if (!advance(this, m, target, speed, MOVE.sea)) { for (const o of offs) { o.x = m.x; o.y = m.y; } return; }
    m.x = target.x; m.y = target.y; w.march = null;
    const dOff = this.realmOfficers(def).filter(o => !o.wounded).sort((x, y) => this.power(y) - this.power(x)).slice(0, 8);
    this.battle(att, def, offs.slice(0, 8), dOff, target, w, m.attackerIsA);
    for (const o of offs) { const home = this.sett(att.capital); if (home) { o.x = home.x; o.y = home.y; } }
  }

  afterBattle(ctx, res) {
    const { att, def, target, war: w, attackerIsA, dOff } = ctx;
    w.battles++;
    w.score += (res.attackerWon ? 1 : -1) * (attackerIsA ? 1 : -1) * (res.decisive ? 2 : 1);
    if (!att.alive || !def.alive || target.realmId !== def.id) return;
    if (res.attackerWon && (dOff.length === 0 || this.chance(0.5))) {
      const wasCap = target.id === def.capital;
      this.joinRealm(target, att); target.unrest += 30;
      const attRuler = this.char(att.rulerId);
      if (attRuler && this.has(attRuler, 'cruel') && this.chance(0.4)) { target.pop = Math.round(target.pop * 0.6); this.spreadRumor(attRuler, 'butcher', 2); this.log(2, 'war', `${target.name} falls to ${att.name}. ${this.fullName(attRuler)} lets the soldiers sack it.`, [attRuler.id]); }
      else this.log(2, 'war', `${target.name} falls to ${att.name}.`, [attRuler?.id].filter(Boolean));
      if (def.setts.size === 0) {
        const dr = this.char(def.rulerId);
        if (dr && dr.alive) { dr.role = 'vagabond'; dr.realmId = null; dr.fame += 5; }
        this.killRealm(def, `${def.name} is no more. ${dr ? this.fullName(dr) + ' flees into exile as a landless wanderer.' : ''}`);
        w.over = true; w.endYear = this.year;
      } else if (wasCap) this.moveCapital(def);
    }
  }

  moveCapital(r) {
    const s = this.realmSetts(r).sort((a, b) => b.pop - a.pop)[0];
    if (s) r.capital = s.id;
  }

  // ---------- battles: fought on the battle engine ----------
  generalStyle(c) { return !c ? 'balanced' : this.has(c, 'reckless') || this.has(c, 'brave') ? 'reckless' : this.has(c, 'cautious') ? 'cautious' : 'balanced'; }
  battle(att, def, aOff, dOff, target, war, attackerIsA) {
    const lines = [];
    let duelSide = null;
    if (aOff.length && dOff.length && this.chance(0.3)) {
      const c1 = this.pick(aOff), c2 = this.pick(dOff);
      const w = this.duel(c1, c2, 'before the armies clash', false);
      if (w) { duelSide = w === c1 ? 0 : 1; lines.push(`${w.name} wins a duel before the lines and the army roars`); }
      for (const list of [aOff, dOff]) for (const o of [...list]) if (!o.alive) list.splice(list.indexOf(o), 1);
    }
    for (const side of [aOff, dOff]) {
      for (const o of [...side]) {
        if (o.role === 'ruler' || this.isPlayer(o) || o.loyalty > 30 || !this.chance(0.15)) continue;
        const mine = side === aOff ? att : def, other = side === aOff ? def : att;
        side.splice(side.indexOf(o), 1); (side === aOff ? dOff : aOff).push(o);
        this.stats.defections++;
        if (o.oath.length) { this.spreadRumor(o, 'oathbreaker', 3); for (const b of o.oath) { const bb = this.char(b); if (bb) this.opine(bb, o, -80); } }
        o.realmId = other.id; o.liegeId = other.rulerId; o.loyalty = 50;
        this.log(3, 'betrayal', `Before the battle for ${target.name}, ${this.fullName(o)} betrays ${mine.name} and leads their army over to ${other.name}.`, [o.id]);
      }
    }
    const ctx = { att, def, aOff, dOff, target, war, attackerIsA, lines };
    if (!aOff.length) { this.afterBattle(ctx, { attackerWon: false, decisive: false }); return; }
    this.stats.battles++;
    ctx.index = this.stats.battles;
    ctx.cfg = this.battleConfig(ctx, duelSide);
    const big = att.tier === 'Kingdom' || def.tier === 'Kingdom' || ctx.cfg.sides.reduce((a, s) => a + s.divisions.reduce((x, d) => x + d.count, 0), 0) > 3000;
    ctx.big = big;
    ctx.title = `Battle of ${target.name}: ${att.name} attacks ${def.name}`;
    const pid = this.playerId, pr = this.player && this.player.alive ? this.playerRealm() : null;
    ctx.playerSide = aOff.some(o => o.id === pid) ? 0 : dOff.some(o => o.id === pid) ? 1 : (pr && this.playerRules() ? (pr.id === att.id ? 0 : pr.id === def.id ? 1 : null) : null);
    if (ctx.playerSide == null) ctx.playerSide = undefined;
    this.queueBattle(ctx);
  }

  queueBattle(ctx) {
    const choice = this.replaying && this.replayLog ? this.replayLog[ctx.index] : null;
    if (choice && !this.pendingBattle) { ctx.choice = choice; ctx.replay = true; this.pendingBattle = ctx; return; }
    const wants = ctx.playerSide != null || (this.watchMode && (this.watchMode === 'all' || (this.watchMode === 'big' && ctx.big)));
    if (!this.replaying && !this.pendingBattle && wants) { this.pendingBattle = ctx; return; }
    this.finishBattle(ctx, this.runProxy(ctx.cfg), null);
  }
  runProxy(cfg) {
    // auto-resolve: the same engine with each soldier standing for a company of men
    const proxy = JSON.parse(JSON.stringify(cfg)); delete proxy.script;
    const biggest = Math.max(...proxy.sides.flatMap(s => s.divisions.map(d => d.count)), ...(proxy.bases || []).map(b => b.count / 3));
    const coarse = !this.playerId; // history before you arrive is told in broader strokes
    const per = Math.max(1, biggest / (coarse ? 10 : 18));
    for (const side of proxy.sides) { if (!side.ai) side.ai = 'balanced'; for (const d of side.divisions) d.count = Math.max(2, Math.round(d.count / per)); if (side.reserve) side.reserve.count = Math.round(side.reserve.count / per); }
    for (const b of proxy.bases || []) b.count = Math.max(2, Math.round(b.count / per));
    proxy.field = { w: 1000, h: 640 }; // a smaller table for the model armies: same fight, less empty ground to scan
    const b = new Battle(proxy); let n = 0; while (!b.over && n++ < (coarse ? 400 : 700)) b.step(coarse ? 0.6 : 0.4);
    if (!b.over) { b.t = 999; b.checkEnd(); }
    return b;
  }
  commandCfg(ctx, script) {
    const cfg = JSON.parse(JSON.stringify(ctx.cfg));
    if (ctx.playerSide != null) cfg.sides[ctx.playerSide].ai = null;
    if (script) cfg.script = script;
    return cfg;
  }
  runChoice(ctx, choice) {
    if (!choice || choice.mode === 'quick') return this.runProxy(ctx.cfg);
    const b = new Battle(choice.mode === 'command' ? this.commandCfg(ctx, choice.script) : ctx.cfg);
    let n = 0; while (!b.over && n++ < 40000) b.step(1 / 30);
    return b;
  }
  finishBattle(ctx, b, choice) {
    if (choice) { this.battleLog[ctx.index] = choice; ctx.watched = true; }
    if (ctx.kind === 'skirmish') this.applySkirmish(ctx, b); else this.applyBattle(ctx, b);
  }

  battleConfig(ctx, duelSide) {
    const { att, def, aOff, dOff, target, war } = ctx;
    const famine = r => this.realmSetts(r).some(s => s.famine);
    const sideOf = (realm, offs, enemyOffs, idx) => {
      const divisions = offs.map(o => ({ faction: o.army.faction || o.culture, unit: o.army.unit ?? 0, count: Math.max(20, Math.min(1500, o.army.size)), level: o.army.level, officer: { name: o.name, stats: o.stats, ref: o.id } }));
      for (const mid of realm.mercs) {
        const m = this.mercs.find(x => x.id === mid); const cap = m && this.char(m.captainId);
        if (m && cap && cap.alive && divisions.length < 8) divisions.push({ faction: m.faction, unit: m.unit, count: Math.max(20, Math.min(700, m.size)), level: m.level, officer: { name: cap.name, stats: cap.stats, ref: cap.id, merc: m.id } });
      }
      if (!divisions.length) {
        const head = this.char(realm.rulerId);
        const ent = UNITS[target.culture].findIndex(u => u.entry && (u.role === 'inf' || u.role === 'heavy'));
        divisions.push({ faction: target.culture, unit: Math.max(0, ent), count: Math.max(30, Math.round(target.pop * 0.12)), level: 1, officer: { name: head ? head.name : 'the militia captain', stats: head ? head.stats : { lea: 6, mig: 6, int: 5, cha: 7 }, ref: head ? head.id : null } });
      }
      let morale = 0;
      if (enemyOffs.some(e => e.titles.deed === 'Legendary Army') && !offs.some(o => o.titles.deed === 'Giant Slayer')) morale -= 10;
      if (enemyOffs.some(e => e.titles.rep === 'the Butcher') && !offs.some(o => o.titles.rep === 'Deaf Ears')) morale -= 6;
      if (famine(realm)) morale -= 8;
      morale += (war.intel[realm.id] || 0) * 40;
      if (duelSide === idx) morale += 10;
      if (idx === 1 && target.biome === 'mountain') morale += 8;
      if (offs.some(o => o.titles.rank === 'Marshal')) morale += 5; else if (offs.some(o => o.titles.rank === 'General')) morale += 3;
      const lead = offs[0] || this.char(realm.rulerId);
      return { faction: target.culture, name: realm.name, realmId: realm.id, color: realm.color, ai: this.generalStyle(lead), canFire: offs.some(o => o.stats.int >= 12), mods: { morale, atk: famine(realm) ? 0.92 : 1 }, divisions };
    };
    war.intel[att.id] = 0; war.intel[def.id] = 0;
    const s0 = sideOf(att, aOff, dOff, 0), s1 = sideOf(def, dOff, aOff, 1);
    if (Math.abs(parseInt(s0.color.slice(1), 16) - parseInt(s1.color.slice(1), 16)) < 0x202020) s1.color = '#e8e2d0';
    // Dynasty Warriors field: 3-5 bases a side, set by the land. The defender's main camp is the town's own garrison.
    const pattern = this.pick(BASE_LAYOUTS[target.biome] || ['2-1']);
    const ent = (f, roles) => Math.max(0, UNITS[f].findIndex(u => u.entry && roles.includes(u.role)));
    const aRes = att.reserve || 0, dRes = def.reserve || 0;
    const aPool = Math.round(aRes * 0.6), dPool = Math.round(dRes * 0.5);
    const bases = [];
    for (const [side, realm, mainCount, pool] of [[0, att, Math.round(aPool * 0.5), Math.round(aPool * 0.5)], [1, def, target.garrison || 0, dPool]]) {
      const list = layoutBases(pattern, side); const others = list.filter(b => b.kind !== 'main'); const W = others.reduce((a, b) => a + (b.kind === 'fort' ? 2 : 1), 0) || 1;
      for (const b of list) {
        const want = b.kind === 'main' ? mainCount : Math.round(pool * (b.kind === 'fort' ? 2 : 1) / W);
        bases.push({ ...b, count: Math.max(30, Math.min(BASE_CAPS[b.kind], want)), faction: realm.culture, unit: ent(realm.culture, b.kind === 'fort' ? ['ranged', 'magic'] : ['inf', 'heavy']), level: 2, name: b.kind === 'main' ? (side === 1 ? `the walls of ${target.name}` : `the camp of ${realm.name}`) : `${realm.name}'s ${b.kind}` });
      }
    }
    s0.reserve = { count: Math.min(5000, aRes - aPool), faction: att.culture, unit: ent(att.culture, ['inf', 'heavy']), level: 2 };
    s1.reserve = { count: Math.min(5000, dRes - dPool), faction: def.culture, unit: ent(def.culture, ['inf', 'heavy']), level: 2 };
    // keep the whole field within 30,000: trim garrisons and reserves first
    const field = [s0, s1].reduce((a, s) => a + s.divisions.reduce((x, d) => x + d.count, 0), 0);
    const extra = bases.reduce((a, b) => a + b.count, 0) + s0.reserve.count + s1.reserve.count;
    if (field + extra > 30000) { const k = Math.max(0.1, (30000 - field) / extra); for (const b of bases) b.count = Math.max(30, Math.round(b.count * k)); s0.reserve.count = Math.round(s0.reserve.count * k); s1.reserve.count = Math.round(s1.reserve.count * k); }
    const total = field + bases.reduce((a, b) => a + b.count, 0) + s0.reserve.count + s1.reserve.count;
    return { seed: Math.floor(this.r() * 1e9), terrain: target.biome, season: this.season, sides: [s0, s1], bases, pattern, field: fieldFor(total) };
  }

  applyBattle(ctx, b) {
    const { att, def, target, lines } = ctx;
    const wonSide = b.winner; const wR = wonSide === 0 ? att : def, lR = wonSide === 0 ? def : att;
    let loserCas = 0, loserStart = 0;
    for (const d of b.divisions) {
      const ref = d.officer.ref; const o = ref != null ? this.char(ref) : null;
      const survive = Math.max(0.03, (b.aliveCount(d) + d.fled) / d.start);
      const won = d.side === wonSide;
      if (!won) { loserCas += d.dead / d.start; loserStart++; }
      if (d.officer.merc) { const m = this.mercs.find(x => x.id === d.officer.merc); if (m) m.size = Math.round(m.size * survive); }
      else if (o && o.army) {
        o.army.size = Math.round(o.army.size * survive);
        if (won) { o.army.wins++; this.armyXp(o, 30); this.gainXp(o, 30); o.fame += 3; } else { o.army.losses++; this.armyXp(o, 12); this.gainXp(o, 12); }
      }
      if (d.rallied && o) { o.fame += 4; lines.push(`${o.name} rallies their broken ${this.plural(d.unitName)}`); }
      if (o && !d.officer.alive) { this.die(o, `fell in battle at ${target.name}`); lines.push(`${o.name} falls`); this.officerFallen(o, d.side === 0 ? att : def); }
      else if (o && d.officer.captured) { o.prisonerOf = (d.side === 0 ? def : att).id; lines.push(`${o.name} is taken prisoner`); }
    }
    // what's left of the garrisons and the lords' reserves goes home with them
    if (ctx.cfg.bases && b.bases) {
      const ratio = d => d ? Math.max(0, (b.aliveCount(d) + d.fled) / d.start) : 0;
      const left = [0, 0];
      b.bases.forEach((B, i) => {
        const orig = ctx.cfg.bases[i].count; const kept = B.side === B.home && B.div && B.div.side === B.home ? Math.round(orig * ratio(B.div)) : 0;
        if (B.home === 1 && B.kind === 'main') target.garrison = kept; else left[B.home] += kept;
      });
      for (const i of [0, 1]) { const rd = b.divisions.find(d => d.reserve && d.side === i); const rc = ctx.cfg.sides[i].reserve ? ctx.cfg.sides[i].reserve.count : 0; left[i] += Math.round(rc * ratio(rd)); }
      const aR = att.reserve || 0, dR = def.reserve || 0;
      att.reserve = Math.max(0, Math.round(aR - Math.round(aR * 0.6) - (ctx.cfg.sides[0].reserve?.count || 0) + left[0]));
      def.reserve = Math.max(0, Math.round(dR - Math.round(dR * 0.5) - (ctx.cfg.sides[1].reserve?.count || 0) + left[1]));
      const taken = b.bases.filter(B => B.side !== B.home);
      if (b.mainTaken) lines.push(`${wonSide === 0 ? att.name : def.name} storms the main camp`);
      else if (taken.length) lines.push(`${taken.length} post${taken.length === 1 ? '' : 's'} change hands`);
      if (b.bases.some(B => B.fired > 0)) lines.push('fire arrows burn the garrisons');
    }
    const routs = [...new Set(b.divisions.filter(d => d.routed && d.side !== wonSide).map(d => this.plural(d.unitName)))];
    if (b.fires.length) lines.push(`fire arrows rain on the field`);
    if (routs.length) lines.push(`the ${routs.slice(0, 3).join(', ')} break and flee`);
    const wOffs = (wonSide === 0 ? ctx.aOff : ctx.dOff).filter(o => o.alive);
    const lead = wOffs.sort((x, y) => this.power(y) - this.power(x))[0];
    if (lead && lead.army && lead.army.wins >= 6 && this.grantDeed(lead, 'Legendary Army')) lines.push(`${lead.name}'s host is hailed as a Legendary Army`);
    if (lead && lead.army && lead.army.wins >= 3 && !lead.titles.rank && lead.role === 'officer') { lead.titles.rank = wR.tier === 'Kingdom' && this.realmOfficers(wR).every(o => o.titles.rank !== 'Marshal') ? 'Marshal' : 'General'; lines.push(`${lead.name} is named ${lead.titles.rank}`); lead.loyalty = Math.min(100, lead.loyalty + 15); }
    const decisive = loserStart && loserCas / loserStart > 0.45;
    const sizes = i => ctx.cfg.sides[i].divisions.reduce((a, d) => a + d.count, 0) + (ctx.cfg.sides[i].reserve?.count || 0) + (ctx.cfg.bases || []).filter(x => x.side === i).reduce((a, x) => a + x.count, 0);
    const troopWord = `${sizes(0).toLocaleString()} against ${sizes(1).toLocaleString()}`;
    const imp = decisive || lines.length > 1 || ctx.big ? 2 : 1;
    this.log(imp, 'battle', `Battle of ${target.name} (${this.season.toLowerCase()}, ${target.biome}). ${att.name} attacks ${def.name}, ${troopWord}. ${wR.name}, led by ${lead ? this.fullName(lead) : 'its levies'}, ${decisive ? 'crushes' : 'defeats'} ${lR.name}.${lines.length ? ' ' + lines.join('; ').replace(/^./, c => c.toUpperCase()) + '.' : ''}`, [...ctx.aOff, ...ctx.dOff].map(o => o.id));
    const last = this.chronicle[this.chronicle.length - 1]; last.battle = ctx.index; last.watched = !!ctx.watched;
    (this.battleSites || (this.battleSites = [])).push({ x: target.x, y: target.y, at: this.year * 12 + this.month, winner: wR.id });
    if (this.battleSites.length > 40) this.battleSites.shift();
    this.afterBattle(ctx, { attackerWon: wonSide === 0, decisive });
  }

  // called by the screen once you've watched, fought or skipped a pending battle
  finishPending(b, choice) {
    const ctx = this.pendingBattle; if (!ctx) return;
    this.pendingBattle = null;
    if (choice.mode === 'quick') b = this.runProxy(ctx.cfg);
    this.finishBattle(ctx, b, choice);
  }

  officerFallen(o, realm) {
    // the army passes to an officer of equal rank, rises a new officer from the ranks, or melts away
    if (!o.army) return;
    const army = o.army; o.army = null;
    const peers = this.realmOfficers(realm).filter(x => x.id !== o.id && x.titles.rank === o.titles.rank && x.army && x.army.size < army.size);
    if (peers.length && this.chance(0.5)) {
      const p = this.pick(peers); p.army = army; army.size = Math.round(army.size * 0.85);
      if (army.wins >= 6 && !p.titles.deed && this.chance(0.3)) this.grantDeed(p, 'Legendary Army');
      this.log(1, 'army', `${this.fullName(p)} takes command of ${o.name}'s grieving army.`, [p.id, o.id]);
    } else if (this.chance(0.4) && army.size > 60) {
      const nc = this.makeChar({ culture: o.culture, age: this.ri(22, 40), role: 'officer', dynasty: this.dynastyName() });
      nc.army = army; this.addOfficer(realm, nc); nc.loyalty = 70; nc.army = army; nc.fame = 5;
      this.log(2, 'rise', `A soldier named ${nc.name} rises from the ranks to lead ${o.name}'s army after their death.`, [nc.id, o.id]);
    }
  }

  armyXp(o, n) {
    if (!o.army) return;
    const a = o.army; const before = this.troopTier(a);
    a.xp += n;
    while (a.xp >= 40 + a.level * 15 && a.level < 10) { a.xp -= 40 + a.level * 15; a.level++; }
    const after = this.troopTier(a);
    if (after !== before) {
      const def = a.faction && UNITS[a.faction][a.unit];
      if (def && def.up != null) {
        const old = def.name; a.unit = def.up;
        this.log(2, 'army', `${this.fullName(o)}'s ${this.plural(old)} have hardened into ${after} and now march as ${this.plural(this.unitName(a))}. You can tell them on sight.`, [o.id]);
      } else this.log(after === 'Elite' ? 2 : 1, 'army', `${this.fullName(o)}'s ${this.plural(this.unitName(a))} have hardened into ${after}.`, [o.id]);
    }
  }
  gainXp(c, n) {
    c.xp += n;
    while (c.xp >= 50 + c.level * 20 && c.level < 20) {
      c.xp -= 50 + c.level * 20; c.level++;
      const k = this.pick(['lea', 'mig', 'int', 'pol', 'cha']); c.stats[k] = Math.min(25, c.stats[k] + 1);
    }
  }
  grantDeed(c, title) {
    if (title === 'Strongest Under Heaven') { c.titles.deed = title; return true; }
    if (c.titles.deed && c.titles.deed !== title) { if (['Legendary Army', 'Dragonslayer'].includes(title)) { c.titles.deed = title; return true; } return false; }
    if (c.titles.deed === title) return false;
    c.titles.deed = title; c.fame += 5; return true;
  }

  makePeace(w, A, B) {
    w.over = true; w.endYear = this.year;
    const winner = w.score >= 0 ? A : B, loser = w.score >= 0 ? B : A;
    A.truce.set(B.id, this.year + 5); B.truce.set(A.id, this.year + 5);
    let extra = '';
    // prisoners ransomed
    for (const c of this.living().filter(c => c.prisonerOf === winner.id || c.prisonerOf === loser.id)) {
      const payer = this.realm(c.realmId); if (payer) payer.treasury -= 30; c.prisonerOf = null;
    }
    // hostages / wards and marriages to seal peace
    const lr = this.char(loser.rulerId), wr = this.char(winner.rulerId);
    if (lr && wr && this.chance(0.5)) {
      const ward = lr.children.map(id => this.char(id)).find(k => k && k.alive && this.age(k) < 16 && !k.wardOf);
      if (ward) {
        ward.wardOf = winner.id; this.opine(ward, wr, 25);
        const betrothed = wr.children.map(id => this.char(id)).find(k => k && k.alive && k.female !== ward.female && !k.spouseId && Math.abs(this.age(k) - this.age(ward)) < 6);
        if (betrothed) { ward.betrothed = betrothed.id; betrothed.betrothed = ward.id; }
        extra = ` ${this.fullName(ward)}, child of ${lr.name}, is sent to be raised at the court of ${winner.name} as a ward${betrothed ? `, promised in marriage to ${betrothed.name}` : ''}.`;
      }
    }
    this.log(3, 'peace', `${A.name} and ${B.name} make peace after ${Math.max(1, Math.round(w.months / 12))} year(s) of war and ${w.battles} battle(s). ${winner.name} has the better of it.${extra}`, [wr?.id, lr?.id].filter(Boolean));
    for (const mid of [...A.mercs, ...B.mercs]) { const m = this.mercs.find(x => x.id === mid); if (m) m.employer = null; }
    A.mercs = []; B.mercs = [];
  }

  // ---------- duels ----------
  duel(a, b, reason, training, opts = {}) {
    this.stats.duels++;
    const st = c => (this.isPlayer(c) ? opts.stance : null) || 'balanced';
    const bonus = c => st(c) === 'aggressive' ? 4 : st(c) === 'defensive' ? -3 : 0;
    const sa = a.stats.mig * 2 + a.level + this.r() * 15 - (a.wounded ? 6 : 0) + bonus(a);
    const sb = b.stats.mig * 2 + b.level + this.r() * 15 - (b.wounded ? 6 : 0) + bonus(b);
    const [w, l] = sa >= sb ? [a, b] : [b, a];
    w.duelWins++; w.fame += training ? 3 : 5; this.gainXp(w, 20);
    this.opine(l, w, -25);
    const rec = { a: a.id, b: b.id, w: w.id, an: a.name, bn: b.name, af: this.fighter(a), bf: this.fighter(b), outcome: training ? 'yield' : 'yield', training: !!training, reason, margin: Math.abs(sa - sb), seed: Math.floor(this.r() * 1e6) };
    (this.recentDuels || (this.recentDuels = [])).push(rec);
    if (this.isPlayer(a) || this.isPlayer(b)) this.lastPlayerDuel = rec;
    if (!training) {
      const roll = this.r();
      const lethal = st(l) === 'defensive' ? 0.4 : st(w) === 'aggressive' || st(l) === 'aggressive' ? 1.6 : 1;
      if (roll < 0.1 * lethal) { rec.outcome = 'slain'; this.die(l, `slain in a duel by ${w.name}`); }
      else if (roll < 0.35) { rec.outcome = 'wounded'; l.wounded = 8; }
      if (w.duelWins >= 5 && !w.titles.deed) this.grantDeed(w, 'Undefeated');
    }
    // unique title: Strongest Under Heaven
    const holder = this.char(this.unique.strongest);
    if (!training && (l.id === this.unique.strongest || (!holder || !holder.alive) && w.duelWins >= 3)) {
      if (holder && holder.alive) holder.titles.deed = null;
      this.unique.strongest = w.id; this.grantDeed(w, 'Strongest Under Heaven');
      this.log(3, 'duel', `${this.fullName(w)} defeats ${l.name} and claims the title Strongest Under Heaven.`, [w.id, l.id]);
    }
    return w;
  }

  fighter(c) {
    // duelists fight on foot: the culture's warrior, or its first upgraded warrior for the famous
    const us = UNITS[c.culture]; let i = us.findIndex(u => u.entry && (u.role === 'inf' || u.role === 'heavy'));
    if (i < 0) i = us.findIndex(u => u.role === 'inf' || u.role === 'heavy' || u.role === 'magic');
    if (i < 0) i = 0;
    if ((c.fame > 30 || c.duelWins >= 3) && us[i].up != null) i = us[i].up;
    return [c.culture, i];
  }

  // ---------- intrigue: spies, assassins, rumors ----------
  spymaster(r) { const sm = this.council(r, 'spymasterId'); if (sm) return sm; const offs = this.living().filter(c => c.realmId === r.id && (c.role === 'officer' || c.role === 'ruler' || c.role === 'courtier') && this.age(c) >= 16); return offs.sort((a, b) => b.stats.int - a.stats.int)[0]; }
  guardSetting(r) {
    // rulers who feel threatened tighten security
    const ruler = this.char(r.rulerId);
    if (this.isPlayer(ruler) && !(r.guardAuto && this.captain(r))) { const g = r.guardChoice || 'Light'; const cap = this.sett(r.capital); if (cap) cap.guard = g; return g; }
    const threats = this.wars.filter(w => !w.over && (w.a === r.id || w.b === r.id)).length + (ruler && ruler.plotted ? 1 : 0);
    const g = threats >= 2 || (ruler && this.has(ruler, 'cautious') && threats) ? 'Locked Down' : threats ? 'Watchful' : 'Light';
    const cap = this.sett(r.capital); if (cap) cap.guard = g;
    return g;
  }
  intrigue() {
    for (const w of this.wars) {
      if (w.over || !this.chance(0.12)) continue;
      const [A, B] = this.shuffle([this.realm(w.a), this.realm(w.b)]);
      if (!A || !B) continue;
      const sm = this.spymaster(A), tm = this.spymaster(B); if (!sm) continue;
      this.stats.spies++;
      const capA = this.sett(A.capital), capB = this.sett(B.capital);
      this.spawnAgent('spy', A.id, capA, capB, { war: w.id, target: B.id, sm: sm.id, name: this.personName(cultureById(A.culture), this.chance(0.4)), cover: this.pick(['a wine merchant', 'a pilgrim', 'a traveling minstrel', 'a stablehand', 'a scribe']) });
      // the bitterest rulers send agitators to stir up enemy towns
      const ar = this.char(A.rulerId);
      if (ar && !this.isPlayer(ar) && (this.has(ar, 'deceitful') || this.has(ar, 'cruel')) && this.chance(0.3)) {
        const t = this.realmSetts(B).filter(s => s.id !== B.capital).sort((x, y) => y.unrest - x.unrest)[0];
        if (t) this.agitate(A.id, t, ar);
      }
      // smear campaign: plant a false rumor about an enemy officer
      if (this.chance(0.2)) {
        const victim = this.pick(this.realmOfficers(B));
        if (victim) {
          if (victim.stats.int > 13) { if (!victim.titles.rep || this.chance(0.5)) { victim.titles.rep = 'Deaf Ears'; this.log(2, 'rumor', `${A.name} spreads lies that ${victim.name} massacred villagers. ${victim.name} shrugs them off so completely that people start calling them Deaf Ears.`, [victim.id]); } }
          else { this.spreadRumor(victim, 'butcher', 3); this.log(1, 'rumor', `Whispers planted by ${A.name} claim ${victim.name} butchered prisoners. The tale spreads town to town.`, [victim.id]); }
        }
      }
    }
    // assassination plots: ambitious claimants and bitter enemies
    if (this.chance(Math.min(0.9, 0.12 * this.tune.plots))) {
      const plotters = this.living().filter(c => !c.prisonerOf && !this.isPlayer(c) && this.age(c) >= 18 && (this.has(c, 'ambitious') || this.has(c, 'deceitful')) && c.stats.int >= 8);
      const p = plotters.length ? this.pick(plotters) : null;
      if (p) {
        let target = null, motive = '';
        const myRealm = this.realm(p.realmId);
        if (myRealm && p.role === 'officer' && p.loyalty < 35) { target = this.char(myRealm.rulerId); motive = 'to seize the throne'; }
        else {
          const enemies = Object.entries(p.rel).filter(([, v]) => v < -50).map(([id]) => this.char(+id)).filter(c => c && c.alive && (c.role === 'ruler' || c.heir));
          if (enemies.length) { target = this.pick(enemies); motive = 'out of hatred'; }
          else if (myRealm) {
            const war = this.wars.find(w => !w.over && (w.a === myRealm.id || w.b === myRealm.id));
            if (war) { const er = this.realm(war.a === myRealm.id ? war.b : war.a); const heir = er && this.char(er.heirId); target = heir && heir.alive && this.chance(0.5) ? heir : er && this.char(er.rulerId); motive = target && target.id === er?.heirId ? 'to end the enemy line' : 'to win the war'; }
          }
        }
        if (target && target.alive && target.id !== p.id) { if (this.isPlayer(target)) this.plotAgainstPlayer(p, motive); else this.spawnAgent('assassin', p.realmId || target.realmId, this.sett(p.settId) || p, this.sett(target.settId) || this.sett(this.realm(target.realmId)?.capital), { by: p.id, target: target.id, motive, cover: this.pick(['a merchant', 'a pilgrim', 'a performer', 'a cook', 'a priest']), culture: p.culture }); }
      }
    }
  }
  assassination(p, t, motive) {
    const tr = this.realm(t.realmId);
    const guard = tr ? this.guardSetting(tr) : 'Light';
    const disguise = this.pick(['a merchant', 'a pilgrim', 'a performer', 'a cook', 'a priest']);
    const sm = tr && this.spymaster(tr);
    const catchP = GUARD[guard].catch + (sm ? sm.stats.int * 0.012 : 0) - p.stats.int * 0.012;
    t.plotted = true;
    if (this.chance(Math.max(0.1, Math.min(0.85, catchP)))) {
      this.stats.foiled++;
      this.opine(t, p, -70);
      const exposed = this.chance(0.6);
      this.log(2, 'assassin', `An assassin disguised as ${disguise} is seized at the ${guard === 'Light' ? 'gate' : 'palace doors'} before reaching ${this.fullName(t)}.${exposed ? ` Under questioning they name their master: ${this.fullName(p)}.` : ' They die without naming their master.'}`, [t.id, exposed ? p.id : null].filter(Boolean));
      if (exposed && p.realmId === t.realmId && p.role === 'officer') { p.prisonerOf = t.realmId; this.spreadRumor(p, 'traitor', 3); }
      if (exposed && p.realmId !== t.realmId) { const pr = this.realm(p.realmId); if (pr && tr && !this.atWar(pr, tr) && this.chance(0.5)) this.declareWar(tr, pr, 'a failed assassination'); }
    } else {
      this.stats.assassinations++;
      this.die(t, `assassinated by an agent of ${p.name}`);
      this.log(3, 'assassin', `${this.fullName(t)} is murdered by an assassin posing as ${disguise}. The killer vanishes${this.chance(0.4) ? `; rumors point to ${this.fullName(p)}` : ''}.`, [t.id, p.id]);
      if (motive === 'to seize the throne' && tr && tr.alive && this.char(tr.rulerId) && !this.char(tr.rulerId).alive) {
        // usurp if the succession failed
      }
    }
  }
  spreadRumor(c, kind, n) {
    c.rumors[kind] = (c.rumors[kind] || 0) + n;
    if (n >= 2 && (this.agents || []).filter(a => a.kind === 'rumor').length < 12) { const from = this.sett(c.settId) || this.sett(this.realm(c.realmId)?.capital); const to = from && this.pick(this.setts.filter(s => !s.destroyed && this.dist(s, from) < 9 && s !== from)); if (from && to) this.spawnAgent('rumor', c.realmId, from, to, { about: c.id, text: kind, culture: c.culture }); }
    const map = { butcher: 'the Butcher', merciful: 'the Merciful', oathbreaker: 'the Oathbreaker', traitor: 'the Traitor', kinslayer: 'the Kinslayer', brigand: 'the Brigand', craven: 'the Craven' };
    const title = map[kind];
    if (c.rumors[kind] >= 4 && c.titles.rep !== title && c.titles.rep !== 'Deaf Ears') {
      c.titles.rep = title;
      this.log(2, 'rumor', `Across taverns and market squares, ${c.name}${c.dynasty ? ' ' + c.dynasty : ''} is now called ${title}.`, [c.id]);
    }
  }

  // ---------- tournaments ----------
  planTournaments() {
    // heralds announce tournaments two months ahead
    for (const r of this.realmList()) {
      const asked = r.hostTournament; r.hostTournament = false;
      if (this.isPlayer(this.char(r.rulerId)) && !asked) continue;
      if (!asked && (r.tier === 'Village' || r.treasury < 150 || this.wars.some(w => !w.over && (w.a === r.id || w.b === r.id)) || !this.chance(Math.min(0.9, 0.15 * this.tune.tournaments)))) continue;
      r.tourney = true;
      const cap = this.sett(r.capital), p = this.player;
      if (p && p.alive && !p.prisonerOf && cap && (this.dist(p, cap) < 15 || this.isPlayer(this.char(r.rulerId)))) this.you(`Heralds announce a tournament at ${cap.name} in Highsun. Enter it from the You tab.`, [], 1);
    }
  }
  act_enter(a) { const r = this.realm(a.realm); if (!r || !r.tourney) return 'There is no tournament there.'; this.player.enterTourney = r.id; return `You will ride in the lists at ${this.sett(r.capital)?.name}.`; }
  tournaments() {
    for (const r of this.realmList()) {
      if (!r.tourney) continue; r.tourney = false;
      const cap = this.sett(r.capital); if (!cap) continue;
      const p = this.player;
      const pool = this.living().filter(c => !this.isPlayer(c) && this.age(c) >= 17 && this.age(c) <= 50 && !c.prisonerOf && !c.wounded && ['officer', 'ruler', 'vagabond', 'courtier', 'merc'].includes(c.role) && this.dist(c, cap) < 15);
      let entrants = this.shuffle(pool).slice(0, 8);
      if (p && p.alive && p.enterTourney === r.id && !p.prisonerOf) { entrants = [p, ...entrants.slice(0, 7)]; this.shuffle(entrants); }
      if (p) p.enterTourney = null;
      if (entrants.length < 4) continue;
      r.treasury -= 60; this.stats.tournaments++;
      let round = entrants;
      while (round.length > 1) { const next = []; for (let i = 0; i < round.length; i += 2) next.push(round[i + 1] ? this.duel(round[i], round[i + 1], 'tournament', true) : round[i]); round = next; }
      const champ = round[0];
      champ.fame += 8; const got = !champ.titles.deed && this.grantDeed(champ, 'Tourney Champion');
      let tale = `${r.name} holds a great tournament at ${cap.name}. Rivals and enemies cross blunted blades in peace. ${this.fullName(champ)} is crowned champion${got ? ' and named Tourney Champion' : ''}.`;
      // a marriage offer to the champion
      const ruler = this.char(r.rulerId);
      const kin = ruler && ruler.children.map(id => this.char(id)).find(k => k && k.alive && !k.spouseId && this.age(k) >= 16 && k.female !== champ.female && !k.betrothed);
      if (kin && !champ.spouseId && champ.id !== kin.id && this.chance(0.4)) { this.marry(champ, kin, false); tale += ` ${this.fullName(ruler)} offers the hand of ${kin.name} to the champion.`; }
      // assassins in the crowd, with framing
      if (this.chance(0.05) && ruler) {
        const enemies = entrants.filter(e => e.realmId !== r.id && e.alive);
        let victim = this.chance(0.5) ? ruler : this.pick(entrants.filter(e => e.alive && e.role !== 'vagabond')) || ruler;
        if (this.isPlayer(victim)) victim = null;
        const framed = enemies.length ? this.pick(enemies) : null;
        if (victim && victim.alive && this.chance(1 - GUARD.Watchful.catch)) {
          this.die(victim, 'stabbed in the tournament crowd'); this.stats.assassinations++;
          tale += ` Then, in the crowd, a blade finds ${this.fullName(victim)}.`;
          if (framed) {
            tale += ` A planted dagger points to ${this.fullName(framed)}, who swears innocence.`;
            this.spreadRumor(framed, 'traitor', 3);
            const fr = this.realm(framed.realmId);
            if (fr && fr.id !== r.id && fr.alive && !this.atWar(fr, r)) this.declareWar(r, fr, `the murder at the tournament, blamed on ${framed.name}`);
          }
        } else tale += ' An assassin in the crowd is caught before striking.';
      }
      this.log(2, 'tournament', tale, [champ.id, ruler?.id, ...entrants.map(e => e.id)].filter(Boolean));
    }
  }

  // ---------- life: births, deaths, marriage, oaths, succession ----------
  monthlyLife() {
    for (const c of this.living()) {
      const a = this.age(c);
      let p = a < 5 ? 0.0012 : a < 50 ? 0.0006 : 0.0006 + (a - 50) ** 2 * 0.00004;
      if (c.wounded) p += 0.004;
      if (this.isPlayer(c) && a < 50) p *= 0.3; // the chronicle is kind to its subject, early on
      if (this.chance(p)) { this.die(c, a > 60 ? 'old age' : this.pick(['a fever', 'the bloody flux', 'a fall from a horse', 'a winter chill'])); continue; }
      // births
      if (c.female && c.spouseId && a >= 17 && a <= 42) {
        const sp = this.char(c.spouseId);
        if (sp && sp.alive && this.chance(c.children.length >= 4 ? 0.004 : 0.011)) {
          const dyn = c.noble ? (sp.role === 'ruler' || !c.dynasty ? sp.dynasty : c.dynasty) : sp.dynasty;
          const k = this.makeChar({ culture: this.chance(0.5) ? c.culture : sp.culture, age: 0, role: 'child', dynasty: dyn || c.dynasty, noble: c.noble || sp.noble });
          this.setParents(k, sp.role === 'ruler' ? sp : c, sp.role === 'ruler' ? c : sp);
          if (c.culture !== sp.culture) k.mixed = [c.culture, sp.culture];
          // children take after their parents
          const inherit = [];
          for (const par of [c, sp]) if (this.chance(0.5)) { const t = this.pick(par.traits); if (!inherit.includes(t) && !inherit.includes(OPPOSITE[t])) inherit.push(t); }
          if (inherit.length) { k.traits = [...inherit, ...k.traits.filter(t => !inherit.includes(t) && !inherit.includes(OPPOSITE[t]))].slice(0, 2); }
          // inherit some stats
          for (const s of Object.keys(k.stats)) k.stats[s] = Math.round((k.stats[s] + (c.stats[s] + sp.stats[s]) / 2) / 2 + this.ri(-1, 2));
          this.stats.births++;
          const rr = this.realm(sp.realmId);
          if (rr && (rr.rulerId === sp.id || rr.rulerId === c.id)) this.log(1, 'birth', `A child, ${k.name}, is born to ${this.fullName(sp)} and ${c.name}${k.mixed ? ', of mixed ' + k.mixed.map(x => cultureById(x).race).join('-') + ' blood' : ''}.`, [k.id, sp.id, c.id]);
        }
      }
    }
  }
  yearly() {
    // coming of age, wards returning, marriages, oaths, officer recruitment
    for (const c of this.living()) {
      const a = this.age(c);
      if (c.role === 'child' && a >= 16) {
        if (c.wardOf) {
          const host = this.realm(c.wardOf); c.wardOf = null;
          this.log(1, 'ward', `${this.fullName(c)} comes of age and returns home from ${host ? host.name : 'their foster court'}, loyalties divided.`, [c.id]);
        }
        const parentRealm = this.realm(c.realmId);
        if (parentRealm && parentRealm.alive && c.noble) { if (c.stats.lea + c.stats.mig > 16 && this.chance(0.6)) { this.addOfficer(parentRealm, c); c.army = this.newArmy(c, 0.5); } else c.role = 'courtier'; }
        else c.role = 'vagabond';
        if (c.betrothed) { const b = this.char(c.betrothed); if (b && b.alive && !b.spouseId && this.age(b) >= 16) this.marry(c, b, false); }
      }
      if (!c.spouseId && !this.isPlayer(c) && a >= 18 && a <= 45 && (c.noble || c.role === 'officer' || c.role === 'ruler') && this.chance(0.25)) this.seekMarriage(c);
      if (c.role === 'officer' && !this.isPlayer(c)) {
        const r = this.realm(c.realmId); const ruler = r && this.char(r.rulerId);
        if (!r || !r.alive || !ruler) { c.role = 'vagabond'; continue; }
        c.loyalty += (this.op(c, ruler) > 20 ? 2 : -1) + (r.treasury < 0 ? -6 : 0) + (this.has(ruler, 'cruel') ? -3 : 0) + (this.has(c, 'loyal') ? 3 : 0) + (this.has(c, 'ambitious') ? -2 : 0);
        c.loyalty = Math.max(0, Math.min(100, c.loyalty));
        this.gainXp(c, 10);
        if (c.army) { c.army.size = Math.max(Math.min(c.army.size, this.troopCap(c)), Math.min(this.troopCap(c), c.army.size + Math.round(this.realmPop(r) * 0.01))); }
        // oaths of brotherhood
        if (!c.oath.length && this.chance(0.08)) {
          const bro = this.realmOfficers(r).find(o => o.id !== c.id && !o.oath.length && this.op(c, o) + this.ri(0, 60) > 50);
          if (bro) { c.oath = [bro.id]; bro.oath = [c.id]; this.opine(c, bro, 40); this.opine(bro, c, 40); this.log(2, 'oath', `${this.fullName(c)} and ${this.fullName(bro)} swear an oath of brotherhood, to live and die as one.`, [c.id, bro.id]); }
        }
        for (const o of this.realmOfficers(r)) if (o.id !== c.id) this.opine(c, o, this.ri(-3, 5));
        // grudge duels
        const foe = Object.entries(c.rel).find(([id, v]) => v < -60 && this.char(+id)?.alive && this.char(+id).realmId === c.realmId);
        if (foe && this.chance(0.3)) { const f = this.char(+foe[0]); const w = this.duel(c, f, 'grudge', false); this.log(2, 'duel', `Old hatred boils over: ${this.fullName(c)} challenges ${this.fullName(f)} to a duel. ${this.fullName(w)} wins${!f.alive || !c.alive ? ', and blood is spilled' : ''}.`, [c.id, f.id]); }
      }
      // rumors fade
      for (const k of Object.keys(c.rumors)) c.rumors[k] = Math.max(0, c.rumors[k] - 0.5);
    }
    this.newBlood();
    this.recomputeAlliances();
    for (const r of this.realmList()) {
      const ruler = this.char(r.rulerId);
      if (!ruler || !ruler.alive) { this.succession(r, ruler); continue; }
      this.appointCouncil(r);
      if (!this.isPlayer(ruler) && r.treasury > 250) {
        // AI rulers turn surplus gold into soldiers
        const offs = this.realmOfficers(r); const spend = Math.min((r.treasury - 250) * 0.6, this.levyCap(r) / 2);
        if (offs.length && spend > 0) {
          r.treasury -= spend; const each = Math.round(spend * 2 / offs.length);
          for (const o of offs) { const room = Math.max(0, this.troopCap(o) - o.army.size); const add = Math.min(room, each); o.army.size += add; r.reserve = Math.min(this.reserveCap(r), (r.reserve || 0) + each - add); }
        }
      }
      if (!this.isPlayer(ruler)) this.investDefences(r);
      const need = r.tier === 'Village' ? 0 : Math.ceil(r.setts.size / 2) + 1;
      if (this.realmOfficers(r).length - 1 < need && this.chance(0.5)) {
        const v = this.living().find(c => c.role === 'vagabond' && this.age(c) >= 18 && this.realmSetts(r).some(s => this.dist(s, c) < 6));
        if (v) { this.addOfficer(r, v); v.army = this.newArmy(v, 0.6); if (v.fame > 10) this.log(1, 'rise', `The wanderer ${this.fullName(v)} enters the service of ${r.name}.`, [v.id]); }
        else { const nc = this.makeChar({ culture: r.culture, age: this.ri(20, 35), role: 'officer', dynasty: this.dynastyName(), noble: true }); this.addOfficer(r, nc); }
      }
      this.pickHeir(r);
      // village rulers with ambition try to unite neighbours
      if (ruler && !this.isPlayer(ruler) && (this.has(ruler, 'ambitious') || ruler.fame > 30) && this.chance(0.12)) {
        const near = this.neighbours(r, 6).filter(o => o.tier === 'Village' && o.setts.size === 1 && !this.atWar(r, o) && !this.isPlayer(this.char(o.rulerId)));
        const v = near.length ? this.pick(near) : null;
        if (v) {
          const vr = this.char(v.rulerId);
          if (ruler.stats.cha + ruler.fame * 0.2 + this.r() * 10 > (vr ? vr.stats.cha + 8 : 5)) {
            this.log(2, 'unite', `${this.fullName(ruler)} of ${r.name} persuades the folk of ${v.name} to join them${vr ? `; ${vr.name} kneels` : ''}.`, [ruler.id, vr?.id].filter(Boolean));
            this.annexVillage(v, r);
          }
        }
      }
      if (r.treasury < -50) r.treasury = -50;
    }
  }

  newBlood() {
    // common folk come of age and take to the road; ruins get resettled
    for (const s of this.setts) {
      if (s.destroyed) {
        if (this.chance(0.07)) {
          const founder = this.living().find(c => (c.role === 'vagabond' || c.role === 'bandit') && !this.isPlayer(c) && !c.companionOf && this.dist(c, s) < 10) || this.makeChar({ culture: s.culture, age: this.ri(22, 45), role: 'vagabond' });
          s.destroyed = false; s.pop = this.ri(80, 200); s.food = 40; s.unrest = 10; s.famine = false; s.realmId = null;
          const r = this.makeRealm(s, founder.id); founder.role = 'ruler'; founder.realmId = r.id; founder.settId = s.id;
          founder.dynasty = founder.dynasty || this.dynastyName(); r.dynasty = founder.dynasty; founder.army = this.newArmy(founder, 0.3); founder.fame += 5;
          this.stats.realmsRisen++;
          this.log(2, 'rise', `${this.fullName(founder)}${founder.fame > 15 ? ', a wanderer of some fame,' : ''} gathers settlers and rebuilds ${s.name} from its ruins.`, [founder.id]);
        }
        continue;
      }
      if (this.living().length < this.setts.length * 9 && this.chance(s.pop / 9000)) {
        const c = this.makeChar({ culture: s.culture, age: this.ri(16, 24), role: this.chance(0.2) ? 'bandit' : 'vagabond' });
        c.settId = s.id; c.x = s.x; c.y = s.y; if (c.role === 'bandit') c.band = this.ri(5, 15);
      }
    }
  }

  seekMarriage(c) {
    const cands = this.living().filter(o => o.id !== c.id && !o.spouseId && o.female !== c.female && this.age(o) >= 17 && Math.abs(this.age(o) - this.age(c)) < 14 && (o.noble || o.role === 'officer' || o.role === 'ruler') && !o.betrothed && !c.parents.includes(o.id) && !o.parents.some(p => c.parents.includes(p)));
    if (!cands.length) return;
    const score = o => (o.culture === c.culture ? 10 : 0) + o.fame * 0.3 + o.stats.cha + this.op(c, o) * 0.2 + (o.role === 'ruler' ? 10 : 0) + this.r() * 10;
    cands.sort((a, b) => score(b) - score(a));
    const mate = cands[0];
    // a rival suitor may demand a duel for the hand
    const rival = cands.slice(1).find(o => o.female === c.female) || this.living().find(o => o.id !== c.id && o.female === c.female && !o.spouseId && this.age(o) >= 17 && this.age(o) < 45 && this.op(o, mate) > 20 && (o.role === 'officer' || o.role === 'vagabond'));
    if (rival && this.chance(0.22)) {
      const w = this.duel(c, rival, 'marriage', false);
      if (!w.alive) return;
      this.opine(w === c ? rival : c, w, -30);
      this.log(2, 'duel', `${this.fullName(c)} and ${this.fullName(rival)} duel for the hand of ${this.fullName(mate)}. ${w.name} wins${(w === c ? rival : c).alive ? '' : ' and the loser lies dead'}.`, [c.id, rival.id, mate.id]);
      this.marry(w, mate, false);
      return;
    }
    this.marry(c, mate, false);
  }

  marry(a, b, silent) {
    a.spouseId = b.id; b.spouseId = a.id; this.opine(a, b, 30); this.opine(b, a, 30);
    if (silent) return;
    if (this.playerId) this.onMarriage(a, b);
    this.stats.marriages++;
    const ra = this.realm(a.realmId), rb = this.realm(b.realmId);
    // a commoner marrying into nobility joins that house
    if (!b.realmId && ra) { b.realmId = ra.id; b.settId = a.settId; }
    if (!a.realmId && rb) { a.realmId = rb.id; a.settId = b.settId; }
    const royal = [a, b].some(x => x.role === 'ruler' || (this.realm(x.realmId) && this.realm(x.realmId).heirId === x.id));
    let ally = '';
    const blood = x => { const rr = this.realm(x.realmId); return rr && (rr.rulerId === x.id || rr.heirId === x.id || this.char(rr.rulerId)?.children.includes(x.id)); };
    if (ra && rb && ra.id !== rb.id && ra.alive && rb.alive && blood(a) && blood(b)) { ally = ` The marriage binds ${ra.name} and ${rb.name} in alliance.`; }
    this.recomputeAlliances();
    const mixed = a.culture !== b.culture ? ` A union of ${cultureById(a.culture).race} and ${cultureById(b.culture).race}.` : '';
    this.log(royal || ally ? 2 : 1, 'marriage', `${this.fullName(a)} weds ${this.fullName(b)}.${ally}${mixed}`, [a.id, b.id]);
  }

  recomputeAlliances() {
    // alliances last only as long as a living marriage ties the two royal houses
    for (const r of this.realms.values()) r.allies = new Set();
    for (const r of this.realmList()) {
      const ruler = this.char(r.rulerId); if (!ruler) continue;
      const royals = [ruler, this.char(r.heirId), ...ruler.children.map(id => this.char(id))].filter(x => x && x.alive && x.spouseId);
      for (const x of royals) {
        const sp = this.char(x.spouseId); if (!sp || !sp.alive) continue;
        const home = this.realmList().find(o => o.id !== r.id && (o.rulerId === sp.id || o.heirId === sp.id || this.char(o.rulerId)?.children.includes(sp.id)));
        if (home) { r.allies.add(home.id); home.allies.add(r.id); }
      }
    }
  }

  pickHeir(r) {
    const ruler = this.char(r.rulerId); if (!ruler) return;
    if (this.isPlayer(ruler)) { const s = this.chosenSuccessor(ruler); for (const c of this.living()) if (c.heir === r.id) c.heir = null; r.heirId = s ? s.id : null; if (s) s.heir = r.id; return; }
    const kids = ruler.children.map(id => this.char(id)).filter(k => k && k.alive && !k.prisonerOf).sort((a, b) => a.born - b.born);
    const adultKids = kids.filter(k => this.age(k) >= 16);
    let heir = adultKids[0] || kids[0];
    if (!heir) {
      // sworn sibling, then most loyal officer, then a trusted companion
      const sworn = ruler.oath.map(id => this.char(id)).find(c => c && c.alive && c.realmId === r.id);
      heir = sworn || this.realmOfficers(r).filter(o => o.id !== ruler.id).sort((a, b) => b.loyalty + b.fame - (a.loyalty + a.fame))[0];
    }
    for (const c of this.living()) if (c.heir === r.id) c.heir = null;
    r.heirId = heir ? heir.id : null; if (heir) heir.heir = r.id;
  }

  succession(r, dead) {
    this.pickHeir(r);
    let heir = this.char(r.heirId);
    if (heir && (!heir.alive || heir.prisonerOf || (heir.loyalty < 25 && !dead?.children.includes(heir.id)))) heir = null;
    const blood = heir && dead && dead.children.includes(heir.id);
    const title = this.rulerTitle(r, heir);
    if (!heir) {
      const setts = this.realmSetts(r);
      if (setts.length) {
        for (const s of setts) if (s.id !== r.capital) { const nr = this.makeRealm(s, null); this.populateRealm(nr); }
        // capital: a local rises to lead it
        r.rulerId = null; const capS = this.sett(r.capital); const local = this.makeChar({ culture: capS.culture, age: this.ri(25, 50), role: 'ruler', dynasty: this.dynastyName() });
        local.realmId = r.id; local.settId = r.capital; r.rulerId = local.id; r.dynasty = local.dynasty; local.army = this.newArmy(local, 0.5);
        this.log(3, 'succession', `${dead ? this.fullName(dead) : 'The ruler'} of ${r.name} dies with no one to succeed them. The realm shatters into ${setts.length} squabbling holdings.`, [dead?.id, local.id].filter(Boolean));
        this.stats.realmsFallen++;
      } else this.killRealm(r, null);
      return;
    }
    r.rulerId = heir.id; heir.role = 'ruler'; heir.realmId = r.id; heir.liegeId = null; heir.settId = r.capital;
    if (!heir.army) heir.army = this.newArmy(heir, 0.8);
    if (!blood) { r.dynasty = heir.dynasty || this.dynastyName(); heir.dynasty = r.dynasty; }
    const how = blood ? `their child ${this.fullName(heir)} takes the throne` : heir.oath.includes(dead?.id) ? `their sworn sibling ${this.fullName(heir)} takes up the crown` : `the officer ${this.fullName(heir)} claims the seat`;
    let tale = `${dead ? this.fullName(dead) : 'The ruler'} of ${r.name} is dead (${dead?.cause || 'unknown causes'}). ${how[0].toUpperCase() + how.slice(1)} as ${title}.`;
    // legitimacy: breakaways and claimants
    const legit = blood ? 0.85 : heir.oath.includes(dead?.id) ? 0.6 : 0.35;
    const broke = [];
    for (const s of this.realmSetts(r)) {
      if (s.id === r.capital) continue;
      if (this.chance((1 - legit) * 0.3 + Math.min(0.2, s.unrest / 400))) { const nr = this.makeRealm(s, null); this.populateRealm(nr); broke.push(s.name); }
    }
    if (broke.length) tale += ` Doubting the new ruler, ${broke.join(', ')} break${broke.length === 1 ? 's' : ''} away.`;
    const claimant = this.realmOfficers(r).find(o => o.id !== heir.id && this.has(o, 'ambitious') && o.loyalty < 50 && this.power(o) > this.power(heir) * 0.8);
    if (claimant && this.chance(0.55 - legit * 0.3)) {
      tale += ` ${this.fullName(claimant)} refuses to kneel and raises their banners. Civil war!`;
      const homes = this.realmSetts(r).filter(s => s.id !== r.capital);
      const base = homes.length ? this.pick(homes) : null;
      if (base) {
        const nr = this.makeRealm(base, claimant.id); claimant.role = 'ruler'; claimant.realmId = nr.id; nr.dynasty = claimant.dynasty; this.stats.realmsRisen++;
        this.declareWar(nr, r, 'the right to rule');
      }
    }
    this.log(3, 'succession', tale, [dead?.id, heir.id, claimant?.id].filter(Boolean));
    this.pickHeir(r);
  }

  die(c, cause) {
    if (!c.alive) return;
    if (this.isPlayer(c) && this.mode === 'casual' && !this.spared) {
      this.spared = true; c.wounded = 12;
      this.you(`You are struck down (${cause}), but against all odds you live. Casual mode spares you once; the next blow will be final.`, [], 3);
      return;
    }
    c.alive = false; c.died = this.year; c.cause = cause; this.stats.deaths++;
    if (c.spouseId) { const s = this.char(c.spouseId); if (s) s.spouseId = null; }
    if (this.unique.strongest === c.id) this.unique.strongest = null;
    const r = this.realm(c.realmId);
    if (r && r.rulerId === c.id && r.alive) this.succession(r, c);
    else if (r && r.heirId === c.id && r.alive) {
      const ruler = this.char(r.rulerId);
      this.log(2, 'death', `${this.fullName(c)}, heir of ${r.name}, dies of ${cause}.${ruler ? ` ${ruler.name} grieves.` : ''}`, [c.id]);
      this.pickHeir(r);
    } else if (c.fame > 25 || c.titles.deed) this.log(2, 'death', `${this.fullName(c)} dies (${cause}).${c.titles.deed ? ` The ${c.titles.deed} passes into legend.` : ''}`, [c.id]);
    for (const b of c.oath) { const bb = this.char(b); if (bb && bb.alive) { this.opine(bb, c, 10); } }
    const wasPlayer = this.isPlayer(c);
    if (wasPlayer) this.playerDied(c, cause);
    if (this.playerId) this.onDeath(c, wasPlayer);
    if (c.mercId) { const m = this.mercs.find(x => x.id === c.mercId); if (m) { const vets = this.living().filter(x => x.role === 'vagabond' && this.dist(x, c) < 8); const nc = vets[0] || this.makeChar({ culture: c.culture, age: this.ri(25, 40), role: 'merc' }); nc.role = 'merc'; nc.mercId = m.id; m.captainId = nc.id; } }
  }

  // ---------- realm tiers ----------
  updateTiers(silent = false) {
    for (const r of this.realmList()) {
      const n = this.realmSetts(r).length;
      if (n === 0) { this.killRealm(r, null); continue; }
      const old = r.tier;
      r.tier = n >= 7 || (old === 'Kingdom' && n >= 5) ? 'Kingdom' : n >= 3 || (old === 'Lordship' && n >= 2) ? 'Lordship' : 'Village';
      if (!silent && old !== r.tier) {
        const ruler = this.char(r.rulerId);
        if (r.tier === 'Kingdom' && old !== 'Kingdom' && r.crowned !== r.rulerId) { r.crowned = r.rulerId; this.log(3, 'rise', `${r.name} has grown into a kingdom. ${ruler ? this.fullName(ruler) + ' is crowned ' + this.rulerTitle(r, ruler) + '.' : ''}`, [ruler?.id].filter(Boolean)); if (ruler) ruler.fame += 20; }
        else if (r.tier === 'Lordship' && old === 'Village') { this.log(2, 'rise', `${r.name} has grown from a village into a lordship under ${ruler ? this.fullName(ruler) : 'its leaders'}.`, [ruler?.id].filter(Boolean)); if (ruler) ruler.fame += 8; }
        else if (old === 'Kingdom') this.log(2, 'fall', `${r.name} has shrunk and is a kingdom no longer.`, []);
      }
    }
  }

  // =====================================================================
  // THE PLAYER. Everything you do goes through act(), which is recorded so
  // the world can be rebuilt exactly from its seed and your choices.
  // =====================================================================
  get monthIndex() { return (this.year - 1) * 12 + this.month; }
  get player() { return this.playerId ? this.char(this.playerId) : null; }
  isPlayer(c) { return !!c && c.id === this.playerId; }
  playerRealm() { const p = this.player; const r = p && this.realm(p.realmId); return r && r.alive ? r : null; }
  playerRules() { const p = this.player, r = this.playerRealm(); return !!(p && r && r.rulerId === p.id); }
  you(text, ids = [], importance = 2) { this.log(importance, 'you', text, [this.playerId, ...ids].filter(Boolean)); }

  act(a) {
    if (!this.replaying) this.actions.push({ m: this.monthIndex, a });
    const fn = this['act_' + a.type];
    if (!fn) return 'Unknown action.';
    if (a.type !== 'start' && (!this.player || !this.player.alive)) return 'You are no longer among the living.';
    if (COURT_ACTS.includes(a.type) && this.playerRules() && !this.atSeat()) return `That has to be done from your seat. ${this.awayReason()} Your steward rules until you return.`;
    const out = fn.call(this, a) || '';
    if (a.type === 'start' && this.player) this.initKnowledge();
    return out;
  }

  // ---------- starting a life ----------
  act_start(a) {
    this.gameOver = null; this.spared = false; this.mode = a.mode || 'ironman';
    const cul = cultureById(a.culture) ? a.culture : this.pick(CULTURES).id;
    const name = (a.name || '').trim().slice(0, 24) || null;
    let c = null, where = '';
    const ofCulture = list => { const m = list.filter(x => x.culture === cul); return m.length ? m : list; };
    if (a.origin === 'headman' || a.origin === 'lord') {
      const tier = a.origin === 'headman' ? 'Village' : 'Lordship';
      let pool = ofCulture(this.realmList().filter(r => r.tier === tier && this.char(r.rulerId)));
      if (!pool.length) pool = this.realmList().filter(r => this.char(r.rulerId));
      const r = this.pick(pool); const old = this.char(r.rulerId);
      c = this.makeChar({ culture: r.culture, age: this.ri(20, 28), role: 'ruler', dynasty: r.dynasty || this.dynastyName(), noble: true, female: a.female });
      if (old) { const mom = old.spouseId ? this.char(old.spouseId) : null; if (mom) this.setParents(c, old, mom); else { c.parents = [old.id]; old.children.push(c.id); } }
      c.realmId = r.id; c.settId = r.capital; r.rulerId = c.id; c.army = this.newArmy(c, r.tier === 'Village' ? 0.4 : 1);
      const cap = this.sett(r.capital); c.x = cap.x; c.y = cap.y;
      if (old && old.alive) { old.alive = false; old.died = this.year; old.cause = 'old age and a long illness'; }
      where = `${this.rulerTitle(r, c)} of ${r.name}, inheriting from ${old ? old.name : 'your kin'}`;
    } else if (a.origin === 'heir') {
      const young = r => this.char(r.rulerId).children.map(id => this.char(id)).filter(k => k && k.alive).every(k => this.age(k) < 24);
      let pool = ofCulture(this.realmList().filter(r => r.tier === 'Kingdom' && this.char(r.rulerId)));
      if (!pool.length) pool = this.realmList().filter(r => r.tier !== 'Village' && this.char(r.rulerId));
      if (pool.some(young)) pool = pool.filter(young);
      const r = this.pick(pool); const king = this.char(r.rulerId);
      const eldest = king.children.map(id => this.char(id)).filter(k => k && k.alive).reduce((m, k) => Math.max(m, this.age(k)), 17);
      c = this.makeChar({ culture: r.culture, age: Math.min(Math.max(18, eldest + 1), Math.max(18, this.age(king) - 17)), role: 'officer', dynasty: king.dynasty || r.dynasty, noble: true, female: a.female });
      const mom = king.spouseId ? this.char(king.spouseId) : null; if (mom) this.setParents(c, king, mom); else { c.parents = [king.id]; king.children.push(c.id); }
      this.addOfficer(r, c); c.loyalty = 90; c.army = this.newArmy(c, 0.8); this.opine(king, c, 40);
      const cap = this.sett(r.capital); c.x = cap.x; c.y = cap.y;
      this.pickHeir(r);
      where = `heir to ${this.rulerTitle(r, king)} ${king.name} of ${r.name}`;
    } else {
      const s = this.pick(ofCulture(this.setts.filter(s => !s.destroyed)));
      c = this.makeChar({ culture: s.culture, age: this.ri(18, 24), role: 'vagabond', female: a.female });
      c.settId = s.id; c.x = s.x; c.y = s.y; c.gold = 40; c.followers = 6;
      const mates = this.living().filter(v => v.role === 'vagabond' && v.id !== c.id && this.dist(v, s) < 8 && !v.companionOf).slice(0, this.ri(1, 2));
      for (const m of mates) { m.companionOf = c.id; this.opine(m, c, 40); this.opine(c, m, 40); }
      where = `a landless wanderer at ${s.name}${mates.length ? `, with ${mates.map(m => m.name).join(' and ')} at your side` : ''}`;
    }
    if (name) c.name = name;
    c.gold = c.gold || 0; c.followers = c.followers || 0;
    c.stats.lea += 2; c.stats.mig += 2; c.stats.int += 2; c.stats.cha += 2; // the chronicle favours its subject, a little
    this.playerId = c.id; this.line = [c.id];
    this.you(`Your story begins. You are ${this.fullName(c)}, ${where}.`, [], 3);
    return 'Your story begins.';
  }

  // ---------- successor ----------
  kin(a, b) { return a.children.includes(b.id) || b.children.includes(a.id) || (a.parents.length && a.parents.some(p => b.parents.includes(p))); }
  successorCandidates(c = this.player) {
    if (!c) return [];
    const set = new Map();
    const add = (x, why) => { if (x && x.alive && x.id !== c.id && !set.has(x.id)) set.set(x.id, { c: x, why }); };
    for (const id of c.children) add(this.char(id), 'child');
    for (const id of c.oath) add(this.char(id), 'sworn sibling');
    for (const x of this.living()) if (x.companionOf === c.id) add(x, 'companion');
    const r = this.realm(c.realmId);
    if (r && r.rulerId === c.id) for (const o of this.realmOfficers(r)) add(o, o.titles.rank || 'officer');
    for (const x of this.living()) if (x.parents.length && c.parents.length && x.parents.some(p => c.parents.includes(p))) add(x, 'sibling');
    return [...set.values()];
  }
  successorValid(c, s) {
    if (!s || !s.alive || s.prisonerOf) return { ok: false, why: s ? (s.prisonerOf ? 'is a prisoner' : 'is dead') : 'none named' };
    if (this.kin(c, s)) return { ok: true };
    const o = this.op(s, c);
    return o >= 20 ? { ok: true } : { ok: false, why: `does not trust you enough (opinion ${Math.round(o)}, needs 20)` };
  }
  chosenSuccessor(c = this.player) {
    if (!c) return null;
    if (c.successorId) { const s = this.char(c.successorId); if (s && s.alive) return s; }
    const cands = this.successorCandidates(c);
    const kids = cands.filter(x => x.why === 'child').map(x => x.c).sort((a, b) => a.born - b.born);
    return kids[0] || cands.map(x => x.c)[0] || null;
  }
  act_successor(a) { const p = this.player, s = this.char(a.id); if (!s) return; p.successorId = s.id; this.you(`You name ${this.fullName(s)} as your successor.`, [s.id], 1); return `${s.name} will carry on your line.`; }

  playerDied(c, cause) {
    const s = this.chosenSuccessor(c); const v = this.successorValid(c, s);
    if (s && v.ok) {
      this.playerId = s.id; this.line.push(s.id); s.successorId = null;
      if (c.gold) s.gold = (s.gold || 0) + c.gold;
      if (c.role === 'vagabond' || c.followers) { s.followers = (s.followers || 0) + Math.round((c.followers || 0) * 0.7); }
      for (const x of this.living()) if (x.companionOf === c.id && x.id !== s.id) x.companionOf = s.id;
      if (!s.x && c.x) { s.x = c.x; s.y = c.y; s.settId = c.settId; }
      this.you(`${this.fullName(c)} is dead (${cause}). The story continues with ${this.fullName(s)}.`, [c.id], 3);
    } else {
      this.gameOver = { year: this.year, month: this.month, name: this.fullName(c), cause, why: s ? `${s.name} ${v.why}` : 'there was no one to carry on' };
      this.log(3, 'you', `${this.fullName(c)} is dead (${cause}), and ${this.gameOver.why}. Your line ends here, but the world goes on.`, [c.id]);
    }
  }

  // ---------- each month: your journeys, plots and companions ----------
  playerTick() {
    const p = this.player; if (!p || !p.alive) return;
    if (p.role === 'officer') p.gold = (p.gold || 0) + 2;
    if (p.task && !p.prisonerOf) {
      const t = p.task; const dest = t.lair ? this.lairs.find(l => l.id === t.lair) : t.bandit ? this.char(t.bandit) : this.sett(t.to);
      if (!dest || (t.bandit && !dest.alive) || (t.lair && !dest.alive)) { p.task = null; this.you(`Your quarry is gone before you arrive.`, [], 1); }
      else {
        const g = this.grid[Math.round(p.y)]?.[Math.round(p.x)];
        let sp = MOVE.land * 1.05 * (this.season === 'Winter' ? 0.75 : 1); if (g === 'swamp' || g === 'mountain') sp *= 0.6;
        if (p.delayed > 0) { p.delayed--; } // held up on the road this month
        else if (!advance(this, p, dest, sp, MOVE.sea)) {
          const b = !p.atSea && this.living().find(x => x.role === 'bandit' && this.dist(x, p) < 3 && x.band > (p.followers || 0) * 0.5);
          if (b && !t.bandit && this.chance(0.06)) { p.task = null; this.you(`Bandits under ${this.fullName(b)} ambush you on the road!`, [b.id], 2); this.skirmish(b, true); }
        } else {
          p.x = dest.x; p.y = dest.y; p.task = null;
          if (t.bandit) this.skirmish(dest, false);
          else if (t.lair) this.huntResolve(dest, t.approach);
          else { p.settId = dest.id; this.reveal(dest.x, dest.y, 10); this.learnLocals(dest); this.you(`You arrive at ${dest.name}.`, [], 1); }
        }
      }
    }
    for (const x of this.living()) if (x.companionOf === p.id) { x.x = p.x; x.y = p.y; x.settId = p.settId; if (p.realmId && x.realmId !== p.realmId && p.role !== 'vagabond') { x.realmId = p.realmId; if (x.role === 'vagabond') this.addOfficer(this.realm(p.realmId), x); } }
    if (p.challenge && this.monthIndex >= p.challenge.due) { this.act_answer({ accept: false }); }
    if (this.month === 9) this.challengesForPlayer();
    // companions grow closer on the road
    for (const x of this.living()) if (x.companionOf === p.id && this.chance(0.5)) this.opine(x, p, 1);
    // plots against you (most arrive as assassins on the map; a few strike from within)
    for (const plot of [...(this.plots || [])]) if (!plot.agentId && this.monthIndex >= plot.due) this.resolvePlayerPlot(plot);
  }
  resolvePlayerPlot(plot) {
    const p = this.player; if (!plot || !p) return;
    { const i = (this.plots || []).indexOf(plot); if (i < 0) return; this.plots.splice(i, 1);
      const plotter = this.char(plot.by);
      if (!p.alive || !plotter || !plotter.alive) return;
      if (plot.settId && p.settId !== plot.settId && p.role === 'vagabond') { this.you(`An assassin sent after you loses your trail.`, [], 2); return; }
      const r = this.playerRealm();
      const guard = r && this.playerRules() ? this.guardSetting(r) : 'Light';
      const cpt = r && this.captain(r);
      let catchP = GUARD[guard].catch + (cpt ? cpt.stats.lea * 0.008 : 0) + (plot.warned ? 0.15 : 0) + (r ? (this.spymaster(r)?.stats.int || 0) * 0.01 : p.stats.int * 0.01) - plotter.stats.int * 0.01;
      if (p.role === 'vagabond') catchP += (this.living().filter(x => x.companionOf === p.id).length) * 0.08;
      if (this.chance(Math.max(0.12, Math.min(0.9, catchP)))) {
        this.stats.foiled++; this.opine(p, plotter, -70);
        this.you(`An assassin disguised as ${plot.disguise} is caught before reaching you. Under questioning they name ${this.fullName(plotter)}.`, [plotter.id], 3);
      } else {
        this.stats.assassinations++;
        this.die(p, `assassinated by an agent of ${plotter.name}`);
      }
    }
  }
  plotAgainstPlayer(plotter, motive) {
    const p = this.player; if (!p || (this.plots || []).some(x => x.by === plotter.id)) return;
    const r = this.playerRealm();
    const sm = r ? this.spymaster(r) : null;
    const sense = (sm ? sm.stats.int : p.stats.int) + this.living().filter(x => x.companionOf === p.id).length * 2;
    const warned = this.chance(Math.min(0.9, 0.15 + sense * 0.035));
    const plot = { id: this.id(), by: plotter.id, due: this.monthIndex + 99, warned, disguise: this.pick(['a merchant', 'a pilgrim', 'a performer', 'a cook', 'a priest', 'a fellow traveler']), settId: p.settId };
    (this.plots || (this.plots = [])).push(plot);
    const from = this.sett(plotter.settId) || this.sett(this.realm(plotter.realmId)?.capital) || this.pick(this.setts.filter(s => !s.destroyed));
    const ag = this.spawnAgent('assassin', plotter.realmId, from, this.sett(p.settId) || this.sett(this.realm(p.realmId)?.capital), { by: plotter.id, target: p.id, plotId: plot.id, cover: plot.disguise, culture: plotter.culture, follow: p.role === 'vagabond' ? null : null });
    if (ag) plot.agentId = ag.id; else plot.due = this.monthIndex + 3;
    if (warned) this.you(`${sm && sm.id !== p.id ? `Your spymaster ${sm.name} hears` : 'You hear'} whispers of a plot against your life${sense > 14 ? `. The trail leads to ${this.fullName(plotter)}` : ''}. ${this.playerRules() ? 'Tightening the guard may save you.' : 'Moving on may save you.'}`, sense > 14 ? [plotter.id] : [], 3);
  }

  // ---------- vagabond life ----------
  act_travel(a) {
    const p = this.player, s = this.sett(a.to); if (!s || s.destroyed) return 'There is nothing there to travel to.';
    if (p.prisonerOf) return 'You are a prisoner.';
    p.task = { type: 'travel', to: s.id };
    const months = this.tripMonths(p, s);
    return `You set out for ${s.name}. About ${months} month${months === 1 ? '' : 's'} on the road${landAt(this, p) !== landAt(this, s) ? ', with a sea crossing' : ''}.`;
  }
  contractsHere() {
    const p = this.player; if (!p) return [];
    const out = [];
    for (const b of this.living()) if (b.role === 'bandit' && this.dist(b, p) < 9) out.push({ kind: 'bandit', id: b.id, label: `Hunt the bandit ${this.fullName(b)} (${b.band} cutthroats)`, reward: 20 + b.band, odds: this.banditOdds(b), dist: this.dist(b, p) });
    for (const L of this.lairs) if (L.alive && L.strength > 18 && this.dist(L, p) < 11) out.push({ kind: 'lair', id: L.id, label: `Clear the lair of ${this.lairName(L)}`, reward: Math.round(30 + L.strength * L.base), lair: L, dist: this.dist(L, p) });
    return out.sort((a, b) => a.dist - b.dist).slice(0, 6);
  }
  playerForce() { const p = this.player; return (p.followers || 0) * 1 + this.living().filter(x => x.companionOf === p.id).length * 4 + p.stats.mig * 0.6 + p.stats.lea * 0.4; }
  banditOdds(b) { const r = this.playerForce() / Math.max(1, b.band * 0.9 + b.stats.mig * 0.5); return Math.max(0.03, Math.min(0.97, r * r / (1 + r * r))); }
  huntOdds(L, approach) {
    const p = this.player; const M = MON[L.key];
    const stat = approach === 'tame' ? p.stats.cha : approach === 'trap' ? p.stats.int : p.stats.mig;
    const skill = stat * 1.6 + (p.followers || 0) * 0.5 + this.living().filter(x => x.companionOf === p.id).length * 3 + 12;
    const threat = L.strength * L.base * 0.35 + 10 + (approach === 'slay' ? 0 : 4);
    const r = skill / threat; return Math.max(0.03, Math.min(0.95, r * r / (1 + r * r)));
  }
  act_contract(a) {
    const p = this.player;
    if (a.kind === 'bandit') { const b = this.char(a.id); if (!b || !b.alive) return 'They are gone.'; p.task = { type: 'contract', bandit: b.id }; this.you(`You take coin to hunt the bandit ${this.fullName(b)}.`, [b.id], 1); return `You ride after ${b.name}.`; }
    const L = this.lairs.find(l => l.id === a.id); if (!L || !L.alive) return 'The lair is empty.';
    if (a.approach === 'tame' && !MON[L.key].tame) return 'That cannot be tamed.';
    if (a.approach === 'trap' && (MON[L.key].rift || L.key === 'dragon')) return 'That cannot be trapped.';
    p.task = { type: 'contract', lair: L.id, approach: a.approach || 'slay' };
    this.you(`You set out to ${a.approach || 'slay'} ${this.lairName(L)}.`, [], 1); return 'You set out for the lair.';
  }
  huntResolve(L, approach) {
    const p = this.player; const M = MON[L.key]; const odds = this.huntOdds(L, approach);
    if (this.chance(odds)) {
      const reward = Math.round(30 + L.strength * L.base); p.gold = (p.gold || 0) + reward; p.fame += Math.round(8 * L.base); this.gainXp(p, 60);
      let title = approach === 'tame' ? 'Beast Tamer' : approach === 'trap' ? 'Trapper' : M.key === 'dragon' ? 'Dragonslayer' : L.base >= 2.8 ? 'Giant Slayer' : 'Monster Slayer';
      const got = this.grantDeed(p, title);
      if (approach === 'tame') p.followers = (p.followers || 0) + Math.round(6 * L.base);
      L.alive = false; if (this.chance(0.6)) this.respawnLair(L);
      this.you(`You ${approach === 'tame' ? `tame ${this.lairName(L)} and lead the beasts home` : approach === 'trap' ? `capture ${this.lairName(L)} alive` : M.rift ? `fight through the elementals and close ${this.lairName(L)}` : `slay ${this.lairName(L)}`}. The villages pay you ${reward} gold.${got ? ` Bards now call you ${title}.` : ''}`, [], 3);
    } else {
      const lost = Math.round((p.followers || 0) * (0.3 + this.r() * 0.4)); p.followers = Math.max(0, (p.followers || 0) - lost);
      if (this.chance(0.35 + (1 - odds) * 0.3)) this.die(p, `killed by ${this.lairName(L)}`);
      else { p.wounded = 8; this.you(`${(n => n[0].toUpperCase() + n.slice(1))(this.lairName(L))} drives you back. You escape badly wounded${lost ? `, and ${lost} of your followers do not` : ''}.`, [], 3); }
    }
  }
  skirmish(b, ambush) {
    // a small fight on the battle map: your followers against a bandit band
    const p = this.player; const g = this.grid[Math.round(p.y)]?.[Math.round(p.x)] || 'plains';
    const entry = (f, roles) => { const i = UNITS[f].findIndex(u => u.entry && roles.includes(u.role)); return i >= 0 ? i : 0; };
    const mates = this.living().filter(x => x.companionOf === p.id);
    // an officer or lord brings their own army; a wanderer brings their band
    const yourCount = Math.max(3, (p.followers || 0) + mates.length * 3 + (p.army ? Math.min(p.army.size, 400) : 0));
    const cfg = { seed: Math.floor(this.r() * 1e9), terrain: g === 'water' ? 'plains' : g, season: this.season, sides: [
      { faction: p.culture, name: 'Your band', realmId: null, color: '#4fa3ff', ai: 'balanced', canFire: false, mods: { morale: 5, atk: 1 }, divisions: [{ faction: p.culture, unit: this.pickUnit(p, p.culture), count: yourCount, level: Math.min(10, 1 + Math.floor(p.level / 2)), officer: { name: p.name, stats: p.stats, ref: p.id } }] },
      { faction: b.culture, name: `${b.name}'s bandits`, realmId: null, color: '#ff5a4a', ai: ambush ? 'reckless' : 'balanced', canFire: false, mods: { morale: ambush ? 8 : 0, atk: 1 }, divisions: [{ faction: b.culture, unit: entry(b.culture, ['inf', 'cav']), count: Math.max(4, b.band), level: 2, officer: { name: b.name, stats: b.stats, ref: b.id } }] },
    ] };
    this.stats.battles++;
    const ctx = { kind: 'skirmish', index: this.stats.battles, cfg, bandit: b, playerSide: 0, lines: [], big: false, title: ambush ? `Ambush! ${b.name}'s bandits fall on you` : `You hunt down ${b.name}'s bandits` };
    this.queueBattle(ctx);
  }
  applySkirmish(ctx, b) {
    const p = this.player, band = ctx.bandit; const won = b.winner === 0;
    const mine = b.divisions[0], theirs = b.divisions[1];
    const survive = (b.aliveCount(mine) + mine.fled) / mine.start;
    p.followers = Math.max(0, Math.round((p.followers || 0) * survive));
    if (p.army) p.army.size = Math.max(10, Math.round(p.army.size * (0.8 + 0.2 * survive)));
    if (!mine.officer.alive) { this.die(p, `cut down by the bandits of ${band.name}`); return; }
    if (won) {
      const reward = 20 + band.band; p.gold = (p.gold || 0) + reward; p.fame += 8; p.kills++; this.gainXp(p, 40);
      if (!theirs.officer.alive || this.chance(0.6)) this.die(band, `slain by ${p.name}`); else band.band = Math.round(band.band * 0.3);
      this.you(`You defeat the bandits of ${band.name}${band.alive ? ', who flees into the hills' : ''}. The villages pay you ${reward} gold.`, [band.id], 2);
    } else {
      const lost = Math.round((p.gold || 0) * 0.5); p.gold = (p.gold || 0) - lost; p.wounded = 6;
      if (mine.officer.captured) { this.you(`The bandits of ${band.name} beat you, strip you of ${lost} gold and leave you for dead.`, [band.id], 2); }
      else this.you(`Your band breaks before ${band.name}'s cutthroats. You flee, ${lost} gold poorer.`, [band.id], 2);
      band.fame += 4; band.band += 3;
    }
  }
  act_hire(a) {
    const p = this.player, s = this.sett(p.settId); if (!s || s.destroyed) return 'There is no one here to hire.';
    const n = Math.max(0, Math.min(a.n || 5, Math.floor((p.gold || 0) / 6), Math.floor(s.pop / 40)));
    if (!n) return 'You cannot afford anyone.';
    p.gold -= n * 6; p.followers = (p.followers || 0) + n;
    return `You hire ${n} sellswords at ${s.name}.`;
  }
  act_recruitCompanion(a) {
    const p = this.player, v = this.char(a.id); if (!v || !v.alive) return 'They are gone.';
    if ((p.gold || 0) < 20) return 'You need 20 gold to stand them a feast and a share.';
    p.gold -= 20;
    if (this.chance(0.35 + p.stats.cha * 0.03 + p.fame * 0.005)) { v.companionOf = p.id; this.opine(v, p, 35); this.opine(p, v, 35); this.you(`${this.fullName(v)} joins you as a companion.`, [v.id], 2); return `${v.name} joins you.`; }
    this.opine(v, p, -5); return `${v.name} drinks your ale and declines.`;
  }
  act_serve(a) {
    const p = this.player, r = this.realm(a.realm); if (!r || !r.alive) return 'That realm is gone.';
    const ruler = this.char(r.rulerId);
    if (p.fame + p.stats.cha + this.r() * 10 < 22) return `${ruler ? ruler.name : 'The lord'} turns you away. Come back with more of a name.`;
    const fol = p.followers || 0;
    this.addOfficer(r, p); p.army = this.newArmy(p, 0.6); p.army.size += fol; p.followers = 0; p.task = null;
    for (const x of this.living()) if (x.companionOf === p.id) { this.addOfficer(r, x); x.army = this.newArmy(x, 0.4); }
    this.you(`You kneel before ${ruler ? `${this.rulerTitle(r, ruler)} ${this.fullName(ruler)}` : r.name} and are made an officer of ${r.name}, at the head of ${p.army.size} troops.`, [ruler?.id].filter(Boolean), 3);
    return `You serve ${r.name} now.`;
  }
  act_found(a) {
    const p = this.player;
    if ((p.followers || 0) < 12 || p.fame < 15) return 'You need at least 12 followers and some renown (fame 15).';
    let s = this.setts.filter(x => x.destroyed && this.dist(x, p) < 7).sort((x, y) => this.dist(x, p) - this.dist(y, p))[0];
    let rebuilt = !!s;
    if (!s) {
      let best = null;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = Math.round(p.x) + dx, y = Math.round(p.y) + dy; const b = this.grid[y]?.[x];
        if (!b || b === 'water' || b === 'mountain') continue;
        if (this.setts.some(o => (o.x - x) ** 2 + (o.y - y) ** 2 < 9)) continue;
        const d = dx * dx + dy * dy; if (!best || d < best.d) best = { x, y, d, b };
      }
      if (!best) return 'There is no free land near here.';
      const cul = cultureById(p.culture);
      s = { id: this.id(), name: this.placeName(cul), x: best.x, y: best.y, biome: best.b, culture: p.culture, pop: 0, food: 0, unrest: 0, realmId: null, destroyed: false, famine: false, guard: 'Light', headmanId: null };
      this.setts.push(s);
    }
    s.destroyed = false; s.pop = 60 + (p.followers || 0) * 6; s.food = 60; s.unrest = 5; s.famine = false; s.realmId = null;
    const r = this.makeRealm(s, p.id); p.role = 'ruler'; p.realmId = r.id; p.settId = s.id; p.dynasty = p.dynasty || this.dynastyName(); r.dynasty = p.dynasty;
    p.army = { size: p.followers, level: 2, xp: 0, wins: 0, losses: 0, faction: p.culture, unit: this.pickUnit(p, p.culture) }; p.followers = 0; p.task = null;
    for (const x of this.living()) if (x.companionOf === p.id) { this.addOfficer(r, x); x.army = this.newArmy(x, 0.3); }
    this.stats.realmsRisen++;
    this.you(`You ${rebuilt ? `rebuild ${s.name} from its ruins` : `found the village of ${s.name}`} and become its ${p.female ? 'headwoman' : 'headman'}. House ${p.dynasty} begins.`, [], 3);
    return `${s.name} is yours.`;
  }

  // ---------- officer life ----------
  act_train() {
    const p = this.player; if (!p.army) return 'You command no troops.';
    if (p.trainedYear === this.year) return 'Your troops have trained hard this year already.';
    p.trainedYear = this.year; this.armyXp(p, 35); this.gainXp(p, 15); return `You drill your ${this.plural(this.unitName(p.army))} hard.`;
  }
  act_leave() {
    const p = this.player, r = this.playerRealm(); if (!r || p.role !== 'officer') return 'You serve no one.';
    p.followers = Math.round((p.army?.size || 0) * 0.15); p.army = null; p.role = 'vagabond'; p.realmId = null; p.liegeId = null; p.titles.rank = null;
    const ruler = this.char(r.rulerId); if (ruler) this.opine(ruler, p, -25);
    this.you(`You leave the service of ${r.name} with ${p.followers} loyal soldiers at your back.`, [ruler?.id].filter(Boolean), 2); return 'You take to the road again.';
  }
  act_oath(a) {
    const p = this.player, o = this.char(a.id); if (!o || !o.alive) return 'They are gone.';
    if (p.oath.length) return 'You are already sworn.';
    if (this.op(o, p) + p.stats.cha + this.r() * 30 < 45) { this.opine(o, p, -5); return `${o.name} is not ready to bind their fate to yours.`; }
    p.oath = [o.id]; o.oath = [p.id]; this.opine(o, p, 40); this.opine(p, o, 40);
    this.you(`You and ${this.fullName(o)} swear an oath of brotherhood, to live and die as one.`, [o.id], 2); this.onOath(o); return `You are sworn to ${o.name}.`;
  }
  act_rebel() {
    const p = this.player, r = this.playerRealm(); if (!r || p.role !== 'officer') return 'You have no one to rebel against.';
    const holdings = this.realmSetts(r).filter(s => s.id !== r.capital).sort((a, b) => this.dist(a, p) - this.dist(b, p));
    if (!holdings.length) return 'There is no holding to seize.';
    const s = holdings[0]; const ruler = this.char(r.rulerId);
    const nr = this.makeRealm(s, p.id); p.role = 'ruler'; p.realmId = nr.id; p.settId = s.id; p.liegeId = null; nr.dynasty = p.dynasty || this.dynastyName(); p.dynasty = nr.dynasty;
    if (p.oath.length) { this.spreadRumor(p, 'oathbreaker', 1); }
    this.spreadRumor(p, 'traitor', 2);
    this.stats.realmsRisen++;
    this.you(`You raise your banners at ${s.name} and declare yourself free of ${r.name}!`, [ruler?.id].filter(Boolean), 3);
    this.declareWar(r, nr, `the rebellion of ${p.name}`);
    return 'Rebellion!';
  }

  // ---------- ruling ----------
  act_tax(a) { const r = this.playerRealm(); r.tax = a.level; return `Taxes are now ${a.level}.`; }
  act_guard(a) { const r = this.playerRealm(); r.guardChoice = a.level; const cap = this.sett(r.capital); if (cap) cap.guard = a.level; return `The guard is now ${a.level}.`; }
  act_war(a) {
    const r = this.playerRealm(), t = this.realm(a.realm); if (!t || !t.alive) return 'That realm is gone.';
    if (this.atWar(r, t)) return 'You are already at war with them.';
    if ((r.truce.get(t.id) || 0) > this.year) { this.spreadRumor(this.player, 'oathbreaker', 2); }
    if (r.allies.has(t.id)) { this.spreadRumor(this.player, 'oathbreaker', 3); r.allies.delete(t.id); t.allies.delete(r.id); }
    this.declareWar(r, t, a.reason || 'your ambition'); return `War with ${t.name}!`;
  }
  act_peace(a) {
    const r = this.playerRealm(); const w = this.wars.find(x => !x.over && (x.a === r.id || x.b === r.id) && (x.a === a.realm || x.b === a.realm));
    if (!w) return 'You are not at war with them.';
    const mineScore = w.a === r.id ? w.score : -w.score;
    const their = this.realm(a.realm); const tr = this.char(their.rulerId);
    const p = 0.25 + (mineScore >= 0 ? 0.25 : -0.1 * Math.min(3, -mineScore)) + (tr && this.has(tr, 'content') ? 0.2 : 0) + (tr && this.has(tr, 'ambitious') ? -0.15 : 0) + w.months * 0.01;
    if (!this.chance(Math.max(0.05, Math.min(0.9, p)))) return `${their.name} rejects your envoys. The war goes on.`;
    this.makePeace(w, this.realm(w.a), this.realm(w.b)); return `Peace with ${their.name}.`;
  }
  act_persuade(a) {
    const r = this.playerRealm(), v = this.realm(a.realm), p = this.player;
    if (!v || !v.alive || v.setts.size !== 1) return 'They are no free village.';
    if (r.persuadedYear === this.year) return 'Your envoys need time; try again next year.';
    r.persuadedYear = this.year;
    const vr = this.char(v.rulerId);
    if (p.stats.cha + p.fame * 0.2 + (r.aidGiven || 0) * 3 + this.r() * 10 > (vr ? vr.stats.cha + 8 : 6)) {
      this.you(`The folk of ${v.name} agree to join ${r.name}${vr ? `; ${vr.name} kneels` : ''}.`, [vr?.id].filter(Boolean), 2); this.annexVillage(v, r); return `${v.name} joins you.`;
    }
    if (vr) this.opine(vr, p, -10); return `${v.name} refuses. Perhaps kindness, fame or force will change their minds.`;
  }
  act_recruit(a) {
    const r = this.playerRealm(), v = this.char(a.id); if (!v || !v.alive) return 'They are gone.';
    if (r.treasury < 40) return 'The treasury cannot pay them (40 gold).';
    r.treasury -= 40; this.addOfficer(r, v); v.army = this.newArmy(v, 0.6); this.opine(v, this.player, 20);
    this.you(`${this.fullName(v)} enters your service.`, [v.id], 1); return `${v.name} serves you now.`;
  }
  marriageCandidates(c = this.player) {
    return this.living().filter(o => o.id !== c.id && !o.spouseId && o.female !== c.female && this.age(o) >= 17 && Math.abs(this.age(o) - this.age(c)) < 16 && !this.kin(c, o) && !o.betrothed && (o.noble || o.role === 'officer' || o.role === 'ruler' || this.dist(o, c) < 6))
      .sort((a, b) => (b.role === 'ruler' ? 30 : 0) + b.fame - ((a.role === 'ruler' ? 30 : 0) + a.fame)).slice(0, 8);
  }
  act_marry(a) {
    const p = this.player, o = this.char(a.id); if (!o || !o.alive || o.spouseId) return 'That match is no longer possible.';
    if (p.spouseId) return 'You are already wed.';
    const accept = 0.3 + this.op(o, p) * 0.01 + p.fame * 0.006 + p.stats.cha * 0.02 + (this.playerRules() ? 0.15 : 0) - (o.role === 'ruler' && !this.playerRules() ? 0.3 : 0);
    if (!this.chance(Math.max(0.05, Math.min(0.95, accept)))) { this.opine(o, p, -5); return `${o.name} declines your proposal.`; }
    this.marry(p, o, false); return `You wed ${o.name}.`;
  }
  act_tournament() {
    const r = this.playerRealm(); if (r.treasury < 80) return 'A tournament costs 80 gold.';
    if (this.wars.some(w => !w.over && (w.a === r.id || w.b === r.id))) return 'Not while at war.';
    r.hostTournament = true; return 'Heralds ride out: a tournament will be held this summer.';
  }

  // ---------- 0.6 ruling: the council, granaries, armies and diplomacy ----------
  council(r, role) { const id = r[role]; const c = id && this.char(id); return c && c.alive && c.realmId === r.id && !c.prisonerOf ? c : null; }
  steward(r) { return this.council(r, 'stewardId'); }
  captain(r) { return this.council(r, 'captainId'); }
  appointCouncil(r) {
    // AI realms fill empty seats with whoever suits them best; the player appoints their own
    if (r.tier === 'Village' || this.isPlayer(this.char(r.rulerId))) return;
    const pool = this.living().filter(c => c.realmId === r.id && (c.role === 'officer' || c.role === 'courtier') && this.age(c) >= 18 && !c.prisonerOf);
    const seat = (role, stat, title) => {
      if (this.council(r, role)) return;
      const taken = ['stewardId', 'captainId', 'spymasterId'].map(k => r[k]);
      const best = pool.filter(c => !taken.includes(c.id)).sort((a, b) => b.stats[stat] - a.stats[stat])[0];
      if (best) { r[role] = best.id; if (!best.titles.rank) best.titles.rank = title; }
    };
    seat('stewardId', 'pol', 'Steward'); seat('spymasterId', 'int', 'Spymaster'); seat('captainId', 'lea', 'Captain of the Guard');
  }
  act_appoint(a) {
    const r = this.playerRealm(), c = this.char(a.id); if (!r || !c || c.realmId !== r.id) return 'They do not serve you.';
    const title = { stewardId: 'Steward', captainId: 'Captain of the Guard', spymasterId: 'Spymaster' }[a.role]; if (!title) return;
    const old = this.council(r, a.role); if (old && old.titles.rank === title) old.titles.rank = null;
    for (const k of ['stewardId', 'captainId', 'spymasterId']) if (r[k] === c.id) r[k] = null;
    r[a.role] = c.id; c.titles.rank = title; c.loyalty = Math.min(100, (c.loyalty || 60) + 10); this.opine(c, this.player, 10);
    this.you(`You name ${this.fullName(c)} your ${title}.`, [c.id], 1); return `${c.name} is your ${title}.`;
  }
  act_guardAuto(a) { const r = this.playerRealm(); r.guardAuto = !!a.on; return a.on ? 'Your captain will set the guard as threats rise and fall.' : 'You will set the guard yourself.'; }
  stewardWork(r) {
    // a steward sends grain to the realm's own starving holdings
    const st = this.steward(r); if (!st) return;
    for (const s of this.realmSetts(r)) if (s.famine && r.treasury > 40 && (!this.isPlayer(this.char(r.rulerId)) || r.stewardGrain !== false)) {
      r.treasury -= 30; s.food += s.pop * 0.1; s.famine = false; s.unrest = Math.max(0, s.unrest - 10);
      this.log(1, 'aid', `${this.fullName(st)}, steward of ${r.name}, sends grain to ${s.name}.`, [st.id]);
    }
  }
  grainCost(s) { const r = this.playerRealm(); const cap = r && this.sett(r.capital); return Math.round(25 + (cap ? this.dist(cap, s) * 2 : 10)); }
  act_grain(a) {
    const r = this.playerRealm(), s = this.sett(a.sett), p = this.player; if (!r || !s || s.destroyed) return 'That place is gone.';
    const cost = this.grainCost(s); if (r.treasury < cost) return `Grain for ${s.name} costs ${cost} gold.`;
    r.treasury -= cost; s.food += s.pop * 0.15; s.famine = false; s.unrest = Math.max(0, s.unrest - 15); s.aided = true;
    if (s.realmId === r.id) { this.you(`You send grain to ${s.name}.`, [], 1); return `Grain reaches ${s.name}.`; }
    p.aid++; p.fame += 3; r.aidGiven = (r.aidGiven || 0) + 1; this.spreadRumor(p, 'merciful', 1);
    const owner = this.realm(s.realmId);
    if (owner && owner.setts.size === 1 && !this.isPlayer(this.char(owner.rulerId)) && this.chance(0.5)) {
      const old = this.char(owner.rulerId); this.annexVillage(owner, r);
      this.you(`You send grain to starving ${s.name}. Grateful, the village pledges itself to you.`, [old?.id].filter(Boolean), 2); return `${s.name} joins your realm.`;
    }
    if (owner) { const or = this.char(owner.rulerId); if (or) this.opine(or, p, 15); }
    this.you(`You send grain to starving ${s.name}. Songs of your mercy spread.`, [], 2); return `Grain reaches ${s.name}.`;
  }
  levyCap(r) { return Math.round(this.realmPop(r) * 0.06); }
  act_levy(a) {
    const r = this.playerRealm();
    if (a.id === 'reserve') {
      const n = Math.min(a.n || 100, Math.max(0, this.levyCap(r) - (r.leviedYear === this.year ? r.levied || 0 : 0)), this.reserveCap(r) - (r.reserve || 0));
      if (n <= 0) return (r.reserve || 0) >= this.reserveCap(r) ? 'Your reserve is as large as your lands can keep.' : 'Your people have given all the levies they can this year.';
      const cost = Math.ceil(n / 2); if (r.treasury < cost) return `Raising ${n} troops costs ${cost} gold.`;
      if (r.leviedYear !== this.year) { r.leviedYear = this.year; r.levied = 0; }
      r.levied += n; r.treasury -= cost; this.later(1, { kind: 'reserve', realm: r.id, n });
      for (const s of this.realmSetts(r)) s.pop = Math.max(30, s.pop - Math.round(n / r.setts.size));
      return `${n} men are called up for your reserve. They'll be drilled and in the ranks within a month.`;
    }
    const o = this.char(a.id); if (!o || !o.army || o.realmId !== r.id) return 'They command no army.';
    const room = this.troopCap(o) - o.army.size;
    if (room <= 0) return `${o.name} already leads all the troops they can (${this.troopCap(o)}). Raise their level or put the men in your reserve.`;
    const n = Math.min(a.n || 50, room, Math.max(0, this.levyCap(r) - (r.leviedYear === this.year ? r.levied || 0 : 0)));
    if (n <= 0) return 'Your people have given all the levies they can this year.';
    const cost = Math.ceil(n / 2); if (r.treasury < cost) return `Raising ${n} troops costs ${cost} gold.`;
    if (r.leviedYear !== this.year) { r.leviedYear = this.year; r.levied = 0; }
    r.levied += n; r.treasury -= cost;
    // fresh recruits dilute experience a little
    const a0 = o.army; a0.xp = Math.round(a0.xp * a0.size / (a0.size + n)); this.later(1, { kind: 'officer', realm: r.id, id: o.id, n });
    for (const s of this.realmSetts(r)) s.pop = Math.max(30, s.pop - Math.round(n / r.setts.size));
    return `${n} recruits are called up for ${o.name}'s ${this.plural(this.unitName(a0))}. They'll arrive within a month.`;
  }
  act_lead(a) { const r = this.playerRealm(); if (!r) return ''; r.leadInPerson = !!a.on; return a.on ? 'You will ride with your armies. Your steward rules while you are away.' : 'Your officers will lead your armies. You stay at your seat.'; }
  act_fortify(a) {
    const r = this.playerRealm(), s = this.sett(a.sett); if (!r || !s || s.realmId !== r.id) return 'That is not yours to fortify.';
    const n = Math.min(a.n || 100, this.garrisonCap(s) - (s.garrison || 0));
    if (n <= 0) return `${s.name} holds all the garrison it can (${this.garrisonCap(s)}).`;
    const cost = Math.ceil(n / 3); if (r.treasury < cost) return `Garrisoning ${n} more troops costs ${cost} gold.`;
    r.treasury -= cost; this.later(1, { kind: 'garrison', realm: r.id, sett: s.id, n });
    return `${n} more troops are sent to the walls of ${s.name}. They'll be in place within a month.`;
  }
  act_transfer(a) {
    const r = this.playerRealm(), from = this.char(a.from), to = this.char(a.to);
    if (!from || !to || from.realmId !== r.id || to.realmId !== r.id || !from.army) return 'That cannot be done.';
    [from.army, to.army] = [to.army, from.army];
    if (!from.army) from.army = { size: 0, level: 1, xp: 0, wins: 0, losses: 0, faction: from.culture, unit: this.pickUnit(from, from.culture) };
    this.opine(from, this.player, -8); this.opine(to, this.player, 6);
    this.you(`You give ${this.fullName(to)} command of ${this.plural(this.unitName(to.army))} that ${from.name} led.`, [to.id, from.id], 1);
    return `${to.name} now commands that army.`;
  }
  royalMatches(child) {
    return this.realmList().filter(r => r.id !== this.player.realmId).flatMap(r => { const ru = this.char(r.rulerId); return ru ? ru.children.map(id => this.char(id)).filter(k => k && k.alive && !k.spouseId && !k.betrothed && k.female !== child.female && Math.abs(this.age(k) - this.age(child)) < 8).map(k => ({ k, r })) : []; })
      .sort((a, b) => this.realmSetts(b.r).length - this.realmSetts(a.r).length).slice(0, 6);
  }
  act_arrange(a) {
    const p = this.player, r = this.playerRealm(), child = this.char(a.child), match = this.char(a.match);
    if (!child || !match || !child.alive || !match.alive || child.spouseId || match.spouseId || child.betrothed || match.betrothed) return 'That match is no longer possible.';
    const their = this.realmList().find(x => this.char(x.rulerId)?.children.includes(match.id));
    const theirRuler = their && this.char(their.rulerId);
    const ratio = this.realmStrength(r) / Math.max(1, this.realmStrength(their));
    const accept = 0.35 + Math.min(0.35, (ratio - 1) * 0.25) + p.stats.cha * 0.015 + (theirRuler ? this.op(theirRuler, p) * 0.006 : 0) - (this.atWar(r, their) ? 0.5 : 0);
    if (!this.chance(Math.max(0.05, Math.min(0.95, accept)))) { if (theirRuler) this.opine(theirRuler, p, -4); return `${their.name} declines the match.`; }
    if (this.age(child) >= 16 && this.age(match) >= 16) { this.marry(child, match, false); }
    else { child.betrothed = match.id; match.betrothed = child.id; this.you(`${child.name} is betrothed to ${this.fullName(match)} of ${their.name}. They will wed when both come of age.`, [child.id, match.id], 2); }
    if (theirRuler) this.opine(theirRuler, p, 15);
    this.recomputeAlliances(); return 'The houses are joined.';
  }
  act_ward(a) {
    const p = this.player, r = this.playerRealm(), child = this.char(a.child), host = this.realm(a.realm);
    if (!child || !host || !host.alive || child.wardOf || this.age(child) >= 16) return 'That cannot be done.';
    if (this.atWar(r, host)) return 'Not to a realm you are at war with.';
    child.wardOf = host.id; r.truce.set(host.id, this.year + 10); host.truce.set(r.id, this.year + 10);
    const hr = this.char(host.rulerId); if (hr) { this.opine(hr, p, 25); this.opine(child, hr, 20); }
    this.you(`You send ${child.name} to be raised at the court of ${host.name}. Neither realm will attack the other for ten years, but the child will grow up with loyalties to both.`, [child.id, hr?.id].filter(Boolean), 2);
    return `${child.name} rides for ${host.name}.`;
  }
  act_peaceTerms(a) {
    const r = this.playerRealm(); const w = this.wars.find(x => !x.over && (x.a === r.id || x.b === r.id) && (x.a === a.realm || x.b === a.realm));
    if (!w) return 'You are not at war with them.';
    const their = this.realm(a.realm); const tr = this.char(their.rulerId); const p = this.player;
    const mineScore = w.a === r.id ? w.score : -w.score;
    let chance = 0.25 + (mineScore >= 0 ? 0.25 : -0.1 * Math.min(3, -mineScore)) + (tr && this.has(tr, 'content') ? 0.2 : 0) - (tr && this.has(tr, 'ambitious') ? 0.15 : 0) + w.months * 0.01;
    let cost = '';
    if (a.terms === 'gold') { if (r.treasury < 100) return 'You cannot pay 100 gold.'; chance += 0.35; }
    if (a.terms === 'cede') { const h = this.realmSetts(r).filter(s => s.id !== r.capital).sort((x, y) => Math.min(...this.realmSetts(their).map(t => this.dist(t, x))) - Math.min(...this.realmSetts(their).map(t => this.dist(t, y))))[0]; if (!h) return 'You have no holding to give but your seat.'; a.cede = h.id; chance += 0.6; }
    if (a.terms === 'ward') { const kid = p.children.map(id => this.char(id)).find(k => k && k.alive && this.age(k) < 16 && !k.wardOf); if (!kid) return 'You have no young child to send.'; a.kid = kid.id; chance += 0.3; }
    if (!this.chance(Math.max(0.05, Math.min(0.95, chance)))) return `${their.name} rejects your terms. The war goes on.`;
    if (a.terms === 'gold') { r.treasury -= 100; their.treasury += 100; cost = ' You pay 100 gold.'; }
    if (a.terms === 'cede') { const h = this.sett(a.cede); this.joinRealm(h, their); cost = ` You cede ${h.name}.`; }
    if (a.terms === 'ward') { const kid = this.char(a.kid); kid.wardOf = their.id; if (tr) this.opine(kid, tr, 20); cost = ` ${kid.name} goes to ${their.name} as a ward.`; }
    this.makePeace(w, this.realm(w.a), this.realm(w.b));
    this.you(`Peace with ${their.name}.${cost}`, [tr?.id].filter(Boolean), 2); return `Peace with ${their.name}.`;
  }

  // ---------- 0.7 agents: everyone who travels on a mission is on the map ----------
  realmAt(x, y) {
    const i = Math.max(0, Math.min(this.h - 1, Math.round(y))) * this.w + Math.max(0, Math.min(this.w - 1, Math.round(x)));
    const best = this.terr && this.terr[i] ? this.sett(this.terr[i]) : null;
    if (!best || best.destroyed) return null;
    const r = this.realm(best.realmId); return r && r.alive ? r : null;
  }
  spawnAgent(kind, owner, from, to, data = {}) {
    if (!from || !to) return null;
    const a = { id: this.id(), kind, owner, x: from.x, y: from.y, to: to.id, follow: data.follow || null, data, revealed: false, stay: data.stay || 0, born: this.monthIndex,
      speed: { caravan: 2.2, envoy: 3.6, spy: 3.2, assassin: 3, agitator: 2.8, rumor: 4 }[kind] || 3, culture: data.culture || (this.realm(owner)?.culture) || 'aldmark' };
    (this.agents || (this.agents = [])).push(a); return a;
  }
  agentLabel(a) {
    return { spy: 'Spy', assassin: 'Assassin', envoy: 'Envoy', caravan: 'Caravan', agitator: 'Agitator', rumor: 'Rumor' }[a.kind];
  }
  hiddenKind(a) { return a.kind === 'spy' || a.kind === 'assassin' || a.kind === 'agitator'; }
  agentsTick() {
    for (const a of [...(this.agents || [])]) {
      const dest = a.follow ? this.char(a.follow) : this.sett(a.to);
      if (!dest || (a.follow && !dest.alive)) { this.removeAgent(a); continue; }
      const here = this.realmAt(a.x, a.y);
      // the realm whose lands they cross may catch them
      if (this.hiddenKind(a) && here && here.id !== a.owner) {
        const sm = this.spymaster(here), cpt = this.captain(here);
        const pr = this.playerRealm();
        if (pr && here.id === pr.id && this.playerRules()) {
          if (!a.revealed && this.chance(0.1 + (sm ? sm.stats.int * 0.025 : 0))) { a.revealed = true; this.you(`Your ${sm && sm.id !== this.playerId ? 'spymaster spots' : 'people spot'} ${a.kind === 'assassin' ? 'an assassin' : a.kind === 'spy' ? 'a spy' : 'an agitator'} posing as ${a.data.cover || 'a traveler'} in your lands. Tap them on the map to seize them.`, [], 2); }
        } else if (this.chance(0.02 + (sm ? sm.stats.int * 0.004 : 0) + (cpt ? cpt.stats.lea * 0.003 : 0))) {
          this.log(1, 'spy', `${here.name} seizes ${a.kind === 'assassin' ? 'an assassin' : a.kind === 'spy' ? 'a spy' : 'an agitator'} of ${this.realm(a.owner)?.name || 'a rival'} on the road, posing as ${a.data.cover || 'a traveler'}.`, []);
          this.agentCaught(a); continue;
        }
      }
      // bandits prey on caravans
      if (a.kind === 'caravan') {
        const b = this.living().find(x => x.role === 'bandit' && this.dist(x, a) < 2.2);
        if (b && this.chance(0.25)) { b.band += 4; b.fame += 3; this.log(1, 'bandit', `Bandits under ${this.fullName(b)} plunder a caravan of ${this.realm(a.owner)?.name || 'merchants'}.`, [b.id]); this.removeAgent(a); continue; }
      }
      if (a.stay > 0 && this.dist(a, dest) < 0.6) { this.agentStay(a, dest); continue; }
      const sp = a.speed * (MOVE.land / 3.2) * (this.season === 'Winter' ? 0.65 : 1);
      if (!advance(this, a, dest, sp, MOVE.sea)) continue;
      a.x = dest.x; a.y = dest.y;
      if (a.stay > 0) { this.agentStay(a, dest); continue; }
      this.agentArrive(a, dest);
    }
  }
  removeAgent(a, keepPlot = false) { const i = (this.agents || []).indexOf(a); if (i >= 0) this.agents.splice(i, 1); if (keepPlot) return; const plot = (this.plots || []).find(p => p.agentId === a.id); if (plot) this.plots.splice(this.plots.indexOf(plot), 1); }
  agentCaught(a) {
    const plot = (this.plots || []).find(p => p.agentId === a.id);
    if (plot) { const by = this.char(plot.by); this.stats.foiled++; if (by) { this.opine(this.player, by, -50); } }
    if (a.kind === 'assassin' && a.data.by) { const by = this.char(a.data.by); if (by && this.isPlayer(by)) this.you(`Your assassin is caught on the road. If they talk, the world will know.`, [], 2); }
    this.removeAgent(a);
  }
  agentStay(a, s) {
    // agitators linger, stirring the people up
    a.stay--; s.unrest += 3.5;
    if (a.stay <= 0) { this.removeAgent(a); if (s.unrest > 60) this.log(1, 'uprising', `Agitators have left ${s.name} seething.`, []); }
  }
  agentArrive(a, dest) {
    this.removeAgent(a, true);
    const A = this.realm(a.owner);
    if (a.kind === 'spy') return this.resolveSpy(a);
    if (a.kind === 'assassin') {
      const by = this.char(a.data.by), t = this.char(a.data.target);
      if (!by || !t || !t.alive) return;
      if (this.isPlayer(t)) return this.resolvePlayerPlot((this.plots || []).find(x => x.id === a.data.plotId));
      if (this.dist(t, a) > 2.5) { if (this.isPlayer(by)) this.you(`Your assassin reaches ${dest.name || 'their mark'}, but ${t.name} is not there.`, [t.id], 1); return; }
      return this.assassination(by, t, a.data.motive || 'for gold');
    }
    if (a.kind === 'envoy' && a.data.proposal) return this.envoyArrives(a);
    if (a.kind === 'envoy') { const w = this.wars.find(x => x.id === a.data.war); if (w && !w.over) this.makePeace(w, this.realm(w.a), this.realm(w.b)); return; }
    if (a.kind === 'caravan') {
      const B = this.realm(dest.realmId); const v = a.data.value || 30;
      if (A && A.alive) A.treasury += v; if (B && B.alive && B !== A) B.treasury += Math.round(v * 0.6);
      return;
    }
  }
  resolveSpy(a) {
    const w = this.wars.find(x => x.id === a.data.war); const A = this.realm(a.owner), B = this.realm(a.data.target);
    if (!w || w.over || !A || !B || !A.alive || !B.alive) return;
    const sm = this.char(a.data.sm) || this.spymaster(A), tm = this.spymaster(B);
    const spyName = a.data.name, cover = a.data.cover;
    const success = (sm ? sm.stats.int : 6) + this.r() * 12 > (tm ? tm.stats.int : 5) + GUARD[this.guardSetting(B)].catch * 12;
    const mine = this.playerRealm() && this.playerRealm().id === A.id;
    if (success) {
      w.intel[A.id] = (w.intel[A.id] || 0) + 0.2; if (sm) this.gainXp(sm, 15);
      if (mine) { this.learnCourt(B); this.you(`${spyName}, your spy posing as ${cover}, returns from ${B.name} with their battle plans, and the names and titles of everyone at their court. Your next battle against them will go better.`, [], 2); }
      else if (this.chance(0.4)) this.log(1, 'spy', `A spy of ${A.name}, posing as ${cover}, slips into ${B.name} and returns with their battle plans.`, sm ? [sm.id] : []);
    } else {
      const fate = this.r(); const br = this.char(B.rulerId);
      if (fate < 0.45) { this.log(mine ? 2 : 1, mine ? 'you' : 'spy', `${spyName}, a spy of ${A.name} disguised as ${cover}, is caught in ${B.name} and hanged at the gate.`, [mine ? this.playerId : null, br?.id].filter(Boolean)); if (br && this.has(br, 'cruel')) this.spreadRumor(br, 'butcher', 1); }
      else if (fate < 0.75) { w.intel[B.id] = (w.intel[B.id] || 0) + 0.15; w.intel[A.id] = (w.intel[A.id] || 0) - 0.15; this.log(2, mine ? 'you' : 'spy', `${tm ? this.fullName(tm) : B.name} catches ${spyName}, a spy of ${A.name}, and turns them. False plans now flow back to ${A.name}.`, [mine ? this.playerId : null, tm?.id, sm?.id].filter(Boolean)); }
      else { A.treasury -= 15; B.treasury += 15; this.log(1, mine ? 'you' : 'spy', `${spyName}, caught spying for ${A.name}, is ransomed back for silver.`, mine ? [this.playerId] : []); }
    }
  }
  caravans() {
    for (const r of this.realmList()) {
      if (r.tier === 'Village' || !this.chance(0.05)) continue;
      const cap = this.sett(r.capital); if (!cap) continue;
      const partners = [...r.allies].map(id => this.realm(id)).filter(x => x && x.alive).map(x => this.sett(x.capital)).filter(Boolean);
      const own = this.realmSetts(r).filter(s => s.id !== cap.id && this.dist(s, cap) > 4);
      const to = partners.length && this.chance(0.6) ? this.pick(partners) : own.length ? this.pick(own) : null;
      if (to) this.spawnAgent('caravan', r.id, cap, to, { value: Math.round(20 + this.realmPop(r) / 200), guards: this.ri(8, 20), cover: 'merchants' });
    }
  }
  agitate(owner, s, by) {
    const cul = this.realm(owner)?.culture || 'aldmark';
    const from = this.sett(this.realm(owner)?.capital) || s;
    return this.spawnAgent('agitator', owner, from, s, { stay: this.ri(4, 8), cover: this.pick(['a wandering preacher', 'a tax rebel', 'a ballad singer', 'a disgraced soldier']), by: by?.id, culture: cul });
  }

  // ---------- your intrigue ----------
  act_spy(a) {
    const r = this.playerRealm(), t = this.realm(a.realm); const w = this.wars.find(x => !x.over && ((x.a === r.id && x.b === t.id) || (x.b === r.id && x.a === t.id)));
    if (!w) return 'Spies are sent against realms you are at war with.';
    if (r.treasury < 20) return 'A spy costs 20 gold.';
    r.treasury -= 20; this.stats.spies++;
    const sm = this.spymaster(r);
    this.spawnAgent('spy', r.id, this.sett(r.capital), this.sett(t.capital), { war: w.id, target: t.id, sm: sm?.id, name: this.personName(cultureById(r.culture), this.chance(0.4)), cover: this.pick(['a wine merchant', 'a pilgrim', 'a traveling minstrel', 'a stablehand', 'a scribe']) });
    return `A spy rides for ${t.name}.`;
  }
  act_agitate(a) {
    const r = this.playerRealm(), s = this.sett(a.sett); if (!s || s.realmId === r.id) return 'Not in your own lands.';
    if (r.treasury < 40) return 'Agitators cost 40 gold.';
    r.treasury -= 40; this.agitate(r.id, s, this.player); return `Your agitators set out for ${s.name}.`;
  }
  act_smear(a) {
    const r = this.playerRealm(), t = this.char(a.id), p = this.player; if (!t || !t.alive) return 'They are gone.';
    if (r.treasury < 30) return 'Spreading lies costs 30 gold.';
    r.treasury -= 30;
    const from = this.sett(r.capital); const to = this.sett(t.settId) || this.sett(this.realm(t.realmId)?.capital);
    this.spawnAgent('rumor', r.id, from, to, { about: t.id, smear: true, text: `${t.name} butchered prisoners` });
    const sm = this.spymaster(r);
    if (t.stats.int > 13 && this.chance(0.5)) { t.titles.rep = 'Deaf Ears'; this.you(`You spread lies about ${this.fullName(t)}, who shrugs them off so completely that people start calling them Deaf Ears.`, [t.id], 2); }
    else { this.spreadRumor(t, 'butcher', 3); this.you(`Your whisperers spread tales that ${this.fullName(t)} butchered prisoners.`, [t.id], 1); }
    if (this.chance(0.25 - (sm ? sm.stats.int * 0.01 : 0))) { this.opine(t, p, -40); this.spreadRumor(p, 'traitor', 1); this.you(`${t.name} learns who spread the lies.`, [t.id], 2); }
    return 'The rumor spreads.';
  }
  act_assassin(a) {
    const r = this.playerRealm(), t = this.char(a.id), p = this.player; if (!t || !t.alive) return 'They are gone.';
    if (r.treasury < 150) return 'An assassin costs 150 gold.';
    r.treasury -= 150;
    const to = this.sett(t.settId) || this.sett(this.realm(t.realmId)?.capital);
    this.spawnAgent('assassin', r.id, this.sett(r.capital), to, { by: p.id, target: t.id, motive: 'on your orders', cover: this.pick(['a merchant', 'a pilgrim', 'a performer', 'a cook', 'a priest']) });
    this.you(`You pay an assassin to kill ${this.fullName(t)}. There is no taking it back.`, [], 2);
    return 'The assassin sets out.';
  }
  act_seize(a) {
    const ag = (this.agents || []).find(x => x.id === a.id); const r = this.playerRealm();
    if (!ag || !ag.revealed) return 'They have slipped away.';
    if (r.treasury < 10) return 'Sending soldiers costs 10 gold.';
    r.treasury -= 10;
    const cpt = this.captain(r);
    if (this.chance(0.45 + (cpt ? cpt.stats.lea * 0.025 : this.player.stats.lea * 0.015))) {
      const who = ag.kind === 'assassin' && ag.data.by ? this.char(ag.data.by) : null;
      this.you(`Your soldiers seize ${ag.kind === 'assassin' ? 'the assassin' : ag.kind === 'spy' ? 'the spy' : 'the agitator'}${who ? `, who names ${this.fullName(who)}` : ''}.`, who ? [who.id] : [], 2);
      if (who) this.opine(this.player, who, -60);
      this.agentCaught(ag); return 'Seized.';
    }
    ag.revealed = false; return 'They slip through your fingers.';
  }
  act_raid(a) {
    const p = this.player, ag = (this.agents || []).find(x => x.id === a.id && x.kind === 'caravan');
    if (!ag || this.dist(ag, p) > 3) return 'The caravan is out of reach.';
    const odds = Math.max(0.05, Math.min(0.95, (this.playerForce() / Math.max(1, ag.data.guards * 1.1)) ** 2 / (1 + (this.playerForce() / Math.max(1, ag.data.guards * 1.1)) ** 2)));
    this.removeAgent(ag);
    this.spreadRumor(p, 'brigand', 2);
    const owner = this.realm(ag.owner); const ru = owner && this.char(owner.rulerId); if (ru) this.opine(ru, p, -30);
    if (this.chance(odds)) { const g = ag.data.value * 2; p.gold = (p.gold || 0) + g; p.fame += 2; this.you(`You fall on a caravan of ${owner?.name || 'merchants'} and carry off ${g} gold.`, [], 2); return `${g} gold!`; }
    const lost = Math.round((p.followers || 0) * 0.3); p.followers = Math.max(0, (p.followers || 0) - lost); p.wounded = 4;
    this.you(`The caravan guards drive you off. ${lost} of your followers fall.`, [], 2); return 'The raid fails.';
  }

  // ---------- 0.8 honour: challenges and titles ----------
  challengeTargets() {
    const p = this.player; if (!p) return [];
    const out = [];
    const holder = this.char(this.unique.strongest);
    if (holder && holder.alive && !this.isPlayer(holder) && !holder.prisonerOf) out.push({ c: holder, reason: 'the title Strongest Under Heaven' });
    for (const c of this.living()) if (!this.isPlayer(c) && !c.prisonerOf && this.age(c) >= 17 && this.age(c) <= 60 && (this.op(p, c) <= -30 || this.op(c, p) <= -40) && !out.some(x => x.c === c)) out.push({ c, reason: 'an old grudge' });
    return out.slice(0, 6);
  }
  duelOutcomeText(rec, you) {
    const w = this.char(rec.w), l = this.char(rec.w === rec.a ? rec.b : rec.a);
    const won = this.isPlayer(w);
    const fate = rec.outcome === 'slain' ? (won ? `${l.name} falls dead` : 'you fall') : rec.outcome === 'wounded' ? (won ? `${l.name} is badly wounded` : 'you are badly wounded') : (won ? `${l.name} yields` : 'you yield');
    return `${you} ${won ? 'You win' : `${w.name} wins`}: ${fate}.`;
  }
  act_challenge(a) {
    const p = this.player, t = this.char(a.id); if (!t || !t.alive) return 'They are gone.';
    if (p.wounded) return 'You are too badly hurt to fight.';
    const forTitle = t.id === this.unique.strongest;
    const accept = forTitle ? 0.85 : 0.55 + (this.has(t, 'brave') || this.has(t, 'reckless') ? 0.3 : 0) - (this.has(t, 'cautious') ? 0.25 : 0) + (t.stats.mig - p.stats.mig) * 0.03;
    if (!this.chance(Math.max(0.1, Math.min(0.95, accept)))) {
      this.spreadRumor(t, 'craven', 2); p.fame += 3;
      this.you(`You challenge ${this.fullName(t)} to a duel over ${forTitle ? 'the title Strongest Under Heaven' : 'an old grudge'}. They refuse, and men begin to call them craven.`, [t.id], 2);
      return `${t.name} refuses to fight you.`;
    }
    const rec = this.duel(p, t, forTitle ? 'title' : 'grudge', false, { stance: a.stance });
    this.you(this.duelOutcomeText(this.lastPlayerDuel, `You face ${this.fullName(t)} in a duel over ${forTitle ? 'the title Strongest Under Heaven' : 'an old grudge'}.`), [t.id], 3);
    return 'The duel is fought.';
  }
  act_answer(a) {
    const p = this.player, ch = p.challenge; if (!ch) return 'No one has challenged you.';
    p.challenge = null; const from = this.char(ch.from); if (!from || !from.alive) return 'Your challenger is gone.';
    if (!a.accept) { this.spreadRumor(p, 'craven', 2); p.fame = Math.max(0, p.fame - 5); this.you(`You refuse ${this.fullName(from)}'s challenge. Your honour suffers.`, [from.id], 2); return 'You refuse the challenge.'; }
    this.duel(from, p, 'grudge', false, { stance: a.stance });
    this.you(this.duelOutcomeText(this.lastPlayerDuel, `You answer ${this.fullName(from)}'s challenge.`), [from.id], 3);
    return 'The duel is fought.';
  }
  challengesForPlayer() {
    const p = this.player; if (!p || !p.alive || p.challenge || p.prisonerOf) return;
    const foe = this.living().find(c => !this.isPlayer(c) && !c.prisonerOf && !c.wounded && this.op(c, p) < -55 && c.stats.mig >= 9 && this.age(c) <= 55 && (this.has(c, 'brave') || this.has(c, 'reckless') || this.has(c, 'ambitious')));
    const holderIsYou = this.isPlayer(this.char(this.unique.strongest));
    const rival = holderIsYou ? this.living().filter(c => !this.isPlayer(c) && !c.prisonerOf && !c.wounded && c.duelWins >= 3 && this.age(c) <= 50).sort((x, y) => y.stats.mig - x.stats.mig)[0] : null;
    const who = foe && this.chance(0.25) ? foe : rival && this.chance(0.35) ? rival : null;
    if (!who) return;
    p.challenge = { from: who.id, reason: who === rival ? 'your title' : 'an old grudge', due: this.monthIndex + 3 };
    this.you(`${this.fullName(who)} challenges you to a duel over ${p.challenge.reason}. Answer from the You tab within three months, or be called craven.`, [who.id], 3);
  }
  act_grant(a) {
    const r = this.playerRealm(), c = this.char(a.id); if (!c || c.realmId !== r.id) return 'They do not serve you.';
    if (!['General', 'Marshal', 'Champion'].includes(a.title)) return;
    if (a.title === 'Marshal') for (const o of this.realmOfficers(r)) if (o.titles.rank === 'Marshal') o.titles.rank = null;
    for (const k of ['stewardId', 'captainId', 'spymasterId']) if (r[k] === c.id) r[k] = null;
    c.titles.rank = a.title; c.loyalty = Math.min(100, (c.loyalty || 60) + 15); this.opine(c, this.player, 15);
    this.you(`You name ${this.fullName(c)} ${a.title}.`, [c.id], 1); this.onKnighting(c, a.title); return `${c.name} is your ${a.title}.`;
  }
  act_revoke(a) {
    const r = this.playerRealm(), c = this.char(a.id); if (!c || !c.titles.rank) return 'They hold no rank.';
    const old = c.titles.rank; c.titles.rank = null; for (const k of ['stewardId', 'captainId', 'spymasterId']) if (r[k] === c.id) r[k] = null;
    c.loyalty = Math.max(0, (c.loyalty || 60) - 25); this.opine(c, this.player, -30);
    this.you(`You strip ${this.fullName(c)} of the rank of ${old}. They will not forget it.`, [c.id], 2); return `${c.name} is ${old} no more.`;
  }

  // ---------- 0.9 snapshots: save the whole world, load it instantly ----------
  toJSON() {
    const o = {};
    for (const [k, v] of Object.entries(this)) {
      if (['chars', 'realms', 'pendingBattle', 'replayLog', 'lastPlayerDuel', 'ocean', 'landId', 'wildId', 'terr', 'known'].includes(k) || k[0] === '_' || typeof v === 'function') continue;
      o[k] = v;
    }
    o.chars = [...this.chars.values()];
    o.realms = [...this.realms.values()].map(r => ({ ...r, setts: [...r.setts], allies: [...r.allies], truce: [...r.truce.entries()] }));
    o.knownStr = this.known ? this.known.join('') : null;
    o.v = 1;
    return o;
  }
  static restore(o) {
    const w = Object.create(World.prototype);
    Object.assign(w, o);
    w.chars = new Map(o.chars.map(c => [c.id, c]));
    w.realms = new Map(o.realms.map(r => [r.id, { ...r, setts: new Set(r.setts), allies: new Set(r.allies), truce: new Map(r.truce) }]));
    w.pendingBattle = null; w.replaying = false; w.replayLog = null;
    buildGeo(w, true); // land, sea, wilds and territories are rebuilt from the map
    w.known = o.knownStr && o.knownStr.length === w.w * w.h ? o.knownStr.split('').map(Number) : null; delete w.knownStr;
    if (!w.known) w.kn = null; // saves from before 2.3: you know the whole world
    w.initDefences(); // saves from before 2.4: walls and reserves appear
    applyMod(w.mod); if (!w.tune) w.tune = { war: 1, monsters: 1, famine: 1, plots: 1, tournaments: 1 };
    delete w.v;
    return w;
  }

  // ---------- views ----------
  famous(n = 40) { return this.living().filter(c => this.age(c) >= 16).sort((a, b) => b.fame + (b.role === 'ruler' ? 30 : 0) - (a.fame + (a.role === 'ruler' ? 30 : 0))).slice(0, n); }
}

export { TROOP_TIERS, GUARD, MON };
installKnowledge(World);
installCourt(World);
installEvents(World);
HANDLERS.event = resolveEvent;
installCeremonies(World);
HANDLERS.ceremony = resolveCeremony;
installDiplomacy(World);
HANDLERS.audience = HANDLERS.mission = HANDLERS.advice = resolveDiplomacy;
