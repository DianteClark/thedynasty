// The Dynasty: Warlord. 3.1: quick battles on road maps while the camp and campaign are built.
import { UNITS, BASE_CAPS, BASE_LAYOUTS } from './battle.js';
import { commandBattle } from './battleview.js';
import { generateMap } from './bmap.js';
import { CULTURES, cultureById } from './names.js';
import { portrait } from './portrait.js';

const $ = s => document.querySelector(s);
const view = $('#view');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const TERRAINS = ['plains', 'forest', 'swamp', 'wasteland', 'tundra', 'mountain'];
const SIZES = [4000, 8000, 15000, 30000];
const setup = { you: 'aldmark', foe: 'orc', size: 8000, terrain: 'plains', ai: 'balanced', nature: 'on' };
try { Object.assign(setup, JSON.parse(localStorage.getItem('warlord.quick') || '{}')); } catch (e) { /* ignore */ }
const pick = a => a[Math.floor(Math.random() * a.length)];

function officer(f, i) {
  const c = cultureById(f); const female = Math.random() < 0.4;
  const st = () => 6 + Math.floor(Math.random() * 11);
  return { id: Math.floor(Math.random() * 1e6) + i, name: female ? pick(c.f) + pick(c.fe) : pick(c.m) + pick(c.me), female, culture: f, stats: { lea: st(), mig: st(), int: st(), cha: st() } };
}
// a side for a quick battle: officers on the roads, garrisons in the bases, the lord's reserve at camp
function army(f, total, name, color, ai) {
  const per = total / 2, nOff = Math.max(3, Math.min(8, Math.round(per / 900)));
  const offPool = per * 0.55, each = Math.min(1500, Math.round(offPool / nOff));
  const units = UNITS[f].map((u, i) => ({ ...u, i }));
  const tiers = units.filter(u => u.role !== 'flyer' || Math.random() < 0.5);
  const divisions = Array.from({ length: nOff }, (_, k) => { const o = officer(f, k); const u = k < 2 ? units.find(x => x.entry && (x.role === 'inf' || x.role === 'heavy')) || units[0] : pick(tiers); return { faction: f, unit: u.i, count: each, level: 2 + Math.floor(Math.random() * 4), officer: { name: o.name, stats: o.stats, ref: o.id, culture: f, female: o.female } }; });
  return { faction: f, name, color, ai, canFire: true, mods: {}, reserve: { count: Math.round(per * 0.15), unit: Math.max(0, units.findIndex(x => x.entry && x.role === 'inf')) }, divisions };
}
function quickBattle() {
  const pattern = pick(BASE_LAYOUTS[setup.terrain] || ['2-2-1']);
  const seed = Math.floor(Math.random() * 1e9);
  const map = generateMap({ seed, total: setup.size, terrain: setup.terrain, pattern });
  const sides = [army(setup.you, setup.size, 'Your army', '#4fa3ff', null), army(setup.foe, setup.size, `The ${cultureById(setup.foe).name} warlord`, '#ff5a4a', setup.ai)];
  const garrison = setup.size / 2 * 0.3; const W = { main: 2, fort: 1.5, outpost: 1 };
  const ent = (f, roles) => Math.max(0, UNITS[f].findIndex(u => u.entry && roles.includes(u.role)));
  const bases = [];
  for (const side of [0, 1]) {
    const mine = map.bases.filter(b => b.side === side); const sw = mine.reduce((a, b) => a + W[b.kind], 0); const f = side ? setup.foe : setup.you;
    for (const b of mine) bases.push({ side, kind: b.kind, fx: b.fx, fy: b.fy, count: Math.max(40, Math.min(BASE_CAPS[b.kind], Math.round(garrison * W[b.kind] / sw))), faction: f, unit: ent(f, b.kind === 'fort' ? ['ranged', 'magic'] : ['inf', 'heavy']), name: (side ? 'their ' : 'your ') + (b.kind === 'main' ? 'main camp' : b.kind) });
  }
  const cfg = { seed, terrain: setup.terrain, season: 'Summer', map, bases, symmetric: true, sides, cards: true, events: setup.nature !== 'off' };
  commandBattle(cfg, { title: `${setup.size.toLocaleString()} troops on the ${setup.terrain} · bases ${pattern}` }, 0, b => { lastResult = b.winner === 0 ? 'Victory' : 'Defeat'; render(); });
}
let lastResult = null;

