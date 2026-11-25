import { World, SIZES, TROOP_TIERS } from './sim.js';
import { cultureById } from './names.js';
import { renderBattleSetup, handleBattleSetupClick, watchBattle, commandBattle } from './battleview.js';
import { mountMap, unmountMap, setWorld, refreshCard, debugCam } from './worldmap.js';
import { renderYou, renderCreation, readForm, handleFormClick, setStance } from './you.js';
import { watchDuels } from './duelview.js';
import { slots, saveWorld, loadWorld, deleteWorld, setCurrent, newSlotId, getMod, setMod, MAX_SLOTS } from './store.js';

const $ = s => document.querySelector(s);
const view = $('#view');
const SAVE_KEY = 'dynasty.save.v2';
const HISTORY_YEARS = 30;
const TYPE_LABELS = { you: 'You', war: 'War', battle: 'Battles', peace: 'Peace', succession: 'Succession', assassin: 'Assassins', spy: 'Spies', rumor: 'Rumors', duel: 'Duels', tournament: 'Tournaments', marriage: 'Marriages', monster: 'Monsters', famine: 'Famine', aid: 'Aid', uprising: 'Uprisings', rise: 'Rises', fall: 'Falls', oath: 'Oaths', betrayal: 'Betrayal', ward: 'Wards', merc: 'Mercenaries', bandit: 'Bandits', contract: 'Contracts', unite: 'Unions', army: 'Armies', death: 'Deaths', birth: 'Births' };

let world, playing = false, busy = false, tab = 'you', watchMode = 'big', creatingLife = false;
const ui = { level: 2, type: 'all', shown: 60, peopleQuery: '', mapSel: null };

// ---------- save / load ----------
// The sim is deterministic: a seed, your actions and your battle choices rebuild the world exactly.
// Saves are snapshots of the whole world in a save slot (IndexedDB), so loading is instant.
let slotId = null, saving = null;
function save() {
  if (!world || !slotId || world.pendingBattle) return;
  if (saving) { saving.again = true; return; }
  saving = {};
  saveWorld(slotId, world).catch(() => {}).finally(() => { const again = saving.again; saving = null; if (again) save(); });
}
function load() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; } }
try { const wm = localStorage.getItem('dynasty.watch'); if (wm) watchMode = wm; } catch (e) { /* ignore */ }
function randomSeed() { const w = ['ember', 'raven', 'thorn', 'gold', 'ash', 'storm', 'iron', 'moon', 'wolf', 'crown', 'frost', 'oak']; return w[Math.floor(Math.random() * w.length)] + '-' + Math.floor(Math.random() * 9000 + 1000); }

function toast(text, kind = '') {
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = text;
  document.body.appendChild(t); setTimeout(() => t.classList.add('out'), 3600); setTimeout(() => t.remove(), 4200);
}

async function rebuild(saved) {
  playing = false; setPlayBtn();
  world = new World(saved.seed, saved.size); setWorld(world);
  world.replaying = true; world.replayLog = saved.battleLog || {}; world.actions = (saved.actions || []).slice();
  const acts = saved.actions || []; let k = 0;
  await runMonths(saved.monthIndex, { quiet: true, label: 'Rebuilding your world', before: () => { while (k < acts.length && acts[k].m === world.monthIndex) { world.act(acts[k].a); k++; } } });
  while (k < acts.length && acts[k].m === world.monthIndex) { world.act(acts[k].a); k++; }
  world.replaying = false; world.replayLog = null; world.battleLog = saved.battleLog || {};
  world.watchMode = watchMode === 'off' ? null : watchMode;
}
async function newGame(f) {
  playing = false; setPlayBtn();
  const s = slots();
  if (s.list.length >= MAX_SLOTS) { const oldest = s.list.slice().sort((a, b) => a.savedAt - b.savedAt)[0]; await deleteWorld(oldest.id); }
  slotId = newSlotId(); setCurrent(slotId);
  view.innerHTML = `<div class="empty">A world is being born.<br>Kingdoms rise, wars are fought, dynasties begin.<br>Thirty years of history are being written before you arrive.</div>`; window.scrollTo(0, 0);
  world = new World(f.seed || randomSeed(), f.size, getMod()); setWorld(world);
  world.watchMode = null;
  await runMonths(HISTORY_YEARS * 12, { quiet: true, label: 'Thirty years of history unfold' });
  world.watchMode = watchMode === 'off' ? null : watchMode;
  const msg = world.act({ type: 'start', origin: f.origin, culture: f.culture, name: f.name, female: f.female, mode: f.mode });
  save(); tab = 'you'; selectTab(); render(); toast(msg);
}

