# Wings

A flight sim for the iPhone, built as a Three.js PWA. Real physics with simplified inputs: one honest
set of equations flies every airplane, each airplane is a short card of numbers, and the world is a
stylized, invented place in the spirit of Pocket Wings and Zwift's Watopia. Solo only. No weather, no
combat, no scores.

## Rules

### Honest physics
- One set of equations flies every airplane: a rigid body in six degrees of freedom, the standard
  atmosphere and gravity. Nothing is scripted. No force exists only to make it feel right. Nothing
  caps speed or rate.
- Every motion comes from a force or a moment: lift, drag, side force, thrust, gravity, ground or
  water contact. If the airplane does something, a term in `docs/flight-model.md` made it happen.
- Moving air (ridge lift, wave, thermals, turbulence) is air. The sim feels it only through the
  air-relative velocity, and so through angle of attack and sideslip.
- Assists and flight computers move the controls the way a pilot would. They never touch a force.
- When it feels wrong, change a number on the card. When no number can fix it, a term is missing:
  add it to `docs/flight-model.md` first, then to the code, for every airplane. Never a special case.

### Simplified but honest aircraft
- Each airplane is one card, `data/aircraft/<id>.json`: about 30 numbers with recognizable meanings.
  No wind-tunnel tables.
- Every number has a source note: a document listed in the card's `sources`, `fit` (solved from
  targets) or `est` (an estimate, tuned by feel).
- Every airplane has written targets in its card. Tests fly the card and print results beside them.
- No airplane gets its own code. A trait one airplane needs becomes a card field every airplane has,
  usually zero.

### Simple
- Plain JavaScript ES modules. No framework, no build step, no bundler, no TypeScript.
- Three.js is the one runtime library, vendored in `vendor/three/` at a pinned version.
- Tests use Node's built-in runner (`node:test`). No test framework.
- Ask before adding any other dependency.
- One file, one job. Data in JSON, behaviour in code. Fewer, clearer pieces beat clever abstractions.

### Future-proof
- `src/sim/` contains no browser, DOM or Three.js code. It runs unchanged in Node, a page or a Worker.
- Engine-neutral formats: JSON cards and place records, .glb models, PNG heightmaps.
- SI units inside the sim. Cards may use other units, with the unit in the key name (`vne_kmh`),
  converted once when the card loads.
- One fact, one home. `docs/` is the authority. When the design changes, change the doc first, in
  the same commit as the code.

### Efficient
- Target: 60 fps on an iPhone 16. Starting budgets: under 150 draw calls, under 15 MB first download.
  Frame time on the phone is the real limit; there is no triangle cap.
- The sim steps at a fixed 120 Hz. Rendering interpolates between steps.
- Measure before optimizing, and keep the measurement as a test.

## How to work
- Read the docs for the system you're touching before changing it.
- Small steps. Every change ends with `npm test` passing and the app still loading.
- Report numbers, not impressions. A change to the model comes with before and after output from
  `node tools/fly.js`.
- Never weaken a target or a tolerance to make a test pass. If a target looks wrong, say so and stop.
- Commit messages say what changed and why, in plain words.

## Commands
- `npm test`: every test (`node --test`).
- `node tools/fly.js <aircraft-id>`: performance table against the card's targets.
- `node tools/fly.js <aircraft-id> --polar`: sink rate and glide ratio across the speed range.
- `npm run serve`: local server for the app at http://localhost:8000.

## Layout
```
CLAUDE.md
docs/          flight-model.md (the equations; the authority)  aircraft.md (roster, cards, targets)
src/           app.js  sim/  world/  render/  input/  ui/
data/          aircraft/<id>.json  places/<id>.json
models/        gen_aircraft.py  shapes/<id>.json  skins/<id>/<name>.json  parts/
assets/        models/<id>.glb  terrain/   (built by tools; never edit by hand)
tools/         fly.js  hangar/  terrain/
tests/
vendor/three/
```
Folders appear when their milestone needs them. `world.md`, `art.md` and `controls.md` join `docs/`
the same way.

## Conventions
- **Frames:** world is NED (x north, y east, z down), metres, origin at the world centre, positions as
  JavaScript doubles. Body is x forward, y right, z down, origin at the centre of gravity.
- **Rotation:** a unit quaternion takes body vectors to world vectors.
- **Rates:** p roll right, q nose up, r nose right, all positive.
- **Controls** are in pilot sense, each from -1 to 1: elevator +1 = stick full back (nose up), aileron
  +1 = full right roll, rudder +1 = full right pedal. Airbrake, flaps and throttle run 0 to 1.
- **Render:** Three.js is y-up. The conversion from NED lives in `src/render/` and nowhere else.
- **Versions:** `APP_VERSION` in `src/version.js` and a line in `CHANGELOG.md`, bumped together on
  every deploy that changes what a player sees. The service worker cache name includes it.

## Decisions already made
- Solo only. No weather, wind, clouds, visibility or ceilings: the air is still except at fixed air
  features owned by places.
- No combat, scores, points or challenges for now.
- Constant weight: no fuel burn, no water scooping.
- External cameras only.
- The hangar shows figures in pilot terms, each named for exactly what it is ("maximum sustained turn
  rate", not "Turn"). No arcade ratings.
- Invented brands only: airlines, squadrons, resorts. Real aircraft names are fine.

## Never
- Code that applies to one airplane by name.
- A force or moment that isn't in `docs/flight-model.md`.
- Hand edits to generated files (`assets/`).
- Manuals, three-views or other people's documents in this repo. They live in the private
  `wings-reference` repo and are cited by name in source notes.
