/* ============================================================
   SgSL Avatar — Three.js Scene + SMPL-X Skeleton
   ============================================================
   Creates a 3D scene with either:
   1. A geometric placeholder humanoid (capsules/spheres) using
      the exact SMPL-X 55-joint skeleton — works immediately
   2. A full SMPL-X GLB mesh (when available)
   ============================================================ */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SMPLX_JOINTS } from './retarget.js';

// SMPL-X skeleton: parent index for each joint
const SMPLX_PARENT = [
  -1,  // 0: pelvis (root)
   0,  // 1: left_hip
   0,  // 2: right_hip
   0,  // 3: spine1
   1,  // 4: left_knee
   2,  // 5: right_knee
   3,  // 6: spine2
   4,  // 7: left_ankle
   5,  // 8: right_ankle
   6,  // 9: spine3
   7,  // 10: left_foot
   8,  // 11: right_foot
  9,   // 12: neck
  9,   // 13: left_collar
  9,   // 14: right_collar
  12,  // 15: head
  13,  // 16: left_shoulder
  14,  // 17: right_shoulder
  16,  // 18: left_elbow
  17,  // 19: right_elbow
  18,  // 20: left_wrist
  19,  // 21: right_wrist
  // Left hand (22-36), all parented to left_wrist (20)
  20, 22, 23,  // index 1,2,3
  20, 25, 26,  // middle 1,2,3
  20, 28, 29,  // pinky 1,2,3
  20, 31, 32,  // ring 1,2,3
  20, 34, 35,  // thumb 1,2,3
  // Right hand (37-51), all parented to right_wrist (21)
  21, 37, 38,  // index 1,2,3
  21, 40, 41,  // middle 1,2,3
  21, 43, 44,  // pinky 1,2,3
  21, 46, 47,  // ring 1,2,3
  21, 49, 50,  // thumb 1,2,3
  // Face
  15, 15, 15,  // jaw, left_eye, right_eye → head
];

// SMPL-X T-pose joint positions (approximate, in meters)
// Based on a ~1.7m tall neutral body
const SMPLX_REST_POS = [
  [0, 0.93, 0],       // 0: pelvis
  [0.08, 0.90, 0],    // 1: left_hip
  [-0.08, 0.90, 0],   // 2: right_hip
  [0, 1.05, 0],       // 3: spine1
  [0.08, 0.50, 0],    // 4: left_knee
  [-0.08, 0.50, 0],   // 5: right_knee
  [0, 1.18, 0],       // 6: spine2
  [0.08, 0.08, 0],    // 7: left_ankle
  [-0.08, 0.08, 0],   // 8: right_ankle
  [0, 1.32, 0],       // 9: spine3
  [0.08, 0.02, 0],    // 10: left_foot
  [-0.08, 0.02, 0],   // 11: right_foot
  [0, 1.42, 0],       // 12: neck
  [0.06, 1.38, 0],    // 13: left_collar
  [-0.06, 1.38, 0],   // 14: right_collar
  [0, 1.52, 0],       // 15: head
  [0.18, 1.38, 0],    // 16: left_shoulder
  [-0.18, 1.38, 0],   // 17: right_shoulder
  [0.44, 1.38, 0],    // 18: left_elbow
  [-0.44, 1.38, 0],   // 19: right_elbow
  [0.68, 1.38, 0],    // 20: left_wrist
  [-0.68, 1.38, 0],   // 21: right_wrist
  // Left hand fingers (spread from left wrist)
  [0.72, 1.39, -0.01],  // 22: left_index1
  [0.76, 1.39, -0.01],  // 23: left_index2
  [0.79, 1.39, -0.01],  // 24: left_index3
  [0.72, 1.38, 0],      // 25: left_middle1
  [0.76, 1.38, 0],      // 26: left_middle2
  [0.79, 1.38, 0],      // 27: left_middle3
  [0.72, 1.36, 0.02],   // 28: left_pinky1
  [0.75, 1.36, 0.02],   // 29: left_pinky2
  [0.77, 1.36, 0.02],   // 30: left_pinky3
  [0.72, 1.37, 0.01],   // 31: left_ring1
  [0.76, 1.37, 0.01],   // 32: left_ring2
  [0.79, 1.37, 0.01],   // 33: left_ring3
  [0.71, 1.40, -0.02],  // 34: left_thumb1
  [0.74, 1.41, -0.03],  // 35: left_thumb2
  [0.76, 1.42, -0.04],  // 36: left_thumb3
  // Right hand fingers (mirror of left)
  [-0.72, 1.39, -0.01], // 37: right_index1
  [-0.76, 1.39, -0.01], // 38: right_index2
  [-0.79, 1.39, -0.01], // 39: right_index3
  [-0.72, 1.38, 0],     // 40: right_middle1
  [-0.76, 1.38, 0],     // 41: right_middle2
  [-0.79, 1.38, 0],     // 42: right_middle3
  [-0.72, 1.36, 0.02],  // 43: right_pinky1
  [-0.75, 1.36, 0.02],  // 44: right_pinky2
  [-0.77, 1.36, 0.02],  // 45: right_pinky3
  [-0.72, 1.37, 0.01],  // 46: right_ring1
  [-0.76, 1.37, 0.01],  // 47: right_ring2
  [-0.79, 1.37, 0.01],  // 48: right_ring3
  [-0.71, 1.40, -0.02], // 49: right_thumb1
  [-0.74, 1.41, -0.03], // 50: right_thumb2
  [-0.76, 1.42, -0.04], // 51: right_thumb3
  // Face
  [0, 1.46, 0.03],      // 52: jaw
  [0.03, 1.54, 0.06],   // 53: left_eye
  [-0.03, 1.54, 0.06],  // 54: right_eye
];