// ---------- time ----------
function playerEvent(from) {
  // something that happened to you (or your realm, as its ruler) in the entries since `from`
  const pid = world.playerId; if (!pid) return null;
  for (let i = from; i < world.chronicle.length; i++) { const e = world.chronicle[i]; if (e.type === 'you' || (e.importance >= 2 && e.ids.includes(pid))) return e; }
  if (world.gameOver) return { text: 'Your line has ended.' };
  return null;
}
function runMonths(months, opts = {}) {
  return new Promise(resolve => {
    busy = true; setBusy(true);
    let done = 0;
    const bar = $('#progressBar'); $('#progress').hidden = months < 12; $('#progressLabel').textContent = opts.label || '';
    const step = async () => {
      let stop = null;
      for (let i = 0; i < 3 && done < months; i++) {
        opts.before && opts.before();
        const from = world.chronicle.length;
        world.tick(); done++;
        if (world.pendingBattle && !opts.quiet) { $('#progress').hidden = true; await resolvePending(); $('#progress').hidden = months < 12; }
        if (!opts.quiet) { const e = playerEvent(from); if (e) { stop = e; break; } }
      }
      bar.style.width = (done / months * 100) + '%';
      updateHeader();
      if (done < months && !stop) setTimeout(step, 0);
      else { busy = false; setBusy(false); $('#progress').hidden = true; save(); render(); if (stop) toast(stop.text, 'you'); resolve(); }
    };
    step();
  });
}
function resolvePending() {
  const ctx = world.pendingBattle;
  const info = { title: ctx.title || 'A battle' };
  if (ctx.playerSide == null) return new Promise(res => watchBattle(ctx.cfg, info, b => { world.finishPending(b, { mode: 'watch' }); save(); render(); res(); }));
  return new Promise(res => {
    const mine = ctx.cfg.sides[ctx.playerSide], theirs = ctx.cfg.sides[1 - ctx.playerSide];
    const count = s => s.divisions.reduce((a, d) => a + d.count, 0);
    openSheet(`<h2>⚔ ${esc(info.title)}</h2>
      <div class="sub">${esc(ctx.cfg.season)} · ${esc(ctx.cfg.terrain)}</div>
      <div class="kv"><div><b>${count(mine).toLocaleString()}</b><small>Your side</small></div><div><b>${count(theirs).toLocaleString()}</b><small>The enemy</small></div><div><b>${mine.divisions.length} v ${theirs.divisions.length}</b><small>Divisions</small></div></div>
      <button class="btn" data-bc="command">Command the battle</button>
      <button class="btn ghost" data-bc="watch">Let your generals fight, and watch</button>
      <button class="btn ghost" data-bc="quick">Resolve it quickly</button>
      <p class="note">Whatever you choose is remembered, so your world rebuilds exactly as it happened.</p>`, true);
    pendingChoice = mode => {
      closeSheet();
      if (mode === 'quick') { world.finishPending(null, { mode: 'quick' }); save(); render(); res(); return; }
      if (mode === 'watch') { watchBattle(ctx.cfg, info, b => { world.finishPending(b, { mode: 'watch' }); save(); render(); res(); }); return; }
      commandBattle(world.commandCfg(ctx), info, ctx.playerSide, b => { world.finishPending(b, { mode: 'command', script: b.recorded }); save(); render(); res(); });
    };
  });
}
let pendingChoice = null;
let lastTick = 0, lastCount = 0;
function loop(t) {
  if (playing && !busy && world && t - lastTick > 220) {
    lastTick = t;
    const from = world.chronicle.length;
    world.tick(); updateHeader();
    if (world.pendingBattle) { busy = true; resolvePending().then(() => { busy = false; lastTick = performance.now(); }); }
    const e = playerEvent(from);
    if (e) { playing = false; setPlayBtn(); save(); toast(e.text, 'you'); render(); }
    const n = world.chronicle.filter(x => x.importance >= ui.level).length;
    if (tab === 'map' || (tab === 'chronicle' && n !== lastCount) || world.month === 0) { lastCount = n; render(true); }
    if (world.month === 0) save();
  }
  requestAnimationFrame(loop);
}
function setPlayBtn() { const b = $('#btnPlay'); b.textContent = playing ? '❚❚' : '▶'; b.setAttribute('aria-label', playing ? 'Pause' : 'Play'); }
function setBusy(on) { for (const id of ['#btnPlay', '#btnYear', '#btnTen', '#btnHundred', '#btnWorld']) $(id).disabled = on; }
function updateHeader() { if (!world) return; $('#date').textContent = world.dateLabel(); $('#season').textContent = world.season; }
function selectTab() { document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab)); }

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
  if (!world) { if (tab === 'you') renderCreation(view, null, false); return; }
  if (soft && tab !== 'map' && tab !== 'chronicle') return;
  if (tab === 'you') { if (creatingLife) renderCreation(view, world, true); else renderYou(view, world); }
  else if (tab === 'chronicle') renderChronicle();
  else if (tab === 'map') { if (!soft) mountMap(view, world, { realm: realmSheet, char: charSheet, act: doAct }); else refreshCard(); }
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
    const people = e.ids.slice(0, 4).map(id => charPill(world.char(id))).join('') + (e.duels ? `<button class="pill" data-watch-duel="${world.chronicle.indexOf(e)}">▶ Watch</button>` : '');
    html += `<div class="entry i${e.importance} ${e.type === 'you' || (world.playerId && e.ids.includes(world.playerId)) ? 'you' : ''}"><div class="meta">${e.watched ? '👁 Watched · ' : ''}${TYPE_LABELS[e.type] || 'The world'} · ${['Deepfrost', 'Thawmonth', 'Seedtime', 'Rainmonth', 'Bloomtide', 'Highsun', 'Goldmonth', 'Harvestide', 'Reaping', 'Leaffall', 'Mistmonth', 'Longnight'][e.m]}</div>${esc(e.text)}${people ? `<div class="who">${people}</div>` : ''}</div>`;
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
  html += `<h2 class="sec">Practice</h2><div class="card"><div class="sub">Fight a standalone battle with any culture's troops, outside your world.</div><button class="btn ghost" data-sandbox>Open the battle sandbox</button></div>`;
  view.innerHTML = html;
}

