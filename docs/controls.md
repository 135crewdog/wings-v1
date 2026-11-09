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

## Assists

On a phone there aren't enough intuitive controls for everything a pilot's hands and feet do, so three
assists do some of it. Each one moves a control the way a pilot would and never touches a force
(`CLAUDE.md`): the moving surfaces on the model show what it does. Each has its own switch on the
pause screen, on by default. The maths is in `src/input/assists.js`, pure and tested.

**Auto-rudder.** Keeps the sideslip near zero, as a pilot's feet keep the slip ball centred. It leads
with rudder against the yaw the ailerons make (the card's `aileron.cn_full` over `rudder.cn_full`), and
adds rudder in proportion to the sideslip that remains: full rudder at 4° of sideslip. It works only
while the pilot isn't using the rudder; a gamepad's triggers or the Q and E keys take over at once.

**Auto-trim.** Gliders and light airplanes fly hands off on a trim lever; here there is no lever, so
the trim works itself. While the stick is held off centre, the trim slowly takes over the held amount
(a time constant of 3 s), and the stick's own share shrinks by the same amount, so the elevator doesn't
move while it happens and never fights a manoeuvre. Easing the stick back toward neutral then moves
nothing: the trim keeps what it took, so letting go holds the speed you were flying. From the new
neutral, the stick has its full travel again both ways. It trims only in steady flight: in the air,
between 0.7 and 1.3 g, banked less than 30° and not stalled. A loop or a steep turn doesn't wind it.
Each start sets the trim for the start's speed. Off, the trim stays where the start set it and the
stick adds to it.

**Auto-level (tilt).** With the phone held at neutral, the wings roll gently back to level instead of
holding the bank: aileron in proportion to the bank and the roll rate, at most 40% of the travel.
Any roll input from the pilot takes over at once.

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

- **Left edge: the speed brakes.** A slim slider, a smooth slide from bottom to top with no detent:
  bottom is closed, top is fully open. It stays where it is left. On the ground, fully open also puts
  on the wheel brake (the card's `wheel_brake`). An airplane with an engine will have its throttle here
  instead, and its wheel brake will follow its own rule (for example, the throttle at idle).
- **Top right: pause.** A round button. Resume, recenter the tilt, restart, the menu and the settings
  (HUD, debug) are on the pause screen.
- **Right side: future buttons.** Flaps, gear and the like go on the right, where the right thumb
  reaches them.
- **The HUD:** airspeed on the left, altitude on the right with vertical speed below it. Plain
  numbers, no unit labels: always knots, feet and feet per minute. There is no other unit setting.

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