// Joint names (reverse map from SMPLX_JOINTS)
const JOINT_NAMES = Object.entries(SMPLX_JOINTS)
  .sort((a, b) => a[1] - b[1])
  .map(e => e[0]);

export class SMPLXAvatar {
  constructor(containerEl) {
    this.container = typeof containerEl === 'string'
      ? document.getElementById(containerEl) : containerEl;
    if (!this.container) return;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.clock = new THREE.Clock();

    // Skeleton
    this.bones = {};       // name → THREE.Bone
    this.restPose = {};    // name → THREE.Quaternion (rest)
    this.restDirs = {};    // name → THREE.Vector3 (bone direction at rest)
    this.rootBone = null;

    // Placeholder visuals
    this._jointMeshes = {};
    this._boneMeshes = [];
    this._placeholderGroup = null;

    // GLB model (when loaded)
    this._glbModel = null;

    // State
    this.loaded = false;
    this._breathPhase = 0;

    this._initScene();
    this._buildSkeleton();
    this._tryLoadGLB();
  }

  // ─── Scene setup ──────────────────────────────────────────

  _initScene() {
    const w = this.container.clientWidth || 400;
    const h = this.container.clientHeight || 520;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1d3e);

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.05, 50);
    this.camera.position.set(0, 1.2, 3.5);
    this.camera.lookAt(0, 1.0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 1.0, 0);
    this.controls.update();

    // Lighting
    const hemi = new THREE.HemisphereLight(0xffeedd, 0x303050, 0.6);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff8f0, 1.6);
    key.position.set(3, 4, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x8888ff, 0.5);
    rim.position.set(-3, 2, -4);
    this.scene.add(rim);

    const fill = new THREE.DirectionalLight(0xffd0a0, 0.3);
    fill.position.set(-2, 0, 3);
    this.scene.add(fill);

    // Floor
    const floorGeo = new THREE.CircleGeometry(1.5, 48);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x15173a, roughness: 0.9 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Resize
    new ResizeObserver(() => {
      const nw = this.container.clientWidth;
      const nh = this.container.clientHeight;
      if (!nw || !nh) return;
      this.renderer.setSize(nw, nh);
      this.camera.aspect = nw / nh;
      this.camera.updateProjectionMatrix();
    }).observe(this.container);

    // Render loop
    const animate = () => {
      requestAnimationFrame(animate);
      if (this.controls) this.controls.update();
      if (this.loaded && !this._isPlaying) this._breathe(this.clock.getDelta());
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  // ─── Build SMPL-X skeleton ────────────────────────────────

  _buildSkeleton() {
    const boneObjects = [];

    // Create bones
    for (let i = 0; i < JOINT_NAMES.length; i++) {
      const bone = new THREE.Bone();
      bone.name = JOINT_NAMES[i];
      boneObjects.push(bone);
    }

    // Set up parent-child hierarchy
    for (let i = 0; i < JOINT_NAMES.length; i++) {
      const parentIdx = SMPLX_PARENT[i];
      if (parentIdx >= 0) {
        boneObjects[parentIdx].add(boneObjects[i]);
      }
    }

    // Set bone positions (relative to parent)
    for (let i = 0; i < JOINT_NAMES.length; i++) {
      const pos = SMPLX_REST_POS[i];
      const parentIdx = SMPLX_PARENT[i];
      if (parentIdx >= 0) {
        const pPos = SMPLX_REST_POS[parentIdx];
        boneObjects[i].position.set(
          pos[0] - pPos[0], pos[1] - pPos[1], pos[2] - pPos[2]);
      } else {
        boneObjects[i].position.set(pos[0], pos[1], pos[2]);
      }
    }

    // Store references
    for (let i = 0; i < JOINT_NAMES.length; i++) {
      this.bones[JOINT_NAMES[i]] = boneObjects[i];
    }

    this.rootBone = boneObjects[0];
    this.scene.add(this.rootBone);

    // Update world matrices and cache rest pose
    this.rootBone.updateWorldMatrix(true, true);
    this._saveRestPose();
    this._cacheRestDirs();

    // Build visual placeholder
    this._buildPlaceholder();

    this.loaded = true;
    console.log(`[Avatar] Skeleton built: ${JOINT_NAMES.length} joints`);
  }

  _saveRestPose() {
    for (const [name, bone] of Object.entries(this.bones)) {
      this.restPose[name] = bone.quaternion.clone();
    }
  }

  _cacheRestDirs() {
    this.rootBone.updateWorldMatrix(true, true);
    for (const [name, bone] of Object.entries(this.bones)) {
      if (!bone.children.length) continue;
      // Rest direction = toward first child
      const bonePos = new THREE.Vector3();
      const childPos = new THREE.Vector3();
      bone.getWorldPosition(bonePos);
      bone.children[0].getWorldPosition(childPos);
      const dir = childPos.sub(bonePos);
      if (dir.length() > 0.001) {
        // Convert to parent-local space
        const parentQ = new THREE.Quaternion();
        if (bone.parent) bone.parent.getWorldQuaternion(parentQ);
        this.restDirs[name] = dir.normalize().applyQuaternion(parentQ.invert());
      }
    }
  }

  // ─── Geometric placeholder ────────────────────────────────

  _buildPlaceholder() {
    this._placeholderGroup = new THREE.Group();
    this._placeholderGroup.name = 'placeholder';

    const jointMat = new THREE.MeshStandardMaterial({
      color: 0x6688cc, roughness: 0.4, metalness: 0.2 });
    const boneMat = new THREE.MeshStandardMaterial({
      color: 0x4466aa, roughness: 0.5, metalness: 0.1 });
    const headMat = new THREE.MeshStandardMaterial({
      color: 0x7799dd, roughness: 0.3, metalness: 0.2 });

    // Joint spheres
    for (let i = 0; i < JOINT_NAMES.length; i++) {
      const name = JOINT_NAMES[i];
      const isHand = i >= 22 && i <= 51;
      const isHead = name === 'head';
      const isEye = name.includes('eye');

      let radius = isHand ? 0.008 : (isHead ? 0.10 : (isEye ? 0.015 : 0.025));
      const geo = isHead
        ? new THREE.SphereGeometry(radius, 24, 16)
        : new THREE.SphereGeometry(radius, 8, 6);
      const mat = isHead ? headMat : jointMat;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;

      this._jointMeshes[name] = mesh;
      this._placeholderGroup.add(mesh);
    }

    // Bone capsules (connect parent → child)
    for (let i = 1; i < JOINT_NAMES.length; i++) {
      const parentIdx = SMPLX_PARENT[i];
      if (parentIdx < 0) continue;

      const pPos = SMPLX_REST_POS[parentIdx];
      const cPos = SMPLX_REST_POS[i];
      const isHand = i >= 22 && i <= 51;

      const start = new THREE.Vector3(...pPos);
      const end = new THREE.Vector3(...cPos);
      const len = start.distanceTo(end);
      if (len < 0.001) continue;

      const radius = isHand ? 0.004 : 0.012;
      const geo = new THREE.CylinderGeometry(radius, radius, len, 6);
      geo.translate(0, len / 2, 0);
      geo.rotateX(Math.PI / 2);

      const mesh = new THREE.Mesh(geo, boneMat);
      mesh.castShadow = true;
      mesh._parentIdx = parentIdx;
      mesh._childIdx = i;
      this._boneMeshes.push(mesh);
      this._placeholderGroup.add(mesh);
    }

    this._updatePlaceholder();
    this.scene.add(this._placeholderGroup);
  }

  _updatePlaceholder() {
    if (!this._placeholderGroup) return;
    this.rootBone.updateWorldMatrix(true, true);

    // Update joint positions
    for (const [name, mesh] of Object.entries(this._jointMeshes)) {
      const bone = this.bones[name];
      if (bone) {
        const pos = new THREE.Vector3();
        bone.getWorldPosition(pos);
        mesh.position.copy(pos);
      }
    }

    // Update bone capsules
    for (const mesh of this._boneMeshes) {
      const parentBone = Object.values(this.bones)[mesh._parentIdx];
      const childBone = Object.values(this.bones)[mesh._childIdx];
      if (!parentBone || !childBone) continue;

      const start = new THREE.Vector3();
      const end = new THREE.Vector3();
      parentBone.getWorldPosition(start);
      childBone.getWorldPosition(end);

      mesh.position.copy(start);
      mesh.lookAt(end);
    }
  }

  // ─── GLB loading (upgrade path) ───────────────────────────

  _tryLoadGLB() {
    const loader = new GLTFLoader();
    loader.load('assets/smplx_neutral.glb',
      (gltf) => {
        console.log('[Avatar] SMPL-X GLB loaded — swapping placeholder');
        this._glbModel = gltf.scene;
        // Hide placeholder
        if (this._placeholderGroup) this._placeholderGroup.visible = false;
        // Add model
        this.scene.add(this._glbModel);
        // Remap bones from GLB skeleton to our bone references
        this._remapGLBBones(gltf);
      },
      undefined,
      () => {
        console.log('[Avatar] No SMPL-X GLB found — using geometric placeholder');
      }
    );
  }

  _remapGLBBones(gltf) {
    // Walk the GLB skeleton and match bone names to SMPL-X joints
    this._glbModel.traverse((child) => {
      if (child.isBone && child.name in SMPLX_JOINTS) {
        this.bones[child.name] = child;
      }
    });
    this._saveRestPose();
    this._cacheRestDirs();
  }

  // ─── Idle breathing ───────────────────────────────────────

  _breathe(dt) {
    this._breathPhase += dt * 0.25 * Math.PI * 2;
    const amt = Math.sin(this._breathPhase) * 0.003;

    const spine2 = this.bones.spine2;
    const rest = this.restPose.spine2;
    if (spine2 && rest) {
      spine2.quaternion.copy(rest);
      spine2.rotateX(amt);
    }

    this._updatePlaceholder();
  }

  // ─── Public API ───────────────────────────────────────────

  /** Render a single frame of landmarks. Called by player.js. */
  renderFrame(frame) {
    if (!this.loaded || !frame) return;

    // Reset to rest pose
    for (const [name, bone] of Object.entries(this.bones)) {
      const rest = this.restPose[name];
      if (rest) bone.quaternion.copy(rest);
    }

    return { bones: this.bones, restPose: this.restPose, restDirs: this.restDirs };
  }

  /** Update placeholder visuals after retargeting. */
  updateVisuals() {
    this._updatePlaceholder();
  }

  /** Get calibration data for the retargeting engine. */
  getCalibration() {
    return { restDirs: this.restDirs };
  }
}
