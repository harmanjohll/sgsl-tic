/* ============================================================
   SgSL Avatar — Three.js Scene + VRM Avatar Loader
   ============================================================
   Loads a VRM avatar model via @pixiv/three-vrm. VRM provides:
   - Standardized humanoid skeleton with finger bones
   - Standardized facial expressions (blend shapes)
   - Anime/cartoon aesthetic
   Falls back to geometric placeholder if no VRM file found.
   ============================================================ */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

// VRM humanoid bone names (standardized)
export const VRM_BONES = {
  // Body
  hips: 'hips', spine: 'spine', chest: 'chest',
  upperChest: 'upperChest', neck: 'neck', head: 'head',
  // Arms
  leftShoulder: 'leftShoulder', leftUpperArm: 'leftUpperArm',
  leftLowerArm: 'leftLowerArm', leftHand: 'leftHand',
  rightShoulder: 'rightShoulder', rightUpperArm: 'rightUpperArm',
  rightLowerArm: 'rightLowerArm', rightHand: 'rightHand',
  // Left fingers
  leftThumbMetacarpal: 'leftThumbMetacarpal',
  leftThumbProximal: 'leftThumbProximal',
  leftThumbDistal: 'leftThumbDistal',
  leftIndexProximal: 'leftIndexProximal',
  leftIndexIntermediate: 'leftIndexIntermediate',
  leftIndexDistal: 'leftIndexDistal',
  leftMiddleProximal: 'leftMiddleProximal',
  leftMiddleIntermediate: 'leftMiddleIntermediate',
  leftMiddleDistal: 'leftMiddleDistal',
  leftRingProximal: 'leftRingProximal',
  leftRingIntermediate: 'leftRingIntermediate',
  leftRingDistal: 'leftRingDistal',
  leftLittleProximal: 'leftLittleProximal',
  leftLittleIntermediate: 'leftLittleIntermediate',
  leftLittleDistal: 'leftLittleDistal',
  // Right fingers
  rightThumbMetacarpal: 'rightThumbMetacarpal',
  rightThumbProximal: 'rightThumbProximal',
  rightThumbDistal: 'rightThumbDistal',
  rightIndexProximal: 'rightIndexProximal',
  rightIndexIntermediate: 'rightIndexIntermediate',
  rightIndexDistal: 'rightIndexDistal',
  rightMiddleProximal: 'rightMiddleProximal',
  rightMiddleIntermediate: 'rightMiddleIntermediate',
  rightMiddleDistal: 'rightMiddleDistal',
  rightRingProximal: 'rightRingProximal',
  rightRingIntermediate: 'rightRingIntermediate',
  rightRingDistal: 'rightRingDistal',
  rightLittleProximal: 'rightLittleProximal',
  rightLittleIntermediate: 'rightLittleIntermediate',
  rightLittleDistal: 'rightLittleDistal',
  // Eyes & jaw
  leftEye: 'leftEye', rightEye: 'rightEye', jaw: 'jaw',
};

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

    // VRM model
    this.vrm = null;

    // Bone references (populated after VRM load)
    this.bones = {};
    this.restPose = {};
    this.restDirs = {};

    // State
    this.loaded = false;
    this._breathPhase = 0;
    this._isPlaying = false;
    this._statusEl = null;

    this._initScene();
    this._loadVRM();
  }

  // ─── Scene setup ──────────────────────────────────────────

  _initScene() {
    const w = this.container.clientWidth || 400;
    const h = this.container.clientHeight || 520;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1d3e);

    this.camera = new THREE.PerspectiveCamera(30, w / h, 0.05, 50);
    this.camera.position.set(0, 1.2, 3.0);
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

    // Loading indicator
    this._statusEl = document.createElement('div');
    this._statusEl.style.cssText = `
      position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
      color:#8888cc; font:14px/1.4 Inter,sans-serif; text-align:center;
    `;
    this._statusEl.textContent = 'Loading avatar...';
    this.container.style.position = 'relative';
    this.container.appendChild(this._statusEl);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 1.0, 0);
    this.controls.update();

    // Lighting
    const hemi = new THREE.HemisphereLight(0xffeedd, 0x303050, 0.8);
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
      const dt = this.clock.getDelta();
      if (this.controls) this.controls.update();
      if (this.vrm) this.vrm.update(dt);
      if (this.loaded && !this._isPlaying) this._breathe(dt);
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  // ─── VRM Loading ──────────────────────────────────────────

  _loadVRM() {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load('assets/avatar.vrm',
      (gltf) => {
        const vrm = gltf.userData.vrm;
        if (!vrm) {
          this._showError('VRM data not found in file');
          return;
        }

        // Rotate model to face camera (VRM faces +Z by default)
        VRMUtils.rotateVRM0(vrm);

        this.vrm = vrm;
        this.scene.add(vrm.scene);

        // Enable shadows
        vrm.scene.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        // Map VRM bones to our bone dictionary
        this._mapBones();
        this._saveRestPose();
        this._cacheRestDirs();
        this._frameCam();

        if (this._statusEl) {
          this._statusEl.remove();
          this._statusEl = null;
        }

        this.loaded = true;
        const boneCount = Object.keys(this.bones).filter(k => this.bones[k]).length;
        console.log(`[Avatar] VRM loaded: ${boneCount} bones mapped`);
      },
      (progress) => {
        if (progress.total > 0 && this._statusEl) {
          const pct = Math.round((progress.loaded / progress.total) * 100);
          this._statusEl.textContent = `Loading avatar... ${pct}%`;
        }
      },
      (error) => {
        console.warn('[Avatar] VRM not found:', error.message);
        this._showError(
          'No avatar.vrm found.\n\n' +
          'Place a VRM file at frontend/assets/avatar.vrm\n' +
          'Free models: vroid.com/en/studio or hub.vroid.com'
        );
      }
    );
  }

  _showError(msg) {
    if (this._statusEl) {
      this._statusEl.innerHTML = `
        <div style="opacity:0.7">
          <svg viewBox="0 0 48 48" width="48" height="48" fill="none"
               stroke="currentColor" stroke-width="1.5">
            <circle cx="24" cy="16" r="10"/>
            <path d="M10 44 Q10 30 24 28 Q38 30 38 44"/>
          </svg>
          <p style="margin:8px 0 0;font-size:12px;white-space:pre-line">${msg}</p>
        </div>`;
    }
  }

  _mapBones() {
    if (!this.vrm?.humanoid) return;
    const h = this.vrm.humanoid;

    for (const boneName of Object.values(VRM_BONES)) {
      const node = h.getNormalizedBoneNode(boneName)
                || h.getRawBoneNode(boneName);
      if (node) {
        this.bones[boneName] = node;
      }
    }

    // Log finger status
    const fingerBones = Object.keys(this.bones).filter(k =>
      k.includes('Thumb') || k.includes('Index') || k.includes('Middle') ||
      k.includes('Ring') || k.includes('Little'));
    console.log(`[Avatar] Fingers: ${fingerBones.length} bones`);
    if (fingerBones.length === 0) {
      console.warn('[Avatar] No finger bones found — hand animation will be limited');
    }
  }

  _saveRestPose() {
    for (const [name, bone] of Object.entries(this.bones)) {
      if (bone) this.restPose[name] = bone.quaternion.clone();
    }
  }

  _cacheRestDirs() {
    for (const [name, bone] of Object.entries(this.bones)) {
      if (!bone || !bone.children.length) continue;
      const bPos = new THREE.Vector3();
      const cPos = new THREE.Vector3();
      bone.getWorldPosition(bPos);
      bone.children[0].getWorldPosition(cPos);
      const dir = cPos.sub(bPos);
      if (dir.length() > 0.001) {
        const parentQ = new THREE.Quaternion();
        if (bone.parent) bone.parent.getWorldQuaternion(parentQ);
        this.restDirs[name] = dir.normalize().applyQuaternion(parentQ.invert());
      }
    }
  }

  _frameCam() {
    if (!this.vrm) return;
    const box = new THREE.Box3().setFromObject(this.vrm.scene);
    const height = box.max.y - box.min.y;
    const camY = height * 0.55;
    this.camera.position.set(0, camY, height * 2.5);
    this.camera.lookAt(0, camY, 0);
    this.camera.updateProjectionMatrix();
    if (this.controls) {
      this.controls.target.set(0, camY, 0);
      this.controls.update();
    }
  }

  // ─── Arms at sides (natural rest pose) ─────────────────────

  _setArmsAtSides() {
    if (!this.vrm?.humanoid) return;
    const h = this.vrm.humanoid;

    // Rotate upper arms down from T-pose to natural sides
    // VRM T-pose: arms pointing straight out (X axis)
    // Natural: arms hanging down (rotate ~75° toward body)
    const armAngle = 1.2; // radians (~69°)

    const rua = h.getNormalizedBoneNode('rightUpperArm');
    const lua = h.getNormalizedBoneNode('leftUpperArm');
    if (rua) rua.rotation.z = armAngle;   // rotate right arm down
    if (lua) lua.rotation.z = -armAngle;  // rotate left arm down

    // Slight elbow bend for natural look
    const rla = h.getNormalizedBoneNode('rightLowerArm');
    const lla = h.getNormalizedBoneNode('leftLowerArm');
    if (rla) rla.rotation.y = -0.15;
    if (lla) lla.rotation.y = 0.15;

    console.log('[Avatar] Arms set to natural rest pose');
  }

  // ─── Idle breathing ───────────────────────────────────────

  _breathe(dt) {
    this._breathPhase += dt * 0.25 * Math.PI * 2;
    const amt = Math.sin(this._breathPhase) * 0.01;
    const chest = this.bones.chest || this.bones.spine;
    const rest = this.restPose.chest || this.restPose.spine;
    if (chest && rest) {
      chest.quaternion.copy(rest);
      chest.rotateX(amt);
    }
  }

  // ─── Expression API (VRM blend shapes) ────────────────────

  setExpression(name, value) {
    if (this.vrm?.expressionManager) {
      this.vrm.expressionManager.setValue(name, value);
    }
  }

  resetExpressions() {
    if (!this.vrm?.expressionManager) return;
    const names = ['happy', 'angry', 'sad', 'surprised', 'neutral',
                   'aa', 'ee', 'ih', 'oh', 'ou', 'blink',
                   'blinkLeft', 'blinkRight'];
    for (const n of names) {
      this.vrm.expressionManager.setValue(n, 0);
    }
  }

  // ─── Public API ───────────────────────────────────────────

  renderFrame(frame) {
    if (!this.loaded || !frame) return null;
    // Reset to rest pose
    for (const [name, bone] of Object.entries(this.bones)) {
      const rest = this.restPose[name];
      if (rest) bone.quaternion.copy(rest);
    }
    this.resetExpressions();
    return { bones: this.bones, restPose: this.restPose, restDirs: this.restDirs };
  }

  updateVisuals() {
    // VRM handles its own rendering — nothing extra needed
  }

  getCalibration() {
    return { restDirs: this.restDirs };
  }

  setPlaying(val) { this._isPlaying = val; }
}
