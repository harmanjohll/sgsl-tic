/* ============================================================
   SgSL Hub — GLB Avatar Loader & Sign Language Animator
   ============================================================
   Loads a rigged GLB/GLTF humanoid model and drives it with
   MediaPipe Holistic landmarks for sign language production.

   Architecture:
     1. GLTFLoader loads .glb from assets/
     2. Auto-detects skeleton bone names (Mixamo, RPM, VRM, generic)
     3. Two-bone IK with pole vectors maps wrist → arm chain
     4. Per-finger rotation from MediaPipe 21-point hand data
     5. Enhanced FACS facial expression via morph targets
     6. Whole-body control: torso rotation from signing space
     7. One-Euro filter for temporal smoothing on all bones
     8. Idle breathing animation for lifelike presence

   Biomechanical layers:
     A — DQS-ready (for SkinnedMesh models)
     B — 5th-order minimum-jerk trajectory interpolation
     C — θ_DIP = 2/3 × θ_PIP finger coupling, WBC torso
   ============================================================ */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ─── Avatar model paths ─────────────────────────────────────
const AVATARS = {
  tom: { name: 'Tom', model: 'assets/tom.glb' },
};

// ─── Bone name mapping ──────────────────────────────────────
const BONE_ALIASES = {
  hips:         ['Hips', 'mixamorigHips', 'J_Bip_C_Hips', 'hip', 'pelvis'],
  spine:        ['Spine', 'mixamorigSpine', 'J_Bip_C_Spine', 'spine'],
  spine1:       ['Spine1', 'mixamorigSpine1', 'J_Bip_C_Spine2', 'spine1', 'chest'],
  spine2:       ['Spine2', 'mixamorigSpine2', 'spine2', 'upperChest'],
  neck:         ['Neck', 'mixamorigNeck', 'J_Bip_C_Neck', 'neck'],
  head:         ['Head', 'mixamorigHead', 'J_Bip_C_Head', 'head'],

  leftShoulder:  ['LeftShoulder', 'mixamorigLeftShoulder', 'J_Bip_L_Shoulder'],
  leftUpperArm:  ['LeftArm', 'mixamorigLeftArm', 'J_Bip_L_UpperArm', 'leftUpperArm'],
  leftForeArm:   ['LeftForeArm', 'mixamorigLeftForeArm', 'J_Bip_L_LowerArm', 'leftLowerArm'],
  leftHand:      ['LeftHand', 'mixamorigLeftHand', 'J_Bip_L_Hand', 'leftHand'],

  rightShoulder: ['RightShoulder', 'mixamorigRightShoulder', 'J_Bip_R_Shoulder'],
  rightUpperArm: ['RightArm', 'mixamorigRightArm', 'J_Bip_R_UpperArm', 'rightUpperArm'],
  rightForeArm:  ['RightForeArm', 'mixamorigRightForeArm', 'J_Bip_R_LowerArm', 'rightLowerArm'],
  rightHand:     ['RightHand', 'mixamorigRightHand', 'J_Bip_R_Hand', 'rightHand'],
};

const FINGER_NAMES_MAP = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];

const MP_FINGERS = {
  Thumb:  [1, 2, 3, 4],
  Index:  [5, 6, 7, 8],
  Middle: [9, 10, 11, 12],
  Ring:   [13, 14, 15, 16],
  Pinky:  [17, 18, 19, 20],
};

const WBC = {
  MAX_YAW: 0.5,
  MAX_PITCH: 0.15,
  SMOOTH: 0.08,
  RETURN: 0.92,
  DIP_PIP: 2 / 3,
};


// ═══════════════════════════════════════════════════════════════
// One-Euro Filter — temporal smoothing for bone rotations
// Reduces jitter while preserving fast movements
// ═══════════════════════════════════════════════════════════════

class OneEuroFilter {
  constructor(minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xPrev = null;
    this.dxPrev = null;
    this.tPrev = null;
  }

  _alpha(cutoff, dt) {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  filter(x, t) {
    if (this.tPrev === null) {
      this.xPrev = x;
      this.dxPrev = 0;
      this.tPrev = t;
      return x;
    }

    const dt = Math.max(t - this.tPrev, 1e-6);
    const dx = (x - this.xPrev) / dt;

    const adx = this._alpha(this.dCutoff, dt);
    const dxHat = adx * dx + (1 - adx) * this.dxPrev;

    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const ax = this._alpha(cutoff, dt);
    const xHat = ax * x + (1 - ax) * this.xPrev;

    this.xPrev = xHat;
    this.dxPrev = dxHat;
    this.tPrev = t;
    return xHat;
  }

  reset() {
    this.xPrev = null;
    this.dxPrev = null;
    this.tPrev = null;
  }
}

// Quaternion-aware One-Euro filter (filters each XYZW component)
class QuatOneEuroFilter {
  constructor(minCutoff = 1.5, beta = 0.01) {
    this.filters = [
      new OneEuroFilter(minCutoff, beta),
      new OneEuroFilter(minCutoff, beta),
      new OneEuroFilter(minCutoff, beta),
      new OneEuroFilter(minCutoff, beta),
    ];
    this._prev = null;
  }

  filter(q, t) {
    // Ensure shortest path (flip quaternion if needed)
    if (this._prev && q.dot(this._prev) < 0) {
      q = new THREE.Quaternion(-q.x, -q.y, -q.z, -q.w);
    }
    const out = new THREE.Quaternion(
      this.filters[0].filter(q.x, t),
      this.filters[1].filter(q.y, t),
      this.filters[2].filter(q.z, t),
      this.filters[3].filter(q.w, t),
    ).normalize();
    this._prev = out.clone();
    return out;
  }

