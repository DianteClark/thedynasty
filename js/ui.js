import { World, SIZES, TROOP_TIERS } from './sim.js';
import { cultureById } from './names.js';
import { renderBattleSetup, handleBattleSetupClick, watchBattle } from './battleview.js';

const $ = s => document.querySelector(s);
const view = $('#view');
const SAVE_KEY = 'dynasty.save.v1';
const BIOME_COLORS = { water: '#1d3a52', plains: '#6f8a45', forest: '#355f33', swamp: '#4b5e45', wasteland: '#a08350', tundra: '#c9d3d6', mountain: '#6e6a66' };
const TYPE_LABELS = { war: 'War', battle: 'Battles', peace: 'Peace', succession: 'Succession', assassin: 'Assassins', spy: 'Spies', rumor: 'Rumors', duel: 'Duels', tournament: 'Tournaments', marriage: 'Marriages', monster: 'Monsters', famine: 'Famine', aid: 'Aid', uprising: 'Uprisings', rise: 'Rises', fall: 'Falls', oath: 'Oaths', betrayal: 'Betrayal', ward: 'Wards', merc: 'Mercenaries', bandit: 'Bandits', contract: 'Contracts', unite: 'Unions', army: 'Armies', death: 'Deaths', birth: 'Births' };

let world, playing = false, busy = false, tab = 'chronicle', watchMode = 'big';
const ui = { level: 2, type: 'all', shown: 60, peopleQuery: '', mapSel: null };

// ---------- save / load (the sim is deterministic, so a seed + month count rebuilds the world) ----------
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ seed: world.seed, size: world.size, months: (world.year - 1) * 12 + world.month, watched: world.watchedList || [], watchMode })); } catch (e) { /* storage unavailable */ } }
function load() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; } }

function randomSeed() { const w = ['ember', 'raven', 'thorn', 'gold', 'ash', 'storm', 'iron', 'moon', 'wolf', 'crown', 'frost', 'oak']; return w[Math.floor(Math.random() * w.length)] + '-' + Math.floor(Math.random() * 9000 + 1000); }

async function newWorld(seed, size, months = 0, watched = []) {
  playing = false; setPlayBtn();
  world = new World(seed, size);
  // rebuild the saved world: battles you watched are re-fought exactly as you saw them
  world.replayWatched = new Set(watched); world.watchedList = [...watched];
  if (months > 0) await advance(months, true);
  world.replayWatched = null; world.watchMode = watchMode === 'off' ? null : watchMode;
  ui.shown = 60; ui.mapSel = null;
  save(); render();
}

// ---------- time ----------
function advance(months, replaying = false) {
  return new Promise(resolve => {
    busy = true; setBusy(true);
    let done = 0; const chunk = 3;
    const bar = $('#progressBar'); $('#progress').hidden = months < 24;
    const step = async () => {
      const n = Math.min(chunk, months - done);
      for (let i = 0; i < n; i++) {
        world.tick(); done++;
        if (world.pendingBattle && !replaying) { $('#progress').hidden = true; await watchPending(); $('#progress').hidden = months < 24; }
      }
      bar.style.width = (done / months * 100) + '%';
      updateHeader();
      if (done < months) setTimeout(step, 0);
      else { busy = false; setBusy(false); $('#progress').hidden = true; save(); render(); resolve(); }
    };
    step();
  });
}
function watchPending() {
  const ctx = world.pendingBattle;
  const info = { title: `Battle of ${ctx.target.name}: ${ctx.att.name} attacks ${ctx.def.name}` };
  return new Promise(res => watchBattle(ctx.cfg, info, b => { world.finishWatched(b); save(); render(); res(); }));
}
let lastTick = 0, lastCount = 0;
function loop(t) {
  if (playing && !busy && t - lastTick > 220) {
    lastTick = t; world.tick(); updateHeader();
    if (world.pendingBattle) { busy = true; watchPending().then(() => { busy = false; lastTick = performance.now(); }); }
    const n = world.chronicle.filter(e => e.importance >= ui.level).length;
    if (tab === 'map' || (tab === 'chronicle' && n !== lastCount) || world.month === 0) { lastCount = n; render(true); }
    if (world.month === 0) save();
  }
  requestAnimationFrame(loop);
}
function setPlayBtn() { const b = $('#btnPlay'); b.textContent = playing ? '❚❚' : '▶'; b.setAttribute('aria-label', playing ? 'Pause' : 'Play'); }
function setBusy(on) { for (const id of ['#btnPlay', '#btnYear', '#btnTen', '#btnHundred', '#btnWorld']) $(id).disabled = on; }
function updateHeader() { $('#date').textContent = world.dateLabel(); $('#season').textContent = world.season; }

