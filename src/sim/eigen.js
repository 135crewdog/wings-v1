// Eigenvalues of a small real matrix (the handling modes, flight-model §12). For the 4×4 blocks
// the modes need, the characteristic polynomial (Faddeev–LeVerrier) and its roots (Durand–Kerner,
// then Newton polishing) are short, exact enough and easy to check. Plain arrays; no browser code.

const mul = (A, B) => A.map((row) => B[0].map((_, j) => row.reduce((s, a, k) => s + a * B[k][j], 0)));

/** Coefficients c[0..n] of det(λI − A) = λⁿ + c[1] λⁿ⁻¹ + … + c[n]; c[0] = 1. */
export function charPoly(A) {
  const n = A.length;
  const c = [1];
  let M = A.map((r) => r.map(() => 0)); // M_0 = 0
  for (let k = 1; k <= n; k++) {
    // M_k = A M_{k-1} + c_{k-1} I ;  c_k = −tr(A M_k) / k
    M = mul(A, M).map((r, i) => r.map((v, j) => v + (i === j ? c[k - 1] : 0)));
    const AM = mul(A, M);
    c.push(-AM.reduce((s, r, i) => s + r[i], 0) / k);
  }
  return c;
}

// complex arithmetic on [re, im]
const cadd = (a, b) => [a[0] + b[0], a[1] + b[1]];
const csub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a, b) => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};

function horner(c, z) {
  let p = [c[0], 0], dp = [0, 0];
  for (let i = 1; i < c.length; i++) {
    dp = cadd(cmul(dp, z), p);
    p = cadd(cmul(p, z), [c[i], 0]);
  }
  return { p, dp };
}

/** Roots of the monic polynomial c (c[0] = 1), as [{ re, im }]. */
export function roots(c) {
  const n = c.length - 1;
  const bound = 1 + Math.max(...c.slice(1).map(Math.abs)); // Cauchy's bound
  let z = Array.from({ length: n }, (_, k) => {
    const a = (2 * Math.PI * k) / n + 0.4;
    return [0.5 * bound * Math.cos(a), 0.5 * bound * Math.sin(a)];
  });
  for (let it = 0; it < 500; it++) {
    let moved = 0;
    z = z.map((zi, i) => {
      let den = [1, 0];
      z.forEach((zj, j) => { if (j !== i) den = cmul(den, csub(zi, zj)); });
      const step = cdiv(horner(c, zi).p, den);
      moved = Math.max(moved, Math.hypot(...step));
      return csub(zi, step);
    });
    if (moved < 1e-14 * bound) break;
  }
  // Newton polishing, then snap tiny imaginary parts of real roots
  z = z.map((zi) => {
    for (let k = 0; k < 5; k++) {
      const { p, dp } = horner(c, zi);
      if (Math.hypot(...dp) === 0) break;
      zi = csub(zi, cdiv(p, dp));
    }
    return zi;
  });
  return z.map(([re, im]) => ({ re, im: Math.abs(im) < 1e-9 * (1 + Math.abs(re)) ? 0 : im }));
}

/** Eigenvalues of the square matrix A (array of rows), as [{ re, im }]. */
export const eigenvalues = (A) => roots(charPoly(A));
