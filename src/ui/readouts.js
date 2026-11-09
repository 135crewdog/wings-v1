// The HUD's figures from the sim (pure, tested): airspeed, altitude and vertical speed, shown in
// knots, feet and feet per minute; heading, g and angle of attack for tools and tests. Cards keep
// their source units; only the display converts.

import { atmosphere } from "../sim/atmosphere.js";
import { pointState } from "../sim/contact.js";
import { qrotate } from "../sim/vec.js";

const RHO0 = 1.225, G0 = 9.80665;
const KT = 1.943844, FT = 3.28084, FPM = 196.850394; // per m/s, per m, per m/s

/**
 * The figures in SI: { ias, altitude (the CG above sea level), height (the lowest wheel above the
 * ground), vs, heading (deg), g, alpha (deg) }.
 */
export function readouts(sim, observed) {
  const s = sim.state, c = sim.card;
  const rho = atmosphere(-s.x[2]).rho;
  const vw = qrotate(s.q, s.v);
  let height = -s.x[2] - (sim.ground ? sim.ground.heightAt(s.x[0], s.x[1]) : 0);
  if (sim.ground && c.contacts.length) height = Math.min(...c.contacts.map((p) => -pointState(s, p.r, sim.ground).d));
  const nose = qrotate(s.q, [1, 0, 0]);
  const fz = observed.aero.F[2] + observed.contact.F[2]; // body z, down: what the seat pushes up with is −fz
  return {
    ias: observed.air.V * Math.sqrt(rho / RHO0),
    altitude: -s.x[2],
    height,
    vs: -vw[2],
    heading: ((Math.atan2(nose[1], nose[0]) * 180) / Math.PI + 360) % 360,
    g: -fz / (c.m * G0),
    alpha: (observed.air.alpha * 180) / Math.PI,
  };
}

/**
 * The HUD's numbers, without units: they are always knots (airspeed), feet (altitude) and feet per
 * minute (vertical speed, to the nearest 10).
 */
export function format(r) {
  const vs = Math.round((r.vs * FPM) / 10) * 10;
  return {
    speed: String(Math.round(r.ias * KT)),
    altitude: String(Math.round(r.altitude * FT)),
    vs: vs === 0 ? "0" : `${vs > 0 ? "+" : "−"}${Math.abs(vs)}`,
  };
}