  reset() {
    this.filters.forEach(f => f.reset());
    this._prev = null;
  }
}


// ═══════════════════════════════════════════════════════════════
// Layer B — Minimum-Jerk Trajectory (5th-order polynomial)
// ═══════════════════════════════════════════════════════════════

class MinJerk {
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
}


// ═══════════════════════════════════════════════════════════════
// Enhanced FACS — Facial Action Coding System
// Now supports more AUs for sign language NMMs
// ═══════════════════════════════════════════════════════════════

class FACS {
  constructor() {
    // Extended AU set for sign language NMMs
    this.au = {
      1: 0, 2: 0, 4: 0,       // brow raise inner/outer, furrow
      5: 0,                     // upper lid raise (wide eyes)
      6: 0,                     // cheek raise (squint)
      9: 0,                     // nose wrinkle
      10: 0,                    // upper lip raise
      12: 0,                    // lip corner pull (smile)
      15: 0,                    // lip corner depress (frown)
      20: 0,                    // lip stretch
      25: 0, 26: 0,            // lips part / jaw drop
      // Head orientation (from pose landmarks)
      headYaw: 0,
      headPitch: 0,
      headRoll: 0,
    };
    this.base = { brow: null, mH: null, mW: null, lipW: null, cheekY: null };
    this.n = 0;
  }

  update(face) {
    if (!face || face.length < 32) { this._decay(); return; }
    this.n++;

    // Brow heights (inner/outer relative to eye top)
    const ib = ((face[0][1] - face[12][1]) + (face[5][1] - face[16][1])) / 2;
    const ob = ((face[4][1] - face[12][1]) + (face[9][1] - face[16][1])) / 2;
    const ab = (ib + ob) / 2;

    // Mouth measurements
    const mH = Math.abs(face[26][1] - face[25][1]);  // vertical opening
    const mW = Math.abs(face[22][0] - face[21][0]);  // horizontal width
    const lipW = Math.abs(face[27][0] - face[28][0]); // inner lip width

    // Eye openness (top-bottom distance)
    const eyeOpenL = Math.abs(face[12][1] - face[13][1]);
    const eyeOpenR = Math.abs(face[16][1] - face[17][1]);
    const eyeOpen = (eyeOpenL + eyeOpenR) / 2;

    // Cheek height (for squint detection)
    const cheekY = (face[12][1] + face[16][1]) / 2;

    // Calibrate baseline from first 5 frames
    if (this.n <= 5) {
      const f = (v, o) => o ? o * 0.7 + v * 0.3 : v;
      this.base.brow = f(ab, this.base.brow);
      this.base.mH = f(mH, this.base.mH);
      this.base.mW = f(mW, this.base.mW);
      this.base.lipW = f(lipW, this.base.lipW);
      this.base.cheekY = f(cheekY, this.base.cheekY);
      this.base.eyeOpen = f(eyeOpen, this.base.eyeOpen);
    }

    const bb = this.base.brow || -0.03;
    const bh = this.base.mH || 0.02;
    const bw = this.base.mW || 0.06;
    const beo = this.base.eyeOpen || 0.02;

    const clamp = (v) => Math.max(0, Math.min(1, v));
    const raw = {
      1:  clamp((bb - ib) * 15),
      2:  clamp((bb - ob) * 15),
      4:  clamp((ab - bb) * 12),
      5:  clamp((eyeOpen - beo) * 20),            // wide eyes
      6:  clamp((beo - eyeOpen) * 15),             // squint
      9:  clamp((ab - bb) * 8),                    // nose wrinkle (correlated with AU4)
      10: 0,                                        // placeholder
      12: clamp((mW - bw) * 8),                    // smile
      15: clamp((bw - mW) * 8),                    // frown
      20: clamp((mW - bw) * 12),                   // lip stretch
      25: clamp((mH - bh) * 20),                   // lips part
      26: clamp((mH - bh * 1.5) * 15),             // jaw drop
    };

    // Smooth towards raw values
    const alpha = 0.25;
    for (const k of Object.keys(raw)) {
      this.au[k] += (raw[k] - this.au[k]) * alpha;
    }
  }

  // Update head orientation from pose landmarks
  updateHead(pose) {
    if (!pose || pose.length < 12) return;
    // Use nose (0), left ear (7), right ear (8) from pose landmarks
    const nose = pose[0];
    const leftEar = pose[7];
    const rightEar = pose[8];

    if (!nose || !leftEar || !rightEar) return;

    // Yaw: horizontal offset of nose between ears
    const earMidX = (leftEar[0] + rightEar[0]) / 2;
    const earDist = Math.abs(leftEar[0] - rightEar[0]) || 0.1;
    const yaw = ((nose[0] - earMidX) / earDist) * 0.8;

    // Pitch: vertical offset of nose relative to ears
    const earMidY = (leftEar[1] + rightEar[1]) / 2;
    const pitch = ((nose[1] - earMidY) / earDist) * 0.6;

    // Roll: ear tilt
    const roll = Math.atan2(rightEar[1] - leftEar[1], rightEar[0] - leftEar[0]);

    const s = 0.15; // smoothing
    const clamp = (v, lim) => Math.max(-lim, Math.min(lim, isFinite(v) ? v : 0));
    this.au.headYaw += (clamp(yaw, 1.0) - this.au.headYaw) * s;
    this.au.headPitch += (clamp(pitch, 0.8) - this.au.headPitch) * s;
    this.au.headRoll += (clamp(roll, 0.6) - this.au.headRoll) * s;
  }

  _decay() {
    for (const k of Object.keys(this.au)) {
      if (typeof this.au[k] === 'number') this.au[k] *= 0.92;
    }
  }

  reset() {
    for (const k of Object.keys(this.au)) this.au[k] = 0;
    this.base = { brow: null, mH: null, mW: null, lipW: null, cheekY: null };
    this.n = 0;
  }
}


// ═══════════════════════════════════════════════════════════════
// HumanoidAvatar — GLB Loader & Animator
// ═══════════════════════════════════════════════════════════════

export class HumanoidAvatar {
  constructor(containerEl) {
    this.container = typeof containerEl === 'string'
      ? document.getElementById(containerEl) : containerEl;
    if (!this.container) return;

    this.charId = 'tom';
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.model = null;
    this.skeleton = null;
    this.bones = {};
    this.fingerBones = { left: {}, right: {} };
    this.morphMeshes = [];
    this.mixer = null;
    this.clock = new THREE.Clock();

    // Loading state
    this.loaded = false;
    this.loadingEl = null;

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
    this._pendingPlay = null;

    // Temporal smoothing — One-Euro filters per bone
    this._boneFilters = {};

    // WBC
    this._yaw = 0;
    this._pitch = 0;

    // FACS
    this.facs = new FACS();

    // Rest pose quaternions
    this._restPose = {};

    // Idle breathing
    this._breathPhase = 0;
    this._breathRate = 0.25; // Hz (one breath per 4 seconds)

    this._initScene();
    this._loadModel(AVATARS[this.charId]?.model);
  }

