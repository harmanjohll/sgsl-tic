/* ============================================================
   SgSL Hub — Stylized 3D Signing Avatar
   ============================================================
   Toon-shaded humanoid with cel outlines, large expressive
   features, and biomechanically-driven animation.

   Visual Style: Stylized/chibi — large head, expressive eyes,
   visible hands. Toon shading with 3-step gradient + ink outlines.

   Biomechanical Layers (preserved):
     A — Dual Quaternion Skinning vertex shader
     B — 5th-order minimum-jerk trajectory solver
     C — θ_DIP = 2/3 × θ_PIP coupling, ±0.5 rad WBC torso
     FACS — AU1/2/4/25/26/20 facial grammar
   ============================================================ */

import * as THREE from 'three';

// ─── Character palettes ─────────────────────────────────────
const CHARACTERS = {
  meiling: {
    name: 'Mei Ling',
    skin: 0xF5CCA0, skinDk: 0xD4A87A, skinLt: 0xFFE0C2,
    hair: 0x1A0E08, hairHi: 0x3D2818,
    shirt: 0x7C3AED, shirtLt: 0x9F5FFF,
    pants: 0x2D2D4A, pantsLt: 0x3F3F60,
    shoe: 0x1A1A2E,
    iris: 0x4A2820, irisRing: 0x7A4838, sclera: 0xFFFFF5,
    lip: 0xE88888, lipDk: 0xC06868,
    brow: 0x2A1810,
    outline: 0x1A0A05,
    blush: 0xFFA0A0,
  },
  rajan: {
    name: 'Rajan',
    skin: 0xC68642, skinDk: 0x9E6830, skinLt: 0xDCA060,
    hair: 0x0E0E1E, hairHi: 0x22223A,
    shirt: 0x2D8A5F, shirtLt: 0x40B080,
    pants: 0x2D2D4A, pantsLt: 0x3F3F60,
    shoe: 0x1A1A2E,
    iris: 0x2E1A10, irisRing: 0x4A3020, sclera: 0xFFFFF5,
    lip: 0xA06848, lipDk: 0x805030,
    brow: 0x0E0E1E,
    outline: 0x0A0A0A,
    blush: 0xD08060,
  },
};

// ─── Proportions (stylized — larger head & hands) ───────────
const P = {
  // Head (large for expressiveness)
  headR: 0.18,
  headSquash: 0.92,   // slightly wide
  headStretch: 1.08,  // slightly tall

  // Neck
  neckR: 0.05, neckH: 0.06,

  // Torso
  chestW: 0.22, chestH: 0.22, chestD: 0.14,
  waistW: 0.18, waistH: 0.08, waistD: 0.12,

  // Shoulders
  shoulderSpan: 0.44,
  shoulderR: 0.055,

  // Arms
  upperArmLen: 0.22, upperArmR: 0.042,
  foreArmLen: 0.20,   foreArmR: 0.035,

  // Hands (large for sign language visibility)
  palmW: 0.065, palmH: 0.08, palmD: 0.025,
  fingerR: 0.012,
  thumbSegs:  [0.038, 0.032, 0.026],
  indexSegs:  [0.042, 0.030, 0.024],
  middleSegs: [0.046, 0.034, 0.026],
  ringSegs:   [0.042, 0.030, 0.024],
  pinkySegs:  [0.034, 0.024, 0.020],

  // Legs
  upperLegR: 0.06, upperLegH: 0.22,
  lowerLegR: 0.05, lowerLegH: 0.20,
  shoeW: 0.09, shoeH: 0.05, shoeD: 0.14,
};

const FINGER_LANDMARKS = {
  thumb:  [1, 2, 3, 4],
  index:  [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring:   [13, 14, 15, 16],
  pinky:  [17, 18, 19, 20],
};
const FINGER_NAMES = ['thumb', 'index', 'middle', 'ring', 'pinky'];

const FINGER_BASES = {
  thumb:  { x: -0.052, y: -0.01, z: 0.015 },
  index:  { x: -0.028, y: 0.04,  z: 0.008 },
  middle: { x: -0.007, y: 0.044, z: 0.008 },
  ring:   { x: 0.014,  y: 0.04,  z: 0.008 },
  pinky:  { x: 0.035,  y: 0.034, z: 0.008 },
};


// ═══════════════════════════════════════════════════════════════
// Toon Rendering System
// ═══════════════════════════════════════════════════════════════

let _toonGradient = null;

function getToonGradient() {
  if (_toonGradient) return _toonGradient;
  // 4-step toon gradient: shadow → mid-shadow → lit → highlight
  const data = new Uint8Array([
    80, 80, 80, 255,     // deep shadow
    160, 160, 160, 255,  // mid
    220, 220, 220, 255,  // lit
    255, 255, 255, 255,  // highlight
  ]);
  _toonGradient = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  _toonGradient.minFilter = THREE.NearestFilter;
  _toonGradient.magFilter = THREE.NearestFilter;
  _toonGradient.needsUpdate = true;
  return _toonGradient;
}

function toonMat(color, opts = {}) {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: getToonGradient(),
    side: opts.side ?? THREE.FrontSide,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    ...opts,
  });
}

/** Ink outline via inverted-hull method */
function addOutline(parent, geometry, thickness, outlineColor) {
  const mat = new THREE.MeshBasicMaterial({
    color: outlineColor,
    side: THREE.BackSide,
  });
  const outline = new THREE.Mesh(geometry, mat);
  outline.scale.multiplyScalar(1 + thickness);
  parent.add(outline);
  return outline;
}


// ═══════════════════════════════════════════════════════════════
// Layer A — DQS Shader (Dual Quaternion Skinning)
// ═══════════════════════════════════════════════════════════════

