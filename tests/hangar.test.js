// The hangar's figures come from src/sim/ and nowhere else, and a badly tuned card shows dashes
// instead of breaking the page (docs/aircraft.md, "The hangar").
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { figures, KT } from "../src/ui/figures.js";
import { loadCard } from "../src/sim/card.js";
import { bestGlide, stallSpeed } from "../src/sim/trim.js";
import { cornerSpeed } from "../src/sim/performance.js";

const roster = JSON.parse(readFileSync(new URL("../data/roster.json", import.meta.url)));
const read = (id) => JSON.parse(readFileSync(new URL(`../data/aircraft/${id}.json`, import.meta.url)));
const row = (f, name) => f.groups.flatMap((g) => g.rows).find((r) => r.name === name);

test("every roster airplane has a card the hangar can show", () => {
  for (const id of roster.aircraft) {
    const f = figures(read(id));
    assert.ok(f.groups.length >= 3, id);
    assert.ok(f.em && f.em.turns.length > 10, id);
  }
});

test("the hangar's figures are the sim's own", () => {
  const json = read("twin-ii-acro"), c = loadCard(json), f = figures(json);
  assert.equal(row(f, "stall speed, clean").value, `${Math.round(stallSpeed(c).V / KT)} kt`);
  assert.equal(row(f, "best glide ratio").value, bestGlide(c).LD.toFixed(1));
  assert.equal(row(f, "corner speed").value, `${Math.round(cornerSpeed(c).V / KT)} kt`);
  assert.equal(row(f, "maximum sustained turn rate").value, "no engine");
  // the handling of the card as it is passes every bound
  assert.ok(f.groups.flatMap((g) => g.rows).every((r) => !r.fail));
});

test("a card tuned past flying shows dashes, not an error", () => {
  const json = read("twin-ii-acro");
  json.stability.static_margin = -0.3; // unstable: no trimmed glide
  const f = figures(json);
  assert.ok(f.groups.length >= 3);
});

test("with the corner above VNE, the most turn rate is the one at VNE", () => {
  const json = read("twin-ii-acro");
  json.mass.mass_kg = 1160;
  json.wing.cl_max = 0.6;
  const f = figures(json);
  const turns = f.em.turns;
  assert.ok(f.em.corner.V > f.em.vne);
  assert.equal(row(f, "maximum instantaneous turn rate").value, `${Math.round(Math.max(...turns.map((p) => p.deg)))}°/s`);
  assert.match(row(f, "corner speed").value, /above the never-exceed speed/);
});

test("an overdamped Dutch roll still gives every handling figure", () => {
  const json = read("twin-ii-acro");
  json.stability.cnr = -0.18;
  json.stability.cn_beta = 0.015;
  const f = figures(json);
  const dr = row(f, "Dutch roll: frequency, damping ratio");
  assert.ok(dr && dr.value, "Dutch roll figure present");
  assert.ok(row(f, "roll-mode time constant").value);
});
