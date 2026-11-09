// Frames and signs (flight-model §1, §4, §7).

import { test } from "node:test";
import assert from "node:assert/strict";
import { airData, liftDirection } from "../src/sim/aero.js";
import { atmosphere } from "../src/sim/atmosphere.js";
import { qfromEuler, qrotate } from "../src/sim/vec.js";

const DEG = Math.PI / 180;
const close = (a, b, tol = 1e-15) => a.every((x, i) => Math.abs(x - b[i]) <= tol);

test("with β = 0, the lift direction is (sin α, 0, −cos α)", () => {
  for (const deg of [-20, -5, 0, 3, 10, 45, 80]) {
    const a = deg * DEG;
    const L = liftDirection([Math.cos(a), 0, Math.sin(a)]);
    assert.ok(close(L, [Math.sin(a), 0, -Math.cos(a)]), `α = ${deg}°: ${L}`);
  }
});

test("air data: α from w and u, β from v, positive nose-up and wind from the right", () => {
  const card = { b: 17.5, cbar: 1.0 };
  const atm = atmosphere(0);
  const V = 30, a = 5 * DEG, b = 3 * DEG;
  const v = [V * Math.cos(a) * Math.cos(b), V * Math.sin(b), V * Math.sin(a) * Math.cos(b)];
  const d = airData(card, v, [1, 0, 0, 0], [0, 0, 0], [0, 0, 0], atm);
  assert.ok(Math.abs(d.alpha - a) < 1e-15 && Math.abs(d.beta - b) < 1e-15);
});

test("NED and body axes: nose up is negative world z, a right turn heads east", () => {
  assert.ok(close(qrotate(qfromEuler(0, 30 * DEG, 0), [1, 0, 0]), [Math.cos(30 * DEG), 0, -Math.sin(30 * DEG)]));
  assert.ok(close(qrotate(qfromEuler(0, 0, 90 * DEG), [1, 0, 0]), [0, 1, 0]));
  assert.ok(close(qrotate(qfromEuler(90 * DEG, 0, 0), [0, 1, 0]), [0, 0, 1])); // right wing down
});
