/* ============================================================
   SgSL Hub — GLB Avatar Loader & Sign Language Animator
   ============================================================
   Loads a rigged GLB/GLTF humanoid model and drives it with
   MediaPipe Holistic landmarks for sign language production.

   Architecture:
     1. GLTFLoader loads .glb from assets/
     2. Auto-detects skeleton bone names (Mixamo, RPM, VRM, generic)
     3. Two-bone IK maps wrist landmarks → shoulder-elbow-wrist chain
     4. Per-finger rotation from MediaPipe 21-point hand data
     5. FACS facial expression via morph targets / blendshapes
     6. Whole-body control: torso rotation ±0.5 rad from signing space

   Biomechanical layers:
     A — DQS-ready (for SkinnedMesh models)
     B — 5th-order minimum-jerk trajectory interpolation
     C — θ_DIP = 2/3 × θ_PIP finger coupling, WBC torso
   ============================================================ */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ─── Avatar model paths ─────────────────────────────────────
// Place GLB files in frontend/assets/
// Each character maps to a model file
const AVATARS = {
  tom: {
    name: 'Tom',
    model: 'assets/tom.glb',
  },
  rajan: {
    name: 'Rajan',
    model: 'assets/rajan.glb',
  },
};

// ─── Bone name mapping ──────────────────────────────────────
// Supports Mixamo, Ready Player Me, VRM, and generic naming
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

// Finger bone name patterns
// Mixamo: LeftHandIndex1, LeftHandIndex2, LeftHandIndex3
// RPM:    leftHandIndex1, leftHandIndex2, leftHandIndex3
const FINGER_NAMES_MAP = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];
const FINGER_PREFIXES = {
  left: ['LeftHand', 'mixamorigLeftHand', 'J_Bip_L_', 'leftHand'],
  right: ['RightHand', 'mixamorigRightHand', 'J_Bip_R_', 'rightHand'],
};

// MediaPipe hand landmark indices per finger
const MP_FINGERS = {
  Thumb:  [1, 2, 3, 4],
  Index:  [5, 6, 7, 8],
  Middle: [9, 10, 11, 12],
  Ring:   [13, 14, 15, 16],
  Pinky:  [17, 18, 19, 20],
};

