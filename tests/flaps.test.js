// Flaps (flight-model 6.4): more lift at every angle on the attached side, a higher CLmax, more drag
// and a lower stall speed; the stall shifts of two devices add.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadCard } from "../src/sim/card.js";
import { coefficients, alphaCPos } from "../src/sim/aero.js";
import { liftPeak, stallSpeed } from "../src/sim/trim.js";

const json = JSON.parse(readFileSync(new URL("../data/aircraft/super-cub.json", import.meta.url), "utf8"));
const c = loadCard(json);
const air = (alpha) => ({ alpha, beta: 0, mach: 0.1, phat: 0, qhat: 0, rhat: 0 });
const ctl = (flaps) => ({ elevator: 0, aileron: 0, rudder: 0, airbrake: 0, flaps });

test("down, the flaps add their lift and drag at a small angle of attack", () => {
  const up = coefficients(c, air(0.02), ctl(0)), down = coefficients(c, air(0.02), ctl(1));
  assert.ok(Math.abs(down.CL - up.CL - c.flaps.cl0) < 0.01, `ΔCL ${down.CL - up.CL}`);
  assert.ok(down.CD - up.CD > c.flaps.cd, "the flaps' drag plus their extra induced drag");
  assert.ok(Math.abs(down.Cm - up.Cm - c.flaps.cm) < 1e-12);
});

test("the first lift peak rises by the card's dclmax, and the stall speed falls", () => {
  assert.ok(Math.abs(liftPeak(c, 0, 1).CL - liftPeak(c, 0, 0).CL - c.flaps.dclmax) < 1e-6);
  assert.ok(stallSpeed(c, { flaps: 1 }).V < stallSpeed(c).V);
});

test("two devices' stall shifts add, each in proportion to its position", () => {
  const twin = loadCard({ ...json, devices: { ...json.devices, airbrake: { cd: 0.05, dclmax: -0.2, cm: 0 } } });
  const expect = twin.alphaCPos0 + 0.5 * (twin.alphaCPos1 - twin.alphaCPos0) + 0.25 * (twin.alphaCPosF - twin.alphaCPos0);
  assert.equal(alphaCPos(twin, 0.5, 0.25), expect);
});
