// Turn performance (src/sim/performance.js): the hangar's corner speed and turn curves.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cornerSpeed, instantaneousTurns, loadFactorAvailable, turnRate } from "../src/sim/performance.js";
import { stallSpeed } from "../src/sim/trim.js";
import { card } from "./flight-helpers.js";

test("turn rate: zero at 1 g, g·√(n²−1)/V above it", () => {
  assert.equal(turnRate(1, 30), 0);
  assert.ok(Math.abs(turnRate(2, 30) - (9.80665 * Math.sqrt(3)) / 30) < 1e-12);
});

test("load factor: 1 at the stall speed, limited to g_max well above it", () => {
  const c = card(), vs = stallSpeed(c).V;
  assert.ok(Math.abs(loadFactorAvailable(c, vs) - 1) < 1e-9);
  assert.equal(loadFactorAvailable(c, c.vne), c.json.mass.g_max);
});

test("the corner speed is where the lift limit meets g_max, and no speed turns faster", () => {
  const c = card(), corner = cornerSpeed(c);
  assert.ok(Math.abs(loadFactorAvailable(c, corner.V) - c.json.mass.g_max) < 1e-6);
  const best = Math.max(...instantaneousTurns(c, { step: 0.05 }).map((p) => p.rate));
  assert.ok(Math.abs(best - corner.rate) < 1e-3, `${best} vs ${corner.rate}`);
});
