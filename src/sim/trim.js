// Trim and the performance figures: flight-model §9.
// Steady, wings-level glides in still air with ω = 0. Sea level, standard day, airbrakes closed
// unless the options say otherwise.

import { atmosphere } from "./atmosphere.js";
import { alphaCPos, coefficients, liftCurve } from "./aero.js";
import { firstPeak } from "./card.js";
import { qfromEuler } from "./vec.js";

const air = (alpha, V, atm) => ({ alpha, beta: 0, mach: V / atm.a, phat: 0, qhat: 0, rhat: 0 });
const controls = (elevator, airbrake) => ({ elevator, aileron: 0, rudder: 0, airbrake });

/** The first peak of the blended lift curve for an airbrake position: { alpha, CL } (§6.1). */
export function liftPeak(c, airbrake = 0) {
  const p = firstPeak((a) => liftCurve(c, a, alphaCPos(c, airbrake), c.alphaCNeg), c.alpha0, +1);
  return { alpha: p.x, CL: p.value };
}

/** Elevator for Cm = 0 at α (§6.3). Cm is piecewise linear in δe, so this is exact. */
function elevatorFor(c, alpha, V, atm, airbrake) {
  const cm0 = coefficients(c, air(alpha, V, atm), controls(0, airbrake)).Cm;
  const need = -cm0;
  return need >= 0 ? need / c.elevator.cmFullUp : -need / c.elevator.cmFullDown;
}

function bisect(fn, lo, hi) {
  let flo = fn(lo);
  for (let i = 0; i < 200 && hi - lo > 1e-15; i++) {
    const mid = (lo + hi) / 2, fm = fn(mid);
    if (fm * flo > 0) { lo = mid; flo = fm; } else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Steady glide at true airspeed V (m/s): α, δe and glide angle γ with Cm = 0, L = W cos γ and
 * D = W sin γ (§9). Returns null below the stall. Options: { airbrake, altitude }.
 * gamma is the glide angle below the horizon (positive descending); sink = V sin γ.
 */
export function glide(c, V, { airbrake = 0, altitude = 0 } = {}) {
  const atm = atmosphere(altitude);
  const qS = 0.5 * atm.rho * V * V * c.S;
  const top = liftPeak(c, airbrake).alpha;
  let elevator = 0, alpha = NaN;
  for (let i = 0; i < 50; i++) {
    // The aero force balances the weight: q̄ S √(CL² + CD²) = W, on the attached side of the curve.
    const excess = (a) => {
      const k = coefficients(c, air(a, V, atm), controls(elevator, airbrake));
      return qS * Math.hypot(k.CL, k.CD) - c.W;
    };
    if (excess(top) < 0) return null;
    alpha = bisect(excess, c.alpha0, top);
    const next = elevatorFor(c, alpha, V, atm, airbrake);
    const settled = Math.abs(next - elevator) < 1e-15;
    elevator = next;
    if (settled) break; // with CLδe = 0, the second pass confirms the first
  }
  const k = coefficients(c, air(alpha, V, atm), controls(elevator, airbrake));
  const gamma = Math.atan2(k.CD, k.CL);
  return {
    V,
    alpha,
    elevator,
    elevatorLimited: Math.abs(elevator) > 1,
    gamma,
    sink: V * Math.sin(gamma),
    LD: k.CL / k.CD,
    CL: k.CL,
    CD: k.CD,
  };
}

/**
 * Stall speed Vs = √(2W / (ρ S CL_peak)) (§9). If full nose-up elevator can't hold the peak,
 * the elevator sets the stall instead, and elevatorLimited says so.
 */
export function stallSpeed(c, { airbrake = 0, altitude = 0 } = {}) {
  const atm = atmosphere(altitude);
  const peak = liftPeak(c, airbrake);
  let { alpha, CL } = peak;
  let elevator = elevatorFor(c, alpha, 0, atm, airbrake);
  const elevatorLimited = elevator > 1;
  if (elevatorLimited) {
    // The highest α full back stick can hold: Cm(α, δe = 1) = 0.
    const cm = (a) => coefficients(c, air(a, 0, atm), controls(1, airbrake)).Cm;
    alpha = bisect(cm, c.alpha0, peak.alpha);
    CL = coefficients(c, air(alpha, 0, atm), controls(1, airbrake)).CL;
    elevator = 1;
  }
  const V = Math.sqrt((2 * c.W) / (atm.rho * c.S * CL));
  return { V, CL, alpha, elevator, elevatorLimited };
}

/** Golden-section search for the minimum of f on [a, b]. */
function goldenMin(f, a, b, tol = 1e-9) {
  const r = (Math.sqrt(5) - 1) / 2;
  let x1 = b - r * (b - a), x2 = a + r * (b - a), f1 = f(x1), f2 = f(x2);
  while (b - a > tol) {
    if (f1 < f2) { b = x2; x2 = x1; f2 = f1; x1 = b - r * (b - a); f1 = f(x1); }
    else { a = x1; x1 = x2; f1 = f2; x2 = a + r * (b - a); f2 = f(x2); }
  }
  return (a + b) / 2;
}

/** The speed in [Vs, VNE] minimizing f(glide): a coarse scan, then golden section around the best. */
function optimum(c, f, opts) {
  const lo = stallSpeed(c, opts).V * (1 + 1e-9), hi = c.vne;
  const cost = (V) => {
    const g = glide(c, V, opts);
    return g ? f(g) : Infinity;
  };
  const n = 200;
  let best = 0, bestCost = Infinity;
  for (let i = 0; i <= n; i++) {
    const v = cost(lo + ((hi - lo) * i) / n);
    if (v < bestCost) { bestCost = v; best = i; }
  }
  const a = lo + ((hi - lo) * Math.max(0, best - 1)) / n, b = lo + ((hi - lo) * Math.min(n, best + 1)) / n;
  return glide(c, goldenMin(cost, a, b), opts);
}

/** Best glide: the maximum glide ratio over speed, and its speed (§9). */
export const bestGlide = (c, opts = {}) => optimum(c, (g) => -g.LD, opts);

/** Minimum sink: the minimum sink rate over speed, and its speed (§9). */
export const minSink = (c, opts = {}) => optimum(c, (g) => g.sink, opts);

/** The polar: steady glides at each speed in the list (m/s). Speeds below the stall are skipped. */
export function polar(c, speeds, opts = {}) {
  return speeds.map((V) => glide(c, V, opts)).filter(Boolean);
}

/**
 * The 6-DOF state of a trimmed glide (from glide()) heading north at an altitude (m):
 * pitch θ = α − γ, body velocity V (cos α, 0, sin α), no rates.
 */
export function glideState(trim, altitude) {
  const { V, alpha, gamma } = trim;
  return {
    x: [0, 0, -altitude],
    v: [V * Math.cos(alpha), 0, V * Math.sin(alpha)],
    q: qfromEuler(0, alpha - gamma, 0),
    omega: [0, 0, 0],
  };
}
