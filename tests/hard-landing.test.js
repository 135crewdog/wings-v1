// Hard landing (flight-model §11.6): a wheel hitting the ground at 4 m/s sink is a crash; a normal
// arrival isn't.

import { test } from "node:test";
import assert from "node:assert/strict";
import { card, arriving, newSim } from "./flight-helpers.js";

function arrive(sink, gap = 0.05) {
  const c = card();
  const { trim, state } = arriving(c, 95, sink, { gap });
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

test("the limit applies to the speed the wheel arrives with, wherever in a step it touches", () => {
  // Touching just after a step begins, the contact's damping slows the wheel within that step:
  // the check must see 3.3 m/s, not what is left of it at the step's end.
  for (const gap of [0.001, 0.01, 0.03, 0.05]) {
    assert.ok(arrive(3.3, gap), `3.3 m/s from ${gap} m up: no crash`);
    assert.equal(arrive(2.9, gap), null, `2.9 m/s from ${gap} m up: a crash`);
  }
});
