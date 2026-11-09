// Thrust (flight-model §7.1): momentum theory at both ends, power and thrust falling with speed and
// density, the torque reaction's sign, P-factor and the slipstream on the tail's controls.
import { test } from "node:test";
import assert from "node:assert/strict";
import { enginePower, propEfficiency, propThrust, thrustForces } from "../src/sim/thrust.js";

const HP = 745.7;
// A Cub-sized engine and propeller, for the physics alone (the card has its own numbers).
const e = {
  power: 150 * HP, omega: (2700 * 2 * Math.PI) / 60, pos: [1.5, 0, 0.1], axis: [1, 0, 0], spin: 1,
  pFactor: 0.1, slipTail: 0.5, R: 0.94, A: Math.PI * 0.94 * 0.94, etaMax: 0.85, Vd: 45, falloff: 0.3,
};
const c = { engines: [e], S: 16.6, cbar: 1.6, b: 10.7, elevator: { cmFullUp: 0.6, cmFullDown: -0.4 }, rudder: { cn: 0.08, cy: -0.1, cl: -0.01 } };
const close = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

test("power: full at sea level, Gagg–Ferrar with altitude, none at idle", () => {
  close(enginePower(e, 1, 1.225), 150 * HP, 1e-6, "sea level");
  close(enginePower(e, 1, 0.7385), 150 * HP * (1.132 * 0.7385 / 1.225 - 0.132), 1e-6, "5,000 m");
  assert.equal(enginePower(e, 0, 1.225), 0);
});

test("static thrust is momentum theory's: (2 ρ A (η P)²)^(1/3)", () => {
  const P = 150 * HP, eta = propEfficiency(e, 0);
  close(eta, 0.85 * (1 - 0.3), 1e-12, "static efficiency");
  const { T, vs } = propThrust(e, P, 0, 1.225);
  close(T, Math.cbrt(2 * 1.225 * e.A * (eta * P) ** 2), 1e-6, "static thrust");
  close(vs, Math.sqrt((2 * T) / (1.225 * e.A)), 1e-9, "slipstream speed");
});

test("fast, thrust tends to η P / V; it falls with speed and with density", () => {
  const P = 150 * HP;
  const fast = propThrust(e, P, 60, 1.225).T;
  const ideal = (propEfficiency(e, 60) * P) / 60;
  assert.ok(fast < ideal && fast > 0.9 * ideal, `${fast} vs ${ideal}`);
  let last = Infinity;
  for (const V of [0, 10, 20, 30, 40, 50, 60]) {
    const T = propThrust(e, P, V, 1.225).T;
    assert.ok(T < last, `falls with speed at ${V} m/s`);
    last = T;
  }
  assert.ok(propThrust(e, enginePower(e, 1, 0.9), 30, 0.9).T < propThrust(e, enginePower(e, 1, 1.225), 30, 1.225).T);
});

test("the torque reaction of a clockwise propeller rolls left; counter-clockwise rolls right", () => {
  const air = { alpha: 0, beta: 0 };
  const ctl = { throttle: 1, elevator: 0, rudder: 0 };
  const cw = thrustForces(c, [0, 0, 0], air, 1.225, ctl).M[0];
  const ccw = thrustForces({ ...c, engines: [{ ...e, spin: -1 }] }, [0, 0, 0], air, 1.225, ctl).M[0];
  close(cw, -(150 * HP) / e.omega, 1e-6, "Q = P / Ω");
  assert.ok(cw < 0 && ccw > 0);
});

test("P-factor yaws a clockwise propeller left at positive α", () => {
  const ctl = { throttle: 1, elevator: 0, rudder: 0 };
  const level = thrustForces(c, [30, 0, 0], { alpha: 0, beta: 0 }, 1.225, ctl).M[2];
  const climbing = thrustForces(c, [30, 0, 3], { alpha: 0.1, beta: 0 }, 1.225, ctl).M[2];
  assert.ok(climbing < level);
});

test("standing still at full power, the rudder works; at idle it doesn't", () => {
  const air = { alpha: 0, beta: 0 };
  const yaw = (throttle) => thrustForces(c, [0, 0, 0], air, 1.225, { throttle, elevator: 0, rudder: 1 }).M[2]
    - thrustForces(c, [0, 0, 0], air, 1.225, { throttle, elevator: 0, rudder: 0 }).M[2];
  assert.ok(yaw(1) > 0, "full power: right pedal yaws right");
  assert.equal(yaw(0), 0);
  const { T } = propThrust(e, 150 * HP, 0, 1.225);
  close(yaw(1), ((e.slipTail * T) / e.A) * c.S * c.b * c.rudder.cn, 1e-6, "q_extra S b Cnδr");
});
