# Aircraft

The roster, how an airplane gets added, and each airplane's sources and targets. Card fields are
defined in `docs/flight-model.md` section 10.

## Roster

Built in this order. Each airplane adds one new piece of physics.

| Order | Aircraft | New physics it brings | Card |
| --- | --- | --- | --- |
| 1 | Grob G 103 A Twin II Acro | lift, drag, energy, airbrakes, spins | `twin-ii-acro.json` |
| 2 | Piper Super Cub | piston and prop, flaps, tailwheel ground handling | |
| 3 | Pitts S-2B | negative stall, inverted flight, snap rolls | |
| 4 | Beechcraft King Air 350 | twin turboprop, engine-out, retractable gear | |
| 5 | Canadair CL-415 | flying boat: hull and floats, water landings and takeoffs | |
| 6 | North American P-51D Mustang | prop torque and P-factor, dive compressibility | |
| 7 | McDonnell Douglas F-4E Phantom II | afterburning jet, transonic and supersonic flight, high-α departure | |
| 8 | Boeing 737-800 | large inertia, slats and flaps, spool lag, Mach buffet | |
| 9 | Lockheed Martin F-35A Lightning II | flight computer with g and α limits (no thrust vectoring) | |

Undecided: a B-26 (Martin Marauder or Douglas Invader), added or replacing the King Air.

## Adding an airplane

1. Put its sources in `wings-reference/<id>/`: flight manual, type certificate data sheet, three-view,
   photos. Give each a short key in the card's `sources`.
2. Write its targets first: the published numbers it must hit, each with mass, tolerance and source.
3. Write the card. Every field gets a source key in `src`: a document, `fit` or `est`.
4. Solve the `fit` fields from the targets and run `node tools/fly.js <id>`. Paste the table into the
   commit message.
5. Fly it. Feel notes become card changes, and each change that matters gets a test.
6. Write the shape file and liveries, and generate the model (`models/`).

A target is never loosened to make a test pass. If a published figure looks wrong, note it in the
target and ask.

## Grob G 103 A Twin II Acro

A two-seat training glider with strengthened spar caps and steel pushrods for basic aerobatics.
First in the roster because it has no engine: only lift, drag and energy can be wrong.

### Published data used

| Figure | Value | Source |
| --- | --- | --- |
| Maximum mass | 580 kg | fm, bga |
| Empty mass (typical) | about 380 kg | fm |
| Wing area | 17.8 m² | fm |
| Span | 17.5 m | three-view, as traced in the shape file |
| Aspect ratio | 17.1 to 17.2 | fm (17.1); 17.2 from the span and area above |
| VNE | 250 km/h up to 6,500 ft, falling to 202 km/h at 19,000 ft | fm, bga |
| Rough air and manoeuvring speed | 170 km/h | fm, bga |
| Load factors | +5.3 / −2.65 at 170 km/h; +4.0 / −1.5 at VNE | fm |
| Stall, airbrakes closed | 75 km/h at 580 kg; 66 km/h at 470 kg | fm |
| Stall, airbrakes open | about 85 km/h at 580 kg (unclear in the copy read; verify) | fm |
| Best glide | 37.0 at 105 km/h, 580 kg; 36.5 at 95 km/h, 450 kg | fm |
| Minimum sink | 0.70 m/s at 85 km/h, 580 kg; 0.64 m/s at 80 km/h, 450 kg | fm |
| Normal approach speed | 95 km/h | fm |
| Stall behaviour | elevator buffet as warning; then a controllable mush, turns to about 15° of bank possible; releasing the stick recovers at once | fm |
| Spin | aft CG only; about one turn every 3 s, about 60 m per turn, no tendency to spiral; recover with opposite rudder and stick neutral | fm |

### How the starting card was found

With the parabolic polar in `docs/flight-model.md`, best glide 37.0 at 105 km/h and 580 kg fixes
both drag numbers at once: CD0 = 0.0083 and Oswald e = 0.85. Stall at 75 km/h and 580 kg fixes
CLmax = 1.20. A check with these numbers gives:

| Figure | Manual | Starting card |
| --- | --- | --- |
| Stall, 580 kg | 75 km/h | 75.1 km/h |
| Best glide, 580 kg | 37.0 at 105 km/h | 37.2 at 105 km/h |
| Best glide, 450 kg | 36.5 at 95 km/h | 37.2 at 92 km/h |
| Minimum sink, 580 kg | 0.70 m/s at 85 km/h | 0.69 m/s at 80 km/h |
| Minimum sink, 450 kg | 0.64 m/s at 80 km/h | 0.60 m/s at 70 km/h |
| Sink at 80 km/h, 450 kg | 0.64 m/s | 0.62 m/s |
| Stall, airbrakes open, 580 kg | about 85 km/h | 85.3 km/h |
| Glide ratio, airbrakes open, 95 km/h | not published (estimate 7) | 7.1 |

These were computed outside the sim as a sanity check; M1's tests must reproduce them from the sim
itself. The minimum-sink speed comes out low because a real laminar-flow wing's drag isn't a perfect
parabola. That's why the targets check the sink rate tightly and only report the minimum-sink speed.

Everything marked `est` (stability, control powers, inertia, zero-lift angle, stall softness) is a
first guess from geometry and typical gliders, to be set at M3 against handling targets and feel.

### Targets

The card's `targets` list is the source of truth. M1 checks the `M1` entries; M3 adds the spin.
