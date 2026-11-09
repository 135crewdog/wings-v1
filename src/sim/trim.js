// Trim and the performance figures: flight-model §9.
// Steady, wings-level glides in still air with ω = 0, and steady flight with power. Sea level,
// standard day, airbrakes closed and flaps up unless the options say otherwise.

import { atmosphere } from "./atmosphere.js";
import { alphaCPos, coefficients, liftCurve } from "./aero.js";
import { firstPeak } from "./card.js";
import { qfromEuler } from "./vec.js";
import { totalForces } from "./sim.js";

const air = (alpha, V, atm) => ({ alpha, beta: 0, mach: V / atm.a, phat: 0, qhat: 0, rhat: 0 });
const controls = (elevator, airbrake, flaps = 0) => ({ elevator, aileron: 0, rudder: 0, airbrake, flaps });

/** The zero-lift angle with the flaps at δf (§6.4). */
const zeroLift = (c, flaps) => c.alpha0 - (c.flaps.cl0 * flaps) / c.CLa;

/** The first peak of the blended lift curve for the devices' positions: { alpha, CL } (§6.1, §6.4). */
export function liftPeak(c, airbrake = 0, flaps = 0) {
  const p = firstPeak((a) => liftCurve(c, a, alphaCPos(c, airbrake, flaps), c.alphaCNeg, c.flaps.cl0 * flaps), zeroLift(c, flaps), +1);
  return { alpha: p.x, CL: p.value };
}

