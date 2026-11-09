// Handling (flight-model §12): every airplane's modes inside the bounds at its approach and cruise
// speeds, and the linearization agrees with the full 6-DOF sim.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { loadCard } from "../src/sim/card.js";
import { check, modes } from "../src/sim/handling.js";
import { DT, Sim } from "../src/sim/sim.js";
import { glide, glideState } from "../src/sim/trim.js";
import { eigenvalues } from "../src/sim/eigen.js";

const dir = new URL("../data/aircraft/", import.meta.url);
const cards = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")));

test("the eigenvalue solver finds known modes in a disguised matrix", () => {
  // modes -0.5±2i (short period) and -0.02±0.2i (phugoid), mixed by a similarity transform
  const A = [[-0.5, 2, 0, 0], [-2, -0.5, 0, 0], [0, 0, -0.02, 0.2], [0, 0, -0.2, -0.02]];
  const T = [[1, 2, 0, 1], [0, 1, 3, 0], [1, 0, 1, 2], [2, 1, 0, 1]];
  const mm = (X, Y) => X.map((r) => Y[0].map((_, j) => r.reduce((s, v, k) => s + v * Y[k][j], 0)));
  const inverse = (M) => {
    const n = M.length, a = M.map((r, i) => [...r, ...M.map((_, j) => +(i === j))]);
    for (let i = 0; i < n; i++) {
      let p = i;
      for (let k = i + 1; k < n; k++) if (Math.abs(a[k][i]) > Math.abs(a[p][i])) p = k;
      [a[i], a[p]] = [a[p], a[i]];
      const d = a[i][i];
      a[i] = a[i].map((v) => v / d);
      for (let k = 0; k < n; k++) if (k !== i) { const f = a[k][i]; a[k] = a[k].map((v, j) => v - f * a[i][j]); }
    }
    return a.map((r) => r.slice(n));
  };
  const Ti = inverse(T);
  assert.ok(mm(T, Ti).every((r, i) => r.every((v, j) => Math.abs(v - (i === j ? 1 : 0)) < 1e-12)));
  const got = eigenvalues(mm(mm(T, A), Ti)).map((e) => [e.re, Math.abs(e.im)]).sort((a, b) => a[0] - b[0]);
  const want = [[-0.5, 2], [-0.5, 2], [-0.02, 0.2], [-0.02, 0.2]];
  got.forEach((g, i) => assert.ok(Math.abs(g[0] - want[i][0]) < 1e-6 && Math.abs(g[1] - want[i][1]) < 1e-6, JSON.stringify(got)));
});

for (const json of cards) {
  for (const [label, kmh] of [["approach", json.speeds?.approach_kmh], ["cruise", json.speeds?.cruise_kmh]]) {
    test(`${json.id}, ${label} (${kmh} km/h): every handling figure inside its bound`, (t) => {
      assert.ok(kmh, `${json.id} has no speeds.${label}_kmh`);
      const m = modes(loadCard(json), kmh / 3.6);
      const rows = check(m);
      for (const r of rows) t.diagnostic(`${r.pass ? "PASS" : "FAIL"} ${r.what}: ${r.value.toFixed(3)} (${r.bound})`);
      assert.deepEqual(rows.filter((r) => !r.pass).map((r) => r.what), []);
    });
  }
}

test("the full sim flies the phugoid the linearization predicts", (t) => {
  const json = cards.find((c) => c.id === "twin-ii-acro");
  const c = loadCard(json);
  const V = json.speeds.approach_kmh / 3.6, h = 1500;
  const m = modes(c, V, { altitude: h });
  // a small speed step from trim, then watch the speed oscillate
  const trim = glide(c, V, { altitude: h });
  const s = glideState(trim, h);
  s.v = s.v.map((x) => x * 1.01);
  const sim = new Sim(c, s);
  const speeds = [];
  for (let i = 0; i < 240 / DT; i++) {
    sim.step({ elevator: trim.elevator });
    speeds.push(Math.hypot(...sim.state.v) - V);
  }
  // After the short period has died away (5 s): the swings between neighbouring peaks and troughs.
  // Peak to trough cancels the slow drift of the trimmed speed as the glider sinks into denser air.
  const ext = [];
  for (let i = Math.round(5 / DT); i < speeds.length - 1; i++) {
    const up = speeds[i] > speeds[i - 1] && speeds[i] >= speeds[i + 1];
    const down = speeds[i] < speeds[i - 1] && speeds[i] <= speeds[i + 1];
    if (up || down) ext.push({ t: i * DT, v: speeds[i] });
  }
  const swings = ext.slice(1).map((e, i) => ({ t: (e.t + ext[i].t) / 2, a: Math.abs(e.v - ext[i].v) }));
  const period = (2 * (ext.at(-1).t - ext[0].t)) / (ext.length - 1);
  const decrement = Math.log(swings[0].a / swings[2].a); // two swings apart: one full cycle
  const zeta = decrement / Math.sqrt(4 * Math.PI ** 2 + decrement ** 2);
  t.diagnostic(`flown: period ${period.toFixed(2)} s, ζ ${zeta.toFixed(3)}; linearized: ${m.phugoid.period.toFixed(2)} s, ζ ${m.phugoid.zeta.toFixed(3)}`);
  assert.ok(Math.abs(period / m.phugoid.period - 1) < 0.03, "period");
  assert.ok(Math.abs(zeta - m.phugoid.zeta) < 0.01, "damping");
});
