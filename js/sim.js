"use strict";
/* ===== Simulation engine: sums of i.i.d. increments (Bernoulli and Rademacher) ===== */

/* ---- seedable generator (sfc32, period about 2^128) ---- */
class Rng {
  constructor(seed) {
    let s = seed >>> 0;
    const sm = () => { s = (s + 0x9E3779B9) | 0; let z = s; z = Math.imul(z ^ (z >>> 16), 0x85ebca6b); z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35); return (z ^ (z >>> 16)) >>> 0; };
    this.a = sm(); this.b = sm(); this.c = sm(); this.d = 1;
    for (let i = 0; i < 15; i++) this.u32();
  }
  u32() {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }
}
function pop32(x) {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return Math.imul(x, 0x01010101) >>> 24;
}

/* ---- model constants: increment mean mu and variance s2 ---- */
const modelMu = (model, p) => model === "B" ? p : 0;
const modelVar = (model, p) => model === "B" ? p * (1 - p) : 1;

/* ---- simulation state and chunked simulation of attackers ----
   Attacker j walks through systems 1..n: S[k][j] is its total score after cps[k] systems. */
function makeState(model, p, m, cps, seed, nPaths) {
  const nmax = cps[cps.length - 1];
  return {
    model, p, m, cps, rng: new Rng(seed), nPaths,
    S: cps.map(() => new Int32Array(m)),
    paths: Array.from({ length: Math.min(nPaths, m) }, () => new Int32Array(nmax + 1))
  };
}
function simulateAttackers(st, from, to) {
  const { model, p, cps, rng, S, paths } = st, K = cps.length;
  const thr = Math.floor(p * 4294967296);
  for (let j = from; j < to; j++) {
    let s = 0, pos = 0;
    const path = j < paths.length ? paths[j] : null;
    for (let k = 0; k < K; k++) {
      const target = cps[k];
      if (path) {
        if (model === "B") for (; pos < target; pos++) { if (rng.u32() < thr) s++; path[pos + 1] = s; }
        else for (; pos < target; pos++) { s += (rng.u32() >>> 31) ? 1 : -1; path[pos + 1] = s; }
      } else if (model === "B") {
        for (; pos < target; pos++) if (rng.u32() < thr) s++;
      } else {
        let L = target - pos;
        while (L >= 32) { s += 2 * pop32(rng.u32()) - 32; L -= 32; }
        if (L > 0) { const r = rng.u32() & (0xFFFFFFFF >>> (32 - L)); s += 2 * pop32(r) - L; }
        pos = target;
      }
      S[k][j] = s;
    }
  }
}

