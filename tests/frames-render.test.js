// NED to Three.js (src/render/frames.js) and every control-surface sign (src/render/surfaces.js).

import { test } from "node:test";
import assert from "node:assert/strict";
import { modelPose, nedToThree, quatToThree, rotateThree, threeToNed } from "../src/render/frames.js";
import { surfacePositions } from "../src/render/surfaces.js";
import { qfromEuler } from "../src/sim/vec.js";

const D = Math.PI / 180;
const close = (a, b, tol = 1e-12) => a.every((x, i) => Math.abs(x - b[i]) <= tol);
const NOSE = [0, 0, -1], RIGHT = [1, 0, 0], UP = [0, 1, 0]; // the model's axes

test("NED to Three: north is −z, east is +x, down is −y, and back", () => {
  assert.deepEqual(nedToThree([1, 0, 0]), [0, -0, -1]);
  assert.deepEqual(nedToThree([0, 1, 0]), [1, -0, -0]);
  assert.deepEqual(nedToThree([0, 0, 1]), [0, -1, -0]);
  const p = [123.5, -45.25, -1000];
  assert.ok(close(threeToNed(nedToThree(p)), p));
});

test("attitude: the model's nose, right wing and top follow the sim's heading, pitch and bank", () => {
  const cases = [
    { name: "level, north", q: qfromEuler(0, 0, 0), nose: [0, 0, -1], right: [1, 0, 0], up: [0, 1, 0] },
    { name: "level, east", q: qfromEuler(0, 0, 90 * D), nose: [1, 0, 0], right: [0, 0, 1], up: [0, 1, 0] },
    { name: "nose up 90°", q: qfromEuler(0, 90 * D, 0), nose: [0, 1, 0], right: [1, 0, 0], up: [0, 0, 1] },
    { name: "right wing down 90°", q: qfromEuler(90 * D, 0, 0), nose: [0, 0, -1], right: [0, -1, 0], up: [1, 0, 0] },
  ];
  for (const c of cases) {
    const qt = quatToThree(c.q);
    assert.ok(close(rotateThree(qt, NOSE), c.nose, 1e-12), `${c.name}: nose`);
    assert.ok(close(rotateThree(qt, RIGHT), c.right, 1e-12), `${c.name}: right wing`);
    assert.ok(close(rotateThree(qt, UP), c.up, 1e-12), `${c.name}: top`);
  }
});

test("the model is placed so the card's CG lands on the sim's CG", () => {
  const cg = { fromNose: 2.8, aboveNose: 0.21 };
  for (const q of [qfromEuler(0, 0, 0), qfromEuler(0.3, -0.2, 2.1)]) {
    const x = [100, -50, -300];
    const { position, quaternion } = modelPose(x, q, cg);
    const cgWorld = rotateThree(quaternion, [0, cg.aboveNose, cg.fromNose]).map((v, i) => v + position[i]);
    assert.ok(close(cgWorld, nedToThree(x), 1e-9));
  }
  // level and heading north, the nose tip is 2.8 m north of the CG and 0.21 m below it
  const { position } = modelPose([0, 0, -10], qfromEuler(0, 0, 0), cg);
  assert.ok(close(position, [0, 10 - 0.21, -2.8], 1e-12));
});

const PARTS = {
  elevator: { kind: "hinge", min_deg: -23.3, max_deg: 17.9 },
  rudder: { kind: "hinge", min_deg: -31.2, max_deg: 31.2 },
  aileron_l: { kind: "hinge", min_deg: -25.6, max_deg: 13.9 },
  aileron_r: { kind: "hinge", min_deg: -25.6, max_deg: 13.9 },
  airbrake_l: { kind: "slide", travel_m: 0.1777 },
  airbrake_r: { kind: "slide", travel_m: 0.1777 },
};
const at = (c) => surfacePositions({ elevator: 0, aileron: 0, rudder: 0, airbrake: 0, ...c }, PARTS);

test("elevator: stick back is trailing edge up (min_deg), forward is down (max_deg)", () => {
  assert.equal(at({ elevator: 1 }).elevator.deg, -23.3);
  assert.equal(at({ elevator: -1 }).elevator.deg, 17.9);
  assert.equal(at({}).elevator.deg, 0);
});

test("ailerons: right roll is right aileron up and left aileron down, and the reverse", () => {
  const right = at({ aileron: 1 });
  assert.equal(right.aileron_r.deg, -25.6);
  assert.equal(right.aileron_l.deg, 13.9);
  const left = at({ aileron: -1 });
  assert.equal(left.aileron_r.deg, 13.9);
  assert.equal(left.aileron_l.deg, -25.6);
});

test("rudder: right pedal is trailing edge right (min_deg; positive is trailing edge left)", () => {
  assert.equal(at({ rudder: 1 }).rudder.deg, -31.2);
  assert.equal(at({ rudder: -1 }).rudder.deg, 31.2);
});

test("airbrakes: both panels slide out by travel_m times the lever", () => {
  assert.equal(at({ airbrake: 1 }).airbrake_l.slide_m, 0.1777);
  assert.equal(at({ airbrake: 0.5 }).airbrake_r.slide_m, 0.1777 / 2);
  assert.equal(at({}).airbrake_l.slide_m, 0);
});
