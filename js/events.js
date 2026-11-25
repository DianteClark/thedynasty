// 2.6 Road encounters, petitions at court, and the small happenings of camp life.
// Each event is a decision card. They keep a quiet month from being an empty one.

const COVERS = ['pilgrims', 'a tinker and his mule', 'a band of minstrels', 'refugees from the north', 'a priest of the old gods', 'salt traders'];

export function installEvents(World) {
  const P = World.prototype;
  // your purse: the realm's treasury if you rule, your own gold otherwise
  P.purse = function () { const r = this.playerRules() ? this.playerRealm() : null; return r ? r.treasury : (this.player.gold || 0); };
  P.pay = function (n) { const r = this.playerRules() ? this.playerRealm() : null; if (this.purse() < n) return false; if (r) r.treasury -= n; else this.player.gold = (this.player.gold || 0) - n; return true; };
  P.earn = function (n) { const r = this.playerRules() ? this.playerRealm() : null; if (r) r.treasury += n; else this.player.gold = (this.player.gold || 0) + n; };

  P.eventsTick = function () {
    const p = this.player; if (!p || !p.alive || p.prisonerOf || this.gameOver) return;
    const pending = (this.decisions || []).filter(d => d.kind === 'event').length;
    if (pending >= 2) return;
    const prev = this._prev && this._prev.get('p' + p.id); const moved = prev && Math.hypot(p.x - prev[0], p.y - prev[1]) > 1;
    const where = p.task || p.atSea || moved ? 'road' : this.atSeat() ? 'court' : 'camp';
    const chance = { road: 0.5, court: 0.4, camp: 0.3 }[where];
    if (!this.chance(chance)) return;
    const pool = EVENTS.filter(e => e.where === where && !(this.recentKeys && this.recentKeys['ev:' + e.id] > this.monthIndex - (e.cooldown || 18)));
    const ok = []; for (const e of pool) { const data = e.when.call(this); if (data) ok.push([e, data]); }
    if (!ok.length) return;
    let tot = ok.reduce((a, [e]) => a + (e.weight || 1), 0), roll = this.r() * tot, pick = ok[0];
    for (const x of ok) { roll -= x[0].weight || 1; if (roll <= 0) { pick = x; break; } }
    const [e, data] = pick; const spec = e.make.call(this, data);
    this.offer({ kind: 'event', ev: e.id, key: 'ev:' + e.id, court: where === 'court', months: e.months || (where === 'road' ? 1 : 2), ...spec, data });
  };
}

// the handler for every event card
export function resolveEvent(d, choice) { const e = EVENTS.find(x => x.id === d.ev); return e ? e.resolve.call(this, d.data, choice, d) : ''; }

const opts = (...xs) => xs.map(([id, label]) => ({ id, label }));
const near = (w, p, list, R) => list.filter(x => Math.hypot(x.x - p.x, x.y - p.y) < R).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));

