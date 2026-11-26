// 2.7 Ceremonies: weddings, coronations, funerals, oath-swearings, knightings and feasts.
// Each is a short scene with a choice or two. They wait for you (a deadline like any matter), then play out.

export function installCeremonies(World) {
  const P = World.prototype;

  P.ceremony = function (type, spec) {
    const p = this.player; if (!p || !p.alive || this.replaying) return null;
    const place = spec.place || p.settId || (this.playerRealm() && this.playerRealm().capital);
    return this.offer({ kind: 'ceremony', cer: type, months: 2, scene: { type, place, actors: spec.actors || [p.id], guests: spec.guests || this.guestsFor() }, ...spec });
  };
  P.guestsFor = function () {
    const r = this.playerRealm(); if (!r) return this.living().filter(x => x.companionOf === this.playerId).map(x => x.id).slice(0, 6);
    return this.realmOfficers(r).filter(o => !this.isPlayer(o)).slice(0, 6).map(o => o.id);
  };

  // a new ruler is crowned before their officers, and not all of them may kneel
  P.ceremoniesTick = function () {
    const p = this.player; if (!p || !p.alive) return;
    const r = this.playerRealm();
    if (r && r.rulerId === p.id && r.crowned !== p.id) {
      r.crowned = p.id;
      const offs = this.realmOfficers(r).filter(o => !this.isPlayer(o));
      const doubter = offs.filter(o => (o.loyalty || 60) < 45).sort((a, b) => a.loyalty - b.loyalty)[0];
      const what = r.tier === 'Kingdom' ? 'coronation' : 'investiture';
      if (doubter) this.ceremony('coronation', { title: `Your ${what}`, who: doubter.id, actors: [p.id, doubter.id], guests: offs.map(o => o.id).slice(0, 6), data: { d: doubter.id },
        text: `The hall of ${this.sett(r.capital)?.name || 'your seat'} is full. One by one your officers kneel and swear to you as ${this.rulerTitle(r, p)} of ${r.name}. Then ${doubter.name} stays standing, arms folded, and the hall goes silent.`,
        options: [{ id: 'demand', label: `Demand ${doubter.name}'s oath` }, { id: 'strip', label: 'Strip them of rank, here and now' }, { id: 'pass', label: 'Let it pass with a smile' }], def: 'pass' });
      else this.ceremony('coronation', { title: `Your ${what}`, data: {},
        text: `The hall of ${this.sett(r.capital)?.name || 'your seat'} is full. One by one your officers kneel and swear to you as ${this.rulerTitle(r, p)} of ${r.name}. The people wait outside for a sight of their new ruler.`,
        options: [{ id: 'gifts', label: 'Give gifts to every officer (50 gold)' }, { id: 'alms', label: 'Throw silver to the crowd (30 gold)' }, { id: 'plain', label: 'Keep it plain' }], def: 'plain' });
    }
  };

  // hooks called from the sim
  P.onMarriage = function (a, b) {
    const p = this.player; if (!p || !p.alive) return;
    const mine = [a, b].find(x => x.id === p.id || p.children.includes(x.id)); if (!mine) return;
    const other = mine === a ? b : a; const self = mine.id === p.id;
    this.ceremony('wedding', { title: self ? `Your wedding to ${other.name}` : `The wedding of ${mine.name}`, who: other.id, actors: [mine.id, other.id], data: { a: mine.id, b: other.id },
      text: self ? `Banners hang from every window. ${this.fullName(other)} waits for you before the gathered court.` : `Your child ${mine.name} is to wed ${this.fullName(other)}. The guests are arriving.`,
      options: [{ id: 'lavish', label: 'A lavish feast (60 gold)' }, { id: 'rivals', label: 'Invite your rivals too (40 gold)' }, { id: 'modest', label: 'A modest ceremony' }], def: 'modest' });
  };
  P.onDeath = function (c, wasPlayer) {
    const p = this.player; if (!p || !p.alive || c.id === p.id) return;
    const r = this.playerRealm();
    const close = wasPlayer || c.id === p.spouseId || p.children.includes(c.id) || p.parents.includes(c.id) || (r && r.rulerId === p.id && c.realmId === r.id && c.role === 'ruler');
    if (!close && !(c.oath && c.oath.includes(p.id))) return;
    const rel = wasPlayer ? 'your predecessor' : c.id === p.spouseId ? 'your spouse' : p.children.includes(c.id) ? 'your child' : p.parents.includes(c.id) ? 'your parent' : 'your sworn sibling';
    this.ceremony('funeral', { title: `The funeral of ${c.name}`, who: c.id, actors: [p.id, c.id], data: { c: c.id },
      text: `${this.fullName(c)}, ${rel}, is laid to rest (${c.cause}). The mourners wait for you to speak.`,
      options: [{ id: 'grand', label: 'A grand funeral (50 gold)' }, { id: 'quiet', label: 'A quiet burial' }, ...(/slain|killed|assassin|fell|poison|murder/.test(c.cause || '') ? [{ id: 'vow', label: 'Swear vengeance over the grave' }] : [])], def: 'quiet' });
  };
  P.onOath = function (o) {
    this.ceremony('oath', { title: `Brothers in arms: ${o.name}`, who: o.id, actors: [this.playerId, o.id], guests: [], data: { o: o.id },
      text: `By firelight you and ${o.name} clasp hands to swear the oath of brotherhood: to live and die as one.`,
      options: [{ id: 'blood', label: 'Seal it in blood' }, { id: 'word', label: 'Your word is enough' }], def: 'word', months: 1 });
  };
  P.onKnighting = function (c, title) {
    this.ceremony('knighting', { title: `${c.name} is named ${title}`, who: c.id, actors: [this.playerId, c.id], data: { c: c.id, title },
      text: `${c.name} kneels before you in the hall, head bowed, as the court looks on.`,
      options: [{ id: 'horse', label: 'Gift them a warhorse (30 gold)' }, { id: 'words', label: 'A few fine words' }], def: 'words', months: 1 });
  };
  P.act_feast = function () {
    const r = this.playerRealm(); if (!r) return 'You have no hall to feast in.';
    if (r.treasury < 50) return 'A feast costs 50 gold.';
    if (r.lastFeast && this.monthIndex - r.lastFeast < 6) return 'You feasted not long ago.';
    r.treasury -= 50; r.lastFeast = this.monthIndex;
    const guests = this.realmOfficers(r).filter(o => !this.isPlayer(o));
    const rival = guests.filter(o => this.op(o, this.player) < -10 || (o.loyalty || 60) < 40 || this.has(o, 'cruel') || this.has(o, 'ambitious')).sort((a, b) => this.op(a, this.player) - this.op(b, this.player))[0];
    if (rival && this.chance(0.7)) this.ceremony('feast', { title: 'A feast in your hall', who: rival.id, actors: [this.playerId, rival.id], guests: guests.map(o => o.id).slice(0, 6), data: { o: rival.id, incident: true },
      text: `The wine flows and the hall is loud, until ${rival.name} raises a cup and mocks you before everyone. Laughter dies. Every eye turns to you.`,
      options: [{ id: 'duel', label: 'Challenge them, here and now' }, { id: 'wit', label: 'Answer with a jest' }, { id: 'out', label: 'Have them thrown out' }], def: 'wit', months: 1 });
    else this.ceremony('feast', { title: 'A feast in your hall', guests: guests.map(o => o.id).slice(0, 6), data: { incident: false },
      text: 'The tables groan with food, minstrels play, and your officers drink to your name.',
      options: [{ id: 'toast', label: 'Raise a toast to your officers' }, { id: 'heir', label: 'Present your heir to the court' }, { id: 'enjoy', label: 'Just enjoy the night' }], def: 'enjoy', months: 1 });
    return 'The feast is set for this month.';
  };
}

