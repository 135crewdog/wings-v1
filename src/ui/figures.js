// The hangar's figures (docs/aircraft.md, "The hangar"): every number from src/sim/, in pilot terms
// and the HUD's units. Pure, no DOM, so the tests compute the same table the page shows.

import { loadCard } from "../sim/card.js";
import { bestGlide, minSink, stallSpeed } from "../sim/trim.js";
import { check, modes, rollPerformance } from "../sim/handling.js";
import { cornerSpeed, instantaneousTurns, maxInstantaneousTurn, turnRate } from "../sim/performance.js";

export const KT = 0.514444; // m/s per knot
export const FPM = 0.00508; // m/s per foot per minute
const DEG = 180 / Math.PI;
const KMH = 1 / 3.6;

const hasEngine = (json) => (json.engines ?? []).length > 0;
const hasFlaps = (json) => json.devices?.flaps != null;

/** Runs fn, and returns null instead of throwing: a tuned card can leave a figure undefined. */
function tryOr(fn) {
  try {
    const v = fn();
    return v ?? null;
  } catch {
    return null;
  }
}

/**
 * The hangar's table for one card JSON: [{ group, rows: [{ name, value, note?, fail? }] }], plus the
 * diagram's data. Values are display strings; null figures show as a dash.
 */
export function figures(json) {
  const c = loadCard(json);
  const kt = (v) => (v == null ? null : `${Math.round(v / KT)} kt`);
  const out = [];

  // Speeds and the glide
  const vs = tryOr(() => stallSpeed(c));
  const landing = hasFlaps(json) ? null : tryOr(() => stallSpeed(c, { airbrake: 1 }));
  const best = tryOr(() => bestGlide(c));
  const sink = tryOr(() => minSink(c));
  const speeds = [
    { name: "stall speed, clean", value: kt(vs?.V), note: vs?.elevatorLimited ? "set by the elevator" : undefined },
    { name: hasFlaps(json) ? "stall speed, landing flaps" : "stall speed, airbrakes open", value: kt(landing?.V) },
  ];
  if (!hasEngine(json)) {
    speeds.push(
      { name: "best glide ratio", value: best ? best.LD.toFixed(1) : null },
      { name: "best glide speed", value: kt(best?.V) },
      { name: "minimum sink rate", value: sink ? `${Math.round(sink.sink / FPM)} ft/min` : null },
      { name: "minimum sink speed", value: kt(sink?.V) },
    );
  }
  speeds.push(
    { name: "best rate of climb", value: hasEngine(json) ? null : "no engine" },
    { name: "maximum level speed", value: hasEngine(json) ? null : "no engine" },
    { name: "never-exceed speed", value: kt(c.vne) },
  );
  out.push({ group: "Speeds", rows: speeds });

  // Turns
  const corner = tryOr(() => cornerSpeed(c));
  const most = tryOr(() => maxInstantaneousTurn(c));
  out.push({
    group: "Turns",
    rows: [
      { name: "maximum sustained turn rate", value: hasEngine(json) ? null : "no engine" },
      { name: "maximum instantaneous turn rate", value: most ? `${Math.round(most.rate * DEG)}°/s` : null, note: most && !most.atCorner ? "at the never-exceed speed" : undefined },
      { name: "corner speed", value: corner ? (corner.V <= c.vne ? kt(corner.V) : `above the never-exceed speed (${kt(corner.V)})`) : null },
      { name: "limit load factors", value: `+${json.mass.g_max} g, ${json.mass.g_min} g` },
    ],
  });

  // Handling, at the card's approach and cruise speeds
  const at = [["approach", json.speeds?.approach_kmh], ["cruise", json.speeds?.cruise_kmh]].filter(([, v]) => v);
  for (const [label, kmh] of at) {
    const V = kmh * KMH;
    const m = tryOr(() => modes(c, V));
    const r = tryOr(() => rollPerformance(c, V));
    const bound = m ? Object.fromEntries(check(m).map((x) => [x.what, x])) : {};
    const fails = (...names) => names.some((n) => bound[n] && !bound[n].pass);
    const rows = [];
    if (m) {
      rows.push(
        { name: "short period: frequency, damping ratio", value: `${m.shortPeriod.wn.toFixed(1)} rad/s, ${m.shortPeriod.zeta.toFixed(2)}`, fail: fails("short-period damping ratio") },
        { name: "phugoid: period, damping ratio", value: `${m.phugoid.period.toFixed(0)} s, ${m.phugoid.zeta.toFixed(3)}`, fail: fails("phugoid damping ratio") },
        { name: "Dutch roll: frequency, damping ratio", value: `${m.dutchRoll.wn.toFixed(2)} rad/s, ${m.dutchRoll.zeta.toFixed(2)}`, fail: fails("Dutch roll damping ratio", "Dutch roll frequency (rad/s)", "Dutch roll ζω (rad/s)") },
      );
      if (m.rollMode) {
        rows.push(
          { name: "roll-mode time constant", value: `${m.rollMode.tau.toFixed(2)} s`, fail: fails("roll-mode time constant (s)") },
          {
            name: m.spiral.stable ? "spiral: stable, time to half" : "spiral: unstable, time to double",
            value: `${(m.spiral.stable ? m.spiral.timeToHalf : m.spiral.timeToDouble).toFixed(0)} s`,
            fail: fails("spiral time to double (s)"),
          },
        );
      } else {
        rows.push({ name: "roll and spiral", value: "coupled", fail: true });
      }
    } else {
      rows.push({ name: "trimmed flight", value: null, note: "no trim at this speed" });
    }
    rows.push(
      { name: "time to roll from 45° bank to 45° the other way", value: r && Number.isFinite(r.reversal) ? `${r.reversal.toFixed(1)} s` : r ? "over 10 s" : null },
      { name: "maximum roll rate", value: r ? `${Math.round(r.maxRollRate)}°/s` : null },
    );
    out.push({ group: `Handling at ${Math.round(V / KT)} kt (${label})`, rows });
  }

  // The energy-manoeuvrability diagram: turn rate (°/s) against speed (kt)
  const em = tryOr(() => {
    const step = Math.max(0.25, (c.vne - (vs?.V ?? 0)) / 160);
    const turns = instantaneousTurns(c, { step });
    // the lift limit alone, (V / Vs)² g, also past the corner, drawn faint: what the wing could pull
    const lift = turns.map(({ V }) => ({ V, rate: turnRate((V / vs.V) ** 2, V) }));
    return {
      vs: vs?.V ?? null,
      vne: c.vne,
      gMax: json.mass.g_max,
      corner,
      turns: turns.map(({ V, rate, n }) => ({ kt: V / KT, deg: rate * DEG, n })),
      lift: lift.map(({ V, rate }) => ({ kt: V / KT, deg: rate * DEG })),
      sustained: null, // no engine yet: the sustained turn curve comes with thrust (M3b)
    };
  });
  return { name: json.name, card: c, groups: out, em };
}

