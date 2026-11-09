// One control state from every source (docs/controls.md): tilt, gamepad and keyboard offer stick
// values, the largest wins each axis; the airbrake is a lever the slider sets and keys move.

import { mergeAxes } from "./curves.js";
import { createGamepad } from "./gamepad.js";
import { createKeyboard } from "./keyboard.js";
import { createTilt } from "./tilt.js";

export function createControls({ onRestart, onFlip } = {}) {
  const tilt = createTilt({ onFlip });
  const gamepad = createGamepad();
  const keyboard = createKeyboard({ onRestart });
  const state = { elevator: 0, aileron: 0, rudder: 0, airbrake: 0 };
  let source = "none";

  return {
    tilt,
    state,
    get source() {
      return source;
    },
    /** Set the airbrake lever directly (the on-screen slider), 0 closed to 1 open. */
    setAirbrake(v) {
      state.airbrake = Math.min(1, Math.max(0, v));
    },
    /** Read every source for a frame of dt seconds; updates and returns the control state. */
    update(dt) {
      const t = tilt.read(), p = gamepad.read(), k = keyboard.read(dt);
      Object.assign(state, mergeAxes([t, p, k]));
      const rate = (p?.airbrakeRate ?? 0) + k.airbrakeRate;
      if (rate !== 0) this.setAirbrake(state.airbrake + rate * dt);
      source = [p && "gamepad", t && "tilt", "keyboard"].filter(Boolean).join(" + ");
      return state;
    },
  };
}
