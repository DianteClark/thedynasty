// 2.8 Diplomacy happens with people: envoys who ride the map, audiences face to face, and missions for officers.

export const PROPOSALS = { alliance: 'Alliance', truce: 'Five-year truce', tribute: 'Demand tribute', peace: 'Peace', peace_gold: 'Peace for 100 gold', peace_cede: 'Peace for a holding', match: 'A marriage match' };

export function installDiplomacy(World) {
  const P = World.prototype;

  // how willing their ruler is to hear you out (0..1), before the proposal itself
  P.goodwill = function (their, inPerson) {
    const p = this.player, tr = this.char(their.rulerId); if (!tr) return 0.3;
    return 0.25 + this.op(tr, p) * 0.005 + p.stats.cha * 0.015 + Math.min(0.15, p.fame / 400) + (inPerson ? 0.15 : 0) + (this.has(tr, 'honorable') ? 0.05 : 0) - (this.has(tr, 'deceitful') ? 0.05 : 0);
  };
  // the answer to a proposal, whether it arrived by envoy or in person
  P.propose = function (their, kind, extra = {}, inPerson = false) {
    const r = this.playerRealm(), p = this.player, tr = this.char(their.rulerId);
    if (!r || !their.alive) return `${their.name} is no more.`;
    const strength = this.realmStrength(r) / Math.max(1, this.realmStrength(their));
    const gw = this.goodwill(their, inPerson); const via = inPerson ? 'face to face' : 'through your envoy';
    if (kind.startsWith('peace')) {
      const terms = { peace: 'white', peace_gold: 'gold', peace_cede: 'cede' }[kind];
      if (inPerson && tr) this.opine(tr, p, 5);
      return this.act_peaceTerms({ realm: their.id, terms });
    }
    if (kind === 'match') return this.act_arrange({ child: extra.child, match: extra.match });
    if (kind === 'alliance') {
      if (this.atWar(r, their)) return 'You cannot ally with an enemy at war with you.';
      if (this.chance(Math.max(0.05, Math.min(0.9, gw + (tr && this.has(tr, 'cautious') ? 0.1 : 0))))) { r.allies.add(their.id); their.allies.add(r.id); if (tr) this.opine(tr, p, 10); this.you(`${their.name} agrees ${via} to an alliance with you.`, [tr?.id].filter(Boolean), 2); return `${their.name} is now your ally.`; }
      if (tr) this.opine(tr, p, -3); this.you(`${their.name} turns down your offer of alliance.`, [tr?.id].filter(Boolean), 1); return `${their.name} declines.`;
    }
    if (kind === 'truce') {
      if (this.atWar(r, their)) return 'You are at war: offer peace instead.';
      if (this.chance(Math.max(0.05, Math.min(0.95, gw + 0.2)))) { r.truce.set(their.id, this.year + 5); their.truce.set(r.id, this.year + 5); this.you(`You and ${their.name} swear a five-year truce ${via}.`, [tr?.id].filter(Boolean), 1); return 'A truce is sworn.'; }
      return `${their.name} will not bind its hands.`;
    }
    if (kind === 'tribute') {
      const fear = strength > 1.5 ? Math.min(0.6, (strength - 1.5) * 0.3) + (tr && this.has(tr, 'cautious') ? 0.15 : 0) - (tr && this.has(tr, 'brave') ? 0.2 : 0) : 0;
      if (fear > 0 && this.chance(Math.max(0.05, fear + (inPerson ? 0.1 : 0)))) { const n = Math.min(Math.round(their.treasury * 0.4), 150); their.treasury -= n; r.treasury += n; if (tr) this.opine(tr, p, -30); this.you(`${their.name} bends the knee and pays you ${n} gold in tribute.`, [tr?.id].filter(Boolean), 2); return `${their.name} pays ${n} gold.`; }
      if (tr) this.opine(tr, p, -40);
      if (tr && (this.has(tr, 'brave') || this.has(tr, 'reckless')) && this.chance(0.4) && !this.atWar(r, their)) { this.declareWar(their, r, 'an insult to their honour'); return `${their.name} answers your demand with war!`; }
      this.you(`${their.name} refuses your demand for tribute, and will not forget it.`, [tr?.id].filter(Boolean), 1); return `${their.name} refuses.`;
    }
    return '';
  };

  // send an envoy riding to their seat; the answer comes when they arrive
  P.act_envoy = function (a) {
    const r = this.playerRealm(), their = this.realm(a.realm); if (!r || !their || !their.alive) return 'There is no one to send to.';
    if ((this.agents || []).some(x => x.kind === 'envoy' && x.owner === r.id && x.data.to === their.id)) return `An envoy is already on the road to ${their.name}.`;
    if (r.treasury < 10) return 'An envoy costs 10 gold for the road.';
    r.treasury -= 10;
    const from = this.sett(r.capital), to = this.sett(their.capital);
    const ag = this.spawnAgent('envoy', r.id, from, to, { proposal: a.proposal, to: their.id, child: a.child, match: a.match, mine: true });
    if (!ag) return 'The roads are closed.';
    const months = this.tripMonths(from, to);
    return `Your envoy rides for ${their.name} with your offer (${PROPOSALS[a.proposal]}). About ${months} month${months === 1 ? '' : 's'} on the road.`;
  };
  P.envoyArrives = function (a) {
    const their = this.realm(a.data.to); if (!their) return;
    const r = this.realm(a.owner); if (!r || this.playerRealm() !== r) return;
    const before = this.chronicle.length;
    const out = this.propose(their, a.data.proposal, { child: a.data.child, match: a.data.match }, false);
    if (out && !this.chronicle.slice(before).some(e => e.type === 'you')) this.you(`Your envoy returns from ${their.name}: ${out}`, [], 2);
  };

  // you are standing in their hall: ask to be heard
  P.act_audience = function () {
    const p = this.player, s = this.sett(p.settId); const their = s && this.realm(s.realmId);
    if (!their || their.capital !== s.id || their.id === p.realmId || p.task) return 'There is no foreign court here.';
    const tr = this.char(their.rulerId); if (!tr) return 'The throne is empty.';
    if (their.lastAudience && this.monthIndex - their.lastAudience < 6) return `${tr.name} will not see you again so soon.`;
    their.lastAudience = this.monthIndex;
    const r = this.playerRealm(), rules = this.playerRules(), war = r && this.atWar(r, their);
    const options = rules ? (war ? [{ id: 'peace', label: 'Ask for peace' }, { id: 'peace_gold', label: 'Offer 100 gold for peace' }] : [{ id: 'alliance', label: 'Propose an alliance' }, { id: 'truce', label: 'Propose a truce' }, { id: 'tribute', label: 'Demand tribute' }]) : [{ id: 'serve', label: 'Offer your service' }, { id: 'news', label: 'Ask for news of the realm' }];
    options.push({ id: 'leave', label: 'Bow and take your leave' });
    this.offer({ kind: 'audience', who: tr.id, months: 1, title: `An audience with ${tr.name}`, text: `You are shown into the hall of ${s.name}. ${this.fullName(tr)}, ${this.rulerTitle(their, tr)} of ${their.name}, looks down at you${this.op(tr, p) > 20 ? ' with a warm smile' : this.op(tr, p) < -20 ? ' coldly' : ''}.`, options, def: 'leave', data: { realm: their.id } });
    return `${tr.name} will see you.`;
  };

  // ---------- missions for officers ----------
  P.missionsTick = function () {
    const p = this.player; if (!p || !p.alive || p.role !== 'officer' || p.prisonerOf) return;
    const r = this.playerRealm(), lord = r && this.char(r.rulerId); if (!lord || this.isPlayer(lord)) return;
    const m = p.mission;
    if (m) {
      const done = m.kind === 'hunt' ? !this.char(m.target)?.alive : p.settId === m.target && !p.task;
      if (done) {
        p.mission = null; p.gold = (p.gold || 0) + m.reward; p.loyalty = Math.min(100, (p.loyalty || 60) + 8); this.opine(lord, p, 15); this.gainXp(p, 40); p.fame += 2;
        if (m.kind === 'scout') { const t = this.realm(this.sett(m.target)?.realmId); if (t) this.learnCourt(t); }
        if (m.kind === 'letter') { const t = this.realm(this.sett(m.target)?.realmId); const tr = t && this.char(t.rulerId); if (tr) this.opine(tr, lord, 15); }
        if (m.kind === 'council') { this.councilAdvice(r, lord); }
        this.you(`Mission done: ${m.title}. ${lord.name} rewards you with ${m.reward} gold.`, [lord.id], 2);
      } else if (this.monthIndex > m.due) {
        p.mission = null; this.opine(lord, p, -20); p.loyalty = Math.max(0, (p.loyalty || 60) - 8);
        this.you(`You failed your mission: ${m.title}. ${lord.name} is not pleased.`, [lord.id], 2);
      }
      return;
    }
    if ((this.decisions || []).some(d => d.kind === 'mission') || (p.lastMission && this.monthIndex - p.lastMission < 4) || !this.chance(0.3)) return;
    p.lastMission = this.monthIndex;
    const cap = this.sett(r.capital); const opts = [];
    const rival = this.neighbours(r, 20).filter(o => !r.allies.has(o.id))[0]; const rs = rival && this.sett(rival.capital);
    if (rs) opts.push({ kind: 'scout', target: rs.id, title: `Scout ${rs.name}`, text: `“Ride to ${rs.name} and see what ${rival.name} has behind its walls: officers, armies, all of it.”`, reward: 40 });
    const friend = this.neighbours(r, 25).find(o => r.allies.has(o.id) || !this.atWar(r, o)); const fs = friend && this.sett(friend.capital);
    if (fs && fs !== rs) opts.push({ kind: 'letter', target: fs.id, title: `A letter for ${friend.name}`, text: `“Carry this letter to ${fs.name}, into the hands of its ruler and no one else.”`, reward: 30 });
    const bandit = this.living().find(x => x.role === 'bandit' && this.realmSetts(r).some(s => this.dist(s, x) < 10));
    if (bandit) opts.push({ kind: 'hunt', target: bandit.id, title: `Hunt down ${bandit.name}`, text: `“The bandit ${bandit.name} and ${bandit.band} cutthroats are robbing my roads. Bring me their head.”`, reward: 50 });
    if (cap && p.settId !== cap.id) opts.push({ kind: 'council', target: cap.id, title: 'Summoned to council', text: `“Come to ${cap.name}. I would hear your counsel on the realm's affairs.”`, reward: 20 });
    if (!opts.length) return;
    const o = this.pick(opts);
    this.offer({ kind: 'mission', who: lord.id, months: 2, title: `Orders: ${o.title}`, text: `${this.fullName(lord)} sends for you. ${o.text} (${o.reward} gold when it's done.)`, options: [{ id: 'obey', label: 'Obey' }, { id: 'refuse', label: 'Refuse' }], def: 'refuse', data: o });
  };
  // the council you were summoned to: your lord asks your advice, and listens
  P.councilAdvice = function (r, lord) {
    const foes = this.neighbours(r).filter(o => !r.allies.has(o.id) && !this.atWar(r, o)); const foe = foes.sort((a, b) => this.realmStrength(a) - this.realmStrength(b))[0];
    const war = this.wars.find(w => !w.over && (w.a === r.id || w.b === r.id));
    const options = [];
    if (war) { const o = this.realm(war.a === r.id ? war.b : war.a); options.push({ id: 'peace', label: `Make peace with ${o.name}` }, { id: 'fight', label: 'Fight on' }); }
    else if (foe) options.push({ id: 'war', label: `Attack ${foe.name}` }, { id: 'wait', label: 'Keep the peace' });
    options.push({ id: 'walls', label: 'Strengthen our walls' });
    this.offer({ kind: 'advice', who: lord.id, months: 1, title: 'Your counsel', text: `In the council chamber, ${lord.name} turns to you. “What should the realm do?”`, options, def: options[options.length - 1].id, data: { realm: r.id, foe: foe && foe.id, war: war && war.id } });
  };
}

