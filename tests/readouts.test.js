// The HUD's figures and units (src/ui/readouts.js).

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
  assert.ok(r.vs < 0 && r.vs > -1, `vs ${r.vs}`);
  assert.ok(Math.abs(r.g - 1) < 0.01, `g ${r.g}`);
  assert.ok(r.heading < 1e-9 || r.heading > 359.999, `heading ${r.heading}`);
  assert.ok(r.alpha > 0 && r.alpha < 10);
  const f = format(r, "metric");
  assert.equal(f.speed, "93 km/h");
  assert.match(f.heading, /^000$|^360$/);
});

test("units: knots, feet and knots of climb for the US; km/h, metres and m/s otherwise", () => {
  const r = { ias: 100 / 1.943844, height: 1000 / 3.28084, vs: -1, heading: 90.4, g: 1.04, alpha: 4.26 };
  assert.deepEqual(format(r, "us"), { speed: "100 kt", height: "1000 ft", vs: "−1.9 kt", heading: "090", g: "1.0 g", alpha: "α 4.3°" });
  assert.deepEqual(format(r, "metric"), { speed: "185 km/h", height: "305 m", vs: "−1.0 m/s", heading: "090", g: "1.0 g", alpha: "α 4.3°" });
});

test("on the ground at rest: height 0, 1 g", () => {
  const c = card();
  const sim = newSim(c, atRest(c, { gap: 0 }));
  for (let i = 0; i < 4 * 120; i++) sim.step({});
  const r = readouts(sim, sim.observe({}));
  assert.ok(r.height <= 0 && r.height > -0.1, `height ${r.height}`);
  assert.ok(Math.abs(r.g - 1) < 0.01, `g ${r.g}`);
});
