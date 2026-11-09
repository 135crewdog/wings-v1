// Turn performance for the hangar's figures and its energy-manoeuvrability diagram (flight-model
// §9 and §12). Pure, on the loaded card and the trim functions; no copy of the physics.

import { atmosphere } from "./atmosphere.js";
import { stallSpeed } from "./trim.js";

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
