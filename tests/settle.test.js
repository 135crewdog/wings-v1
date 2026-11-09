// Settle (flight-model §11): dropped 0.3 m onto the runway at rest, the glider settles onto its
// wheels and is still within 5 s, with no contact point bouncing off the ground after the first second.

import { test } from "node:test";
import assert from "node:assert/strict";
import { card, atRest, newSim } from "./flight-helpers.js";

test("placed 0.3 m above the runway, it settles onto its wheels and is still within 5 s", (t) => {
  const c = card();
  const sim = newSim(c, atRest(c, { gap: 0.3 }));
  let prev = sim.touching.slice(), lateLeaves = [], restAt = null;
  for (let i = 0; i < 5 * 120; i++) {
    sim.step({});
    sim.touching.forEach((now, k) => {
      if (prev[k] && !now && sim.t > 1) lateLeaves.push(`${c.contacts[k].name} at ${sim.t.toFixed(2)} s`);
    });
    prev = sim.touching.slice();
    const still = Math.hypot(...sim.state.v) < 0.01 && Math.hypot(...sim.state.omega) < 0.01;
    restAt = still ? restAt ?? sim.t : null;
  }
  const on = c.contacts.filter((_, k) => sim.touching[k]).map((p) => p.name);
  t.diagnostic(`still from ${restAt?.toFixed(2)} s, resting on ${on.join(" and ")}`);
  assert.equal(sim.crashed, null);
  assert.ok(restAt !== null, "not still after 5 s");
  assert.deepEqual(lateLeaves, [], "contact points bounced off after the first second");
  assert.ok(on.includes("main_wheel"), "not on its main wheel");
  assert.ok(on.every((n) => n.endsWith("_wheel")), `resting on more than wheels: ${on}`);
});
