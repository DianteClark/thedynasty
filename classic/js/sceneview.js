// 2.7 Ceremony scenes: a small living picture built from HAS art, with the choice underneath.
import { BUILDINGS, PORTRAIT_ROWS } from '../../assets/world/world.js';
import { UNITS } from './battle.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const img = {}; const load = src => img[src] || (img[src] = new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }));
const MOOD = {
  wedding: { verb: 'Attend the wedding', tint: null, fx: 'petals', icon: '💍' },
  coronation: { verb: 'Enter the hall', tint: null, fx: 'banners', icon: '👑' },
  funeral: { verb: 'Go to the graveside', tint: 'rgba(20,24,40,.45)', fx: 'candles', icon: '🕯' },
  oath: { verb: 'Swear the oath', tint: 'rgba(40,20,0,.35)', fx: 'fire', icon: '🤝' },
  knighting: { verb: 'Begin the ceremony', tint: null, fx: 'banners', icon: '⚔' },
  feast: { verb: 'Go to the feast', tint: 'rgba(60,30,0,.25)', fx: 'table', icon: '🍷' },
};
export const sceneVerb = d => (MOOD[d.cer] || MOOD.feast).icon + ' ' + (MOOD[d.cer] || MOOD.feast).verb;

let raf = 0;
export async function openScene(W, d, onChoose) {
  const sc = d.scene || {}; const mood = MOOD[sc.type] || MOOD.feast;
  const place = W.sett(sc.place) || W.sett(W.player.settId);
  const biome = place ? place.biome : 'plains'; const cul = place ? place.culture : W.player.culture;
  const [ground, buildings, portraits, ...units] = await Promise.all([load(`assets/ground/${biome}.png`), load('assets/world/buildings.png'), load('assets/world/portraits.png'), ...Object.keys(UNITS).map(f => load(`assets/units/${f}.png`))]);
  const unitImg = Object.fromEntries(Object.keys(UNITS).map((f, i) => [f, units[i]]));
  const root = document.createElement('div'); root.className = 'scene';
  root.innerHTML = `<canvas width="360" height="210"></canvas><div class="scenetext"><h2>${esc(d.title)}</h2><div class="sub">${esc(d.text)}</div>
    <div class="abtns">${d.options.map(o => `<button class="abtn" data-sc="${esc(o.id)}">${esc(o.label)}</button>`).join('')}</div>
    <button class="btn ghost" data-sc-close style="margin-top:8px">Not yet</button></div>`;
  document.body.appendChild(root);
  const cv = root.querySelector('canvas'), g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  // who stands where
  const actors = (sc.actors || []).map(id => W.char(id)).filter(Boolean);
  const guests = (sc.guests || []).map(id => W.char(id)).filter(c => c && !actors.includes(c));
  const look = c => { const f = c.army ? c.army.faction : c.culture; const u = c.army ? c.army.unit : Math.max(0, UNITS[f].findIndex(x => x.entry)); return { f: UNITS[f] ? f : 'aldmark', u }; };
  const people = [];
  const dead = sc.type === 'funeral' ? actors[1] : null;
  actors.forEach((c, i) => { if (c === dead) return; people.push({ c, x: actors.length > 1 && !dead ? 156 + i * 48 : 180, y: 172, flip: i === 1, big: true, kneel: sc.type === 'knighting' && i === 1 }); });
  guests.slice(0, 6).forEach((c, i) => { const left = i % 2 === 0; const k = Math.floor(i / 2); people.push({ c, x: left ? 70 - k * 22 : 290 + k * 22, y: 150 + k * 10, flip: !left }); });
  let t0 = performance.now(); const parts = [];
  const bkey = sc.type === 'funeral' ? 'graveyard' : (W.realm(place && place.realmId)?.capital === (place && place.id) ? 'cap_' : 'town_') + cul;
  const B = BUILDINGS[bkey] || BUILDINGS['town_' + cul] || BUILDINGS.vil_trade;
  const frame = now => {
    const t = (now - t0) / 1000;
    for (let y = 0; y < 210; y += 16) for (let x = 0; x < 360; x += 16) g.drawImage(ground, ((x * 7 + y * 3) % 5 < 4 ? 0 : 1) * 16, 0, 16, 16, x, y, 16, 16);
    const k = 104 / Math.max(B[2], B[3]); g.drawImage(buildings, B[0], B[1], B[2], B[3], 180 - B[2] * k / 2, 116 - B[3] * k, B[2] * k, B[3] * k);
    if (sc.type === 'funeral' && dead) { g.fillStyle = '#4a3b2a'; g.fillRect(160, 150, 40, 12); g.fillStyle = '#6b5638'; g.fillRect(162, 146, 36, 6); }
    if (mood.fx === 'table') { g.fillStyle = '#5a3a1e'; g.fillRect(90, 170, 180, 14); g.fillStyle = '#7a5230'; g.fillRect(90, 168, 180, 4); for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#c9a24a' : '#b33'; g.fillRect(100 + i * 22, 165, 5, 4); } }
    if (mood.fx === 'banners') for (const bx of [60, 300]) { g.fillStyle = '#5a4a3a'; g.fillRect(bx, 70, 3, 70); g.fillStyle = W.playerRealm()?.color || '#b33'; g.beginPath(); g.moveTo(bx + 3, 72); g.lineTo(bx + 24, 72 + Math.sin(t * 3 + bx) * 3); g.lineTo(bx + 24, 92 + Math.sin(t * 3 + bx) * 3); g.lineTo(bx + 3, 92); g.fill(); }
    people.sort((a, b) => a.y - b.y);
    for (const P of people) {
      const L = look(P.c); const sheet = unitImg[L.f]; const s = P.big ? 3 : 2.2;
      const fr = P.kneel ? 12 : Math.floor(t * 4 + P.x) % 4; // idle, or the 'hit' frame for a kneeling figure
      g.save(); g.translate(P.x, P.y); if (P.flip) g.scale(-1, 1);
      g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(0, 0, 7 * s / 2, 2 * s / 2, 0, 0, 7); g.fill();
      g.drawImage(sheet, fr * 16, L.u * 16, 16, 16, -8 * s, -15 * s, 16 * s, 16 * s); g.restore();
      if (P.big) { // a portrait medallion over the people who matter
        const row = Math.max(0, PORTRAIT_ROWS.indexOf(P.c.culture)), col = (P.c.female ? 10 : 0) + (P.c.id % 10);
        const mx = P.x + (P.flip ? 34 : -34) - 12, my = P.y - 48;
        g.fillStyle = '#1a140d'; g.fillRect(mx, my, 24, 24); g.strokeStyle = '#e0b040'; g.lineWidth = 1.5; g.strokeRect(mx, my, 24, 24);
        g.drawImage(portraits, col * 16, row * 16, 16, 16, mx + 2, my + 2, 20, 20);
      }
    }
    if (dead) { const row = Math.max(0, PORTRAIT_ROWS.indexOf(dead.culture)), col = (dead.female ? 10 : 0) + (dead.id % 10); g.globalAlpha = 0.85; g.fillStyle = '#1a140d'; g.fillRect(166, 112, 28, 28); g.drawImage(portraits, col * 16, row * 16, 16, 16, 168, 114, 24, 24); g.globalAlpha = 1; }
    // mood
    if (mood.tint) { g.fillStyle = mood.tint; g.fillRect(0, 0, 360, 210); }
    if (mood.fx === 'petals') { if (parts.length < 40) parts.push({ x: Math.random() * 360, y: -5, v: 12 + Math.random() * 18, c: Math.random() < 0.5 ? '#f5b5c8' : '#fff4dc' }); }
    if (mood.fx === 'candles' || mood.fx === 'fire') for (const [cx, cy] of mood.fx === 'fire' ? [[180, 178]] : [[140, 160], [220, 160], [120, 150], [240, 150]]) { const f = 0.7 + 0.3 * Math.sin(t * 9 + cx); g.fillStyle = `rgba(255,${150 + 60 * f},60,${0.25 * f})`; g.beginPath(); g.arc(cx, cy - 4, mood.fx === 'fire' ? 26 : 10, 0, 7); g.fill(); g.fillStyle = '#ffd27a'; g.fillRect(cx - 1, cy - 6 - 2 * f, 2, 4); if (mood.fx === 'fire') { g.fillStyle = '#ff8a3d'; g.fillRect(cx - 6, cy - 8 - 4 * f, 12, 6); } }
    for (const q of parts) { q.y += q.v / 60; q.x += Math.sin(q.y / 10) * 0.4; g.fillStyle = q.c; g.fillRect(q.x, q.y, 2, 2); }
    for (let i = parts.length - 1; i >= 0; i--) if (parts[i].y > 215) parts.splice(i, 1);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  const close = () => { cancelAnimationFrame(raf); root.remove(); };
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-sc],[data-sc-close]'); if (!b) return;
    if (b.dataset.scClose != null) return close();
    close(); onChoose(b.dataset.sc);
  });
}
