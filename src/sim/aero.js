// Aerodynamic coefficients, forces and moments: flight-model §4, §6 and §7.
// Pure functions of a loaded card (card.js), the state and the controls. No browser code.

import { cross, normalize, norm, qrotateInv, sub } from "./vec.js";

const Y_HAT = [0, 1, 0];

/** The stall blend weights σ+ and σ− at angle of attack α (§6.1). */
export function stallWeights(alpha, acPos, acNeg, w) {
  const sp = 1 / (1 + Math.exp(-(alpha - acPos) / w));
  const sn = 1 / (1 + Math.exp((alpha - acNeg) / w));
  return { sp, sn, sigma: sp + sn };
}

/**
 * The blended lift curve (§6.1) without the rate, elevator and device terms:
 * (1 − σ) CLα (α − α0) + σ sin 2α. The loader finds its first peak; the sim adds the rest.
 */
export function liftCurve(c, alpha, acPos, acNeg) {
  const { sigma } = stallWeights(alpha, acPos, acNeg, c.stallWidth);
  return (1 - sigma) * c.CLa * (alpha - c.alpha0) + sigma * Math.sin(2 * alpha);
}

/** Positive stall blend centre for airbrake position δb: linear between closed and open (§6.4). */
export const alphaCPos = (c, airbrake) => (1 - airbrake) * c.alphaCPos0 + airbrake * c.alphaCPos1;

const smoothstep = (x) => x * x * (3 - 2 * x);

/** Wave drag increment (§6.2). Zero below M_dd; capped at M = 1. */
export function waveDrag(c, mach) {
  if (c.cdwPeak === 0 || mach <= c.machDD) return 0;
  const x = (Math.min(mach, 1) - c.machDD) / (1 - c.machDD);
  return c.cdwPeak * smoothstep(Math.min(1, Math.max(0, x)));
}

/** Elevator pitch increment: cm_full_up per unit of back stick, cm_full_down per unit forward (§6.3). */
export function elevatorCm(c, de) {
  return de >= 0 ? c.elevator.cmFullUp * de : c.elevator.cmFullDown * -de;
}

/**
 * Coefficients (§6) for air data { alpha, beta, mach, phat, qhat, rhat } and controls
 * { elevator, aileron, rudder, airbrake }.
 */
export function coefficients(c, air, ctl) {
  const { alpha, beta, mach, phat, qhat, rhat } = air;
  const de = ctl.elevator, da = ctl.aileron, dr = ctl.rudder, db = ctl.airbrake;

  const { sigma } = stallWeights(alpha, alphaCPos(c, db), c.alphaCNeg, c.stallWidth);
  const CLatt = c.CLa * (alpha - c.alpha0);
  const CLfp = Math.sin(2 * alpha);
  const CL = (1 - sigma) * CLatt + sigma * CLfp + c.CLq * qhat + c.CLde * de; // ΔCL_devices: none yet

  const sinA = Math.sin(alpha);
  const CD =
    (1 - sigma) * (c.cd0 + c.K * CLatt * CLatt) +
    sigma * (c.cd0 + 2 * sinA * sinA) +
    waveDrag(c, mach) +
    c.airbrake.cd * db;

  const CY = c.CYb * beta + c.rudder.cy * dr;

  const Clp = c.Clp * (1 - (1 + c.autorotation) * sigma);
  const Clr = c.ClrPerCL * CL;
  const Cl = c.Clb * beta + Clp * phat + Clr * rhat + c.aileron.cl * da + c.rudder.cl * dr;

  const Cm = c.Cm0 + c.Cma * (alpha - c.alpha0) + c.Cmq * qhat + elevatorCm(c, de) + c.airbrake.cm * db;

  const Cnp = c.CnpPerCL * CL;
  const Cn = c.Cnb * beta + Cnp * phat + c.Cnr * rhat + c.rudder.cn * dr + c.aileron.cn * da;

  return { CL, CD, CY, Cl, Cm, Cn, CLatt, sigma };
}

/**
 * Air data (§4) for body-axis ground velocity v, attitude q, body rates ω, wind w_w (world),
 * and the local atmosphere { rho, a }.
 */
export function airData(c, v, q, omega, windW, atm) {
  const Vb = sub(v, qrotateInv(q, windW));
  const V = norm(Vb);
  const out = { Vb, V, qbar: 0.5 * atm.rho * V * V, mach: V / atm.a, alpha: 0, beta: 0, phat: 0, qhat: 0, rhat: 0 };
  if (V < 1) return out;
  out.alpha = Math.atan2(Vb[2], Vb[0]);
  out.beta = Math.asin(Math.max(-1, Math.min(1, Vb[1] / V)));
  out.phat = (omega[0] * c.b) / (2 * V);
  out.qhat = (omega[1] * c.cbar) / (2 * V);
  out.rhat = (omega[2] * c.b) / (2 * V);
  return out;
}

/** Lift direction in body axes for unit airflow V̂: normalize(ŷ × V̂) (§7). */
export const liftDirection = (Vhat) => normalize(cross(Y_HAT, Vhat));

/**
 * Aerodynamic force and moment in body axes (§7), with the air data and coefficients used.
 * Below 1 m/s of airflow both are zero (§4).
 */
export function aeroForces(c, air, ctl) {
  if (air.V < 1) return { F: [0, 0, 0], M: [0, 0, 0], coef: null };
  const coef = coefficients(c, air, ctl);
  const Vhat = [air.Vb[0] / air.V, air.Vb[1] / air.V, air.Vb[2] / air.V];
  const L = liftDirection(Vhat);
  const qS = air.qbar * c.S;
  const F = [
    qS * (coef.CL * L[0] - coef.CD * Vhat[0]),
    qS * (coef.CL * L[1] - coef.CD * Vhat[1] + coef.CY),
    qS * (coef.CL * L[2] - coef.CD * Vhat[2]),
  ];
  const M = [qS * c.b * coef.Cl, qS * c.cbar * coef.Cm, qS * c.b * coef.Cn];
  return { F, M, coef };
}
