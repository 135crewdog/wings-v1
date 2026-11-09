// The HUD's figures from the sim (pure, tested): airspeed, altitude, vertical speed, heading, g and
// angle of attack, in the pilot's chosen units. Cards keep their source units; only
// the display converts.

import { atmosphere } from "../sim/atmosphere.js";
import { pointState } from "../sim/contact.js";
import { qrotate } from "../sim/vec.js";

const RHO0 = 1.225, G0 = 9.80665;
export const UNITS = {
  us: { speed: ["kt", 1.943844], height: ["ft", 3.28084], vs: ["ft/min", 196.850394] },
  metric: { speed: ["km/h", 3.6], height: ["m", 1], vs: ["m/s", 1] },
};

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

/** The figures as display strings with their units. Vertical speed in ft/min to the nearest 10. */
export function format(r, units = "us") {
  const u = UNITS[units];
  const vs = r.vs * u.vs[1];
  const vsText = units === "us" ? String(Math.abs(Math.round(vs / 10) * 10)) : Math.abs(vs).toFixed(1);
  return {
    speed: `${Math.round(r.ias * u.speed[1])} ${u.speed[0]}`,
    altitude: `${Math.round(r.altitude * u.height[1])} ${u.height[0]}`,
    vs: `${vsText === "0" || vsText === "0.0" ? "" : vs > 0 ? "+" : "−"}${vsText} ${u.vs[0]}`,
    heading: String(Math.round(r.heading) % 360).padStart(3, "0"),
    g: `${r.g.toFixed(1)} g`,
    alpha: `α ${r.alpha.toFixed(1)}°`,
  };
}
