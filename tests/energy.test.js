// With drag set to zero, free flight keeps kinetic plus potential energy: an honest check of the
// integrator (flight-model §8). Lift is perpendicular to the airflow and does no work.

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCard } from "../src/sim/card.js";
import { Sim } from "../src/sim/sim.js";
import { glide, glideState } from "../src/sim/trim.js";
import { readCard } from "../tools/targets.js";

/** A test copy of the card with no drag anywhere in §6.2. */
function draglessCard() {
  const json = structuredClone(readCard("twin-ii-acro"));
  json.drag.cd0 = 0;
  json.drag.cdw_peak = 0;
  json.wing.oswald_e = 1e15; // K ≈ 0: no induced drag
  // The flat-plate drag 2σ sin²α is drag too. Move the stall far from the flight (σ ≈ 1e-20)
  // by raising CLmax and sharpening the break; the flight stays below CL 1.2.
  json.wing.cl_max = 3;
  json.wing.cl_min = -3;
  json.wing.stall_softness_deg = 0.5;
  json.devices.airbrake.cd = 0;
  // Pitch damping (cmq) stays: it is not drag, the pitch rate in a phugoid is small, and without
  // it the dragless phugoid diverges into a loop and a stall.
  return loadCard(json);
}

const energy = (c, s) => {
  const v2 = s.v[0] ** 2 + s.v[1] ** 2 + s.v[2] ** 2;
  const rot = c.I[0] * s.omega[0] ** 2 + c.I[1] * s.omega[1] ** 2 + c.I[2] * s.omega[2] ** 2;
  return 0.5 * c.m * v2 + 0.5 * rot + c.m * 9.80665 * -s.x[2];
};

test("60 s of free flight with zero drag keeps kinetic plus potential energy within 0.1%", (t) => {
  const c = draglessCard();
  // Trimmed for 90 km/h but started at 105 km/h: a phugoid trades speed for height, without
  // reaching the stall (where flat-plate drag would appear).
  const trim = glide(c, 90 / 3.6, { altitude: 300 });
  assert.ok(trim.gamma < 1e-12, "with no drag the trimmed glide is level");
  const start = glideState(trim, 300);
  start.v = start.v.map((x) => x * (105 / 90));
  const sim = new Sim(c, start);
  const e0 = energy(c, sim.state);
  let worst = 0, vmin = Infinity, vmax = 0;
  for (let i = 0; i < 60 * 120; i++) {
    sim.step({ elevator: trim.elevator });
    worst = Math.max(worst, Math.abs(energy(c, sim.state) / e0 - 1));
    const v = Math.hypot(...sim.state.v);
    vmin = Math.min(vmin, v);
    vmax = Math.max(vmax, v);
  }
  t.diagnostic(`speed ranged ${(vmin * 3.6).toFixed(1)} to ${(vmax * 3.6).toFixed(1)} km/h; worst energy error ${worst.toExponential(2)}`);
  assert.ok(vmax - vmin > 5, "the phugoid should exchange real energy");
  assert.ok(worst <= 0.001, `energy drifted by ${(worst * 100).toFixed(4)}%`);
});
