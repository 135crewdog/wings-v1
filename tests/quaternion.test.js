// Attitude kinematics through the real integrator (body.js): q̇ = ½ q ⊗ (0, ω), RK4 at 1/120 s.

import { test } from "node:test";
import assert from "node:assert/strict";
import { rk4Step } from "../src/sim/body.js";
import { DT } from "../src/sim/sim.js";
import { qangle, qfromAxisAngle, qnorm, qtoEuler } from "../src/sim/vec.js";

const I = [2807, 1137, 3921];
const noForces = () => ({ F: [0, 0, 0], M: [0, 0, 0] });
const still = (omega) => ({ x: [0, 0, 0], v: [0, 0, 0], q: [1, 0, 0, 0], omega });

test("a constant roll rate for 1 s turns the airplane by exactly that angle", () => {
  for (const p of [0.3, 1.0, -2.5]) {
    // Torque-free spin about a principal axis: ω stays constant.
    let s = still([p, 0, 0]);
    for (let i = 0; i < 120; i++) s = rk4Step(s, i * DT, DT, noForces, 580, I);
    assert.ok(Math.abs(s.omega[0] - p) < 1e-15, "roll rate changed");
    // Exact up to RK4's truncation error, which is 2.5e-10 rad at 2.5 rad/s.
    const expected = qfromAxisAngle([1, 0, 0], p * 1.0);
    const err = qangle(s.q, expected);
    assert.ok(err < 1e-9, `p = ${p}: attitude off by ${err} rad`);
    assert.ok(Math.abs(qtoEuler(s.q).roll - p) < 1e-9);
    assert.ok(Math.abs(qtoEuler(s.q).pitch) < 1e-15 && Math.abs(qtoEuler(s.q).yaw) < 1e-15);
  }
});

test("the quaternion norm stays 1 over 10,000 steps", () => {
  // A tumbling body (not about a principal axis), so every component of q moves.
  let s = still([0.7, -0.4, 1.1]);
  let worst = 0;
  for (let i = 0; i < 10000; i++) {
    s = rk4Step(s, i * DT, DT, noForces, 580, I);
    worst = Math.max(worst, Math.abs(qnorm(s.q) - 1));
  }
  assert.ok(worst < 1e-14, `norm drifted by ${worst}`);
});