// ---------- helpers ----------
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function charPill(c) { if (!c) return ''; return `<button class="pill ${c.alive ? '' : 'dead'}" data-char="${c.id}">${esc(c.name)}${c.dynasty ? ' ' + esc(c.dynasty) : ''}</button>`; }
function roleLabel(c) {
  const r = world.realm(c.realmId);
  if (!c.alive) return `Died year ${c.died} (${c.cause})`;
  if (c.role === 'ruler' && r) return `${world.rulerTitle(r, c)} of ${r.name}`;
  if (c.role === 'officer' && r) return `${c.titles.rank || 'Officer'} of ${r.name}`;
  if (c.role === 'courtier' && r) return `Courtier of ${r.name}`;
  if (c.role === 'child') return r ? `Child of the court of ${r.name}` : 'Child';
  if (c.role === 'merc') { const m = world.mercs.find(x => x.id === c.mercId); return m ? `Captain of ${m.name}` : 'Mercenary'; }
  return { vagabond: 'Vagabond', bandit: `Bandit chief (${c.band || 0} cutthroats)`, rebel: 'Rebel' }[c.role] || c.role;
}
function titleTags(c) {
  const t = [];
  if (c.titles.rank) t.push(`<span class="tag title">${esc(c.titles.rank)}</span>`);
  if (c.titles.deed) t.push(`<span class="tag title">★ ${esc(c.titles.deed)}</span>`);
  if (c.titles.rep) t.push(`<span class="tag rep">${esc(c.titles.rep)}</span>`);
  return t.join('');
}

// ---------- views ----------
function render(soft = false) {
  updateHeader();
  if (soft && tab !== 'map' && tab !== 'chronicle') return;
  if (tab === 'chronicle') renderChronicle();
  else if (tab === 'map') renderMap(soft);
  else if (tab === 'realms') renderRealms();
  else if (tab === 'people') renderPeople();
  else if (tab === 'stats') renderStats();
  else if (tab === 'battle' && !soft) renderBattleSetup(view);
}

function renderChronicle() {
  const types = ['all', ...Object.keys(TYPE_LABELS).filter(t => world.chronicle.some(e => e.type === t))];
  let entries = world.chronicle.filter(e => e.importance >= ui.level && (ui.type === 'all' || e.type === ui.type));
  const total = entries.length;
  entries = entries.slice(-ui.shown).reverse();
  let html = `<div class="chips">${[[3, 'Major'], [2, 'Notable'], [1, 'Everything']].map(([l, n]) => `<button class="chip ${ui.level === l ? 'on' : ''}" data-level="${l}">${n}</button>`).join('')}</div>
  <div class="chips">${types.map(t => `<button class="chip ${ui.type === t ? 'on' : ''}" data-type="${t}">${t === 'all' ? 'All events' : TYPE_LABELS[t]}</button>`).join('')}</div>`;
  if (!entries.length) html += `<div class="empty">Nothing recorded yet.<br>Press ▶ to let the world live, or jump ahead with +1, +10 or +100 years.</div>`;
  let lastY = null;
  for (const e of entries) {
    if (e.y !== lastY) { html += `<div class="year">Year ${e.y}</div>`; lastY = e.y; }
    const people = e.ids.slice(0, 4).map(id => charPill(world.char(id))).join('');
    html += `<div class="entry i${e.importance}"><div class="meta">${e.watched ? '👁 Watched · ' : ''}${TYPE_LABELS[e.type] || 'The world'} · ${['Deepfrost', 'Thawmonth', 'Seedtime', 'Rainmonth', 'Bloomtide', 'Highsun', 'Goldmonth', 'Harvestide', 'Reaping', 'Leaffall', 'Mistmonth', 'Longnight'][e.m]}</div>${esc(e.text)}${people ? `<div class="who">${people}</div>` : ''}</div>`;
  }
  if (total > ui.shown) html += `<button class="more" id="moreBtn">Show older (${total - ui.shown} more)</button>`;
  view.innerHTML = html;
}

