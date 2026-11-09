// Control positions to control-surface positions on the model, from each moving part's glTF extras
// ({ kind, axis, min_deg, max_deg, travel_m }). Pure; the model code applies the result.
//
// Hinges: a positive angle is trailing edge down (elevator, ailerons) or trailing edge left
// (rudder), as the extras say. Signs, in pilot sense (CLAUDE.md):
//   elevator +1 (stick back): trailing edge up, toward min_deg
//   aileron +1 (right roll): right aileron up (toward min_deg), left aileron down (toward max_deg)
//   rudder +1 (right pedal): trailing edge right, toward min_deg
//   airbrake 0..1: each panel slides out by travel_m times the lever
//   flaps 0..1: trailing edge down, max_deg fully down

/** The hinge angle for a control u from −1 to 1: toward min_deg as u goes to +1, toward max_deg as it goes to −1. */
const toward = (u, extras) => (u > 0 ? u * extras.min_deg : u < 0 ? -u * extras.max_deg : 0);

/**
 * { nodeName: { deg } for a hinge, or { slide_m } for a slide } for every part named in `parts`
 * ({ name: extras }), from controls { elevator, aileron, rudder, airbrake, flaps }.
 */
export function surfacePositions(controls, parts) {
  const out = {};
  for (const [name, x] of Object.entries(parts)) {
    if (x.kind === "slide") {
      out[name] = { slide_m: (controls.airbrake ?? 0) * x.travel_m };
    } else if (name === "elevator") {
      out[name] = { deg: toward(controls.elevator ?? 0, x) };
    } else if (name === "rudder") {
      out[name] = { deg: toward(controls.rudder ?? 0, x) };
    } else if (name === "aileron_r") {
      out[name] = { deg: toward(controls.aileron ?? 0, x) };
    } else if (name === "aileron_l") {
      out[name] = { deg: toward(-(controls.aileron ?? 0), x) };
    } else if (name === "flap_l" || name === "flap_r") {
      out[name] = { deg: (controls.flaps ?? 0) * x.max_deg }; // trailing edge down, to max_deg fully down
    }
  }
  return out;
}
