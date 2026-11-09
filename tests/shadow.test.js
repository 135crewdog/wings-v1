// The shadow's geometry (src/render/shadow-math.js): where it falls, how soft its edge is, how much
// of the sun it can hide, and the shadow camera's box.

import { test } from "node:test";
import assert from "node:assert/strict";
import { groundSpot, penumbra, peakCover, rectCover, shadowFrame, slantDistance, SHADOW_GONE } from "../src/render/shadow-math.js";
import { SUN } from "../src/render/sun.js";

const near = (a, b, tol) => Math.abs(a - b) <= tol;

test("the shadow falls on the ground along the sun's rays", () => {
  assert.deepEqual(groundSpot([3, 50, -7], [0, 1, 0], 0), [3, 0, -7]); // sun overhead: straight down
  const t = SUN.toward, p = [10, 80, 20];
  const s = groundSpot(p, t, 5);
  assert.equal(s[1], 5);
  // the spot, moved toward the sun by the slant distance, is the airplane
  const d = slantDistance(80 - 5, t);
  [0, 1, 2].forEach((i) => assert.ok(near(s[i] + t[i] * d, p[i], 1e-9)));
});

test("the edge blurs by the sun's 0.53° disc: about 0.0093 x the distance; sharp at touchdown", () => {
  assert.ok(near(penumbra(1, SUN.angularDiameter), 0.00925, 0.00001));
  assert.ok(near(penumbra(50, SUN.angularDiameter), 0.4625, 0.001));
  assert.equal(penumbra(0, SUN.angularDiameter), 0);
  // with the sun not overhead the rays are longer than the height
  assert.ok(slantDistance(100, SUN.toward) > 100 && slantDistance(100, [0, 1, 0]) === 100);
});

test("how much of the sun a wing hides: all of it while the disc fits inside, less as the disc grows", () => {
  assert.equal(rectCover(1, 17.5, 0.5), 1);
  assert.equal(rectCover(1, 17.5, 0), 1);
  let prev = 1;
  for (const w of [1.5, 2, 4, 8, 16, 64]) {
    const c = rectCover(1, 17.5, w);
    assert.ok(c < prev && c > 0, `w ${w}: ${c}`);
    prev = c;
  }
  // checked against a direct count over the disc, for a disc narrower and wider than the wing is long
  for (const [width, length, w] of [[1, 17.5, 3], [1, 17.5, 30]]) {
    let hit = 0, all = 0;
    for (let i = -600; i <= 600; i++) for (let j = -600; j <= 600; j++) {
      const x = (i / 600) * (w / 2), y = (j / 600) * (w / 2);
      if (x * x + y * y > (w / 2) ** 2) continue;
      all++;
      if (Math.abs(x) <= width / 2 && Math.abs(y) <= length / 2) hit++;
    }
    assert.ok(near(rectCover(width, length, w), hit / all, 0.003), `${width} x ${length} under ${w}: ${rectCover(width, length, w)} vs ${hit / all}`);
  }
});

test("a glider's shadow is solid near the ground, faint at a few hundred metres, then gone", () => {
  const cover = (h) => peakCover(1.0, 17.5, penumbra(slantDistance(h, SUN.toward), SUN.angularDiameter));
  assert.equal(cover(1), 1);
  assert.ok(cover(50) > 0.9, `50 m: ${cover(50)}`);
  assert.ok(cover(300) > SHADOW_GONE && cover(300) < 0.5, `300 m: ${cover(300)}`);
  assert.ok(cover(3000) < SHADOW_GONE, `3,000 m: ${cover(3000)}`);
});

test("the shadow box holds the airplane and its blur, and the blur stays a few texels wide", () => {
  const near0 = shadowFrame(18, 0.01, 1024);
  assert.ok(near0.half >= 9 && near0.texel < 0.04 && near0.radius < 1);
  for (const w of [0.5, 2, 8, 30]) {
    const f = shadowFrame(18, w, 1024);
    assert.ok(f.half >= 9 + w - 1e-9, `w ${w}: box ${f.half}`);
    assert.ok(f.radius <= 4 + 1e-9, `w ${w}: radius ${f.radius}`);
    assert.ok(near(f.radius * f.texel * 2, w, 1e-9));
  }
});