/* ---- normal distribution ---- */
function erfc(x) { // Numerical Recipes erfcc, fractional error < 1.2e-7
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
const Phi = x => 0.5 * erfc(-x / Math.SQRT2);
const phi = x => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

/* ---- sample statistics ---- */
function momentsOf(v) { // v: array of numbers
  const m = v.length; let s = 0;
  for (let i = 0; i < m; i++) s += v[i];
  const mean = s / m; let c2 = 0, c3 = 0, c4 = 0;
  for (let i = 0; i < m; i++) { const d = v[i] - mean, d2 = d * d; c2 += d2; c3 += d2 * d; c4 += d2 * d2; }
  const varU = c2 / (m - 1), varP = c2 / m;
  return { mean, variance: varU, skew: c3 / m / Math.pow(varP, 1.5), exkurt: c4 / m / (varP * varP) - 3 };
}
function ksNormal(z) { // Kolmogorov-Smirnov distance between the empirical cdf of z and N(0,1); ties handled
  const m = z.length, a = Float64Array.from(z).sort();
  let D = 0, i = 0;
  while (i < m) {
    let g = i; while (g < m && a[g] === a[i]) g++;
    const F = Phi(a[i]);
    D = Math.max(D, Math.abs(i / m - F), Math.abs(g / m - F));
    i = g;
  }
  return D;
}

/* ---- exact tail P(|S_n/n - mu| > eps) from the binomial law ---- */
function makeLogFact(N) { const lf = new Float64Array(N + 1); for (let i = 2; i <= N; i++) lf[i] = lf[i - 1] + Math.log(i); return lf; }
function exactTail(model, p, n, eps, lf) {
  const q = model === "B" ? p : 0.5, lq = Math.log(q), l1q = Math.log(1 - q);
  let tail = 0;
  for (let k = 0; k <= n; k++) {
    const dev = model === "B" ? Math.abs(k / n - p) : Math.abs((2 * k - n) / n);
    if (dev > eps + 1e-12) tail += Math.exp(lf[n] - lf[k] - lf[n - k] + k * lq + (n - k) * l1q);
  }
  return Math.min(1, tail);
}
const chebyshevTail = (model, p, n, eps) => Math.min(1, modelVar(model, p) / (n * eps * eps));
const hoeffdingTail = (model, n, eps) => Math.min(1, 2 * Math.exp(model === "B" ? -2 * n * eps * eps : -n * eps * eps / 2));
const cltTail = (model, p, n, eps) => 2 * (1 - Phi(eps * Math.sqrt(n / modelVar(model, p))));
function berryEsseen(model, p, n) { // C * rho / (sigma^3 sqrt(n)), C = 0.4748
  const ratio = model === "B" ? ((1 - p) * (1 - p) + p * p) / Math.sqrt(p * (1 - p)) : 1;
  return 0.4748 * ratio / Math.sqrt(n);
}
function theoryMoments(model, p, n) { // skewness and excess kurtosis of S_n
  if (model === "B") { const v = p * (1 - p); return { skew: (1 - 2 * p) / Math.sqrt(n * v), exkurt: (1 - 6 * v) / (n * v) }; }
  return { skew: 0, exkurt: -2 / n };
}

/* ---- histogram on the lattice of S_n (unit steps for Bernoulli, steps of 2 for Rademacher) ---- */
function histLattice(S, model, n, maxBins) {
  const h = model === "B" ? 1 : 2, smin = model === "B" ? 0 : -n, m = S.length;
  let jmin = Infinity, jmax = -Infinity;
  for (let i = 0; i < m; i++) { const j = (S[i] - smin) / h; if (j < jmin) jmin = j; if (j > jmax) jmax = j; }
  const c = Math.max(1, Math.ceil((jmax - jmin + 1) / maxBins)), nb = Math.floor((jmax - jmin) / c) + 1;
  const counts = new Array(nb).fill(0);
  for (let i = 0; i < m; i++) counts[Math.floor(((S[i] - smin) / h - jmin) / c)]++;
  return counts.map((count, i) => { const lo = smin + (jmin + i * c) * h - h / 2; return { lo, hi: lo + c * h, count }; });
}

/* ---- per-checkpoint analysis for one model ---- */
function analyse(st, eps, lf) {
  const { model, p, m, cps, S } = st, mu = modelMu(model, p), s2 = modelVar(model, p), sg = Math.sqrt(s2);
  return cps.map((n, k) => {
    const arr = S[k], A = new Float64Array(m), N = new Float64Array(m), Z = new Float64Array(m);
    let bad = 0;
    for (let i = 0; i < m; i++) {
      A[i] = arr[i] / n; N[i] = arr[i] / Math.sqrt(n); Z[i] = (arr[i] - n * mu) / (sg * Math.sqrt(n));
      if (Math.abs(A[i] - mu) > eps + 1e-12) bad++;
    }
    const mz = momentsOf(Z);
    return {
      n, mS: momentsOf(arr), mA: momentsOf(A), mN: momentsOf(N), mZ: mz, ks: ksNormal(Z),
      tailEmp: bad / m, bad, tailExact: exactTail(model, p, n, eps, lf),
      cheb: chebyshevTail(model, p, n, eps), hoef: hoeffdingTail(model, n, eps), clt: cltTail(model, p, n, eps),
      be: berryEsseen(model, p, n), th: theoryMoments(model, p, n)
    };
  });
}
if (typeof module !== "undefined") module.exports = { Rng, makeState, simulateAttackers, erfc, Phi, momentsOf, ksNormal, makeLogFact, exactTail, histLattice, analyse, berryEsseen, theoryMoments, modelMu, modelVar, pop32 };
