// Watch duels: two fighters drawn large with their HAS sprites, bout by bout.
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const imgs = {};
function load(src) { return new Promise((res, rej) => { if (imgs[src]) return res(imgs[src]); const i = new Image(); i.onload = () => { imgs[src] = i; res(i); }; i.onerror = rej; i.src = src; }); }

function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Build a believable exchange of blows that ends the way the duel actually ended.
function script(rec) {
  const r = rng(rec.seed || 1); const aWins = rec.w === rec.a;
  const n = 4 + Math.floor(r() * 4); const hp = [100, 100]; const steps = [];
  for (let i = 0; i < n; i++) {
    const last = i === n - 1;
    const atk = last ? (aWins ? 0 : 1) : (r() < (aWins ? 0.62 : 0.38) ? 0 : 1);
    const def = 1 - atk;
    let dmg = last ? hp[def] - (rec.outcome === 'slain' || rec.outcome === 'wounded' ? 0 : 8) : 8 + Math.floor(r() * 16);
    if (!last && hp[def] - dmg < 15) dmg = Math.max(0, hp[def] - 15);
    const miss = !last && r() < 0.25;
    if (!miss) hp[def] = Math.max(0, hp[def] - dmg);
    steps.push({ atk, def, miss, hp: [...hp], last });
  }
  return steps;
}