// ---------- detail sheets ----------
function openSheet(html, locked = false) { $('#sheet').innerHTML = `<div class="grab"></div>${locked ? '' : '<button class="close" data-close>✕</button>'}` + html; $('#sheetWrap').hidden = false; $('#sheetWrap').dataset.locked = locked ? '1' : ''; $('#sheet').scrollTop = 0; }
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
    <div class="abtns"><button class="abtn" data-copy-seed>Copy seed</button></div>
    <h2 class="sec">Saves</h2>
    ${slots().list.map(x => `<div class="card"><b>${esc(x.who)}</b>${x.id === slotId ? ' <span class="tag title">playing</span>' : ''}${x.alive ? '' : ' <span class="tag war">line ended</span>'}<div class="sub">Year ${x.year} · seed “${esc(x.seed)}” · ${SIZES[x.size]?.label || ''}</div><div class="abtns">${x.id !== slotId ? `<button class="abtn" data-load-slot="${x.id}">Continue</button>` : ''}<button class="abtn" data-del-slot="${x.id}">Delete</button></div></div>`).join('')}
    <button class="btn" id="createWorld">New game${slots().list.length >= MAX_SLOTS ? ' (replaces your oldest save)' : ''}</button>
    <h2 class="sec">Mods</h2>
    <div class="sub">A mod is a small JSON file that can rename cultures, change their name pools, and tune how often wars, monsters, famines, plots and tournaments happen. It applies to new worlds. ${getMod() ? `Active: <b>${esc(getMod().name || 'unnamed mod')}</b>.` : 'No mod active.'}</div>
    <div class="abtns"><label class="abtn" style="cursor:pointer">Load a mod file<input type="file" accept=".json,application/json" id="modFile" hidden></label>${getMod() ? '<button class="abtn" data-clear-mod>Remove mod</button>' : ''}<a class="abtn" href="mods/grim-and-perilous.json" download>Example mod</a></div>
    <label class="field"><span>Watch battles as they happen</span></label>
    <div class="chips">${[['off', 'Never'], ['big', 'Big battles'], ['all', 'Every battle']].map(([k, l]) => `<button class="chip ${watchMode === k ? 'on' : ''}" data-watch="${k}">${l}</button>`).join('')}</div>
    <div class="sub">When a battle you'd watch begins, the world pauses and the battle map opens. Battles you skip are still fought on the same engine, just faster. Big battles involve a kingdom or over 1,400 troops.</div>
    <p class="note">Your world is saved on this device automatically.</p>
    <h2 class="sec">Credits</h2>
    <div class="sub">The Dynasty v1.0. All pixel art is from the HAS (Heroic Fantasy) asset packs by Aleksandr Makarov (@IknowKingRabbit), used under its license. Thank you, Aleksandr.</div>
  `);
}

// ---------- events ----------
document.addEventListener('click', ev => {
  if (ev.target.closest('.battle')) return;
  const t = ev.target.closest('button, .card.tap, [data-char], [data-realm]');
  if (!t) return;
  if (tab === 'battle' && !t.dataset.tab && handleBattleSetupClick(t, view)) return;
  if (t.matches('[data-close]')) return closeSheet();
  if (t.dataset.bc && pendingChoice) { const f = pendingChoice; pendingChoice = null; return f(t.dataset.bc); }
  if (t.dataset.sandbox != null) { tab = 'battle'; return renderBattleSetup(view); }
  if (handleFormClick(t)) return render();
  if (t.dataset.y === 'begin') { const f = readForm(); return newGame(f); }
  if (t.dataset.y === 'newlife') { if (world.gameOver && !creatingLife) { creatingLife = true; return render(); } const f = readForm(); creatingLife = false; const msg = world.act({ type: 'start', origin: f.origin, culture: f.culture, name: f.name, female: f.female, mode: f.mode }); save(); render(); return toast(msg); }
  if (t.dataset.y === 'newworld') { world = null; creatingLife = false; tab = 'you'; selectTab(); return render(); }
  if (t.dataset.y === 'successor') return doAct({ type: 'successor', id: +t.dataset.id });
  if (t.dataset.stance) { setStance(t.dataset.stance); return render(); }
  if (t.dataset.watchDuel) { const e = world.chronicle[+t.dataset.watchDuel]; return watchDuels(e.duels, e.duels.length > 1 ? 'The tournament' : 'A duel'); }
  if (t.dataset.act) { const a = JSON.parse(t.dataset.act); if (t.dataset.confirm && !window.confirm(t.dataset.confirm)) return; return doAct(a); }
  if (t.dataset.tab) { if (tab === 'map' && t.dataset.tab !== 'map') unmountMap(); tab = t.dataset.tab; document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b === t)); ui.shown = 60; window.scrollTo(0, 0); return render(); }
  if (t.dataset.level) { ui.level = +t.dataset.level; ui.shown = 60; return renderChronicle(); }
  if (t.dataset.type) { ui.type = t.dataset.type; ui.shown = 60; return renderChronicle(); }
  if (t.id === 'moreBtn') { ui.shown += 80; return renderChronicle(); }
  if (t.dataset.char) return charSheet(+t.dataset.char);
  if (t.dataset.realm) return realmSheet(+t.dataset.realm);
  if (t.id === 'createWorld') { if (slots().list.length >= MAX_SLOTS && !window.confirm('Your oldest save will be replaced. Continue?')) return; closeSheet(); save(); world = null; slotId = null; creatingLife = false; if (tab === 'map') unmountMap(); tab = 'you'; selectTab(); return render(); }
  if (t.dataset.loadSlot) { closeSheet(); save(); return openSlot(t.dataset.loadSlot); }
  if (t.dataset.delSlot) { if (!window.confirm('Delete this save for good?')) return; const id = t.dataset.delSlot; return deleteWorld(id).then(() => { if (id === slotId) { slotId = null; world = null; closeSheet(); tab = 'you'; selectTab(); render(); } else worldSheet(); }); }
  if (t.dataset.copySeed != null) { navigator.clipboard?.writeText(world.seed).then(() => toast(`Seed “${world.seed}” copied. Share it and a friend can start in the same world.`)).catch(() => toast(`Seed: ${world.seed}`)); return; }
  if (t.dataset.clearMod != null) { setMod(null); toast('Mod removed. New worlds will be unmodded.'); return worldSheet(); }
  if (t.dataset.watch) { watchMode = t.dataset.watch; world.watchMode = watchMode === 'off' ? null : watchMode; try { localStorage.setItem('dynasty.watch', watchMode); } catch (e) { /* ignore */ } return worldSheet(); }
});
$('#sheetWrap').addEventListener('click', ev => { if (ev.target.id === 'sheetWrap' && !$('#sheetWrap').dataset.locked) closeSheet(); });
const ready = () => world && world.playerId && !busy;
$('#btnPlay').onclick = () => { if (!ready()) return; playing = !playing; setPlayBtn(); };
$('#btnYear').onclick = () => ready() && runMonths(12);
$('#btnTen').onclick = () => ready() && runMonths(120);
$('#btnHundred').onclick = () => ready() && runMonths(1200);
$('#btnWorld').onclick = () => !busy && (world ? worldSheet() : savesOnlySheet());
function savesOnlySheet() {
  openSheet(`<h2>Saves</h2>${slots().list.map(x => `<div class="card"><b>${esc(x.who)}</b><div class="sub">Year ${x.year} · seed “${esc(x.seed)}”</div><div class="abtns"><button class="abtn" data-load-slot="${x.id}">Continue</button><button class="abtn" data-del-slot="${x.id}">Delete</button></div></div>`).join('') || '<div class="sub">No saves yet.</div>'}`);
}
function doAct(a) {
  world.lastPlayerDuel = null;
  const msg = world.act(a); save(); render(tab === 'map'); if (tab === 'map') refreshCard(); if (msg) toast(msg);
  if (world.lastPlayerDuel && (a.type === 'challenge' || a.type === 'answer')) watchDuels([world.lastPlayerDuel], 'Your duel');
}

// ---------- start ----------
window.dynasty = () => world; window.dynastyCam = debugCam; // handy for debugging from the console
async function openSlot(id) {
  view.innerHTML = '<div class="empty">Opening your world…</div>';
  try {
    const snap = await loadWorld(id);
    if (!snap) throw new Error('missing');
    world = World.restore(snap); setWorld(world); slotId = id; setCurrent(id);
    world.watchMode = watchMode === 'off' ? null : watchMode;
  } catch (e) { world = null; slotId = null; toast('That save could not be opened.'); }
  playing = false; setPlayBtn(); if (tab === 'map') unmountMap(); tab = 'you'; selectTab(); render();
}
document.addEventListener('change', ev => {
  if (ev.target.id !== 'modFile') return;
  const f = ev.target.files[0]; if (!f) return;
  f.text().then(txt => { const mod = JSON.parse(txt); if (typeof mod !== 'object' || Array.isArray(mod)) throw new Error('bad'); setMod(mod); toast(`Mod “${mod.name || f.name}” loaded. It applies to your next new world.`); worldSheet(); }).catch(() => toast('That file is not a valid mod.'));
});
window.addEventListener('pagehide', () => save());
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

(async () => {
  selectTab();
  const s = slots();
  if (s.current && s.list.some(x => x.id === s.current)) await openSlot(s.current);
  else {
    const saved = load();
    if (saved && SIZES[saved.size] && saved.actions && saved.actions.length) {
      // a save from 0.5–0.8: rebuild it once, then keep it as a snapshot
      if (saved.watchMode) watchMode = saved.watchMode;
      await rebuild(saved); slotId = newSlotId(); setCurrent(slotId); save();
      try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    }
    render();
  }
  requestAnimationFrame(loop);
})();

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
