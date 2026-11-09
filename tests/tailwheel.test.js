// Tailwheel ground handling (flight-model 11.4): the Super Cub keeps straight on its takeoff roll
// with the rudder used; with the rudder left alone, a tail-up roll with a little sideslip diverges, a
// ground loop in the making; braking hard with the tail up noses it over. All from the contact forces.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadCard } from "../src/sim/card.js";
import { Sim } from "../src/sim/sim.js";
import { makeGround } from "../src/world/ground.js";
import { qfromEuler, qrotateInv, qtoEuler } from "../src/sim/vec.js";

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));
const c = loadCard(read("data/aircraft/super-cub.json"));
const ground = () => makeGround(read("data/places/test-grid.json"), read("data/surfaces.json"));
const D = 180 / Math.PI;
const main = c.contacts.find((p) => p.name === "main_left"), tail = c.contacts.find((p) => p.name === "tail_wheel");
const threePoint = Math.atan2(main.r[2] - tail.r[2], main.r[0] - tail.r[0]);

/** On the runway's centreline at `north`, pitched `pitch`, heading `skew` (deg) off north, moving north. */
function onRunway({ north = -450, pitch = threePoint, skew = 0, speed = 0 } = {}) {
  const q = qfromEuler(0, pitch, skew / D);
  const depth = -Math.sin(pitch) * main.r[0] + Math.cos(pitch) * main.r[2];
  return new Sim(c, { x: [north, 0, -depth + 0.005], v: qrotateInv(q, [speed, 0, 0]), q, omega: [0, 0, 0] }, { ground: ground() });
}
// a pilot's feet: rudder against the heading error and the yaw rate
const feet = (sim) => {
  const yaw = qtoEuler(sim.state.q).yaw;
  return Math.max(-1, Math.min(1, -yaw / (5 / D) - sim.state.omega[2] / (10 / D)));
};

test("the three-point attitude is about 12°, as on the drawing", () => {
  assert.ok(Math.abs(threePoint * D - 12) < 0.5, `${(threePoint * D).toFixed(2)}°`);
});

test("full power, the rudder used: a straight takeoff roll", (t) => {
  const sim = onRunway();
  let lift = null;
  for (let i = 0; i < 40 * 120 && !lift; i++) {
    sim.step(sim.t < 1 ? { throttle: 0 } : { throttle: 1, elevator: 0.3, rudder: feet(sim) });
    assert.equal(sim.crashed, null, JSON.stringify(sim.crashed));
    if (sim.t > 1 && !sim.touching.some(Boolean)) lift = { roll: sim.state.x[0] + 450, east: sim.state.x[1], mph: Math.hypot(...sim.state.v) * 2.237 };
  }
  assert.ok(lift, "never left the ground");
  t.diagnostic(`lift-off after ${lift.roll.toFixed(0)} m at ${lift.mph.toFixed(0)} mph, ${lift.east.toFixed(2)} m off the centreline`);
  assert.ok(Math.abs(lift.east) < 2, "left the centreline");
  assert.ok(lift.roll < 500, "the runway's first half");
});

test("tail up with a little sideslip: straight with the rudder, a swerve off the runway without", (t) => {
  const roll = (useRudder) => {
    const sim = onRunway({ pitch: 0.03, skew: 5, speed: 18 });
    let worst = 0;
    for (let i = 0; i < 12 * 120; i++) {
      sim.step({ throttle: 0.05, rudder: useRudder ? feet(sim) : 0 });
      if (sim.crashed) break;
      worst = Math.max(worst, Math.abs(qtoEuler(sim.state.q).yaw * D));
    }
    return { worst, east: sim.state.x[1], hdg: qtoEuler(sim.state.q).yaw * D };
  };
  const steered = roll(true), loose = roll(false);
  t.diagnostic(`with rudder: ${steered.east.toFixed(1)} m off, heading ${steered.hdg.toFixed(1)}°; ` +
    `without: ${loose.east.toFixed(1)} m off, heading up to ${loose.worst.toFixed(1)}°`);
  assert.ok(Math.abs(steered.east) < 2 && Math.abs(steered.hdg) < 1);
  assert.ok(loose.worst > 10, "the yaw grew"); // from 5°
  assert.ok(Math.abs(loose.east) > 15, "off the 30 m runway");
});

test("closing the throttle with the tail up doesn't brake; the brakes wait for the tailwheel, then stop it", () => {
  // a wheel landing: tail up at 24 m/s (54 mph), throttle closed, stick neutral
  const sim = onRunway({ pitch: 0.03, speed: 24 });
  let tailDown = null;
  for (let i = 0; i < 25 * 120; i++) {
    sim.step({ throttle: 0, elevator: 0, rudder: feet(sim) });
    assert.equal(sim.crashed, null, JSON.stringify(sim.crashed));
    const tw = c.contacts.findIndex((p) => p.name === "tail_wheel");
    if (tailDown === null && sim.touching[tw]) tailDown = Math.hypot(...sim.state.v);
  }
  assert.ok(tailDown !== null, "the tail never came down");
  assert.ok(Math.hypot(...sim.state.v) < 0.1, "still rolling");
  // a stop on the brakes in the three-point attitude
  const three = onRunway({ speed: 15 });
  for (let i = 0; i < 15 * 120; i++) three.step({ throttle: 0, elevator: 1, rudder: feet(three) });
  assert.equal(three.crashed, null);
  assert.ok(Math.hypot(...three.state.v) < 0.1, "still rolling");
});

test("differential brakes: right pedal at idle turns the airplane right", () => {
  const sim = onRunway({ pitch: threePoint, speed: 5 });
  for (let i = 0; i < 2 * 120; i++) sim.step({ throttle: 0, elevator: 1, rudder: 1 });
  assert.ok(qtoEuler(sim.state.q).yaw * D > 5);
});
