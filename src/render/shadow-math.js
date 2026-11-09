// The airplane's shadow, as geometry (pure, tested; no Three.js). The sun is a disc 0.53° across, so a
// shadow's edge blurs by the disc's width at the distance from the airplane to the ground along the
// sun's rays: sharp at touchdown, soft at 50 m, a faint smudge at a few hundred metres, then gone. A
// blur that averages the shadow test over that disc is the fraction of the sun the airplane hides, so
// the blur and the fading are the same thing.

/** Where the shadow of point p falls on flat ground at height groundY, along the sun's rays. */
export function groundSpot(p, toward, groundY) {
  const t = (p[1] - groundY) / toward[1];
  return [p[0] - toward[0] * t, groundY, p[2] - toward[2] * t];
}

/** The distance from a point h above the ground to the ground along the sun's rays. */
export const slantDistance = (h, toward) => Math.max(0, h) / toward[1];

/** The width of the sun's disc at a distance d: the full width of the shadow's blurred edge. */
export const penumbra = (d, angularDiameter) => 2 * d * Math.tan(angularDiameter / 2);

/**
 * The fraction of the sun's disc (`w` metres across where the shadow falls) that a centred rectangle
 * `width` by `length` metres covers: how much of the sun a wing hides at the middle of its shadow.
 * Exact, by integrating the disc's chords across the rectangle.
 */
export function rectCover(width, length, w) {
  const R = w / 2, a = width / 2, b = length / 2;
  if (R === 0) return 1;
  const x1 = Math.min(a, R), n = 64;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const x = ((i + 0.5) / n) * x1; // midpoint rule over 0..x1, doubled for both sides
    area += 2 * Math.min(b, Math.sqrt(R * R - x * x)) * (x1 / n);
  }
  return Math.min(1, (2 * area) / (Math.PI * R * R));
}

/** The most of the sun the airplane hides anywhere in its shadow: its wing, chord by span. */
export const peakCover = (chord, span, w) => rectCover(chord, span, w);

export const SHADOW_GONE = 0.03;

/**
 * The shadow camera's square box and the blur, for an airplane `size` metres across whose shadow edge
 * is `w` wide, with a `mapSize` texel shadow map. The box holds the airplane and its blurred edge;
 * when the blur would be wider than `maxRadius` texels, the box grows (coarser texels) instead, which
 * costs nothing in sharpness because the edge is that soft anyway.
 * Returns { half (m), texel (m), radius (texels, the blur disc's radius) }.
 */
export function shadowFrame(size, w, mapSize, maxRadius = 4) {
  let half = size / 2 + w;
  let texel = (2 * half) / mapSize;
  if (w / 2 / texel > maxRadius) {
    texel = w / 2 / maxRadius;
    half = (texel * mapSize) / 2;
  }
  return { half, texel, radius: w / 2 / texel };
}
