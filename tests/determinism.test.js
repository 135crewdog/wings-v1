// Determinism (flight-model §8): the same card, initial state and inputs give the same flight,
// bit for bit.

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCard } from "../src/sim/card.js";
import { Sim } from "../src/sim/sim.js";
import { glide, glideState } from "../src/sim/trim.js";
import { readCard } from "../tools/targets.js";

function fly() {
  const c = loadCard(readCard("twin-ii-acro"));
  const sim = new Sim(c, glideState(glide(c, 100 / 3.6), 1500));
  for (let i = 0; i < 30 * 120; i++) {
    const t = i / 120;
    // Every control moving, through a stall and a roll, so every term is exercised.
    sim.step({
      elevator: 0.6 * Math.sin(0.7 * t),
      aileron: 0.8 * Math.sin(1.3 * t),
      rudder: 0.5 * Math.cos(0.9 * t),
      airbrake: t > 10 && t < 20 ? 1 : 0,
    });
  }
  return sim.state;
}

test("two identical runs produce identical states, bit for bit", () => {
  const a = fly(), b = fly();
  for (const key of ["x", "v", "q", "omega"]) {
    a[key].forEach((x, i) => assert.ok(Object.is(x, b[key][i]), `${key}[${i}]: ${x} vs ${b[key][i]}`));
  }
  assert.ok(a.x.every(Number.isFinite) && a.q.every(Number.isFinite), "the flight stayed finite");
});
