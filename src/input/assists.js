// The assists (docs/controls.md): auto-rudder, auto-trim and auto-level. Each one moves a control the
// way a pilot would and never touches a force. Pure: they read the sim's state and air data and return
// control positions. No browser code, so the tests fly them in Node.

import { qtoEuler } from "../sim/vec.js";

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const G0 = 9.80665;

export const ASSIST = {
  rudderFullSlip: (4 * Math.PI) / 180, // sideslip that calls for full rudder
  rudderPilot: 0.05, // pilot rudder beyond this takes over
  trimTau: 3, // s
  trimG: [0.7, 1.3],
  trimBank: (30 * Math.PI) / 180,
  trimStallSigma: 0.1, // the stall blend's weight above which the wing counts as stalled
  levelBank: 1.0, // aileron per radian of bank
  levelRate: 0.4, // aileron per rad/s of roll rate
  levelMax: 0.4,
  levelPilot: 0.03, // pilot aileron beyond this takes over
};

/**
 * The assists for one airplane. `trim` is the elevator its start was trimmed at. Each frame, update()
 * takes the pilot's controls and returns the controls the airplane flies with.
 */
export function createAssists(card, trim = 0, a = ASSIST) {
  const st = { trim, absorbed: 0 };
  return {
    state: st,
    setTrim(t) { st.trim = t; st.absorbed = 0; },
    /**
     * pilot: { elevator, aileron, rudder, airbrake }; sim: the Sim; obs: sim.observe(); dt in s;
     * on: { rudder, trim, level } booleans. Returns the flown controls.
     */
    update(pilot, sim, obs, dt, on) {
      const out = { ...pilot };
      const air = obs.air, coef = obs.coef;
      const euler = qtoEuler(sim.state.q);
      const flying = !sim.touching.some(Boolean) && air.V > 1;

      // auto-level: wings back to level when the pilot holds the roll at neutral
      if (on.level && flying && Math.abs(pilot.aileron) < a.levelPilot) {
        out.aileron = clamp(-a.levelBank * euler.roll - a.levelRate * sim.state.omega[0], -a.levelMax, a.levelMax);
      }

      // auto-rudder: against the ailerons' adverse yaw, and in proportion to the sideslip left
      if (on.rudder && Math.abs(pilot.rudder) < a.rudderPilot && air.V > 1) {
        const lead = card.rudder.cn ? -card.aileron.cn / card.rudder.cn : 0;
        out.rudder = clamp(lead * out.aileron + air.beta / a.rudderFullSlip, -1, 1);
      }

      // auto-trim: the trim takes over a held stick; the stick's share shrinks by as much
      const s = pilot.elevator;
      if (Math.sign(st.absorbed) !== Math.sign(s) || Math.abs(st.absorbed) > Math.abs(s)) {
        st.absorbed = Math.sign(s) === Math.sign(st.absorbed) ? s : 0; // released toward neutral: keep the trim, drop the share
      }
      if (on.trim && flying && coef) {
        const n = -(obs.aero.F[2] + obs.contact.F[2]) / (card.m * G0);
        const steady = n > a.trimG[0] && n < a.trimG[1] && Math.abs(euler.roll) < a.trimBank && coef.sigma < a.trimStallSigma;
        if (steady && s !== 0) {
          const take = (s - st.absorbed) * (1 - Math.exp(-dt / a.trimTau));
          st.absorbed += take;
          st.trim = clamp(st.trim + take, -1, 1);
        }
      }
      out.elevator = clamp(st.trim + s - st.absorbed, -1, 1);
      return out;
    },
  };
}
