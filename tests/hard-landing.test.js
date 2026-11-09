// Hard landing (flight-model §11.6): a wheel hitting the ground at 4 m/s sink is a crash; a normal
// arrival isn't.

import { test } from "node:test";
import assert from "node:assert/strict";
import { card, arriving, newSim } from "./flight-helpers.js";

function arrive(sink) {
  const c = card();
  const { trim, state } = arriving(c, 95, sink);
  const sim = newSim(c, state);
  for (let i = 0; i < 2 * 120 && !sim.crashed; i++) sim.step({ elevator: trim.elevator });
  return sim.crashed;
}

test("hitting the ground at 4 m/s sink is a crash", () => {
  const crash = arrive(4);
  assert.ok(crash, "no crash");
  assert.equal(crash.reason, "wheel sink rate");
  assert.ok(crash.value > 3);
});

test("a normal arrival at 1 m/s sink is not a crash", () => {
  assert.equal(arrive(1), null);
});
