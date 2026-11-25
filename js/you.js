// The "You" tab: create your character, see your life, act, name a successor.
import { CULTURES, cultureById } from './names.js';
import { SIZES, MON, MONTHS } from './sim.js';
import { portrait } from './portrait.js';
import { sceneVerb } from './sceneview.js';
import { UNITS } from './battle.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pct = p => Math.round(p * 100) + '%';
const ORIGINS = [
  { id: 'vagabond', name: 'Vagabond', blurb: 'You and a companion or two, a few sellswords, 40 gold and the open road. The hardest start, with the most freedom.' },
  { id: 'headman', name: 'Village headman', blurb: 'You inherit a free village: a militia, a granary and neighbours who may not stay friendly.' },
  { id: 'lord', name: 'Minor lord', blurb: 'You inherit a lordship of a few holdings, with officers, an army and stronger neighbours.' },
  { id: 'heir', name: 'Heir', blurb: 'You are heir to a kingdom and an officer in its army. The throne is yours when the ruler dies, if you live that long.' },
];
let stance = 'balanced';
export function setStance(v) { stance = v; }
const form = { origin: 'vagabond', culture: 'aldmark', name: '', female: false, mode: 'ironman', size: 'large', seed: '', start: 'history' };

function unitIcon(f, u, px = 36) { return `<span class="uicon" style="width:${px}px;height:${px}px;background:url(assets/units/${f}.png) 0 -${u * px}px / ${px * 20}px auto no-repeat"></span>`; }

