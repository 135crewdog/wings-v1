// Landing (flight-model §11): from a trimmed glide at 95 km/h, 10 m up, flown hands off to
// touchdown, it doesn't crash, rolls out, and stops on the runway with the wheel brake.

import { test } from "node:test";
import assert from "node:assert/strict";
import { card, gliding, newSim, place } from "./flight-helpers.js";
import { onRunway, runwayFrame } from "../src/world/ground.js";

test("a hands-off landing from 10 m rolls out and stops on the runway with the wheel brake", (t) => {
  const c = card();
  const { trim, state } = gliding(c, 95, 10, { north: -450 });
  const sim = newSim(c, state);
  const main = c.contacts.findIndex((p) => p.name === "main_wheel");
  let touchdown = null, airbrake = 0;
  for (let i = 0; i < 120 * 120; i++) {
    sim.step({ elevator: trim.elevator, airbrake });
    if (sim.crashed) break;
    if (!touchdown && sim.touching[main]) {
      touchdown = { t: sim.t, north: sim.state.x[0], kmh: Math.hypot(...sim.state.v) * 3.6, sink: sim.velocityWorld()[2] };
    }
    if (touchdown && sim.t > touchdown.t + 1) airbrake = 1; // full airbrake: past 0.95, the wheel brake is on
    if (touchdown && Math.hypot(...sim.state.v) < 0.05 && Math.hypot(...sim.state.omega) < 0.05) break;
  }
  assert.equal(sim.crashed, null, `crashed: ${JSON.stringify(sim.crashed)}`);
  assert.ok(touchdown, "never touched down");
  const roll = sim.state.x[0] - touchdown.north;
  t.diagnostic(`touchdown ${touchdown.kmh.toFixed(1)} km/h, sink ${touchdown.sink.toFixed(2)} m/s; ` +
    `ground roll ${roll.toFixed(0)} m, stopped ${(sim.t - touchdown.t).toFixed(1)} s after touchdown`);
  assert.ok(Math.hypot(...sim.state.v) < 0.05, "still rolling");
  const rw = place().runways[0];
  const p = onRunway(runwayFrame(rw), sim.state.x[0], sim.state.x[1]);
  assert.ok(Math.abs(p.along) <= rw.length_m / 2 && Math.abs(p.across) <= rw.width_m / 2, `stopped off the runway: ${JSON.stringify(p)}`);
});

test("the wheel brake works only with the speed brakes fully open", async () => {
  const { atRest } = await import("./flight-helpers.js");
  const roll = (airbrake) => {
    const c = card();
    const sim = newSim(c, atRest(c, { gap: 0, speed: 10 }));
    for (let i = 0; i < 2 * 120; i++) sim.step({ airbrake });
    return Math.hypot(...sim.state.v);
  };
  // 0.998, 0.999 and 1 have the same airbrake drag to a thousandth; only the wheel brake differs.
  const a = roll(0.998), almost = roll(0.999), full = roll(1);
  assert.ok(Math.abs(almost - a) < 0.005, `at 99.9% the brake is off: ${almost.toFixed(3)} vs ${a.toFixed(3)} m/s`);
  assert.ok(full < almost - 3, `fully open, the brake slows it: ${full.toFixed(2)} vs ${almost.toFixed(2)} m/s`);
});