// what each ceremony's choices do
export function resolveCeremony(d, c) {
  const p = this.player; const r = this.playerRealm(); const data = d.data || {};
  const guests = (d.scene && d.scene.guests || []).map(id => this.char(id)).filter(x => x && x.alive);
  switch (d.cer) {
    case 'coronation': {
      if (data.d) {
        const o = this.char(data.d); if (!o) return '';
        if (c === 'demand') { if (p.stats.cha + p.fame / 10 + this.r() * 12 > o.stats.cha + 8) { o.loyalty = Math.min(100, (o.loyalty || 50) + 25); this.opine(o, p, 10); p.fame += 3; return `${o.name} meets your eyes, then kneels. The hall breathes again.`; } this.opine(o, p, -20); o.loyalty = Math.max(0, (o.loyalty || 50) - 15); return `${o.name} turns and walks out. This is not over.`; }
        if (c === 'strip') { o.titles.rank = null; o.loyalty = Math.max(0, (o.loyalty || 50) - 30); this.opine(o, p, -40); for (const g of guests) if (g !== o) g.loyalty = Math.min(100, (g.loyalty || 60) + 5); return `${o.name} is stripped of rank before the court. No one else hesitates to kneel.`; }
        p.fame -= 1; return 'You laugh it off. Some admire your calm; others see weakness.';
      }
      if (c === 'gifts' && r && r.treasury >= 50) { r.treasury -= 50; for (const g of guests) { g.loyalty = Math.min(100, (g.loyalty || 60) + 10); this.opine(g, p, 10); } return 'Every officer leaves with a gift and a warmer heart.'; }
      if (c === 'alms' && r && r.treasury >= 30) { r.treasury -= 30; for (const s of this.realmSetts(r)) s.unrest = Math.max(0, s.unrest - 8); p.fame += 2; return 'Silver rains on the crowd. They cheer your name.'; }
      return 'A plain ceremony, and an honest one.';
    }
    case 'wedding': {
      const a = this.char(data.a), b = this.char(data.b);
      if (c === 'lavish' && this.pay(60)) { p.fame += 5; if (a && b) { this.opine(a, b, 15); this.opine(b, a, 15); } for (const g of guests) this.opine(g, p, 8); return 'The feast is talked about for years.'; }
      if (c === 'rivals' && this.pay(40)) { const foe = Object.entries(p.rel).filter(([, v]) => v < -20).map(([id]) => this.char(+id)).find(x => x && x.alive); if (foe) { this.opine(foe, p, 25); this.opine(p, foe, 10); return `${foe.name} comes, eats your bread and drinks your wine. Old grudges soften a little.`; } p.fame += 2; return 'Your rivals come, and behave. Mostly.'; }
      if (a && b) { this.opine(a, b, 5); this.opine(b, a, 5); } return 'A simple, happy day.';
    }
    case 'funeral': {
      const dead = this.char(data.c);
      if (c === 'grand' && this.pay(50)) { p.fame += 3; if (r) for (const s of this.realmSetts(r)) s.unrest = Math.max(0, s.unrest - 5); for (const g of guests) this.opine(g, p, 5); return `${dead ? dead.name : 'They'} are mourned across the land.`; }
      if (c === 'vow') { p.fame += 2; for (const g of guests) this.opine(g, p, 4); this.you(`Over the grave of ${dead ? dead.name : 'the fallen'}, you swear vengeance. The court will hold you to it.`, [], 2); return 'Your oath is heard by all.'; }
      return 'A quiet burial among family.';
    }
    case 'oath': {
      const o = this.char(data.o); if (!o) return '';
      if (c === 'blood') { this.opine(o, p, 20); this.opine(p, o, 20); if (o.loyalty != null) o.loyalty = Math.min(100, o.loyalty + 10); return 'Blood mingles. Nothing will part you now but death.'; }
      return 'Your word is your bond.';
    }
    case 'knighting': {
      const o = this.char(data.c); if (!o) return '';
      if (c === 'horse' && this.pay(30)) { o.loyalty = Math.min(100, (o.loyalty || 60) + 15); this.opine(o, p, 15); o.fame += 2; return `${o.name} rides out on a warhorse fit for a king, and the whole court sees your generosity.`; }
      o.loyalty = Math.min(100, (o.loyalty || 60) + 5); return `${o.name} rises, honoured.`;
    }
    case 'feast': {
      if (data.incident) {
        const o = this.char(data.o); if (!o) return '';
        if (c === 'duel') { const mine = p.stats.mig + this.r() * 12, theirs = o.stats.mig + this.r() * 12; if (mine >= theirs) { p.fame += 5; this.opine(o, p, -10); o.loyalty = Math.max(0, (o.loyalty || 50) - 5); this.you(`You beat ${o.name} in a duel before your whole court.`, [o.id], 2); return `${o.name} yields, bleeding. No one mocks you again tonight.`; } p.wounded = 2; p.fame -= 2; this.you(`${o.name} beats you in a duel at your own feast.`, [o.id], 2); return 'You lose, before everyone. The wound to your pride is worse than the cut.'; }
        if (c === 'wit') { if (p.stats.cha + this.r() * 12 > 12) { p.fame += 2; this.opine(o, p, 5); return 'Your jest brings the house down, and they laugh with you.'; } p.fame -= 1; return 'Your jest falls flat. The silence is worse than the insult.'; }
        this.opine(o, p, -30); o.loyalty = Math.max(0, (o.loyalty || 50) - 15); return `${o.name} is dragged out. Some of their friends leave with them.`;
      }
      if (c === 'toast') { for (const g of guests) { g.loyalty = Math.min(100, (g.loyalty || 60) + 5); this.opine(g, p, 5); } return 'Your officers roar your name.'; }
      if (c === 'heir' && r) { const h = this.char(r.heirId); if (h) { for (const g of guests) this.opine(g, h, 10); return `The court cheers ${h.name}, your heir.`; } return 'You have no heir to present.'; }
      p.fame += 1; return 'A good night, long remembered.';
    }
  }
  return '';
}
