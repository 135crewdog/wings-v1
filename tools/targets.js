// Flies a card's targets: for each target, the model's figure beside the written one.
// Shared by tools/fly.js and tests/performance.test.js. Node only (reads the card from data/).

import { readFileSync } from "node:fs";
import { loadCard } from "../src/sim/card.js";
import { bestGlide, glide, minSink, stallSpeed } from "../src/sim/trim.js";
import { climbRate, levelSpeed, throttleForPower } from "../src/sim/performance.js";

const KMH = 3.6;
const MPH = 1 / 0.44704; // mph per m/s
const FPM = 1 / 0.00508; // ft/min per m/s

export function readCard(id) {
  return JSON.parse(readFileSync(new URL(`../data/aircraft/${id}.json`, import.meta.url), "utf8"));
}

// What each target measures, in the target's own units. Targets of later milestones have no
// entry until their physics exists.
const MEASURES = {
  stall_kmh: (c) => stallSpeed(c).V * KMH,
  stall_kmh_airbrake_full: (c) => stallSpeed(c, { airbrake: 1 }).V * KMH,
  best_glide_ratio: (c) => bestGlide(c).LD,
  best_glide_kmh: (c) => bestGlide(c).V * KMH,
  min_sink_ms: (c) => minSink(c).sink,
  min_sink_kmh: (c) => minSink(c).V * KMH,
  sink_ms_at_kmh: (c, t) => glide(c, t.speed_kmh / KMH)?.sink ?? NaN,
  glide_ratio_airbrake_full_at_kmh: (c, t) => glide(c, t.speed_kmh / KMH, { airbrake: 1 })?.LD ?? NaN,
  stall_mph: (c) => stallSpeed(c).V * MPH,
  stall_mph_flaps_full: (c) => stallSpeed(c, { flaps: 1 }).V * MPH,
  max_level_mph: (c) => (levelSpeed(c) ?? NaN) * MPH,
  climb_fpm_at_mph: (c, t) => (climbRate(c, t.speed_mph / MPH) ?? NaN) * FPM,
  cruise_mph_at_power: (c, t) => (levelSpeed(c, { throttle: throttleForPower(t.power) }) ?? NaN) * MPH,
};

/**
 * Every target in the card with the model's figure. status: PASS or FAIL against the tolerance,
 * REPORT for targets marked "check": "report", NOT YET for a milestone the sim can't fly yet.
 */
export function flyTargets(json) {
  const cards = new Map();
  const cardAt = (mass) => {
    if (!cards.has(mass)) cards.set(mass, loadCard(json, { mass_kg: mass }));
    return cards.get(mass);
  };
  return json.targets.map((t) => {
    const measure = MEASURES[t.what];
    const row = { ...t, model: null, diff: null, status: "NOT YET" };
    if (!measure) return row;
    row.model = measure(cardAt(t.mass_kg ?? json.mass.mass_kg), t);
    row.diff = row.model - t.value;
    if (t.check === "report") row.status = "REPORT";
    else row.status = Math.abs(row.diff) <= t.tol ? "PASS" : "FAIL";
    return row;
  });
}

/** A short label for a target: what, the speed if any, and the mass. */
export function describe(t) {
  const speed = t.speed_kmh != null ? ` @ ${t.speed_kmh} km/h` : t.speed_mph != null ? ` @ ${t.speed_mph} mph` : t.power != null ? ` @ ${t.power * 100}% power` : "";
  return `${t.what}${speed}, ${t.mass_kg} kg`;
}
