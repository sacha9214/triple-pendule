// Vérifie le cœur physique + commande extrait de index.html : node test.mjs
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const core = html.match(/\/\/CORE-START([\s\S]*?)\/\/CORE-END/)[1];
const names = 'makeParams, lqr, stepCtrl, stepWorld, control, energy, makeController, ctrlStep, SWING, DTC, XMAX, INIT_TILT';
const { makeParams, lqr, stepCtrl, stepWorld, control, energy, makeController, ctrlStep, SWING, DTC, XMAX, INIT_TILT } =
  new Function(core + `; return { ${names} };`)();

const deg = Math.PI / 180;
let fail = false;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fail = true; };

// 1. équilibre : inclinaison initiale + poussée de 20 N pendant 0,15 s
function balance(n, pushN) {
  const P = makeParams(n), K = lqr(P), N = n + 1;
  let s = new Array(2 * N).fill(0);
  for (let j = 1; j < N; j++) s[j] = (j % 2 ? 1 : -1) * INIT_TILT[n - 1] * deg;
  for (let t = 0; t < 15; t += DTC) {
    s = stepCtrl(s, control(s, K) + (t >= 3 && t < 3.15 ? pushN : 0), P);
    if (Math.abs(s[0]) > XMAX || s.slice(1, N).some(a => Math.abs(a) > 70 * deg)) return false;
  }
  return s.every(v => Math.abs(v) < 1e-3);
}
for (const n of [1, 2, 3]) check(balance(n, 20) && balance(n, -20), `n=${n} équilibre après poussée de 20 N`);

// 2. conservation de l'énergie sans frottement ni commande
{
  const P = makeParams(3); P.b = 0; P.bc = 0; P.M = 1e9;
  let s = [0, 0.5, -0.3, 0.8, 0, 0, 0, 0]; const e0 = energy(s, P);
  for (let i = 0; i < 2500; i++) s = stepCtrl(s, 0, P);
  const drift = Math.abs(energy(s, P) - e0) / e0;
  check(drift < 1e-4, `dérive d'énergie ${drift.toExponential(1)}`);
}

// 3. remontée : depuis le bas, puis après des chutes provoquées par une grosse poussée
function simulate(P, C, s, T, pushes = []) {
  let upSince = null, t = 0;
  for (; t < T; t += DTC) {
    let p = 0;
    for (const [t0, f] of pushes) if (t >= t0 && t < t0 + 0.15) p = f;
    s = stepWorld(s, ctrlStep(C, s, P) + p, P);
    const up = C.mode === 'balance' && s.every(v => Math.abs(v) < 0.01);
    if (!up) upSince = null; else if (upSince === null) upSince = t;
    if (upSince !== null && t - upSince > 1 && t > (pushes.at(-1)?.[0] ?? 0) + 1) return t;
  }
  return null;
}
let seed = 1; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
for (const n of [1, 2, 3, 4]) {
  const P = makeParams(n), C = makeController(P), N = n + 1;
  if (!C.swing) { console.log(`--   n=${n} pas de trajectoire de remontée`); continue; }
  const hang = new Array(2 * N).fill(0); for (let j = 1; j < N; j++) hang[j] = Math.PI;
  C.mode = 'settle';
  const t0 = simulate(P, C, hang.slice(), 20);
  check(t0 !== null, `n=${n} remontée depuis le bas (${t0?.toFixed(1)} s)`);
  let ok = 0, worst = 0; const TR = 20;
  for (let k = 0; k < TR; k++) {
    C.mode = 'balance'; C.i = 0;
    const f = (rnd() < 0.5 ? -1 : 1) * (70 + 60 * rnd());
    const r = simulate(P, C, new Array(2 * N).fill(0), 60, [[0.5, f], [0.5 + rnd() * 3, -f * rnd()]]);
    if (r !== null) { ok++; worst = Math.max(worst, r); }
  }
  check(ok === TR, `n=${n} relevé après chute : ${ok}/${TR} (pire cas ${worst.toFixed(1)} s)`);
}
process.exit(fail ? 1 : 0);
