// The Dynasty — living world simulation (prototype).
// Runs month by month. Everything that happens is written to the Chronicle.
import { CULTURES, DYNASTY_PARTS, DYNASTY_SUFFIX, cultureById } from './names.js';
import { Battle, UNITS } from './battle.js';

// ---------- Seeded random ----------
function hashStr(s) { let h = 1779033703 ^ s.length; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return h >>> 0; }
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export const SIZES = {
  small: { w: 40, h: 28, setts: 34, label: 'Small' },
  large: { w: 60, h: 40, setts: 70, label: 'Large' },
  enormous: { w: 84, h: 56, setts: 130, label: 'Enormous' },
};

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

export class World {
  constructor(seed = 'dynasty', size = 'large') {
    this.seed = String(seed);
    this.size = SIZES[size] ? size : 'large';
    this.rand = mulberry32(hashStr(this.seed + '|' + this.size));
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
    this.stats = { battles: 0, wars: 0, uprisings: 0, assassinations: 0, foiled: 0, duels: 0, famines: 0, outbreaks: 0, destroyed: 0, realmsFallen: 0, realmsRisen: 0, marriages: 0, births: 0, deaths: 0, tournaments: 0, defections: 0, spies: 0 };
    this.generate();
  }

  // ---------- random helpers ----------
  r() { return this.rand(); }
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
    const e1 = noise(9), e2 = noise(4), m1 = noise(8), m2 = noise(3);
    this.grid = [];
    for (let y = 0; y < h; y++) {
      const row = [];
      for (let x = 0; x < w; x++) {
        const dx = (x / w - 0.5) * 2, dy = (y / h - 0.5) * 2;
        const edge = Math.max(Math.abs(dx), Math.abs(dy));
        let e = e1(x, y) * 0.7 + e2(x, y) * 0.3 - Math.max(0, edge - 0.72) * 1.6;
        const m = m1(x, y) * 0.7 + m2(x, y) * 0.3;
        let b;
        if (e < 0.36) b = 'water';
        else if (e > 0.7) b = 'mountain';
        else if (y < h * 0.16) b = 'tundra';
        else if (m > 0.62 && e < 0.48) b = 'swamp';
        else if (m < 0.33) b = 'wasteland';
        else if (m > 0.5) b = 'forest';
        else b = 'plains';
        row.push(b);
      }
      this.grid.push(row);
    }
    // Culture homelands
    const land = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (this.grid[y][x] !== 'water') land.push({ x, y });
    const centers = CULTURES.map(c => {
      const fits = land.filter(p => c.home.includes(this.grid[p.y][p.x]));
      const p = fits.length ? this.pick(fits) : this.pick(land);
      return { c, x: p.x, y: p.y };
    });
    this.cultureCenters = centers;
    const cultureAt = (x, y) => {
      let best = null, bd = 1e9;
      for (const cc of centers) { const d = (cc.x - x) ** 2 + (cc.y - y) ** 2 - (cc.c.home.includes(this.grid[y][x]) ? 30 : 0); if (d < bd) { bd = d; best = cc.c; } }
      return best;
    };
    // Settlements
    const target = SIZES[this.size].setts;
    const spots = this.shuffle(land.filter(p => this.grid[p.y][p.x] !== 'mountain' || this.chance(0.25)));
    const minD = Math.max(3, Math.sqrt((w * h) / target) * 0.75);
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
    // Monster lairs in wild places
    const wild = land.filter(p => ['forest', 'swamp', 'mountain', 'tundra', 'wasteland'].includes(this.grid[p.y][p.x]) && !this.setts.some(s => (s.x - p.x) ** 2 + (s.y - p.y) ** 2 < 9));
    const lairCount = Math.round(target / 6);
    const peaks = wild.filter(p => this.grid[p.y][p.x] === 'mountain'); if (peaks.length) wild.unshift(this.pick(peaks));
    for (let i = 0; i < lairCount && wild.length; i++) {
      const p = i === 0 ? wild[0] : this.pick(wild);
      const b = this.grid[p.y][p.x];
      const opts = MONSTERS.filter(m => m.key !== 'dragon' && m.biomes.includes(b));
      const m = i === 0 ? MON.dragon : this.pick(opts.length ? opts : [MON.wolves]);
      this.lairs.push({ id: this.id(), x: p.x, y: p.y, key: m.key, base: m.power, strength: this.ri(10, 30), alive: true });
    }
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
        if (nearest === cap) this.joinRealm(s, realm);
      }
    }
    // Independent villages
    for (const s of this.setts) if (!s.realmId) this.makeRealm(s, null);
    for (const realm of this.realms.values()) this.populateRealm(realm);
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

  dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
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
      treasury: this.ri(40, 150), tier: 'Village', alive: true, founded: this.year, dynasty: null, allies: new Set(), truce: new Map(), mercs: [], fame: 0, aidGiven: 0 };
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
  newArmy(c, scale = 1, faction = c.culture) { return { size: Math.round((80 + c.stats.lea * 18) * scale), level: this.ri(1, 3), xp: 0, wins: 0, losses: 0, faction, unit: this.pickUnit(c, faction) }; }
  pickUnit(c, faction) {
    // officers raise troops that suit them: leaders ride, thinkers shoot or cast, fighters hold the line
    const units = UNITS[faction].map((u, i) => ({ ...u, i })).filter(u => u.entry);
    const s = c.stats; const pref = s.lea >= s.mig && s.lea >= s.int ? ['cav', 'flyer'] : s.int > s.mig ? ['ranged', 'magic'] : ['inf', 'heavy'];
    const fit = units.filter(u => pref.includes(u.role));
    return this.pick(fit.length ? fit : units).i;
  }
  unitName(a) { return a && a.faction && UNITS[a.faction][a.unit] ? UNITS[a.faction][a.unit].name : 'troops'; }
  plural(n) {
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
    this.chronicle.push(e);
    for (const id of ids) { const c = this.char(id); if (c) c.log.push(this.chronicle.length - 1); }
  }

  // ---------- main loop ----------
  tick() {
    this.month++;
    if (this.month >= 12) { this.month = 0; this.year++; this.yearly(); }
    this.economy();
    this.unrestAndUprisings();
    this.monsters();
    this.outlaws();
    this.warfare();
    this.intrigue();
    this.monthlyLife();
    if (this.month === 6) this.tournaments();
    if (this.month % 3 === 0) this.updateTiers();
    if (this.pendingBattle && this.pendingBattle.replay) {
      // a battle the player watched: fight it again, step for step, so the world stays the same
      const b = new Battle(this.pendingBattle.cfg); let n = 0; while (!b.over && n++ < 40000) b.step(1 / 30);
      const ctx = this.pendingBattle; this.pendingBattle = null; ctx.watched = true; this.applyBattle(ctx, b);
    }
  }
  runYears(n) { for (let i = 0; i < n * 12; i++) this.tick(); }

  // ---------- economy, seasons, famine ----------
  economy() {
    const harvest = this.month === 8;
    const drought = harvest && this.chance(0.4) ? { x: this.ri(0, this.w), y: this.ri(0, this.h), r: this.ri(5, 11) } : null;
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
      else if (s.food > 0) s.pop = Math.round(s.pop * (1 + 0.0015 * (s.biome === 'plains' ? 1.3 : 1)));
      if (r) r.treasury += s.pop * 0.004 * (1 + (this.char(r.rulerId)?.stats.pol || 5) / 20) - GUARD[s.guard].cost * 0.2;
    }
    // Food aid to starving neighbours
    if (this.month % 2 === 0) {
      for (const s of this.setts.filter(s => s.famine && !s.destroyed)) {
        const donors = this.realmList().filter(r => r.id !== s.realmId && r.treasury > 80 && this.realmSetts(r).some(x => this.dist(x, s) < 8));
        for (const r of this.shuffle(donors)) {
          const ruler = this.char(r.rulerId); if (!ruler || this.has(ruler, 'greedy') || this.has(ruler, 'cruel')) continue;
          if (s.aided || !this.chance(this.has(ruler, 'kind') ? 0.3 : 0.08)) continue;
          s.aided = true;
          r.treasury -= 40; s.food += s.pop * 0.12; s.famine = false; s.unrest = Math.max(0, s.unrest - 20);
          ruler.aid++; ruler.fame += 3; r.aidGiven++;
          const owner = this.realm(s.realmId);
          if (owner && owner.setts.size === 1 && this.chance(0.45)) {
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
    let leader = this.living().find(c => (c.role === 'vagabond' || c.role === 'bandit') && this.dist(c, s) < 5 && c.fame > 8);
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
      L.strength += this.r() * 0.6 * (this.season === 'Winter' ? 0.5 : 1);
      if (L.strength > 55 && this.chance(0.04)) {
        const targets = this.setts.filter(s => !s.destroyed && this.dist(s, L) < 9).sort((a, b) => this.dist(a, L) - this.dist(b, L));
        const s = targets[0]; if (!s) continue;
        this.stats.outbreaks++;
        const force = L.strength * L.base;
        const r = this.realm(s.realmId);
        if (force > 200 && s.pop < 500 && (!r || s.id !== r.capital || r.setts.size === 1) && this.chance(0.5)) {
          s.destroyed = true; s.pop = 0; this.stats.destroyed++;
          if (r) { r.setts.delete(s.id); if (r.setts.size === 0) this.killRealm(r, null); else if (r.capital === s.id) this.moveCapital(r); }
          const M = MON[L.key]; this.log(3, 'monster', M.key === 'dragon' ? `The red dragon descends on ${s.name} and burns it to the ground. Only ash and bones remain.` : `${M.horde} ${M.rift ? 'tears open beside' : 'pours out of the wilds and falls upon'} ${s.name}, destroying it. Only ruins remain.`, []);
        } else {
          s.pop = Math.round(s.pop * (0.75 + this.r() * 0.15)); s.unrest += 15; s.food -= s.pop * 0.05;
          this.log(2, 'monster', `${MON[L.key].horde} ravages the lands around ${s.name}. The survivors beg for a champion.`, []);
        }
        L.strength *= 0.7;
      }
      // Heroes answer the call
      if (L.strength > 25 && this.chance(L.strength > 50 ? 0.06 : 0.03)) {
        const heroes = this.living().filter(c => ['vagabond', 'officer', 'merc'].includes(c.role) && !c.prisonerOf && this.age(c) >= 17 && this.dist(c, L) < 14 && c.stats.mig + c.stats.int > 12);
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
          const verb = mode === 'tame' ? `tames ${M.the} and leads the beasts home to fight in their army` : mode === 'trap' ? `captures ${M.the} alive in cunning snares` : M.rift ? `fights through the elementals and closes ${M.the}` : `slays ${M.the}`;
          this.log(L.base >= 2.8 ? 3 : 2, 'monster', `${this.fullName(h)} ${verb}.${got ? ` Bards now call them ${title}.` : ''}`, [h.id]);
          // a new lair may form somewhere later
          if (this.chance(0.6)) this.respawnLair(L);
        } else if (this.chance(0.5)) {
          this.die(h, `killed by ${MON[L.key].the}`);
          this.log(2, 'monster', `${this.fullName(h)} rides out to face ${MON[L.key].the} and does not return.`, [h.id]);
        } else {
          h.wounded = 6;
          this.log(1, 'monster', `${this.fullName(h)} is driven back, badly wounded, by ${MON[L.key].the}.`, [h.id]);
        }
      }
    }
  }
  respawnLair(L) {
    const land = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (['forest', 'swamp', 'mountain', 'tundra', 'wasteland'].includes(this.grid[y][x])) land.push({ x, y });
    const p = this.pick(land); const b = this.grid[p.y][p.x];
    const opts = MONSTERS.filter(m => m.key !== 'dragon' && m.biomes.includes(b)); const m = this.pick(opts.length ? opts : [MON.wolves]);
    this.lairs.push({ id: this.id(), x: p.x, y: p.y, key: m.key, base: m.power, strength: 5, alive: true });
  }

  // ---------- vagabonds, bandits, mercenaries ----------
  outlaws() {
    for (const c of this.living()) {
      if (c.prisonerOf) continue;
      if (c.wounded > 0) c.wounded--;
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
      const ruler = this.char(r.rulerId); if (!ruler || ruler.prisonerOf) continue;
      if (this.wars.some(w => !w.over && (w.a === r.id || w.b === r.id))) continue;
      const aggro = (this.has(ruler, 'ambitious') ? 2 : 1) * (this.has(ruler, 'content') ? 0.3 : 1) * (this.has(ruler, 'reckless') ? 1.5 : 1) * (this.has(ruler, 'cautious') ? 0.6 : 1);
      if (!this.chance(0.006 * aggro)) continue;
      const myStr = this.realmStrength(r);
      const targets = this.neighbours(r).filter(o => !r.allies.has(o.id) && !((r.truce.get(o.id) || 0) > this.year) && this.realmStrength(o) < myStr * (this.has(ruler, 'reckless') ? 1.3 : 0.9));
      if (!targets.length) continue;
      const t = this.pick(targets);
      this.declareWar(r, t, this.pick(['a border dispute', 'an old grudge', 'a claim on their lands', 'insults at court', 'raids along the border']));
    }
    for (const w of this.wars) {
      if (w.over) continue;
      const A = this.realm(w.a), B = this.realm(w.b);
      if (!A || !B || !A.alive || !B.alive) { w.over = true; continue; }
      w.months++;
      if (this.season === 'Winter' && this.chance(0.5)) continue; // winter slows campaigns
      if (this.chance(0.3)) this.campaign(w, A, B);
      if (w.over) continue;
      const exhausted = w.months > 36 || Math.abs(w.score) > 8 || (w.months > 14 && this.chance(0.04));
      if (exhausted) this.makePeace(w, A, B);
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
    const aOff = this.realmOfficers(att).filter(o => !o.wounded).sort((x, y) => this.power(y) - this.power(x)).slice(0, 3);
    const dOff = this.realmOfficers(def).filter(o => !o.wounded).sort((x, y) => this.power(y) - this.power(x)).slice(0, 3);
    if (!aOff.length) return;
    const targets = this.realmSetts(def).sort((x, y) => Math.min(...this.realmSetts(att).map(s => this.dist(s, x))) - Math.min(...this.realmSetts(att).map(s => this.dist(s, y))));
    const target = targets[0]; if (!target) { w.over = true; return; }
    this.battle(att, def, aOff, dOff, target, w, attackerIsA);
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
        if (o.role === 'ruler' || o.loyalty > 30 || !this.chance(0.15)) continue;
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
    const big = att.tier === 'Kingdom' || def.tier === 'Kingdom' || ctx.cfg.sides.reduce((a, s) => a + s.divisions.reduce((x, d) => x + d.count, 0), 0) > 1400;
    ctx.big = big;
    if (this.replayWatched && this.replayWatched.has(ctx.index) && !this.pendingBattle) { ctx.replay = true; this.pendingBattle = ctx; return; }
    if (!this.pendingBattle && this.watchMode && (this.watchMode === 'all' || (this.watchMode === 'big' && big))) { this.pendingBattle = ctx; return; }
    // auto-resolve: the same engine with each soldier standing for a company of men
    const proxy = JSON.parse(JSON.stringify(ctx.cfg));
    const biggest = Math.max(...proxy.sides.flatMap(s => s.divisions.map(d => d.count)));
    const per = Math.max(1, biggest / 18);
    for (const side of proxy.sides) for (const d of side.divisions) d.count = Math.max(2, Math.round(d.count / per));
    const b = new Battle(proxy); let n = 0; while (!b.over && n++ < 1000) b.step(0.3);
    if (!b.over) { b.t = 999; b.checkEnd(); }
    this.applyBattle(ctx, b);
  }

  battleConfig(ctx, duelSide) {
    const { att, def, aOff, dOff, target, war } = ctx;
    const famine = r => this.realmSetts(r).some(s => s.famine);
    const sideOf = (realm, offs, enemyOffs, idx) => {
      const divisions = offs.map(o => ({ faction: o.army.faction || o.culture, unit: o.army.unit ?? 0, count: Math.max(20, Math.min(900, o.army.size)), level: o.army.level, officer: { name: o.name, stats: o.stats, ref: o.id } }));
      for (const mid of realm.mercs) {
        const m = this.mercs.find(x => x.id === mid); const cap = m && this.char(m.captainId);
        if (m && cap && cap.alive && divisions.length < 4) divisions.push({ faction: m.faction, unit: m.unit, count: Math.max(20, Math.min(700, m.size)), level: m.level, officer: { name: cap.name, stats: cap.stats, ref: cap.id, merc: m.id } });
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
      const lead = offs[0] || this.char(realm.rulerId);
      return { faction: target.culture, name: realm.name, realmId: realm.id, color: realm.color, ai: this.generalStyle(lead), canFire: offs.some(o => o.stats.int >= 12), mods: { morale, atk: famine(realm) ? 0.92 : 1 }, divisions };
    };
    war.intel[att.id] = 0; war.intel[def.id] = 0;
    const s0 = sideOf(att, aOff, dOff, 0), s1 = sideOf(def, dOff, aOff, 1);
    if (Math.abs(parseInt(s0.color.slice(1), 16) - parseInt(s1.color.slice(1), 16)) < 0x202020) s1.color = '#e8e2d0';
    return { seed: Math.floor(this.r() * 1e9), terrain: target.biome, season: this.season, sides: [s0, s1] };
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
    const routs = [...new Set(b.divisions.filter(d => d.routed && d.side !== wonSide).map(d => this.plural(d.unitName)))];
    if (b.fires.length) lines.push(`fire arrows rain on the field`);
    if (routs.length) lines.push(`the ${routs.slice(0, 3).join(', ')} break and flee`);
    const wOffs = (wonSide === 0 ? ctx.aOff : ctx.dOff).filter(o => o.alive);
    const lead = wOffs.sort((x, y) => this.power(y) - this.power(x))[0];
    if (lead && lead.army && lead.army.wins >= 6 && this.grantDeed(lead, 'Legendary Army')) lines.push(`${lead.name}'s host is hailed as a Legendary Army`);
    if (lead && lead.army && lead.army.wins >= 3 && !lead.titles.rank && lead.role === 'officer') { lead.titles.rank = wR.tier === 'Kingdom' && this.realmOfficers(wR).every(o => o.titles.rank !== 'Marshal') ? 'Marshal' : 'General'; lines.push(`${lead.name} is named ${lead.titles.rank}`); lead.loyalty = Math.min(100, lead.loyalty + 15); }
    const decisive = loserStart && loserCas / loserStart > 0.45;
    const sizes = i => ctx.cfg.sides[i].divisions.reduce((a, d) => a + d.count, 0);
    const troopWord = `${sizes(0).toLocaleString()} against ${sizes(1).toLocaleString()}`;
    const imp = decisive || lines.length > 1 || ctx.big ? 2 : 1;
    this.log(imp, 'battle', `Battle of ${target.name} (${this.season.toLowerCase()}, ${target.biome}). ${att.name} attacks ${def.name}, ${troopWord}. ${wR.name}, led by ${lead ? this.fullName(lead) : 'its levies'}, ${decisive ? 'crushes' : 'defeats'} ${lR.name}.${lines.length ? ' ' + lines.join('; ').replace(/^./, c => c.toUpperCase()) + '.' : ''}`, [...ctx.aOff, ...ctx.dOff].map(o => o.id));
    const last = this.chronicle[this.chronicle.length - 1]; last.battle = ctx.index; last.watched = !!ctx.watched;
    this.afterBattle(ctx, { attackerWon: wonSide === 0, decisive });
  }

  finishWatched(b) {
    const ctx = this.pendingBattle; if (!ctx) return;
    this.pendingBattle = null; ctx.watched = true;
    if (!(this.watchedList || (this.watchedList = [])).includes(ctx.index)) this.watchedList.push(ctx.index);
    this.applyBattle(ctx, b);
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
  duel(a, b, reason, training) {
    this.stats.duels++;
    const sa = a.stats.mig * 2 + a.level + this.r() * 15 - (a.wounded ? 6 : 0);
    const sb = b.stats.mig * 2 + b.level + this.r() * 15 - (b.wounded ? 6 : 0);
    const [w, l] = sa >= sb ? [a, b] : [b, a];
    w.duelWins++; w.fame += training ? 3 : 5; this.gainXp(w, 20);
    this.opine(l, w, -25);
    if (!training) {
      const roll = this.r();
      if (roll < 0.1) { this.die(l, `slain in a duel by ${w.name}`); }
      else if (roll < 0.35) l.wounded = 8;
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

  // ---------- intrigue: spies, assassins, rumors ----------
  spymaster(r) { const offs = this.living().filter(c => c.realmId === r.id && (c.role === 'officer' || c.role === 'ruler' || c.role === 'courtier') && this.age(c) >= 16); return offs.sort((a, b) => b.stats.int - a.stats.int)[0]; }
  guardSetting(r) {
    // rulers who feel threatened tighten security
    const ruler = this.char(r.rulerId);
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
      const spyName = this.personName(cultureById(A.culture), this.chance(0.4));
      const cover = this.pick(['a wine merchant', 'a pilgrim', 'a traveling minstrel', 'a stablehand', 'a scribe']);
      const success = sm.stats.int + this.r() * 12 > (tm ? tm.stats.int : 5) + GUARD[this.guardSetting(B)].catch * 12;
      if (success) {
        w.intel[A.id] = (w.intel[A.id] || 0) + 0.2; this.gainXp(sm, 15);
        if (this.chance(0.4)) this.log(1, 'spy', `A spy of ${A.name}, posing as ${cover}, slips into ${B.name} and returns with their battle plans.`, [sm.id]);
      } else {
        const fate = this.r(); const br = this.char(B.rulerId);
        if (fate < 0.45) { this.log(1, 'spy', `${spyName}, a spy of ${A.name} disguised as ${cover}, is caught in ${B.name} and hanged at the gate.`, [br?.id].filter(Boolean)); if (br && this.has(br, 'cruel')) this.spreadRumor(br, 'butcher', 1); }
        else if (fate < 0.75) { w.intel[B.id] = (w.intel[B.id] || 0) + 0.15; w.intel[A.id] = (w.intel[A.id] || 0) - 0.15; this.log(2, 'spy', `${tm ? this.fullName(tm) : B.name}'s spymaster catches ${spyName}, a spy of ${A.name}, and turns them. False plans now flow back to ${A.name}.`, [tm?.id, sm.id].filter(Boolean)); }
        else { A.treasury -= 15; B.treasury += 15; this.log(1, 'spy', `${spyName}, caught spying for ${A.name}, is ransomed back for silver.`, []); }
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
    if (this.chance(0.12)) {
      const plotters = this.living().filter(c => !c.prisonerOf && this.age(c) >= 18 && (this.has(c, 'ambitious') || this.has(c, 'deceitful')) && c.stats.int >= 8);
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
        if (target && target.alive && target.id !== p.id) this.assassination(p, target, motive);
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
    const map = { butcher: 'the Butcher', merciful: 'the Merciful', oathbreaker: 'the Oathbreaker', traitor: 'the Traitor', kinslayer: 'the Kinslayer' };
    const title = map[kind];
    if (c.rumors[kind] >= 4 && c.titles.rep !== title && c.titles.rep !== 'Deaf Ears') {
      c.titles.rep = title;
      this.log(2, 'rumor', `Across taverns and market squares, ${c.name}${c.dynasty ? ' ' + c.dynasty : ''} is now called ${title}.`, [c.id]);
    }
  }

  // ---------- tournaments ----------
  tournaments() {
    for (const r of this.realmList()) {
      if (r.tier === 'Village' || r.treasury < 150 || this.wars.some(w => !w.over && (w.a === r.id || w.b === r.id)) || !this.chance(0.15)) continue;
      const cap = this.sett(r.capital);
      const pool = this.living().filter(c => this.age(c) >= 17 && this.age(c) <= 50 && !c.prisonerOf && !c.wounded && ['officer', 'ruler', 'vagabond', 'courtier', 'merc'].includes(c.role) && this.dist(c, cap) < 15);
      const entrants = this.shuffle(pool).slice(0, 8);
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
        const victim = this.chance(0.5) ? ruler : this.pick(entrants.filter(e => e.alive && e.role !== 'vagabond')) || ruler;
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
      if (this.chance(p)) { this.die(c, a > 60 ? 'old age' : this.pick(['a fever', 'the bloody flux', 'a fall from a horse', 'a winter chill'])); continue; }
      // births
      if (c.female && c.spouseId && a >= 17 && a <= 42) {
        const sp = this.char(c.spouseId);
        if (sp && sp.alive && this.chance(0.011)) {
          const dyn = c.noble ? (sp.role === 'ruler' || !c.dynasty ? sp.dynasty : c.dynasty) : sp.dynasty;
          const k = this.makeChar({ culture: this.chance(0.5) ? c.culture : sp.culture, age: 0, role: 'child', dynasty: dyn || c.dynasty, noble: c.noble || sp.noble });
          this.setParents(k, sp.role === 'ruler' ? sp : c, sp.role === 'ruler' ? c : sp);
          if (c.culture !== sp.culture) k.mixed = [c.culture, sp.culture];
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
      if (!c.spouseId && a >= 18 && a <= 45 && (c.noble || c.role === 'officer' || c.role === 'ruler') && this.chance(0.25)) this.seekMarriage(c);
      if (c.role === 'officer') {
        const r = this.realm(c.realmId); const ruler = r && this.char(r.rulerId);
        if (!r || !r.alive || !ruler) { c.role = 'vagabond'; continue; }
        c.loyalty += (this.op(c, ruler) > 20 ? 2 : -1) + (r.treasury < 0 ? -6 : 0) + (this.has(ruler, 'cruel') ? -3 : 0) + (this.has(c, 'loyal') ? 3 : 0) + (this.has(c, 'ambitious') ? -2 : 0);
        c.loyalty = Math.max(0, Math.min(100, c.loyalty));
        this.gainXp(c, 10);
        if (c.army) { c.army.size = Math.min(Math.round((90 + c.stats.lea * 22) * (r.tier === 'Village' ? 0.5 : 1.2)), c.army.size + Math.round(this.realmPop(r) * 0.01)); }
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
      const need = r.tier === 'Village' ? 0 : Math.ceil(r.setts.size / 2) + 1;
      if (this.realmOfficers(r).length - 1 < need && this.chance(0.5)) {
        const v = this.living().find(c => c.role === 'vagabond' && this.age(c) >= 18 && this.realmSetts(r).some(s => this.dist(s, c) < 6));
        if (v) { this.addOfficer(r, v); v.army = this.newArmy(v, 0.6); if (v.fame > 10) this.log(1, 'rise', `The wanderer ${this.fullName(v)} enters the service of ${r.name}.`, [v.id]); }
        else { const nc = this.makeChar({ culture: r.culture, age: this.ri(20, 35), role: 'officer', dynasty: this.dynastyName(), noble: true }); this.addOfficer(r, nc); }
      }
      this.pickHeir(r);
      // village rulers with ambition try to unite neighbours
      if (ruler && (this.has(ruler, 'ambitious') || ruler.fame > 30) && this.chance(0.12)) {
        const near = this.neighbours(r, 6).filter(o => o.tier === 'Village' && o.setts.size === 1 && !this.atWar(r, o));
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
          const founder = this.living().find(c => (c.role === 'vagabond' || c.role === 'bandit') && this.dist(c, s) < 10) || this.makeChar({ culture: s.culture, age: this.ri(22, 45), role: 'vagabond' });
          s.destroyed = false; s.pop = this.ri(80, 200); s.food = 40; s.unrest = 10; s.famine = false; s.realmId = null;
          const r = this.makeRealm(s, founder.id); founder.role = 'ruler'; founder.realmId = r.id; founder.settId = s.id;
          founder.dynasty = founder.dynasty || this.dynastyName(); r.dynasty = founder.dynasty; founder.army = this.newArmy(founder, 0.3); founder.fame += 5;
          this.stats.realmsRisen++;
          this.log(2, 'rise', `${this.fullName(founder)}${founder.fame > 15 ? ', a wanderer of some fame,' : ''} gathers settlers and rebuilds ${s.name} from its ruins.`, [founder.id]);
        }
        continue;
      }
      if (this.chance(s.pop / 9000)) {
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

  // ---------- views ----------
  famous(n = 40) { return this.living().filter(c => this.age(c) >= 16).sort((a, b) => b.fame + (b.role === 'ruler' ? 30 : 0) - (a.fame + (a.role === 'ruler' ? 30 : 0))).slice(0, n); }
}

export { TROOP_TIERS, GUARD, MON };
