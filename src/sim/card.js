// Loads an aircraft card: converts it to SI once and computes the derived quantities of
// flight-model §5, including the stall blend centres of §6.1 and §6.4.
// Takes the parsed JSON; reading the file is the caller's job (fs in Node, fetch in a page).

import { liftCurve } from "./aero.js";

const DEG = Math.PI / 180;
const KMH = 1 / 3.6;
const KT = 1852 / 3600;
export const G = 9.80665;

/** Converts a scalar by its key's unit suffix (_deg, _kmh, _kt); anything else is already SI. */
function toSI(key, value) {
  const f = key.endsWith("_deg") ? DEG : key.endsWith("_kmh") ? KMH : key.endsWith("_kt") ? KT : 1;
  return value * f;
}

/**
 * Limits in SI. A speed key (`_kmh`, `_kt`) becomes `_ms`: a number is converted, and a table of
 * [x, speed] rows (such as `vne_by_altitude_kmh`, x in metres) has its speed column converted.
 * Other keys are copied as they are.
 */
function limitsSI(limits) {
  const out = {};
  for (const [key, value] of Object.entries(limits ?? {})) {
    const unit = key.match(/_(kmh|kt)$/);
    if (!unit) { out[key] = value; continue; }
    const f = unit[1] === "kmh" ? KMH : KT;
    const si = key.slice(0, -unit[0].length) + "_ms";
    out[si] = typeof value === "number" ? value * f : value.map(([x, v]) => [x, v * f]);
  }
  return out;
}

/**
 * The first peak of f walking from x0 in direction dir (§6.1): the first local maximum above x0
 * when dir = +1, or the first local minimum below x0 when dir = −1. Returns { x, value }.
 */
export function firstPeak(f, x0, dir, { step = 0.002, limit = Math.PI / 2 } = {}) {
  const s = dir > 0 ? 1 : -1;
  const g = (x) => s * f(x); // look for a maximum of g
  let a = x0, b = x0 + s * step, gb = g(b);
  for (let x = b + s * step; Math.abs(x - x0) <= limit; x += s * step) {
    const gx = g(x);
    if (gx < gb) {
      // The peak is between a and x. Golden-section search for the maximum of g.
      let lo = Math.min(a, x), hi = Math.max(a, x);
      const r = (Math.sqrt(5) - 1) / 2;
      let x1 = hi - r * (hi - lo), x2 = lo + r * (hi - lo), g1 = g(x1), g2 = g(x2);
      while (hi - lo > 1e-12) {
        if (g1 < g2) { lo = x1; x1 = x2; g1 = g2; x2 = lo + r * (hi - lo); g2 = g(x2); }
        else { hi = x2; x2 = x1; g2 = g1; x1 = hi - r * (hi - lo); g1 = g(x1); }
      }
      const xp = (lo + hi) / 2;
      return { x: xp, value: f(xp) };
    }
    a = b; b = x; gb = gx;
  }
  throw new Error("firstPeak: no peak within the search limit");
}

