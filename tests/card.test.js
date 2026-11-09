// Card loading and the derived quantities of flight-model §5, for the Twin II Acro.

import { test } from "node:test";
import assert from "node:assert/strict";
import { liftCurve, alphaCPos } from "../src/sim/aero.js";
import { firstPeak, loadCard } from "../src/sim/card.js";
import { readCard } from "../tools/targets.js";

const json = readCard("twin-ii-acro");
const c = loadCard(json);
const near = (got, want, tol, what) => assert.ok(Math.abs(got - want) <= tol, `${what}: ${got}, want ${want} ± ${tol}`);

test("aspect ratio 17.21, CLα 5.595 per rad, K 0.0218", () => {
  near(c.AR, 17.21, 0.005, "AR");
  near(c.CLa, 5.595, 0.0005, "CLα");
  near(c.K, 0.0218, 0.00005, "K");
});

test("units are converted to SI once, at load", () => {
  near(c.alpha0, (-4 * Math.PI) / 180, 1e-15, "α0");
  near(c.vne, 250 / 3.6, 1e-12, "VNE");
  assert.equal(c.limits.vne_by_altitude_ms[1][0], 1981); // the altitude column stays in metres
  near(c.limits.vne_by_altitude_ms[1][1], 237 / 3.6, 1e-12, "VNE at 1981 m");
  assert.equal(c.W, 580 * 9.80665);
  near(c.I[1], 580 * 1.4 * 1.4, 1e-9, "Iyy");
});

test("--mass changes the mass and the inertia, nothing else", () => {
  const light = loadCard(json, { mass_kg: 450 });
  assert.equal(light.m, 450);
  near(light.I[0], 450 * 2.2 * 2.2, 1e-9, "Ixx");
  assert.equal(light.alphaCPos0, c.alphaCPos0);
});

for (const [name, airbrake, clmax] of [["closed", 0, 1.2], ["fully open", 1, 0.93]]) {
  test(`airbrake ${name}: the blended lift curve's first peak is ${clmax} within 0.0001`, () => {
    const curve = (a) => liftCurve(c, a, alphaCPos(c, airbrake), c.alphaCNeg);
    const peak = firstPeak(curve, c.alpha0, +1);
    near(peak.value, clmax, 0.0001, "first peak");
    // §6.1: the first peak, not the global maximum. Past the stall the curve falls, then rises
    // to the flat-plate hump near 45°, which is higher than 0.93.
    assert.ok(curve(peak.x + 0.05) < peak.value, "the curve falls after the first peak");
    const hump = Math.max(...Array.from({ length: 200 }, (_, i) => curve(peak.x + 0.1 + (i * 0.8) / 200)));
    if (clmax < 1) assert.ok(hump > clmax, `flat-plate hump ${hump} should exceed ${clmax}`);
  });
}

test(`the first trough below α0 is cl_min (${json.wing.cl_min}) within 0.0001`, () => {
  const trough = firstPeak((a) => liftCurve(c, a, c.alphaCPos0, c.alphaCNeg), c.alpha0, -1);
  near(trough.value, json.wing.cl_min, 0.0001, "first trough");
});

test("an unreachable cl_min fails at load, loudly", () => {
  // At 3.8° of stall softness the attached trough can't be shallower than about −0.854 (§6.1).
  const soft = structuredClone(json);
  soft.wing.stall_softness_deg = 3.8;
  assert.throws(() => loadCard(soft), /no blend centre gives a first trough of -0\.8/);
});