const EVENTS = [
  // ---------------- on the road ----------------
  {
    id: 'toll', where: 'road', weight: 1.3,
    when() { const p = this.player; if (p.atSea) return null; const b = near(this, p, this.living().filter(x => x.role === 'bandit'), 6)[0]; return b ? { b: b.id, toll: 10 + Math.round(b.band / 2) } : null; },
    make({ b, toll }) { const B = this.char(b); return { who: b, title: 'A toll on the road', text: `${B.name} and ${B.band} cutthroats block the road. “${toll} gold and you ride on. Otherwise...”`, options: opts(['pay', `Pay ${toll} gold`], ['fight', 'Fight your way through'], ['around', 'Turn back and go around (a month lost)']), def: 'around' }; },
    resolve({ b, toll }, c) {
      const p = this.player, B = this.char(b);
      if (c === 'pay') { if (!this.pay(toll)) { this.skirmish(B, true); return 'You cannot pay. They attack!'; } B.band += 2; return `You pay ${toll} gold. The bandits laugh you through.`; }
      if (c === 'fight' && B && B.alive) { this.skirmish(B, false); return 'You draw steel.'; }
      p.delayed = (p.delayed || 0) + 1; return 'You turn back and take the long way around.';
    },
  },
  {
    id: 'knight', where: 'road', weight: 1,
    when() { return this.player.atSea ? null : { k: 1 }; },
    make() { const c = this.makeChar({ culture: this.player.culture, age: this.ri(24, 45), role: 'vagabond' }); c.wounded = 4; c.x = this.player.x; c.y = this.player.y; return { who: c.id, title: 'A wounded knight', text: `${c.name} lies by the road, cut down by brigands. “Water... and a cart to the next town, and I'll not forget it.”`, options: opts(['help', 'Tend their wounds (a month lost)'], ['rob', 'Take their purse'], ['pass', 'Ride on']), def: 'pass', data2: c.id }; },
    resolve(_, c, d) {
      const p = this.player, k = this.char(d.who);
      if (!k) return '';
      if (c === 'help') { p.delayed = (p.delayed || 0) + 1; this.opine(k, p, 60); p.fame += 2; if (p.role === 'vagabond' && this.chance(0.6)) { k.companionOf = p.id; k.wounded = 0; this.you(`${k.name} recovers under your care and swears to ride with you.`, [k.id], 2); return `${k.name} joins you.`; } this.you(`You nurse ${k.name} back to health. They will remember you.`, [k.id], 1); return 'You stay until they can stand.'; }
      if (c === 'rob') { const g = this.ri(15, 40); this.earn(g); this.spreadRumor(p, 'brigand', 2); this.opine(k, p, -80); return `You take ${g} gold from a dying man. People will talk.`; }
      return 'You ride on.';
    },
  },
  {
    id: 'pilgrims', where: 'road', weight: 1.2,
    when() { const far = this.realmList().filter(r => !this.knowsRealm(r) && r.tier !== 'Village'); return far.length ? { r: this.pick(far).id, cover: this.pick(COVERS) } : null; },
    make({ r, cover }) { return { title: 'Travelers with news', text: `You share a fire with ${cover}. They have walked far, and they talk of distant lands and the lords who rule them.`, options: opts(['listen', 'Listen to their tales'], ['coin', 'Pay 5 gold for a rough map'], ['leave', 'Keep to yourself']), def: 'leave' }; },
    resolve({ r }, c) {
      const R = this.realm(r); if (!R) return '';
      if (c === 'listen' || c === 'coin') {
        if (this.kn) { this.kn.realms[R.id] = 1; if (R.rulerId) this.kn.chars[R.rulerId] = 1; }
        if (c === 'coin' && this.pay(5)) { const cap = this.sett(R.capital); if (cap) this.reveal(cap.x, cap.y, 6); this.you(`The map is crude but true: it shows ${R.name} and the road to ${cap ? cap.name : 'its seat'}.`, [], 1); return `You learn of ${R.name}, and now it's on your map.`; }
        const ruler = this.char(R.rulerId); this.you(`The travelers tell of ${R.name}, ruled by ${ruler ? this.fullName(ruler) : 'no one'}.`, ruler ? [ruler.id] : [], 1);
        return `You learn of ${R.name}.`;
      }
      return 'You sleep with one hand on your blade.';
    },
  },
  {
    id: 'sighting', where: 'road', weight: 0.9,
    when() { const p = this.player; if (p.atSea) return null; const L = near(this, p, this.lairs.filter(l => l.alive && !this.charted(l.x, l.y)), 14)[0]; return L ? { L: L.id } : null; },
    make({ L }) { const lr = this.lairs.find(l => l.id === L); return { title: 'Tracks in the mud', text: `Huge tracks cross the road, and a shepherd swears he saw ${this.lairName(lr)} not far from here.`, options: opts(['scout', 'Follow the tracks and mark the lair'], ['warn', 'Warn the nearest village'], ['go', 'Hurry on']), def: 'go' }; },
    resolve({ L }, c) {
      const lr = this.lairs.find(l => l.id === L); if (!lr) return '';
      if (c === 'scout') { this.reveal(lr.x, lr.y, 3); this.player.fame += 1; if (this.chance(0.15)) { this.player.wounded = 3; return 'You find the lair, and it finds you. You escape, bleeding.'; } return `You mark the lair of ${this.lairName(lr)} on your map.`; }
      if (c === 'warn') { const s = near(this, lr, this.setts.filter(x => !x.destroyed), 12)[0]; if (s) { s.unrest = Math.max(0, s.unrest - 5); this.player.fame += 1; return `${s.name} thanks you and doubles its watch.`; } }
      return 'You hurry on.';
    },
  },
  {
    id: 'storm', where: 'road', weight: 1.4, months: 1,
    when() { return this.player.atSea ? { k: 1 } : null; },
    make() { return { title: 'Storm at sea', text: 'Black clouds roll in and the captain looks grim. “We can run for the nearest cove and wait it out, or hold our course and pray.”', options: opts(['shelter', 'Shelter in a cove (a month lost)'], ['hold', 'Hold the course']), def: 'hold' }; },
    resolve(_, c) {
      const p = this.player;
      if (c === 'shelter') { p.delayed = (p.delayed || 0) + 1; return 'You ride out the storm in a quiet cove.'; }
      if (this.chance(0.35)) { const lost = Math.round((p.followers || 0) * 0.3); p.followers = Math.max(0, (p.followers || 0) - lost); const g = Math.min(this.purse(), this.ri(5, 25)); this.pay(g); this.you(`The storm nearly sinks you. ${lost ? `${lost} of your people are lost overboard, and ` : ''}${g} gold goes to the bottom.`, [], 2); return 'The sea takes its toll.'; }
      return 'The ship groans, but holds. You make good time.';
    },
  },
  {
    id: 'hungry', where: 'road', weight: 1,
    when() { const p = this.player; if (p.atSea) return null; const s = near(this, p, this.setts.filter(x => x.famine && !x.destroyed), 8)[0]; return s ? { s: s.id } : null; },
    make({ s }) { const S = this.sett(s); return { title: `Hunger in ${S.name}`, text: `The road runs through ${S.name}, where gaunt children watch you pass. A woman begs for anything you can spare.`, options: opts(['give', 'Give 15 gold for food'], ['pass', 'Ride through']), def: 'pass' }; },
    resolve({ s }, c) { const S = this.sett(s); if (c === 'give' && S && this.pay(15)) { S.food += S.pop * 0.05; S.unrest = Math.max(0, S.unrest - 8); this.player.fame += 2; this.spreadRumor(this.player, 'merciful', 1); return `${S.name} will remember your kindness.`; } return 'You ride through without looking back.'; },
  },
  // ---------------- at court ----------------
  {
    id: 'alliance', where: 'court', weight: 1,
    when() { const r = this.playerRealm(); const o = this.neighbours(r, 14).find(x => !r.allies.has(x.id) && !this.atWar(r, x) && x.tier !== 'Village' && this.char(x.rulerId)); return o ? { o: o.id } : null; },
    make({ o }) { const O = this.realm(o), ru = this.char(O.rulerId); return { who: ru.id, title: `An envoy from ${O.name}`, text: `An envoy of ${this.fullName(ru)} kneels in your hall. “My lord offers friendship and an alliance between our houses: what threatens one, threatens both.”`, options: opts(['yes', 'Accept the alliance'], ['no', 'Decline politely'], ['insult', 'Send the envoy home in disgrace']), def: 'no' }; },
    resolve({ o }, c) {
      const r = this.playerRealm(), O = this.realm(o), ru = O && this.char(O.rulerId); if (!O || !ru) return '';
      if (c === 'yes') { r.allies.add(O.id); O.allies.add(r.id); this.opine(ru, this.player, 25); this.you(`You and ${this.fullName(ru)} of ${O.name} swear alliance.`, [ru.id], 2); return `${O.name} is now your ally.`; }
      if (c === 'insult') { this.opine(ru, this.player, -50); this.spreadRumor(this.player, 'butcher', 1); return `${O.name} will not forget the insult.`; }
      this.opine(ru, this.player, -5); return 'The envoy leaves with nothing.';
    },
  },
  {
    id: 'guild', where: 'court', weight: 1,
    when() { const r = this.playerRealm(); return r.tier !== 'Village' ? { g: this.ri(8, 16) } : null; },
    make({ g }) { return { title: 'The merchants’ guild', text: `The guild masters ask for the right to trade free of tolls in your towns. They promise ${g} gold a season in fees, but the town craftsmen will grumble at the competition.`, options: opts(['grant', 'Grant the charter'], ['refuse', 'Refuse']), def: 'refuse' }; },
    resolve({ g }, c) {
      if (c !== 'grant') return 'The guild masters bow stiffly and leave.';
      const r = this.playerRealm(); for (let k = 1; k <= 8; k++) this.later(k * 3, { kind: 'gold', realm: r.id, n: g });
      for (const s of this.realmSetts(r)) s.unrest += 4;
      return `The charter is sealed: ${g} gold a season for two years.`;
    },
  },
  {
    id: 'accused', where: 'court', weight: 1.1,
    when() { const r = this.playerRealm(); const o = this.realmOfficers(r).filter(x => !this.isPlayer(x)); return o.length ? { o: this.pick(o).id } : null; },
    make({ o }) { const O = this.char(o); const s = this.pick(this.realmSetts(this.playerRealm())); return { who: o, title: 'A peasant’s accusation', text: `A farmer from ${s ? s.name : 'your lands'} stands before you, cap in hand: “${O.name}'s soldiers took our seed grain and beat my son.” ${O.name} scoffs at the charge.`, options: opts(['punish', `Fine ${O.name} and repay the village`], ['dismiss', 'Dismiss the peasant'], ['inquire', 'Order an inquiry']), def: 'dismiss', data2: s && s.id }; },
    resolve({ o }, c) {
      const O = this.char(o), r = this.playerRealm(); if (!O) return '';
      if (c === 'punish') { O.loyalty = Math.max(0, (O.loyalty || 60) - 15); this.opine(O, this.player, -25); for (const s of this.realmSetts(r)) s.unrest = Math.max(0, s.unrest - 6); this.player.fame += 2; return `Justice is done. ${O.name} seethes, but the villages cheer.`; }
      if (c === 'inquire') { if (this.player.stats.int + this.r() * 10 > 12) { O.loyalty = Math.max(0, (O.loyalty || 60) - 5); for (const s of this.realmSetts(r)) s.unrest = Math.max(0, s.unrest - 3); return 'The inquiry finds a few guilty soldiers. They are flogged, and both sides are satisfied.'; } return 'The inquiry finds nothing, and no one is satisfied.'; }
      for (const s of this.realmSetts(r)) s.unrest += 5; this.opine(O, this.player, 5); return 'The peasant is thrown out. Word spreads.';
    },
  },
  {
    id: 'feud', where: 'court', weight: 0.9,
    when() { const r = this.playerRealm(); const o = this.realmOfficers(r).filter(x => !this.isPlayer(x)); if (o.length < 2) return null; const a = this.pick(o), b = this.pick(o.filter(x => x !== a)); return { a: a.id, b: b.id }; },
    make({ a, b }) { const A = this.char(a), B = this.char(b); return { who: a, title: 'A quarrel among your officers', text: `${A.name} and ${B.name} nearly came to blows at your table over who should lead the vanguard. Both look to you.`, options: opts(['a', `Favour ${A.name}`], ['b', `Favour ${B.name}`], ['peace', 'Order them to make peace']), def: 'peace' }; },
    resolve({ a, b }, c) {
      const A = this.char(a), B = this.char(b), p = this.player; if (!A || !B) return '';
      if (c === 'a' || c === 'b') { const W = c === 'a' ? A : B, L = c === 'a' ? B : A; this.opine(W, p, 15); this.opine(L, p, -20); L.loyalty = Math.max(0, (L.loyalty || 60) - 10); this.opine(L, W, -30); return `${W.name} leads the vanguard. ${L.name} will remember.`; }
      if (p.stats.cha + this.r() * 10 > 13) { this.opine(A, B, 20); this.opine(B, A, 20); return 'They clasp hands, grudgingly, under your eye.'; }
      this.opine(A, B, -20); this.opine(B, A, -20); return 'They bow to you and glare at each other. This is not over.';
    },
  },
  {
    id: 'hero', where: 'court', weight: 0.8,
    when() { const r = this.playerRealm(); const v = this.living().find(x => x.role === 'vagabond' && !this.isPlayer(x) && !x.companionOf && x.fame > 8 && this.age(x) >= 18 && this.realmSetts(r).some(s => this.dist(s, x) < 10)); return v ? { v: v.id } : null; },
    make({ v }) { const V = this.char(v); return { who: v, title: 'A sword for hire', text: `${this.fullName(V)}, a wanderer of some renown (Leadership ${V.stats.lea}, Might ${V.stats.mig}), offers their service. “Forty gold and a banner to carry.”`, options: opts(['yes', 'Take them into service (40 gold)'], ['no', 'Send them on their way']), def: 'no' }; },
    resolve({ v }, c) { if (c !== 'yes') return 'The wanderer shrugs and moves on.'; return this.act_recruit({ id: v }); },
  },
  {
    id: 'shrine', where: 'court', weight: 0.7,
    when() { return { k: 1 }; },
    make() { return { title: 'A shrine for the people', text: 'The village elders ask you to pay for a shrine where the harvest gods can be honoured. “Sixty gold, and the people will bless your name.”', options: opts(['yes', 'Build the shrine (60 gold)'], ['no', 'The gods can wait']), def: 'no' }; },
    resolve(_, c) { if (c === 'yes') { if (!this.pay(60)) return 'The treasury cannot spare it.'; for (const s of this.realmSetts(this.playerRealm())) s.unrest = Math.max(0, s.unrest - 10); this.player.fame += 3; return 'The shrine rises, and the people are calmer for it.'; } return 'The elders go home disappointed.'; },
  },
  {
    id: 'refugees', where: 'court', weight: 0.9,
    when() { const r = this.playerRealm(); const ruin = this.setts.find(s => s.destroyed && this.realmSetts(r).some(x => this.dist(x, s) < 14)); return ruin ? { from: ruin.name, n: this.ri(60, 160) } : null; },
    make({ from, n }) { return { title: 'Refugees at the gate', text: `${n} ragged survivors of ${from} wait outside your walls. They have nothing, but they have hands to work the fields.`, options: opts(['take', 'Take them in'], ['turn', 'Turn them away']), def: 'turn' }; },
    resolve({ n }, c) { const r = this.playerRealm(); const cap = this.sett(r.capital); if (c === 'take' && cap) { cap.pop += n; cap.food -= n * 0.3; this.player.fame += 2; this.spreadRumor(this.player, 'merciful', 1); return `${n} new people settle in ${cap.name}. Food will be tight for a while.`; } return 'The gates stay shut.'; },
  },
  {
    id: 'bandit_oath', where: 'court', weight: 0.6,
    when() { const r = this.playerRealm(); const b = this.living().find(x => x.role === 'bandit' && x.band > 15 && this.realmSetts(r).some(s => this.dist(s, x) < 10)); return b ? { b: b.id } : null; },
    make({ b }) { const B = this.char(b); return { who: b, title: 'A bandit’s bargain', text: `The bandit chief ${B.name} comes under a flag of truce with ${B.band} men. “Pardon us, give us a banner, and we'll fight for you instead of robbing your roads.”`, options: opts(['pardon', 'Pardon them and take them into service'], ['hang', 'Seize and hang them'], ['send', 'Send them away']), def: 'send' }; },
    resolve({ b }, c) {
      const B = this.char(b), r = this.playerRealm(); if (!B || !B.alive) return '';
      if (c === 'pardon') { this.addOfficer(r, B); B.army = { size: B.band * 2, level: 2, xp: 0, wins: 0, losses: 0, faction: B.culture, unit: this.pickUnit(B, B.culture) }; B.band = 0; return `${B.name} kneels and swears to serve.`; }
      if (c === 'hang') { if (this.chance(0.7)) { this.die(B, 'hanged for banditry'); this.spreadRumor(this.player, 'butcher', 1); return 'The bandit hangs. Some call it justice; others call it treachery under a truce.'; } return `${B.name} smells the trap and escapes.`; }
      return 'They ride off, back to the roads.';
    },
  },
  // ---------------- camp life (vagabonds and officers) ----------------
  {
    id: 'patron', where: 'camp', weight: 1,
    when() { const s = this.sett(this.player.settId); return s && !s.destroyed ? { s: s.id, g: this.ri(20, 45) } : null; },
    make({ s, g }) { return { title: 'A merchant’s offer', text: `A merchant of ${this.sett(s).name} needs a guard for a wagon of wine bound for the next town. “${g} gold, half now, half when we arrive.”`, options: opts(['yes', 'Take the job (a month)'], ['no', 'Not today']), def: 'no' }; },
    resolve({ g }, c) { if (c !== 'yes') return 'The merchant finds someone else.'; if (this.chance(0.2)) { this.earn(Math.round(g / 2)); this.player.wounded = 2; return 'Brigands hit the wagon. You drive them off, but take a wound, and the merchant pays only half.'; } this.earn(g); this.player.fame += 1; return `An easy road. You earn ${g} gold.`; },
  },
  {
    id: 'brawl', where: 'camp', weight: 0.8,
    when() { return { k: 1 }; },
    make() { return { title: 'Trouble in the tavern', text: 'A drunken mercenary spills ale on you and laughs. The whole tavern goes quiet, waiting to see what you do.', options: opts(['fight', 'Knock him down'], ['laugh', 'Laugh it off and buy a round (5 gold)'], ['leave', 'Walk out']), def: 'leave' }; },
    resolve(_, c) {
      const p = this.player;
      if (c === 'fight') { if (p.stats.mig + this.r() * 10 > 11) { p.fame += 2; return 'One punch. The tavern roars, and the story spreads.'; } p.wounded = 1; return 'He was bigger than he looked. You wake up in the street.'; }
      if (c === 'laugh' && this.pay(5)) { p.fame += 1; return 'The tavern cheers you. You make a few friends tonight.'; }
      return 'You leave. Someone sniggers behind you.';
    },
  },
  {
    id: 'orders', where: 'camp', weight: 1.2,
    when() { const p = this.player; if (p.role !== 'officer') return null; const r = this.playerRealm(); const ru = r && this.char(r.rulerId); return ru && !this.isPlayer(ru) ? { ru: ru.id } : null; },
    make({ ru }) { const R = this.char(ru); const task = this.pick(['escort the tax wagons through the hills', 'hunt down the brigands troubling the border villages', 'drill the new levies before the spring']); return { who: ru, title: 'Orders from your lord', text: `${this.fullName(R)} summons you: “I need you to ${task}.”`, options: opts(['obey', 'Obey'], ['refuse', 'Refuse']), def: 'refuse', data2: task }; },
    resolve({ ru }, c) {
      const R = this.char(ru), p = this.player; if (!R) return '';
      if (c === 'obey') { this.opine(R, p, 10); p.loyalty = Math.min(100, (p.loyalty || 60) + 5); this.gainXp(p, 30); if (p.army) p.army.xp += 15; p.gold = (p.gold || 0) + 15; return 'You carry out your orders. Your lord is pleased.'; }
      this.opine(R, p, -25); p.loyalty = Math.max(0, (p.loyalty || 60) - 10); return 'Your lord says nothing, but the court notices.';
    },
  },
  {
    id: 'dice', where: 'camp', weight: 0.9,
    when() { return this.purse() >= 10 ? { k: 1 } : null; },
    make() { return { title: 'Dice by the fire', text: 'The soldiers are throwing dice and the pot is getting big. “Care to try your luck?”', options: opts(['small', 'Stake 10 gold'], ['big', 'Stake 30 gold'], ['no', 'Just watch']), def: 'no' }; },
    resolve(_, c) { if (c === 'no') return 'You watch someone else lose their boots.'; const n = c === 'big' ? 30 : 10; if (!this.pay(n)) return 'You can\u2019t cover the stake.'; if (this.chance(0.47)) { this.earn(n * 2); return `The dice love you tonight. You win ${n} gold.`; } return `The dice turn on you. ${n} gold gone.`; },
  },
  {
    id: 'veterans', where: 'camp', weight: 0.8,
    when() { return this.player.army ? { k: 1 } : null; },
    make() { return { title: 'Old soldiers', text: 'A pair of grey-bearded veterans offer to drill your troops the old way, hard and long. “Twenty gold and a month of your men\u2019s sweat.”', options: opts(['yes', 'Hire them (20 gold)'], ['no', 'Your men are fine']), def: 'no' }; },
    resolve(_, c) { const p = this.player; if (c !== 'yes' || !this.pay(20)) return 'The veterans move on.'; this.armyXp(p, 40); return 'Your troops curse the veterans, and fight better for it.'; },
  },
  {
    id: 'gift', where: 'camp', weight: 0.7,
    when() { const r = this.playerRealm(); const o = r && this.realmOfficers(r).filter(x => !this.isPlayer(x) && x.id !== r.rulerId); return o && o.length ? { o: this.pick(o).id } : null; },
    make({ o }) { const O = this.char(o); return { who: o, title: `A gift from ${O.name}`, text: `${O.name} sends you a fine blade with a note: “To a brother in arms. May we stand together when the court chooses its favourites.”`, options: opts(['accept', 'Accept and send thanks'], ['return', 'Return it politely']), def: 'accept' }; },
    resolve({ o }, c) { const O = this.char(o), p = this.player; if (!O) return ''; if (c === 'accept') { this.opine(O, p, 15); this.opine(p, O, 15); return `You and ${O.name} grow closer.`; } this.opine(O, p, -10); return `${O.name} takes the blade back with a stiff smile.`; },
  },
];
