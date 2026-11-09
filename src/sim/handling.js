// Handling figures (flight-model §12), measured from the 6-DOF sim itself: the modes from the
// sim's own equations linearized about a trimmed glide, the roll figures by flying it.
// Pure; runs in Node, a page (the hangar) or a Worker.

import { DT, Sim, totalForces } from "./sim.js";
import { derivatives } from "./body.js";
import { eigenvalues } from "./eigen.js";
import { glide } from "./trim.js";
import { qfromEuler, qtoEuler } from "./vec.js";

const G0 = 9.80665;

/** The 6-DOF state for body velocity, rates and Euler angles (heading north, at altitude h). */
function stateOf([u, v, w], [p, q, r], phi, theta, h) {
  return { x: [0, 0, -h], v: [u, v, w], q: qfromEuler(phi, theta, 0), omega: [p, q, r] };
}

/**
 * The time derivatives of the 8 handling states (u, v, w, p, q, r, φ, θ) for the given values,
 * from the sim's own forces and equations of motion (§7, §8).
 */
function rates(card, s8, ctl, h) {
  const [u, v, w, p, q, r, phi, theta] = s8;
  const st = stateOf([u, v, w], [p, q, r], phi, theta, h);
  const { F, M } = totalForces(card, st, 0, ctl);
  const d = derivatives(st, F, M, card.m, card.I);
  return [
    d.v[0], d.v[1], d.v[2], d.omega[0], d.omega[1], d.omega[2],
    p + (q * Math.sin(phi) + r * Math.cos(phi)) * Math.tan(theta), // φ̇
    q * Math.cos(phi) - r * Math.sin(phi), // θ̇
  ];
}

/** The Jacobian of rates() at s0, by central differences, for the states listed in `idx`. */
function jacobian(card, s0, ctl, h, idx) {
  const step = [0.01, 0.01, 0.01, 1e-4, 1e-4, 1e-4, 1e-5, 1e-5];
  return idx.map((i) =>
    idx.map((j) => {
      const a = s0.slice(), b = s0.slice();
      a[j] += step[j];
      b[j] -= step[j];
      return (rates(card, a, ctl, h)[i] - rates(card, b, ctl, h)[i]) / (2 * step[j]);
    })
  );
}

/** A pair of roots as frequency and damping: complex ones directly, two real ones as their product. */
function pairOf(a, b) {
  const wn = Math.sqrt(a.re * b.re - a.im * b.im);
  return { wn, zeta: -(a.re + b.re) / (2 * wn), period: a.im ? (2 * Math.PI) / Math.abs(a.im) : Infinity, roots: [a, b] };
}

/**
 * The modes at a trimmed glide at speed V (m/s): { trim, shortPeriod, phugoid, dutchRoll, rollMode,
 * spiral }. Frequencies in rad/s, damping ratios, the roll-mode time constant in s, and the spiral's
 * time to double (unstable) or to half (stable) in s.
 */
export function modes(card, V, { altitude = 0, airbrake = 0 } = {}) {
  const trim = glide(card, V, { altitude, airbrake });
  const ctl = { elevator: trim.elevator, aileron: 0, rudder: 0, airbrake };
  const theta = trim.alpha - trim.gamma;
  const s0 = [V * Math.cos(trim.alpha), 0, V * Math.sin(trim.alpha), 0, 0, 0, 0, theta];
  // Trimmed wings level, the longitudinal and lateral motions are independent (by symmetry).
  const lon = eigenvalues(jacobian(card, s0, ctl, altitude, [0, 2, 4, 7])); // u, w, q, θ
  const lat = eigenvalues(jacobian(card, s0, ctl, altitude, [1, 3, 5, 6])); // v, p, r, φ

  const byFreq = (a, b) => Math.hypot(b.re, b.im) - Math.hypot(a.re, a.im);
  // Longitudinal: two pairs, the fast one the short period, the slow one the phugoid.
  const lonPairs = pairUp(lon).sort((a, b) => byFreq(a[0], b[0]));
  const shortPeriod = pairOf(...lonPairs[0]);
  const phugoid = pairOf(...lonPairs[1]);
  // Lateral: the complex pair is the Dutch roll; of the two real roots the faster is the roll mode.
  const complex = lat.filter((e) => e.im > 0);
  const real = lat.filter((e) => e.im === 0).sort((a, b) => a.re - b.re);
  let dutchRoll, rollMode = null, spiral = null, rollSpiral = null;
  if (complex.length === 0) {
    // all four real: the Dutch roll is overdamped, the middle two between the roll mode and the spiral (§12.1)
    const bySize = real.slice().sort((a, b) => Math.abs(b.re) - Math.abs(a.re));
    dutchRoll = pairOf(bySize[1], bySize[2]);
    rollMode = { lambda: bySize[0].re, tau: -1 / bySize[0].re };
    const ls = bySize[3].re;
    spiral = { lambda: ls, stable: ls < 0, timeToDouble: ls > 0 ? Math.LN2 / ls : Infinity, timeToHalf: ls < 0 ? Math.LN2 / -ls : Infinity };
  } else if (complex.length === 2) {
    // no real roots: roll and spiral have joined in a lateral phugoid; the faster pair is the Dutch roll
    const [a, b] = complex.sort((x, y) => byFreq(x, y));
    dutchRoll = pairOf(a, { re: a.re, im: -a.im });
    rollSpiral = pairOf(b, { re: b.re, im: -b.im });
  } else {
    const a = complex[0];
    dutchRoll = pairOf(a, { re: a.re, im: -a.im });
    rollMode = { lambda: real[0].re, tau: -1 / real[0].re };
    const ls = real[1].re;
    spiral = { lambda: ls, stable: ls < 0, timeToDouble: ls > 0 ? Math.LN2 / ls : Infinity, timeToHalf: ls < 0 ? Math.LN2 / -ls : Infinity };
  }
  return { V, trim, shortPeriod, phugoid, dutchRoll, rollMode, spiral, rollSpiral };
}

