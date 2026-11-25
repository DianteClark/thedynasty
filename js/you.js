// The "You" tab: create your character, see your life, act, name a successor.
import { CULTURES, cultureById } from './names.js';
import { SIZES, MON } from './sim.js';
import { UNITS } from './battle.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pct = p => Math.round(p * 100) + '%';
const ORIGINS = [
  { id: 'vagabond', name: 'Vagabond', blurb: 'You and a companion or two, a few sellswords, 40 gold and the open road. The hardest start, with the most freedom.' },
  { id: 'headman', name: 'Village headman', blurb: 'You inherit a free village: a militia, a granary and neighbours who may not stay friendly.' },
  { id: 'lord', name: 'Minor lord', blurb: 'You inherit a lordship of a few holdings, with officers, an army and stronger neighbours.' },
  { id: 'heir', name: 'Heir', blurb: 'You are heir to a kingdom and an officer in its army. The throne is yours when the ruler dies, if you live that long.' },
];
const form = { origin: 'vagabond', culture: 'aldmark', name: '', female: false, mode: 'ironman', size: 'large', seed: '' };

function unitIcon(f, u, px = 36) { return `<span class="uicon" style="width:${px}px;height:${px}px;background:url(assets/units/${f}.png) 0 -${u * px}px / ${px * 20}px auto no-repeat"></span>`; }

export function renderCreation(view, world, isNewLife) {
  const sizeRow = isNewLife ? '' : `<label class="field"><span>World size</span></label><div class="chips">${Object.entries(SIZES).map(([k, v]) => `<button class="chip ${form.size === k ? 'on' : ''}" data-f="size" data-v="${k}">${v.label}</button>`).join('')}</div>
    <label class="field"><span>World seed (optional, share it to give a friend the same world)</span><input id="fSeed" value="${esc(form.seed)}" placeholder="random" autocomplete="off"></label>`;
  view.innerHTML = `
    <div class="card hero-card"><h3>${isNewLife ? 'A new life in this world' : 'Begin your story'}</h3>
      <div class="sub">${isNewLife ? 'The world remembers what came before. Choose who you are now.' : 'A world is born and lives through 30 years of history. Then you are dropped somewhere in it. One life; name a successor or your story ends with you.'}</div></div>
    <h2 class="sec">Origin</h2>
    ${ORIGINS.map(o => `<button class="card tap origin ${form.origin === o.id ? 'on' : ''}" data-f="origin" data-v="${o.id}"><b>${o.name}</b><div class="sub">${o.blurb}</div></button>`).join('')}
    <h2 class="sec">Culture</h2>
    <div class="cultgrid">${CULTURES.map(c => `<button class="cult ${form.culture === c.id ? 'on' : ''}" data-f="culture" data-v="${c.id}">${unitIcon(c.id, 0)}<span><b>${c.name}</b><small>${c.race}</small></span></button>`).join('')}</div>
    <div class="sub" style="margin:6px 2px">If no realm of your culture fits your origin, fate picks another.</div>
    <h2 class="sec">You</h2>
    <label class="field"><span>Name (leave blank for one from your culture)</span><input id="fName" value="${esc(form.name)}" maxlength="24" autocomplete="off"></label>
    <div class="chips"><button class="chip ${!form.female ? 'on' : ''}" data-f="female" data-v="0">Man</button><button class="chip ${form.female ? 'on' : ''}" data-f="female" data-v="1">Woman</button></div>
    <h2 class="sec">Mode</h2>
    <div class="chips"><button class="chip ${form.mode === 'ironman' ? 'on' : ''}" data-f="mode" data-v="ironman">Ironman</button><button class="chip ${form.mode === 'casual' ? 'on' : ''}" data-f="mode" data-v="casual">Casual</button></div>
    <div class="sub" style="margin:4px 2px">${form.mode === 'ironman' ? 'One life. If you die without a worthy successor, your line ends.' : 'Same rules, but fate spares you from death once.'}</div>
    ${sizeRow}
    <button class="btn" data-y="${isNewLife ? 'newlife' : 'begin'}">${isNewLife ? 'Begin this life' : 'Create the world'}</button>`;
}
export function readForm() {
  const n = document.querySelector('#fName'); if (n) form.name = n.value;
  const s = document.querySelector('#fSeed'); if (s) form.seed = s.value.trim();
  return { ...form };
}
export function handleFormClick(t) {
  if (t.dataset.f == null) return false;
  readForm();
  const k = t.dataset.f, v = t.dataset.v;
  form[k] = k === 'female' ? v === '1' : v;
  return true;
}

