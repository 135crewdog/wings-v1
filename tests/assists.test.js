// The assists (docs/controls.md), flown in the 6-DOF sim: auto-rudder keeps the sideslip small,
// auto-trim holds the speed you were flying when you let go, auto-level brings the wings back level.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createAssists } from "../src/input/assists.js";
import { DT, Sim } from "../src/sim/sim.js";
import { glide, glideState } from "../src/sim/trim.js";
import { qfromEuler, qtoEuler } from "../src/sim/vec.js";
import { card } from "./flight-helpers.js";

const D = Math.PI / 180, KMH = 3.6;

/** Fly `secs` from a trimmed glide at 95 km/h, 1,500 m up, with pilot(t) and the assists `on`. */
function fly(secs, pilot, on, { bank = 0 } = {}) {
  const c = card();
  const trim = glide(c, 95 / KMH, { altitude: 1500 });
  const s = glideState(trim, 1500);
  if (bank) s.q = qfromEuler(bank, trim.alpha - trim.gamma, 0);
  const sim = new Sim(c, s);
  const assists = createAssists(c, trim.elevator);
  const log = [];
  for (let i = 0; i < secs / DT; i++) {
    const t = i * DT, p = { elevator: 0, aileron: 0, rudder: 0, airbrake: 0, ...pilot(t) };
    const flown = assists.update(p, sim, sim.observe(p), DT, on);
    sim.step(flown);
    const o = sim.observe(flown);
    log.push({ t, beta: o.air.beta, V: o.air.V, bank: qtoEuler(sim.state.q).roll, flown });
  }
  return log;
}
const ALL = { rudder: true, trim: true, level: true };

test("auto-rudder: a roll with the ailerons keeps the sideslip small", (t) => {
  const pilot = (time) => ({ aileron: time < 3 ? 0.6 : 0 });
  const slip = (on) => Math.max(...fly(8, pilot, { ...on, level: false }).map((x) => Math.abs(x.beta))) / D;
  const off = slip({ rudder: false, trim: false }), onn = slip({ rudder: true, trim: false });
  t.diagnostic(`largest sideslip: ${off.toFixed(1)}° without, ${onn.toFixed(1)}° with`);
  assert.ok(onn < 2, `${onn.toFixed(2)}°`);
  assert.ok(onn < off / 2);
});

test("auto-rudder: the pilot's rudder takes over", () => {
  const log = fly(2, () => ({ rudder: -0.5 }), ALL);
  assert.equal(log.at(-1).flown.rudder, -0.5);
});

test("auto-trim: hold a pull, let go, and it flies on as if you were still holding it", (t) => {
  const released = fly(45, (time) => ({ elevator: time < 15 ? 0.2 : 0 }), ALL);
  const holding = fly(45, () => ({ elevator: 0.2 }), ALL);
  const without = fly(45, (time) => ({ elevator: time < 15 ? 0.2 : 0 }), { ...ALL, trim: false });
  const at = (log, s) => log[Math.round(s / DT) - 1].V * KMH;
  t.diagnostic(`at 45 s: let go ${at(released, 45).toFixed(1)} km/h, still holding ${at(holding, 45).toFixed(1)}, let go without auto-trim ${at(without, 45).toFixed(1)}`);
  assert.ok(at(holding, 45) < 95 - 8, "the pull slows it");
  assert.ok(Math.abs(at(released, 45) - at(holding, 45)) < 1, "letting go holds that speed");
  assert.ok(at(without, 45) > at(released, 45) + 8, "without auto-trim it goes back toward the start speed");
});

test("auto-trim: the elevator doesn't move while the trim takes over a held stick", () => {
  const log = fly(12, () => ({ elevator: 0.1 }), ALL);
  const e = log.slice(Math.round(1 / DT)).map((x) => x.flown.elevator);
  assert.ok(Math.max(...e) - Math.min(...e) < 1e-9, `${Math.min(...e)} to ${Math.max(...e)}`);
});

test("auto-level: with the phone at neutral, a 30° bank rolls back to level", (t) => {
  const level = fly(12, () => ({}), ALL, { bank: 30 * D }), held = fly(12, () => ({}), { ...ALL, level: false }, { bank: 30 * D });
  t.diagnostic(`bank after 12 s: ${(level.at(-1).bank / D).toFixed(1)}° with, ${(held.at(-1).bank / D).toFixed(1)}° without`);
  assert.ok(Math.abs(level.at(-1).bank) < 3 * D);
  assert.ok(Math.abs(held.at(-1).bank) > 15 * D);
});

test("the assists only move controls, within their ranges", () => {
  for (const x of fly(10, (time) => ({ elevator: 0.5 * Math.sin(time), aileron: 0.02 }), ALL)) {
    for (const k of ["elevator", "aileron", "rudder"]) assert.ok(Math.abs(x.flown[k]) <= 1, k);
    assert.deepEqual(Object.keys(x.flown).sort(), ["aileron", "airbrake", "elevator", "rudder"]);
  }
});
