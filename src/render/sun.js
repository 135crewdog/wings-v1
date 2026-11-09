// The sun: the one place its direction and size live (CLAUDE.md: one fact, one home). Day and night
// arrive in M7 and will move it from here.

const n = Math.hypot(0.4, 1, 0.3);

export const SUN = {
  /** Unit vector toward the sun, in Three.js axes (x east, y up, z south): high, from the south-east. */
  toward: [0.4 / n, 1 / n, 0.3 / n],
  /** The sun's angular diameter, radians (0.53°). */
  angularDiameter: (0.53 * Math.PI) / 180,
};
