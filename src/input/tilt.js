// Tilt input from the phone's motion sensor (docs/controls.md). The maths is in curves.js; this
// file asks for permission, listens, keeps the neutral attitude, and watches the screen's angle.

import { tiltControls, tiltOf, upInScreen } from "./curves.js";

const screenAngle = () => {
  const a = screen.orientation?.angle ?? window.orientation ?? 0;
  return ((a % 360) + 360) % 360;
};

export function createTilt({ onFlip } = {}) {
  let latest = null; // the last tilt reading
  let neutral = null;
  let wantNeutral = false;
  let enabled = false;
  let lastAngle = screenAngle();

  window.addEventListener("deviceorientation", (e) => {
    if (e.beta === null || e.gamma === null) return;
    latest = tiltOf(upInScreen(e.beta, e.gamma, screenAngle()));
    if (wantNeutral && latest.confidence > 0.3) {
      neutral = { pitch: latest.pitch, roll: latest.roll };
      wantNeutral = false;
    }
  });

  const angleChanged = () => {
    const a = screenAngle();
    if (a === lastAngle) return;
    lastAngle = a;
    calibrate(); // the other landscape turns the tilt frame by 180°
    onFlip?.();
  };
  screen.orientation?.addEventListener("change", angleChanged);
  window.addEventListener("orientationchange", angleChanged);

  function calibrate() {
    neutral = null;
    wantNeutral = true;
  }

  return {
    /**
     * Ask for motion data. Must be called first thing in a tap handler, or iOS refuses.
     * Resolves to true when tilt is available.
     */
    request() {
      const ask =
        typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function"
          ? DeviceOrientationEvent.requestPermission()
          : Promise.resolve("granted");
      return ask.then((s) => s === "granted", () => false).then((ok) => {
        enabled = ok;
        if (ok) calibrate();
        return ok;
      });
    },
    calibrate,
    /** True once motion data is flowing and a neutral is set. */
    get active() {
      return enabled && latest !== null && neutral !== null;
    },
    /** The tilt's offer: { elevator, aileron }, or null when tilt isn't active. */
    read() {
      return this.active ? tiltControls(latest, neutral) : null;
    },
  };
}
