// The Dynasty — battle engine. No DOM here: pure simulation.
// Divisions of soldiers fight on a battle map. Orders travel by messenger, morale decides who breaks.

export const FIELD = { w: 1600, h: 1000 };

import { UNITS } from '../assets/units/units.js';
export { UNITS };

const ROLE = {
  inf: { hp: 10, atk: 2.0, def: 1.0, spd: 24, range: 0, cd: 1.0, label: 'Infantry' },
  heavy: { hp: 17, atk: 2.8, def: 1.8, spd: 17, range: 0, cd: 1.2, label: 'Heavy infantry' },
  ranged: { hp: 7, atk: 1.0, def: 0.6, spd: 22, range: 170, cd: 1.6, shot: 2.0, ammo: 0, label: 'Ranged' },
  magic: { hp: 7, atk: 1.0, def: 0.6, spd: 20, range: 140, cd: 2.0, shot: 3.0, ammo: 2, label: 'Spellcasters' },
  cav: { hp: 15, atk: 2.8, def: 1.2, spd: 46, range: 0, cd: 1.1, charge: 2.2, label: 'Cavalry' },
  flyer: { hp: 10, atk: 2.3, def: 0.9, spd: 40, range: 0, cd: 1.0, label: 'Fliers' },
};
export const ORDERS = {
  hold: 'Hold position', advance: 'Advance', charge: 'Charge', flankL: 'Flank left', flankR: 'Flank right', retreat: 'Fall back',
};

