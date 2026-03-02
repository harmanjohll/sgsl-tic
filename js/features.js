/* ============================================================
   SgSL Hub — Feature Extraction & DTW
   ============================================================
   Handles: vector math, frame normalization, feature vectors,
   sequence resampling, and Dynamic Time Warping for recognition.

   Feature vector per frame (59 values):
     - 16 bone directions x 3 components  = 48
     - 11 pairwise fingertip distances     = 11

   Sequences are resampled to a fixed number of frames (default 32)
   so signs of any duration can be compared.

   Future (Phase 2): velocity / acceleration features, TF.js model.
   ============================================================ */

import { RESAMPLE_FRAMES } from './config.js';

/* ---------- Vector math ---------- */

export function vsub(a, b) {
  return [a[0] - b[0], a[1] - b[1], (a[2] ?? 0) - (b[2] ?? 0)];
}

function vmul(a, s) {
  return [a[0] * s, a[1] * s, (a[2] ?? 0) * s];
}

export function vdot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + (a[2] ?? 0) * (b[2] ?? 0);
}

export function vnorm(a) {
  const n = Math.hypot(a[0], a[1], a[2] ?? 0);
  return n ? vmul(a, 1 / n) : [0, 0, 0];
}

function cross(a, b) {
  return [
    a[1] * (b[2] ?? 0) - (a[2] ?? 0) * b[1],
    (a[2] ?? 0) * b[0] - a[0] * (b[2] ?? 0),
    a[0] * b[1] - a[1] * b[0],
  ];
}

function rotateToBasis(p, ex, ey, ez) {
  return [vdot(p, ex), vdot(p, ey), vdot(p, ez)];
}

/* ---------- Bone & pair definitions ---------- */

// 16 bones of the hand (MediaPipe 21 landmarks)
const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // thumb
  [5, 6], [6, 7], [7, 8],               // index
  [9, 10], [10, 11], [11, 12],          // middle
  [13, 14], [14, 15], [15, 16],         // ring
  [17, 18], [18, 19], [19, 20],         // pinky
];

// 11 pairwise distances (fingertip interactions + palm references)
const PAIRS = [
  [0, 5], [0, 9], [0, 17],              // wrist to finger bases
  [4, 8], [8, 12], [12, 16], [16, 20],  // adjacent fingertips
  [4, 12], [4, 16], [4, 20],            // thumb to fingertips
  [8, 20],                              // index to pinky
];

/* ---------- Frame normalization ---------- */

/**
 * Normalize a single frame to be wrist-relative, scale-invariant,
 * and rotation-canonical. This makes recognition work regardless
 * of where in the camera frame the hand appears.
 */
export function normalizeFrame(frame) {
  const wrist = frame[0];
  const palmRef = frame[9]; // middle finger MCP
  const scale = Math.hypot(
    palmRef[0] - wrist[0],
    palmRef[1] - wrist[1],
    (palmRef[2] ?? 0) - (wrist[2] ?? 0)
  ) || 1e-5;

  // Build orthogonal basis from palm geometry
  const ez = vnorm(vsub(palmRef, wrist));
  let ex = vnorm(vsub(frame[5], wrist)); // index MCP
  let ey = vnorm(cross(ez, ex));
  ex = vnorm(cross(ey, ez));

  return frame.map(lm => {
    const p = [
      (lm[0] - wrist[0]) / scale,
      (lm[1] - wrist[1]) / scale,
      ((lm[2] ?? 0) - (wrist[2] ?? 0)) / scale,
    ];
    return rotateToBasis(p, ex, ey, ez);
  });
}

/* ---------- Feature extraction ---------- */

/**
 * Extract a feature vector from a normalized frame.
 * Returns 59 values: 48 bone directions + 11 pairwise distances.
 */
export function frameToFeatures(norm) {
  const dir = [];
  for (const [a, b] of BONES) {
    const d = vnorm(vsub(norm[b], norm[a]));
    dir.push(d[0], d[1], d[2]);
  }

  const dist = [];
  for (const [a, b] of PAIRS) {
    const d = vsub(norm[b], norm[a]);
    dist.push(Math.hypot(d[0], d[1], d[2]));
  }

  return dir.concat(dist);
}

/* ---------- Sequence resampling ---------- */

/**
 * Linearly interpolate a variable-length sequence to exactly N frames.
 * This allows DTW comparison between signs performed at different speeds.
 */
export function resampleSeq(frames, N = RESAMPLE_FRAMES) {
  if (!frames.length) return [];
  if (frames.length === 1) return Array(N).fill(frames[0]);

  const out = [];
  const L = frames.length;
  for (let i = 0; i < N; i++) {
    const t = (i * (L - 1)) / (N - 1);
    const i0 = Math.floor(t);
    const i1 = Math.min(L - 1, i0 + 1);
    const a = t - i0;
    const f0 = frames[i0];
    const f1 = frames[i1];
    out.push(
      f0.map((lm, idx) => [
        lm[0] * (1 - a) + f1[idx][0] * a,
        lm[1] * (1 - a) + f1[idx][1] * a,
        (lm[2] ?? 0) * (1 - a) + (f1[idx][2] ?? 0) * a,
      ])
    );
  }
  return out;
}

/* ---------- Full pipeline ---------- */

/**
 * Convert a raw landmark sequence (variable length) into a fixed-size
 * feature matrix ready for DTW comparison.
 */
export function sequenceToFeatureSeq(seq) {
  return resampleSeq(seq, RESAMPLE_FRAMES).map(f =>
    frameToFeatures(normalizeFrame(f))
  );
}

/* ---------- Dynamic Time Warping ---------- */

/**
 * Compute DTW distance between two feature sequences.
 * Lower = more similar. Normalized by path length.
 */
export function dtwDistance(A, B) {
  const n = A.length;
  const m = B.length;
  if (!n || !m) return Infinity;

  const l2 = (a, b) => {
    let s = 0;
    for (let i = 0; i < a.length; i++) {
      const d = a[i] - b[i];
      s += d * d;
    }
    return Math.sqrt(s);
  };

  // DP table
  const dp = Array.from({ length: n + 1 }, () =>
    new Float64Array(m + 1).fill(Infinity)
  );
  dp[0][0] = 0;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = l2(A[i - 1], B[j - 1]);
      dp[i][j] = cost + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[n][m] / (n + m);
}

/* ---------- Scoring utility ---------- */

/**
 * Convert a raw DTW distance into a 0-100 confidence percentage.
 * Uses a sigmoid-like mapping: small distances -> high confidence.
 */
export function dtwToConfidence(distance) {
  // Empirically tuned: score of 0 -> 100%, score of ~5 -> ~50%, score > 15 -> ~0%
  const k = 0.3;
  return Math.max(0, Math.min(100, 100 * Math.exp(-k * distance)));
}
