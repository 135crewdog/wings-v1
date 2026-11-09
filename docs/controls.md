# Controls

How the pilot's inputs become the four control values the sim takes (`CLAUDE.md`, conventions): elevator,
aileron and rudder from −1 to 1, airbrake from 0 to 1. Every source writes the same control state; the
sim never knows which one was used. The maths is in `src/input/curves.js`, pure and tested; reading the
sensors and devices is the rest of `src/input/`.

## One control state

Each frame, every active source offers a value for each axis. For elevator, aileron and rudder the
largest offer by size wins, so a gamepad or keyboard can always override tilt. The airbrake is a lever
with a position: the on-screen slider sets it, and keys and the gamepad move it. It stays where it was
left.

## Elevator trim

Gliders fly hands off on a trim lever, and so does this one. Each start sets the trim to the
elevator its trimmed glide needs (`trim.js`), and the stick adds to it: with tilt at neutral, the
glider holds its start speed. The sum is clamped to the elevator's −1 to 1.

## Shaping

Every stick-like input goes through one curve: a dead zone, then a gentle curve near the centre, then
full deflection at the end of its travel.

```
u = clamp((|x| − dead) / (full − dead), 0, 1)
y = sign(x) · (a u + (1 − a) u³)          a = 0.5
```

`a` sets how soft the centre is: 1 is linear, 0 a pure cube. At `a = 0.5` the first tenth of travel gives
half as much as a linear stick, and full travel still gives full deflection.

## Tilt (the iPhone default)

The phone is held in landscape, like a steering wheel. iOS gives motion data only after a tap: the Fly
button asks for `DeviceOrientationEvent` permission, as the first thing it does.

Raw `beta` and `gamma` are never mapped to pitch and roll: in landscape they jump by about 180° when the
screen passes upright. Instead, "up" is found in screen coordinates (x right, y up the screen, z out of
it) from `beta`, `gamma` and the screen's rotation angle, and tilt is measured against a neutral
attitude:

- **Pitch** is the angle of "up" out of the screen's plane: tilting the top edge toward you is stick
  back (elevator +).
- **Roll** is the steering-wheel angle in the screen's plane: turning clockwise is right roll
  (aileron +).
- **Neutral** is captured when you press Fly, and again with Calibrate: the way you are holding the
  phone is the centre.
- Turning the phone to the other landscape direction turns the tilt frame by 180°: the app pauses and
  takes a new neutral.

| | dead zone | full deflection |
| --- | --- | --- |
| pitch → elevator | 2° | 25° |
| roll → aileron | 1.5° | 30° |

Roll fades out as the screen comes to face straight up or down, where the steering-wheel angle has no
meaning. The method and the signs were confirmed on an iPhone in `135crewdog/rage`.

There is no rudder on tilt in M2. Turns slip a little without it, which is honest; auto-rudder arrives
as an assist in M3.

## Touch, and the screen's layout

The screen follows `135crewdog/rage`:

- **Left edge: the speed brakes.** A slim slider: bottom is closed, top is fully open. It stays where
  it is left. A mark near the top (the card's `wheel_brake.from_airbrake_above`, 95% for the Twin II
  Acro) is where the wheel brake starts working; past it the thumb turns orange. An airplane with a
  throttle will have its throttle here instead.
- **Top right: pause.** A round button. Resume, recenter the tilt, restart, the menu and the settings
  (HUD, units, debug) are on the pause screen.
- **Right side: future buttons.** Flaps, gear and the like go on the right, where the right thumb
  reaches them.
- **The HUD:** airspeed on the left, altitude on the right with vertical speed below it; heading, g and
  angle of attack small along the bottom. Knots, feet and feet per minute, or km/h, metres and m/s.

Dragging anywhere else on the screen looks around (the chase camera); letting go eases the view back.

## Gamepad

Through the browser's Gamepad API, the standard mapping:

| Input | Control |
| --- | --- |
| left stick, left and right | aileron |
| left stick, back and forward | elevator: pulling back is nose up |
| right trigger, left trigger | right rudder, left rudder (the difference) |
| right stick, back and forward | airbrake lever: back opens, forward closes, at up to one full travel per second |

Stick axes use the curve above with a dead zone of 0.08; triggers with a dead zone of 0.05.

## Keyboard (desktop testing)

| Key | Control |
| --- | --- |
| ↑ / W, ↓ / S | elevator: ↑ pushes (nose down), ↓ pulls, as in most flight sims |
| ← / A, → / D | aileron |
| Q, E | left and right rudder |
| B, V | open and close the airbrake lever, at one full travel per second while held |
| R | restart from the last start position |

Keys move the controls toward full deflection over 0.25 s and back to centre over 0.25 s when
released, so a tap is a small input and a hold is a full one.