// handlers
export function resolveDiplomacy(d, c) {
  const p = this.player;
  if (d.kind === 'audience') {
    const their = this.realm(d.data.realm); if (!their) return '';
    if (c === 'leave') return 'You bow and withdraw.';
    if (c === 'serve') return this.act_serve({ realm: their.id });
    if (c === 'news') { this.learnCourt(their); this.learnLocals(this.sett(their.capital)); return `You learn much about ${their.name} and its neighbours.`; }
    return this.propose(their, c, {}, true);
  }
  if (d.kind === 'mission') {
    const lord = this.char(d.who);
    if (c !== 'obey') { if (lord) this.opine(lord, p, -15); p.loyalty = Math.max(0, (p.loyalty || 60) - 6); return 'You refuse. Your lord will remember it.'; }
    const m = { ...d.data, due: this.monthIndex + (d.data.kind === 'hunt' ? 8 : 6) };
    p.mission = m;
    if (m.kind === 'hunt') { const b = this.char(m.target); if (b) p.task = { type: 'bandit', bandit: b.id }; }
    else { const s = this.sett(m.target); if (s) p.task = { type: 'travel', to: s.id }; }
    return `You set out: ${m.title}.`;
  }
  if (d.kind === 'advice') {
    const r = this.realm(d.data.realm), lord = this.char(d.who); if (!r || !lord) return '';
    const heed = this.chance(0.4 + p.stats.int * 0.02 + this.op(lord, p) * 0.004);
    if (!heed) return `${lord.name} thanks you, and does as they please.`;
    if (c === 'war' && d.data.foe) { const f = this.realm(d.data.foe); if (f && f.alive && !this.atWar(r, f)) this.declareWar(r, f, 'counsel at court'); return `${lord.name} takes your advice. The realm goes to war with ${f ? f.name : 'its rival'}.`; }
    if (c === 'peace' && d.data.war) { const w = this.wars.find(x => x.id === d.data.war); if (w && !w.over) { const o = this.realm(w.a === r.id ? w.b : w.a); this.spawnAgent('envoy', r.id, this.sett(r.capital), this.sett(o.capital), { war: w.id }); } return `${lord.name} sends envoys to sue for peace.`; }
    if (c === 'walls') { this.investDefences(r); return `${lord.name} orders the walls strengthened.`; }
    return `${lord.name} nods. So it shall be.`;
  }
  return '';
}
