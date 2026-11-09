# Milestones

Each milestone ends in something that can be tested or flown. Build them in order; finish one before
starting the next unless told otherwise. Once M3 is done, the world (M6) can be built alongside the
engines (M4 and M5), because it only needs the glider. Sound (M8) waits until the flying is right.

| Milestone | Builds | Done when |
| --- | --- | --- |
| M0 Foundations | repo skeleton, `CLAUDE.md`, docs, test harness, push-to-deploy PWA shell | a push runs the tests and the empty app installs on the iPhone |
| M1 Glider, headless | 6-DOF core, atmosphere, aero model, the Twin II Acro card, `tools/fly.js` | stall speed, best glide and the sink polar match the flight manual |
| M2 First flight | a plain test grid to fly over, the glider model with moving surfaces, chase camera, tilt and gamepad input, basic HUD, simple wheel contact for landing | you launch, fly and land the glider on an iPhone 16 at 60 fps |
| M3 Feel | the airplane's real shadow, stability and damping, spins, assists, the hangar page running on the sim core; piston engine and propeller, flaps, tailwheel ground handling; Super Cub and Pitts S-2B. In three pull requests: M3a the glider, M3b the engine and the Cub, M3c the Pitts | handling tests pass, the Cub takes off, flies a circuit and lands with flaps, and the Pitts spins and recovers |
| M4 Engines | turboprop and jet engines, afterburner, retractable gear, water contact; King Air, CL-415, P-51, F-4, 737 | every airplane meets its targets, the King Air flies on one engine and the CL-415 lands on water |
| M5 Flight computer | F-35A g and roll-rate commands with angle-of-attack and g limits | a full-stick pull holds 9 g without departing |
| M6 World | terrain pipeline, stylized renderer, first region, ridge lift, wave and thermals | the glider climbs in ridge lift, a thermal and wave |
| M7 Night and polish | day and night, lights and reflections, PAPI, afterburner flames, menus | a night approach to the first airfield with runway lights and a working PAPI |
| M8 Sound | wind that changes with speed and g, rolling sounds, engines, maybe gear and flaps | a dive, a grass landing and a takeoff each sound right |
| M9 Grow the world | volcano, chalk coast and arch, desert strip, more airfields and landmarks | the 737 flies through the arch; then keep adding places |

The piston engine, propeller and flaps moved from M4 to M3, because the Cub and the Pitts can't fly
without them.

Each milestone gets its own prompt when it starts. A milestone's prompt may refine its scope; this
table is the outline.
