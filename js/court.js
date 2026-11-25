// 2.5 Decisions, the court and being there.
// Choices arrive as cards with a deadline while time keeps running. Ignore one and someone decides for you.
// Ruling happens at your seat: while you're away, your steward rules in your place.

// actions that need you to be holding court at your seat
export const COURT_ACTS = ['feast', 'tax', 'guard', 'guardAuto', 'levy', 'fortify', 'recruit', 'appoint', 'grain', 'tournament', 'war', 'peaceTerms', 'arrange', 'ward', 'spy', 'agitate', 'smear', 'assassin', 'persuade', 'grant', 'revoke', 'transfer'];

export function installCourt(World) {
  const P = World.prototype;

  // ---------- presence ----------
  P.seat = function () { const r = this.playerRealm(); return r && this.sett(r.capital); };
  P.atSeat = function () {
    const p = this.player, r = this.playerRealm(); if (!p || !p.alive || !r || r.rulerId !== p.id || p.prisonerOf) return false;
    const cap = this.sett(r.capital); if (!cap) return false;
    return !p.task && !p.atSea && Math.hypot(p.x - cap.x, p.y - cap.y) < 1.5;
  };
  P.awayReason = function () {
    const p = this.player; if (!p) return '';
    if (p.prisonerOf) return 'You are a prisoner.';
    if (this.wars.some(w => w.march && w.march.officers.includes(p.id))) return 'You ride with your army.';
    if (p.task) return p.task.to ? `You are on the road to ${this.sett(p.task.to)?.name || 'somewhere'}.` : 'You are out on a hunt.';
    return 'You are away from your seat.';
  };

  // ---------- decisions ----------
  P.offer = function (d) {
    if (!this.decisions) this.decisions = [];
    if (d.key && this.decisions.some(x => x.key === d.key)) return null;
    if (d.key && this.recentKeys && this.recentKeys[d.key] > this.monthIndex - 12) return null; // asked and answered this year
    const card = { id: this.id(), at: this.monthIndex, due: this.monthIndex + (d.months || 2), ...d };
    this.decisions.push(card);
    return card;
  };
  P.decisionsFor = function () { return (this.decisions || []).filter(d => d.who == null || this.char(d.who)?.alive !== false); };
  P.act_decide = function (a) {
    const d = (this.decisions || []).find(x => x.id === a.id); if (!d) return 'That matter is already settled.';
    if (d.court && !this.atSeat()) return 'You must be at your seat to settle court business. Your steward will handle it if you stay away.';
    return this.settle(d, a.choice, 'you');
  };
  P.settle = function (d, choice, by) {
    this.decisions = this.decisions.filter(x => x !== d);
    if (d.key) (this.recentKeys || (this.recentKeys = {}))[d.key] = this.monthIndex;
    const h = HANDLERS[d.kind]; if (!h) return '';
    const opt = d.options.find(o => o.id === choice) || d.options.find(o => o.id === d.def) || d.options[0];
    return h.call(this, d, opt.id, by) || '';
  };
  P.decisionsTick = function () {
    const p = this.player; if (!p || !p.alive || !this.decisions) return;
    const away = !this.atSeat();
    for (const d of [...this.decisions]) {
      if (!this.decisions.includes(d)) continue;
      // court business waits a month for you, then your steward settles it in your absence
      if (d.court && away && this.monthIndex >= d.at + 1) {
        const r = this.playerRealm(); const st = r && (this.steward(r) || this.char(r.rulerId));
        const pick = d.steward ? d.steward.call(this, d, st) : d.def;
        const label = (d.options.find(o => o.id === pick) || d.options[0]).label;
        this.settle(d, pick, 'steward');
        if (st && st.id !== p.id) this.you(`While you were away, your steward ${st.name} settled “${d.title}”: ${label.toLowerCase()}.`, [st.id], 1);
        continue;
      }
      if (this.monthIndex >= d.due) {
        const label = (d.options.find(o => o.id === d.def) || d.options[0]).label;
        this.settle(d, d.def, 'time');
        this.you(`You let “${d.title}” wait too long. It was settled without you: ${label.toLowerCase()}.`, [], 1);
      }
    }
  };

  // ---------- things that take time ----------
  P.later = function (months, job) { (this.jobs || (this.jobs = [])).push({ at: this.monthIndex + months, ...job }); };
  P.jobsTick = function () {
    for (const j of [...(this.jobs || [])]) {
      if (this.monthIndex < j.at) continue;
      this.jobs.splice(this.jobs.indexOf(j), 1);
      const r = this.realm(j.realm); if (!r || !r.alive) continue;
      if (j.kind === 'reserve') { r.reserve = Math.min(this.reserveCap(r), (r.reserve || 0) + j.n); if (this.playerRealm() === r) this.you(`${j.n} new men march in to join your reserve.`, [], 1); }
      if (j.kind === 'garrison') { const s = this.sett(j.sett); if (s && s.realmId === r.id) { s.garrison = Math.min(this.garrisonCap(s), (s.garrison || 0) + j.n); if (this.playerRealm() === r) this.you(`The new garrison of ${s.name} is in place: ${s.garrison} on the walls.`, [], 1); } }
      if (j.kind === 'gold') { r.treasury += j.n; continue; }
      if (j.kind === 'officer') { const o = this.char(j.id); if (o && o.alive && o.army && o.realmId === r.id) { o.army.size = Math.min(this.troopCap(o), o.army.size + j.n); if (this.playerRealm() === r) this.you(`${j.n} recruits reach ${o.name}'s army.`, [o.id], 1); } }
    }
  };

  // ---------- your council speaks up each season ----------
  P.councilTick = function () {
    const p = this.player, r = this.playerRealm(); if (!p || !p.alive || !r || r.rulerId !== p.id || this.month % 3 !== 1) return;
    const st = this.steward(r), cp = this.captain(r), sm = this.council(r, 'spymasterId');
    const cap = this.sett(r.capital); const setts = this.realmSetts(r);
    const war = this.wars.find(w => !w.over && (w.a === r.id || w.b === r.id));
    const foe = war && this.realm(war.a === r.id ? war.b : war.a);
    // steward: money, food, taxes
    if (st) {
      const hungry = setts.find(s => s.famine);
      if (hungry) this.offer({ kind: 'feed', key: 'feed' + hungry.id, court: true, who: st.id, title: `Grain for ${hungry.name}`, text: `${st.name}: “${hungry.name} is starving, my liege. Grain from the royal stores would cost about ${this.grainCost(hungry)} gold, and they would remember it.”`, options: [{ id: 'yes', label: 'Send the grain' }, { id: 'no', label: 'They must endure' }], def: this.has(st, 'greedy') ? 'no' : 'yes', data: { sett: hungry.id } });
      else if (r.treasury < 40 && (r.tax || 'normal') !== 'high') this.offer({ kind: 'tax', key: 'taxup', court: true, who: st.id, title: 'An empty treasury', text: `${st.name}: “The coffers are nearly bare. Raising taxes would fill them, though the villages will grumble.”`, options: [{ id: 'high', label: 'Raise taxes' }, { id: 'keep', label: 'Keep them as they are' }], def: 'high' });
      else if (setts.some(s => s.unrest > 70) && (r.tax || 'normal') === 'high') this.offer({ kind: 'tax', key: 'taxdown', court: true, who: st.id, title: 'Restless villages', text: `${st.name}: “The people are close to rising. Lowering taxes would calm them.”`, options: [{ id: 'normal', label: 'Ease the taxes' }, { id: 'keep', label: 'They will pay' }], def: this.has(st, 'kind') ? 'normal' : 'keep' });
    }
    // captain: walls and men
    if (cp) {
      const exposed = setts.slice().sort((a, b) => (a.garrison || 0) / Math.max(1, this.garrisonCap(a)) - (b.garrison || 0) / Math.max(1, this.garrisonCap(b)))[0];
      const n = exposed ? Math.min(300, this.garrisonCap(exposed) - (exposed.garrison || 0)) : 0;
      if (war && (r.reserve || 0) < this.reserveCap(r) * 0.6) { const k = Math.min(400, this.reserveCap(r) - (r.reserve || 0)); if (k > 40) this.offer({ kind: 'levy', key: 'levy', court: true, who: cp.id, title: 'Men for the war', text: `${cp.name}: “We are at war with ${foe ? foe.name : 'our enemies'}. Let me raise ${k} men for your reserve. ${Math.ceil(k / 2)} gold, and they'll be drilled within a month.”`, options: [{ id: 'yes', label: `Raise ${k} men` }, { id: 'no', label: 'Not now' }], def: 'yes', data: { n: k } }); }
      else if (exposed && n > 50 && ((exposed.garrison || 0) < this.garrisonCap(exposed) * 0.4 || this.chance(0.5))) this.offer({ kind: 'fortify', key: 'fort' + exposed.id, court: true, who: cp.id, title: `The walls of ${exposed.name}`, text: `${cp.name}: “${exposed.name} has only ${exposed.garrison || 0} men on its walls. ${n} more would cost ${Math.ceil(n / 3)} gold.”`, options: [{ id: 'yes', label: `Garrison ${n} more` }, { id: 'no', label: 'The walls will hold' }], def: war ? 'yes' : 'no', data: { sett: exposed.id, n } });
      if ((this.plots || []).some(x => x.warned) && (r.guardChoice || 'Light') !== 'Locked Down') this.offer({ kind: 'guard', key: 'lockdown', court: true, who: cp.id, title: 'A knife in the dark', text: `${cp.name}: “There is talk of a plot against your life. Let me lock down the gates of ${cap?.name || 'your seat'}. Trade will suffer and the people will mutter.”`, options: [{ id: 'Locked Down', label: 'Lock it down' }, { id: 'Watchful', label: 'Stay watchful' }, { id: 'keep', label: 'Change nothing' }], def: 'Locked Down', months: 1 });
    }
    // spymaster: eyes on the enemy
    if (sm && war && foe && !(this.agents || []).some(a => a.kind === 'spy' && a.owner === r.id)) this.offer({ kind: 'spy', key: 'spy' + foe.id, court: true, who: sm.id, title: `Eyes in ${foe.name}`, text: `${sm.name}: “Give me 20 gold and I will put a spy in ${foe.name}'s court. Their plans, their officers, their titles: all of it.”`, options: [{ id: 'yes', label: 'Send a spy' }, { id: 'no', label: 'No spies' }], def: 'yes', data: { realm: foe.id } });
  };
}

