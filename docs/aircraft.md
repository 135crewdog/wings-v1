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

## The hangar

`hangar.html`, in the deployed app, shows every airplane on the roster (`data/roster.json`) from the
same `src/sim/` code that flies it: no copy of the physics. For each: the planform drawn from the card
(span, area, taper, quarter-chord sweep), the figures of `docs/flight-model.md` sections 9 and 12 in
pilot terms and the units of the HUD (knots, feet per minute, degrees per second), each named for
exactly what it is, and its energy-manoeuvrability diagram. The landing-configuration stall is with
the airbrakes open for a glider and with landing flaps for an airplane that has them. Figures an
airplane doesn't have (a glider's best climb) say so. No arcade ratings.

Its tuning panel moves the main card numbers with sliders and redraws every figure live. Edits stay in
that browser (`localStorage`), never change the card the app flies, and can be copied as the card's
JSON to paste into `data/aircraft/<id>.json` with a source note.

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

**Elevator power, set at M2.** The first card had `cm_full_up` 0.25 and `cm_full_down` −0.20. Then the
whole speed range from VNE to the stall took only a third of the stick (−0.29 to +0.39), and on the
phone a 10° tilt was enough to stall: every flare ballooned, stalled and dropped the nose wheel in.
At 0.12 and −0.10 the stall takes 81% of the stick (VNE −0.59, 95 km/h +0.15, 80 km/h +0.50), as on
a glider at a forward CG. Elevator power changes neither stability nor any M1 figure. M3 sets it
against handling targets.

**Stall softness, set at M1.** The first card had `stall_softness_deg` 3.8. In the sim, the stall blend
of `docs/flight-model.md` §6.1 is then already 2–14% active between 0° and 8° of α. That gave best
glide 36.3 at 108 km/h and minimum sink 0.757 m/s at 92 km/h (580 kg), failing the sink targets.
And no blend centre could give `cl_min` −0.80: the attached trough is never shallower than −0.854. With
a near-sharp stall the sim reproduces the table above exactly, so the code agrees with the
outside calculation and the difference is the blend. 2.0° passes every M1 target and puts minimum sink
at 0.708 m/s at 86 km/h, close to the manual's 0.70 at 85. It stays `est` for M3 to revisit against
the stall behaviour.

**Handling, set at M3.** Linearized at 95 and 130 km/h (`node tools/fly.js twin-ii-acro --handling`),
the first card failed two of the bounds in `docs/flight-model.md` section 12: phugoid damping 0.034
and 0.038 (bound 0.04), and a spiral that doubled in 16.4 s at 95 km/h (bound 20 s). Three `est`
numbers changed, each toward what the airframe's geometry gives:

| Field | Before | After | Why |
| --- | --- | --- | --- |
| `cmq` | −20 | −30 | the tailplane's volume (about 2.7 m² at 4.8 m from the CG) gives −25, and its lag behind the wing's downwash adds to it |
| `cl_beta` | −0.08 | −0.10 | 3.5° of dihedral on a mid wing gives about −0.08; −0.10 is within that estimate's uncertainty |
| `cnr` | −0.08 | −0.09 | the fin alone gives about −0.04, and the wing and fuselage add to it |

Phugoid damping became 0.072 and 0.061, and the spiral doubles in 27 s at 95 km/h and is stable at 130.
No performance figure changed. Real gliders are often mildly spirally unstable at low speed; this card
sits just inside the bound.

### Targets

The card's `targets` list is the source of truth. M1 checks the `M1` entries; M3 adds the spin.
