# Wings

A flight sim for the iPhone, built as a Three.js PWA. Real physics with simplified inputs: one
honest set of equations flies every airplane, and each airplane is a short card of numbers. Solo
only; no weather, no combat, no scores.

The rules, layout and conventions are in [CLAUDE.md](CLAUDE.md). The equations are in
[docs/flight-model.md](docs/flight-model.md) and the aircraft in [docs/aircraft.md](docs/aircraft.md).

## Run it

Needs Node 22 or later. There are no dependencies to install.

```sh
npm test                               # every test (node --test)
npm run serve                          # the app at http://localhost:8000
node tools/fly.js twin-ii-acro         # performance against the card's targets
node tools/fly.js twin-ii-acro --polar # sink rate and glide ratio from the stall to VNE
```

Every push to `main` runs the tests and, if they pass, publishes the site to GitHub Pages
(`.github/workflows/deploy.yml`). On an iPhone, open the Pages URL in Safari and choose
Share, Add to Home Screen.
