// node tools/fly.js <id> [--mass <kg>] [--polar]
//
// Without --polar: every target in the card, grouped by milestone, with target, model, difference
// and PASS, FAIL, REPORT (printed, not checked) or NOT YET (a later milestone's physics).
// With --polar: speed, sink rate and glide ratio every 5 km/h from the stall to VNE, at the card's
// mass or --mass. Sea level, standard day, airbrakes closed.

import { loadCard } from "../src/sim/card.js";
import { bestGlide, glide, minSink, stallSpeed } from "../src/sim/trim.js";
import { describe, flyTargets, readCard } from "./targets.js";

const KMH = 3.6;

function usage(msg) {
  if (msg) console.error(msg);
  console.error("usage: node tools/fly.js <aircraft-id> [--mass <kg>] [--polar]");
  process.exit(2);
}

function parse(argv) {
  const opts = { id: null, mass: null, polar: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--polar") opts.polar = true;
    else if (a === "--mass") {
      opts.mass = Number(argv[++i]);
      if (!(opts.mass > 0)) usage("--mass needs a mass in kg");
    } else if (a.startsWith("-")) usage(`unknown option ${a}`);
    else if (!opts.id) opts.id = a;
    else usage(`unexpected argument ${a}`);
  }
  if (!opts.id) usage();
  return opts;
}

const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
const fmt = (x, d) => (x == null ? "" : Number.isFinite(x) ? x.toFixed(d) : "none");
const decimals = (t) => Math.max(1, (String(t.value).split(".")[1] ?? "").length, (String(t.tol ?? "").split(".")[1] ?? "").length);

function targetsTable(json) {
  const rows = flyTargets(json);
  const milestones = [...new Set(rows.map((r) => r.milestone))].sort();
  const w = Math.max(...rows.map((r) => describe(r).length)) + 2;
  console.log(`${json.name} (${json.id}): targets`);
  for (const m of milestones) {
    console.log(`\n${m}`);
    console.log(`  ${pad("target", w)}${lpad("value", 8)}${lpad("tol", 7)}${lpad("model", 9)}${lpad("diff", 9)}  status`);
    for (const r of rows.filter((x) => x.milestone === m)) {
      const d = decimals(r);
      const tol = r.check === "report" ? "-" : `±${r.tol}`;
      const diff = r.diff == null ? "" : `${r.diff >= 0 ? "+" : ""}${fmt(r.diff, d + 1)}`;
      console.log(`  ${pad(describe(r), w)}${lpad(r.value, 8)}${lpad(tol, 7)}${lpad(fmt(r.model, d + 1), 9)}${lpad(diff, 9)}  ${r.status}`);
    }
  }
  const counted = rows.filter((r) => r.status === "PASS" || r.status === "FAIL");
  const failed = counted.filter((r) => r.status === "FAIL");
  console.log(`\n${counted.length - failed.length} of ${counted.length} checked targets pass` +
    `; ${rows.filter((r) => r.status === "REPORT").length} reported; ${rows.filter((r) => r.status === "NOT YET").length} not yet flyable.`);
  return failed.length === 0;
}

function polarTable(json, mass) {
  const c = loadCard(json, { mass_kg: mass });
  const vs = stallSpeed(c);
  const vsOpen = stallSpeed(c, { airbrake: 1 });
  const best = bestGlide(c);
  const sink = minSink(c);
  console.log(`${json.name} (${json.id}) at ${mass} kg: sea level, standard day, airbrakes closed`);
  console.log(`  stall          ${fmt(vs.V * KMH, 1)} km/h  (CL ${fmt(vs.CL, 3)} at α ${fmt((vs.alpha * 180) / Math.PI, 2)}°${vs.elevatorLimited ? ", elevator-limited" : ""})`);
  console.log(`  stall, brakes  ${fmt(vsOpen.V * KMH, 1)} km/h  (CL ${fmt(vsOpen.CL, 3)})`);
  console.log(`  best glide     ${fmt(best.LD, 2)} at ${fmt(best.V * KMH, 1)} km/h`);
  console.log(`  minimum sink   ${fmt(sink.sink, 3)} m/s at ${fmt(sink.V * KMH, 1)} km/h`);
  console.log(`  VNE            ${fmt(c.vne * KMH, 0)} km/h`);
  console.log("");
  console.log(`  ${lpad("km/h", 6)}${lpad("sink m/s", 10)}${lpad("L/D", 8)}${lpad("α deg", 8)}${lpad("δe", 8)}`);
  const row = (label, g) =>
    console.log(`  ${lpad(label, 6)}${lpad(fmt(g.sink, 3), 10)}${lpad(fmt(g.LD, 2), 8)}${lpad(fmt((g.alpha * 180) / Math.PI, 2), 8)}${lpad(fmt(g.elevator, 3), 8)}`);
  const atStall = glide(c, vs.V * (1 + 1e-9));
  if (atStall) row(fmt(vs.V * KMH, 1), atStall);
  for (let kmh = Math.floor((vs.V * KMH) / 5) * 5 + 5; kmh <= Math.round(c.vne * KMH) + 1e-9; kmh += 5) {
    const g = glide(c, kmh / KMH);
    if (g) row(kmh, g);
  }
}

const opts = parse(process.argv.slice(2));
let json;
try {
  json = readCard(opts.id);
} catch (err) {
  usage(`no card for "${opts.id}" in data/aircraft/ (${err.code ?? err.message})`);
}
if (opts.polar) {
  polarTable(json, opts.mass ?? json.mass.mass_kg);
} else {
  if (opts.mass) console.log(`(--mass applies to --polar; each target flies at its own mass)\n`);
  const ok = targetsTable(json);
  process.exitCode = ok ? 0 : 1;
}