const DQS_PARS = /* glsl */ `
  vec4 mat4ToQuat(mat4 m) {
    float tr = m[0][0] + m[1][1] + m[2][2];
    vec4 q;
    if (tr > 0.0) {
      float s = 0.5 / sqrt(tr + 1.0);
      q = vec4((m[2][1]-m[1][2])*s, (m[0][2]-m[2][0])*s, (m[1][0]-m[0][1])*s, 0.25/s);
    } else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
      float s = 2.0*sqrt(1.0+m[0][0]-m[1][1]-m[2][2]);
      q = vec4(0.25*s, (m[0][1]+m[1][0])/s, (m[0][2]+m[2][0])/s, (m[2][1]-m[1][2])/s);
    } else if (m[1][1] > m[2][2]) {
      float s = 2.0*sqrt(1.0+m[1][1]-m[0][0]-m[2][2]);
      q = vec4((m[0][1]+m[1][0])/s, 0.25*s, (m[1][2]+m[2][1])/s, (m[0][2]-m[2][0])/s);
    } else {
      float s = 2.0*sqrt(1.0+m[2][2]-m[0][0]-m[1][1]);
      q = vec4((m[0][2]+m[2][0])/s, (m[1][2]+m[2][1])/s, 0.25*s, (m[1][0]-m[0][1])/s);
    }
    return normalize(q);
  }
  vec4 qMul(vec4 a, vec4 b) {
    return vec4(a.w*b.xyz + b.w*a.xyz + cross(a.xyz, b.xyz), a.w*b.w - dot(a.xyz, b.xyz));
  }
  vec4 tToDual(vec4 q, vec3 t) { return 0.5 * qMul(vec4(t, 0.0), q); }
  vec3 dqPoint(vec4 r, vec4 d, vec3 p) {
    float ln = length(r); r /= ln; d /= ln;
    return p + 2.0*cross(r.xyz, cross(r.xyz, p) + r.w*p)
         + 2.0*(r.w*d.xyz - d.w*r.xyz + cross(r.xyz, d.xyz));
  }
  vec3 dqNorm(vec4 r, vec3 n) {
    return n + 2.0*cross(r.xyz, cross(r.xyz, n) + r.w*n);
  }
`;

const DQS_SKIN = /* glsl */ `
  #ifdef USE_SKINNING
    mat4 bm0=bindMatrix*boneMatrices[int(skinIndex.x)]*bindMatrixInverse;
    mat4 bm1=bindMatrix*boneMatrices[int(skinIndex.y)]*bindMatrixInverse;
    mat4 bm2=bindMatrix*boneMatrices[int(skinIndex.z)]*bindMatrixInverse;
    mat4 bm3=bindMatrix*boneMatrices[int(skinIndex.w)]*bindMatrixInverse;
    vec4 r0=mat4ToQuat(bm0), d0=tToDual(r0,bm0[3].xyz);
    vec4 r1=mat4ToQuat(bm1), d1=tToDual(r1,bm1[3].xyz);
    vec4 r2=mat4ToQuat(bm2), d2=tToDual(r2,bm2[3].xyz);
    vec4 r3=mat4ToQuat(bm3), d3=tToDual(r3,bm3[3].xyz);
    if(dot(r0,r1)<0.0){r1=-r1;d1=-d1;}
    if(dot(r0,r2)<0.0){r2=-r2;d2=-d2;}
    if(dot(r0,r3)<0.0){r3=-r3;d3=-d3;}
    vec4 bR=skinWeight.x*r0+skinWeight.y*r1+skinWeight.z*r2+skinWeight.w*r3;
    vec4 bD=skinWeight.x*d0+skinWeight.y*d1+skinWeight.z*d2+skinWeight.w*d3;
    transformed=dqPoint(bR,bD,transformed);
    objectNormal=dqNorm(bR,objectNormal);
    #ifdef USE_TANGENT
      objectTangent=dqNorm(bR,objectTangent);
    #endif
  #endif
`;

function applyDQS(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <skinning_pars_vertex>', '#include <skinning_pars_vertex>\n' + DQS_PARS)
      .replace('#include <skinning_vertex>', DQS_SKIN);
  };
  material.customProgramCacheKey = () => 'dqs_' + material.uuid;
  return material;
}


// ═══════════════════════════════════════════════════════════════
// Layer B — Minimum-Jerk Trajectory (5th-order polynomial)
// ═══════════════════════════════════════════════════════════════

class MinJerk {
  /** Coefficients for x(t) = a₀+a₁t+a₂t²+a₃t³+a₄t⁴+a₅t⁵ */
  static coeffs(x0, xf, T = 1, v0 = 0, vf = 0, a0 = 0, af = 0) {
    const T2 = T * T, T3 = T2 * T, T4 = T3 * T, T5 = T4 * T;
    const c0 = x0, c1 = v0, c2 = a0 / 2;
    const dx = xf - x0 - v0 * T - c2 * T2;
    const dv = vf - v0 - a0 * T;
    const da = af - a0;
    return [c0, c1, c2,
      (20 * dx - (8 * dv + da * T) * T) / (2 * T3),
      (-30 * dx + (14 * dv + 2 * da * T) * T) / (2 * T4),
      (12 * dx - (6 * dv + da * T) * T) / (2 * T5)];
  }

  static eval(c, t) {
    const t2 = t * t, t3 = t2 * t;
    return c[0] + c[1] * t + c[2] * t2 + c[3] * t3 + c[4] * t2 * t2 + c[5] * t2 * t3;
  }

  /** Canonical normalized minimum-jerk: 10t³ − 15t⁴ + 6t⁵ */
  static ease(t) {
    const t3 = t * t * t;
    return 10 * t3 - 15 * t3 * t + 6 * t3 * t * t;
  }
}


// ═══════════════════════════════════════════════════════════════
// Layer C — Kinematic Coupling & Whole-Body Control
// ═══════════════════════════════════════════════════════════════

const WBC = {
  MAX_YAW: 0.5,
  MAX_PITCH: 0.15,
  SMOOTH: 0.08,
  RETURN: 0.92,
  DIP_PIP: 2 / 3,
};


