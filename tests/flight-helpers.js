// Shared set-ups for the ground contact tests: the Twin II Acro over the test grid.

import { readFileSync } from "node:fs";
import { loadCard } from "../src/sim/card.js";
import { Sim } from "../src/sim/sim.js";
import { glide, glideState } from "../src/sim/trim.js";
import { makeGround } from "../src/world/ground.js";
import { qfromEuler, qrotateInv } from "../src/sim/vec.js";

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));

export const card = () => loadCard(read("data/aircraft/twin-ii-acro.json"));
export const place = () => read("data/places/test-grid.json");
export const ground = () => makeGround(place(), read("data/surfaces.json"));

/** At rest, level, its lowest contact point `gap` metres above the ground at (north, east). */
export function atRest(c, { gap = 0.3, north = 0, east = 0, roll = 0, speed = 0, heading = 0 } = {}) {
  const q = qfromEuler(roll, 0, heading);
  // the lowest point's depth below the CG with this attitude
  let low = -Infinity;
  for (const p of c.contacts) {
    const z = -Math.sin(0) * p.r[0] + Math.sin(roll) * p.r[1] + Math.cos(roll) * p.r[2];
    low = Math.max(low, z);
  }
  return {
    x: [north, east, -(low + gap)],
    v: [speed, 0, 0],
    q,
    omega: [0, 0, 0],
  };
}

/** A trimmed glide at `kmh`, the CG `height` metres up, at (north, east), heading north. */
export function gliding(c, kmh, height, { north = 0, east = 0 } = {}) {
  const trim = glide(c, kmh / 3.6, { altitude: height });
  return { trim, state: glideState(trim, height, { north, east }) };
}

export const newSim = (c, state) => new Sim(c, state, { ground: ground() });

/**
 * A trimmed glide at `kmh` (its attitude and airspeed along the ground), its main wheel `gap` metres
 * above the ground, coming down at exactly `sink` m/s (world axes), as in a hard arrival.
 */
export function arriving(c, kmh, sink, { gap = 0.05, north = 0 } = {}) {
  const { trim, state } = gliding(c, kmh, 10, { north });
  const main = c.contacts.find((p) => p.wheel && p.brake) ?? c.contacts[0];
  const th = trim.alpha - trim.gamma;
  const depth = -Math.sin(th) * main.r[0] + Math.cos(th) * main.r[2]; // main wheel below the CG
  state.x[2] = -(depth + gap);
  state.v = qrotateInv(state.q, [trim.V * Math.cos(trim.gamma), 0, sink]);
  return { trim, state };
}