// Layer C constants
const WBC = {
  MAX_YAW: 0.5,
  MAX_PITCH: 0.15,
  SMOOTH: 0.08,
  RETURN: 0.92,
  DIP_PIP: 2 / 3,
};


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
// FACS — Facial Action Coding System (morph target driver)
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

    const ib = ((face[0][1] - face[12][1]) + (face[5][1] - face[16][1])) / 2;
    const ob = ((face[4][1] - face[12][1]) + (face[9][1] - face[16][1])) / 2;
    const ab = (ib + ob) / 2;
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

  reset() {
    for (const k in this.au) this.au[k] = 0;
    this.base = { brow: null, mH: null, mW: null };
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
    this.bones = {};        // normalized name → THREE.Bone
    this.fingerBones = { left: {}, right: {} }; // side → finger → [bone1, bone2, bone3]
    this.morphMeshes = [];  // meshes with morph targets
    this.mixer = null;      // animation mixer (for idle anims)
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

    // WBC
    this._yaw = 0;
    this._pitch = 0;

    // FACS
    this.facs = new FACS();

    // Rest pose quaternions (saved on load for blending back)
    this._restPose = {};

    this._initScene();
    this._loadModel(AVATARS[this.charId]?.model);
  }

  // ─── Scene ────────────────────────────────────────────────

  _initScene() {
    const w = this.container.clientWidth || 400;
    const h = this.container.clientHeight || 520;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x2a2d4e);

    this.camera = new THREE.PerspectiveCamera(30, w / h, 0.05, 50);
    this.camera.position.set(0, 1.1, 2.8);
    this.camera.lookAt(0, 0.9, 0);

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

    // OrbitControls for zoom/rotate/pan
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enableZoom = true;
    this.controls.enablePan = true;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 8;
    this.controls.target.set(0, 0.85, 0);
    this.controls.update();

    // Environment map for realistic reflections (avoids flat cut-out look)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x8899bb);
    // Add gradient lights to the env scene for soft reflections
    const envLight1 = new THREE.DirectionalLight(0xffffff, 1);
    envLight1.position.set(1, 2, 1);
    envScene.add(envLight1);
    const envLight2 = new THREE.DirectionalLight(0x4466aa, 0.5);
    envLight2.position.set(-1, 0, -1);
    envScene.add(envLight2);
    this.envMap = pmrem.fromScene(envScene, 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.envMap;

    // Lighting — 4-point studio setup for depth
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

    // Bottom fill to reduce harsh under-shadows
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

    // Render loop
    const animate = () => {
      requestAnimationFrame(animate);
      const dt = this.clock.getDelta();
      if (this.mixer) this.mixer.update(dt);
      if (this.controls) this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    animate();
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
    // Remove loading indicator
    if (this.loadingEl) {
      this.loadingEl.remove();
      this.loadingEl = null;
    }

    this.model = gltf.scene;

    // Enable shadows on all meshes, apply environment map for depth
    this.model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;

        // Apply environment map for realistic reflections (avoids flat look)
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

        // Collect morph target meshes for facial expressions
        if (child.morphTargetInfluences && child.morphTargetDictionary) {
          this.morphMeshes.push(child);
        }
      }
      if (child.isBone) {
        // Try to map this bone
        this._mapBone(child);
      }
    });

    // Position model at origin, normalize scale
    const box = new THREE.Box3().setFromObject(this.model);
    const rawHeight = box.max.y - box.min.y;

    // Normalize model to ~1.7 units tall (human height in meters)
    // This handles models exported in mm, cm, or other scales
    const TARGET_HEIGHT = 1.7;
    if (rawHeight > 10 || rawHeight < 0.1) {
      const s = TARGET_HEIGHT / rawHeight;
      this.model.scale.set(s, s, s);
      box.setFromObject(this.model); // recompute after scale
    }

    const height = box.max.y - box.min.y;
    // Center horizontally, put feet on floor
    this.model.position.y = -box.min.y;
    this.model.position.x = -(box.max.x + box.min.x) / 2;
    this.model.position.z = -(box.max.z + box.min.z) / 2;

    // Adjust camera based on model height
    const camDist = Math.max(height * 1.6, 2.0);
    this.camera.position.set(0, height * 0.55, camDist);
    this.camera.lookAt(0, height * 0.45, 0);
    this.camera.near = camDist * 0.01;
    this.camera.far = camDist * 10;
    this.camera.updateProjectionMatrix();

    // Update orbit controls to focus on model center
    if (this.controls) {
      this.controls.target.set(0, height * 0.45, 0);
      this.controls.minDistance = camDist * 0.3;
      this.controls.maxDistance = camDist * 4;
      this.controls.update();
    }

    this.scene.add(this.model);

    // Find skeleton
    this.model.traverse((child) => {
      if (child.isSkinnedMesh && child.skeleton) {
        this.skeleton = child.skeleton;
      }
    });

    // Map finger bones
    this._mapFingerBones('left');
    this._mapFingerBones('right');

    // Save rest pose
    this._saveRestPose();

    // Set up animation mixer for any embedded animations
    if (gltf.animations && gltf.animations.length > 0) {
      this.mixer = new THREE.AnimationMixer(this.model);
    }

    this.loaded = true;

    // Log bone discovery for debugging
    const found = Object.keys(this.bones).filter(k => this.bones[k]);
    const fingers = Object.keys(this.fingerBones.left).length + Object.keys(this.fingerBones.right).length;
    const morphs = this.morphMeshes.reduce((a, m) =>
      a + Object.keys(m.morphTargetDictionary || {}).length, 0);
    console.log(`[Avatar] Loaded: ${found.length} bones, ${fingers} finger chains, ${morphs} morph targets`);

    // Apply idle pose
    this._idle();
  }

  _mapBone(bone) {
    const name = bone.name;
    for (const [key, aliases] of Object.entries(BONE_ALIASES)) {
      if (this.bones[key]) continue; // already found
      if (aliases.some(a => name === a || name.toLowerCase() === a.toLowerCase())) {
        this.bones[key] = bone;
        return;
      }
    }
  }

  _mapFingerBones(side) {
    if (!this.skeleton) return;
    const Side = side === 'left' ? 'Left' : 'Right';
    const boneList = this.skeleton.bones;

    for (const finger of FINGER_NAMES_MAP) {
      const chain = [];

      // Try multiple naming conventions
      for (let i = 1; i <= 3; i++) {
        const candidates = [
          // Mixamo
          `mixamorig${Side}Hand${finger}${i}`,
          // RPM / generic
          `${Side}Hand${finger}${i}`,
          // VRM
          `J_Bip_${side === 'left' ? 'L' : 'R'}_${finger}${i}`,
          // Lowercase
          `${side}Hand${finger}${i}`,
          // With underscore
          `${Side}_Hand_${finger}_${i}`,
        ];

        const bone = boneList.find(b =>
          candidates.some(c => b.name === c || b.name.toLowerCase() === c.toLowerCase())
        );

        if (bone) chain.push(bone);
      }

      if (chain.length > 0) {
        this.fingerBones[side][finger] = chain;
      }
    }
  }

  _saveRestPose() {
    // Save quaternion rest state for all mapped bones
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

  // ─── Arm IK ───────────────────────────────────────────────

  _lmToWorld(lm) {
    return new THREE.Vector3(
      (0.5 - lm[0]) * 1.6,
      (0.5 - lm[1]) * 1.6 + 1.0, // offset up to chest height
      -(lm[2] ?? 0) * 0.4
    );
  }

  _solveArmIK(target, side) {
    const upperArm = this.bones[side + 'UpperArm'];
    const foreArm = this.bones[side + 'ForeArm'];
    const hand = this.bones[side + 'Hand'];
    if (!upperArm || !foreArm) return;

    // Get upper arm world position (shoulder joint)
    const shoulderWorld = new THREE.Vector3();
    upperArm.getWorldPosition(shoulderWorld);

    // Compute arm segment lengths from rest pose bone distances
    const elbowWorld = new THREE.Vector3();
    foreArm.getWorldPosition(elbowWorld);
    const wristWorld = new THREE.Vector3();
    if (hand) hand.getWorldPosition(wristWorld);
    else foreArm.getWorldPosition(wristWorld);

    const L1 = shoulderWorld.distanceTo(elbowWorld) || 0.3;
    const L2 = elbowWorld.distanceTo(wristWorld) || 0.25;

    // Direction from shoulder to target
    const toTarget = new THREE.Vector3().subVectors(target, shoulderWorld);
    const d = Math.min(toTarget.length(), L1 + L2 - 0.01);

    if (d < 0.01) return;

    // Elbow angle (law of cosines)
    let cosElbow = (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2);
    cosElbow = Math.max(-1, Math.min(1, cosElbow));
    const elbowAngle = Math.PI - Math.acos(cosElbow);

    // Point upper arm toward target in its local space
    const parentWorld = new THREE.Quaternion();
    if (upperArm.parent) upperArm.parent.getWorldQuaternion(parentWorld);
    const parentInv = parentWorld.clone().invert();

    const dir = toTarget.normalize();
    const localDir = dir.clone().applyQuaternion(parentInv);

    // Determine rest direction of the arm
    const restDir = new THREE.Vector3(0, -1, 0); // Most rigs: arm points down in T-pose
    // For some rigs the arm might point sideways - detect from bone position
    if (this.bones[side + 'Shoulder']) {
      const shoulderLocal = new THREE.Vector3();
      upperArm.getWorldPosition(shoulderLocal);
      const elbowLocal = new THREE.Vector3();
      foreArm.getWorldPosition(elbowLocal);
      const armDir = elbowLocal.sub(shoulderLocal).normalize();
      const localArmDir = armDir.applyQuaternion(parentInv);
      if (Math.abs(localArmDir.x) > Math.abs(localArmDir.y)) {
        // Arm extends sideways (T-pose)
        restDir.set(side === 'left' ? -1 : 1, 0, 0);
      }
    }

    const q = new THREE.Quaternion().setFromUnitVectors(restDir, localDir);
    upperArm.quaternion.copy(q);

    // Apply elbow bend
    if (foreArm) {
      foreArm.quaternion.copy(this._restPose[side + 'ForeArm'] || new THREE.Quaternion());
      foreArm.rotateX(elbowAngle);
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

        // Compute flexion angle between segments
        const v1 = [curr[0] - prev[0], curr[1] - prev[1], (curr[2] ?? 0) - (prev[2] ?? 0)];
        const v2 = [next[0] - curr[0], next[1] - curr[1], (next[2] ?? 0) - (curr[2] ?? 0)];
        const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
        const m1 = Math.hypot(v1[0], v1[1], v1[2]) || 1;
        const m2 = Math.hypot(v2[0], v2[1], v2[2]) || 1;
        let angle = Math.acos(Math.max(-1, Math.min(1, dot / (m1 * m2))));
        if (v1[0] * v2[1] - v1[1] * v2[0] < 0) angle = -angle;

        // Layer C: enforce θ_DIP = (2/3) × θ_PIP for non-thumb
        if (finger !== 'Thumb' && j === 2 && chain.length >= 3) {
          // Use PIP angle from previous joint
          const pipBone = chain[1];
          angle = pipBone.rotation.x * WBC.DIP_PIP;
        }

        // Clamp
        const maxFlex = finger === 'Thumb' ? Math.PI * 0.5 : Math.PI * 0.55;
        angle = Math.max(-0.2, Math.min(maxFlex, angle));

        // Apply to bone (reset to rest first, then rotate)
        const restQ = this._restPose[`${side}_${finger}_${j}`];
        if (restQ) chain[j].quaternion.copy(restQ);
        chain[j].rotateX(angle);
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

    // Apply relative to rest pose
    const restQ = this._restPose[spine === this.bones.spine1 ? 'spine1' : 'spine'];
    if (restQ) spine.quaternion.copy(restQ);
    spine.rotateY(this._yaw);
    spine.rotateX(this._pitch);
  }

  // ─── FACS (morph target driver) ───────────────────────────

  _updateFace(faceData) {
    this.facs.update(faceData);

    if (this.morphMeshes.length === 0) return;

    // Map AUs to common morph target names
    // RPM / ARKit blendshape names:
    const morphMap = {
      // AU1/2 brow raise
      'browInnerUp':      (this.facs.au[1] * 0.6 + this.facs.au[2] * 0.4),
      'browOuterUpLeft':  this.facs.au[2],
      'browOuterUpRight': this.facs.au[2],
      // AU4 brow lower
      'browDownLeft':     this.facs.au[4],
      'browDownRight':    this.facs.au[4],
      // AU25/26 mouth
      'jawOpen':          this.facs.au[26] * 0.8 + this.facs.au[25] * 0.3,
      'mouthOpen':        this.facs.au[25] * 0.5 + this.facs.au[26] * 0.5,
      // AU20 lip stretch
      'mouthSmileLeft':   this.facs.au[20] * 0.5,
      'mouthSmileRight':  this.facs.au[20] * 0.5,
      'mouthStretchLeft': this.facs.au[20] * 0.3,
      'mouthStretchRight':this.facs.au[20] * 0.3,
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

    let lh = null, rh = null, fd = null;
    if (frame.leftHand || frame.rightHand) {
      lh = frame.leftHand; rh = frame.rightHand; fd = frame.face;
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

    this._updateFace(fd);
    this._wbc(lh ? lh[0] : null, rh ? rh[0] : null);
  }

  _idle() {
    if (!this.loaded) return;
    // Return all bones to rest pose
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
    // Return fingers to rest
    for (const [finger, chain] of Object.entries(this.fingerBones[side])) {
      chain.forEach((bone, i) => {
        const rest = this._restPose[`${side}_${finger}_${i}`];
        if (rest) bone.quaternion.slerp(rest, 0.15);
      });
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
    };
  }

  _toFrame(fr) {
    if (!fr) return null;
    if (fr.leftHand !== undefined || fr.rightHand !== undefined)
      return { leftHand: fr.leftHand || null, rightHand: fr.rightHand || null, face: fr.face || null };
    if (Array.isArray(fr) && fr.length >= 21) {
      const lm = Array.isArray(fr[0]) && fr[0].length === 3 ? fr
               : Array.isArray(fr[0]?.[0]) && fr[0].length >= 21 ? fr[0] : fr;
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
    this.playing = true; this.paused = false;
    this._onFrame = onFrame; this._onDone = onDone;
    this.lastT = performance.now();
    this.facs.reset();

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
    this.fi = 0; this.fAcc = 0;
    this.paused = false; this.playing = true;
    this.lastT = performance.now();
    this.facs.reset();
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this._tick();
  }

  setSpeed(s) { this.speed = s; }
  isPlaying() { return this.playing && !this.paused; }
  getFrameInfo() { return { current: this.fi, total: this.seq.length }; }

  setCharacter(id) {
    if (!AVATARS[id] || id === this.charId) return;
    this.charId = id;
    // Remove current model
    if (this.model) {
      this.scene.remove(this.model);
      this.model = null;
    }
    this.bones = {};
    this.fingerBones = { left: {}, right: {} };
    this.morphMeshes = [];
    this._restPose = {};
    this.loaded = false;
    this.skeleton = null;

    // Show loading indicator
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