// ═══════════════════════════════════════════════════════════════
// FACS — Facial Action Coding System
// ═══════════════════════════════════════════════════════════════

class FACS {
  constructor() {
    this.au = { 1: 0, 2: 0, 4: 0, 25: 0, 26: 0, 20: 0 };
    this.base = { brow: null, mH: null, mW: null };
    this.n = 0;
  }

  update(face) {
    if (!face || face.length < 32) { this._decay(); return; }
    this.n++;

    // Brow distances (indices 0-4 left brow, 5-9 right, 12/16 eye tops)
    const ib = ((face[0][1] - face[12][1]) + (face[5][1] - face[16][1])) / 2;
    const ob = ((face[4][1] - face[12][1]) + (face[9][1] - face[16][1])) / 2;
    const ab = (ib + ob) / 2;

    // Mouth (indices 21=L corner, 22=R corner, 25=top, 26=bottom)
    const mH = Math.abs(face[26][1] - face[25][1]);
    const mW = Math.abs(face[22][0] - face[21][0]);

    if (this.n <= 5) {
      const f = (v, o) => o ? o * 0.7 + v * 0.3 : v;
      this.base.brow = f(ab, this.base.brow);
      this.base.mH = f(mH, this.base.mH);
      this.base.mW = f(mW, this.base.mW);
    }

    const bb = this.base.brow || -0.03;
    const bh = this.base.mH || 0.02;
    const bw = this.base.mW || 0.06;

    const raw = {
      1:  Math.max(0, Math.min(1, (bb - ib) * 15)),
      2:  Math.max(0, Math.min(1, (bb - ob) * 15)),
      4:  Math.max(0, Math.min(1, (ab - bb) * 12)),
      25: Math.max(0, Math.min(1, (mH - bh) * 20)),
      26: Math.max(0, Math.min(1, (mH - bh * 1.5) * 15)),
      20: Math.max(0, Math.min(1, (mW - bw) * 12)),
    };

    for (const k in this.au) this.au[k] += (raw[k] - this.au[k]) * 0.25;
  }

  _decay() {
    for (const k in this.au) this.au[k] *= 0.92;
  }

  get browUp() { return (this.au[1] * 0.6 + this.au[2] * 0.4) * 0.015; }
  get browDown() { return this.au[4] * 0.010; }
  get browPinch() { return this.au[4] * 0.004; }
  get mouthOpen() { return Math.min(0.022, (this.au[25] * 0.4 + this.au[26] * 0.6) * 0.022); }
  get mouthWide() { return 1 + this.au[20] * 0.4; }
}


// ═══════════════════════════════════════════════════════════════
// HumanoidAvatar — Main class
// ═══════════════════════════════════════════════════════════════

export class HumanoidAvatar {
  constructor(containerEl) {
    this.container = typeof containerEl === 'string'
      ? document.getElementById(containerEl) : containerEl;
    if (!this.container) return;

    this.charId = 'meiling';
    this.mats = {};
    this.g = {};           // named groups/meshes
    this.fingers = { left: {}, right: {} };

    // Animation
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

    // WBC
    this._yaw = 0;
    this._pitch = 0;

    // FACS
    this.facs = new FACS();

    this._init();
  }

  // ─── Scene setup ──────────────────────────────────────────

  _init() {
    this._scene();
    this._makeMats();
    this._body();
    this._arm('left');
    this._arm('right');
    this._head();
    this._legs();
    this._loop();
    this.render(null);
  }

  _scene() {
    const w = this.container.clientWidth || 400;
    const h = this.container.clientHeight || 520;

    this.scene = new THREE.Scene();
    // Soft gradient background via fog
    this.scene.background = new THREE.Color(0x1e2140);
    this.scene.fog = new THREE.Fog(0x1e2140, 3, 6);

    this.camera = new THREE.PerspectiveCamera(38, w / h, 0.05, 50);
    this.camera.position.set(0, 0.12, 2.4);
    this.camera.lookAt(0, 0.05, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    // Three-point lighting for toon style
    const hemi = new THREE.HemisphereLight(0xffeedd, 0x303050, 0.6);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff8f0, 1.4);
    key.position.set(3, 4, 5);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x8888ff, 0.5);
    rim.position.set(-3, 2, -4);
    this.scene.add(rim);

    const fill = new THREE.DirectionalLight(0xffd0a0, 0.3);
    fill.position.set(-2, -1, 3);
    this.scene.add(fill);

