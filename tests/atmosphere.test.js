// ISA density (flight-model §3) against standard-atmosphere tables, within 0.1%.
// Altitudes are geopotential, as §3 defines h. The 15,000 m value is the geopotential table value;
// 0.19476 kg/m³, often quoted for 15 km, is the value at 15,000 m geometric altitude.

import { test } from "node:test";
import assert from "node:assert/strict";
import { atmosphere } from "../src/sim/atmosphere.js";

const TABLE = [
  [0, 1.225],
  [1000, 1.1117],
  [5000, 0.73643],
  [11000, 0.36391],
  [15000, 0.19367],
];

for (const [h, rho] of TABLE) {
  test(`density at ${h} m is ${rho} kg/m³ within 0.1%`, () => {
    const got = atmosphere(h).rho;
    const err = Math.abs(got / rho - 1);
    assert.ok(err <= 0.001, `got ${got.toFixed(5)}, off by ${(err * 100).toFixed(3)}%`);
  });
}

test("sea level: 288.15 K, 101 325 Pa, 340.3 m/s", () => {
  const a = atmosphere(0);
  assert.equal(a.T, 288.15);
  assert.equal(a.p, 101325);
  assert.ok(Math.abs(a.a - 340.294) < 0.001);
});

test("the tropopause is continuous and the values hold above 20 km", () => {
  const below = atmosphere(11000 - 1e-6), above = atmosphere(11000 + 1e-6);
  assert.ok(Math.abs(below.p / above.p - 1) < 1e-5);
  assert.deepEqual(atmosphere(25000), atmosphere(20000));
});