// what each kind of decision does
const HANDLERS = {
  feed(d, c) { if (c === 'yes') return this.act_grain({ sett: d.data.sett }); const s = this.sett(d.data.sett); if (s) s.unrest += 10; return `${s ? s.name : 'The village'} is left to starve.`; },
  tax(d, c) { if (c === 'keep') return 'Taxes stay as they are.'; return this.act_tax({ level: c }); },
  levy(d, c) {
    if (c !== 'yes') return 'No new men are raised.';
    const r = this.playerRealm(); const cost = Math.ceil(d.data.n / 2); if (!r || r.treasury < cost) return 'The treasury cannot pay for the levy.';
    r.treasury -= cost; this.later(1, { kind: 'reserve', realm: r.id, n: d.data.n });
    return `${d.data.n} men are called up. They'll join your reserve within a month.`;
  },
  fortify(d, c) {
    if (c !== 'yes') return 'The walls stay as they are.';
    const r = this.playerRealm(); const cost = Math.ceil(d.data.n / 3); if (!r || r.treasury < cost) return 'The treasury cannot pay for the garrison.';
    r.treasury -= cost; this.later(1, { kind: 'garrison', realm: r.id, sett: d.data.sett, n: d.data.n });
    return `Masons and men-at-arms are sent to ${this.sett(d.data.sett)?.name}. They'll be in place within a month.`;
  },
  guard(d, c) { if (c === 'keep') return 'The guard stays as it is.'; return this.act_guard({ level: c }); },
  spy(d, c) { if (c !== 'yes') return 'No spy is sent.'; return this.act_spy({ realm: d.data.realm }); },
};
export { HANDLERS };
