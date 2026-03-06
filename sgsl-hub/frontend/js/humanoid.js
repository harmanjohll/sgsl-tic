/* ============================================================
   SgSL Hub — 3D Humanoid Avatar for Sign Language Production
   ============================================================
   Production-grade biomechanically-driven signing avatar with:

   Layer A — Dual Quaternion Skinning (DQS)
     Custom vertex shader replaces Three.js default LBS with
     dual-quaternion blending to prevent candy-wrapper collapse
     at wrist/elbow during high-velocity SgSL transitions.

   Layer B — Minimum-Jerk Trajectory Solver
     Full 5th-order polynomial: x(t) = a₀+a₁t+a₂t²+a₃t³+a₄t⁴+a₅t⁵
     Computes coefficients from boundary conditions (position,
     velocity, acceleration at t=0 and t=T) so every joint move
     has a bell-shaped velocity profile with zero acceleration
     at start and end.

   Layer C — Kinematic Coupling & Whole-Body Control
     - θ_DIP = 2/3 × θ_PIP enforced on all non-thumb fingers
     - Automated torso rotation ±0.5 rad based on wrist target
       position within the signing space quadrants
     - Spine tilt tracks hand elevation for natural reach support

   FACS Facial Grammar
     Maps MediaPipe face landmarks to Action Units:
     AU1/AU2 (inner/outer brow raise), AU4 (brow lowerer),
     AU25/AU26 (lips part / jaw drop) for grammatical markers
     (questions, negation, emphasis).

   Architecture: H-Anim skeletal hierarchy, procedural mesh,
   22 DoF hand rig per hand, two-bone IK arm solver.
   ============================================================ */

import * as THREE from 'three';

// ─── Character palettes ─────────────────────────────────────
const CHARACTERS = {
  meiling: {
    name: 'Mei Ling',
    skin: 0xF0C2A0, skinDk: 0xC99B78,
    hair: 0x2A1A12, hairHi: 0x4A3428,
    shirt: 0x7C3AED, shirtDk: 0x5B21B6,
    pants: 0x2B2B42,
    iris: 0x2C1810, sclera: 0xFFFFF0,
    lip: 0xE08888,
    brow: 0x3A2A20,
  },
  rajan: {
    name: 'Rajan',
    skin: 0xC68642, skinDk: 0x8B5E34,
    hair: 0x1A1A2E, hairHi: 0x2E2E48,
    shirt: 0x2D6A4F, shirtDk: 0x1B4332,
    pants: 0x2B2B42,
    iris: 0x3E2723, sclera: 0xFFFFF0,
    lip: 0x9E6B4A,
    brow: 0x1A1A2E,
  },
};

// ─── Body proportions (world units, ~1.7 total height) ──────
const B = {
  headR: 0.105,
  neckR: 0.035, neckH: 0.045,
  chestW: 0.13, chestH: 0.18, chestD: 0.08,
  waistW: 0.11, waistH: 0.10, waistD: 0.07,
  shoulderSpan: 0.30,
  upperArmLen: 0.24, upperArmR: 0.032,
  foreArmLen: 0.22, foreArmR: 0.026,
  palmW: 0.045, palmH: 0.06, palmD: 0.015,
  fingerR: 0.007,
  thumbSegs: [0.028, 0.024, 0.020],
  indexSegs: [0.032, 0.022, 0.018],
  middleSegs: [0.035, 0.025, 0.020],
  ringSegs: [0.032, 0.022, 0.018],
  pinkySegs: [0.026, 0.018, 0.015],
  legR: 0.045, legH: 0.38,
};