/** Groups eigenvalues into pairs: complex conjugates together, real ones by size. */
function pairUp(ev) {
  const complex = ev.filter((e) => e.im > 0).map((e) => [e, { re: e.re, im: -e.im }]);
  const real = ev.filter((e) => e.im === 0).sort((a, b) => Math.abs(b.re) - Math.abs(a.re));
  const pairs = [...complex];
  for (let i = 0; i + 1 < real.length; i += 2) pairs.push([real[i], real[i + 1]]);
  return pairs;
}

/** A coordinated turn at bank φ and speed V from the trim: the rates of turning at Ω = g tan φ / V. */
function turning(card, trim, phi, h) {
  const V = trim.V, Om = (G0 * Math.tan(phi)) / V, theta = trim.alpha - trim.gamma;
  const st = stateOf([V * Math.cos(trim.alpha), 0, V * Math.sin(trim.alpha)], [0, Om * Math.sin(phi) * Math.cos(theta), Om * Math.cos(phi) * Math.cos(theta)], phi, theta, h);
  return st;
}

/**
 * Roll performance at speed V, flown in the sim at sea level (§12.2) with no rudder: the time to roll
 * from 45° of bank one
 * way to 45° the other with full aileron, and the most roll rate full aileron gives (deg/s).
 */
export function rollPerformance(card, V, { altitude = 0, limit = 10 } = {}) {
  const trim = glide(card, V, { altitude });
  const elevator = trim.elevator;
  // bank reversal, from a 45° left bank, full right aileron
  const sim = new Sim(card, turning(card, trim, (-45 * Math.PI) / 180, altitude));
  let reversal = Infinity;
  for (let i = 0; i < limit / DT; i++) {
    sim.step({ elevator, aileron: 1 });
    if (qtoEuler(sim.state.q).roll >= (45 * Math.PI) / 180) { reversal = sim.t; break; }
  }
  // the most roll rate, from wings level
  const sim2 = new Sim(card, turning(card, trim, 0, altitude));
  let pMax = 0;
  for (let i = 0; i < 6 / DT; i++) {
    sim2.step({ elevator, aileron: 1 });
    pMax = Math.max(pMax, sim2.state.omega[0]);
    if (Math.abs(qtoEuler(sim2.state.q).roll) > (150 * Math.PI) / 180) break;
  }
  return { reversal, maxRollRate: (pMax * 180) / Math.PI };
}

/**
 * MIL-F-8785C Level 1 bounds, used as sanity bounds for every airplane (flight-model §12.3).
 * check(handling) → [{ what, value, bound, pass }].
 */
export const BOUNDS = {
  shortPeriodZeta: [0.35, 1.3],
  phugoidZeta: 0.04,
  dutchRollZeta: 0.08,
  dutchRollWn: 0.4,
  dutchRollZetaWn: 0.15,
  rollTau: 1.4,
  spiralDouble: 20,
};

export function check(m) {
  const b = BOUNDS, out = [];
  const add = (what, value, bound, pass) => out.push({ what, value, bound, pass });
  add("short-period damping ratio", m.shortPeriod.zeta, `${b.shortPeriodZeta[0]} to ${b.shortPeriodZeta[1]}`, m.shortPeriod.zeta >= b.shortPeriodZeta[0] && m.shortPeriod.zeta <= b.shortPeriodZeta[1]);
  add("phugoid damping ratio", m.phugoid.zeta, `≥ ${b.phugoidZeta}`, m.phugoid.zeta >= b.phugoidZeta);
  add("Dutch roll damping ratio", m.dutchRoll.zeta, `≥ ${b.dutchRollZeta}`, m.dutchRoll.zeta >= b.dutchRollZeta);
  add("Dutch roll frequency (rad/s)", m.dutchRoll.wn, `≥ ${b.dutchRollWn}`, m.dutchRoll.wn >= b.dutchRollWn);
  add("Dutch roll ζω (rad/s)", m.dutchRoll.zeta * m.dutchRoll.wn, `≥ ${b.dutchRollZetaWn}`, m.dutchRoll.zeta * m.dutchRoll.wn >= b.dutchRollZetaWn);
  if (m.rollMode) {
    add("roll-mode time constant (s)", m.rollMode.tau, `≤ ${b.rollTau}`, m.rollMode.tau <= b.rollTau);
    const t2 = m.spiral.timeToDouble;
    add("spiral time to double (s)", t2, `stable or ≥ ${b.spiralDouble}`, m.spiral.stable || t2 >= b.spiralDouble);
  } else {
    add("roll and spiral (coupled)", m.rollSpiral.zeta, "separate modes", false);
  }
  return out;
}
