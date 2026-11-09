// Turn performance for the hangar's figures and its energy-manoeuvrability diagram (flight-model
// §9 and §12). Pure, on the loaded card and the trim functions; no copy of the physics.

import { atmosphere } from "./atmosphere.js";
import { stallSpeed, steady } from "./trim.js";

const G0 = 9.80665;

/**
 * The most load factor the airplane can pull at speed V (m/s): the lift limit (the first peak of its
 * lift curve, §6.1) or its limit load factor g_max, whichever is less.
 */
export function loadFactorAvailable(card, V, { altitude = 0 } = {}) {
  const rho = atmosphere(altitude).rho;
  const CLmax = stallSpeed(card, { altitude }).CL;
  const lift = (0.5 * rho * V * V * card.S * CLmax) / card.W;
  return Math.min(lift, card.json.mass.g_max);
}

/** Turn rate (rad/s) in a level turn at load factor n and speed V. */
export const turnRate = (n, V) => (n <= 1 ? 0 : (G0 * Math.sqrt(n * n - 1)) / V);

/**
 * The corner speed (m/s), where the lift limit meets g_max, and the instantaneous turn rate there
 * (rad/s), the most the airplane can turn at any speed.
 */
export function cornerSpeed(card, { altitude = 0 } = {}) {
  const vs = stallSpeed(card, { altitude }).V; // 1 g stall speed
  const V = vs * Math.sqrt(card.json.mass.g_max);
  return { V, rate: turnRate(card.json.mass.g_max, V) };
}

/** The instantaneous turn curve: [{ V, rate, n }] from the stall to VNE, every `step` m/s. */
export function instantaneousTurns(card, { altitude = 0, step = 0.5 } = {}) {
  const vs = stallSpeed(card, { altitude }).V, out = [];
  for (let V = vs; V <= card.vne + 1e-9; V += step) {
    const n = loadFactorAvailable(card, V, { altitude });
    out.push({ V, n, rate: turnRate(n, V) });
  }
  return out;
}

/**
 * The maximum instantaneous turn rate from the stall to VNE (§9): at the corner, or at VNE when the
 * corner is above it. { V (m/s), rate (rad/s), atCorner }.
 */
export function maxInstantaneousTurn(card, { altitude = 0 } = {}) {
  const corner = cornerSpeed(card, { altitude });
  if (corner.V <= card.vne) return { ...corner, atCorner: true };
  const V = card.vne;
  return { V, rate: turnRate(loadFactorAvailable(card, V, { altitude }), V), atCorner: false };
}

/** Rate of climb (m/s) in steady flight at speed V and throttle τ (§9); null where there's none. */
export function climbRate(card, V, opts = {}) {
  return steady(card, V, opts)?.climb ?? null;
}

/** Best rate of climb at full throttle (§9): { V, climb } over the stall to VNE. */
export function bestClimb(card, { altitude = 0, step = 0.5 } = {}) {
  const vs = stallSpeed(card, { altitude }).V;
  let best = { V: NaN, climb: -Infinity };
  for (let V = vs * 1.02; V <= card.vne; V += step) {
    const c = climbRate(card, V, { altitude });
    if (c != null && c > best.climb) best = { V, climb: c };
  }
  return best;
}

/**
 * The highest speed (m/s) of level flight at throttle τ (§9): maximum level speed at τ = 1, cruise
 * speed at a fraction of rated power below that. Searches down from 1.5 VNE; null when the throttle
 * can't hold level flight at any speed.
 */
export function levelSpeed(card, { throttle = 1, altitude = 0 } = {}) {
  const vs = stallSpeed(card, { altitude }).V;
  const climb = (V) => climbRate(card, V, { throttle, altitude });
  let hi = card.vne * 1.5, step = (hi - vs) / 60;
  let prev = climb(hi);
  for (let V = hi - step; V > vs; V -= step) {
    const c = climb(V);
    if (c != null && prev != null && c >= 0 && prev < 0) {
      let a = V, b = V + step;
      for (let i = 0; i < 60; i++) {
        const m = (a + b) / 2;
        if ((climb(m) ?? -1) >= 0) a = m; else b = m;
      }
      return (a + b) / 2;
    }
    prev = c;
  }
  return null;
}

/** The throttle that gives a fraction of rated power at an altitude (Gagg–Ferrar, §7.1). */
export function throttleForPower(fraction, { altitude = 0 } = {}) {
  const sigma = atmosphere(altitude).rho / atmosphere(0).rho;
  return fraction / Math.max(1e-9, 1.132 * sigma - 0.132);
}

/**
 * The sustained turn at speed V (§9): the largest load factor, up to the lift and load limits, at
 * which steady flight at full throttle with weight n W still holds γ ≥ 0, and its turn rate (rad/s).
 * { n, rate }; n = 1 and rate 0 where even level flight can't be held.
 */
export function sustainedTurn(card, V, { altitude = 0 } = {}) {
  const ok = (n) => (steady(card, V, { altitude, n })?.gamma ?? -1) >= 0;
  if (card.engines.length === 0 || !ok(1)) return { n: 1, rate: 0 };
  let lo = 1, hi = loadFactorAvailable(card, V, { altitude });
  if (ok(hi)) return { n: hi, rate: turnRate(hi, V) };
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (ok(m)) lo = m; else hi = m;
  }
  return { n: lo, rate: turnRate(lo, V) };
}

/** The maximum sustained turn rate (§9) over the stall to VNE: { V, n, rate }. */
export function maxSustainedTurn(card, { altitude = 0, step = 1 } = {}) {
  const vs = stallSpeed(card, { altitude }).V;
  let best = { V: NaN, n: 1, rate: 0 };
  for (let V = vs * 1.02; V <= card.vne; V += step) {
    const s = sustainedTurn(card, V, { altitude });
    if (s.rate > best.rate) best = { V, ...s };
  }
  return best;
}