function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export class Battle {
  /**
   * cfg: { seed, terrain, season, sides: [ { faction, name, color, ai: null | 'reckless'|'balanced'|'cautious', canFire, mods: {morale, atk},
   *        divisions: [ { faction?, unit: index, count, level, officer: {name, stats:{lea,mig,int,cha}, ref} } ] } x2 ] }
   */
  constructor(cfg) {
    this.rand = mulberry(cfg.seed || 1);
    this.terrain = cfg.terrain || 'plains';
    this.t = 0; this.steps = 0; this.over = false; this.winner = null; this.events = [];
    this.script = (cfg.script || []).slice(); this.recorded = [];
    this.soldiers = []; this.divisions = []; this.projectiles = []; this.messengers = []; this.fires = []; this.corpses = [];
    this.cell = 32; this.gw = Math.ceil(FIELD.w / this.cell); this.gh = Math.ceil(FIELD.h / this.cell);
    this.season = cfg.season || 'Summer';
    this.sides = cfg.sides.map((s, i) => ({ ...s, index: i, dir: i === 0 ? 1 : -1, fireUsed: s.canFire === false, hq: { x: i === 0 ? 40 : FIELD.w - 40, y: FIELD.h / 2 } }));
    this.trees = [];
    const nTrees = { forest: 70, plains: 8, swamp: 22, wasteland: 6, tundra: 14, mountain: 18 }[this.terrain] || 8;
    for (let i = 0; i < nTrees; i++) this.trees.push({ x: 260 + this.r() * (FIELD.w - 520), y: 60 + this.r() * (FIELD.h - 120), alt: this.r() < 0.35 });
    const total = cfg.sides.reduce((a, sd) => a + sd.divisions.reduce((x, d) => x + d.count, 0), 0);
    this.inset = total < 250 ? 360 : 0; // small fights start closer together
    for (const side of this.sides) {
      const n = side.divisions.length;
      side.divisions.forEach((d, k) => {
        const faction = d.faction || side.faction;
        const def = UNITS[faction][d.unit];
        const role = def.role;
        const R = ROLE[role];
        const tier = this.unitTier(faction, d.unit);
        const lvl = 1 + 0.06 * ((d.level || 1) - 1);
        const mods = side.mods || {};
        const mult = (1 + 0.22 * tier) * lvl;
        const y = FIELD.h * (k + 1) / (n + 1);
        const x = side.index === 0 ? 260 + this.inset + (role === 'ranged' || role === 'magic' ? -60 : 0) : FIELD.w - 260 - this.inset - (role === 'ranged' || role === 'magic' ? -60 : 0);
        const div = {
          id: this.divisions.length, side: side.index, faction, unit: d.unit, unitName: def.name, role, R,
          stats: { hp: R.hp * mult * 2.6, atk: R.atk * mult * 0.5 * (mods.atk || 1), def: R.def * mult * 0.5, shot: (R.shot || 0) * mult * 0.6 * (mods.atk || 1), spd: R.spd * (this.season === 'Winter' ? 0.85 : 1), range: R.range, cd: R.cd },
          level: d.level || 1, officer: { ...d.officer, x: x - 34 * side.dir, y, hp: 90 + d.officer.stats.mig * 8, alive: true, captured: false },
          cx: x, cy: y, tx: x, ty: y, facing: side.dir, state: 'hold', pending: null, morale: 0, baseMorale: 52 + d.officer.stats.cha * 1.4 + d.officer.stats.lea * 0.6 + (d.level || 1) * 1.5 + (mods.morale || 0),
          start: d.count, dead: 0, fled: 0, routed: false, rallied: 0, flankPhase: 0, chargeT: 0, lastHit: -9, inCombat: false, contactT: 0, color: side.color,
        };
        div.morale = div.baseMorale;
        const cols = Math.max(6, Math.round(Math.sqrt(d.count * (role === 'cav' ? 1.2 : 2.2))));
        div.cols = cols; div.spacing = role === 'cav' || role === 'heavy' ? 15 : 12;
        div.soldiers = [];
        for (let i = 0; i < d.count; i++) {
          const s = { div, side: side.index, slot: i, x: 0, y: 0, hp: div.stats.hp, cd: this.r() * R.cd, target: null, anim: 0, at: this.r() * 4, dying: 0, alive: true, fled: false, vx: 0, vy: 0 };
          const p = this.slotPos(div, i); s.x = p.x + (this.r() - 0.5) * 4; s.y = p.y + (this.r() - 0.5) * 4;
          div.soldiers.push(s); this.soldiers.push(s);
        }
        this.divisions.push(div);
      });
    }
    this.log(`The battle begins on the ${this.terrain}.`, null);
  }

  r() { return this.rand(); }
  unitTier(f, u) {
    // how far along its upgrade line a unit sits, plus a bump for naturally strong units
    let depth = 0; for (let i = 0; i < 8; i++) { const prev = UNITS[f].findIndex(x => x.up === u); if (prev < 0) break; depth++; u = prev; }
    const base = UNITS[f].length === 7 ? Math.min(6, [0, 1, 2, 3, 4, 5, 6].indexOf(u)) * 0.5 : 1.5;
    return Math.min(6, depth * 2 + base);
  }
  log(text, side, kind = 'info') { this.events.push({ t: this.t, text, side, kind }); }
  aliveCount(div) { return div.soldiers.length - div.dead - div.fled; }
  centroid(div) {
    let x = 0, y = 0, n = 0;
    for (const s of div.soldiers) if (s.alive && !s.fled) { x += s.x; y += s.y; n++; }
    return n ? { x: x / n, y: y / n } : { x: div.cx, y: div.cy };
  }
  slotPos(div, i) {
    const cols = div.cols, rows = Math.ceil(div.soldiers ? div.start / cols : 1);
    const c = i % cols, r = Math.floor(i / cols);
    // rows run front to back along the facing direction; columns run up and down
    const along = -(r - (Math.ceil(div.start / cols) - 1) / 2) * div.spacing * div.facing;
    const across = (c - (cols - 1) / 2) * div.spacing;
    return { x: div.cx + along, y: div.cy + across };
  }
  enemiesOf(side) { return this.divisions.filter(d => d.side !== side && !d.routed && this.aliveCount(d) > 0); }

  // ---------- orders ----------
  issue(div, order, fromSide = div.side, scripted = false) {
    if (div.routed || this.over) return;
    if (!scripted && !this.sides[fromSide].ai) this.recorded.push({ step: this.steps, type: 'order', div: div.id, order, side: fromSide });
    const side = this.sides[fromSide];
    const o = div.officer;
    const dist = Math.hypot(o.x - side.hq.x, o.y - side.hq.y);
    const speed = 150 * (0.8 + o.stats.lea * 0.025);
    const m = { div, order, x: side.hq.x, y: side.hq.y, speed, side: fromSide, sent: this.t, eta: this.t + dist / speed };
    if (div.pending) { const old = this.messengers.indexOf(div.pending); if (old >= 0) this.messengers.splice(old, 1); }
    div.pending = m; this.messengers.push(m);
  }
  applyOrder(div, order) {
    div.state = order; div.flankPhase = 0; div.pending = null;
    if (order === 'charge') div.chargeT = this.t;
    if (order === 'flankL' || order === 'flankR') { const sign = order === 'flankL' ? -1 : 1; const c = this.centroid(div); div.flankPt = { x: c.x + div.facing * 160, y: Math.max(60, Math.min(FIELD.h - 60, c.y + sign * 300 * (div.side === 0 ? 1 : -1))) }; }
  }
  takeover(sideIdx, style = 'balanced') { if (this.sides[sideIdx].ai) return; this.recorded.push({ step: this.steps, type: 'ai', side: sideIdx, style }); this.sides[sideIdx].ai = style; }
  fireAttack(sideIdx, x, y, scripted = false) {
    const side = this.sides[sideIdx]; if (side.fireUsed || this.over) return false;
    if (!scripted && !side.ai) this.recorded.push({ step: this.steps, type: 'fire', side: sideIdx, x, y });
    side.fireUsed = true;
    this.fires.push({ x, y, r: 75, land: this.t + 2.2, end: this.t + 7, side: sideIdx, hit: false, from: { ...side.hq } });
    this.log(`${side.name} looses a volley of fire arrows.`, sideIdx, 'strat');
    return true;
  }

  // ---------- main update ----------
  step(dt) {
    if (this.over) return;
    // replay recorded commands at exactly the step they were given
    while (this.script.length && this.script[0].step <= this.steps) {
      const c = this.script.shift();
      if (c.type === 'order') this.issue(this.divisions[c.div], c.order, c.side, true);
      else if (c.type === 'fire') this.fireAttack(c.side, c.x, c.y, true);
      else if (c.type === 'ai') this.sides[c.side].ai = c.style;
    }
    this.steps++;
    this.t += dt;
    this.buildGrid();
    for (const m of [...this.messengers]) {
      const tgt = m.div.officer.alive ? m.div.officer : this.centroid(m.div);
      const dx = tgt.x - m.x, dy = tgt.y - m.y, d = Math.hypot(dx, dy);
      if (d < 8) { this.messengers.splice(this.messengers.indexOf(m), 1); if (!m.div.routed) this.applyOrder(m.div, m.order); continue; }
      m.x += dx / d * m.speed * dt; m.y += dy / d * m.speed * dt;
    }
    for (const div of this.divisions) div.c = this.centroid(div);
    for (const div of this.divisions) this.updateDivision(div, dt);
    for (const s of this.soldiers) this.updateSoldier(s, dt);
    this.updateProjectiles(dt);
    this.updateFires();
    for (const side of this.sides) if (side.ai) this.ai(side);
    this.checkEnd();
  }

  buildGrid() {
    const g = this.grid = new Array(this.gw * this.gh);
    for (const s of this.soldiers) {
      if (!s.alive || s.fled) continue;
      const gx = Math.max(0, Math.min(this.gw - 1, (s.x / this.cell) | 0)), gy = Math.max(0, Math.min(this.gh - 1, (s.y / this.cell) | 0));
      const k = gy * this.gw + gx; (g[k] || (g[k] = [])).push(s);
    }
  }
  nearestEnemy(s, radius) {
    const c = this.cell, r = Math.ceil(radius / c);
    const gx = (s.x / c) | 0, gy = (s.y / c) | 0;
    let best = null, bd = radius * radius;
    for (let y = Math.max(0, gy - r); y <= Math.min(this.gh - 1, gy + r); y++) for (let x = Math.max(0, gx - r); x <= Math.min(this.gw - 1, gx + r); x++) {
      const cellList = this.grid[y * this.gw + x]; if (!cellList) continue;
      for (const o of cellList) { if (o.side === s.side || o.div.routed) continue; const d = (o.x - s.x) ** 2 + (o.y - s.y) ** 2; if (d < bd) { bd = d; best = o; } }
    }
    return best;
  }

  updateDivision(div, dt) {
    const alive = this.aliveCount(div);
    if (alive <= 0) { if (!div.gone) { div.gone = true; } return; }
    const c = this.centroid(div);
    // officer follows behind the formation
    const o = div.officer;
    if (o.alive && !o.captured) {
      const ox = c.x - 30 * div.facing, oy = c.y; const d = Math.hypot(ox - o.x, oy - o.y);
      if (d > 1) { const sp = Math.min(d, (div.routed ? 50 : 40) * dt); o.x += (ox - o.x) / d * sp; o.y += (oy - o.y) / d * sp; }
    }
    // morale
    const lossRatio = (div.dead + div.fled) / div.start;
    if (!div.inCombat && !div.routed) div.morale = Math.min(div.baseMorale - lossRatio * 40, div.morale + 2.5 * dt);
    div.inCombat = this.t - div.lastHit < 1.5;
    if (!div.routed && div.morale < 15) this.rout(div);
    if (div.routed) {
      // rally chance once they have run a while
      if (o.alive && o.stats.cha >= 11 && this.t - div.routedAt > 7 && div.rallied < 1 && alive > div.start * 0.25) {
        div.morale += 3 * dt;
        if (div.morale > 32) { div.routed = false; div.rallied++; div.state = 'hold'; div.cx = c.x; div.cy = c.y; this.log(`${o.name} rallies the ${div.unitName}!`, div.side, 'good'); }
      }
      return;
    }
    // movement target for the formation center
    const enemies = this.enemiesOf(div.side);
    let target = null, td = 1e9;
    for (const e of enemies) { const ec = this.centroid(e); const d = Math.hypot(ec.x - c.x, ec.y - c.y); if (d < td) { td = d; target = { div: e, c: ec }; } }
    if (target) div.facing = target.c.x > c.x ? 1 : -1;
    let goal = null, speedMul = 1;
    const ranged = div.role === 'ranged' || div.role === 'magic';
    switch (div.state) {
      case 'hold': goal = null; break;
      case 'advance': if (target) goal = ranged && td < div.stats.range * 0.85 ? null : target.c; break;
      case 'charge': if (target) { goal = target.c; speedMul = div.role === 'cav' ? 1.35 : 1.15; } break;
      case 'flankL': case 'flankR':
        if (div.flankPhase === 0 && div.flankPt) { goal = div.flankPt; if (Math.hypot(div.flankPt.x - c.x, div.flankPt.y - c.y) < 40) { div.flankPhase = 1; div.chargeT = this.t; } }
        else if (target) { goal = target.c; speedMul = 1.2; }
        break;
      case 'retreat': goal = { x: div.side === 0 ? 120 : FIELD.w - 120, y: c.y }; if (Math.abs(goal.x - c.x) < 30) { div.state = 'hold'; } break;
    }
    if (goal) {
      const dx = goal.x - div.cx, dy = goal.y - div.cy, d = Math.hypot(dx, dy);
      const sp = div.stats.spd * speedMul * dt * 0.95;
      if (d > 4) { div.cx += dx / d * Math.min(d, sp); div.cy += dy / d * Math.min(d, sp); }
    }
    // keep the anchor close to the actual troops so formations don't stretch
    const lag = Math.hypot(div.cx - c.x, div.cy - c.y);
    if (lag > 70) { div.cx = c.x + (div.cx - c.x) * 70 / lag; div.cy = c.y + (div.cy - c.y) * 70 / lag; }
    div.cx = Math.max(30, Math.min(FIELD.w - 30, div.cx)); div.cy = Math.max(30, Math.min(FIELD.h - 30, div.cy));
  }

  rout(div) {
    div.routed = true; div.routedAt = this.t; div.state = 'rout'; div.morale = Math.min(div.morale, 10);
    this.log(`The ${div.unitName} of ${div.officer.name} break and flee!`, div.side, 'bad');
    for (const d of this.divisions) if (d.side === div.side && d !== div && !d.routed) { const a = this.centroid(d), b = this.centroid(div); if (Math.hypot(a.x - b.x, a.y - b.y) < 300) d.morale -= 8; }
  }

  updateSoldier(s, dt) {
    if (!s.alive) { if (s.dying > 0) { s.dying -= dt; s.at += dt * 8; if (s.dying <= 0) this.corpses.push(s); } return; }
    if (s.fled) return;
    const div = s.div, st = div.stats;
    s.cd -= dt; s.at += dt * 6;
    if (s.hitT > 0) s.hitT -= dt;
    if (div.routed) {
      const ex = div.side === 0 ? -30 : FIELD.w + 30;
      const dx = ex - s.x; s.x += Math.sign(dx) * st.spd * 1.25 * dt; s.y += (this.r() - 0.5) * 20 * dt; s.anim = 1; s.flip = dx < 0;
      if (s.x < -10 || s.x > FIELD.w + 10) { s.fled = true; div.fled++; }
      return;
    }
    const ranged = div.role === 'ranged' || div.role === 'magic';
    const engageR = ranged ? st.range : (div.state === 'hold' ? 45 : 85);
    let e = s.target && s.target.alive && !s.target.fled && !s.target.div.routed && (s.target.x - s.x) ** 2 + (s.target.y - s.y) ** 2 < engageR * engageR ? s.target : null;
    if (!e && (s.cd <= 0 || this.r() < 0.08)) { e = this.nearestEnemy(s, engageR); s.target = e; }
    let mx = 0, my = 0, moving = false;
    if (e) {
      const dx = e.x - s.x, dy = e.y - s.y, d = Math.hypot(dx, dy) || 1;
      s.flip = dx < 0;
      if (ranged && d > 22) {
        if (s.cd <= 0) { s.cd = st.cd * (0.8 + this.r() * 0.4); s.anim = 2; s.at = 0; s.atkT = 0.5; this.shoot(s, e); }
      } else if (d > 12) { mx = dx / d; my = dy / d; moving = true; }
      else if (s.cd <= 0) {
        s.cd = st.cd * (0.8 + this.r() * 0.4); s.anim = 2; s.at = 0; s.atkT = 0.5;
        let dmg = st.atk * (0.7 + this.r() * 0.6);
        if (div.role === 'cav' && (div.state === 'charge' || div.flankPhase === 1) && this.t - div.chargeT < 6) dmg *= div.R.charge || 1;
        if (e.div.role === 'cav' && div.unit === 0 && div.faction === 'aldmark') dmg *= 1.6; // pikes against horse
        dmg *= this.flankMult(s, e);
        this.hit(e, dmg, s);
      }
    } else {
      const p = this.slotPos(div, s.slot);
      const dx = p.x - s.x, dy = p.y - s.y, d = Math.hypot(dx, dy);
      if (d > 3) { mx = dx / d; my = dy / d; moving = true; s.flip = dx < -1 ? true : dx > 1 ? false : div.facing < 0; }
      else s.flip = div.facing < 0;
    }
    if (moving) {
      let sp = st.spd * (div.state === 'charge' ? (div.role === 'cav' ? 1.35 : 1.15) : 1);
      if (this.terrain === 'swamp' && div.role !== 'flyer') sp *= 0.8;
      s.x += mx * sp * dt; s.y += my * sp * dt;
    }
    // light separation so blobs don't collapse into one pixel
    if (this.r() < 0.35) {
      const list = this.grid[(Math.max(0, Math.min(this.gh - 1, (s.y / this.cell) | 0))) * this.gw + Math.max(0, Math.min(this.gw - 1, (s.x / this.cell) | 0))];
      if (list) for (let i = 0; i < Math.min(list.length, 8); i++) { const o = list[(i * 7 + s.slot) % list.length]; if (o === s) continue; const dx = s.x - o.x, dy = s.y - o.y, d2 = dx * dx + dy * dy; if (d2 < 49 && d2 > 0.01) { const d = Math.sqrt(d2); s.x += dx / d * (7 - d) * 0.5; s.y += dy / d * (7 - d) * 0.5; } }
    }
    s.x = Math.max(4, Math.min(FIELD.w - 4, s.x)); s.y = Math.max(8, Math.min(FIELD.h - 4, s.y));
    if (s.atkT > 0) s.atkT -= dt; else s.anim = moving ? 1 : 0;
    if (s.hitT > 0 && s.anim !== 2) s.anim = 3;
    // officer in danger
    const o = div.officer;
    if (e && !ranged && e.div.officer.alive && !e.div.officer.captured && (e.div.officer.x - s.x) ** 2 + (e.div.officer.y - s.y) ** 2 < 196 && s.cd > st.cd * 0.7 && this.r() < 0.3) {
      const eo = e.div.officer; eo.hp -= st.atk * 0.5;
      if (eo.hp <= 0) this.officerDown(e.div, this.r() < 0.3);
    }
  }
  flankMult(s, e) {
    // hitting a formation from its side or rear hurts more and shakes them
    const ed = e.div; if (ed.routed) return 1.2;
    const a = s.div.c || this.centroid(s.div), b = ed.c || this.centroid(ed);
    const rx = a.x - b.x, ry = a.y - b.y;
    const behind = Math.sign(rx) === -ed.facing && Math.abs(rx) > 30;
    const side = Math.abs(ry) > ed.cols * ed.spacing * 0.55 && Math.abs(ry) > Math.abs(rx);
    if (behind || side) { ed.morale -= 0.05; if (!ed.flankWarn || this.t - ed.flankWarn > 12) { ed.flankWarn = this.t; this.log(`The ${ed.unitName} of ${ed.officer.name} are hit in the ${behind ? 'rear' : 'flank'}!`, ed.side, 'bad'); } return 1.5; }
    return 1;
  }
  hit(e, dmg, by) {
    if (!e.alive) return;
    const cover = this.trees.some(t => (t.x - e.x) ** 2 + (t.y - e.y) ** 2 < 600) && by && (by.div.role === 'ranged' || by.div.role === 'magic') ? 0.7 : 1;
    e.hp -= Math.max(0.3, dmg * cover - e.div.stats.def * 0.35);
    e.hitT = 0.25; e.div.lastHit = this.t; if (by) by.div.lastHit = this.t;
    if (e.hp <= 0) {
      e.alive = false; e.dying = 0.6; e.at = 0; e.anim = 4; e.div.dead++;
      e.div.morale -= (100 / Math.max(12, e.div.start)) * 1.05 * (e.div.start < 12 ? e.div.start / 12 : 1);
    }
  }
  shoot(s, e) {
    const d = Math.hypot(e.x - s.x, e.y - s.y);
    const spd = s.div.role === 'magic' ? 170 : 260;
    const lead = d / spd;
    this.projectiles.push({ x: s.x, y: s.y - 6, sx: s.x, sy: s.y - 6, tx: e.x + (this.r() - 0.5) * 14, ty: e.y + (this.r() - 0.5) * 14, t: 0, dur: lead, dmg: s.div.stats.shot * (0.7 + this.r() * 0.6), side: s.side, ammo: s.div.role === 'magic' ? (s.div.faction === 'ashborn' || s.div.faction === 'kharn' ? 2 : 1) : s.div.faction === 'kharn' && s.div.unit === 6 ? 3 : 0, by: s, arc: s.div.role === 'ranged' ? Math.min(60, d * 0.25) : 0 });
  }
  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]; p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      p.px = p.x; p.py = p.y;
      p.x = p.sx + (p.tx - p.sx) * k; p.y = p.sy + (p.ty - p.sy) * k - Math.sin(k * Math.PI) * p.arc;
      if (k >= 1) {
        this.projectiles.splice(i, 1);
        const tgt = this.nearestEnemy({ x: p.tx, y: p.ty, side: p.side }, 10);
        if (tgt) this.hit(tgt, p.dmg, p.by);
      }
    }
  }
  updateFires() {
    for (const f of this.fires) {
      if (!f.hit && this.t >= f.land) {
        f.hit = true; const shaken = new Set();
        for (const s of this.soldiers) if (s.alive && !s.fled && (s.x - f.x) ** 2 + (s.y - f.y) ** 2 < f.r * f.r) { this.hit(s, 5 + this.r() * 8, null); shaken.add(s.div); }
        for (const d of shaken) { d.morale -= 18; this.log(`Fire rains on the ${d.unitName} of ${d.officer.name}!`, d.side, d.side === f.side ? 'bad' : 'good'); }
      }
      if (f.hit && this.t < f.end && this.r() < 0.3) {
        for (const s of this.soldiers) if (s.alive && !s.fled && (s.x - f.x) ** 2 + (s.y - f.y) ** 2 < (f.r * 0.7) ** 2 && this.r() < 0.02) this.hit(s, 2, null);
      }
    }
  }
  officerDown(div, captured) {
    const o = div.officer; if (!o.alive || o.captured) return;
    if (captured) o.captured = true; else o.alive = false;
    div.morale -= 30;
    this.log(`${o.name} is ${captured ? 'taken prisoner' : 'slain'}! The ${div.unitName} waver.`, div.side, 'bad');
    for (const d of this.divisions) if (d.side === div.side && d !== div) d.morale -= 6;
  }

  // ---------- enemy general ----------
  ai(side) {
    if (!side.nextThink || this.t >= side.nextThink) side.nextThink = this.t + 2.5; else return;
    const mine = this.divisions.filter(d => d.side === side.index && !d.routed && this.aliveCount(d) > 0);
    const foes = this.enemiesOf(side.index);
    if (!foes.length) return;
    const style = side.ai;
    const closest = d => Math.min(...foes.map(f => { const a = this.centroid(f), b = this.centroid(d); return Math.hypot(a.x - b.x, a.y - b.y); }));
    for (const d of mine) {
      if (d.pending) continue;
      const near = closest(d);
      const ranged = d.role === 'ranged' || d.role === 'magic';
      let want = d.state;
      const routing = foes.find(f => f.morale < 25);
      if (style === 'reckless') want = ranged ? 'advance' : 'charge';
      else if (style === 'cautious') want = near < 260 ? (ranged ? 'hold' : 'charge') : ranged && near < d.stats.range ? 'hold' : this.t > 40 ? 'advance' : 'hold';
      else {
        if (d.role === 'cav' || d.role === 'flyer') want = this.t < 4 ? (this.r() < 0.5 ? 'flankL' : 'flankR') : d.state.startsWith('flank') ? d.state : 'charge';
        else want = 'advance';
      }
      if (routing && !ranged && this.r() < 0.4) want = 'charge';
      if (d.morale < 30 && !d.inCombat && style !== 'reckless') want = 'retreat';
      if (want !== d.state) this.issue(d, want);
    }
    // fire attack when the enemy bunches up away from our own troops
    if (!side.fireUsed && this.t > 15) {
      for (const f of foes) {
        const c = this.centroid(f);
        const ownNear = this.soldiers.some(s => s.side === side.index && s.alive && !s.fled && (s.x - c.x) ** 2 + (s.y - c.y) ** 2 < 110 * 110);
        if (!ownNear && this.aliveCount(f) > 60 && this.r() < 0.25) { this.fireAttack(side.index, c.x, c.y); break; }
      }
    }
  }

  checkEnd() {
    for (const side of this.sides) {
      const standing = this.divisions.filter(d => d.side === side.index && !d.routed && this.aliveCount(d) > 0);
      if (!standing.length) { this.over = true; this.winner = 1 - side.index; this.log(`${this.sides[1 - side.index].name} holds the field. Victory!`, 1 - side.index, 'end'); return; }
    }
    if (this.t > 420) {
      const str = i => this.divisions.filter(d => d.side === i && !d.routed).reduce((a, d) => a + this.aliveCount(d) * d.stats.hp, 0);
      this.over = true; this.winner = str(0) >= str(1) ? 0 : 1; this.log('Night falls and both armies withdraw. The stronger side claims the day.', this.winner, 'end');
    }
  }

  summary() {
    return this.sides.map(side => ({
      name: side.name, color: side.color, won: this.winner === side.index,
      divisions: this.divisions.filter(d => d.side === side.index).map(d => ({ unit: d.unitName, officer: d.officer.name, fate: !d.officer.alive ? 'slain' : d.officer.captured ? 'captured' : 'survived', start: d.start, dead: d.dead, fled: d.fled, left: this.aliveCount(d), routed: d.routed, rallied: d.rallied })),
    }));
  }
}
