// Wingtip (flight-model §11): at walking pace with one wing down, the tip touches and the glider
// swings toward it, without a crash.

import { test } from "node:test";
import assert from "node:assert/strict";
import { card, atRest, newSim } from "./flight-helpers.js";
import { qtoEuler } from "../src/sim/vec.js";

for (const [side, roll, index] of [["left", -3, "tip_left"], ["right", 3, "tip_right"]]) {
  test(`at walking pace with the ${side} wing down, the tip touches and it swings toward it`, (t) => {
    const c = card();
    const sim = newSim(c, atRest(c, { gap: 0, speed: 1.4, roll: (roll * Math.PI) / 180 }));
    const tip = c.contacts.findIndex((p) => p.name === index);
    const h0 = qtoEuler(sim.state.q).yaw;
    let touched = null;
    for (let i = 0; i < 10 * 120 && !sim.crashed; i++) {
      sim.step({});
      if (touched === null && sim.touching[tip]) touched = sim.t;
    }
    const turn = ((qtoEuler(sim.state.q).yaw - h0) * 180) / Math.PI;
    t.diagnostic(`tip down at ${touched?.toFixed(2)} s; heading changed ${turn.toFixed(1)}°`);
    assert.equal(sim.crashed, null, `crashed: ${JSON.stringify(sim.crashed)}`);
    assert.ok(touched !== null, "the tip never touched");
    assert.ok(Math.sign(turn) === Math.sign(roll) && Math.abs(turn) > 1, `swung ${turn.toFixed(1)}°, not toward the ${side} tip`);
  });
}