let root = null, raf = 0;
export async function watchDuels(list, title, onClose) {
  if (!list || !list.length) return;
  const facs = new Set(list.flatMap(d => [d.af[0], d.bf[0]]));
  await Promise.all([...facs].map(f => load(`assets/units/${f}.png`)).concat([load('assets/ground/plains.png')]));
  close();
  root = document.createElement('div'); root.className = 'duel';
  root.innerHTML = `<canvas></canvas><div class="dtop"><button class="bbtn" data-d="close">✕</button><span class="dtitle">${esc(title || 'A duel')}</span></div>
    <div class="dcap" id="dcap"></div><div class="dbtns"><button class="bbtn" data-d="skip">⏭ Skip bout</button><button class="bbtn" data-d="next" hidden>Next bout ▶</button></div>`;
  document.body.appendChild(root); document.body.classList.add('in-battle');
  const cv = root.querySelector('canvas'); const g = cv.getContext('2d');
  let idx = 0, t0 = performance.now(), steps = script(list[0]), finished = false;
  const fit = () => { const d = Math.min(2, devicePixelRatio || 1); cv.width = innerWidth * d; cv.height = innerHeight * d; cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px'; g.setTransform(d, 0, 0, d, 0, 0); g.imageSmoothingEnabled = false; };
  fit(); window.addEventListener('resize', fit); root._fit = fit;
  const STEP = 1.4;
  const frame = now => {
    const rec = list[idx]; const t = (now - t0) / 1000;
    const W = innerWidth, H = innerHeight; const ground = imgs['assets/ground/plains.png'];
    for (let y = 0; y < H; y += 48) for (let x = 0; x < W; x += 48) g.drawImage(ground, ((x / 48 + y / 48) % 3) * 16, 0, 16, 16, x, y, 48, 48);
    g.fillStyle = 'rgba(10,8,6,.35)'; g.fillRect(0, 0, W, H);
    const k = Math.min(steps.length, Math.floor(t / STEP)); const phase = (t % STEP) / STEP;
    const cur = steps[Math.min(k, steps.length - 1)]; const prevHp = k === 0 ? [100, 100] : steps[k - 1].hp;
    const done = t >= steps.length * STEP;
    const scale = Math.max(4, Math.min(9, Math.floor(W / 90)));
    const px = [W * 0.32, W * 0.68], py = H * 0.55;
    const names = [rec.an, rec.bn], fs = [rec.af, rec.bf];
    for (const i of [0, 1]) {
      let anim = 0, fr = Math.floor(t * 5) % 4;
      const loser = done && (rec.w === rec.a ? 1 : 0) === i;
      if (!done && cur.atk === i && phase < 0.55) { anim = 2; fr = Math.min(3, Math.floor(phase / 0.55 * 4)); }
      else if (!done && cur.def === i && !cur.miss && phase > 0.3 && phase < 0.7) { anim = 3; fr = Math.floor((phase - 0.3) / 0.4 * 4) % 4; }
      if (loser) { anim = rec.outcome === 'slain' ? 4 : 3; fr = rec.outcome === 'slain' ? Math.min(3, Math.floor((t - steps.length * STEP) * 5)) : 3; }
      const im = imgs[`assets/units/${fs[i][0]}.png`]; const lunge = !done && cur.atk === i && phase < 0.55 ? Math.sin(phase / 0.55 * Math.PI) * 26 * (i === 0 ? 1 : -1) : 0;
      g.save(); g.translate(px[i] + lunge, py); if (i === 1) g.scale(-1, 1);
      g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(0, 2, 7 * scale, 2 * scale, 0, 0, 7); g.fill();
      g.drawImage(im, (anim * 4 + fr) * 16, fs[i][1] * 16, 16, 16, -8 * scale, -15 * scale, 16 * scale, 16 * scale); g.restore();
      const hp = done ? cur.hp[i] : prevHp[i] + (cur.hp[i] - prevHp[i]) * Math.min(1, Math.max(0, (phase - 0.3) / 0.3));
      const bw = Math.min(160, W * 0.36), bx = px[i] - bw / 2, by = py - 17 * scale - 30;
      g.fillStyle = '#2b231a'; g.fillRect(bx, by, bw, 8); g.fillStyle = hp > 50 ? '#6fbf73' : hp > 20 ? '#e0b040' : '#e2553f'; g.fillRect(bx, by, bw * hp / 100, 8);
      g.font = '600 15px Georgia, serif'; g.textAlign = 'center'; g.fillStyle = '#fff4dc'; g.fillText(names[i], px[i], by - 8);
      if (!done && cur.def === i && cur.miss && phase > 0.35 && phase < 0.8) { g.font = '700 14px sans-serif'; g.fillStyle = '#ffd76a'; g.fillText('Parried!', px[i], py - 17 * scale - 48); }
    }
    const cap = root.querySelector('#dcap');
    const winner = rec.w === rec.a ? rec.an : rec.bn, loserN = rec.w === rec.a ? rec.bn : rec.an;
    const fate = rec.outcome === 'slain' ? `${loserN} falls, and does not rise.` : rec.outcome === 'wounded' ? `${loserN} goes down, badly wounded.` : `${loserN} yields.`;
    cap.innerHTML = `${list.length > 1 ? `<small>Bout ${idx + 1} of ${list.length}${rec.training ? ' · blunted blades' : ''}</small>` : rec.training ? '<small>Blunted blades</small>' : ''}<div>${done ? `<b>${esc(winner)} wins.</b> ${esc(fate)}` : `Exchange ${Math.min(k + 1, steps.length)}`}</div>`;
    if (done && !finished) { finished = true; const nb = root.querySelector('[data-d=next]'); nb.hidden = idx >= list.length - 1; root.querySelector('[data-d=skip]').hidden = true; }
    raf = requestAnimationFrame(frame);
  };
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-d]'); if (!b) return;
    if (b.dataset.d === 'close') { close(); onClose && onClose(); }
    if (b.dataset.d === 'skip') t0 = performance.now() - steps.length * STEP * 1000;
    if (b.dataset.d === 'next') { idx++; steps = script(list[idx]); t0 = performance.now(); finished = false; root.querySelector('[data-d=next]').hidden = true; root.querySelector('[data-d=skip]').hidden = false; }
  });
  raf = requestAnimationFrame(frame);
}
function close() {
  if (!root) return; cancelAnimationFrame(raf); window.removeEventListener('resize', root._fit); root.remove(); root = null; document.body.classList.remove('in-battle');
}