export function renderCreation(view, world, isNewLife) {
  const sizeRow = isNewLife ? '' : `<label class="field"><span>World size</span></label><div class="chips">${Object.entries(SIZES).map(([k, v]) => `<button class="chip ${form.size === k ? 'on' : ''}" data-f="size" data-v="${k}">${v.label}</button>`).join('')}</div>
    <label class="field"><span>When you arrive</span></label><div class="chips"><button class="chip ${form.start === 'fresh' ? 'on' : ''}" data-f="start" data-v="fresh">The first day (Year 1)</button><button class="chip ${form.start === 'history' ? 'on' : ''}" data-f="start" data-v="history">Into history (Year 30–100)</button></div>
    <div class="sub" style="margin:4px 2px">${form.start === 'fresh' ? 'A young world: no grudges yet, no legends, every throne up for grabs.' : 'The world lives through decades of wars, dynasties and disasters before you are dropped into it.'}</div>
    <label class="field"><span>World seed (optional, share it to give a friend the same world)</span><input id="fSeed" value="${esc(form.seed)}" placeholder="random" autocomplete="off"></label>`;
  view.innerHTML = `
    <div class="card hero-card"><h3>${isNewLife ? 'A new life in this world' : 'Begin your story'}</h3>
      <div class="sub">${isNewLife ? 'The world remembers what came before. Choose who you are now.' : 'A world is born, and you are dropped somewhere in it. Time runs on its own: a month passes every minute, and you can only pause it. One life; name a successor or your story ends with you.'}</div></div>
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
      <div style="display:flex;gap:10px;align-items:center">${portrait(p, 56)}<div style="flex:1">
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
  html += `<h2 class="sec">Household and honour</h2>` + honour(w, p) + family(w, p, r) + marriage(w, p) + dynasty(w, p);
  html += `<h2 class="sec">Your story</h2>${story.map(e => `<div class="entry i${e.importance}"><div class="meta">Year ${e.y}</div>${esc(e.text)}${e.duels ? `<div class="who"><button class="pill" data-watch-duel="${w.chronicle.indexOf(e)}">▶ Watch ${e.duels.length > 1 ? `the ${e.duels.length} bouts` : 'the duel'}</button></div>` : ''}</div>`).join('') || '<div class="sub">Your story is only beginning.</div>'}`;
  view.innerHTML = html;
}

function btn(label, a, extra = '') { return `<button class="abtn" data-act='${esc(JSON.stringify(a))}' ${extra}>${label}</button>`; }
function actions(w, p, r, rules) {
  let h = '';
  if (p.prisonerOf) return '<div class="card"><div class="sub">You are a prisoner. You will be ransomed when the war ends, if you live.</div></div>';
  if (p.role === 'vagabond') {
    const here = w.sett(p.settId);
    const near = w.setts.filter(s => !s.destroyed && s.id !== p.settId).sort((a, b) => w.dist(a, p) - w.dist(b, p)).slice(0, 5);
    h += `<div class="card"><h3>🧭 Travel</h3><div class="sub">Pick a destination here, or tap any settlement on the Map.</div><div class="abtns">${near.map(s => btn(`${esc(s.name)} · ${w.tripMonths(p, s)} mo`, { type: 'travel', to: s.id })).join('')}</div></div>`;
    const cons = w.contractsHere();
    h += `<div class="card"><h3>⚔ Contracts</h3>${cons.length ? cons.map(c => {
      if (c.kind === 'bandit') return `<div class="arow"><div><b>${esc(c.label)}</b><div class="sub">Reward ~${c.reward} gold · odds ${pct(c.odds)} · fought on the battle map</div></div>${btn('Hunt', { type: 'contract', kind: 'bandit', id: c.id })}</div>`;
      const L = c.lair, M = MON[L.key];
      return `<div class="arow"><div><b>${esc(c.label)}</b><div class="sub">Reward ~${c.reward} gold · lose and you may die</div></div><div class="abtns">${btn(`Slay ${pct(w.huntOdds(L, 'slay'))}`, { type: 'contract', kind: 'lair', id: L.id, approach: 'slay' })}${!M.rift && M.key !== 'dragon' ? btn(`Trap ${pct(w.huntOdds(L, 'trap'))}`, { type: 'contract', kind: 'lair', id: L.id, approach: 'trap' }) : ''}${M.tame ? btn(`Tame ${pct(w.huntOdds(L, 'tame'))}`, { type: 'contract', kind: 'lair', id: L.id, approach: 'tame' }) : ''}</div></div>`;
    }).join('') : '<div class="sub">No bandits or monsters within reach. Travel to find work.</div>'}</div>`;
    const recruits = w.living().filter(x => x.role === 'vagabond' && x.id !== p.id && !x.companionOf && w.dist(x, p) < 2).slice(0, 4);
    h += `<div class="card"><h3>🛡 Your band</h3><div class="sub">${p.followers || 0} sellswords. Hiring costs 6 gold a head.</div><div class="abtns">${btn('Hire 5', { type: 'hire', n: 5 })}${btn('Hire 10', { type: 'hire', n: 10 })}</div>
      ${recruits.length ? `<div class="sub" style="margin-top:8px">Wanderers here who might join you (20 gold to win them over):</div><div class="abtns">${recruits.map(v => btn(`${esc(v.name)} (Might ${v.stats.mig}, Int ${v.stats.int})`, { type: 'recruitCompanion', id: v.id })).join('')}</div>` : ''}</div>`;
    const cars = (w.agents || []).filter(a => a.kind === 'caravan' && w.dist(a, p) <= 3);
    if (cars.length) h += `<div class="card"><h3>💰 Caravans on the road</h3><div class="sub">Raiding pays well, but earns you a reputation and the owners' hatred.</div><div class="abtns">${cars.map(a => btn(`Raid ${esc(w.realm(a.owner)?.name || 'merchant')} caravan (~${a.data.value * 2}g, ${a.data.guards} guards)`, { type: 'raid', id: a.id })).join('')}</div></div>`;
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
      <div class="arow"><div><b>Hold a feast</b><div class="sub">50 gold, at most twice a year. Your officers drink to your name, unless someone at the table has other ideas.</div></div>${btn('Feast', { type: 'feast' })}</div>
      ${r.tier !== 'Village' ? `<div class="arow"><div><b>Host a tournament</b><div class="sub">80 gold. Fame, marriage offers, and a crowd an assassin could hide in.</div></div>${btn('Host', { type: 'tournament' })}</div>` : ''}</div>`;
    h += council(w, r) + granaries(w, r) + armies(w, r) + intrigue(w, p, r);
    h += `<div class="card"><h3>⚔ War and peace</h3>
      ${wars.map(x => { const o = w.realm(x.a === r.id ? x.b : x.a); const sc = x.a === r.id ? x.score : -x.score; return `<div class="arow"><div><b>At war with ${esc(o.name)}</b><div class="sub">${esc(x.reason)} · ${x.battles} battle(s) · ${sc > 0 ? 'you are winning' : sc < 0 ? 'you are losing' : 'evenly matched'}</div></div></div>
        <div class="abtns">${btn('Offer peace', { type: 'peaceTerms', realm: o.id, terms: 'white' })}${btn('Pay 100 gold', { type: 'peaceTerms', realm: o.id, terms: 'gold' })}${btn('Cede a holding', { type: 'peaceTerms', realm: o.id, terms: 'cede' }, 'data-confirm="Give up a holding for peace?"')}${btn('Send a child as ward', { type: 'peaceTerms', realm: o.id, terms: 'ward' })}</div>`; }).join('')}
      ${neigh.length ? `<div class="sub">Declare war on a neighbour (strength: yours ${Math.round(w.realmStrength(r)).toLocaleString()}):</div><div class="abtns">${neigh.slice(0, 6).map(o => btn(`${esc(o.name)} (${Math.round(w.realmStrength(o)).toLocaleString()})${r.allies.has(o.id) ? ' · ally!' : ''}`, { type: 'war', realm: o.id }, `data-confirm="Declare war on ${esc(o.name)}?"`)).join('')}</div>` : '<div class="sub">No neighbours within reach.</div>'}
      ${villages.length ? `<div class="sub" style="margin-top:8px">Win over a free village (once a year; charisma, fame and past kindness help):</div><div class="abtns">${villages.slice(0, 5).map(o => btn(esc(o.name), { type: 'persuade', realm: o.id })).join('')}</div>` : ''}</div>`;
  }
  return h;
}

function marriage(w, p) {
  let h = '';
  if (!p.spouseId) {
    const cands = w.marriageCandidates(p).slice(0, 5);
    if (cands.length) h += `<div class="card"><h3>💍 Marriage</h3><div class="sub">A match brings heirs, and between ruling houses, an alliance.</div><div class="abtns">${cands.map(c => btn(`${esc(c.name)}${c.dynasty ? ' ' + esc(c.dynasty) : ''} (${c.role === 'ruler' ? 'ruler' : c.role}, ${w.age(c)})`, { type: 'marry', id: c.id })).join('')}</div></div>`;
  }
  return h;
}

// ---------- 2.5 the Court (or Camp) ----------
export function decisionCard(w, d, canAct) {
  const who = d.who != null ? w.char(d.who) : null; const left = d.due - w.monthIndex;
  const when = d.court && !w.atSeat() ? 'Your steward will settle this if you stay away' : left <= 0 ? 'Decide now' : `Decide within ${left} month${left === 1 ? '' : 's'} (by ${MONTHS[(w.month + left) % 12]})`;
  return `<div class="card dcard ${left <= 1 ? 'late' : ''}">${who ? portrait(who, 44) : '<span class="portrait" style="width:44px;height:44px;display:grid;place-items:center;font-size:22px">📜</span>'}
    <div><h3>${esc(d.title)}</h3><div class="when">${esc(when)}</div><div class="sub" style="margin-top:4px">${esc(d.text)}</div></div>
    <div class="abtns">${d.kind === 'ceremony' ? `<button class="abtn" data-scene="${d.id}">${esc(sceneVerb(d))}</button>` : d.options.map(o => `<button class="abtn" ${canAct ? `data-act='${esc(JSON.stringify({ type: 'decide', id: d.id, choice: o.id }))}'` : 'disabled'}>${esc(o.label)}</button>`).join('')}</div></div>`;
}
export function renderCourt(view, w) {
  if (!w || !w.playerId || w.gameOver) return renderYou(view, w);
  const p = w.player, r = w.playerRealm(), rules = w.playerRules();
  const all = w.decisionsFor();
  let html = '';
  if (rules) {
    const here = w.atSeat(), cap = w.sett(r.capital);
    html += here
      ? `<div class="card hero-card"><h3>🏰 The hall of ${esc(cap.name)}</h3><div class="sub">You hold court. Your council brings you business each season, and what you order takes time to happen.</div>${leadToggle(r)}</div>`
      : `<div class="card away"><h3>🏰 Away from ${esc(cap ? cap.name : 'your seat')}</h3><div class="sub">${esc(w.awayReason())} Your steward ${w.steward(r) ? esc(w.steward(r).name) : '(none appointed: your realm drifts)'} rules in your place and settles court business after a month.</div>
        ${!p.task && cap ? `<div class="abtns" style="margin-top:8px">${btn(`Return to ${esc(cap.name)} · ${w.tripMonths(p, cap)} mo`, { type: 'travel', to: cap.id })}</div>` : ''}${leadToggle(r)}</div>`;
    const court = all.filter(d => d.court);
    html += `<h2 class="sec">Court business</h2>` + (court.length ? court.map(d => decisionCard(w, d, here)).join('') : '<div class="sub" style="margin:0 2px 10px">Nothing waits on you. Your council will speak up as the seasons turn.</div>');
    const other = all.filter(d => !d.court);
    if (other.length) html += `<h2 class="sec">Other matters</h2>` + other.map(d => decisionCard(w, d, true)).join('');
    if (here) html += `<h2 class="sec">Rule</h2>` + actions(w, p, r, rules);
    else html += `<div class="card"><h3>🧭 Travel</h3><div class="sub">Tap any settlement on the Map to travel there.</div></div>`;
  } else {
    if (all.length) html += `<h2 class="sec">Matters for you</h2>` + all.map(d => decisionCard(w, d, true)).join('');
    html += actions(w, p, r, rules);
    if (p.role === 'officer') { const near = w.setts.filter(s => !s.destroyed && s.id !== p.settId).sort((a, b) => w.dist(a, p) - w.dist(b, p)).slice(0, 4); html += `<div class="card"><h3>🧭 Travel</h3><div class="sub">You may ride out between campaigns.</div><div class="abtns">${near.map(s => btn(`${esc(s.name)} · ${w.tripMonths(p, s)} mo`, { type: 'travel', to: s.id })).join('')}</div></div>`; }
  }
  view.innerHTML = html;
}
function leadToggle(r) {
  return `<div class="chips" style="margin-top:8px"><button class="chip ${r.leadInPerson ? 'on' : ''}" data-act='${JSON.stringify({ type: 'lead', on: !r.leadInPerson })}'>${r.leadInPerson ? '✓ ' : ''}Lead my armies in person</button></div><div class="sub">${r.leadInPerson ? 'You ride to war with your hosts: big bonuses, real danger, and your steward rules while you are gone.' : 'Your officers lead your attacks while you stay at court.'}</div>`;
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

function council(w, r) {
  if (r.tier === 'Village' && w.realmOfficers(r).length < 2) return '';
  const pool = w.living().filter(c => c.realmId === r.id && c.id !== r.rulerId && (c.role === 'officer' || c.role === 'courtier') && w.age(c) >= 16);
  const seat = (role, label, stat, does) => {
    const cur = w.council(r, role);
    return `<div class="arow" style="display:block"><div><b>${label}</b>: ${cur ? `<button class="pill" data-char="${cur.id}">${esc(cur.name)} (${stat} ${cur.stats[stat === 'Politics' ? 'pol' : stat === 'Intellect' ? 'int' : 'lea']})</button>` : '<span class="tag war">empty</span>'}<div class="sub">${does}</div></div>
      <div class="chips">${pool.slice().sort((a, b) => b.stats[stat === 'Politics' ? 'pol' : stat === 'Intellect' ? 'int' : 'lea'] - a.stats[stat === 'Politics' ? 'pol' : stat === 'Intellect' ? 'int' : 'lea']).slice(0, 5).map(c => `<button class="chip ${cur && cur.id === c.id ? 'on' : ''}" data-act='${esc(JSON.stringify({ type: 'appoint', role, id: c.id }))}'>${esc(c.name)} · ${c.stats[stat === 'Politics' ? 'pol' : stat === 'Intellect' ? 'int' : 'lea']}</button>`).join('')}</div></div>`;
  };
  return `<div class="card"><h3>🪶 Your council</h3><div class="sub">Councillors act on their own; pick people strong in the stat that matters.</div>
    ${seat('stewardId', 'Steward', 'Politics', 'Raises income with their Politics, and sends grain to your own starving holdings.')}
    ${seat('spymasterId', 'Spymaster', 'Intellect', 'Uncovers plots against you and runs your spies in war.')}
    ${seat('captainId', 'Captain of the Guard', 'Leadership', 'Helps catch assassins. Can set the guard for you as threats rise and fall.')}
    ${w.captain(r) ? `<div class="chips" style="margin-top:6px"><button class="chip ${r.guardAuto ? 'on' : ''}" data-act='${JSON.stringify({ type: 'guardAuto', on: !r.guardAuto })}'>${r.guardAuto ? '✓ ' : ''}Let the captain set the guard</button></div>` : ''}</div>`;
}
function granaries(w, r) {
  const mine = w.realmSetts(r);
  const starving = w.setts.filter(s => s.famine && !s.destroyed && mine.some(m => w.dist(m, s) < 9)).slice(0, 6);
  return `<div class="card"><h3>🌾 Granaries</h3>
    <div class="sub">${mine.map(s => `${esc(s.name)}: ${s.famine ? '<b style="color:#ffcf70">famine</b>' : Math.round(s.food) + ' food'}`).join(' · ')}</div>
    ${starving.length ? `<div class="sub" style="margin-top:8px">Starving nearby. Feeding your own calms them; feeding others wins hearts, and free villages may join you:</div><div class="abtns">${starving.map(s => btn(`${esc(s.name)}${s.realmId === r.id ? ' (yours)' : ''} · ${w.grainCost(s)}g`, { type: 'grain', sett: s.id })).join('')}</div>` : '<div class="sub" style="margin-top:6px">No famine within reach.</div>'}</div>`;
}
function armies(w, r) {
  const offs = w.realmOfficers(r);
  if (!offs.length) return '';
  const used = r.leviedYear === w.year ? r.levied || 0 : 0; const left = Math.max(0, w.levyCap(r) - used);
  const holds = w.realmSetts(r).sort((a, b) => (b.id === r.capital) - (a.id === r.capital) || b.pop - a.pop).slice(0, 6);
  const reserve = `<div class="arow"><div><b>Your reserve</b> <span class="tag title">no officer</span><div class="sub">${(r.reserve || 0).toLocaleString()} of ${w.reserveCap(r).toLocaleString()} troops. In battle they take simple orders: defend your bases, push on theirs, or reinforce an officer who is outnumbered.</div></div><div class="abtns">${btn('+100', { type: 'levy', id: 'reserve', n: 100 })}${btn('+500', { type: 'levy', id: 'reserve', n: 500 })}</div></div>`;
  const walls = `<div class="sub" style="margin-top:10px"><b>Garrisons</b> guard your holdings when they're attacked. The town itself is the enemy's target: its main camp. 3 troops per gold.</div>${holds.map(s => `<div class="arow"><div><b>${esc(s.name)}</b>${s.id === r.capital ? ' ◆' : ''}<div class="sub">${(s.garrison || 0).toLocaleString()} of ${w.garrisonCap(s).toLocaleString()} on the walls</div></div><div class="abtns">${btn('+100', { type: 'fortify', sett: s.id, n: 100 })}</div></div>`).join('')}`;
  return `<div class="card"><h3>🛡 Armies</h3><div class="sub">Levies left this year: ${left} (2 troops per gold). Each officer can lead only so many troops, set by their Leadership and level. Swapping armies gives your best troops to your best officer.</div>${reserve}
    ${offs.map(o => `<div class="arow"><div><b>${esc(o.name)}</b>${o.titles.rank ? ` <span class="tag title">${esc(o.titles.rank)}</span>` : ''}${o.id !== r.rulerId ? `<span class="chips inline">${['General', 'Marshal', 'Champion'].filter(t => t !== o.titles.rank).map(t => `<button class="chip mini" data-act='${esc(JSON.stringify({ type: 'grant', id: o.id, title: t }))}'>+${t}</button>`).join('')}${o.titles.rank ? `<button class="chip mini" data-act='${esc(JSON.stringify({ type: 'revoke', id: o.id }))}' data-confirm="Strip ${esc(o.name)} of their rank?">Revoke</button>` : ''}</span>` : ''}<div class="sub">${o.army.size} / ${w.troopCap(o)} ${esc(w.plural(w.unitName(o.army)))} · ${w.troopTier(o.army)} · Lead ${o.stats.lea}</div></div><div class="abtns">${btn('+50', { type: 'levy', id: o.id, n: 50 })}</div></div>
      ${offs.length > 1 ? `<div class="chips">${offs.filter(x => x.id !== o.id).slice(0, 4).map(x => `<button class="chip" data-act='${esc(JSON.stringify({ type: 'transfer', from: o.id, to: x.id }))}'>Swap with ${esc(x.name)}</button>`).join('')}</div>` : ''}`).join('')}${walls}</div>`;
}
function family(w, p, r) {
  const kids = p.children.map(id => w.char(id)).filter(k => k && k.alive);
  if (!kids.length) return '';
  const others = w.realmList().filter(x => x.id !== r.id && x.tier !== 'Village' && !w.atWar(r, x)).slice(0, 5);
  return `<div class="card"><h3>👪 Your children</h3>${kids.map(k => {
    const matches = !k.spouseId && !k.betrothed && w.age(k) >= 8 ? w.royalMatches(k) : [];
    return `<div class="arow" style="display:block"><div><button class="pill" data-char="${k.id}">${esc(k.name)}</button> <span class="sub">age ${w.age(k)}${k.spouseId ? ` · wed to ${esc(w.char(k.spouseId)?.name || '')}` : k.betrothed ? ` · betrothed to ${esc(w.char(k.betrothed)?.name || '')}` : ''}${k.wardOf ? ` · ward at ${esc(w.realm(k.wardOf)?.name || '')}` : ''}</span></div>
      ${matches.length ? `<div class="sub" style="margin-top:4px">Arrange a match with a ruling house (an alliance while they live):</div><div class="chips">${matches.map(m => `<button class="chip" data-act='${esc(JSON.stringify({ type: 'arrange', child: k.id, match: m.k.id }))}'>${esc(m.k.name)} of ${esc(m.r.name)}</button>`).join('')}</div>` : ''}
      ${w.age(k) < 16 && !k.wardOf && others.length ? `<div class="sub" style="margin-top:4px">Send as a ward (ten years of peace with that realm):</div><div class="chips">${others.map(o => `<button class="chip" data-act='${esc(JSON.stringify({ type: 'ward', child: k.id, realm: o.id }))}'>${esc(o.name)}</button>`).join('')}</div>` : ''}</div>`;
  }).join('')}</div>`;
}

function intrigue(w, p, r) {
  const wars = w.wars.filter(x => !x.over && (x.a === r.id || x.b === r.id)).map(x => w.realm(x.a === r.id ? x.b : x.a)).filter(Boolean);
  const rivals = w.neighbours(r, 10).filter(o => o.id !== r.id);
  const targets = rivals.flatMap(o => [w.char(o.rulerId), w.char(o.heirId)]).filter((c, i, a) => c && c.alive && a.indexOf(c) === i).slice(0, 5);
  const towns = rivals.flatMap(o => w.realmSetts(o).filter(s => s.id !== o.capital)).sort((a, b) => b.unrest - a.unrest).slice(0, 4);
  const seen = (w.agents || []).filter(a => a.revealed && a.owner !== r.id && w.hiddenKind(a));
  const mine = (w.agents || []).filter(a => a.owner === r.id && w.hiddenKind(a));
  return `<div class="card"><h3>🗡 Intrigue</h3>
    ${seen.length ? `<div class="sub"><b style="color:#ffb4a6">Enemy agents spotted in your lands:</b></div><div class="abtns">${seen.map(a => btn(`Seize the ${w.agentLabel(a).toLowerCase()} (${esc(a.data.cover || 'traveler')})`, { type: 'seize', id: a.id })).join('')}</div>` : '<div class="sub">No enemy agents spotted in your lands. A good spymaster spots more.</div>'}
    ${mine.length ? `<div class="sub" style="margin-top:6px">Your agents abroad: ${mine.map(a => `${w.agentLabel(a)} → ${esc(w.sett(a.to)?.name || '?')}`).join(' · ')}</div>` : ''}
    ${wars.length ? `<div class="sub" style="margin-top:8px">Send a spy (20 gold). A spy who returns improves your next battle against them:</div><div class="abtns">${wars.map(o => btn(esc(o.name), { type: 'spy', realm: o.id })).join('')}</div>` : ''}
    ${towns.length ? `<div class="sub" style="margin-top:8px">Send agitators to a rival town (40 gold). They stir unrest for months:</div><div class="abtns">${towns.map(s => btn(`${esc(s.name)} (unrest ${Math.round(s.unrest)})`, { type: 'agitate', sett: s.id })).join('')}</div>` : ''}
    ${targets.length ? `<div class="sub" style="margin-top:8px">Spread lies about a rival (30 gold), or hire an assassin (150 gold, and if they talk, it means war):</div>
      ${targets.map(c => `<div class="abtns">${btn(`Smear ${esc(c.name)}`, { type: 'smear', id: c.id })}${btn(`Assassinate ${esc(c.name)}`, { type: 'assassin', id: c.id }, `data-confirm="Send an assassin after ${esc(c.name)}?"`)}</div>`).join('')}` : ''}</div>`;
}

function stanceChips() {
  return `<div class="chips">${[['aggressive', 'Aggressive: hits harder, deadlier for both'], ['balanced', 'Balanced'], ['defensive', 'Defensive: weaker, but rarely fatal']].map(([k, l]) => `<button class="chip ${stance === k ? 'on' : ''}" data-stance="${k}">${l}</button>`).join('')}</div>`;
}
function honour(w, p) {
  let h = '';
  if (p.challenge) {
    const from = w.char(p.challenge.from);
    h += `<div class="card danger"><h3>⚔ You have been challenged</h3><div class="sub">${esc(from ? w.fullName(from) : 'Someone')} (Might ${from?.stats.mig}) challenges you over ${esc(p.challenge.reason)}. Refusing marks you craven. Your Might is ${p.stats.mig}${p.wounded ? ', and you are wounded' : ''}.</div>
      ${stanceChips()}<div class="abtns">${btn('Accept the duel', { type: 'answer', accept: true, stance })}${btn('Refuse', { type: 'answer', accept: false })}</div></div>`;
  }
  const tourneys = w.realmList().filter(r => r.tourney && w.sett(r.capital) && (w.dist(w.sett(r.capital), p) < 15 || r.id === p.realmId));
  if (tourneys.length) h += `<div class="card"><h3>🏇 Tournaments</h3><div class="sub">Fought with blunted blades in Highsun. Glory, marriage offers and titles for the champion.</div><div class="abtns">${tourneys.map(r => p.enterTourney === r.id ? `<span class="tag title">Entered at ${esc(w.sett(r.capital).name)}</span>` : btn(`Enter at ${esc(w.sett(r.capital).name)}`, { type: 'enter', realm: r.id })).join('')}</div></div>`;
  const targets = w.challengeTargets();
  if (targets.length && !p.prisonerOf) h += `<div class="card"><h3>🤺 Challenge to a duel</h3><div class="sub">Real blades. Your Might ${p.stats.mig}. Losing can mean wounds or death.</div>${stanceChips()}
    ${targets.map(x => `<div class="arow"><div><b>${esc(w.fullName(x.c))}</b><div class="sub">Might ${x.c.stats.mig} · over ${esc(x.reason)}</div></div>${btn('Challenge', { type: 'challenge', id: x.c.id, stance }, `data-confirm="Duel ${esc(x.c.name)} with real blades?"`)}</div>`).join('')}</div>`;
  return h;
}
function dynasty(w, p) {
  const line = (w.line || []).map(id => w.char(id)).filter(Boolean);
  const kids = c => c.children.map(id => w.char(id)).filter(Boolean);
  const pill = c => `<button class="pill ${c.alive ? '' : 'dead'}" data-char="${c.id}">${esc(c.name)}${c.id === p.id ? ' (you)' : ''}${c.alive ? ` · ${w.age(c)}` : ''}</button>`;
  const tree = (c, depth) => depth > 2 ? '' : `<div class="tree">${pill(c)}${c.spouseId && w.char(c.spouseId) ? ` <span class="sub">⚭</span> ${pill(w.char(c.spouseId))}` : ''}${kids(c).length ? `<div class="branch">${kids(c).map(k => tree(k, depth + 1)).join('')}</div>` : ''}</div>`;
  const parents = p.parents.map(id => w.char(id)).filter(Boolean);
  return `<div class="card"><h3>🌳 Your dynasty</h3>
    ${line.length > 1 ? `<div class="sub">Your line: ${line.map(c => esc(c.name)).join(' → ')}</div>` : ''}
    ${parents.length ? `<div class="sub" style="margin-top:6px">Parents: ${parents.map(pill).join(' ')}</div>` : ''}
    <div style="margin-top:8px">${tree(p, 0)}</div></div>`;
}
