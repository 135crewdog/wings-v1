// The test grid's ground (flight-model §11.1) and start positions.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ground, place } from "./flight-helpers.js";
import { startPose } from "../src/world/ground.js";

test("flat at sea level, paved on the runway and grass beside it", () => {
  const g = ground();
  assert.equal(g.heightAt(123, -456), 0);
  assert.equal(g.surfaceAt(0, 0), "pavement");
  assert.equal(g.surfaceAt(499, 14.9), "pavement");
  assert.equal(g.surfaceAt(0, 15.1), "grass");
  assert.equal(g.surfaceAt(501, 0), "grass");
  assert.ok(g.surfaces.grass.mu_roll > g.surfaces.pavement.mu_roll);
});

test("start positions: high over the runway, circuit on a left-hand downwind, final 2 km out on a 2.9° path", () => {
  const p = place();
  const high = startPose(p, "high"), circuit = startPose(p, "circuit"), final = startPose(p, "final");
  assert.equal(high.altitude, 1000);
  assert.ok(Math.abs(high.east) < 1e-9 && high.heading === 0);
  assert.equal(circuit.altitude, 300);
  assert.ok(circuit.east < -500 && Math.abs(circuit.heading - Math.PI) < 1e-12, "downwind is west of the runway, heading south");
  const threshold = -p.runways[0].length_m / 2;
  const distance = threshold - final.north;
  assert.ok(Math.abs(distance - 2000) < 1e-9);
  const path = (Math.atan2(final.altitude, distance) * 180) / Math.PI;
  assert.ok(path > 2.5 && path < 3.5, `glidepath ${path.toFixed(2)}°`);
  for (const s of [high, circuit, final]) assert.ok(Math.abs(s.speed - 95 / 3.6) < 1e-12);
});
