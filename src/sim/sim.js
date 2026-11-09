// The simulation: one aircraft, a state, and step(controls) at a fixed 1/120 s (flight-model §8).
// Forces: aerodynamics (§7) and gravity. Thrust and ground contact join with their milestones.

import { atmosphere } from "./atmosphere.js";
import { aeroForces, airData } from "./aero.js";
import { rk4Step } from "./body.js";
import { qrotate, qrotateInv } from "./vec.js";

export const DT = 1 / 120;
const G_W = [0, 0, 9.80665];

/** Still air everywhere. Air features replace this with a function of position and time. */
export const stillAir = () => [0, 0, 0];

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Controls in pilot sense (CLAUDE.md conventions), clamped to their ranges. */
export function normalizeControls(ctl = {}) {
  return {
    elevator: clamp(ctl.elevator ?? 0, -1, 1),
    aileron: clamp(ctl.aileron ?? 0, -1, 1),
    rudder: clamp(ctl.rudder ?? 0, -1, 1),
    airbrake: clamp(ctl.airbrake ?? 0, 0, 1),
  };
}

/** Body-axis force and moment on the aircraft (aero plus gravity) at a state and time. */
export function totalForces(card, state, t, ctl, wind = stillAir) {
  const atm = atmosphere(-state.x[2]);
  const air = airData(card, state.v, state.q, state.omega, wind(state.x, t), atm);
  const aero = aeroForces(card, air, ctl);
  const g = qrotateInv(state.q, G_W);
  return {
    F: [aero.F[0] + card.m * g[0], aero.F[1] + card.m * g[1], aero.F[2] + card.m * g[2]],
    M: aero.M,
    air,
    coef: aero.coef,
  };
}

export class Sim {
  /** card: from loadCard. state: { x, v, q, omega } (see body.js). options: { wind, t }. */
  constructor(card, state, { wind = stillAir, t = 0 } = {}) {
    this.card = card;
    this.state = state;
    this.wind = wind;
    this.t = t;
  }

  /** Advance one fixed step with the given controls. */
  step(controls) {
    const ctl = normalizeControls(controls);
    const forces = (s, time) => totalForces(this.card, s, time, ctl, this.wind);
    this.state = rk4Step(this.state, this.t, DT, forces, this.card.m, this.card.I);
    this.t += DT;
    return this.state;
  }

  /** Air data and coefficients at the current state, for instruments, tools and tests. */
  observe(controls) {
    return totalForces(this.card, this.state, this.t, normalizeControls(controls), this.wind);
  }

  /** World-axis velocity over the ground (m/s). */
  velocityWorld() {
    return qrotate(this.state.q, this.state.v);
  }
}
