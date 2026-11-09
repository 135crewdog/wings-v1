// One control state from every source (docs/controls.md): tilt, gamepad and keyboard offer stick
// values, the largest wins each axis. The lever on the left is the airbrake or the throttle, set by
// the slider and moved by keys; the flaps run toward their selector at the card's travel time.

import { flapTravel, mergeAxes } from "./curves.js";
import { createGamepad } from "./gamepad.js";
import { createKeyboard } from "./keyboard.js";
import { createTilt } from "./tilt.js";

export function createControls({ onRestart, onFlip, onNeutral, onFlaps } = {}) {
  const tilt = createTilt({ onFlip, onNeutral });
  const toggleFlaps = () => { if (setup.flapTravel !== null) { flapsTo = flapsTo > 0 ? 0 : 1; onFlaps?.(flapsTo); } };
  const gamepad = createGamepad({ onFlaps: toggleFlaps });
  const keyboard = createKeyboard({ onRestart, onFlaps: toggleFlaps });
  const state = { elevator: 0, aileron: 0, rudder: 0, airbrake: 0, throttle: 0, flaps: 0 };
  // which control the lever is, and the flaps' travel time (null: no flaps)
  const setup = { lever: "airbrake", flapTravel: null };
  let flapsTo = 0;
  let source = "none";

  return {
    tilt,
    state,
    get source() {
      return source;
    },
    get flapsSelected() {
      return flapsTo;
    },
    /** For an airplane: the lever is "airbrake" or "throttle"; flapTravel in s, or null without flaps. */
    configure({ lever, flapTravel: travel }) {
      setup.lever = lever;
      setup.flapTravel = travel;
      this.reset();
    },
    /** Lever at the bottom, flaps up. */
    reset() {
      state.airbrake = 0;
      state.throttle = 0;
      state.flaps = 0;
      flapsTo = 0;
    },
    /** The lever's position, 0 to 1. */
    get lever() {
      return state[setup.lever];
    },
    /** Set the lever directly (the on-screen slider), 0 at the bottom to 1 at the top. */
    setLever(v) {
      state[setup.lever] = Math.min(1, Math.max(0, v));
    },
    /** The flaps button: toggles the selector between up and down. */
    toggleFlaps,
    /** Read every source for a frame of dt seconds; updates and returns the control state. */
    update(dt) {
      const t = tilt.read(), p = gamepad.read(), k = keyboard.read(dt);
      Object.assign(state, mergeAxes([t, p, k]));
      const rate = (p?.leverRate ?? 0) + k.leverRate;
      if (rate !== 0) this.setLever(this.lever + rate * dt);
      if (setup.flapTravel !== null) state.flaps = flapTravel(state.flaps, flapsTo, dt, setup.flapTravel);
      source = [p && "gamepad", t && "tilt", "keyboard"].filter(Boolean).join(" + ");
      return state;
    },
  };
}
