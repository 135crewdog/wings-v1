// Keyboard input for desktop testing (docs/controls.md).

import { slew } from "./curves.js";

const KEYS = {
  up: ["ArrowUp", "KeyW"],
  down: ["ArrowDown", "KeyS"],
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  rudderLeft: ["KeyQ"],
  rudderRight: ["KeyE"],
  brakeOpen: ["KeyB"],
  brakeClose: ["KeyV"],
};

export function createKeyboard({ onRestart } = {}) {
  const held = new Set();
  const value = { elevator: 0, aileron: 0, rudder: 0 };
  const is = (name) => KEYS[name].some((k) => held.has(k));
  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyR" && !e.repeat) onRestart?.();
    if (Object.values(KEYS).flat().includes(e.code)) e.preventDefault();
    held.add(e.code);
  });
  window.addEventListener("keyup", (e) => held.delete(e.code));
  window.addEventListener("blur", () => held.clear());

  return {
    /** Advance by dt seconds and return the keyboard's offer, airbrake as a rate. */
    read(dt) {
      // ↑ pushes (nose down), ↓ pulls
      value.elevator = slew(value.elevator, (is("down") ? 1 : 0) - (is("up") ? 1 : 0), dt);
      value.aileron = slew(value.aileron, (is("right") ? 1 : 0) - (is("left") ? 1 : 0), dt);
      value.rudder = slew(value.rudder, (is("rudderRight") ? 1 : 0) - (is("rudderLeft") ? 1 : 0), dt);
      return { ...value, airbrakeRate: (is("brakeOpen") ? 1 : 0) - (is("brakeClose") ? 1 : 0) };
    },
  };
}