  // ─── Scene ────────────────────────────────────────────────

  _initScene() {
    const w = this.container.clientWidth || 400;
    const h = this.container.clientHeight || 520;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x2a2d4e);

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.05, 50);
    this.camera.position.set(0, 1.0, 5.0);
    this.camera.lookAt(0, 0.8, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.4;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    // OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enableZoom = true;
    this.controls.enablePan = true;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 8;
    this.controls.target.set(0, 0.85, 0);
    this.controls.update();

    // Environment map for realistic reflections
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x8899bb);
    const envLight1 = new THREE.DirectionalLight(0xffffff, 1);
    envLight1.position.set(1, 2, 1);
    envScene.add(envLight1);
    const envLight2 = new THREE.DirectionalLight(0x4466aa, 0.5);
    envLight2.position.set(-1, 0, -1);
    envScene.add(envLight2);
    this.envMap = pmrem.fromScene(envScene, 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.envMap;

    // Lighting — 4-point studio setup
    const hemi = new THREE.HemisphereLight(0xffeedd, 0x303050, 0.6);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff8f0, 1.8);
    key.position.set(3, 4, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.1;
    key.shadow.camera.far = 20;
    key.shadow.camera.left = -2;
    key.shadow.camera.right = 2;
    key.shadow.camera.top = 3;
    key.shadow.camera.bottom = -1;
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x8888ff, 0.6);
    rim.position.set(-3, 2, -4);
    this.scene.add(rim);

    const fill = new THREE.DirectionalLight(0xffd0a0, 0.4);
    fill.position.set(-2, 0, 3);
    this.scene.add(fill);

    const bottom = new THREE.DirectionalLight(0xaabbcc, 0.2);
    bottom.position.set(0, -2, 2);
    this.scene.add(bottom);

    // Floor
    const floorGeo = new THREE.CircleGeometry(1.2, 48);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x22254a, roughness: 0.9, metalness: 0,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Loading indicator
    this.loadingEl = document.createElement('div');
    this.loadingEl.style.cssText = `
      position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
      color:#8888cc; font:14px/1.4 Inter,sans-serif; text-align:center;
    `;
    this.loadingEl.textContent = 'Loading avatar...';
    this.container.style.position = 'relative';
    this.container.appendChild(this.loadingEl);

    // Resize
    new ResizeObserver(() => {
      const nw = this.container.clientWidth, nh = this.container.clientHeight;
      if (!nw || !nh) return;
      this.renderer.setSize(nw, nh);
      this.camera.aspect = nw / nh;
      this.camera.updateProjectionMatrix();
    }).observe(this.container);

    // Render loop with idle breathing
    const animate = () => {
      requestAnimationFrame(animate);
      const dt = this.clock.getDelta();
      if (this.mixer) this.mixer.update(dt);
      if (this.controls) this.controls.update();

      // Idle breathing when not playing
      if (this.loaded && !this.playing) {
        this._breathe(dt);
      }

      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  // ─── Idle breathing ────────────────────────────────────────

  _breathe(dt) {
    this._breathPhase += dt * this._breathRate * Math.PI * 2;
    const breath = Math.sin(this._breathPhase) * 0.003;

    const spine = this.bones.spine1 || this.bones.spine;
    if (spine) {
      const rest = this._restPose[spine === this.bones.spine1 ? 'spine1' : 'spine'];
      if (rest) {
        spine.quaternion.copy(rest);
        spine.rotateX(breath);
      }
    }

    // Subtle shoulder lift
    for (const side of ['left', 'right']) {
      const shoulder = this.bones[side + 'Shoulder'];
      const key = side + 'Shoulder';
      if (shoulder && this._restPose[key]) {
        shoulder.quaternion.copy(this._restPose[key]);
        shoulder.rotateZ(breath * 0.5 * (side === 'left' ? 1 : -1));
      }
    }
  }

  // ─── GLB Loading ──────────────────────────────────────────

  _loadModel(path) {
    if (!path) {
      this._showFallback('No model file configured');
      return;
    }

    const loader = new GLTFLoader();
    loader.load(
      path,
      (gltf) => this._onModelLoaded(gltf),
      (progress) => {
        if (progress.total > 0) {
          const pct = Math.round((progress.loaded / progress.total) * 100);
          if (this.loadingEl) this.loadingEl.textContent = `Loading avatar... ${pct}%`;
        }
      },
      (error) => {
        console.error('Avatar load failed:', error);
        this._showFallback(`Model not found: ${path}\nPlace a .glb file at ${path}`);
      }
    );
  }

  _showFallback(msg) {
    if (this.loadingEl) {
      this.loadingEl.innerHTML = `
        <div style="opacity:0.6">
          <svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="24" cy="16" r="10"/>
            <path d="M10 44 Q10 30 24 28 Q38 30 38 44"/>
          </svg>
          <p style="margin:8px 0 0;font-size:12px;white-space:pre-line">${msg}</p>
        </div>
      `;
    }
  }

  _onModelLoaded(gltf) {
    if (this.loadingEl) {
      this.loadingEl.remove();
      this.loadingEl = null;
    }

    this.model = gltf.scene;

    this.model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;

        if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach(mat => {
            if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
              mat.envMap = this.envMap;
              mat.envMapIntensity = 0.5;
              mat.needsUpdate = true;
            }
          });
        }

