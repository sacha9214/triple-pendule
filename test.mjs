// Vérifie le cœur physique + LQR extrait de index.html : node test.mjs
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const core = html.match(/\/\/CORE-START([\s\S]*?)\/\/CORE-END/)[1];
const { makeParams, lqr, stepCtrl, control, energy, DTC, XMAX, INIT_TILT } =
  new Function(core + '; return { makeParams, lqr, stepCtrl, control, energy, DTC, XMAX, INIT_TILT };')();

const deg = Math.PI / 180;
function run(n, pushN, { motor = true, tilt = INIT_TILT[n - 1] } = {}) {
  const P = makeParams(n), K = lqr(P), N = n + 1;
  let s = new Array(2 * N).fill(0);
  for (let j = 1; j < N; j++) s[j] = (j % 2 ? 1 : -1) * tilt * deg;
  let maxU = 0, maxX = 0, maxTh = 0;
  for (let t = 0; t < 15; t += DTC) {
    const u = motor ? control(s, K) : 0, p = t >= 3 && t < 3.15 ? pushN : 0;
    s = stepCtrl(s, u + p, P);
    maxU = Math.max(maxU, Math.abs(u)); maxX = Math.max(maxX, Math.abs(s[0]));
    for (let j = 1; j < N; j++) maxTh = Math.max(maxTh, Math.abs(s[j]));
    if (maxTh > 70 * deg || maxX > XMAX) return { ok: false, t, maxU, maxX };
  }
  const settled = s.every(v => Math.abs(v) < 1e-3);
  return { ok: settled, maxU, maxX, maxThDeg: maxTh / deg };
}

let fail = false;
for (const n of [1, 2, 3]) {
  const r = run(n, 20);
  let lim = 0;
  for (let f = 5; f <= 80; f += 5) { if (run(n, f).ok && run(n, -f).ok) lim = f; else break; }
  console.log(`n=${n} push 20N:`, JSON.stringify(r), `| survit jusqu'à ${lim} N`);
  if (!r.ok) fail = true;
}
// sans moteur, ça doit tomber
if (run(3, 0, { motor: false }).ok) { console.log('ERREUR: tient sans moteur'); fail = true; }
// conservation d'énergie sans frottement ni commande
{
  const P = makeParams(3); P.b = 0; P.bc = 0; P.M = 1e9;
  let s = [0, 0.5, -0.3, 0.8, 0, 0, 0, 0]; const e0 = energy(s, P);
  for (let i = 0; i < 2500; i++) s = stepCtrl(s, 0, P);
  const drift = Math.abs(energy(s, P) - e0) / e0;
  console.log('dérive énergie sur 10 s (chariot fixe, sans frottement):', drift.toExponential(2));
  if (drift > 1e-4) fail = true;
}
process.exit(fail ? 1 : 0);