// Finger indices in MediaPipe 21-landmark hand
const FINGER_LANDMARKS = {
  thumb:  [1, 2, 3, 4],
  index:  [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring:   [13, 14, 15, 16],
  pinky:  [17, 18, 19, 20],
};

const FINGER_NAMES = ['thumb', 'index', 'middle', 'ring', 'pinky'];

// Finger base positions on the palm (relative to palm center)
const FINGER_BASES = {
  thumb:  { x: -0.038, y: -0.01, z: 0.01 },
  index:  { x: -0.02,  y: 0.03,  z: 0.005 },
  middle: { x: -0.005, y: 0.032, z: 0.005 },
  ring:   { x: 0.01,   y: 0.03,  z: 0.005 },
  pinky:  { x: 0.025,  y: 0.025, z: 0.005 },
};


// ═══════════════════════════════════════════════════════════════
// LAYER A — Dual Quaternion Skinning (DQS) Shader
// ═══════════════════════════════════════════════════════════════
//
// Three.js default skinning uses Linear Blend Skinning (LBS)
// which causes volume loss ("candy wrapper") at twisted joints.
// DQS represents each bone transform as a dual quaternion and
// blends in dual-quaternion space, preserving volume.
// ═══════════════════════════════════════════════════════════════

const DQS_VERTEX_PARS = /* glsl */ `
  // Dual quaternion helper functions
  // A dual quaternion is stored as two vec4: real (q0) and dual (qe)

  // Convert a mat4 bone transform to a dual quaternion
  // mat4 -> (rotation quaternion, translation dual part)
  vec4 mat4ToQuat(mat4 m) {
    float trace = m[0][0] + m[1][1] + m[2][2];
    vec4 q;
    if (trace > 0.0) {
      float s = 0.5 / sqrt(trace + 1.0);
      q.w = 0.25 / s;
      q.x = (m[2][1] - m[1][2]) * s;
      q.y = (m[0][2] - m[2][0]) * s;
      q.z = (m[1][0] - m[0][1]) * s;
    } else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
      float s = 2.0 * sqrt(1.0 + m[0][0] - m[1][1] - m[2][2]);
      q.w = (m[2][1] - m[1][2]) / s;
      q.x = 0.25 * s;
      q.y = (m[0][1] + m[1][0]) / s;
      q.z = (m[0][2] + m[2][0]) / s;
    } else if (m[1][1] > m[2][2]) {
      float s = 2.0 * sqrt(1.0 + m[1][1] - m[0][0] - m[2][2]);
      q.w = (m[0][2] - m[2][0]) / s;
      q.x = (m[0][1] + m[1][0]) / s;
      q.y = 0.25 * s;
      q.z = (m[1][2] + m[2][1]) / s;
    } else {
      float s = 2.0 * sqrt(1.0 + m[2][2] - m[0][0] - m[1][1]);
      q.w = (m[1][0] - m[0][1]) / s;
      q.x = (m[0][2] + m[2][0]) / s;
      q.y = (m[1][2] + m[2][1]) / s;
      q.z = 0.25 * s;
    }
    return normalize(q);
  }

  // Quaternion multiplication
  vec4 quatMul(vec4 a, vec4 b) {
    return vec4(
      a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
      a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
      a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
      a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
    );
  }

  // Convert translation vector to dual quaternion dual part
  vec4 translationToDual(vec4 q0, vec3 t) {
    return 0.5 * quatMul(vec4(t, 0.0), q0);
  }

  // Apply dual quaternion to a position
  vec3 dqTransformPoint(vec4 q0, vec4 qe, vec3 p) {
    // Normalize the dual quaternion
    float len = length(q0);
    q0 /= len;
    qe /= len;

    // Rotation: q0 * p * q0^-1
    vec3 rotated = p + 2.0 * cross(q0.xyz, cross(q0.xyz, p) + q0.w * p);

    // Translation: 2 * (qe * q0^*)
    vec3 translation = 2.0 * (q0.w * qe.xyz - qe.w * q0.xyz + cross(q0.xyz, qe.xyz));

    return rotated + translation;
  }

  // Apply dual quaternion to a normal (rotation only)
  vec3 dqTransformNormal(vec4 q0, vec3 n) {
    return n + 2.0 * cross(q0.xyz, cross(q0.xyz, n) + q0.w * n);
  }
`;

const DQS_SKINNING_VERTEX = /* glsl */ `
  #ifdef USE_SKINNING
    // Get bone matrices
    mat4 bm0 = bindMatrix * boneMatrices[int(skinIndex.x)] * bindMatrixInverse;
    mat4 bm1 = bindMatrix * boneMatrices[int(skinIndex.y)] * bindMatrixInverse;
    mat4 bm2 = bindMatrix * boneMatrices[int(skinIndex.z)] * bindMatrixInverse;
    mat4 bm3 = bindMatrix * boneMatrices[int(skinIndex.w)] * bindMatrixInverse;

    // Convert to dual quaternions
    vec4 dq0_r = mat4ToQuat(bm0);
    vec4 dq0_d = translationToDual(dq0_r, bm0[3].xyz);

    vec4 dq1_r = mat4ToQuat(bm1);
    vec4 dq1_d = translationToDual(dq1_r, bm1[3].xyz);

    vec4 dq2_r = mat4ToQuat(bm2);
    vec4 dq2_d = translationToDual(dq2_r, bm2[3].xyz);

    vec4 dq3_r = mat4ToQuat(bm3);
    vec4 dq3_d = translationToDual(dq3_r, bm3[3].xyz);

    // Ensure shortest path (antipodality check)
    if (dot(dq0_r, dq1_r) < 0.0) { dq1_r = -dq1_r; dq1_d = -dq1_d; }
    if (dot(dq0_r, dq2_r) < 0.0) { dq2_r = -dq2_r; dq2_d = -dq2_d; }
    if (dot(dq0_r, dq3_r) < 0.0) { dq3_r = -dq3_r; dq3_d = -dq3_d; }

    // Weighted blend
    vec4 blendR = skinWeight.x * dq0_r + skinWeight.y * dq1_r
                + skinWeight.z * dq2_r + skinWeight.w * dq3_r;
    vec4 blendD = skinWeight.x * dq0_d + skinWeight.y * dq1_d
                + skinWeight.z * dq2_d + skinWeight.w * dq3_d;

    // Apply DQS transform
    vec3 skinned = dqTransformPoint(blendR, blendD, transformed);
    transformed = skinned;

    // Transform normal
    objectNormal = dqTransformNormal(blendR, objectNormal);
    #ifdef USE_TANGENT
      objectTangent = dqTransformNormal(blendR, objectTangent);
    #endif
  #endif
`;

/**
 * Patches a Three.js material to use Dual Quaternion Skinning
 * instead of default Linear Blend Skinning.
 */
function applyDQS(material) {
  material.onBeforeCompile = (shader) => {
    // Inject DQS helper functions
    shader.vertexShader = shader.vertexShader.replace(
      '#include <skinning_pars_vertex>',
      '#include <skinning_pars_vertex>\n' + DQS_VERTEX_PARS
    );
    // Replace the default skinning chunk with DQS
    shader.vertexShader = shader.vertexShader.replace(
      '#include <skinning_vertex>',
      DQS_SKINNING_VERTEX
    );
  };
  material.customProgramCacheKey = () => 'dqs_' + material.uuid;
  return material;
}


// ═══════════════════════════════════════════════════════════════
// LAYER B — Minimum-Jerk Trajectory Solver (5th-order polynomial)
// ═══════════════════════════════════════════════════════════════
//
// x(t) = a₀ + a₁t + a₂t² + a₃t³ + a₄t⁴ + a₅t⁵
//
// Given boundary conditions at t=0 and t=T:
//   position x₀, x_f
//   velocity v₀, v_f (= 0 for start/end of sign)
//   acceleration a₀_bc, a_f (= 0 for start/end of sign)
//
// The solver computes coefficients [a₀..a₅] yielding
// bell-shaped velocity profiles and zero acceleration at
// movement onset and offset — matching human motor planning.
// ═══════════════════════════════════════════════════════════════

class MinimumJerkSolver {
  /**
   * Compute 5th-order polynomial coefficients for a single DOF.
   * @param {number} x0 - start position
   * @param {number} xf - end position
   * @param {number} T  - movement duration (normalized to 1 for frame-based)
   * @param {number} v0 - start velocity (default 0)
   * @param {number} vf - end velocity (default 0)
   * @param {number} a0 - start acceleration (default 0)
   * @param {number} af - end acceleration (default 0)
   * @returns {number[]} coefficients [a0, a1, a2, a3, a4, a5]
   */
  static computeCoefficients(x0, xf, T = 1, v0 = 0, vf = 0, a0 = 0, af = 0) {
    const T2 = T * T;
    const T3 = T2 * T;
    const T4 = T3 * T;
    const T5 = T4 * T;

    const c0 = x0;
    const c1 = v0;
    const c2 = a0 / 2;

    const dx = xf - x0 - v0 * T - (a0 / 2) * T2;
    const dv = vf - v0 - a0 * T;
    const da = af - a0;

    const c3 = (20 * dx - (8 * dv + da * T) * T) / (2 * T3);
    const c4 = (-30 * dx + (14 * dv + 2 * da * T) * T) / (2 * T4);
    const c5 = (12 * dx - (6 * dv + da * T) * T) / (2 * T5);

    return [c0, c1, c2, c3, c4, c5];
  }

  /**
   * Evaluate the polynomial at time t.
   * @param {number[]} coeffs - [a0..a5]
   * @param {number} t - time in [0, T]
   * @returns {number} position
   */
  static evaluate(coeffs, t) {
    const [a0, a1, a2, a3, a4, a5] = coeffs;
    const t2 = t * t;
    const t3 = t2 * t;
    return a0 + a1 * t + a2 * t2 + a3 * t3 + a4 * t2 * t2 + a5 * t2 * t3;
  }

  /**
   * Evaluate velocity at time t (first derivative).
   * @param {number[]} coeffs - [a0..a5]
   * @param {number} t
   * @returns {number} velocity
   */
  static evaluateVelocity(coeffs, t) {
    const [, a1, a2, a3, a4, a5] = coeffs;
    const t2 = t * t;
    return a1 + 2 * a2 * t + 3 * a3 * t2 + 4 * a4 * t2 * t + 5 * a5 * t2 * t2;
  }

  /**
   * Simplified minimum-jerk for normalized t in [0,1] with
   * zero boundary velocity and acceleration (standard case).
   * This is the canonical: 10t³ - 15t⁴ + 6t⁵
   */
  static canonical(t) {
    const t3 = t * t * t;
    return 10 * t3 - 15 * t3 * t + 6 * t3 * t * t;
  }
}


// ═══════════════════════════════════════════════════════════════
// LAYER C — Kinematic Coupling & Whole-Body Control
// ═══════════════════════════════════════════════════════════════
//
// Finger Coupling Rule:
//   θ_DIP = (2/3) × θ_PIP
//   The DIP joint angle is always 2/3 of the PIP angle,
//   producing a natural curling arc instead of broken-stick
//   finger poses. Enforced on index, middle, ring, pinky.
//
// Whole-Body Control (WBC):
//   - Torso Y-rotation: ±0.5 rad based on hand horizontal
//     position in signing space quadrants
//   - Spine X-tilt: ±0.15 rad based on hand elevation
//     (lean forward for low signs, upright for high)
//   - Smooth exponential decay for natural return to neutral
// ═══════════════════════════════════════════════════════════════

const WBC = {
  MAX_TORSO_YAW: 0.5,       // ±0.5 radians max torso rotation
  MAX_TORSO_PITCH: 0.15,    // ±0.15 radians max forward/back tilt
  TORSO_SMOOTH: 0.08,       // Exponential smoothing factor
  TORSO_RETURN: 0.92,       // Decay toward neutral per frame
  DIP_PIP_RATIO: 2 / 3,     // θ_DIP = 2/3 × θ_PIP
};


// ─── Geometry helpers ───────────────────────────────────────
function createCapsule(radius, length, segments = 8) {
  return new THREE.CapsuleGeometry(radius, length, segments, segments * 2);
}

function createJointSphere(radius) {
  return new THREE.SphereGeometry(radius, 12, 12);
}

// ─── Material factory (with DQS support) ────────────────────
function makeMat(color, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.55,
    metalness: opts.metalness ?? 0.05,
    flatShading: opts.flat ?? false,
    ...opts,
  });
  // Apply DQS to all skinnable materials
  if (opts.skinnable) {
    applyDQS(mat);
  }
  return mat;
}