/** Elevator for Cm = 0 at α (§6.3). Cm is piecewise linear in δe, so this is exact. */
function elevatorFor(c, alpha, V, atm, airbrake, flaps = 0) {
  const cm0 = coefficients(c, air(alpha, V, atm), controls(0, airbrake, flaps)).Cm;
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
export function glide(c, V, { airbrake = 0, flaps = 0, altitude = 0 } = {}) {
  const atm = atmosphere(altitude);
  const qS = 0.5 * atm.rho * V * V * c.S;
  const top = liftPeak(c, airbrake, flaps).alpha;
  let elevator = 0, alpha = NaN;
  for (let i = 0; i < 50; i++) {
    // The aero force balances the weight: q̄ S √(CL² + CD²) = W, on the attached side of the curve.
    const excess = (a) => {
      const k = coefficients(c, air(a, V, atm), controls(elevator, airbrake, flaps));
      return qS * Math.hypot(k.CL, k.CD) - c.W;
    };
    if (excess(top) < 0) return null;
    alpha = bisect(excess, zeroLift(c, flaps), top);
    const next = elevatorFor(c, alpha, V, atm, airbrake, flaps);
    const settled = Math.abs(next - elevator) < 1e-15;
    elevator = next;
    if (settled) break; // with CLδe = 0, the second pass confirms the first
  }
  const k = coefficients(c, air(alpha, V, atm), controls(elevator, airbrake, flaps));
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
export function stallSpeed(c, { airbrake = 0, flaps = 0, altitude = 0 } = {}) {
  const atm = atmosphere(altitude);
  const peak = liftPeak(c, airbrake, flaps);
  let { alpha, CL } = peak;
  let elevator = elevatorFor(c, alpha, 0, atm, airbrake, flaps);
  const elevatorLimited = elevator > 1;
  if (elevatorLimited) {
    // The highest α full back stick can hold: Cm(α, δe = 1) = 0.
    const cm = (a) => coefficients(c, air(a, 0, atm), controls(1, airbrake, flaps)).Cm;
    alpha = bisect(cm, zeroLift(c, flaps), peak.alpha);
    CL = coefficients(c, air(alpha, 0, atm), controls(1, airbrake, flaps)).CL;
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
 * The 6-DOF state of a trimmed glide (from glide()) at an altitude (m): pitch θ = α − γ, body
 * velocity V (cos α, 0, sin α), no rates. Options: heading (rad, 0 north, π/2 east) and position
 * north and east (m).
 */
export function glideState(trim, altitude, { heading = 0, north = 0, east = 0 } = {}) {
  const { V, alpha, gamma } = trim;
  return {
    x: [north, east, -altitude],
    v: [V * Math.cos(alpha), 0, V * Math.sin(alpha)],
    q: qfromEuler(0, alpha - gamma, heading),
    omega: [0, 0, 0],
  };
}

/**
 * Steady, wings-level flight with power at true airspeed V (m/s), §9: α, δe and the flight-path
 * angle γ (positive climbing) with the sim's own total force zero along and across the path and no
 * pitching moment. climb = V sin γ. Options: { throttle, flaps, airbrake, altitude, n } where n
 * scales the weight (the sustained-turn figure, §9). Returns null where no steady flight exists
 * (beyond the stall, or the elevator can't hold it).
 */
export function steady(c, V, { throttle = 1, flaps = 0, airbrake = 0, altitude = 0, n = 1, level = false } = {}) {
  const ctl = { elevator: 0, aileron: 0, rudder: 0, airbrake, flaps, throttle };
  // the third unknown is γ, or with `level` the throttle at γ = 0
  const top = liftPeak(c, airbrake, flaps).alpha;
  const g0 = glide(c, Math.max(V, 1e-3), { airbrake, flaps, altitude });
  if (!g0) return null;
  const residual = ([alpha, elevator, third]) => {
    const gamma = level ? 0 : third;
    const tau = level ? third : throttle;
    const st = {
      x: [0, 0, -altitude],
      v: [V * Math.cos(alpha), 0, V * Math.sin(alpha)],
      q: qfromEuler(0, alpha + gamma, 0),
      omega: [0, 0, 0],
    };
    const { F, M } = totalForces(c, st, 0, { ...ctl, elevator, throttle: tau });
    // the extra weight of a turn, n W in all, along the same direction as gravity
    const gz = (n - 1) * c.W;
    const th = alpha + gamma;
    const Fx = F[0] - gz * Math.sin(th), Fz = F[2] + gz * Math.cos(th);
    return [Fx / c.W, Fz / c.W, M[1] / (c.W * c.cbar)];
  };
  let x = [g0.alpha, g0.elevator, level ? 0.5 : -g0.gamma];
  const h = [1e-6, 1e-6, 1e-6];
  for (let it = 0; it < 60; it++) {
    const r = residual(x);
    if (Math.hypot(...r) < 1e-12) break;
    const J = [0, 1, 2].map((j) => {
      const xp = x.slice(); xp[j] += h[j];
      const xm = x.slice(); xm[j] -= h[j];
      const rp = residual(xp), rm = residual(xm);
      return rp.map((v, i) => (v - rm[i]) / (2 * h[j]));
    }); // J[j][i] = ∂r_i/∂x_j
    const A = [0, 1, 2].map((i) => [0, 1, 2].map((j) => J[j][i]));
    const dx = solve3(A, r.map((v) => -v));
    if (!dx) return null;
    // damped: no step bigger than 0.05 rad in α or γ, or 0.2 in δe
    const k = Math.min(1, 0.05 / Math.abs(dx[0]), 0.2 / Math.abs(dx[1]), 0.05 / Math.abs(dx[2]));
    x = x.map((v, i) => v + k * dx[i]);
  }
  const r = residual(x);
  if (Math.hypot(...r) > 1e-8) return null;
  const [alpha, elevator, third] = x;
  const gamma = level ? 0 : third, tau = level ? third : throttle;
  if (alpha > top || Math.abs(elevator) > 1 || tau < 0 || tau > 1) return null;
  return { V, alpha, elevator, gamma, climb: V * Math.sin(gamma), throttle: tau };
}

/** Solves the 3×3 system A x = b by Cramer's rule; null when A is singular. */
function solve3(A, b) {
  const det = (m) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const d = det(A);
  if (!Number.isFinite(d) || Math.abs(d) < 1e-300) return null;
  return [0, 1, 2].map((k) => det(A.map((row, i) => row.map((v, j) => (j === k ? b[i] : v)))) / d);
}

/**
 * The trim the handling figures start from (§12.1): a glide, or for an airplane with an engine,
 * level flight with the throttle that holds it. { V, alpha, elevator, gamma, throttle }.
 */
export function handlingTrim(c, V, { altitude = 0, airbrake = 0 } = {}) {
  if (c.engines.length === 0) return { ...glide(c, V, { altitude, airbrake }), throttle: 0 };
  const s = steady(c, V, { altitude, airbrake, level: true });
  // glide sign convention: gamma positive descending
  return s && { ...s, gamma: -s.gamma };
}
