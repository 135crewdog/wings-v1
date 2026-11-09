// Every M1 target in the Twin II Acro card passes within its tolerance (flight-model §9).
// REPORT entries are printed, not checked.

import { test } from "node:test";
import assert from "node:assert/strict";
import { describe, flyTargets, readCard } from "../tools/targets.js";

const rows = flyTargets(readCard("twin-ii-acro")).filter((r) => r.milestone === "M1");

test("the card has M1 targets", () => assert.ok(rows.length > 0));

for (const r of rows) {
  if (r.status === "REPORT") {
    test(`report: ${describe(r)}`, (t) => {
      t.diagnostic(`${r.what}: target ${r.value}, model ${r.model.toFixed(3)}, difference ${r.diff >= 0 ? "+" : ""}${r.diff.toFixed(3)}`);
    });
    continue;
  }
  test(`${describe(r)}: ${r.value} ± ${r.tol}`, () => {
    assert.ok(Number.isFinite(r.model), "no model figure");
    assert.ok(Math.abs(r.diff) <= r.tol, `model ${r.model.toFixed(3)}, off by ${r.diff.toFixed(3)}`);
  });
}