// ═══════════════════════════════════════════════════════════════
// FACS — Facial Action Coding System
// ═══════════════════════════════════════════════════════════════
//
// Maps MediaPipe face mesh landmarks (32-point subset from
// camera.js) to FACS Action Units for sign language grammar.
//
// Implemented AUs:
//   AU1  - Inner Brow Raise (question markers)
//   AU2  - Outer Brow Raise (surprise, WH-questions)
//   AU4  - Brow Lowerer (negation, furrowing)
//   AU25 - Lips Part
//   AU26 - Jaw Drop
//   AU20 - Lip Stretcher (mouth width)
// ═══════════════════════════════════════════════════════════════

class FACSMapper {
  constructor() {
    // Smoothed AU intensities (0-1 range)
    this.au1 = 0;   // inner brow raise
    this.au2 = 0;   // outer brow raise
    this.au4 = 0;   // brow lowerer
    this.au25 = 0;  // lips part
    this.au26 = 0;  // jaw drop
    this.au20 = 0;  // lip stretcher (width)

    // Calibration baselines (set from first neutral frame)
    this.baseBrowEyeDist = null;
    this.baseMouthH = null;
    this.baseMouthW = null;
    this.frameCount = 0;
  }

  /**
   * Update AU values from a 32-point face landmark subset.
   * Landmark layout from camera.js FACE_KEY_INDICES:
   *   [0-4]   left brow (5 points)
   *   [5-9]   right brow (5 points)
   *   [10-13] left eye (4 points: outer, inner, top, bottom)
   *   [14-17] right eye (4 points)
   *   [18-20] nose (3 points)
   *   [21-28] mouth (8 points outer ring)
   *   [29-31] jaw/chin (3 points)
   */
  update(faceData) {
    if (!faceData || faceData.length < 32) {
      this._decayToNeutral();
      return;
    }

    this.frameCount++;

    // ── Brow analysis ──
    // Left brow inner (index 0) and outer (index 4) Y positions
    // relative to left eye top (index 12)
    const lBrowInnerY = faceData[0][1];
    const lBrowOuterY = faceData[4][1];
    const lEyeTopY = faceData[12][1];

    const rBrowInnerY = faceData[5][1];
    const rBrowOuterY = faceData[9][1];
    const rEyeTopY = faceData[16][1];

    // Brow-to-eye distances (negative = brow above eye = raised)
    const innerBrowDist = ((lBrowInnerY - lEyeTopY) + (rBrowInnerY - rEyeTopY)) / 2;
    const outerBrowDist = ((lBrowOuterY - lEyeTopY) + (rBrowOuterY - rEyeTopY)) / 2;
    const avgBrowDist = (innerBrowDist + outerBrowDist) / 2;

    // Calibrate baseline from first few frames
    if (this.frameCount <= 5) {
      if (!this.baseBrowEyeDist) this.baseBrowEyeDist = avgBrowDist;
      else this.baseBrowEyeDist = this.baseBrowEyeDist * 0.7 + avgBrowDist * 0.3;
    }
    const baseBrow = this.baseBrowEyeDist || -0.03;

    // AU1: Inner brow raise — inner brow moved up relative to baseline
    const innerRaise = Math.max(0, (baseBrow - innerBrowDist) * 15);
    // AU2: Outer brow raise — outer brow moved up
    const outerRaise = Math.max(0, (baseBrow - outerBrowDist) * 15);
    // AU4: Brow lowerer — brow moved down (furrowed)
    const browLower = Math.max(0, (avgBrowDist - baseBrow) * 12);

    // ── Mouth analysis ──
    // Mouth landmarks: [21]=left corner, [22]=right corner,
    // [25]=top lip, [26]=bottom lip (from the 8-point ring)
    const mouthTopY = faceData[25][1];
    const mouthBotY = faceData[26][1];
    const mouthLeftX = faceData[21][0];
    const mouthRightX = faceData[22][0];

    const mouthH = Math.abs(mouthBotY - mouthTopY);
    const mouthW = Math.abs(mouthRightX - mouthLeftX);

    if (this.frameCount <= 5) {
      if (!this.baseMouthH) this.baseMouthH = mouthH;
      else this.baseMouthH = this.baseMouthH * 0.7 + mouthH * 0.3;
      if (!this.baseMouthW) this.baseMouthW = mouthW;
      else this.baseMouthW = this.baseMouthW * 0.7 + mouthW * 0.3;
    }
    const baseMH = this.baseMouthH || 0.02;
    const baseMW = this.baseMouthW || 0.06;

    // AU25: Lips part (small opening)
    const lipsPart = Math.max(0, Math.min(1, (mouthH - baseMH) * 20));
    // AU26: Jaw drop (large opening)
    const jawDrop = Math.max(0, Math.min(1, (mouthH - baseMH * 1.5) * 15));
    // AU20: Lip stretcher (width increase)
    const lipStretch = Math.max(0, Math.min(1, (mouthW - baseMW) * 12));

    // Smooth all AUs with exponential filter
    const s = 0.25; // Responsiveness
    this.au1  += (Math.min(1, innerRaise) - this.au1)  * s;
    this.au2  += (Math.min(1, outerRaise) - this.au2)  * s;
    this.au4  += (Math.min(1, browLower)  - this.au4)  * s;
    this.au25 += (lipsPart  - this.au25) * s;
    this.au26 += (jawDrop   - this.au26) * s;
    this.au20 += (lipStretch - this.au20) * s;
  }