    // Subtle floor circle
    const floorGeo = new THREE.CircleGeometry(0.5, 32);
    const floorMat = new THREE.MeshBasicMaterial({
      color: 0x16183a, transparent: true, opacity: 0.5,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.82;
    this.scene.add(floor);

    new ResizeObserver(() => {
      const nw = this.container.clientWidth, nh = this.container.clientHeight;
      if (!nw || !nh) return;
      this.renderer.setSize(nw, nh);
      this.camera.aspect = nw / nh;
      this.camera.updateProjectionMatrix();
    }).observe(this.container);
  }

  _makeMats() {
    const c = CHARACTERS[this.charId];
    this.mats = {
      skin:    toonMat(c.skin),
      skinDk:  toonMat(c.skinDk),
      skinLt:  toonMat(c.skinLt),
      shirt:   toonMat(c.shirt),
      shirtLt: toonMat(c.shirtLt),
      pants:   toonMat(c.pants),
      hair:    toonMat(c.hair),
      hairHi:  toonMat(c.hairHi),
      iris:    toonMat(c.iris),
      irisRing: toonMat(c.irisRing),
      sclera:  new THREE.MeshBasicMaterial({ color: c.sclera }),
      lip:     toonMat(c.lip),
      lipDk:   toonMat(c.lipDk),
      brow:    toonMat(c.brow),
      shoe:    toonMat(c.shoe),
      outline: new THREE.MeshBasicMaterial({ color: c.outline, side: THREE.BackSide }),
      blush:   new THREE.MeshBasicMaterial({
        color: c.blush, transparent: true, opacity: 0.2, side: THREE.FrontSide,
      }),
      pupil:   new THREE.MeshBasicMaterial({ color: 0x0A0A0A }),
      eyeHL:   new THREE.MeshBasicMaterial({ color: 0xFFFFFF }),
    };
  }

  _recolor() {
    const c = CHARACTERS[this.charId];
    this.mats.skin.color.setHex(c.skin);
    this.mats.skinDk.color.setHex(c.skinDk);
    this.mats.skinLt.color.setHex(c.skinLt);
    this.mats.shirt.color.setHex(c.shirt);
    this.mats.shirtLt.color.setHex(c.shirtLt);
    this.mats.pants.color.setHex(c.pants);
    this.mats.hair.color.setHex(c.hair);
    this.mats.hairHi.color.setHex(c.hairHi);
    this.mats.iris.color.setHex(c.iris);
    this.mats.irisRing.color.setHex(c.irisRing);
    this.mats.sclera.color.setHex(c.sclera);
    this.mats.lip.color.setHex(c.lip);
    this.mats.lipDk.color.setHex(c.lipDk);
    this.mats.brow.color.setHex(c.brow);
    this.mats.shoe.color.setHex(c.shoe);
    this.mats.outline.color.setHex(c.outline);
    this.mats.blush.color.setHex(c.blush);
  }

  // ─── Body construction ────────────────────────────────────

  _body() {
    const root = new THREE.Group();
    this.scene.add(root);
    this.g.root = root;

    const hips = new THREE.Group();
    hips.position.set(0, -0.18, 0);
    root.add(hips);
    this.g.hips = hips;

    // Spine (WBC rotation target)
    const spine = new THREE.Group();
    spine.position.set(0, 0.04, 0);
    hips.add(spine);
    this.g.spine = spine;

    // Torso — rounded box with outline
    const chestGeo = this._roundedBox(P.chestW, P.chestH, P.chestD, 0.04);
    const chest = new THREE.Mesh(chestGeo, this.mats.shirt);
    chest.position.set(0, P.chestH / 2 + 0.02, 0);
    spine.add(chest);
    addOutline(chest, chestGeo, 0.04, CHARACTERS[this.charId].outline);

    // Waist
    const waistGeo = this._roundedBox(P.waistW, P.waistH, P.waistD, 0.03);
    const waist = new THREE.Mesh(waistGeo, this.mats.shirt);
    waist.position.set(0, -0.02, 0);
    spine.add(waist);

    // Belt
    const beltGeo = this._roundedBox(P.waistW + 0.01, 0.022, P.waistD + 0.01, 0.008);
    const belt = new THREE.Mesh(beltGeo, toonMat(0x3A3028));
    belt.position.set(0, -0.05, 0);
    spine.add(belt);

    // Shoulder span
    const shoulderGeo = this._roundedBox(P.shoulderSpan, 0.05, P.chestD * 0.9, 0.02);
    const shoulders = new THREE.Mesh(shoulderGeo, this.mats.shirt);
    shoulders.position.set(0, P.chestH + 0.005, 0);
    spine.add(shoulders);

    // Neck
    const neckGrp = new THREE.Group();
    neckGrp.position.set(0, P.chestH + 0.025, 0);
    spine.add(neckGrp);
    this.g.neck = neckGrp;

    const neckGeo = new THREE.CylinderGeometry(P.neckR, P.neckR * 1.1, P.neckH, 12);
    const neck = new THREE.Mesh(neckGeo, this.mats.skin);
    neck.position.set(0, P.neckH / 2, 0);
    neckGrp.add(neck);
  }

  _head() {
    const headGrp = new THREE.Group();
    headGrp.position.set(0, P.neckH + P.headR * 0.7, 0);
    this.g.neck.add(headGrp);
    this.g.head = headGrp;

    // Head sphere
    const headGeo = new THREE.SphereGeometry(P.headR, 32, 28);
    const head = new THREE.Mesh(headGeo, this.mats.skin);
    head.scale.set(P.headSquash, P.headStretch, 0.95);
    headGrp.add(head);
    // Head outline
    addOutline(head, headGeo, 0.025, CHARACTERS[this.charId].outline);

    // ── Hair ──
    // Back hair (large dome)
    const backHairGeo = new THREE.SphereGeometry(P.headR + 0.015, 28, 20,
      0, Math.PI * 2, 0, Math.PI * 0.6);
    const backHair = new THREE.Mesh(backHairGeo, this.mats.hair);
    backHair.scale.set(1.06, 1.12, 1.05);
    backHair.position.set(0, 0.01, -0.01);
    headGrp.add(backHair);
    addOutline(backHair, backHairGeo, 0.03, CHARACTERS[this.charId].outline);

    // Fringe (bangs)
    const fringeGeo = new THREE.SphereGeometry(P.headR + 0.012, 20, 8,
      -Math.PI * 0.45, Math.PI * 0.9, 0, Math.PI * 0.28);
    const fringe = new THREE.Mesh(fringeGeo, this.mats.hairHi);
    fringe.scale.set(1.08, 1.05, 1.1);
    fringe.position.set(0, 0.025, 0.02);
    headGrp.add(fringe);

    // ── Eyes ── (large, anime-inspired)
    for (const side of [-1, 1]) {
      const eyeGrp = new THREE.Group();
      eyeGrp.position.set(side * 0.058, 0.01, P.headR * 0.82);
      headGrp.add(eyeGrp);
      this.g[side < 0 ? 'eyeL' : 'eyeR'] = eyeGrp;

      // Sclera (white, flat-lit for clean look)
      const scleraGeo = new THREE.SphereGeometry(0.032, 16, 16);
      const sclera = new THREE.Mesh(scleraGeo, this.mats.sclera);
      sclera.scale.set(1.1, 1, 0.6);
      eyeGrp.add(sclera);

      // Iris ring (outer colored ring)
      const irisRingGeo = new THREE.SphereGeometry(0.024, 14, 14);
      const irisRing = new THREE.Mesh(irisRingGeo, this.mats.irisRing);
      irisRing.position.z = 0.008;
      irisRing.scale.set(1, 1, 0.3);
      eyeGrp.add(irisRing);

      // Iris (inner)
      const irisGeo = new THREE.SphereGeometry(0.019, 14, 14);
      const iris = new THREE.Mesh(irisGeo, this.mats.iris);
      iris.position.z = 0.012;
      iris.scale.set(1, 1, 0.3);
      eyeGrp.add(iris);

      // Pupil
      const pupilGeo = new THREE.CircleGeometry(0.010, 12);
      const pupil = new THREE.Mesh(pupilGeo, this.mats.pupil);
      pupil.position.z = 0.018;
      eyeGrp.add(pupil);

      // Highlight (large, top-right)
      const hl1Geo = new THREE.CircleGeometry(0.008, 8);
      const hl1 = new THREE.Mesh(hl1Geo, this.mats.eyeHL);
      hl1.position.set(side * 0.006, 0.008, 0.019);
      eyeGrp.add(hl1);

      // Small secondary highlight
      const hl2Geo = new THREE.CircleGeometry(0.004, 6);
      const hl2 = new THREE.Mesh(hl2Geo, this.mats.eyeHL);
      hl2.position.set(-side * 0.004, -0.004, 0.019);
      eyeGrp.add(hl2);

      // Upper eyelid line
      const lidGeo = new THREE.TorusGeometry(0.030, 0.003, 4, 12, Math.PI);
      const lid = new THREE.Mesh(lidGeo, this.mats.brow);
      lid.position.set(0, 0.005, 0.01);
      lid.rotation.z = Math.PI;
      lid.scale.set(1.1, 0.8, 0.5);
      eyeGrp.add(lid);
    }

    // ── Eyebrows ── (thick, expressive arcs)
    for (const side of [-1, 1]) {
      const browGeo = this._roundedBox(0.05, 0.010, 0.012, 0.004);
      const brow = new THREE.Mesh(browGeo, this.mats.brow);
      brow.position.set(side * 0.058, 0.055, P.headR * 0.78);
      brow.rotation.z = side * -0.1; // slight angle
      headGrp.add(brow);
      this.g[side < 0 ? 'browL' : 'browR'] = brow;
    }

    // ── Nose ──
    const noseGeo = new THREE.SphereGeometry(0.018, 8, 8);
    const nose = new THREE.Mesh(noseGeo, this.mats.skinDk);
    nose.position.set(0, -0.02, P.headR * 0.88);
    nose.scale.set(0.8, 0.7, 0.6);
    headGrp.add(nose);

    // ── Blush spots ──
    for (const side of [-1, 1]) {
      const blushGeo = new THREE.CircleGeometry(0.022, 12);
      const blush = new THREE.Mesh(blushGeo, this.mats.blush);
      blush.position.set(side * 0.08, -0.03, P.headR * 0.82);
      blush.lookAt(blush.position.clone().add(new THREE.Vector3(0, 0, 1)));
      headGrp.add(blush);
    }

    // ── Mouth ──
    const mouthGrp = new THREE.Group();
    mouthGrp.position.set(0, -0.058, P.headR * 0.84);
    headGrp.add(mouthGrp);
    this.g.mouth = mouthGrp;

    // Upper lip
    const ulGeo = this._roundedBox(0.04, 0.008, 0.012, 0.003);
    const ul = new THREE.Mesh(ulGeo, this.mats.lip);
    ul.position.y = 0.004;
    mouthGrp.add(ul);
    this.g.upperLip = ul;

    // Lower lip
    const llGeo = this._roundedBox(0.042, 0.009, 0.012, 0.003);
    const ll = new THREE.Mesh(llGeo, this.mats.lipDk);
    ll.position.y = -0.004;
    mouthGrp.add(ll);
    this.g.lowerLip = ll;

    // ── Ears ──
    for (const side of [-1, 1]) {
      const earGeo = new THREE.SphereGeometry(0.028, 8, 8);
      const ear = new THREE.Mesh(earGeo, this.mats.skin);
      ear.position.set(side * (P.headR * P.headSquash + 0.005), -0.01, -0.02);
      ear.scale.set(0.35, 0.9, 0.65);
      headGrp.add(ear);
    }
  }

  _arm(side) {
    const sign = side === 'left' ? -1 : 1;
    const sx = sign * P.shoulderSpan / 2;

    // Shoulder
    const shoulderGrp = new THREE.Group();
    shoulderGrp.position.set(sx, P.chestH + 0.005, 0);
    this.g.spine.add(shoulderGrp);
    this.g[side + 'Shoulder'] = shoulderGrp;

    // Shoulder ball
    const sjGeo = new THREE.SphereGeometry(P.shoulderR, 14, 14);
    const sj = new THREE.Mesh(sjGeo, this.mats.shirtLt);
    shoulderGrp.add(sj);
    addOutline(sj, sjGeo, 0.05, CHARACTERS[this.charId].outline);

    // Upper arm
    const uaGrp = new THREE.Group();
    shoulderGrp.add(uaGrp);
    this.g[side + 'UpperArm'] = uaGrp;

    const uaGeo = new THREE.CapsuleGeometry(P.upperArmR, P.upperArmLen, 8, 12);
    const ua = new THREE.Mesh(uaGeo, this.mats.skin);
    ua.position.y = -(P.upperArmLen / 2 + P.upperArmR);
    uaGrp.add(ua);

    // Sleeve (covers top portion of upper arm)
    const slGeo = new THREE.CapsuleGeometry(P.upperArmR + 0.008, P.upperArmLen * 0.5, 8, 10);
    const sl = new THREE.Mesh(slGeo, this.mats.shirt);
    sl.position.y = -(P.upperArmLen * 0.25 + P.upperArmR);
    uaGrp.add(sl);

    // Elbow
    const elbowGrp = new THREE.Group();
    elbowGrp.position.y = -(P.upperArmLen + P.upperArmR * 2);
    uaGrp.add(elbowGrp);
    this.g[side + 'Elbow'] = elbowGrp;

    const ejGeo = new THREE.SphereGeometry(P.foreArmR + 0.008, 10, 10);
    const ej = new THREE.Mesh(ejGeo, this.mats.skin);
    elbowGrp.add(ej);

    // Forearm
    const faGrp = new THREE.Group();
    elbowGrp.add(faGrp);
    this.g[side + 'ForeArm'] = faGrp;

    const faGeo = new THREE.CapsuleGeometry(P.foreArmR, P.foreArmLen, 8, 12);
    const fa = new THREE.Mesh(faGeo, this.mats.skin);
    fa.position.y = -(P.foreArmLen / 2 + P.foreArmR);
    faGrp.add(fa);

    // Wrist
    const wristGrp = new THREE.Group();
    wristGrp.position.y = -(P.foreArmLen + P.foreArmR * 2);
    faGrp.add(wristGrp);
    this.g[side + 'Wrist'] = wristGrp;

    const wjGeo = new THREE.SphereGeometry(P.foreArmR + 0.002, 10, 10);
    const wj = new THREE.Mesh(wjGeo, this.mats.skin);
    wristGrp.add(wj);

    this._hand(side, wristGrp);
  }

  _hand(side, wristGrp) {
    const handGrp = new THREE.Group();
    wristGrp.add(handGrp);
    this.g[side + 'Hand'] = handGrp;

    // Palm — visible, rounded
    const palmGeo = this._roundedBox(P.palmW, P.palmH, P.palmD, 0.008);
    const palm = new THREE.Mesh(palmGeo, this.mats.skin);
    palm.position.y = -P.palmH / 2;
    handGrp.add(palm);
    addOutline(palm, palmGeo, 0.06, CHARACTERS[this.charId].outline);

    // Fingers
    for (const fname of FINGER_NAMES) {
      this._finger(side, fname, handGrp);
    }
  }

  _finger(side, name, handGrp) {
    const segs = P[name + 'Segs'];
    const base = FINGER_BASES[name];
    const mir = side === 'left' ? -1 : 1;

    const baseGrp = new THREE.Group();
    baseGrp.position.set(base.x * mir, -P.palmH + base.y, base.z);
    handGrp.add(baseGrp);

    let parent = baseGrp;
    const chain = [];

    for (let i = 0; i < 3; i++) {
      const len = segs[i];
      const r = P.fingerR * (1 - i * 0.12); // taper

      const jGrp = new THREE.Group();
      if (i > 0) jGrp.position.y = -segs[i - 1];
      parent.add(jGrp);

      // Joint ball
      const jGeo = new THREE.SphereGeometry(r + 0.003, 8, 8);
      const jMesh = new THREE.Mesh(jGeo, this.mats.skinLt);
      jGrp.add(jMesh);

      // Segment capsule
      const sGeo = new THREE.CapsuleGeometry(r, len * 0.65, 6, 8);
      const sMesh = new THREE.Mesh(sGeo, this.mats.skin);
      sMesh.position.y = -len / 2;
      jGrp.add(sMesh);

      chain.push(jGrp);
      parent = jGrp;
    }

    // Rounded fingertip
    const tipGeo = new THREE.SphereGeometry(P.fingerR * 0.85, 8, 8);
    const tip = new THREE.Mesh(tipGeo, this.mats.skinLt);
    tip.position.y = -segs[2];
    parent.add(tip);

    this.fingers[side][name] = chain;
  }

  _legs() {
    for (const side of [-1, 1]) {
      const legGrp = new THREE.Group();
      legGrp.position.set(side * 0.07, -0.065, 0);
      this.g.hips.add(legGrp);

      // Upper leg
      const ulGeo = new THREE.CapsuleGeometry(P.upperLegR, P.upperLegH, 8, 12);
      const ul = new THREE.Mesh(ulGeo, this.mats.pants);
      ul.position.y = -(P.upperLegH / 2 + P.upperLegR);
      legGrp.add(ul);

      // Knee joint
      const kneeGeo = new THREE.SphereGeometry(P.lowerLegR + 0.005, 10, 10);
      const knee = new THREE.Mesh(kneeGeo, this.mats.pants);
      knee.position.y = -(P.upperLegH + P.upperLegR * 2);
      legGrp.add(knee);

      // Lower leg
      const llGeo = new THREE.CapsuleGeometry(P.lowerLegR, P.lowerLegH, 8, 12);
      const ll = new THREE.Mesh(llGeo, this.mats.pants);
      ll.position.y = -(P.upperLegH + P.upperLegR * 2 + P.lowerLegH / 2 + P.lowerLegR);
      legGrp.add(ll);

      // Shoe
      const shoeGeo = this._roundedBox(P.shoeW, P.shoeH, P.shoeD, 0.015);
      const shoe = new THREE.Mesh(shoeGeo, this.mats.shoe);
      const shoeY = -(P.upperLegH + P.upperLegR * 2 + P.lowerLegH + P.lowerLegR * 2 + P.shoeH / 2);
      shoe.position.set(0, shoeY, 0.015);
      legGrp.add(shoe);
      addOutline(shoe, shoeGeo, 0.04, CHARACTERS[this.charId].outline);
    }
  }

  // ─── Geometry helper: properly rounded box ────────────────

  _roundedBox(w, h, d, r) {
    // Use a box with beveled edges
    const shape = new THREE.Shape();
    const hw = w / 2 - r, hh = h / 2 - r;
    shape.moveTo(-hw, -h / 2);
    shape.lineTo(hw, -h / 2);
    shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -hh);
    shape.lineTo(w / 2, hh);
    shape.quadraticCurveTo(w / 2, h / 2, hw, h / 2);
    shape.lineTo(-hw, h / 2);
    shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, hh);
    shape.lineTo(-w / 2, -hh);
    shape.quadraticCurveTo(-w / 2, -h / 2, -hw, -h / 2);

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: d, bevelEnabled: true, bevelThickness: r * 0.5,
      bevelSize: r * 0.5, bevelSegments: 3,
    });
    geo.translate(0, 0, -d / 2);
    geo.computeVertexNormals();
    return geo;
  }

  // ─── Render loop ──────────────────────────────────────────

  _loop() {
    const animate = () => {
      requestAnimationFrame(animate);
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  // ─── IK solver ────────────────────────────────────────────

  _lmToWorld(lm) {
    return new THREE.Vector3(
      (0.5 - lm[0]) * 1.4,
      (0.5 - lm[1]) * 1.4,
      -(lm[2] ?? 0) * 0.35
    );
  }

  _solveIK(target, side) {
    const ua = this.g[side + 'UpperArm'];
    const fa = this.g[side + 'ForeArm'];
    const sh = this.g[side + 'Shoulder'];

    const shW = new THREE.Vector3();
    sh.getWorldPosition(shW);

    const L1 = P.upperArmLen + P.upperArmR * 2;
    const L2 = P.foreArmLen + P.foreArmR * 2;
    const d = Math.min(new THREE.Vector3().subVectors(target, shW).length(), L1 + L2 - 0.01);

    let ce = (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2);
    ce = Math.max(-1, Math.min(1, ce));
    const elbowAngle = Math.PI - Math.acos(ce);

    const local = sh.worldToLocal(target.clone()).normalize();
    ua.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), local);
    fa.rotation.set(elbowAngle, 0, 0);
  }

  // ─── Layer C: finger coupling ─────────────────────────────

  _fingerPose(hand, side) {
    if (!hand || hand.length < 21) return;
    const w = hand[0];

    for (const fn of FINGER_NAMES) {
      const chain = this.fingers[side][fn];
      if (!chain) continue;
      const idx = FINGER_LANDMARKS[fn];
      const pts = idx.map(i => hand[i]);

      // MCP
      chain[0].rotation.x = this._jAngle(w, pts[0], pts[1], fn);
      // PIP
      const pip = this._jAngle(pts[0], pts[1], pts[2], fn);
      chain[1].rotation.x = pip;
      // DIP: enforce coupling for non-thumb
      if (fn !== 'thumb') {
        chain[2].rotation.x = pip * WBC.DIP_PIP;
      } else {
        chain[2].rotation.x = this._jAngle(pts[1], pts[2], pts[3], fn);
      }

      // Thumb abduction
      if (fn === 'thumb') {
        const d = [pts[0][0] - w[0], pts[0][1] - w[1]];
        chain[0].rotation.z = Math.atan2(d[0], -d[1]) * 0.5 * (side === 'left' ? -1 : 1);
      }
    }
  }

  _jAngle(prev, curr, next, fn) {
    const v1 = [curr[0] - prev[0], curr[1] - prev[1], (curr[2] ?? 0) - (prev[2] ?? 0)];
    const v2 = [next[0] - curr[0], next[1] - curr[1], (next[2] ?? 0) - (curr[2] ?? 0)];
    const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
    const m1 = Math.hypot(v1[0], v1[1], v1[2]) || 1;
    const m2 = Math.hypot(v2[0], v2[1], v2[2]) || 1;
    let a = Math.acos(Math.max(-1, Math.min(1, dot / (m1 * m2))));
    if (v1[0] * v2[1] - v1[1] * v2[0] < 0) a = -a;
    const mx = fn === 'thumb' ? Math.PI * 0.5 : Math.PI * 0.55;
    return Math.max(-0.2, Math.min(mx, a));
  }

  // ─── Layer C: WBC torso ───────────────────────────────────

  _wbc(lw, rw) {
    if (!this.g.spine) return;
    let ty = 0, tp = 0, n = 0, ax = 0, ay = 0;

    if (lw) { ax += 0.5 - lw[0]; ay += 0.5 - lw[1]; n++; }
    if (rw) { ax += 0.5 - rw[0]; ay += 0.5 - rw[1]; n++; }

    if (n) {
      ax /= n; ay /= n;
      ty = Math.max(-WBC.MAX_YAW, Math.min(WBC.MAX_YAW, ax * 2));
      tp = Math.max(-WBC.MAX_PITCH, Math.min(WBC.MAX_PITCH, -ay * 0.5));
    }

    this._yaw += (ty - this._yaw) * WBC.SMOOTH;
    this._pitch += (tp - this._pitch) * WBC.SMOOTH;
    if (!n) { this._yaw *= WBC.RETURN; this._pitch *= WBC.RETURN; }

    this.g.spine.rotation.y = this._yaw;
    this.g.spine.rotation.x = this._pitch;
  }

  // ─── FACS face ────────────────────────────────────────────

  _face(data) {
    this.facs.update(data);
    const f = this.facs;

    if (this.g.browL) {
      this.g.browL.position.y = 0.055 + f.browUp - f.browDown;
      this.g.browL.position.x = -0.058 + f.browPinch;
    }
    if (this.g.browR) {
      this.g.browR.position.y = 0.055 + f.browUp - f.browDown;
      this.g.browR.position.x = 0.058 - f.browPinch;
    }

    if (this.g.upperLip && this.g.lowerLip) {
      const o = f.mouthOpen;
      this.g.upperLip.position.y = 0.004 + o * 0.3;
      this.g.lowerLip.position.y = -0.004 - o;
      this.g.upperLip.scale.x = f.mouthWide;
      this.g.lowerLip.scale.x = f.mouthWide;
    }
  }

  // ─── Frame render ─────────────────────────────────────────

  render(frame) {
    if (!frame) { this._idle(); return; }

    let lh = null, rh = null, fd = null;
    if (frame.leftHand || frame.rightHand) {
      lh = frame.leftHand; rh = frame.rightHand; fd = frame.face;
    } else if (Array.isArray(frame) && frame.length >= 21) {
      rh = frame;
    }

    if (rh && rh.length >= 21) {
      this._solveIK(this._lmToWorld(rh[0]), 'right');
      this._fingerPose(rh, 'right');
    } else this._armIdle('right');

    if (lh && lh.length >= 21) {
      this._solveIK(this._lmToWorld(lh[0]), 'left');
      this._fingerPose(lh, 'left');
    } else this._armIdle('left');

    this._face(fd);
    this._wbc(lh ? lh[0] : null, rh ? rh[0] : null);
  }

  _idle() {
    for (const s of ['left', 'right']) {
      this._armIdle(s);
      for (const fn of FINGER_NAMES) {
        const c = this.fingers[s][fn];
        if (!c) continue;
        const curl = fn === 'thumb' ? 0.15 : 0.3;
        for (let i = 0; i < c.length; i++) {
          if (fn !== 'thumb' && i === 2) c[i].rotation.x = c[1].rotation.x * WBC.DIP_PIP;
          else c[i].rotation.x = curl * (i + 1) * 0.5;
          c[i].rotation.z = 0;
        }
      }
    }
    this.facs._decay();
    this._face(null);
    this._yaw *= WBC.RETURN; this._pitch *= WBC.RETURN;
    if (this.g.spine) {
      this.g.spine.rotation.y = this._yaw;
      this.g.spine.rotation.x = this._pitch;
    }
  }

  _armIdle(side) {
    const s = side === 'left' ? -1 : 1;
    const ua = this.g[side + 'UpperArm'];
    const fa = this.g[side + 'ForeArm'];
    if (ua) ua.quaternion.setFromEuler(new THREE.Euler(0.12, 0, s * 0.18));
    if (fa) fa.rotation.set(0.4, 0, 0);
  }

  // ─── Layer B: min-jerk interpolation ──────────────────────

  _mjHand(a, b, t) {
    if (!a) return b;
    if (!b) return a;
    return b.map((lm, i) => [
      MinJerk.eval(MinJerk.coeffs(a[i][0], lm[0]), t),
      MinJerk.eval(MinJerk.coeffs(a[i][1], lm[1]), t),
      MinJerk.eval(MinJerk.coeffs(a[i][2] ?? 0, lm[2] ?? 0), t),
    ]);
  }

  _mjFrame(a, b, t) {
    if (!a) return b;
    return {
      leftHand:  this._mjHand(a.leftHand, b.leftHand, t),
      rightHand: this._mjHand(a.rightHand, b.rightHand, t),
      face:      this._mjHand(a.face, b.face, t),
    };
  }

  _toFrame(fr) {
    if (!fr) return null;
    if (fr.leftHand !== undefined || fr.rightHand !== undefined)
      return { leftHand: fr.leftHand || null, rightHand: fr.rightHand || null, face: fr.face || null };
    if (Array.isArray(fr) && fr.length >= 21) {
      const lm = Array.isArray(fr[0]) && fr[0].length === 3 ? fr
               : Array.isArray(fr[0]?.[0]) && fr[0].length >= 21 ? fr[0]
               : fr;
      return { leftHand: null, rightHand: lm, face: null };
    }
    return null;
  }

  // ─── Playback API ─────────────────────────────────────────

  playSequence(landmarks, speed = 1, onFrame = null, onDone = null) {
    this.seq = (landmarks || [])
      .map(f => this._toFrame(f))
      .filter(f => f && (f.leftHand || f.rightHand));
    if (!this.seq.length) return false;

    this.speed = speed;
    this.fi = 0; this.fAcc = 0;
    this.prevFrame = null;
    this.playing = true; this.paused = false;
    this._onFrame = onFrame; this._onDone = onDone;
    this.lastT = performance.now();
    this.facs.n = 0;
    this.facs.base = { brow: null, mH: null, mW: null };

    if (this.rafId) cancelAnimationFrame(this.rafId);
    this._tick();
    return true;
  }

  _tick() {
    if (!this.playing || this.paused) return;
    const now = performance.now();
    this.fAcc += ((now - this.lastT) / 1000) * 30 * this.speed;
    this.lastT = now;

    while (this.fAcc >= 1 && this.fi < this.seq.length - 1) {
      this.fi++; this.fAcc -= 1;
      if (this._onFrame) this._onFrame(this.fi, this.seq.length);
    }

    if (this.fi >= this.seq.length - 1) {
      this.render(this.seq[this.seq.length - 1]);
      this.playing = false;
      if (this._onDone) this._onDone();
      return;
    }

    const t = Math.min(this.fAcc, 1);
    this.render(this._mjFrame(this.seq[this.fi], this.seq[this.fi + 1], t));
    this.rafId = requestAnimationFrame(() => this._tick());
  }

  togglePause() {
    this.paused = !this.paused;
    if (!this.paused) { this.lastT = performance.now(); this._tick(); }
    return this.paused;
  }

  replay() {
    this.fi = 0; this.fAcc = 0; this.prevFrame = null;
    this.paused = false; this.playing = true;
    this.lastT = performance.now();
    this.facs.n = 0;
    this.facs.base = { brow: null, mH: null, mW: null };
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this._tick();
  }

  setSpeed(s) { this.speed = s; }
  isPlaying() { return this.playing && !this.paused; }
  getFrameInfo() { return { current: this.fi, total: this.seq.length }; }

  setCharacter(id) {
    if (!CHARACTERS[id]) return;
    this.charId = id;
    this._recolor();
  }

  getCharacters() {
    return Object.entries(CHARACTERS).map(([id, c]) => ({ id, name: c.name }));
  }
}
