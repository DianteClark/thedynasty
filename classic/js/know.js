// 2.3 What you know: a cartographer's map of the land you've seen, and the realms, people and titles you've heard of.
// Everything here is about the player. Before you arrive (history), or in a save from before 2.3, you know everything.

const SIGHT = 6, SEA_SIGHT = 7, LOCALS = 10;

export function installKnowledge(World) {
  const P = World.prototype;

  P.initKnowledge = function () {
    this.known = new Array(this.w * this.h).fill(0);
    this.kn = { chars: {}, realms: {}, titles: {} };
    this.knownRev = (this.knownRev || 0) + 1;
    const p = this.player; if (!p) return;
    // what anyone would know: the great kingdoms of the age and the most famous names
    for (const r of this.realmList()) if (r.tier === 'Kingdom' || r.fame > 30) { this.kn.realms[r.id] = 1; if (r.rulerId) this.kn.chars[r.rulerId] = 1; }
    const sh = this.char(this.unique.strongest); if (sh && sh.alive) { this.kn.chars[sh.id] = 1; this.kn.titles[sh.id] = 1; }
    this.reveal(p.x, p.y, LOCALS);
    const s = this.sett(p.settId); if (s) this.learnLocals(s);
    this.knowledgeTick();
  };

  P.charted = function (x, y) {
    if (!this.known) return true;
    const i = Math.max(0, Math.min(this.h - 1, Math.round(y))) * this.w + Math.max(0, Math.min(this.w - 1, Math.round(x)));
    return this.known[i] === 1;
  };
  P.reveal = function (x, y, R) {
    if (!this.known) return;
    let n = 0; const cx = Math.round(x), cy = Math.round(y);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy > R * R + R) continue;
      const xx = cx + dx, yy = cy + dy; if (xx < 0 || yy < 0 || xx >= this.w || yy >= this.h) continue;
      const i = yy * this.w + xx; if (!this.known[i]) { this.known[i] = 1; n++; }
    }
    if (n) this.knownRev = (this.knownRev || 0) + 1;
  };
  // a disaster changed the land: your old maps of it are wrong now
  P.refog = function (x, y, R, what) {
    if (!this.known) return;
    let n = 0;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const xx = Math.round(x) + dx, yy = Math.round(y) + dy; if (xx < 0 || yy < 0 || xx >= this.w || yy >= this.h) continue;
      const i = yy * this.w + xx; if (this.known[i]) { this.known[i] = 0; n++; }
    }
    if (n > 6 && this.player && this.player.alive) { this.knownRev++; this.you(`Travelers bring word of ${what} near ${this.placeNear(x, y)}. The land there has changed, and your maps of it can no longer be trusted.`, [], 1); }
  };
  P.placeNear = function (x, y) { const s = this.setts.slice().sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0]; return s ? s.name : 'the wilds'; };

  // locals tell you about the realms around them
  P.learnLocals = function (s) {
    if (!this.kn) return;
    for (const o of this.setts) if (!o.destroyed && this.dist(o, s) < 16) { const r = this.realm(o.realmId); if (r && r.alive) { this.kn.realms[r.id] = 1; if (r.rulerId) this.kn.chars[r.rulerId] = 1; } }
  };
  // your spies bring back the names, armies and titles of a whole court
  P.learnCourt = function (r) {
    if (!this.kn || !r) return;
    this.kn.realms[r.id] = 1;
    for (const c of this.realmOfficers(r)) { this.kn.chars[c.id] = 1; this.kn.titles[c.id] = 1; }
    if (r.rulerId) { this.kn.chars[r.rulerId] = 1; this.kn.titles[r.rulerId] = 1; }
    if (r.heirId) this.kn.chars[r.heirId] = 1;
  };

  P.knowledgeTick = function () {
    const p = this.player; if (!this.known || !p || !p.alive) return;
    // what you see as you go
    const prev = this._prev && this._prev.get('p' + p.id);
    const R = p.atSea ? SEA_SIGHT : SIGHT;
    if (prev) { const steps = Math.ceil(Math.hypot(p.x - prev[0], p.y - prev[1]) / 3); for (let k = 0; k <= steps; k++) this.reveal(prev[0] + (p.x - prev[0]) * k / Math.max(1, steps), prev[1] + (p.y - prev[1]) * k / Math.max(1, steps), R); }
    else this.reveal(p.x, p.y, R);
    // your own lands are well charted
    const pr = this.playerRealm && this.playerRealm();
    if (pr) {
      const mine = new Set(this.realmSetts(pr).map(s => s.id)); let n = 0;
      for (let i = 0; i < this.terr.length; i++) if (mine.has(this.terr[i]) && !this.known[i]) { this.known[i] = 1; n++; }
      if (n) this.knownRev++;
      this.kn.realms[pr.id] = 1;
      for (const c of this.realmOfficers(pr)) { this.kn.chars[c.id] = 1; this.kn.titles[c.id] = 1; }
      for (const w of this.wars) if (!w.over && (w.a === pr.id || w.b === pr.id)) { const o = this.realm(w.a === pr.id ? w.b : w.a); if (o) { this.kn.realms[o.id] = 1; if (o.rulerId) this.kn.chars[o.rulerId] = 1; } }
    }
    // your agents chart the roads they travel
    for (const a of this.agents || []) if (pr && a.owner === pr.id) this.reveal(a.x, a.y, 3);
    // a realm whose holdings you have seen is a realm you know
    for (const s of this.setts) if (!s.destroyed && this.known[s.y * this.w + s.x]) { const r = this.realm(s.realmId); if (r && r.alive && !this.kn.realms[r.id]) { this.kn.realms[r.id] = 1; if (r.rulerId) this.kn.chars[r.rulerId] = 1; } }
  };

  P.knowsRealm = function (r) {
    if (!this.kn || !r) return true;
    return !!this.kn.realms[r.id];
  };
  P.inYourCircle = function (c) {
    const p = this.player; if (!p) return false;
    if (c.id === p.id || c.companionOf === p.id || c.spouseId === p.id || p.children.includes(c.id) || p.parents.includes(c.id)) return true;
    const pr = this.playerRealm && this.playerRealm();
    return !!(pr && c.realmId === pr.id && c.alive);
  };
  P.knowsChar = function (c) {
    if (!this.kn || !c) return true;
    if (this.kn.chars[c.id] || this.inYourCircle(c) || c.fame >= 45) return true;
    const r = this.realm(c.realmId);
    return !!(r && (r.rulerId === c.id) && this.kn.realms[r.id]);
  };
  // titles held by the living have to be discovered: by meeting them, hearing of their deeds, or spying on their court
  P.knowsTitles = function (c) {
    if (!this.kn || !c) return true;
    return !c.alive || !!this.kn.titles[c.id] || this.inYourCircle(c);
  };
  // which Chronicle entries reach you: great news travels everywhere, the rest only if it's about someone you know
  P.seesEntry = function (e) {
    if (!this.kn) return true;
    if (e.type === 'you' || e.importance >= 3) return true;
    if (this.playerId && e.ids.includes(this.playerId)) return true;
    if (e.ids.length) return e.ids.some(id => this.knowsChar(this.char(id)));
    return e.importance >= 2;
  };
  // called for each new Chronicle entry once you're in the world
  P.hear = function (e) {
    if (!this.kn || !this.playerId) return;
    if (!this.seesEntry(e)) return;
    const met = e.ids.includes(this.playerId);
    for (const id of e.ids) { this.kn.chars[id] = 1; if (met || ['duel', 'tournament', 'contract', 'monster'].includes(e.type)) this.kn.titles[id] = 1; }
  };
}
