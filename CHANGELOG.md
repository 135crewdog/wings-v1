# Changelog

## 0.1.2

- The glider casts a real shadow on the ground, sharp up close and softer the higher you fly, as the
  sun's own blur makes it. It helps judge height in the flare.
- Ground effect: close to the runway the wing makes less drag, so the glider floats in the flare.
- The glider's handling was checked against the standard limits for good handling and tuned: pitch
  is better damped, and it holds a bank or comes back from a gust more steadily.
- Three assists, each with its own switch on the pause screen and on by default. Auto-rudder keeps
  turns coordinated. Auto-trim takes over a held stick, so letting go keeps the speed you were
  flying. Auto-level rolls the wings gently back to level when you hold the phone at neutral.
- The hangar: a page with each airplane's figures (stall speeds, best glide, turn performance, roll
  rate, handling), its turn-rate diagram and sliders to try changes to its numbers. Open it from the
  menu.

## 0.1.1

- Landings: the elevator is less sensitive. The stall now takes most of the tilt instead of a third
  of it, so a flare no longer balloons and stalls into the runway.
- The glider is no longer squashed after the phone rotates.
- The runway no longer shimmers when you're low and close to it.
- "Recentered ✓" shows when the tilt takes a new centre: at a start, on resume, and on Recenter.

## 0.1.0

- First flight (M2): fly the Twin II Acro over a test grid and land it on a paved runway. Start
  high, in the circuit or on final. Tilt the phone to fly, or use a gamepad or the keyboard. The
  slider on the left is the speed brakes, and at its top the wheel brake. Ground contact with
  wheels and wingtips, a chase camera you can drag to look around, and a HUD: airspeed on the left,
  altitude and vertical speed (ft/min) on the right. Pause is top right, with the settings behind it.

## 0.0.2

- A new app icon: the Twin II Acro banking across a blue gradient, rendered from its 3D model
  (tools/icon/). Re-add Wings to the home screen to see it; iOS keeps the icon it installed with.

## 0.0.1

- First deployable shell: a full-screen, landscape PWA that installs to the iPhone home screen and
  shows a sky, a ground grid and the version. Proves the pipeline from push to phone.