function chips(key, list, label = x => x) { return `<div class="chips">${list.map(v => `<button class="chip ${String(setup[key]) === String(v) ? "on" : ""}" data-set="${key}" data-v="${v}">${esc(label(v))}</button>`).join('')}</div>`; }
function render() {
  const you = cultureById(setup.you), foe = cultureById(setup.foe);
  view.innerHTML = `
    <div class="card hero-card"><h3>⚔ The Dynasty: Warlord</h3><div class="sub">Lead armies of up to 30,000 down roads, passes and bridges. Burn the enemy's main camp to win. Garrisons guard every base and sleep until you come near.</div>
      <div class="sub" style="margin-top:6px">Coming next: your own persistent army, and a campaign against rival warlords.</div></div>
    ${lastResult ? `<div class="card"><b>${lastResult}.</b> <span class="sub">Fight another?</span></div>` : ''}
    <h2 class="sec">Quick battle</h2>
    <label class="field"><span>Your army: ${esc(you.name)} (${esc(you.race)})</span></label>${chips('you', CULTURES.map(c => c.id), id => cultureById(id).name)}
    <label class="field"><span>The enemy: ${esc(foe.name)} (${esc(foe.race)})</span></label>${chips('foe', CULTURES.map(c => c.id), id => cultureById(id).name)}
    ${chips('ai', ['reckless', 'balanced', 'cautious'], a => a[0].toUpperCase() + a.slice(1) + ' general')}
    <label class="field"><span>Troops on the field (both sides)</span></label>${chips('size', SIZES.map(String), v => (+v).toLocaleString())}
    <label class="field"><span>Battlefield</span></label>${chips('terrain', TERRAINS, t => t[0].toUpperCase() + t.slice(1))}
    <label class="field"><span>Nature: landslides, collapsing bridges, floods, wildfires and storms</span></label>${chips('nature', ['on', 'off'], v => v === 'on' ? 'Nature strikes' : 'Calm skies')}
    <button class="btn" id="go">Take the field</button>
    <p class="note">Stratagems: you hold four cards and earn a command point (⚡) every 6 seconds. Tap a card, then tap where it goes: fire on a spot, drums to rally, a forced march or shield wall on your division, discord on theirs, rockfall on a pass, fire on a bridge, or a relief column from camp. Watch for ⚠: nature can close a road under anyone's feet.</p>
    <p class="note">How to fight: tap an officer's card to give orders. "Go to a base" sends them down the roads to any base you tap. Your reserve takes simple orders: defend, push, or reinforce an officer. Zoom out to Mid at most; tap a card to jump to that officer.</p>
    <h2 class="sec">More</h2>
    <a class="btn ghost" style="display:block;text-align:center;text-decoration:none" href="classic/">Play The Dynasty (classic): the living-world sim</a>
    <a class="btn ghost" style="display:block;text-align:center;text-decoration:none" href="stress.html">Troop stress test (FPS)</a>
    <p class="note">All art is from the HAS (Heroic Fantasy) packs by Aleksandr Makarov (@IknowKingRabbit), used under its license. Thank you, Aleksandr.</p>`;
}
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.set) { setup[t.dataset.set] = t.dataset.set === 'size' ? +t.dataset.v : t.dataset.v; try { localStorage.setItem('warlord.quick', JSON.stringify(setup)); } catch (err) { /* ignore */ } render(); }
  if (t.id === 'go') quickBattle();
});
render();
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