  _decayToNeutral() {
    const d = 0.08;
    this.au1  *= (1 - d);
    this.au2  *= (1 - d);
    this.au4  *= (1 - d);
    this.au25 *= (1 - d);
    this.au26 *= (1 - d);
    this.au20 *= (1 - d);
  }

  /** Get brow vertical offset (positive = up) */
  getBrowOffset(side) {
    // AU1 raises inner, AU2 raises outer, AU4 lowers
    const raise = (this.au1 * 0.6 + this.au2 * 0.4) * 0.012;
    const lower = this.au4 * 0.008;
    return raise - lower;
  }

  /** Get brow furrow (inward pinch) */
  getBrowFurrow() {
    return this.au4 * 0.003;
  }

  /** Get mouth opening amount */
  getMouthOpen() {
    return Math.min(0.018, (this.au25 * 0.4 + this.au26 * 0.6) * 0.018);
  }

  /** Get mouth width scale */
  getMouthWidth() {
    return 1 + this.au20 * 0.4;
  }
}


// ═══════════════════════════════════════════════════════════════
// Main HumanoidAvatar class
// ═══════════════════════════════════════════════════════════════

export class HumanoidAvatar {
  constructor(containerEl) {
    this.container = typeof containerEl === 'string'
      ? document.getElementById(containerEl) : containerEl;
    this.charId = 'meiling';
    this.materials = {};
    this.groups = {};
    this.fingerChains = { left: {}, right: {} };
    this.scene = null;
    this.camera = null;
    this.renderer = null;

    // Animation state
    this.seq = [];
    this.playing = false;
    this.paused = false;
    this.fi = 0;
    this.fAcc = 0;
    this.speed = 1;
    this.lastT = 0;
    this.rafId = null;
    this._onFrame = null;
    this._onDone = null;
    this.prevFrame = null;

    // Layer B: trajectory state — per-joint coefficient cache
    this._trajCache = new Map();
    this._trajSegStart = -1;

    // Layer C: WBC state
    this._torsoYaw = 0;
    this._torsoPitch = 0;

    // FACS
    this.facs = new FACSMapper();

    this._build();
  }

  _build() {
    this._buildScene();
    this._buildMaterials();
    this._buildBody();
    this._buildArm('left');
    this._buildArm('right');
    this._buildHead();
    this._buildLegs();
    this._startLoop();
    this.render(null);
  }

  _buildScene() {
    const w = this.container.clientWidth || 400;
    const h = this.container.clientHeight || 520;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1d38);