/** Bisection for x in [lo, hi] with fn(lo) < 0 < fn(hi) or the reverse. */
function bisect(fn, lo, hi) {
  let flo = fn(lo);
  for (let i = 0; i < 200 && Math.abs(hi - lo) > 1e-14; i++) {
    const mid = (lo + hi) / 2, fm = fn(mid);
    if (fm * flo > 0) { lo = mid; flo = fm; } else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * The blend centre whose first peak (dir = +1) or first trough (dir = −1) equals target (§6.1).
 * curve(ac) is the lift curve for centre ac. The peak grows with the centre's distance from α0,
 * until the centre comes so close that the attached peak vanishes and the first peak becomes the
 * flat-plate hump near ±45°. Walks in from far out to bracket the target on the attached branch.
 */
export function solveBlendCentre(c, curve, target, dir) {
  const s = dir > 0 ? 1 : -1;
  const peakAt = (ac) => s * firstPeak(curve(ac), c.alpha0, s).value; // grows as ac moves out
  const goal = s * target;
  const lin = c.alpha0 + target / c.CLa; // attached lift alone reaches the target here
  const step = c.stallWidth / 8;
  let outer = lin + s * 10 * c.stallWidth, pOuter = peakAt(outer);
  if (pOuter < goal) throw new Error(`stall solve: ${target} is beyond reach`);
  for (let ac = outer - s * step; s * (ac - c.alpha0) > 0; ac -= s * step) {
    const p = peakAt(ac);
    if (p > pOuter) {
      // The attached peak vanished between ac and outer: the target is below the smallest
      // attached first peak this stall softness allows.
      const err = new Error(
        `stall solve: no blend centre gives a first ${s > 0 ? "peak" : "trough"} of ${target}; ` +
          `with stall_softness_deg ${(c.stallWidth * 180) / Math.PI} the attached ` +
          `${s > 0 ? "peak" : "trough"} is never ${s > 0 ? "lower" : "shallower"} than ${(s * pOuter).toFixed(4)}`
      );
      err.limit = { centre: outer, value: s * pOuter };
      throw err;
    }
    if (p < goal) return bisect((x) => peakAt(x) - goal, ac, outer);
    outer = ac;
    pOuter = p;
  }
  throw new Error("stall solve: no bracket found");
}

const solveAlphaCPos = (c, clmax, acNeg) =>
  solveBlendCentre(c, (ac) => (a) => liftCurve(c, a, ac, acNeg), clmax, +1);
const solveAlphaCNeg = (c, clmin, acPos) =>
  solveBlendCentre(c, (ac) => (a) => liftCurve(c, a, acPos, ac), clmin, -1);

/**
 * The loaded card: SI fields and derived quantities. Options: { mass_kg } overrides the card's
 * mass (inertia follows, from the same radii of gyration).
 */
export function loadCard(json, { mass_kg } = {}) {
  const m = mass_kg ?? json.mass.mass_kg;
  const k = json.mass.radii_of_gyration_m;
  const w = json.wing, st = json.stability, ctl = json.control, dr = json.drag;
  const brake = json.devices?.airbrake ?? { cd: 0, dclmax: 0, cm: 0 };

  const S = w.area_m2, b = w.span_m;
  const AR = (b * b) / S;
  const CLa = (2 * Math.PI * AR) / (2 + Math.sqrt(AR * AR + 4));

  const c = {
    id: json.id,
    name: json.name,
    json,
    // mass and inertia
    m,
    W: m * G,
    I: [m * k.roll * k.roll, m * k.pitch * k.pitch, m * k.yaw * k.yaw],
    // wing
    S,
    b,
    AR,
    cbar: S / b,
    sweep: toSI("sweep_deg", w.sweep_deg),
    taper: w.taper,
    alpha0: toSI("alpha0_deg", w.alpha0_deg),
    clMax: w.cl_max,
    clMin: w.cl_min,
    stallWidth: toSI("stall_softness_deg", w.stall_softness_deg),
    e: w.oswald_e,
    CLa,
    K: 1 / (Math.PI * AR * w.oswald_e),
    // drag
    cd0: dr.cd0,
    machDD: dr.mach_dd,
    cdwPeak: dr.cdw_peak,
    // stability
    SM: st.static_margin,
    CLtrim0: st.cl_trim0,
    Cma: -CLa * st.static_margin,
    Cm0: st.static_margin * st.cl_trim0,
    Cmq: st.cmq,
    CYb: st.cy_beta,
    Clb: st.cl_beta,
    Clp: st.clp,
    ClrPerCL: st.clr_per_cl,
    Cnb: st.cn_beta,
    CnpPerCL: st.cnp_per_cl,
    Cnr: st.cnr,
    autorotation: st.autorotation,
    // §6.1: CLq and CLδe start at zero. The card has no field for them yet (§10).
    CLq: 0,
    CLde: 0,
    // controls: the coefficient at full deflection (§6.3)
    elevator: { cmFullUp: ctl.elevator.cm_full_up, cmFullDown: ctl.elevator.cm_full_down },
    aileron: { cl: ctl.aileron.cl_full, cn: ctl.aileron.cn_full },
    rudder: { cn: ctl.rudder.cn_full, cy: ctl.rudder.cy_full, cl: ctl.rudder.cl_full },
    // devices (§6.4)
    airbrake: { cd: brake.cd, dclmax: brake.dclmax, cm: brake.cm },
    // the airframe: where the CG is on the model, the model file, and the ground contact (§11)
    cg: { fromNose: json.cg?.from_nose_m ?? 0, aboveNose: json.cg?.above_nose_m ?? 0 },
    glb: json.glb?.file ?? null,
    contacts: (json.contacts ?? []).map((p) => ({
      name: p.name,
      wheel: p.type === "wheel",
      r: p.pos_m.slice(),
      k: p.k,
      c: p.c,
      brake: p.brake === true,
    })),
    wheelBrake: json.wheel_brake?.when ?? "never", // §11.4
    crash: {
      wheelSink: json.crash?.wheel_sink_ms ?? Infinity,
      skidSpeed: json.crash?.skid_speed_ms ?? Infinity,
    },
    // limits
    limits: limitsSI(json.limits),
    vne: json.limits?.vne_kmh != null ? json.limits.vne_kmh * KMH : json.limits?.vne_kt != null ? json.limits.vne_kt * KT : null,
  };

  // Stall blend centres (§6.1). σ− reaches a little into positive α and σ+ into negative α, so
  // each centre depends slightly on the other: alternate until both settle.
  let acPos = Infinity, acNeg = -Infinity;
  for (let i = 0; i < 50; i++) {
    const nNeg = solveAlphaCNeg(c, c.clMin, acPos);
    const nPos = solveAlphaCPos(c, c.clMax, nNeg);
    const done = Math.abs(nNeg - acNeg) < 1e-13 && Math.abs(nPos - acPos) < 1e-13;
    acNeg = nNeg;
    acPos = nPos;
    if (done) break;
  }
  c.alphaCNeg = acNeg;
  c.alphaCPos0 = acPos;
  // Airbrake fully open moves the positive stall only (§6.4).
  c.alphaCPos1 = c.airbrake.dclmax === 0 ? acPos : solveAlphaCPos(c, c.clMax + c.airbrake.dclmax, acNeg);
  return c;
}
