// The simulation: one aircraft, a state, and step(controls) at a fixed 1/120 s (flight-model §8).
// Forces: aerodynamics (§7), thrust (§7.1), gravity, and ground contact (§11) when a ground is given.

import { atmosphere } from "./atmosphere.js";
import { aeroForces, airData, groundEffect } from "./aero.js";
import { rk4Step } from "./body.js";
import { contactForces, crashCheck, touching } from "./contact.js";
import { thrustForces } from "./thrust.js";
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
    flaps: clamp(ctl.flaps ?? 0, 0, 1),
    throttle: clamp(ctl.throttle ?? 0, 0, 1),
  };
}

/**
 * Body-axis force and moment on the aircraft at a state and time: aero, gravity and, with a
 * ground, contact. Also returns the air data and coefficients, and the contact force alone.
 */
export function totalForces(card, state, t, ctl, wind = stillAir, ground = null) {
  const atm = atmosphere(-state.x[2]);
  const air = airData(card, state.v, state.q, state.omega, wind(state.x, t), atm);
  if (ground) air.ge = groundEffect(-state.x[2] - ground.heightAt(state.x[0], state.x[1]), card.b); // §6.2
  const aero = aeroForces(card, air, ctl);
  const thrust = thrustForces(card, air.Vb, air, atm.rho, ctl);
  const contact = contactForces(card, state, ground, ctl);
  const g = qrotateInv(state.q, G_W);
  const F = [0, 1, 2].map((i) => aero.F[i] + thrust.F[i] + contact.F[i] + card.m * g[i]);
  const M = [0, 1, 2].map((i) => aero.M[i] + thrust.M[i] + contact.M[i]);
  return { F, M, air, coef: aero.coef, aero, thrust, contact };
}

export class Sim {
  /**
   * card: from loadCard. state: { x, v, q, omega } (see body.js).
   * options: { wind, ground, t }. Without a ground there is nothing to land on (headless flight).
   */
  constructor(card, state, { wind = stillAir, ground = null, t = 0 } = {}) {
    this.card = card;
    this.state = state;
    this.wind = wind;
    this.ground = ground;
    this.t = t;
    this.crashed = null; // set once, by the touchdown check (§11.6)
    this.touching = touching(card, state, ground);
  }

  /** Advance one fixed step with the given controls. After a crash the sim no longer steps. */
  step(controls) {
    if (this.crashed) return this.state;
    const ctl = normalizeControls(controls);
    const forces = (s, time) => totalForces(this.card, s, time, ctl, this.wind, this.ground);
    const before = this.state;
    this.state = rk4Step(this.state, this.t, DT, forces, this.card.m, this.card.I);
    this.t += DT;
    if (this.ground) {
      this.crashed = crashCheck(this.card, before, this.state, this.ground, this.touching);
      this.touching = touching(this.card, this.state, this.ground);
    }
    return this.state;
  }

  /** Forces, air data and coefficients at the current state, for instruments, tools and tests. */
  observe(controls) {
    return totalForces(this.card, this.state, this.t, normalizeControls(controls), this.wind, this.ground);
  }

  /** World-axis velocity over the ground (m/s). */
  velocityWorld() {
    return qrotate(this.state.q, this.state.v);
  }
}
