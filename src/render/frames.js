// The one place frames are converted (CLAUDE.md conventions): the sim's NED world and body axes to
// Three.js. Pure array maths, no Three.js import, so Node tests run it.
//
// Three.js is y-up: x east, y up, z south. The model (.glb) has its nose along −Z, its right wing
// along +X and up along +Y, its origin at the nose tip. So the model's axes relate to the body axes
// (x forward, y right, z down) exactly as Three's world axes relate to NED (x north, y east, z down):
//
//   three = A ned,  model = A body,  A = [[0, 1, 0], [0, 0, −1], [−1, 0, 0]],  det A = +1
//
// and the model's orientation in Three is A R(q) Aᵀ: the same rotation with its axis converted.

/** A NED vector or position (north, east, down) in Three.js axes [x, y, z]. */
export const nedToThree = (v) => [v[1], -v[2], -v[0]];

/** A Three.js vector back to NED. */
export const threeToNed = (t) => [-t[2], t[0], -t[1]];

/** The sim's attitude quaternion [w, x, y, z] (body to NED) as the model's Three.js quaternion [x, y, z, w]. */
export const quatToThree = (q) => [q[2], -q[3], -q[1], q[0]];

/** Rotates a Three.js vector by a Three.js quaternion [x, y, z, w]. */
export function rotateThree(qt, v) {
  const [x, y, z, w] = qt;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

/**
 * The model's pose in Three.js for a sim state: its quaternion, and the position of its origin (the
 * nose tip), placed so that the card's CG lands on the sim's CG. cg: { fromNose, aboveNose } (m).
 */
export function modelPose(x, q, cg) {
  const quaternion = quatToThree(q);
  const cgInModel = [0, cg.aboveNose, cg.fromNose]; // aft is +Z, up is +Y, from the nose tip
  const off = rotateThree(quaternion, cgInModel);
  const p = nedToThree(x);
  return { position: [p[0] - off[0], p[1] - off[1], p[2] - off[2]], quaternion };
}