function roleLine(w, p) {
  const r = w.realm(p.realmId);
  if (p.role === 'ruler' && r) return `${w.rulerTitle(r, p)} of ${r.name} (${r.tier.toLowerCase()})`;
  if (p.role === 'officer' && r) return `${r.heirId === p.id ? 'Heir and ' : ''}${p.titles.rank || 'officer'} of ${r.name}`;
  const s = w.sett(p.settId); return `Vagabond${s ? ` at ${s.name}` : ''}`;
}

export function renderYou(view, w) {
  if (!w || !w.playerId) return renderCreation(view, w, false);
  if (w.gameOver) return renderGameOver(view, w);
  const p = w.player; const r = w.playerRealm(); const rules = w.playerRules();
  const st = p.stats; const mates = w.living().filter(x => x.companionOf === p.id);
  const succ = w.chosenSuccessor(p); const sv = w.successorValid(p, succ);
  const warnings = (w.plots || []).filter(x => x.warned);
  const wars = r ? w.wars.filter(x => !x.over && (x.a === r.id || x.b === r.id)) : [];
  const task = p.task ? (p.task.lair ? `Hunting ${MON[w.lairs.find(l => l.id === p.task.lair)?.key]?.the || 'a monster'}` : p.task.bandit ? `Hunting the bandit ${w.char(p.task.bandit)?.name || ''}` : `Travelling to ${w.sett(p.task.to)?.name}`) : null;
  const story = p.log.map(i => w.chronicle[i]).filter(Boolean).slice(-10).reverse();
  let html = `
    <div class="card hero-card">
      <div style="display:flex;gap:10px;align-items:center">${unitIcon(p.army ? p.army.faction : p.culture, p.army ? p.army.unit : w.pickUnitView(p), 48)}<div style="flex:1">
        <h3>${esc(p.name)}${p.dynasty ? ' ' + esc(p.dynasty) : ''}</h3>
        <div class="sub">${esc(roleLine(w, p))}</div>
        <div class="sub">${cultureById(p.culture).race} · age ${w.age(p)} · level ${p.level}/20 · fame ${Math.round(p.fame)} · ${w.mode === 'ironman' ? 'Ironman' : `Casual${w.spared ? ' (spare used)' : ''}`}</div></div></div>
      <div style="margin-top:6px">${['rank', 'deed', 'rep'].map(k => p.titles[k] ? `<span class="tag ${k === 'rep' ? 'rep' : 'title'}">${k === 'deed' ? '★ ' : ''}${esc(p.titles[k])}</span>` : '').join('')}${p.traits.map(t => `<span class="tag">${t}</span>`).join('')}${p.wounded ? '<span class="tag war">Wounded</span>' : ''}${p.prisonerOf ? `<span class="tag war">Prisoner of ${esc(w.realm(p.prisonerOf)?.name || '?')}</span>` : ''}</div>
      <div class="statgrid"><div><b>${st.lea}</b><small>Leadership</small></div><div><b>${st.mig}</b><small>Might</small></div><div><b>${st.int}</b><small>Intellect</small></div><div><b>${st.pol}</b><small>Politics</small></div><div><b>${st.cha}</b><small>Charisma</small></div></div>
      <div class="kv">${rules ? `<div><b>${Math.round(r.treasury)}</b><small>Treasury</small></div><div><b>${w.realmSetts(r).length}</b><small>Holdings</small></div>` : `<div><b>${p.gold || 0}</b><small>Gold</small></div><div><b>${p.followers || 0}</b><small>Followers</small></div>`}<div><b>${p.army ? p.army.size : mates.length}</b><small>${p.army ? esc(w.plural(w.unitName(p.army))) : 'Companions'}</small></div></div>
      ${task ? `<div class="tag" style="margin-top:8px">🧭 ${esc(task)}</div>` : ''}
      <div class="wrow"><button class="pill" data-char="${p.id}">Your full record</button>${r ? `<button class="pill" data-realm="${r.id}">${esc(r.name)}</button>` : ''}${p.spouseId ? `<button class="pill" data-char="${p.spouseId}">Spouse: ${esc(w.char(p.spouseId).name)}</button>` : ''}${mates.map(m => `<button class="pill" data-char="${m.id}">Companion: ${esc(m.name)}</button>`).join('')}</div>
    </div>`;
  if (warnings.length || wars.length || p.wounded) {
    html += `<div class="card danger"><h3>⚠ Dangers</h3>
      ${warnings.map(x => `<div class="sub">• A plot against your life is under way${x.by && w.char(x.by) && p.stats.int > 12 ? ` (traced to ${esc(w.char(x.by).name)})` : ''}. ${rules ? 'Lock down the guard.' : 'Keep moving.'}</div>`).join('')}
      ${wars.map(x => { const o = w.realm(x.a === r.id ? x.b : x.a); return `<div class="sub">• At war with ${esc(o?.name || '?')} (${esc(x.reason)})${x.march ? ` · a host is on the march` : ''}</div>`; }).join('')}
      ${p.wounded ? `<div class="sub">• You are wounded. Rest before you fight again.</div>` : ''}</div>`;
  }
  // successor
  const cands = w.successorCandidates(p);
  html += `<div class="card"><h3>👑 Successor</h3>
    <div class="sub">${succ ? `${esc(w.fullName(succ))} ${sv.ok ? '<span class="tag title">ready</span>' : `<span class="tag war">${esc(sv.why)}</span>`}` : '<span class="tag war">No one. If you die now, your line ends.</span>'}</div>
    ${cands.length ? `<div class="chips" style="margin-top:8px">${cands.map(c => { const v = w.successorValid(p, c.c); return `<button class="chip ${succ && succ.id === c.c.id ? 'on' : ''}" data-y="successor" data-id="${c.c.id}">${esc(c.c.name)} · ${c.why}${v.ok ? '' : ' ⚠'}</button>`; }).join('')}</div>` : '<div class="sub" style="margin-top:6px">Marry, have children, swear an oath or gather companions to have someone to pass your story to.</div>'}
  </div>`;
  html += `<h2 class="sec">What will you do?</h2>` + actions(w, p, r, rules);
  html += `<h2 class="sec">Your story</h2>${story.map(e => `<div class="entry i${e.importance}"><div class="meta">Year ${e.y}</div>${esc(e.text)}</div>`).join('') || '<div class="sub">Your story is only beginning.</div>'}`;
  view.innerHTML = html;
}

