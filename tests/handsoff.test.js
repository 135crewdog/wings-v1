// Hands off (flight-model §9, dynamic check): from a trimmed glide at 95 km/h, 60 s with the
// elevator held at its trim value and everything else neutral stays within 2 km/h and 0.5°.

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCard } from "../src/sim/card.js";
import { Sim } from "../src/sim/sim.js";
import { glide, glideState } from "../src/sim/trim.js";
import { readCard } from "../tools/targets.js";

const ALTITUDE = 1000;

test("a trimmed glide at 95 km/h holds speed within 2 km/h and path within 0.5° for 60 s", (t) => {
  const c = loadCard(readCard("twin-ii-acro"));
  const trim = glide(c, 95 / 3.6, { altitude: ALTITUDE });
  const sim = new Sim(c, glideState(trim, ALTITUDE));
  const controls = { elevator: trim.elevator, aileron: 0, rudder: 0, airbrake: 0 };
  let dV = 0, dGamma = 0;
  for (let i = 0; i < 60 * 120; i++) {
    sim.step(controls);
    const vw = sim.velocityWorld();
    const V = Math.hypot(...vw);
    const gamma = Math.atan2(vw[2], Math.hypot(vw[0], vw[1])); // positive descending
    dV = Math.max(dV, Math.abs(V - trim.V) * 3.6);
    dGamma = Math.max(dGamma, (Math.abs(gamma - trim.gamma) * 180) / Math.PI);
  }
  t.diagnostic(`trim: α ${((trim.alpha * 180) / Math.PI).toFixed(3)}°, δe ${trim.elevator.toFixed(4)}, glide angle ${((trim.gamma * 180) / Math.PI).toFixed(3)}°`);
  t.diagnostic(`largest departure: ${dV.toExponential(2)} km/h, ${dGamma.toExponential(2)}°; height lost ${(ALTITUDE + sim.state.x[2]).toFixed(1)} m`);
  assert.ok(dV <= 2, `speed departed by ${dV.toFixed(3)} km/h`);
  assert.ok(dGamma <= 0.5, `flight path departed by ${dGamma.toFixed(3)}°`);
});
