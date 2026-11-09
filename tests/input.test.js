// The controls' maths (docs/controls.md): the shaping curve, tilt and the gamepad.

import { test } from "node:test";
import assert from "node:assert/strict";
import { gamepadControls, mergeAxes, shape, slew, tiltControls, tiltOf, upInScreen, TILT } from "../src/input/curves.js";

const near = (a, b, tol = 1e-12) => Math.abs(a - b) <= tol;
const D = Math.PI / 180;

test("the curve: zero in the dead zone, full at the end, softer than linear near the centre, odd", () => {
  assert.equal(shape(0.07, 0.08, 1), 0);
  assert.equal(shape(1, 0.08, 1), 1);
  assert.equal(shape(1.5, 0.08, 1), 1);
  assert.equal(shape(-1, 0.08, 1), -1);
  const u = 0.1, x = 0.08 + u * 0.92;
  assert.ok(near(shape(x, 0.08, 1), 0.5 * u + 0.5 * u ** 3));
  assert.ok(shape(x, 0.08, 1) < u, "softer than linear");
  assert.ok(near(shape(-0.6, 0.08, 1), -shape(0.6, 0.08, 1)));
  for (let i = 1; i < 100; i++) assert.ok(shape(i / 100, 0.08, 1) >= shape((i - 1) / 100, 0.08, 1), "monotonic");
});

test("up in screen coordinates: flat on a table, upright in portrait, upright in both landscapes", () => {
  const flat = upInScreen(0, 0, 0);
  assert.ok(near(flat.x, 0) && near(flat.y, 0) && near(flat.z, 1));
  const portrait = upInScreen(90, 0, 0);
  assert.ok(near(portrait.x, 0, 1e-15) && near(portrait.y, 1) && near(portrait.z, 0, 1e-15));
  for (const [gamma, angle] of [[-90, 90], [90, 270]]) {
    const u = upInScreen(0, gamma, angle);
    assert.ok(near(u.x, 0, 1e-15) && near(u.y, 1) && near(u.z, 0, 1e-15), `gamma ${gamma}, screen ${angle}: ${JSON.stringify(u)}`);
  }
});

// Screen-frame up vectors for a phone held facing you, then tilted.
const held = (topTowardYou, clockwise) => {
  // Start upright (up = up the screen). Tilting the top edge toward you turns the screen to face
  // down, so up gains a component into the screen (−z). Turning clockwise, as seen by you, turns up
  // toward the screen's left (−x).
  const p = topTowardYou * D, r = clockwise * D;
  return tiltOf({ x: -Math.sin(r) * Math.cos(p), y: Math.cos(r) * Math.cos(p), z: -Math.sin(p) });
};

test("tilt: top edge toward you is stick back, clockwise is right roll, neutral is centre", () => {
  const neutral = held(0, 0);
  assert.deepEqual(tiltControls(neutral, neutral), { elevator: -0, aileron: -0 });
  assert.ok(tiltControls(held(10, 0), neutral).elevator > 0, "top toward you: elevator +");
  assert.ok(tiltControls(held(-10, 0), neutral).elevator < 0, "top away: elevator −");
  assert.ok(tiltControls(held(0, 10), neutral).aileron > 0, "clockwise: aileron +");
  assert.ok(tiltControls(held(0, -10), neutral).aileron < 0, "anticlockwise: aileron −");
});

test("tilt: full elevator at 25° of pitch, full aileron at 30° of roll, dead zones of 2° and 1.5°", () => {
  const neutral = held(0, 0);
  assert.ok(near(tiltControls(held(TILT.pitchFull, 0), neutral).elevator, 1, 1e-9));
  assert.ok(near(tiltControls(held(0, TILT.rollFull), neutral).aileron, 1, 1e-9));
  assert.ok(near(tiltControls(held(1.9, 0), neutral).elevator, 0));
  assert.ok(near(tiltControls(held(0, 1.4), neutral).aileron, 0));
  // measured from wherever neutral is, not from upright
  const reclined = held(-40, 0);
  assert.ok(near(tiltControls(reclined, reclined).elevator, 0));
  assert.ok(tiltControls(held(-30, 0), reclined).elevator > 0);
});

test("gamepad: pull back is nose up, right stick right is right roll, triggers are rudder, right stick back opens the airbrake", () => {
  const c = gamepadControls([1, 1, 0, 1], 0, 1);
  assert.deepEqual([c.aileron, c.elevator, c.rudder, c.leverRate], [1, 1, 1, 1]);
  const d = gamepadControls([-1, -1, 0, -1], 1, 0);
  assert.deepEqual([d.aileron, d.elevator, d.rudder, d.leverRate], [-1, -1, -1, -1]);
  const rest = gamepadControls([0.05, -0.07, 0.3, 0.02], 0.03, 0.04);
  assert.deepEqual([rest.aileron, rest.elevator, rest.rudder, rest.leverRate].map(Math.abs), [0, 0, 0, 0]);
});

test("keys slew to full and back in 0.25 s; the largest offer wins each axis", () => {
  let v = 0;
  for (let i = 0; i < 15; i++) v = slew(v, 1, 1 / 60);
  assert.ok(near(v, 1, 1e-9), `after 0.25 s: ${v}`);
  assert.ok(near(slew(0, 1, 0.1), 0.4));
  assert.deepEqual(mergeAxes([{ elevator: 0.2, aileron: -0.9 }, { elevator: -0.5, rudder: 0.1 }, null]),
    { elevator: -0.5, aileron: -0.9, rudder: 0.1 });
});