function btn(label, a, extra = '') { return `<button class="abtn" data-act='${esc(JSON.stringify(a))}' ${extra}>${label}</button>`; }
function actions(w, p, r, rules) {
  let h = '';
  if (p.prisonerOf) return '<div class="card"><div class="sub">You are a prisoner. You will be ransomed when the war ends, if you live.</div></div>';
  if (p.role === 'vagabond') {
    const here = w.sett(p.settId);
    const near = w.setts.filter(s => !s.destroyed && s.id !== p.settId).sort((a, b) => w.dist(a, p) - w.dist(b, p)).slice(0, 5);
    h += `<div class="card"><h3>🧭 Travel</h3><div class="sub">Pick a destination here, or tap any settlement on the Map.</div><div class="abtns">${near.map(s => btn(`${esc(s.name)} · ${Math.max(1, Math.ceil(w.dist(s, p) / 3.4))} mo`, { type: 'travel', to: s.id })).join('')}</div></div>`;
    const cons = w.contractsHere();
    h += `<div class="card"><h3>⚔ Contracts</h3>${cons.length ? cons.map(c => {
      if (c.kind === 'bandit') return `<div class="arow"><div><b>${esc(c.label)}</b><div class="sub">Reward ~${c.reward} gold · odds ${pct(c.odds)} · fought on the battle map</div></div>${btn('Hunt', { type: 'contract', kind: 'bandit', id: c.id })}</div>`;
      const L = c.lair, M = MON[L.key];
      return `<div class="arow"><div><b>${esc(c.label)}</b><div class="sub">Reward ~${c.reward} gold · lose and you may die</div></div><div class="abtns">${btn(`Slay ${pct(w.huntOdds(L, 'slay'))}`, { type: 'contract', kind: 'lair', id: L.id, approach: 'slay' })}${!M.rift && M.key !== 'dragon' ? btn(`Trap ${pct(w.huntOdds(L, 'trap'))}`, { type: 'contract', kind: 'lair', id: L.id, approach: 'trap' }) : ''}${M.tame ? btn(`Tame ${pct(w.huntOdds(L, 'tame'))}`, { type: 'contract', kind: 'lair', id: L.id, approach: 'tame' }) : ''}</div></div>`;
    }).join('') : '<div class="sub">No bandits or monsters within reach. Travel to find work.</div>'}</div>`;
    const recruits = w.living().filter(x => x.role === 'vagabond' && x.id !== p.id && !x.companionOf && w.dist(x, p) < 2).slice(0, 4);
    h += `<div class="card"><h3>🛡 Your band</h3><div class="sub">${p.followers || 0} sellswords. Hiring costs 6 gold a head.</div><div class="abtns">${btn('Hire 5', { type: 'hire', n: 5 })}${btn('Hire 10', { type: 'hire', n: 10 })}</div>
      ${recruits.length ? `<div class="sub" style="margin-top:8px">Wanderers here who might join you (20 gold to win them over):</div><div class="abtns">${recruits.map(v => btn(`${esc(v.name)} (Might ${v.stats.mig}, Int ${v.stats.int})`, { type: 'recruitCompanion', id: v.id })).join('')}</div>` : ''}</div>`;
    const lord = here && w.realm(here.realmId);
    h += `<div class="card"><h3>🏰 A place in the world</h3>
      ${lord && lord.tier !== 'Village' ? `<div class="arow"><div><b>Offer your sword to ${esc(lord.name)}</b><div class="sub">Become an officer with an army. Needs a name for yourself (fame and charisma).</div></div>${btn('Offer', { type: 'serve', realm: lord.id })}</div>` : '<div class="sub">No lord holds court here.</div>'}
      <div class="arow"><div><b>Found a village</b><div class="sub">Settle nearby ruins or free land. Needs 12 followers and fame 15 (you have ${p.followers || 0} and ${Math.round(p.fame)}).</div></div>${btn('Found', { type: 'found' })}</div></div>`;
  } else if (p.role === 'officer') {
    const peers = r ? w.realmOfficers(r).filter(o => o.id !== p.id && o.id !== r.rulerId) : [];
    h += `<div class="card"><h3>⚔ Your command</h3><div class="sub">You fight in ${esc(r.name)}'s wars. When your army takes the field, you command it.</div>
      <div class="arow"><div><b>Drill your troops</b><div class="sub">Once a year. Builds toward the next troop tier.</div></div>${btn('Drill', { type: 'train' })}</div>
      ${!p.oath.length && peers.length ? `<div class="sub" style="margin-top:8px">Swear brotherhood with a fellow officer:</div><div class="abtns">${peers.slice(0, 5).map(o => btn(`${esc(o.name)} (likes you ${Math.round(w.op(o, p))})`, { type: 'oath', id: o.id })).join('')}</div>` : ''}
      <div class="arow"><div><b>Leave service</b><div class="sub">Take a few loyal soldiers and return to the road.</div></div>${btn('Leave', { type: 'leave' })}</div>
      ${r && w.realmSetts(r).length > 2 ? `<div class="arow"><div><b>Rebel</b><div class="sub">Seize the nearest holding and declare yourself free. Means war, and men will call you traitor.</div></div>${btn('Rebel', { type: 'rebel' }, 'data-confirm="Raise your banners against your lord?"')}</div>` : ''}</div>`;
  } else if (rules) {
    const neigh = w.neighbours(r).filter(o => !w.atWar(r, o));
    const wars = w.wars.filter(x => !x.over && (x.a === r.id || x.b === r.id));
    const villages = w.neighbours(r, 7).filter(o => o.tier === 'Village' && o.setts.size === 1);
    const hire = w.living().filter(v => v.role === 'vagabond' && w.realmSetts(r).some(s => w.dist(s, v) < 6)).slice(0, 4);
    h += `<div class="card"><h3>🏛 Governing</h3>
      <div class="sub">Taxes: low taxes calm the people, high taxes fill the treasury and anger them.</div>
      <div class="chips">${['low', 'normal', 'high'].map(l => `<button class="chip ${(r.tax || 'normal') === l ? 'on' : ''}" data-act='${JSON.stringify({ type: 'tax', level: l })}'>${l[0].toUpperCase() + l.slice(1)}</button>`).join('')}</div>
      <div class="sub" style="margin-top:6px">Guard at ${esc(w.sett(r.capital)?.name || 'your seat')}: tighter guards catch more assassins, cost gold and stir unrest.</div>
      <div class="chips">${['Light', 'Watchful', 'Locked Down'].map(l => `<button class="chip ${(r.guardChoice || 'Light') === l ? 'on' : ''}" data-act='${JSON.stringify({ type: 'guard', level: l })}'>${l}</button>`).join('')}</div>
      ${hire.length ? `<div class="sub" style="margin-top:6px">Wanderers who would serve you (40 gold):</div><div class="abtns">${hire.map(v => btn(`${esc(v.name)} (Lead ${v.stats.lea}, Might ${v.stats.mig})`, { type: 'recruit', id: v.id })).join('')}</div>` : ''}
      ${r.tier !== 'Village' ? `<div class="arow"><div><b>Host a tournament</b><div class="sub">80 gold. Fame, marriage offers, and a crowd an assassin could hide in.</div></div>${btn('Host', { type: 'tournament' })}</div>` : ''}</div>`;
    h += `<div class="card"><h3>⚔ War and peace</h3>
      ${wars.map(x => { const o = w.realm(x.a === r.id ? x.b : x.a); return `<div class="arow"><div><b>At war with ${esc(o.name)}</b><div class="sub">${esc(x.reason)} · ${x.battles} battle(s)</div></div>${btn('Sue for peace', { type: 'peace', realm: o.id })}</div>`; }).join('')}
      ${neigh.length ? `<div class="sub">Declare war on a neighbour (strength: yours ${Math.round(w.realmStrength(r)).toLocaleString()}):</div><div class="abtns">${neigh.slice(0, 6).map(o => btn(`${esc(o.name)} (${Math.round(w.realmStrength(o)).toLocaleString()})${r.allies.has(o.id) ? ' · ally!' : ''}`, { type: 'war', realm: o.id }, `data-confirm="Declare war on ${esc(o.name)}?"`)).join('')}</div>` : '<div class="sub">No neighbours within reach.</div>'}
      ${villages.length ? `<div class="sub" style="margin-top:8px">Win over a free village (once a year; charisma, fame and past kindness help):</div><div class="abtns">${villages.slice(0, 5).map(o => btn(esc(o.name), { type: 'persuade', realm: o.id })).join('')}</div>` : ''}</div>`;
  }
  if (!p.spouseId) {
    const cands = w.marriageCandidates(p).slice(0, 5);
    if (cands.length) h += `<div class="card"><h3>💍 Marriage</h3><div class="sub">A match brings heirs, and between ruling houses, an alliance.</div><div class="abtns">${cands.map(c => btn(`${esc(c.name)}${c.dynasty ? ' ' + esc(c.dynasty) : ''} (${c.role === 'ruler' ? 'ruler' : c.role}, ${w.age(c)})`, { type: 'marry', id: c.id })).join('')}</div></div>`;
  }
  return h;
}

function renderGameOver(view, w) {
  const g = w.gameOver;
  const line = w.line.map(id => w.char(id)).filter(Boolean);
  const saga = w.chronicle.filter(e => e.type === 'you' || e.ids.some(id => w.line.includes(id))).filter(e => e.importance >= 2);
  view.innerHTML = `<div class="card danger"><h3>Your line has ended</h3>
    <div class="sub">${esc(g.name)} died in year ${g.year} (${esc(g.cause)}), and ${esc(g.why)}.</div>
    <div class="sub" style="margin-top:6px">Your line: ${line.map(c => esc(w.fullName(c))).join(' → ')}</div></div>
    <button class="btn" data-y="newlife">Live a new life in this world</button>
    <button class="btn ghost" data-y="newworld">Start a new world</button>
    <h2 class="sec">The saga of your line</h2>
    ${saga.map(e => `<div class="entry i${e.importance}"><div class="meta">Year ${e.y}</div>${esc(e.text)}</div>`).join('')}`;
}
