// Ground effect (flight-model §6.2): McCormick's factor on induced drag, from the CG's height.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadCard } from "../src/sim/card.js";
import { groundEffect } from "../src/sim/aero.js";
import { Sim, totalForces } from "../src/sim/sim.js";
import { glide, glideState } from "../src/sim/trim.js";

const ctl = (trim) => ({ elevator: trim.elevator, aileron: 0, rudder: 0, airbrake: 0 });
const card = loadCard(JSON.parse(readFileSync(new URL("../data/aircraft/twin-ii-acro.json", import.meta.url))));
const flat = {
  heightAt: () => 0,
  surfaceAt: () => "grass",
  surfaces: { grass: { mu_roll: 0.05, mu_side: 0.6, mu_brake: 0.4, mu_skid: 0.5 } },
};

test("McCormick's factor at the doc's heights", () => {
  const b = 10;
  assert.ok(Math.abs(groundEffect(0.1 * b, b) - 0.719) < 0.001);
  assert.ok(Math.abs(groundEffect(0.2 * b, b) - 0.911) < 0.001);
  assert.ok(Math.abs(groundEffect(0.5 * b, b) - 0.985) < 0.001);
  assert.equal(groundEffect(-1, b), 0);
});

test("near the ground only the induced drag changes", () => {
  const trim = glide(card, 25);
  const st = glideState(trim, 1.5); // CG 1.5 m up, wheels clear
  const free = totalForces(card, st, 0, ctl(trim));
  const near = totalForces(card, st, 0, ctl(trim), undefined, flat);
  assert.equal(near.contact.F.every((f) => f === 0), true);
  assert.equal(near.coef.CL, free.coef.CL);
  assert.equal(near.coef.Cm, free.coef.Cm);
  const induced = card.K * free.coef.CLatt ** 2 * (1 - free.coef.sigma);
  const phi = groundEffect(1.5, card.b);
  assert.ok(Math.abs(free.coef.CD - near.coef.CD - (1 - phi) * induced) < 1e-12);
});

test("just above the runway, the glider loses its energy more slowly than in free air", () => {
  // fly 1 s from the same glide, CG 2 m up (the wheels stay clear), once over the ground and once without
  const trim = glide(card, 25);
  const lost = (ground) => {
    const sim = new Sim(card, glideState(trim, 2.0), { ground });
    const energy = () => 0.5 * Math.hypot(...sim.state.v) ** 2 - 9.80665 * sim.state.x[2];
    const e0 = energy();
    for (let i = 0; i < 120; i++) {
      sim.step({ elevator: trim.elevator });
      assert.equal(sim.touching.some(Boolean), false);
    }
    return e0 - energy();
  };
  const free = lost(null), near = lost(flat);
  assert.ok(near < 0.9 * free, `energy lost over the ground ${near.toFixed(2)} J/kg, in free air ${free.toFixed(2)} J/kg`);
});
