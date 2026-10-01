# Triple inverted pendulum

**[Live demo](https://sacha9214.github.io/triple-pendule/)**

Can one cart balance three pendulums? A live physics simulation in a single HTML file, no libraries: one motor, four degrees of freedom. Push the cart, knock the pendulums over, and watch it swing them back up on its own.

## How it works

- **Physics** — full nonlinear Lagrangian dynamics of a cart with 1 to 4 links, integrated with RK4 at 1000 Hz. Motor force limited to ±40 N, rail limited to ±2 m.
- **Balancing** — a discrete LQR around the upright position, running at 250 Hz. The model is linearised numerically and the Riccati equation is solved in the browser at page load.
- **Falling** — past 70° the upright controller gives up. A second LQR, built around the hanging position, calms the links until they hang still.
- **Swing-up** — the cart then replays a swing-up trajectory computed offline by trajectory optimisation, tracked in closed loop with time-varying LQR gains, and hands back to the upright controller.

## Limits

- With three links the upright controller survives a 0.15 s push of about 30 N; beyond that it falls and recovers.
- With four links it still balances and swings up, but only recovers from about 0.15° of initial tilt.
- Recovery takes up to about 15 s with three or four links, most of it waiting for the links to hang still.
- A push during the swing-up can make it miss; it then falls and tries again.
- Point masses at the joints, not uniform rods.

## Development

```bash
node test.mjs
```

The test extracts the simulation core from `index.html` and checks balancing, energy conservation, and recovery after 20 forced falls for each link count.

The swing-up trajectories depend on the masses and lengths. To recompute them (roughly 10 minutes per link count for three and four links):

```bash
pip install casadi numpy
python tools/swingup_opt.py
python tools/inline.py
```

The interface is in French. Inspired by a "Can one cart balance three pendulums?" animation.

## License

MIT
