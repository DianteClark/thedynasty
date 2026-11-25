// Troop stress test: how many soldiers can the battle engine run and draw smoothly on this device?
import { Battle, UNITS } from './battle.js';

const $ = s => document.querySelector(s);
const PRESETS = [1000, 2500, 5000, 7500, 10000, 12500, 15000, 20000];
const FACTIONS = Object.keys(UNITS);
const canvas = $('#st'), g = canvas.getContext('2d');
const img = {}; let ground = null;
let B = null, cam = { x: 0, y: 0, z: 1 }, camMode = 'mid', paused = false, dpr = 1, follow = true;
const frames = []; let simMs = 0, drawMs = 0, onScreen = 0;

function load(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
function flip(im) { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.translate(im.width, 0); x.scale(-1, 1); x.drawImage(im, 0, 0); return c; }

function fieldFor(n) { const k = Math.sqrt(Math.max(1, n / 2400)); return { w: Math.round(1600 * Math.max(1, k)), h: Math.round(1000 * Math.max(1, k)) }; }
function start(total) {
  // eight officers a side, a mix of unit roles and cultures
  const field = fieldFor(total);
  const side = (faction, name, color) => {
    const units = UNITS[faction].map((u, i) => i).filter(i => UNITS[faction][i].entry);
    return { faction, name, color, ai: 'reckless', canFire: true, mods: {}, divisions: Array.from({ length: 8 }, (_, k) => ({ faction, unit: units[k % units.length], count: Math.round(total / 16), level: 3, officer: { name: `${name} ${k + 1}`, stats: { lea: 10, mig: 10, int: 12, cha: 10 } } })) };
  };
  const a = FACTIONS[Math.floor(Math.random() * FACTIONS.length)], b = FACTIONS[Math.floor(Math.random() * FACTIONS.length)];
  B = new Battle({ seed: 42, terrain: 'plains', field, startGap: 420, sides: [side(a, 'Blue', '#4fa3ff'), side(b, 'Red', '#ff5a4a')] });
  buildGround(); setCam(camMode); frames.length = 0;
}
function buildGround() {
  const c = document.createElement('canvas'); c.width = B.fw; c.height = B.fh; const x = c.getContext('2d');
  for (let y = 0; y < B.fh; y += 16) for (let xx = 0; xx < B.fw; xx += 16) x.drawImage(img.ground, ((xx * 7 + y * 3) % 5 < 4 ? 0 : 1) * 16, 0, 16, 16, xx, y, 16, 16);
  ground = c;
}
function setCam(mode) {
  camMode = mode; cam.x = B.fw / 2; cam.y = B.fh / 2; follow = mode !== 'far';
  cam.z = mode === 'close' ? 2 : mode === 'mid' ? 0.9 : Math.min(innerWidth / B.fw, innerHeight / B.fh);
}
function fit() { dpr = Math.min(2, devicePixelRatio || 1); canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px'; }

let last = performance.now(), acc = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  frames.push(now); while (frames.length && now - frames[0] > 1000) frames.shift();
  let t0 = performance.now();
  if (!paused && B && !B.over) { acc += dt; let n = 0; while (acc >= 1 / 30 && n++ < 4) { B.step(1 / 30); acc -= 1 / 30; } if (n >= 4) acc = 0; }
  const t1 = performance.now();
  if (B && follow) { let x = 0, y = 0, n = 0; for (let i = 0; i < B.soldiers.length; i += 7) { const s = B.soldiers[i]; if (s.alive && !s.fled) { x += s.x; y += s.y; n++; } } if (n) { cam.x += (x / n - cam.x) * 0.1; cam.y += (y / n - cam.y) * 0.1; } }
  if (B) draw();
  const t2 = performance.now();
  simMs = simMs * 0.9 + (t1 - t0) * 0.1; drawMs = drawMs * 0.9 + (t2 - t1) * 0.1;
  hud();
  requestAnimationFrame(frame);
}
function draw() {
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.imageSmoothingEnabled = false; g.fillStyle = '#111'; g.fillRect(0, 0, innerWidth, innerHeight);
  g.setTransform(cam.z * dpr, 0, 0, cam.z * dpr, (innerWidth / 2 - cam.x * cam.z) * dpr, (innerHeight / 2 - cam.y * cam.z) * dpr);
  g.drawImage(ground, 0, 0);
  const hw = innerWidth / 2 / cam.z + 24, hh = innerHeight / 2 / cam.z + 24;
  const live = []; for (const s of B.soldiers) if ((s.alive || s.dying > 0) && !s.fled && Math.abs(s.x - cam.x) < hw && Math.abs(s.y - cam.y) < hh) live.push(s);
  live.sort((a, b) => a.y - b.y); onScreen = live.length;
  for (const s of live) {
    const im = img[s.div.faction]; const sheet = s.flip ? im.l : im.r;
    const anim = s.alive ? s.anim : 4; let col = anim * 4 + (s.alive ? Math.floor(s.at) % 4 : Math.min(3, Math.floor(s.at))); if (s.flip) col = 19 - col;
    g.fillStyle = s.div.color; g.fillRect(Math.round(s.x - 4), Math.round(s.y + 1), 8, 2);
    g.drawImage(sheet, col * 16, s.div.unit * 16, 16, 16, Math.round(s.x - 8), Math.round(s.y - 14), 16, 16);
  }
  for (const p of B.projectiles) if (Math.abs(p.x - cam.x) < hw && Math.abs(p.y - cam.y) < hh) g.drawImage(img.ammo, p.ammo * 8, 0, 8, 8, p.x - 4, p.y - 4, 8, 8);
}
function fps() { return frames.length; }
function hud() {
  if (!B) { $('#fps').textContent = '–'; $('#sim').textContent = '–'; $('#draw').textContent = '–'; $('#troops').textContent = '–'; return; }
  const f = fps(); const el = $('#fps'); el.textContent = f; el.className = f >= 55 ? '' : f >= 40 ? 'ok' : 'bad';
  $('#sim').textContent = simMs.toFixed(1); $('#draw').textContent = drawMs.toFixed(1);
  const alive = B ? B.soldiers.filter(s => s.alive && !s.fled).length : 0;
  $('#troops').textContent = `${alive.toLocaleString()} (${onScreen.toLocaleString()})`;
}
const wait = ms => new Promise(r => setTimeout(r, ms));
let chosenN = 5000, chosenCam = 'mid', running = false, testing = false;
const rows = [];
function renderRows() {
  $('#results').innerHTML = rows.length ? `<table><tr><th>Troops</th><th>Camera</th><th>Avg FPS</th><th>Low FPS</th><th>Sim ms</th><th>Draw ms</th></tr>${rows.map(r => `<tr><td>${r.n.toLocaleString()}</td><td>${r.cam}</td><td>${r.avg}</td><td>${r.low}</td><td>${r.sim.toFixed(1)}</td><td>${r.draw.toFixed(1)}</td></tr>`).join('')}</table>` : '';
}
function select() {
  document.querySelectorAll('[data-n]').forEach(b => b.classList.toggle('on', +b.dataset.n === chosenN));
  document.querySelectorAll('[data-cam]').forEach(b => b.classList.toggle('on', b.dataset.cam === chosenCam));
  $('#go').disabled = testing;
}
async function runTest() {
  if (testing) return;
  testing = true; running = true; select();
  start(chosenN); setCam(chosenCam); $('#stop').hidden = false;
  $('#status').textContent = 'Armies closing…'; await wait(2000);
  $('#status').textContent = 'Measuring…';
  const samples = []; const end = performance.now() + 5000;
  while (performance.now() < end) { await wait(250); samples.push(fps()); }
  const avg = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length), low = Math.min(...samples);
  rows.push({ n: chosenN, cam: { close: 'Close-up', mid: 'Mid', far: 'Whole field' }[chosenCam], avg, low, sim: simMs, draw: drawMs }); renderRows();
  $('#status').textContent = `${chosenN.toLocaleString()} troops: ${avg} FPS average, ${low} lowest`;
  testing = false; select();
}
function stop() { B = null; running = false; $('#stop').hidden = true; $('#status').textContent = 'Pick options, then Start test'; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, canvas.width, canvas.height); }

(async () => {
  img.ground = await load('assets/ground/plains.png'); img.ammo = await load('assets/ammo.png');
  await Promise.all(FACTIONS.map(async f => { const im = await load(`assets/units/${f}.png`); img[f] = { r: im, l: flip(im) }; }));
  $('#presets').innerHTML = PRESETS.map(n => `<button class="chip" data-n="${n}">${n.toLocaleString()}</button>`).join('');
  fit(); window.addEventListener('resize', fit);
  select();
  document.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.n && !testing) { chosenN = +t.dataset.n; select(); }
    if (t.dataset.cam) { chosenCam = t.dataset.cam; select(); if (B && !testing) setCam(chosenCam); }
    if (t.id === 'go') runTest();
    if (t.id === 'stop' && !testing) stop();
  });
  let p = null; canvas.addEventListener('pointerdown', e => { p = { x: e.clientX, y: e.clientY }; follow = false; });
  canvas.addEventListener('pointermove', e => { if (!p || !B) return; cam.x -= (e.clientX - p.x) / cam.z; cam.y -= (e.clientY - p.y) / cam.z; p = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', () => { p = null; });
  requestAnimationFrame(frame);
})();
