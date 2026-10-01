"""Offline swing-up trajectory optimisation (multiple shooting, CasADi + IPOPT).

Same dynamics and integrator as index.html (RK4 at 1 ms). Writes tools/swingup.json:
for each pendulum count, knot states x[k] and piecewise-constant forces u[k] every H seconds.

    uv pip install casadi numpy && python tools/swingup_opt.py [n ...]
"""
import json, sys, os
import casadi as ca
import numpy as np

G, DT, H_STEPS, H = 9.81, 0.001, 20, 0.02
M, m, l, b, bc = 1.0, 0.2, 0.28, 0.002, 0.3
U_MAX, X_MAX = 26.0, 1.4          # margins below the real ±40 N and ±2 m, left for feedback
HORIZON = {1: 2.0, 2: 3.0, 3: 3.6}


def make_step(n):
    N = n + 1
    s, f = ca.SX.sym('s', 2 * N), ca.SX.sym('f')
    mu = [m * (n - j) for j in range(n)]

    def deriv(s, f):
        A = ca.SX.zeros(N, N)
        r = ca.SX.zeros(N)
        A[0, 0] = M + mu[0]
        cen = 0
        for j in range(n):
            A[0, j + 1] = A[j + 1, 0] = mu[j] * l * ca.cos(s[j + 1])
            cen += mu[j] * l * ca.sin(s[j + 1]) * s[N + j + 1] ** 2
            for k in range(n):
                A[j + 1, k + 1] = mu[max(j, k)] * l * l * ca.cos(s[j + 1] - s[k + 1])
        r[0] = f - bc * s[N] + cen
        for j in range(n):
            w = s[N + j + 1]
            w_prev = s[N + j] if j > 0 else 0
            v = mu[j] * G * l * ca.sin(s[j + 1]) - b * (w - w_prev)
            if j < n - 1:
                v += b * (s[N + j + 2] - w)
            for k in range(n):
                v -= mu[max(j, k)] * l * l * ca.sin(s[j + 1] - s[k + 1]) * s[N + k + 1] ** 2
            r[j + 1] = v
        return ca.vertcat(s[N:], ca.solve(A, r))

    x = s
    for _ in range(H_STEPS):
        k1 = deriv(x, f); k2 = deriv(x + DT / 2 * k1, f)
        k3 = deriv(x + DT / 2 * k2, f); k4 = deriv(x + DT * k3, f)
        x = x + DT / 6 * (k1 + 2 * k2 + 2 * k3 + k4)
    return ca.Function('F', [s, f], [x])


def solve(n, T, seed=0, final_turns=None):
    N, S, K = n + 1, 2 * (n + 1), round(T / H)
    F = make_step(n)
    opti = ca.Opti()
    X, U = opti.variable(S, K + 1), opti.variable(1, K)
    x0 = np.zeros(S); x0[1:N] = np.pi
    xf = np.zeros(S)
    if final_turns is not None:
        xf[1:N] = 2 * np.pi * np.array(final_turns)
    for k in range(K):
        opti.subject_to(X[:, k + 1] == F(X[:, k], U[k]))
    opti.subject_to(X[:, 0] == x0)
    opti.subject_to(X[:, K] == xf)
    opti.subject_to(opti.bounded(-U_MAX, U, U_MAX))
    opti.subject_to(opti.bounded(-X_MAX, X[0, :], X_MAX))
    opti.subject_to(U[0] == 0); opti.subject_to(U[K - 1] == 0)
    opti.minimize(H * ca.sumsqr(U) + 0.5 * ca.sumsqr(ca.diff(U, 1, 1)) + 5 * H * ca.sumsqr(X[0, :]))
    rng = np.random.default_rng(seed)
    tt = np.linspace(0, 1, K + 1)
    guess = np.outer(x0, 1 - tt) + np.outer(xf, tt)
    opti.set_initial(X, guess)
    opti.set_initial(U, 8 * np.sin(2 * np.pi * (1.2 + seed * 0.3) * tt[:-1] * T) + rng.normal(0, 2, K))
    opti.solver('ipopt', {'print_time': False}, {'max_iter': 3000, 'print_level': 0, 'tol': 1e-8})
    sol = opti.solve()
    return sol.value(X), np.atleast_1d(sol.value(U)), sol.value(opti.f)


if __name__ == '__main__':
    out_path = os.path.join(os.path.dirname(__file__), 'swingup.json')
    out = json.load(open(out_path)) if os.path.exists(out_path) else {}
    for n in [int(a) for a in sys.argv[1:]] or [1, 2, 3]:
        best = None
        for seed in range(int(os.environ.get('SEEDS', 4))):
            try:
                X, U, cost = solve(n, float(os.environ.get('T', HORIZON[n])), seed)
            except RuntimeError as e:
                print(f'n={n} seed={seed}: failed ({str(e)[:60]})', flush=True); continue
            print(f'n={n} seed={seed}: cost={cost:.2f} max|u|={abs(U).max():.1f} max|x|={abs(X[0]).max():.2f}', flush=True)
            if best is None or cost < best[2]:
                best = (X, U, cost)
        if best:
            out[str(n)] = {'H': H, 'u': [round(float(v), 5) for v in best[1]],
                           'x': [[round(float(v), 6) for v in col] for col in best[0].T]}
            json.dump(out, open(out_path, 'w'), separators=(',', ':'))
