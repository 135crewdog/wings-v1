// The HUD's figures (src/ui/readouts.js).

import { test } from "node:test";
import assert from "node:assert/strict";
import { format, readouts } from "../src/ui/readouts.js";
import { card, gliding, newSim, atRest } from "./flight-helpers.js";

test("in a trimmed glide at 95 km/h true, 500 m up: about 93 km/h indicated, 1 g, sinking, heading north", () => {
  const c = card();
  const { state } = gliding(c, 95, 500); // thinner air: the indicated airspeed reads a little low
  const sim = newSim(c, state);
  const r = readouts(sim, sim.observe({}));
  assert.ok(Math.abs(r.height - (500 - 0.6)) < 0.1, `height ${r.height}`);
  assert.equal(r.altitude, 500);
  assert.ok(r.vs < 0 && r.vs > -1, `vs ${r.vs}`);
  assert.ok(Math.abs(r.g - 1) < 0.01, `g ${r.g}`);
  assert.ok(r.heading < 1e-9 || r.heading > 359.999, `heading ${r.heading}`);
  assert.ok(r.alpha > 0 && r.alpha < 10);
  assert.equal(format(r).speed, "50"); // 93 km/h indicated
});

test("the HUD's numbers: knots, feet and feet per minute to the nearest 10, no units shown", () => {
  const r = { ias: 100 / 1.943844, altitude: 1000 / 3.28084, height: 0, vs: -1, heading: 90.4, g: 1.04, alpha: 4.26 };
  assert.deepEqual(format(r), { speed: "100", altitude: "1000", vs: "−200" });
  assert.equal(format({ ...r, vs: 0.02 }).vs, "0");
  assert.equal(format({ ...r, vs: 2.5 }).vs, "+490");
});

test("on the ground at rest: height 0, 1 g", () => {
  const c = card();
  const sim = newSim(c, atRest(c, { gap: 0 }));
  for (let i = 0; i < 4 * 120; i++) sim.step({});
  const r = readouts(sim, sim.observe({}));
  assert.ok(r.height <= 0 && r.height > -0.1, `height ${r.height}`);
  assert.ok(Math.abs(r.g - 1) < 0.01, `g ${r.g}`);
});
