// Thrust: piston engines and propellers (flight-model §7.1). Power with density, thrust from momentum
// theory for the propeller's disc, the torque reaction, P-factor and the slipstream on the tail's
// controls. Pure; body axes; no browser code.

import { cross, dot } from "./vec.js";
import { elevatorCm } from "./aero.js";

const RHO0 = 1.225; // kg/m³, sea level (§3)

/** Shaft power (W) at throttle τ and density ρ (Gagg–Ferrar, §7.1). */
export function enginePower(e, throttle, rho) {
  return e.power * throttle * Math.max(0, 1.132 * (rho / RHO0) - 0.132);
}

/** Propeller efficiency at axial speed V, apart from the momentum loss (§7.1). */
export function propEfficiency(e, V) {
  const x = (V - e.Vd) / e.Vd;
  return e.etaMax * Math.max(0, 1 - e.falloff * x * x);
}

/**
 * Thrust (N) from momentum theory: ηP = T (V + v_s) / 2 with v_s = √(V² + 2T/(ρA)) (§7.1).
 * Solved for the slipstream speed w = v_s: ρA (w − V)(w + V)² / 2 = 2ηP, by Newton from above.
 */
export function propThrust(e, power, V, rho) {
  V = Math.max(0, V);
  const etaP = propEfficiency(e, V) * power;
  if (etaP <= 0) return { T: 0, vs: V };
  const k = (rho * e.A) / 2;
  const f = (w) => k * (w - V) * (w + V) * (w + V) - 2 * etaP;
  const df = (w) => k * (w + V) * (3 * w - V);
  // start above the root: the larger of the static and the fast-flight slipstream estimates
  let w = V + Math.cbrt((4 * etaP) / k) + 2 * etaP / (k * Math.max(V, 1) ** 2);
  for (let i = 0; i < 60; i++) {
    const step = f(w) / df(w);
    w -= step;
    if (Math.abs(step) < 1e-10 * (1 + w)) break;
  }
  return { T: k * (w * w - V * V), vs: w };
}

/**
 * Force and moment (body axes) of every engine, for air-relative body velocity Vb, air data
 * { alpha, beta } (zero below 1 m/s), density ρ and controls. Also each engine's thrust and the
 * slipstream's extra dynamic pressure on the tail.
 */
export function thrustForces(c, Vb, air, rho, ctl) {
  const F = [0, 0, 0], M = [0, 0, 0], out = [];
  for (const e of c.engines) {
    const P = enginePower(e, ctl.throttle ?? 0, rho);
    const { T, vs } = propThrust(e, P, dot(Vb, e.axis), rho);
    const f = e.axis.map((a) => a * T);
    const m = cross(e.pos, f);
    // torque reaction: −s Q about the axis, Q = P / Ω
    const Q = P / e.omega;
    // P-factor: s k T R (0, −β, −α)
    const pf = e.spin * e.pFactor * T * e.R;
    // slipstream on the tail's controls: q_extra = f T / A
    const qx = (e.slipTail * T) / e.A;
    const dr = ctl.rudder ?? 0;
    for (let i = 0; i < 3; i++) { F[i] += f[i]; M[i] += m[i] - e.spin * Q * e.axis[i]; }
    M[1] += -pf * air.beta + qx * c.S * c.cbar * elevatorCm(c, ctl.elevator ?? 0);
    M[2] += -pf * air.alpha + qx * c.S * c.b * c.rudder.cn * dr;
    M[0] += qx * c.S * c.b * c.rudder.cl * dr;
    F[1] += qx * c.S * c.rudder.cy * dr;
    out.push({ P, T, vs, qExtra: qx });
  }
  return { F, M, engines: out };
}
