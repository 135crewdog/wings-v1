// The maths of the controls, docs/controls.md: the shaping curve, tilt from the phone's sensors,
// and the gamepad mapping. Pure functions, tested; reading devices is the rest of src/input/.

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** The shaping curve: dead zone, a gentle centre (a = 0.5), full deflection at `full`. */
export function shape(x, dead, full, a = 0.5) {
  const u = clamp((Math.abs(x) - dead) / (full - dead), 0, 1);
  return Math.sign(x) * (a * u + (1 - a) * u * u * u);
}

export const TILT = {
  pitchDead: 2, // deg
  pitchFull: 25,
  rollDead: 1.5,
  rollFull: 30,
  confidenceFade: 0.3, // roll fades to zero as the screen comes to face up or down
};

/**
 * World "up" in screen coordinates (x right, y up the screen, z out of it) from the sensor's beta
 * and gamma (degrees) and the screen's rotation angle (degrees). alpha cancels out.
 */
export function upInScreen(beta, gamma, screenAngle) {
  const b = beta * D2R, g = gamma * D2R;
  const x = -Math.cos(b) * Math.sin(g), y = Math.sin(b), z = Math.cos(b) * Math.cos(g);
  const t = screenAngle * D2R, c = Math.cos(t), s = Math.sin(t);
  return { x: c * x - s * y, y: s * x + c * y, z };
}

/** Pitch and steering-wheel roll (degrees) of an up vector, and how much roll means (0 to 1). */
export function tiltOf(u) {
  const flat = Math.hypot(u.x, u.y);
  return { pitch: Math.atan2(u.z, flat) * R2D, roll: Math.atan2(u.x, u.y) * R2D, confidence: flat };
}

/** An angle difference in degrees, wrapped to −180..180. */
export const wrap = (deg) => ((((deg + 180) % 360) + 360) % 360) - 180;

/**
 * Elevator and aileron from the current tilt and the neutral one. Top edge toward you is stick back;
 * clockwise is right roll. (The raw angles come out opposite to the pilot's sense, as found on the
 * iPhone in 135crewdog/rage, hence the minus signs.)
 */
export function tiltControls(tilt, neutral, m = TILT) {
  const dPitch = wrap(tilt.pitch - neutral.pitch);
  const dRoll = wrap(tilt.roll - neutral.roll);
  const fade = clamp(tilt.confidence / m.confidenceFade, 0, 1);
  return {
    elevator: -shape(dPitch, m.pitchDead, m.pitchFull),
    aileron: -shape(dRoll, m.rollDead, m.rollFull) * fade,
  };
}

export const PAD = { stickDead: 0.08, triggerDead: 0.05, leverRate: 1 };

/**
 * Controls from a standard-mapping gamepad: axes [lx, ly, rx, ry] (y positive is back, toward you)
 * and the trigger values (0 to 1). The lever (airbrake or throttle) comes back as a rate (travel per second).
 */
export function gamepadControls(axes, leftTrigger, rightTrigger, m = PAD) {
  const rudder = shape(rightTrigger, m.triggerDead, 1) - shape(leftTrigger, m.triggerDead, 1);
  return {
    aileron: shape(axes[0] ?? 0, m.stickDead, 1),
    elevator: shape(axes[1] ?? 0, m.stickDead, 1),
    rudder,
    leverRate: shape(axes[3] ?? 0, m.stickDead, 1) * m.leverRate,
  };
}

/** Moves a key-driven control toward `target` (−1, 0 or 1) at full travel per `time` seconds. */
export function slew(value, target, dt, time = 0.25) {
  const step = dt / time;
  return value < target ? Math.min(target, value + step) : Math.max(target, value - step);
}

/** One control state: for each stick axis, the largest offer by size wins. */
export function mergeAxes(offers) {
  const out = { elevator: 0, aileron: 0, rudder: 0 };
  for (const o of offers) {
    for (const k of Object.keys(out)) if (o && Math.abs(o[k] ?? 0) > Math.abs(out[k])) out[k] = o[k];
  }
  return out;
}

/** Moves the flaps from position `at` toward the selector `to` (0 or 1), full travel in `travel` s. */
export function flapTravel(at, to, dt, travel) {
  if (!(travel > 0)) return to;
  const step = dt / travel;
  return at < to ? Math.min(to, at + step) : Math.max(to, at - step);
}