let mapCanvas = null;
function renderMap(soft) {
  if (!soft || !mapCanvas || !view.contains(mapCanvas)) {
    view.innerHTML = `<div class="mapbox"><canvas id="map"></canvas></div>
      <div class="legend"><span><i class="swatch" style="background:#fff;border-radius:50%"></i>Village</span><span>◆ Capital</span><span style="color:#ff6b57">✸ Monster lair</span><span style="color:#ffb4a6">⚔ At war</span><span>Tap a place for details</span></div>
      <div id="mapInfo"></div>`;
    mapCanvas = $('#map');
    mapCanvas.addEventListener('click', ev => {
      const rect = mapCanvas.getBoundingClientRect();
      const x = (ev.clientX - rect.left) / rect.width * world.w, y = (ev.clientY - rect.top) / rect.height * world.h;
      let best = null, bd = 9;
      for (const s of world.setts) { const d = (s.x + 0.5 - x) ** 2 + (s.y + 0.5 - y) ** 2; if (d < bd) { bd = d; best = s; } }
      ui.mapSel = best ? best.id : null; drawMap(); mapInfo();
    });
  }
  drawMap(); mapInfo();
}
function drawMap() {
  const cs = Math.max(6, Math.floor(Math.min(1400, view.clientWidth * 2) / world.w));
  const W = world.w * cs, H = world.h * cs;
  if (mapCanvas.width !== W) { mapCanvas.width = W; mapCanvas.height = H; }
  const g = mapCanvas.getContext('2d');
  // terrain
  for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) { g.fillStyle = BIOME_COLORS[world.grid[y][x]]; g.fillRect(x * cs, y * cs, cs, cs); }
  // territory
  const live = world.setts.filter(s => !s.destroyed && s.realmId && world.realm(s.realmId)?.alive);
  g.globalAlpha = 0.42;
  for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) {
    if (world.grid[y][x] === 'water') continue;
    let best = null, bd = 12;
    for (const s of live) { const d = (s.x - x) ** 2 + (s.y - y) ** 2; if (d < bd) { bd = d; best = s; } }
    if (best) { g.fillStyle = world.realm(best.realmId).color; g.fillRect(x * cs, y * cs, cs, cs); }
  }
  g.globalAlpha = 1;
  // lairs
  g.font = `${Math.round(cs * 1.2)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const L of world.lairs) if (L.alive && L.strength > 20) { g.fillStyle = '#ff6b57'; g.fillText('✸', (L.x + 0.5) * cs, (L.y + 0.5) * cs); }
  // settlements
  for (const s of world.setts) {
    const cx = (s.x + 0.5) * cs, cy = (s.y + 0.5) * cs;
    if (s.destroyed) { g.fillStyle = '#222'; g.fillRect(cx - cs * 0.3, cy - cs * 0.3, cs * 0.6, cs * 0.6); continue; }
    const r = world.realm(s.realmId); const isCap = r && r.capital === s.id;
    const rad = Math.max(2.5, cs * (0.25 + Math.min(0.35, s.pop / 6000)));
    g.fillStyle = r ? r.color : '#ccc'; g.strokeStyle = s.id === ui.mapSel ? '#ffd76a' : '#111'; g.lineWidth = s.id === ui.mapSel ? 3 : 1.5;
    g.beginPath();
    if (isCap) { g.moveTo(cx, cy - rad * 1.5); g.lineTo(cx + rad * 1.5, cy); g.lineTo(cx, cy + rad * 1.5); g.lineTo(cx - rad * 1.5, cy); g.closePath(); }
    else g.arc(cx, cy, rad, 0, Math.PI * 2);
    g.fill(); g.stroke();
    if (s.famine) { g.fillStyle = '#ffcf70'; g.fillRect(cx + rad, cy - rad - 3, 3, 3); }
  }
  // capital names for larger realms
  g.font = `600 ${Math.max(11, Math.round(cs * 1.05))}px Georgia, serif`; g.textBaseline = 'bottom';
  for (const r of world.realmList()) {
    if (r.tier === 'Village') continue;
    const s = world.sett(r.capital); if (!s) continue;
    const war = world.wars.some(w => !w.over && (w.a === r.id || w.b === r.id));
    const label = (war ? '⚔ ' : '') + r.name;
    g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(label, (s.x + 0.5) * cs, (s.y - 0.6) * cs);
    g.fillStyle = war ? '#ffb4a6' : '#fff4dc'; g.fillText(label, (s.x + 0.5) * cs, (s.y - 0.6) * cs);
  }
}
function mapInfo() {
  const box = $('#mapInfo'); if (!box) return;
  const s = ui.mapSel && world.sett(ui.mapSel);
  if (!s) { box.innerHTML = `<div class="sub" style="padding:4px 2px">${world.realmList().length} realms · ${world.setts.filter(s => !s.destroyed).length} settlements · ${world.lairs.filter(l => l.alive).length} monster lairs</div>`; return; }
  const r = world.realm(s.realmId);
  const ruler = r && world.char(r.rulerId);
  box.innerHTML = `<div class="card">
    <h3>${esc(s.name)}${s.destroyed ? ' (ruins)' : ''}</h3>
    <div class="sub">${s.destroyed ? 'Destroyed. It may be resettled one day.' : `${cultureById(s.culture).race} ${s.biome} settlement · ${r ? `${r.tier === 'Village' && r.setts.size === 1 ? 'Free village' : 'Part of ' + esc(r.name)}` : ''}`}</div>
    ${s.destroyed ? '' : `<div class="kv"><div><b>${s.pop}</b><small>People</small></div><div><b>${Math.round(s.unrest)}</b><small>Unrest</small></div><div><b>${s.famine ? 'Famine' : Math.round(s.food)}</b><small>Food</small></div></div>
    <div class="kv"><div style="grid-column:span 2"><b>${ruler ? esc(world.fullName(ruler)) : '—'}</b><small>${r ? world.rulerTitle(r, ruler) : 'Ruler'}</small></div><div><b>${s.guard}</b><small>Guard</small></div></div>
    <button class="btn ghost" data-realm="${r ? r.id : ''}">Open ${r ? esc(r.name) : 'realm'}</button>`}
  </div>`;
}

function renderRealms() {
  const realms = world.realmList().sort((a, b) => world.realmSetts(b).length - world.realmSetts(a).length || world.realmPop(b) - world.realmPop(a));
  let html = `<div class="sub" style="margin-bottom:10px">${realms.length} realms stand in year ${world.year}. Sorted by size.</div>`;
  for (const r of realms) {
    const ruler = world.char(r.rulerId);
    const wars = world.wars.filter(w => !w.over && (w.a === r.id || w.b === r.id)).map(w => world.realm(w.a === r.id ? w.b : w.a)).filter(Boolean);
    html += `<div class="card tap" data-realm="${r.id}">
      <h3><i class="swatch" style="background:${r.color}"></i>${esc(r.name)}</h3>
      <div class="sub">${r.tier} of the ${cultureById(r.culture).name} · ${ruler ? `${world.rulerTitle(r, ruler)} ${esc(world.fullName(ruler))}` : 'No ruler'}</div>
      <div class="kv"><div><b>${world.realmSetts(r).length}</b><small>Holdings</small></div><div><b>${world.realmPop(r).toLocaleString()}</b><small>People</small></div><div><b>${Math.round(world.realmStrength(r)).toLocaleString()}</b><small>Strength</small></div></div>
      <div style="margin-top:8px">${wars.map(o => `<span class="tag war">⚔ ${esc(o.name)}</span>`).join('')}${[...r.allies].map(id => world.realm(id)).filter(a => a && a.alive).map(a => `<span class="tag">🤝 ${esc(a.name)}</span>`).join('')}</div>
    </div>`;
  }
  view.innerHTML = html;
}

function renderPeople() {
  const q = ui.peopleQuery.toLowerCase();
  let people = q ? world.living().filter(c => (c.name + ' ' + (c.dynasty || '')).toLowerCase().includes(q)).slice(0, 60) : world.famous(50);
  const legends = q ? [] : [...world.chars.values()].filter(c => !c.alive && (c.titles.deed || c.fame > 40)).sort((a, b) => b.fame - a.fame).slice(0, 12);
  let html = `<input class="search" id="peopleSearch" placeholder="Search the living by name…" value="${esc(ui.peopleQuery)}">`;
  html += `<h2 class="sec">${q ? 'Matches' : 'The most renowned'}</h2>`;
  for (const c of people) html += personCard(c);
  if (legends.length) { html += `<h2 class="sec">Remembered dead</h2>`; for (const c of legends) html += personCard(c); }
  view.innerHTML = html;
  const inp = $('#peopleSearch');
  inp.addEventListener('input', () => { ui.peopleQuery = inp.value; const pos = inp.selectionStart; renderPeople(); const i2 = $('#peopleSearch'); i2.focus(); i2.setSelectionRange(pos, pos); });
}
function personCard(c) {
  return `<div class="card tap" data-char="${c.id}">
    <h3>${esc(c.name)}${c.dynasty ? ' ' + esc(c.dynasty) : ''} <small class="sub">${c.alive ? world.age(c) : '†'}</small></h3>
    <div class="sub">${esc(roleLabel(c))} · ${cultureById(c.culture).race}${c.mixed ? ' (mixed blood)' : ''} · Fame ${Math.round(c.fame)}</div>
    <div>${titleTags(c)}</div>
  </div>`;
}

function renderStats() {
  const s = world.stats;
  const items = [['wars', 'Wars declared'], ['battles', 'Battles fought'], ['uprisings', 'Uprisings'], ['assassinations', 'Assassinations'], ['foiled', 'Plots foiled'], ['duels', 'Duels'], ['tournaments', 'Tournaments'], ['marriages', 'Marriages'], ['births', 'Births'], ['deaths', 'Deaths'], ['famines', 'Famines'], ['outbreaks', 'Monster outbreaks'], ['destroyed', 'Settlements destroyed'], ['realmsFallen', 'Realms fallen'], ['realmsRisen', 'Realms risen'], ['defections', 'Betrayals and defections'], ['spies', 'Spy missions']];
  const titled = world.living().filter(c => c.titles.deed || c.titles.rep);
  const strongest = world.char(world.unique.strongest);
  let html = `<div class="card"><h3>World</h3><div class="sub">Seed “${esc(world.seed)}” · ${SIZES[world.size].label} map · Year ${world.year}</div>
    <div class="kv"><div><b>${world.living().length}</b><small>Living people</small></div><div><b>${world.realmList().length}</b><small>Realms</small></div><div><b>${world.realmList().filter(r => r.tier === 'Kingdom').length}</b><small>Kingdoms</small></div></div></div>`;
  html += `<div class="card"><h3>★ Strongest Under Heaven</h3><div class="sub">${strongest && strongest.alive ? `${charPill(strongest)} holds the title. Beat them in a duel to take it.` : 'The title is unclaimed.'}</div></div>`;
  html += `<div class="stats">${items.map(([k, l]) => `<div class="stat"><b>${s[k].toLocaleString()}</b><small>${l}</small></div>`).join('')}</div>`;
  if (titled.length) {
    html += `<h2 class="sec">Titles held by the living</h2><div class="card">`;
    for (const c of titled.sort((a, b) => b.fame - a.fame).slice(0, 30)) html += `<div style="margin:6px 0">${charPill(c)} ${titleTags(c)}</div>`;
    html += `</div>`;
  }
  view.innerHTML = html;
}

// ---------- detail sheets ----------
function openSheet(html) { $('#sheet').innerHTML = `<div class="grab"></div><button class="close" data-close>✕</button>` + html; $('#sheetWrap').hidden = false; $('#sheet').scrollTop = 0; }
function closeSheet() { $('#sheetWrap').hidden = true; }

function charSheet(id) {
  const c = world.char(id); if (!c) return;
  const r = world.realm(c.realmId);
  const sp = world.char(c.spouseId);
  const kids = c.children.map(k => world.char(k)).filter(Boolean);
  const parents = c.parents.map(p => world.char(p)).filter(Boolean);
  const oath = c.oath.map(o => world.char(o)).filter(Boolean);
  const st = c.stats;
  const a = c.army;
  const grudges = Object.entries(c.rel).filter(([, v]) => v <= -50).map(([k]) => world.char(+k)).filter(x => x && x.alive).slice(0, 5);
  const friends = Object.entries(c.rel).filter(([, v]) => v >= 50).map(([k]) => world.char(+k)).filter(x => x && x.alive && x.id !== c.spouseId).slice(0, 5);
  const story = c.log.map(i => world.chronicle[i]).filter(Boolean).slice(-25).reverse();
  openSheet(`
    <h2>${esc(c.name)}${c.dynasty ? ' ' + esc(c.dynasty) : ''}</h2>
    <div class="sub">${esc(roleLabel(c))}</div>
    <div class="sub">${cultureById(c.culture).race}${c.mixed ? ` (${c.mixed.map(m => cultureById(m).race).join('-')} blood)` : ''} · ${c.female ? 'Woman' : 'Man'} · ${c.alive ? `Age ${world.age(c)}` : `Lived ${c.died - c.born} years`} · Level ${c.level}/20 · Fame ${Math.round(c.fame)}</div>
    <div style="margin-top:6px">${titleTags(c)} ${c.traits.map(t => `<span class="tag">${t}</span>`).join('')}${c.wounded ? '<span class="tag war">Wounded</span>' : ''}${c.prisonerOf ? `<span class="tag war">Prisoner of ${esc(world.realm(c.prisonerOf)?.name || '?')}</span>` : ''}${c.wardOf ? `<span class="tag">Ward at ${esc(world.realm(c.wardOf)?.name || '?')}</span>` : ''}</div>
    <div class="statgrid"><div><b>${st.lea}</b><small>Leadership</small></div><div><b>${st.mig}</b><small>Might</small></div><div><b>${st.int}</b><small>Intellect</small></div><div><b>${st.pol}</b><small>Politics</small></div><div><b>${st.cha}</b><small>Charisma</small></div></div>
    ${c.role === 'officer' ? `<div class="sub">Loyalty to their lord: ${Math.round(c.loyalty)}</div><div class="bar"><div style="width:${c.loyalty}%"></div></div>` : ''}
    ${a ? `<div class="card" style="margin-top:12px"><h3>⚔ Army of ${esc(world.plural(world.unitName(a)))}</h3><div class="kv"><div><b>${a.size}</b><small>Troops</small></div><div><b>${a.level}/10</b><small>Level</small></div><div><b>${world.troopTier(a)}</b><small>Tier</small></div></div><div class="sub" style="margin-top:6px">${a.wins} victories · ${a.losses} defeats</div></div>` : ''}
    <div class="card"><h3>Family and bonds</h3>
      ${sp ? `<div style="margin:5px 0">Spouse: ${charPill(sp)}</div>` : ''}
      ${parents.length ? `<div style="margin:5px 0">Parents: ${parents.map(charPill).join(' ')}</div>` : ''}
      ${kids.length ? `<div style="margin:5px 0">Children: ${kids.map(charPill).join(' ')}</div>` : ''}
      ${oath.length ? `<div style="margin:5px 0">Sworn sibling: ${oath.map(charPill).join(' ')}</div>` : ''}
      ${friends.length ? `<div style="margin:5px 0">Friends: ${friends.map(charPill).join(' ')}</div>` : ''}
      ${grudges.length ? `<div style="margin:5px 0">Grudges: ${grudges.map(charPill).join(' ')}</div>` : ''}
      ${!sp && !parents.length && !kids.length && !oath.length && !friends.length && !grudges.length ? '<div class="sub">No close ties.</div>' : ''}
      ${r && r.heirId === c.id ? `<div class="tag title" style="margin-top:6px">Heir of ${esc(r.name)}</div>` : ''}
    </div>
    <h2 class="sec">Their story</h2>
    ${story.length ? story.map(e => `<div class="entry i${e.importance}"><div class="meta">Year ${e.y}</div>${esc(e.text)}</div>`).join('') : '<div class="sub">Nothing the chronicles thought worth recording, yet.</div>'}
  `);
}

function realmSheet(id) {
  const r = world.realm(id); if (!r) return;
  const ruler = world.char(r.rulerId), heir = world.char(r.heirId);
  const offs = world.realmOfficers(r).filter(o => o.id !== r.rulerId).sort((a, b) => world.power(b) - world.power(a));
  const setts = world.realmSetts(r).sort((a, b) => b.pop - a.pop);
  const wars = world.wars.filter(w => !w.over && (w.a === r.id || w.b === r.id));
  const mercs = r.mercs.map(m => world.mercs.find(x => x.id === m)).filter(Boolean);
  openSheet(`
    <h2><i class="swatch" style="background:${r.color}"></i> ${esc(r.name)}</h2>
    <div class="sub">${r.alive ? `${r.tier} of the ${cultureById(r.culture).name} · House ${esc(r.dynasty || '—')} · Founded year ${r.founded}` : 'This realm has fallen.'}</div>
    <div class="kv"><div><b>${setts.length}</b><small>Holdings</small></div><div><b>${world.realmPop(r).toLocaleString()}</b><small>People</small></div><div><b>${Math.round(r.treasury)}</b><small>Treasury</small></div></div>
    <div class="card" style="margin-top:12px"><h3>Court</h3>
      <div style="margin:5px 0">${ruler ? world.rulerTitle(r, ruler) : 'Ruler'}: ${charPill(ruler) || '—'}</div>
      <div style="margin:5px 0">Heir: ${charPill(heir) || '<span class="tag war">None. If the ruler dies, the realm breaks apart.</span>'}</div>
      ${wars.map(w => `<span class="tag war">⚔ At war with ${esc(world.realm(w.a === r.id ? w.b : w.a)?.name || '?')} (${esc(w.reason)})</span>`).join('')}
      ${mercs.map(m => `<span class="tag">Hired: ${esc(m.name)}</span>`).join('')}
    </div>
    <h2 class="sec">Officers and their armies</h2>
    ${ruler && ruler.army ? officerRow(ruler) : ''}
    ${offs.length ? offs.map(officerRow).join('') : '<div class="sub">No officers serve this realm.</div>'}
    <h2 class="sec">Holdings</h2>
    ${setts.map(s => `<div class="card"><b>${esc(s.name)}</b>${s.id === r.capital ? ' ◆' : ''} <span class="sub">· ${s.pop} people · unrest ${Math.round(s.unrest)}${s.famine ? ' · <span style="color:#ffcf70">famine</span>' : ''} · guard ${s.guard}</span></div>`).join('')}
  `);
}
function officerRow(o) {
  const a = o.army;
  return `<div class="card tap" data-char="${o.id}"><b>${esc(o.name)}${o.dynasty ? ' ' + esc(o.dynasty) : ''}</b> <span class="sub">Lv ${o.level}${o.role === 'officer' ? ` · loyalty ${Math.round(o.loyalty)}` : ''}</span><div>${titleTags(o)}</div>
    ${a ? `<div class="sub" style="margin-top:4px">${a.size} ${esc(world.plural(world.unitName(a)))} · ${world.troopTier(a)} · army level ${a.level}/10 · ${a.wins}W ${a.losses}L</div>` : ''}</div>`;
}

function worldSheet() {
  openSheet(`
    <h2>Worlds</h2>
    <div class="sub">Every world grows from a seed. Share a seed and someone else gets the same starting world, but history will unfold differently once you play.</div>
    <div class="card" style="margin-top:12px"><b>Current world</b><div class="sub">Seed “${esc(world.seed)}” · ${SIZES[world.size].label} · Year ${world.year}</div></div>
    <label class="field"><span>Seed</span><input id="seedIn" value="${esc(randomSeed())}" autocomplete="off"></label>
    <label class="field"><span>Map size</span><select id="sizeIn">${Object.entries(SIZES).map(([k, v]) => `<option value="${k}" ${k === world.size ? 'selected' : ''}>${v.label} (${v.setts} settlements)</option>`).join('')}</select></label>
    <button class="btn" id="createWorld">Create new world</button>
    <label class="field"><span>Watch battles as they happen</span></label>
    <div class="chips">${[['off', 'Never'], ['big', 'Big battles'], ['all', 'Every battle']].map(([k, l]) => `<button class="chip ${watchMode === k ? 'on' : ''}" data-watch="${k}">${l}</button>`).join('')}</div>
    <div class="sub">When a battle you'd watch begins, the world pauses and the battle map opens. Battles you skip are still fought on the same engine, just faster. Big battles involve a kingdom or over 1,400 troops.</div>
    <button class="btn ghost" id="restartWorld">Restart this world from year 1</button>
    <p class="note">Prototype 0.3: the world runs itself, and its wars are fought on the battle engine. Playing as your own character comes in later builds. Your world is saved on this device.</p>
  `);
}

// ---------- events ----------
document.addEventListener('click', ev => {
  if (ev.target.closest('.battle')) return;
  const t = ev.target.closest('button, .card.tap, [data-char], [data-realm]');
  if (!t) return;
  if (tab === 'battle' && !t.dataset.tab && handleBattleSetupClick(t, view)) return;
  if (t.matches('[data-close]')) return closeSheet();
  if (t.dataset.tab) { tab = t.dataset.tab; document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b === t)); ui.shown = 60; window.scrollTo(0, 0); return render(); }
  if (t.dataset.level) { ui.level = +t.dataset.level; ui.shown = 60; return renderChronicle(); }
  if (t.dataset.type) { ui.type = t.dataset.type; ui.shown = 60; return renderChronicle(); }
  if (t.id === 'moreBtn') { ui.shown += 80; return renderChronicle(); }
  if (t.dataset.char) return charSheet(+t.dataset.char);
  if (t.dataset.realm) return realmSheet(+t.dataset.realm);
  if (t.id === 'createWorld') { const seed = $('#seedIn').value.trim() || randomSeed(); const size = $('#sizeIn').value; closeSheet(); return newWorld(seed, size); }
  if (t.id === 'restartWorld') { closeSheet(); return newWorld(world.seed, world.size); }
  if (t.dataset.watch) { watchMode = t.dataset.watch; world.watchMode = watchMode === 'off' ? null : watchMode; save(); return worldSheet(); }
});
$('#sheetWrap').addEventListener('click', ev => { if (ev.target.id === 'sheetWrap') closeSheet(); });
$('#btnPlay').onclick = () => { if (busy) return; playing = !playing; setPlayBtn(); };
$('#btnYear').onclick = () => !busy && advance(12);
$('#btnTen').onclick = () => !busy && advance(120);
$('#btnHundred').onclick = () => !busy && advance(1200);
$('#btnWorld').onclick = () => !busy && worldSheet();
window.addEventListener('resize', () => { if (tab === 'map') drawMap(); });

// ---------- start ----------
(async () => {
  const saved = load();
  if (saved && saved.watchMode) watchMode = saved.watchMode;
  if (saved && SIZES[saved.size]) await newWorld(saved.seed, saved.size, saved.months, saved.watched || []);
  else await newWorld(randomSeed(), 'large');
  requestAnimationFrame(loop);
})();

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