        if (child.morphTargetInfluences && child.morphTargetDictionary) {
          this.morphMeshes.push(child);
        }
      }
      if (child.isBone) {
        this._mapBone(child);
      }
    });

    // Normalize scale — always scale to target height for consistent framing
    const TARGET_HEIGHT = 1.7;

    // Detect and fix upside-down model: check if hips bone is above head bone
    this.model.updateMatrixWorld(true);
    const hipsBone = this.bones.hips;
    const headBone = this.bones.head;
    if (hipsBone && headBone) {
      const hipsPos = new THREE.Vector3();
      const headPos = new THREE.Vector3();
      hipsBone.getWorldPosition(hipsPos);
      headBone.getWorldPosition(headPos);
      if (hipsPos.y > headPos.y) {
        // Model is upside down — flip 180° around X axis
        // X rotation flips Y (fixes upside-down) without mirroring left/right
        console.log('[Avatar] Detected upside-down model, applying 180° X rotation');
        this.model.rotation.x = Math.PI;
        this.model.updateMatrixWorld(true);
      }
    }

    // Detect left/right swap: check if left shoulder is on the right side
    if (this.bones.leftShoulder && this.bones.rightShoulder) {
      const lsPos = new THREE.Vector3();
      const rsPos = new THREE.Vector3();
      this.bones.leftShoulder.getWorldPosition(lsPos);
      this.bones.rightShoulder.getWorldPosition(rsPos);
      if (lsPos.x < rsPos.x) {
        // Left shoulder is to the right of right shoulder — model faces away or is mirrored
        console.log('[Avatar] Detected mirrored model, applying 180° Y rotation');
        this.model.rotation.y = Math.PI;
        this.model.updateMatrixWorld(true);
      }
    }

    const box = new THREE.Box3().setFromObject(this.model);
    const rawHeight = box.max.y - box.min.y;
    if (rawHeight > 0.01) {
      const s = TARGET_HEIGHT / rawHeight;
      this.model.scale.set(s, s, s);
      box.setFromObject(this.model);
    }
    console.log(`[Avatar] Model height: raw=${rawHeight.toFixed(2)}, scaled=${(box.max.y - box.min.y).toFixed(2)}`);

    const height = box.max.y - box.min.y;
    this.model.position.y = -box.min.y;
    this.model.position.x = -(box.max.x + box.min.x) / 2;
    this.model.position.z = -(box.max.z + box.min.z) / 2;

    // Camera: frame upper body for signing visibility
    const camY = height * 0.55;
    const camDist = height * 3.5;
    this._baseCamDist = camDist;
    this.camera.position.set(0, camY, camDist);
    this.camera.lookAt(0, camY, 0);
    this.camera.near = 0.01;
    this.camera.far = 100;
    this.camera.updateProjectionMatrix();

    if (this.controls) {
      this.controls.target.set(0, camY, 0);
      this.controls.minDistance = 0.5;
      this.controls.maxDistance = 50;
      this.controls.update();
    }

    this.scene.add(this.model);

    // Find skeleton
    this.model.traverse((child) => {
      if (child.isSkinnedMesh && child.skeleton) {
        this.skeleton = child.skeleton;
      }
    });

    // Fallback: map bones from skeleton (traverse may miss bones without isBone flag)
    if (this.skeleton) {
      for (const bone of this.skeleton.bones) {
        this._mapBone(bone);
      }
    }

    this._mapFingerBones('left');
    this._mapFingerBones('right');
    this._saveRestPose();
    this._cacheArmRestDirs();
    this._initBoneFilters();

    if (gltf.animations && gltf.animations.length > 0) {
      this.mixer = new THREE.AnimationMixer(this.model);
    }

    this.loaded = true;

    // Debug logging
    const found = Object.keys(this.bones).filter(k => this.bones[k]);
    const missing = Object.keys(this.bones).filter(k => !this.bones[k]);
    const fingers = Object.keys(this.fingerBones.left).length + Object.keys(this.fingerBones.right).length;
    const morphs = this.morphMeshes.reduce((a, m) =>
      a + Object.keys(m.morphTargetDictionary || {}).length, 0);
    console.log(`[Avatar] Loaded: ${found.length} bones, ${fingers} finger chains, ${morphs} morph targets`);
    if (missing.length) console.warn(`[Avatar] Missing bones: ${missing.join(', ')}`);

    if (this.skeleton) {
      console.log(`[Avatar] Skeleton bones: ${this.skeleton.bones.map(b => b.name).join(', ')}`);
    }

    this._idle();

    if (this._pendingPlay) {
      const { landmarks, speed, onFrame, onDone } = this._pendingPlay;
      this._pendingPlay = null;
      this.playSequence(landmarks, speed, onFrame, onDone);
    }
  }

  _mapBone(bone) {
    const name = bone.name;
    const stripped = name.replace(/_\d+$/, '');
    const lower = stripped.toLowerCase();

    for (const [key, aliases] of Object.entries(BONE_ALIASES)) {
      if (this.bones[key]) continue;
      if (aliases.some(a => name === a || name.toLowerCase() === a.toLowerCase()
          || stripped === a || lower === a.toLowerCase())) {
        this.bones[key] = bone;
        return;
      }
    }

    const BLENDER_MAP = {
      'hips': 'hips', 'spine': 'spine',
      'spine.001': 'spine', 'spine.002': 'spine1', 'spine.003': 'spine2',
      'chest': 'spine1', 'chest1': 'spine2', 'upper_chest': 'spine2',
      'neck': 'neck', 'head': 'head',
      // Blender with dots
      'shoulder.l': 'leftShoulder', 'upper_arm.l': 'leftUpperArm',
      'forearm.l': 'leftForeArm', 'hand.l': 'leftHand',
      'shoulder.r': 'rightShoulder', 'upper_arm.r': 'rightUpperArm',
      'forearm.r': 'rightForeArm', 'hand.r': 'rightHand',
      // Blender dotless (Three.js strips dots from bone names)
      'shoulderl': 'leftShoulder', 'upper_arml': 'leftUpperArm',
      'forearml': 'leftForeArm', 'handl': 'leftHand',
      'shoulderr': 'rightShoulder', 'upper_armr': 'rightUpperArm',
      'forearmr': 'rightForeArm', 'handr': 'rightHand',
      // Alternate patterns
      'upperarm.l': 'leftUpperArm', 'upperarm.r': 'rightUpperArm',
      'upper_arml': 'leftUpperArm', 'upper_armr': 'rightUpperArm',
      'lower_arm.l': 'leftForeArm', 'lower_arm.r': 'rightForeArm',
      'lowerarm.l': 'leftForeArm', 'lowerarm.r': 'rightForeArm',
      'lower_arml': 'leftForeArm', 'lower_armr': 'rightForeArm',
      'lowerarml': 'leftForeArm', 'lowerarmr': 'rightForeArm',
    };

    const mapped = BLENDER_MAP[lower];
    if (mapped && !this.bones[mapped]) {
      this.bones[mapped] = bone;
    }
  }

  _mapFingerBones(side) {
    if (!this.skeleton) return;
    const Side = side === 'left' ? 'Left' : 'Right';
    const sideChar = side === 'left' ? 'L' : 'R';
    const boneList = this.skeleton.bones;

    const BLENDER_FINGER = {
      Thumb: 'thumb', Index: 'f_index', Middle: 'f_middle',
      Ring: 'f_ring', Pinky: 'f_pinky',
    };

    for (const finger of FINGER_NAMES_MAP) {
      const chain = [];
      for (let i = 1; i <= 3; i++) {
        const bfName = BLENDER_FINGER[finger];
        const candidates = [
          `mixamorig${Side}Hand${finger}${i}`,
          `${Side}Hand${finger}${i}`,
          `J_Bip_${sideChar}_${finger}${i}`,
          `${side}Hand${finger}${i}`,
          `${Side}_Hand_${finger}_${i}`,
          `${bfName}.0${i}.${sideChar}`,         // Blender with dots: f_index.01.L
          `${bfName}0${i}${sideChar}`,            // Blender dotless: f_index01L (Three.js strips dots)
          `${bfName}.0${i}.${sideChar.toLowerCase()}`, // lowercase side
          `${bfName}0${i}${sideChar.toLowerCase()}`,   // dotless + lowercase
        ];

        const bone = boneList.find(b => {
          const s = b.name.replace(/_\d+$/, '');
          return candidates.some(c =>
            b.name === c || b.name.toLowerCase() === c.toLowerCase()
            || s === c || s.toLowerCase() === c.toLowerCase()
          );
        });

        if (bone) chain.push(bone);
      }
      if (chain.length > 0) {
        this.fingerBones[side][finger] = chain;
      }
    }
  }

  _saveRestPose() {
    for (const [key, bone] of Object.entries(this.bones)) {
      if (bone) this._restPose[key] = bone.quaternion.clone();
    }
    for (const side of ['left', 'right']) {
      for (const [finger, chain] of Object.entries(this.fingerBones[side])) {
        chain.forEach((bone, i) => {
          this._restPose[`${side}_${finger}_${i}`] = bone.quaternion.clone();
        });
      }
    }
  }

  _initBoneFilters() {
    this._boneFilters = {};
    // Arm bones — higher cutoff = less lag, higher beta = faster response to speed changes
    for (const side of ['left', 'right']) {
      for (const part of ['UpperArm', 'ForeArm', 'Hand']) {
        this._boneFilters[side + part] = new QuatOneEuroFilter(2.5, 0.04);
      }
    }
    // Finger bones — light filtering to preserve fast finger movements
    for (const side of ['left', 'right']) {
      for (const [finger, chain] of Object.entries(this.fingerBones[side])) {
        chain.forEach((_, i) => {
          this._boneFilters[`${side}_${finger}_${i}`] = new QuatOneEuroFilter(3.0, 0.05);
        });
      }
    }
    // Spine/head — moderate smoothing
    for (const k of ['spine', 'spine1', 'spine2', 'neck', 'head']) {
      this._boneFilters[k] = new QuatOneEuroFilter(1.5, 0.02);
    }
  }

  // Cache arm rest directions at load time (before any animation modifies bones)
  _cacheArmRestDirs() {
    this._armRestDir = {};
    this._armLengths = {};

    // Ensure world matrices are up to date after model transforms
    this.model.updateMatrixWorld(true);

    for (const side of ['left', 'right']) {
      const upperArm = this.bones[side + 'UpperArm'];
      const foreArm = this.bones[side + 'ForeArm'];
      const hand = this.bones[side + 'Hand'];
      if (!upperArm || !foreArm) continue;

      // Get bone world positions in rest pose
      const sPos = new THREE.Vector3();
      const ePos = new THREE.Vector3();
      const wPos = new THREE.Vector3();
      upperArm.getWorldPosition(sPos);
      foreArm.getWorldPosition(ePos);
      if (hand) hand.getWorldPosition(wPos);
      else foreArm.getWorldPosition(wPos);

      // Cache segment lengths
      this._armLengths[side] = {
        L1: sPos.distanceTo(ePos) || 0.3,
        L2: ePos.distanceTo(wPos) || 0.25,
      };

      // Cache rest direction in parent-local space
      const parentQ = new THREE.Quaternion();
      if (upperArm.parent) upperArm.parent.getWorldQuaternion(parentQ);
      const parentInv = parentQ.clone().invert();

      const armWorld = ePos.clone().sub(sPos);
      if (armWorld.length() > 0.01) {
        this._armRestDir[side] = armWorld.normalize().applyQuaternion(parentInv);
      } else {
        // Fallback: assume arms point sideways (T-pose)
        this._armRestDir[side] = new THREE.Vector3(side === 'left' ? -1 : 1, 0, 0);
      }

    }
  }

  _resetFilters() {
    for (const f of Object.values(this._boneFilters)) {
      f.reset();
    }
  }

  // Apply temporal filter to a bone's current quaternion
  _filterBone(key, bone) {
    const filter = this._boneFilters[key];
    if (!filter) return;
    const t = performance.now() / 1000;
    bone.quaternion.copy(filter.filter(bone.quaternion, t));
  }

  // ─── Arm IK with pole vector ───────────────────────────────

  _lmToWorld(lm) {
    return new THREE.Vector3(
      (0.5 - lm[0]) * 1.6,
      (0.5 - lm[1]) * 1.6 + 1.0,
      -(lm[2] ?? 0) * 0.4
    );
  }

  _solveArmIK(target, side) {
    const upperArm = this.bones[side + 'UpperArm'];
    const foreArm = this.bones[side + 'ForeArm'];
    const hand = this.bones[side + 'Hand'];
    if (!upperArm || !foreArm) return;

    // Reset upper arm to rest pose BEFORE computing world positions
    const restUpperQ = this._restPose[side + 'UpperArm'];
    if (restUpperQ) upperArm.quaternion.copy(restUpperQ);
    upperArm.updateWorldMatrix(true, false);

    const shoulderWorld = new THREE.Vector3();
    upperArm.getWorldPosition(shoulderWorld);

    // Use cached arm lengths from rest pose (avoids feedback loop)
    const cached = this._armLengths[side];
    const L1 = cached ? cached.L1 : 0.3;
    const L2 = cached ? cached.L2 : 0.25;

    const toTarget = new THREE.Vector3().subVectors(target, shoulderWorld);
    const d = Math.min(toTarget.length(), L1 + L2 - 0.01);
    if (d < 0.01) return;

    // Law of cosines for elbow angle
    let cosElbow = (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2);
    cosElbow = Math.max(-1, Math.min(1, cosElbow));
    const elbowAngle = Math.PI - Math.acos(cosElbow);

    // Parent space transform
    const parentWorld = new THREE.Quaternion();
    if (upperArm.parent) upperArm.parent.getWorldQuaternion(parentWorld);
    const parentInv = parentWorld.clone().invert();

    const dir = toTarget.normalize();
    const localDir = dir.clone().applyQuaternion(parentInv);

    // Use cached rest direction (computed once at model load, avoids feedback loop)
    const restDir = this._armRestDir[side]
      ? this._armRestDir[side].clone()
      : new THREE.Vector3(side === 'left' ? -1 : 1, 0, 0);

    // Compose delta rotation with rest quaternion (q * restQ)
    // q maps restDir→localDir, restQ maps bone-local-axis→restDir
    // Combined: bone-local-axis → localDir
    const q = new THREE.Quaternion().setFromUnitVectors(restDir, localDir);
    const restQ = restUpperQ || new THREE.Quaternion();
    upperArm.quaternion.multiplyQuaternions(q, restQ);

    // Apply temporal filtering to upper arm
    this._filterBone(side + 'UpperArm', upperArm);

    // Elbow bend
    if (foreArm) {
      foreArm.quaternion.copy(this._restPose[side + 'ForeArm'] || new THREE.Quaternion());
      foreArm.rotateX(elbowAngle);
      this._filterBone(side + 'ForeArm', foreArm);
    }
  }

  // ─── Layer C: Finger pose with DIP = 2/3 × PIP coupling ──

  _fingerPose(handLM, side) {
    if (!handLM || handLM.length < 21) return;
    const wrist = handLM[0];

    for (const [finger, mpIndices] of Object.entries(MP_FINGERS)) {
      const chain = this.fingerBones[side][finger];
      if (!chain || chain.length === 0) continue;

      const pts = mpIndices.map(i => handLM[i]);

      for (let j = 0; j < Math.min(chain.length, 3); j++) {
        const prev = j === 0 ? wrist : pts[j - 1];
        const curr = pts[j];
        const next = j < pts.length - 1 ? pts[j + 1] : pts[j];

        const v1 = [curr[0] - prev[0], curr[1] - prev[1], (curr[2] ?? 0) - (prev[2] ?? 0)];
        const v2 = [next[0] - curr[0], next[1] - curr[1], (next[2] ?? 0) - (curr[2] ?? 0)];
        const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
        const m1 = Math.hypot(v1[0], v1[1], v1[2]) || 1;
        const m2 = Math.hypot(v2[0], v2[1], v2[2]) || 1;
        let angle = Math.acos(Math.max(-1, Math.min(1, dot / (m1 * m2))));
        if (v1[0] * v2[1] - v1[1] * v2[0] < 0) angle = -angle;

        // DIP = 2/3 × PIP coupling
        if (finger !== 'Thumb' && j === 2 && chain.length >= 3) {
          const pipBone = chain[1];
          angle = pipBone.rotation.x * WBC.DIP_PIP;
        }

        const maxFlex = finger === 'Thumb' ? Math.PI * 0.5 : Math.PI * 0.55;
        angle = Math.max(-0.2, Math.min(maxFlex, angle));

        const restQ = this._restPose[`${side}_${finger}_${j}`];
        if (restQ) chain[j].quaternion.copy(restQ);
        chain[j].rotateX(angle);

        // Temporal filter
        this._filterBone(`${side}_${finger}_${j}`, chain[j]);
      }

      // Thumb abduction
      if (finger === 'Thumb' && chain.length > 0) {
        const d = [pts[0][0] - wrist[0], pts[0][1] - wrist[1]];
        const abduct = Math.atan2(d[0], -d[1]) * 0.4;
        chain[0].rotateZ(abduct * (side === 'left' ? -1 : 1));
      }
    }
  }

  // ─── Layer C: WBC Torso ───────────────────────────────────

  _wbc(lw, rw) {
    const spine = this.bones.spine1 || this.bones.spine;
    if (!spine) return;

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

    const key = spine === this.bones.spine1 ? 'spine1' : 'spine';
    const restQ = this._restPose[key];
    if (restQ) spine.quaternion.copy(restQ);
    spine.rotateY(this._yaw);
    spine.rotateX(this._pitch);
    this._filterBone(key, spine);
  }

  // ─── Enhanced FACS (morph target driver) ───────────────────

  _updateFace(faceData) {
    this.facs.update(faceData);

    // Head rotation from FACS (clamped to prevent extreme tilting)
    const headBone = this.bones.head;
    if (headBone && (this.facs.au.headYaw || this.facs.au.headPitch || this.facs.au.headRoll)) {
      const restQ = this._restPose.head;
      if (restQ) headBone.quaternion.copy(restQ);
      const MAX_HEAD = 0.35; // ~20 degrees max
      const hy = Math.max(-MAX_HEAD, Math.min(MAX_HEAD, this.facs.au.headYaw * 0.5));
      const hp = Math.max(-MAX_HEAD, Math.min(MAX_HEAD, this.facs.au.headPitch * 0.3));
      const hr = Math.max(-MAX_HEAD, Math.min(MAX_HEAD, this.facs.au.headRoll * 0.2));
      if (isFinite(hy)) headBone.rotateY(hy);
      if (isFinite(hp)) headBone.rotateX(hp);
      if (isFinite(hr)) headBone.rotateZ(hr);
      this._filterBone('head', headBone);
    }

    if (this.morphMeshes.length === 0) return;

    const au = this.facs.au;
    const morphMap = {
      // Brows
      'browInnerUp':      (au[1] * 0.6 + au[2] * 0.4),
      'browOuterUpLeft':  au[2],
      'browOuterUpRight': au[2],
      'browDownLeft':     au[4],
      'browDownRight':    au[4],
      // Eyes
      'eyeWideLeft':      au[5],
      'eyeWideRight':     au[5],
      'eyeSquintLeft':    au[6],
      'eyeSquintRight':   au[6],
      // Nose
      'noseSneerLeft':    au[9] * 0.5,
      'noseSneerRight':   au[9] * 0.5,
      // Mouth
      'jawOpen':          au[26] * 0.8 + au[25] * 0.3,
      'mouthOpen':        au[25] * 0.5 + au[26] * 0.5,
      'mouthSmileLeft':   au[12] * 0.6,
      'mouthSmileRight':  au[12] * 0.6,
      'mouthFrownLeft':   au[15] * 0.5,
      'mouthFrownRight':  au[15] * 0.5,
      'mouthStretchLeft': au[20] * 0.3,
      'mouthStretchRight':au[20] * 0.3,
      'mouthUpperUpLeft': au[10] * 0.4,
      'mouthUpperUpRight':au[10] * 0.4,
      // Lip pucker (used in some sign phonemes)
      'mouthPucker':      Math.max(0, 0.5 - au[20]) * au[25] * 0.5,
    };

    for (const mesh of this.morphMeshes) {
      const dict = mesh.morphTargetDictionary;
      for (const [name, value] of Object.entries(morphMap)) {
        if (name in dict) {
          const idx = dict[name];
          mesh.morphTargetInfluences[idx] = Math.max(0, Math.min(1, value));
        }
      }
    }
  }

  // ─── Frame rendering ─────────────────────────────────────

  render(frame) {
    if (!this.loaded) return;
    if (!frame) { this._idle(); return; }

    let lh = null, rh = null, fd = null, pose = null;
    if (frame.leftHand || frame.rightHand) {
      lh = frame.leftHand; rh = frame.rightHand; fd = frame.face; pose = frame.pose;
    } else if (Array.isArray(frame) && frame.length >= 21) {
      rh = frame;
    }

    if (rh && rh.length >= 21) {
      this._solveArmIK(this._lmToWorld(rh[0]), 'right');
      this._fingerPose(rh, 'right');
    } else this._armRest('right');

    if (lh && lh.length >= 21) {
      this._solveArmIK(this._lmToWorld(lh[0]), 'left');
      this._fingerPose(lh, 'left');
    } else this._armRest('left');

    // Update head orientation from pose landmarks
    if (pose) this.facs.updateHead(pose);
    this._updateFace(fd);
    this._wbc(lh ? lh[0] : null, rh ? rh[0] : null);
  }

  _idle() {
    if (!this.loaded) return;
    for (const [key, bone] of Object.entries(this.bones)) {
      if (bone && this._restPose[key]) {
        bone.quaternion.slerp(this._restPose[key], 0.1);
      }
    }
    for (const side of ['left', 'right']) {
      for (const [finger, chain] of Object.entries(this.fingerBones[side])) {
        chain.forEach((bone, i) => {
          const rest = this._restPose[`${side}_${finger}_${i}`];
          if (rest) bone.quaternion.slerp(rest, 0.1);
        });
      }
    }

    this.facs._decay();
    this._updateFace(null);

    this._yaw *= WBC.RETURN;
    this._pitch *= WBC.RETURN;
  }

  _armRest(side) {
    for (const part of ['UpperArm', 'ForeArm', 'Hand']) {
      const key = side + part;
      const bone = this.bones[key];
      const rest = this._restPose[key];
      if (bone && rest) bone.quaternion.slerp(rest, 0.15);
    }
    for (const [finger, chain] of Object.entries(this.fingerBones[side])) {
      chain.forEach((bone, i) => {
        const rest = this._restPose[`${side}_${finger}_${i}`];
        if (rest) bone.quaternion.slerp(rest, 0.15);
      });
    }
  }

  // ─── Debug panel ───────────────────────────────────────────

  _debugLogPlayback(rawLandmarks) {
    const raw = rawLandmarks || [];
    const boneKeys = Object.entries(this.bones).filter(([,b]) => b).map(([k]) => k);
    const pf = this.seq.length > 0 ? this.seq[0] : null;
    const fingerCounts = {};
    for (const side of ['left', 'right']) {
      fingerCounts[side] = Object.entries(this.fingerBones[side])
        .filter(([,c]) => c.length > 0).map(([f,c]) => `${f}(${c.length})`);
    }

    console.log(`[Avatar] ${this.seq.length} frames | ${boneKeys.length} bones | ` +
      `L-fingers: ${fingerCounts.left.length} | R-fingers: ${fingerCounts.right.length} | ` +
      `RH: ${pf?.rightHand ? 'yes' : 'no'} LH: ${pf?.leftHand ? 'yes' : 'no'} ` +
      `Face: ${pf?.face ? 'yes' : 'no'} Pose: ${pf?.pose ? 'yes' : 'no'}`);

    // Write to visible debug panel
    const dbgEl = document.getElementById('avatar-debug');
    if (dbgEl) {
      const lines = [
        `Frames: ${raw.length} → ${this.seq.length} parsed`,
        `Bones: ${boneKeys.length} (${boneKeys.join(', ')})`,
        `L fingers: ${fingerCounts.left.join(' ') || 'NONE'}`,
        `R fingers: ${fingerCounts.right.join(' ') || 'NONE'}`,
      ];
      if (pf) {
        lines.push(`Data: RH=${pf.rightHand ? pf.rightHand.length + 'pts' : '—'} LH=${pf.leftHand ? pf.leftHand.length + 'pts' : '—'} Face=${pf.face ? 'yes' : '—'} Pose=${pf.pose ? 'yes' : '—'}`);
      }
      if (this._armRestDir?.right) {
        const d = this._armRestDir.right;
        lines.push(`R arm rest dir: (${d.x.toFixed(2)}, ${d.y.toFixed(2)}, ${d.z.toFixed(2)})`);
      }
      if (this._armLengths?.right) {
        lines.push(`R arm lengths: L1=${this._armLengths.right.L1.toFixed(3)} L2=${this._armLengths.right.L2.toFixed(3)}`);
      }
      dbgEl.textContent = lines.join('\n');
    }
  }

  // ─── Layer B: Min-jerk interpolation ──────────────────────

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
      pose:      this._mjHand(a.pose, b.pose, t),
    };
  }

  _toFrame(fr) {
    if (!fr) return null;
    if (fr.leftHand !== undefined || fr.rightHand !== undefined)
      return { leftHand: fr.leftHand || null, rightHand: fr.rightHand || null, face: fr.face || null, pose: fr.pose || null };
    if (!Array.isArray(fr)) return null;

    if (fr.length >= 21 && Array.isArray(fr[0]) && typeof fr[0][0] === 'number') {
      return { leftHand: null, rightHand: fr, face: null, pose: null };
    }

    if (fr.length <= 2 && Array.isArray(fr[0]) && fr[0].length >= 21
        && Array.isArray(fr[0][0]) && fr[0][0].length >= 2) {
      const rightHand = fr[0];
      const leftHand = fr.length === 2 && Array.isArray(fr[1]) && fr[1].length >= 21 ? fr[1] : null;
      return { rightHand, leftHand, face: null, pose: null };
    }

    return null;
  }

  // ─── Playback API ─────────────────────────────────────────

  playSequence(landmarks, speed = 1, onFrame = null, onDone = null) {
    if (!this.loaded) {
      console.log('[Avatar] Model still loading — queuing playback');
      this._pendingPlay = { landmarks, speed, onFrame, onDone };
      return true;
    }

    this.seq = (landmarks || [])
      .map(f => this._toFrame(f))
      .filter(f => f && (f.leftHand || f.rightHand));

    this._debugLogPlayback(landmarks);

    console.log(`[Avatar] Playing ${this.seq.length} frames (from ${(landmarks || []).length} raw)`);
    if (!this.seq.length) return false;

    this.speed = speed;
    this.fi = 0; this.fAcc = 0;
    this.playing = true; this.paused = false;
    this._onFrame = onFrame; this._onDone = onDone;
    this.lastT = performance.now();
    this.facs.reset();
    this._resetFilters();

    if (this.rafId) cancelAnimationFrame(this.rafId);
    this._tick();
    return true;
  }

  _tick() {
    if (!this.playing || this.paused) return;
    const now = performance.now();
    // Clamp dt to avoid large jumps (e.g. after tab switch or GC pause)
    const dt = Math.min((now - this.lastT) / 1000, 0.05); // cap at 50ms (~20fps min)
    this.fAcc += dt * 30 * this.speed;
    this.lastT = now;

    // Advance at most 2 frames per tick to prevent skipping
    let steps = 0;
    while (this.fAcc >= 1 && this.fi < this.seq.length - 1 && steps < 2) {
      this.fi++; this.fAcc -= 1; steps++;
      if (this._onFrame) this._onFrame(this.fi, this.seq.length);
    }
    if (this.fAcc > 1) this.fAcc = 1; // clamp residual

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
    this.fi = 0; this.fAcc = 0;
    this.paused = false; this.playing = true;
    this.lastT = performance.now();
    this.facs.reset();
    this._resetFilters();
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this._tick();
  }

  setSpeed(s) { this.speed = s; }
  isPlaying() { return this.playing && !this.paused; }
  getFrameInfo() { return { current: this.fi, total: this.seq.length }; }

  setZoom(pct) {
    // pct: 10=very zoomed out, 100=default, 200=very zoomed in
    if (!this.controls) return;
    // Scale camera distance inversely with percentage
    const base = this._baseCamDist || 6;
    const dist = base * (100 / pct);
    this.camera.position.setLength(dist);
    this.controls.update();
  }

  setCharacter(id) {
    if (!AVATARS[id] || id === this.charId) return;
    this.charId = id;
    if (this.model) {
      this.scene.remove(this.model);
      this.model = null;
    }
    this.bones = {};
    this.fingerBones = { left: {}, right: {} };
    this.morphMeshes = [];
    this._restPose = {};
    this._boneFilters = {};
    this.loaded = false;
    this.skeleton = null;

    this.loadingEl = document.createElement('div');
    this.loadingEl.style.cssText = `
      position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
      color:#8888cc; font:14px/1.4 Inter,sans-serif; text-align:center;
    `;
    this.loadingEl.textContent = 'Loading avatar...';
    this.container.appendChild(this.loadingEl);

    this._loadModel(AVATARS[id].model);
  }

  getCharacters() {
    return Object.entries(AVATARS).map(([id, c]) => ({ id, name: c.name }));
  }
}