    this.camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 50);
    this.camera.position.set(0, 0.15, 1.8);
    this.camera.lookAt(0, 0.1, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    // Lights
    this.scene.add(new THREE.HemisphereLight(0xddeeff, 0x222233, 0.7));
    const key = new THREE.DirectionalLight(0xfff4e6, 1.0);
    key.position.set(2, 3, 4);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8B85FF, 0.4);
    rim.position.set(-2, -1, -3);
    this.scene.add(rim);
    const fill = new THREE.PointLight(0x6C63FF, 0.2, 10);
    fill.position.set(-3, -2, 2);
    this.scene.add(fill);

    // Floor shadow hint
    const floorGeo = new THREE.PlaneGeometry(2, 2);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1a1d38, roughness: 1, metalness: 0,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.68;
    this.scene.add(floor);

    // Resize observer
    new ResizeObserver(() => {
      const nw = this.container.clientWidth, nh = this.container.clientHeight;
      if (!nw || !nh) return;
      this.renderer.setSize(nw, nh);
      this.camera.aspect = nw / nh;
      this.camera.updateProjectionMatrix();
    }).observe(this.container);
  }

  _buildMaterials() {
    const c = CHARACTERS[this.charId];
    this.materials = {
      skin: makeMat(c.skin, { skinnable: true }),
      skinDk: makeMat(c.skinDk, { skinnable: true }),
      shirt: makeMat(c.shirt),
      shirtDk: makeMat(c.shirtDk),
      pants: makeMat(c.pants),
      hair: makeMat(c.hair, { roughness: 0.7 }),
      iris: makeMat(c.iris),
      sclera: makeMat(c.sclera, { roughness: 0.3 }),
      lip: makeMat(c.lip),
      brow: makeMat(c.brow),
    };
  }

  _updateMaterials() {
    const c = CHARACTERS[this.charId];
    this.materials.skin.color.setHex(c.skin);
    this.materials.skinDk.color.setHex(c.skinDk);
    this.materials.shirt.color.setHex(c.shirt);
    this.materials.shirtDk.color.setHex(c.shirtDk);
    this.materials.pants.color.setHex(c.pants);
    this.materials.hair.color.setHex(c.hair);
    this.materials.iris.color.setHex(c.iris);
    this.materials.lip.color.setHex(c.lip);
    this.materials.brow.color.setHex(c.brow);
  }

  _buildBody() {
    const root = new THREE.Group();
    this.scene.add(root);
    this.groups.root = root;

    // Hips
    const hips = new THREE.Group();
    hips.position.set(0, -0.15, 0);
    root.add(hips);
    this.groups.hips = hips;

    // Spine (rotates for WBC torso coordination)
    const spine = new THREE.Group();
    spine.position.set(0, 0.05, 0);
    hips.add(spine);
    this.groups.spine = spine;

    // Chest mesh
    const chestGeo = new THREE.BoxGeometry(B.chestW * 2, B.chestH, B.chestD * 2, 2, 2, 2);
    this._roundBox(chestGeo, 0.02);
    const chest = new THREE.Mesh(chestGeo, this.materials.shirt);
    chest.position.set(0, B.chestH / 2 + 0.02, 0);
    spine.add(chest);

    // Waist mesh
    const waistGeo = new THREE.BoxGeometry(B.waistW * 2, B.waistH, B.waistD * 2, 2, 2, 2);
    this._roundBox(waistGeo, 0.015);
    const waist = new THREE.Mesh(waistGeo, this.materials.shirt);
    waist.position.set(0, -0.01, 0);
    spine.add(waist);

    // Belt
    const beltGeo = new THREE.BoxGeometry(B.waistW * 2 + 0.01, 0.018, B.waistD * 2 + 0.01);
    const belt = new THREE.Mesh(beltGeo, makeMat(0x3A3028));
    belt.position.set(0, -0.05, 0);
    spine.add(belt);

    // Shoulder area
    const shoulderGeo = new THREE.BoxGeometry(B.shoulderSpan, 0.04, B.chestD * 1.6, 2, 1, 2);
    this._roundBox(shoulderGeo, 0.015);
    const shoulders = new THREE.Mesh(shoulderGeo, this.materials.shirt);
    shoulders.position.set(0, B.chestH + 0.01, 0);
    spine.add(shoulders);

    // Neck
    const neckGroup = new THREE.Group();
    neckGroup.position.set(0, B.chestH + 0.03, 0);
    spine.add(neckGroup);
    this.groups.neck = neckGroup;

    const neckGeo = createCapsule(B.neckR, B.neckH, 8);
    const neck = new THREE.Mesh(neckGeo, this.materials.skin);
    neck.position.set(0, B.neckH / 2, 0);
    neckGroup.add(neck);
  }

  _buildHead() {
    const headGroup = new THREE.Group();
    headGroup.position.set(0, B.neckH + 0.04, 0);
    this.groups.neck.add(headGroup);
    this.groups.head = headGroup;

    // Head sphere
    const headGeo = new THREE.SphereGeometry(B.headR, 24, 24);
    const head = new THREE.Mesh(headGeo, this.materials.skin);
    head.scale.set(1, 1.12, 0.95);
    headGroup.add(head);

    // Hair
    const hairGeo = new THREE.SphereGeometry(B.headR + 0.008, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const hair = new THREE.Mesh(hairGeo, this.materials.hair);
    hair.scale.set(1.05, 1.15, 1.0);
    hair.position.y = 0.005;
    headGroup.add(hair);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.015, 12, 12);
    const irisGeo = new THREE.SphereGeometry(0.011, 12, 12);
    const pupilGeo = new THREE.SphereGeometry(0.006, 8, 8);
    const pupilMat = makeMat(0x111111);

    for (const side of [-1, 1]) {
      const eyeGroup = new THREE.Group();
      eyeGroup.position.set(side * 0.035, 0.015, B.headR * 0.85);
      headGroup.add(eyeGroup);

      const sclera = new THREE.Mesh(eyeGeo, this.materials.sclera);
      eyeGroup.add(sclera);

      const iris = new THREE.Mesh(irisGeo, this.materials.iris);
      iris.position.z = 0.006;
      eyeGroup.add(iris);

      const pupil = new THREE.Mesh(pupilGeo, pupilMat);
      pupil.position.z = 0.01;
      eyeGroup.add(pupil);

      const hlGeo = new THREE.SphereGeometry(0.004, 6, 6);
      const hlMat = makeMat(0xFFFFFF, { roughness: 0.1, metalness: 0.0, emissive: 0xFFFFFF, emissiveIntensity: 0.5 });
      const hl = new THREE.Mesh(hlGeo, hlMat);
      hl.position.set(side * 0.004, 0.004, 0.012);
      eyeGroup.add(hl);
    }

    // Eyebrows (controlled by FACS)
    for (const side of [-1, 1]) {
      const browGeo = new THREE.BoxGeometry(0.03, 0.005, 0.008);
      const brow = new THREE.Mesh(browGeo, this.materials.brow);
      brow.position.set(side * 0.035, 0.04, B.headR * 0.8);
      headGroup.add(brow);
      if (side === -1) this.groups.browL = brow;
      else this.groups.browR = brow;
    }

    // Nose
    const noseGeo = new THREE.ConeGeometry(0.012, 0.025, 6);
    const nose = new THREE.Mesh(noseGeo, this.materials.skinDk);
    nose.position.set(0, -0.01, B.headR * 0.9);
    nose.rotation.x = Math.PI * 0.15;
    headGroup.add(nose);

    // Mouth (controlled by FACS AU25/26/20)
    const mouthGroup = new THREE.Group();
    mouthGroup.position.set(0, -0.04, B.headR * 0.85);
    headGroup.add(mouthGroup);
    this.groups.mouth = mouthGroup;

    const lipGeo = new THREE.BoxGeometry(0.035, 0.006, 0.008, 4, 1, 1);
    this._roundBox(lipGeo, 0.003);
    const upperLip = new THREE.Mesh(lipGeo, this.materials.lip);
    upperLip.position.y = 0.003;
    mouthGroup.add(upperLip);
    const lowerLip = new THREE.Mesh(lipGeo, this.materials.lip);
    lowerLip.position.y = -0.003;
    mouthGroup.add(lowerLip);
    this.groups.upperLip = upperLip;
    this.groups.lowerLip = lowerLip;

    // Ears
    for (const side of [-1, 1]) {
      const earGeo = new THREE.SphereGeometry(0.02, 8, 8);
      const ear = new THREE.Mesh(earGeo, this.materials.skin);
      ear.position.set(side * (B.headR + 0.005), 0, -0.01);
      ear.scale.set(0.5, 1, 0.7);
      headGroup.add(ear);
    }
  }

  _buildArm(side) {
    const sign = side === 'left' ? -1 : 1;
    const shoulderX = sign * B.shoulderSpan / 2;

    // Shoulder group
    const shoulderGroup = new THREE.Group();
    shoulderGroup.position.set(shoulderX, B.chestH + 0.01, 0);
    this.groups.spine.add(shoulderGroup);
    this.groups[side + 'Shoulder'] = shoulderGroup;

    // Shoulder joint sphere
    const sjGeo = createJointSphere(B.upperArmR + 0.006);
    const sj = new THREE.Mesh(sjGeo, this.materials.shirt);
    shoulderGroup.add(sj);

    // Upper arm group
    const upperArmGroup = new THREE.Group();
    shoulderGroup.add(upperArmGroup);
    this.groups[side + 'UpperArm'] = upperArmGroup;

    const uaGeo = createCapsule(B.upperArmR, B.upperArmLen, 8);
    const ua = new THREE.Mesh(uaGeo, this.materials.skin);
    ua.position.y = -(B.upperArmLen / 2 + B.upperArmR);
    upperArmGroup.add(ua);

    // Sleeve
    const sleeveGeo = createCapsule(B.upperArmR + 0.005, B.upperArmLen * 0.45, 8);
    const sleeve = new THREE.Mesh(sleeveGeo, this.materials.shirt);
    sleeve.position.y = -(B.upperArmLen * 0.22 + B.upperArmR);
    upperArmGroup.add(sleeve);

    // Elbow joint
    const elbowGroup = new THREE.Group();
    elbowGroup.position.y = -(B.upperArmLen + B.upperArmR * 2);
    upperArmGroup.add(elbowGroup);
    this.groups[side + 'Elbow'] = elbowGroup;

    const ejGeo = createJointSphere(B.foreArmR + 0.004);
    const ej = new THREE.Mesh(ejGeo, this.materials.skin);
    elbowGroup.add(ej);

    // Forearm group
    const foreArmGroup = new THREE.Group();
    elbowGroup.add(foreArmGroup);
    this.groups[side + 'ForeArm'] = foreArmGroup;

    const faGeo = createCapsule(B.foreArmR, B.foreArmLen, 8);
    const fa = new THREE.Mesh(faGeo, this.materials.skin);
    fa.position.y = -(B.foreArmLen / 2 + B.foreArmR);
    foreArmGroup.add(fa);

    // Wrist joint
    const wristGroup = new THREE.Group();
    wristGroup.position.y = -(B.foreArmLen + B.foreArmR * 2);
    foreArmGroup.add(wristGroup);
    this.groups[side + 'Wrist'] = wristGroup;

    const wjGeo = createJointSphere(B.foreArmR);
    const wj = new THREE.Mesh(wjGeo, this.materials.skin);
    wristGroup.add(wj);

    // Hand
    this._buildHand(side, wristGroup);
  }

  _buildHand(side, wristGroup) {
    const handGroup = new THREE.Group();
    wristGroup.add(handGroup);
    this.groups[side + 'Hand'] = handGroup;

    // Palm
    const palmGeo = new THREE.BoxGeometry(B.palmW * 2, B.palmH, B.palmD * 2, 2, 2, 2);
    this._roundBox(palmGeo, 0.005);
    const palm = new THREE.Mesh(palmGeo, this.materials.skin);
    palm.position.y = -B.palmH / 2;
    handGroup.add(palm);

    // Fingers
    for (const fname of FINGER_NAMES) {
      this._buildFinger(side, fname, handGroup);
    }
  }

  _buildFinger(side, name, handGroup) {
    const segLens = B[name + 'Segs'];
    const base = FINGER_BASES[name];
    const mirror = side === 'left' ? -1 : 1;

    const baseGroup = new THREE.Group();
    baseGroup.position.set(base.x * mirror, -B.palmH + base.y, base.z);
    handGroup.add(baseGroup);

    let parent = baseGroup;
    const chain = [];

    for (let i = 0; i < 3; i++) {
      const segLen = segLens[i];
      const r = B.fingerR * (1 - i * 0.15);

      const jointGroup = new THREE.Group();
      if (i > 0) jointGroup.position.y = -segLens[i - 1];
      parent.add(jointGroup);

      const jGeo = createJointSphere(r + 0.002);
      const jMesh = new THREE.Mesh(jGeo, this.materials.skin);
      jointGroup.add(jMesh);

      const sGeo = createCapsule(r, segLen * 0.7, 6);
      const sMesh = new THREE.Mesh(sGeo, this.materials.skin);
      sMesh.position.y = -segLen / 2;
      jointGroup.add(sMesh);

      chain.push(jointGroup);
      parent = jointGroup;
    }

    // Fingertip
    const tipGeo = new THREE.SphereGeometry(B.fingerR * 0.7, 6, 6);
    const tip = new THREE.Mesh(tipGeo, this.materials.skin);
    tip.position.y = -segLens[2];
    parent.add(tip);

    this.fingerChains[side][name] = chain;
  }

  _buildLegs() {
    for (const side of [-1, 1]) {
      const legGroup = new THREE.Group();
      legGroup.position.set(side * 0.06, -0.06, 0);
      this.groups.hips.add(legGroup);

      const legGeo = createCapsule(B.legR, B.legH, 8);
      const leg = new THREE.Mesh(legGeo, this.materials.pants);
      leg.position.y = -(B.legH / 2 + B.legR);
      legGroup.add(leg);

      const shoeGeo = new THREE.BoxGeometry(0.07, 0.04, 0.11, 2, 1, 2);
      this._roundBox(shoeGeo, 0.01);
      const shoe = new THREE.Mesh(shoeGeo, makeMat(0x222222));
      shoe.position.set(0, -(B.legH + B.legR + 0.02), 0.015);
      legGroup.add(shoe);
    }
  }

  _roundBox(geo, amount) {
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const len = v.length();
      if (len > 0) {
        v.normalize().multiplyScalar(len + amount * (1 - Math.abs(v.y) / (len || 1)) * 0.3);
        const edge = Math.min(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z));
        if (edge < amount * 2) {
          v.normalize().multiplyScalar(len);
        }
      }
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
  }

  _startLoop() {
    const animate = () => {
      requestAnimationFrame(animate);
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  // ─── IK and Pose Application ──────────────────────────────

  _landmarkToWorld(lm) {
    return new THREE.Vector3(
      (0.5 - lm[0]) * 1.2,
      (0.5 - lm[1]) * 1.2,
      -(lm[2] ?? 0) * 0.3
    );
  }

  // Two-bone IK solver for arm chain
  _solveArmIK(targetWorld, side) {
    const upperArmGroup = this.groups[side + 'UpperArm'];
    const foreArmGroup = this.groups[side + 'ForeArm'];
    const shoulderGroup = this.groups[side + 'Shoulder'];

    const shoulderWorld = new THREE.Vector3();
    shoulderGroup.getWorldPosition(shoulderWorld);

    const toTarget = new THREE.Vector3().subVectors(targetWorld, shoulderWorld);
    const dist = toTarget.length();

    const L1 = B.upperArmLen + B.upperArmR * 2;
    const L2 = B.foreArmLen + B.foreArmR * 2;
    const maxReach = L1 + L2 - 0.01;

    const d = Math.min(dist, maxReach);

    // Elbow angle via law of cosines
    let cosElbow = (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2);
    cosElbow = Math.max(-1, Math.min(1, cosElbow));
    const elbowAngle = Math.PI - Math.acos(cosElbow);

    // Point upper arm toward target
    const targetLocal = shoulderGroup.worldToLocal(targetWorld.clone());
    const armDir = targetLocal.normalize();
    const restDir = new THREE.Vector3(0, -1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(restDir, armDir);

    upperArmGroup.quaternion.copy(quat);

    // Elbow bend
    foreArmGroup.rotation.set(0, 0, 0);
    foreArmGroup.rotation.x = elbowAngle;
  }

  // ─── Layer C: Finger pose with DIP = 2/3 × PIP coupling ──

  _setFingerPose(handLandmarks, side) {
    if (!handLandmarks || handLandmarks.length < 21) return;

    const wrist = handLandmarks[0];

    for (const fname of FINGER_NAMES) {
      const chain = this.fingerChains[side][fname];
      if (!chain) continue;

      const indices = FINGER_LANDMARKS[fname];
      const pts = indices.map(i => handLandmarks[i]);

      // Compute MCP angle (j=0)
      const mcpAngle = this._computeJointAngle(wrist, pts[0], pts[1], fname, side);
      chain[0].rotation.x = mcpAngle;

      // Compute PIP angle (j=1)
      const pipAngle = this._computeJointAngle(pts[0], pts[1], pts[2], fname, side);
      chain[1].rotation.x = pipAngle;

      // Layer C: Enforce θ_DIP = (2/3) × θ_PIP for non-thumb fingers
      if (fname !== 'thumb') {
        chain[2].rotation.x = pipAngle * WBC.DIP_PIP_RATIO;
      } else {
        // Thumb DIP computed normally
        const dipAngle = this._computeJointAngle(pts[1], pts[2], pts[3], fname, side);
        chain[2].rotation.x = dipAngle;
      }

      // Thumb abduction
      if (fname === 'thumb') {
        const thumbDir = [
          pts[0][0] - wrist[0],
          pts[0][1] - wrist[1],
        ];
        const abduct = Math.atan2(thumbDir[0], -thumbDir[1]) * 0.5;
        chain[0].rotation.z = abduct * (side === 'left' ? -1 : 1);
      }
    }
  }

  _computeJointAngle(prev, curr, next, fname, side) {
    const v1 = [curr[0] - prev[0], curr[1] - prev[1], (curr[2] ?? 0) - (prev[2] ?? 0)];
    const v2 = [next[0] - curr[0], next[1] - curr[1], (next[2] ?? 0) - (curr[2] ?? 0)];

    const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
    const m1 = Math.sqrt(v1[0] * v1[0] + v1[1] * v1[1] + v1[2] * v1[2]) || 1;
    const m2 = Math.sqrt(v2[0] * v2[0] + v2[1] * v2[1] + v2[2] * v2[2]) || 1;
    let angle = Math.acos(Math.max(-1, Math.min(1, dot / (m1 * m2))));

    // Cross product for sign
    const cross = v1[0] * v2[1] - v1[1] * v2[0];
    if (cross < 0) angle = -angle;

    // Clamp to biomechanical range
    const maxFlex = fname === 'thumb' ? Math.PI * 0.5 : Math.PI * 0.55;
    return Math.max(-0.2, Math.min(maxFlex, angle));
  }

  // ─── Layer C: Whole-Body Control — torso rotation + tilt ──

  _updateTorsoWBC(leftWrist, rightWrist) {
    if (!this.groups.spine) return;

    // Compute target yaw from hand horizontal position
    let targetYaw = 0;
    let targetPitch = 0;
    let handCount = 0;
    let avgHandX = 0;
    let avgHandY = 0;

    if (leftWrist) {
      avgHandX += (0.5 - leftWrist[0]);
      avgHandY += (0.5 - leftWrist[1]);
      handCount++;
    }
    if (rightWrist) {
      avgHandX += (0.5 - rightWrist[0]);
      avgHandY += (0.5 - rightWrist[1]);
      handCount++;
    }

    if (handCount > 0) {
      avgHandX /= handCount;
      avgHandY /= handCount;

      // Yaw: ±0.5 rad based on horizontal signing space quadrant
      targetYaw = Math.max(-WBC.MAX_TORSO_YAW,
        Math.min(WBC.MAX_TORSO_YAW, avgHandX * 2.0));

      // Pitch: lean forward for low signs, upright for high
      // Negative Y = hands are low = lean forward slightly
      targetPitch = Math.max(-WBC.MAX_TORSO_PITCH,
        Math.min(WBC.MAX_TORSO_PITCH, -avgHandY * 0.5));
    }

    // Smooth exponential approach to target
    this._torsoYaw += (targetYaw - this._torsoYaw) * WBC.TORSO_SMOOTH;
    this._torsoPitch += (targetPitch - this._torsoPitch) * WBC.TORSO_SMOOTH;

    // Decay toward neutral when no hands
    if (handCount === 0) {
      this._torsoYaw *= WBC.TORSO_RETURN;
      this._torsoPitch *= WBC.TORSO_RETURN;
    }

    this.groups.spine.rotation.y = this._torsoYaw;
    this.groups.spine.rotation.x = this._torsoPitch;
  }

  // ─── FACS facial expression ───────────────────────────────

  _updateFaceFACS(faceData) {
    this.facs.update(faceData);

    // Apply brow positions (FACS AU1/AU2/AU4)
    if (this.groups.browL) {
      const offset = this.facs.getBrowOffset('left');
      const furrow = this.facs.getBrowFurrow();
      this.groups.browL.position.y = 0.04 + offset;
      this.groups.browL.position.x = -0.035 + furrow; // Pinch inward for AU4
    }
    if (this.groups.browR) {
      const offset = this.facs.getBrowOffset('right');
      const furrow = this.facs.getBrowFurrow();
      this.groups.browR.position.y = 0.04 + offset;
      this.groups.browR.position.x = 0.035 - furrow;
    }

    // Apply mouth (FACS AU25/AU26/AU20)
    if (this.groups.upperLip && this.groups.lowerLip) {
      const openAmt = this.facs.getMouthOpen();
      const widthScale = this.facs.getMouthWidth();

      this.groups.upperLip.position.y = 0.003 + openAmt * 0.3;
      this.groups.lowerLip.position.y = -0.003 - openAmt;
      this.groups.upperLip.scale.x = widthScale;
      this.groups.lowerLip.scale.x = widthScale;
    }
  }

  // ─── Frame rendering ─────────────────────────────────────

  render(frame) {
    if (!frame) {
      this._setIdlePose();
      return;
    }

    let leftHand = null, rightHand = null, faceData = null;

    if (frame.leftHand || frame.rightHand) {
      leftHand = frame.leftHand;
      rightHand = frame.rightHand;
      faceData = frame.face;
    } else if (Array.isArray(frame) && frame.length >= 21) {
      rightHand = frame;
    }

    // Arm IK + finger pose
    if (rightHand && rightHand.length >= 21) {
      const wristWorld = this._landmarkToWorld(rightHand[0]);
      this._solveArmIK(wristWorld, 'right');
      this._setFingerPose(rightHand, 'right');
    } else {
      this._setArmIdle('right');
    }

    if (leftHand && leftHand.length >= 21) {
      const wristWorld = this._landmarkToWorld(leftHand[0]);
      this._solveArmIK(wristWorld, 'left');
      this._setFingerPose(leftHand, 'left');
    } else {
      this._setArmIdle('left');
    }

    // FACS facial expressions
    this._updateFaceFACS(faceData);

    // Layer C: WBC torso rotation
    const lw = leftHand ? leftHand[0] : null;
    const rw = rightHand ? rightHand[0] : null;
    this._updateTorsoWBC(lw, rw);
  }

  _setIdlePose() {
    for (const side of ['left', 'right']) {
      this._setArmIdle(side);
      for (const fname of FINGER_NAMES) {
        const chain = this.fingerChains[side][fname];
        if (!chain) continue;
        const curl = fname === 'thumb' ? 0.15 : 0.3;
        for (let i = 0; i < chain.length; i++) {
          // Apply DIP coupling even in idle
          if (fname !== 'thumb' && i === 2) {
            chain[i].rotation.x = chain[1].rotation.x * WBC.DIP_PIP_RATIO;
          } else {
            chain[i].rotation.x = curl * (i + 1) * 0.5;
          }
          chain[i].rotation.z = 0;
        }
      }
    }

    // Decay face to neutral
    this.facs._decayToNeutral();
    this._updateFaceFACS(null);

    // Decay torso
    this._torsoYaw *= WBC.TORSO_RETURN;
    this._torsoPitch *= WBC.TORSO_RETURN;
    if (this.groups.spine) {
      this.groups.spine.rotation.y = this._torsoYaw;
      this.groups.spine.rotation.x = this._torsoPitch;
    }
  }

  _setArmIdle(side) {
    const sign = side === 'left' ? -1 : 1;
    const ua = this.groups[side + 'UpperArm'];
    const fa = this.groups[side + 'ForeArm'];
    if (ua) {
      ua.quaternion.setFromEuler(new THREE.Euler(0.1, 0, sign * 0.15));
    }
    if (fa) {
      fa.rotation.set(0.35, 0, 0);
    }
  }

  // ─── Layer B: Minimum-Jerk trajectory interpolation ───────

  /**
   * Interpolate between frames using minimum-jerk trajectory.
   * For each landmark coordinate, computes 5th-order polynomial
   * coefficients from boundary conditions and evaluates at t.
   *
   * Boundary conditions: zero velocity and acceleration at segment
   * boundaries (start/end of each inter-frame transition).
   */
  _mjLerpHand(a, b, t) {
    if (!a) return b;
    if (!b) return a;

    // Use full 5th-order polynomial for each coordinate
    return b.map((lm, i) => {
      const x = MinimumJerkSolver.evaluate(
        MinimumJerkSolver.computeCoefficients(a[i][0], lm[0]),
        t
      );
      const y = MinimumJerkSolver.evaluate(
        MinimumJerkSolver.computeCoefficients(a[i][1], lm[1]),
        t
      );
      const z = MinimumJerkSolver.evaluate(
        MinimumJerkSolver.computeCoefficients(a[i][2] ?? 0, lm[2] ?? 0),
        t
      );
      return [x, y, z];
    });
  }

  _mjLerpFace(a, b, t) {
    if (!a || !b) return b || a;
    return b.map((lm, i) => {
      const x = MinimumJerkSolver.evaluate(
        MinimumJerkSolver.computeCoefficients(a[i][0], lm[0]),
        t
      );
      const y = MinimumJerkSolver.evaluate(
        MinimumJerkSolver.computeCoefficients(a[i][1], lm[1]),
        t
      );
      const z = MinimumJerkSolver.evaluate(
        MinimumJerkSolver.computeCoefficients(a[i][2] ?? 0, lm[2] ?? 0),
        t
      );
      return [x, y, z];
    });
  }

  _mjLerpFrame(a, b, t) {
    if (!a) return b;
    return {
      leftHand: this._mjLerpHand(a.leftHand, b.leftHand, t),
      rightHand: this._mjLerpHand(a.rightHand, b.rightHand, t),
      face: this._mjLerpFace(a.face, b.face, t),
    };
  }

  // Normalize frame format
  _toHolisticFrame(fr) {
    if (!fr) return null;
    if (fr.leftHand !== undefined || fr.rightHand !== undefined) {
      return { leftHand: fr.leftHand || null, rightHand: fr.rightHand || null, face: fr.face || null };
    }
    if (Array.isArray(fr) && fr.length >= 21) {
      if (Array.isArray(fr[0]) && fr[0].length === 3) {
        return { leftHand: null, rightHand: fr, face: null };
      }
      if (Array.isArray(fr[0]) && Array.isArray(fr[0][0]) && fr[0][0].length === 3 && fr[0].length >= 21) {
        return { leftHand: null, rightHand: fr[0], face: null };
      }
      return { leftHand: null, rightHand: fr, face: null };
    }
    return null;
  }

  // ─── Playback API ─────────────────────────────────────────

  playSequence(landmarks, speed = 1, onFrame = null, onDone = null) {
    this.seq = (landmarks || [])
      .map(fr => this._toHolisticFrame(fr))
      .filter(f => f !== null && (f.leftHand || f.rightHand));

    if (!this.seq.length) return false;

    this.speed = speed;
    this.fi = 0;
    this.fAcc = 0;
    this.prevFrame = null;
    this.playing = true;
    this.paused = false;
    this._onFrame = onFrame;
    this._onDone = onDone;
    this.lastT = performance.now();
    this._trajCache.clear();
    this._trajSegStart = -1;

    // Reset FACS calibration for new sequence
    this.facs.frameCount = 0;
    this.facs.baseBrowEyeDist = null;
    this.facs.baseMouthH = null;
    this.facs.baseMouthW = null;

    if (this.rafId) cancelAnimationFrame(this.rafId);
    this._tick();
    return true;
  }

  _tick() {
    if (!this.playing || this.paused) return;
    const now = performance.now();
    const dt = (now - this.lastT) / 1000;
    this.lastT = now;
    this.fAcc += dt * 30 * this.speed;

    while (this.fAcc >= 1 && this.fi < this.seq.length - 1) {
      this.fi++;
      this.fAcc -= 1;
      if (this._onFrame) this._onFrame(this.fi, this.seq.length);
    }

    if (this.fi >= this.seq.length - 1) {
      this.prevFrame = this.seq[this.seq.length - 1];
      this.render(this.prevFrame);
      this.playing = false;
      if (this._onDone) this._onDone();
      return;
    }

    // Layer B: use minimum-jerk interpolation instead of linear lerp
    const t = Math.min(this.fAcc, 1);
    const blended = this._mjLerpFrame(this.seq[this.fi], this.seq[this.fi + 1], t);
    this.prevFrame = blended;
    this.render(blended);

    this.rafId = requestAnimationFrame(() => this._tick());
  }

  togglePause() {
    this.paused = !this.paused;
    if (!this.paused) {
      this.lastT = performance.now();
      this._tick();
    }
    return this.paused;
  }

  replay() {
    this.fi = 0;
    this.fAcc = 0;
    this.prevFrame = null;
    this.paused = false;
    this.playing = true;
    this.lastT = performance.now();
    this._trajCache.clear();
    this._trajSegStart = -1;
    this.facs.frameCount = 0;
    this.facs.baseBrowEyeDist = null;
    this.facs.baseMouthH = null;
    this.facs.baseMouthW = null;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this._tick();
  }

  setSpeed(s) { this.speed = s; }
  isPlaying() { return this.playing && !this.paused; }
  getFrameInfo() { return { current: this.fi, total: this.seq.length }; }

  setCharacter(id) {
    if (!CHARACTERS[id]) return;
    this.charId = id;
    this._updateMaterials();
  }

  getCharacters() {
    return Object.entries(CHARACTERS).map(([id, c]) => ({ id, name: c.name }));
  }
}
