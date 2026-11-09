// Gamepad input through the browser's Gamepad API, standard mapping (docs/controls.md).

import { gamepadControls } from "./curves.js";

export function createGamepad() {
  return {
    /** The first connected standard gamepad's offer, or null. */
    read() {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads) {
        if (!p || !p.connected) continue;
        const lt = p.buttons[6]?.value ?? 0, rt = p.buttons[7]?.value ?? 0;
        return { ...gamepadControls(p.axes, lt, rt), name: p.id };
      }
      return null;
    },
  };
}
