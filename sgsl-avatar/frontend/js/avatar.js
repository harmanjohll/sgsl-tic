/* ============================================================
   SgSL Avatar — VRM 0.x Loader
   ============================================================
   - Loads a VRM 0.x model (from VRoid Studio export).
   - Three.js 0.133 + @pixiv/three-vrm 0.6.7 (matches Kalidokit demo).
   - Sets an arms-at-sides rest pose.
   - Rebias-to-rest when retargeting has been silent for N frames
     (avoids the avatar freezing in the last tracked pose when a hand
     leaves the frame or Kalidokit skips a write).
   ============================================================ */

// THREE is global (loaded via script tag)

const REST_REBIAS_FRAMES = 15;   // animation frames of silence before drift begins
const REST_REBIAS_LERP = 0.1;

export class SMPLXAvatar {
  constructor(containerEl) {
    this.container = typeof containerEl === 'string'
      ? document.getElementById(containerEl) : containerEl;
    if (!this.container) return;

    this.vrm = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.clock = new THREE.Clock();
    this.loaded = false;
    this._statusEl = null;

    // Rest-pose rebias bookkeeping.
    this._restTargets = {};
    this._silentFrames = 0;
    this._playing = false;

    this._initScene();
    this._loadVRM();
  }

  _initScene() {
    const w = this.container.clientWidth || 400;
    const h = this.container.clientHeight || 520;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 1000);
    // z pushed from 1.8 → 2.6 (Apr 19 feedback) so Mei fits comfortably
    // in the narrower Record-tab compare pane (she's sharing horizontal
    // space with the dots canvas). OrbitControls still active — user
    // can scroll-zoom in if they want a closer look.
    this.camera.position.set(0.0, 1.35, 2.6);

    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.screenSpacePanning = true;
    this.controls.target.set(0.0, 1.2, 0.0);
    this.controls.update();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1d3e);

    const light = new THREE.DirectionalLight(0xffffff);
    light.position.set(1.0, 1.0, 1.0).normalize();
    this.scene.add(light);
    this.scene.add(new THREE.AmbientLight(0x666666));

    this._statusEl = document.createElement('div');
    this._statusEl.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#8888cc;font:14px/1.4 Inter,sans-serif;text-align:center;';
    this._statusEl.textContent = 'Loading avatar...';
    this.container.style.position = 'relative';
    this.container.appendChild(this._statusEl);

    new ResizeObserver(() => {
      const nw = this.container.clientWidth, nh = this.container.clientHeight;
      if (!nw || !nh) return;
      this.renderer.setSize(nw, nh);
      this.camera.aspect = nw / nh;
      this.camera.updateProjectionMatrix();
    }).observe(this.container);

    const animate = () => {
      requestAnimationFrame(animate);
      if (this.vrm) this.vrm.update(this.clock.getDelta());
      if (this.controls) this.controls.update();
      this._rebiasToRestIfIdle();
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  _loadVRM() {
    const loader = new THREE.GLTFLoader();
    loader.crossOrigin = 'anonymous';

    loader.load('assets/avatar.vrm',
      (gltf) => {
        THREE.VRMUtils.removeUnnecessaryJoints(gltf.scene);
        THREE.VRM.from(gltf).then((vrm) => {
          this.scene.add(vrm.scene);
          this.vrm = vrm;
          this.vrm.scene.rotation.y = Math.PI;

          this._setRestPose(vrm);
          this._snapshotRestTargets(vrm);
          this._snapshotRestWorldDirs(vrm);

          if (this._statusEl) { this._statusEl.remove(); this._statusEl = null; }
          this.loaded = true;
          console.log('[Avatar] VRM 0.x loaded');
        });
      },
      (p) => { if (p.total > 0 && this._statusEl) this._statusEl.textContent = `Loading... ${Math.round(p.loaded/p.total*100)}%`; },
      (e) => {
        console.error('[Avatar] Load failed:', e);
        if (this._statusEl) this._statusEl.textContent = 'Failed to load avatar.vrm';
      }
    );
  }

  _setRestPose(vrm) {
    const BN = THREE.VRMSchema.HumanoidBoneName;
    const rua = vrm.humanoid.getBoneNode(BN.RightUpperArm);
    const lua = vrm.humanoid.getBoneNode(BN.LeftUpperArm);
    if (rua) rua.rotation.z = -1.2;
    if (lua) lua.rotation.z = 1.2;

    const rla = vrm.humanoid.getBoneNode(BN.RightLowerArm);
    const lla = vrm.humanoid.getBoneNode(BN.LeftLowerArm);
    if (rla) rla.rotation.y = 0.15;
    if (lla) lla.rotation.y = -0.15;
  }

  _snapshotRestTargets(vrm) {
    const BN = THREE.VRMSchema.HumanoidBoneName;
    const bones = [
      BN.RightUpperArm, BN.LeftUpperArm,
      BN.RightLowerArm, BN.LeftLowerArm,
      BN.RightHand, BN.LeftHand,
      BN.Hips, BN.Spine, BN.Chest, BN.Neck,
      // Legs are never driven by retarget.js; snapshotting them here
      // lets the idle rebias gently pull them back to rest if any
      // upstream change ever writes them.
      BN.LeftUpperLeg, BN.LeftLowerLeg,
      BN.RightUpperLeg, BN.RightLowerLeg,
    ];

    // Fingers — needed by the pose editor's "Reset to rest" and by
    // the player's hard-snap-to-rest before curated playback so any
    // finger the keyframes don't animate sits at its natural pose.
    for (const side of ['Left', 'Right']) {
      for (const finger of ['Thumb', 'Index', 'Middle', 'Ring', 'Little']) {
        for (const seg of ['Proximal', 'Intermediate', 'Distal']) {
          const key = BN[`${side}${finger}${seg}`];
          if (key) bones.push(key);
        }
      }
    }

    for (const b of bones) {
      const node = vrm.humanoid.getBoneNode(b);
      if (node) this._restTargets[b] = node.quaternion.clone();
    }
  }

  /**
   * Snapshot, per driven bone:
   *   - Rest world direction: world-space vector from the bone toward
   *     its child at rest. Used as the "reference direction" the
   *     retarget layer aligns to a desired world direction each frame.
   *   - Rest world quaternion: bone.getWorldQuaternion() at rest.
   *     Needed because the retarget math W_new = Q * W_rest requires
   *     the bone's actual rest world quat — NOT parentNow * restLocal,
   *     which drifts whenever the parent has been rotated
   *     (forearm's parent = upper arm, which we just rotated).
   */
  _snapshotRestWorldDirs(vrm) {
    vrm.scene.updateMatrixWorld(true);
    const BN = THREE.VRMSchema.HumanoidBoneName;
    this._restWorldDirs = {};
    this._restWorldQuats = {};

    // Arm chain: each bone points toward its child joint at rest.
    const armChains = [
      ['RightUpperArm', 'RightLowerArm'],
      ['LeftUpperArm',  'LeftLowerArm'],
      ['RightLowerArm', 'RightHand'],
      ['LeftLowerArm',  'LeftHand'],
    ];

    // Finger chains: per-side, per-finger, for each segment that has
    // a meaningful child. Distal segments have no humanoid child bone
    // (VRM skips fingertip bones), so we approximate the fingertip
    // direction from the Distal bone's first scene-graph child node
    // (the geometric bone tip in the rig).
    const fingerChains = [];
    for (const side of ['Left', 'Right']) {
      for (const finger of ['Thumb', 'Index', 'Middle', 'Ring', 'Little']) {
        fingerChains.push([`${side}${finger}Proximal`,     `${side}${finger}Intermediate`]);
        fingerChains.push([`${side}${finger}Intermediate`, `${side}${finger}Distal`]);
      }
    }

    const chains = [...armChains, ...fingerChains];

    for (const [parentName, childName] of chains) {
      this._snapshotChain(vrm, BN, parentName, childName);
    }

    // Distal fingertip directions: no humanoid child to read, so use
    // the Distal bone's first Object3D child (the rig's tip dummy).
    // If the rig has no such child we fall back to a unit +Y vector
    // in the bone's local frame, transformed to world.
    for (const side of ['Left', 'Right']) {
      for (const finger of ['Thumb', 'Index', 'Middle', 'Ring', 'Little']) {
        const distalName = `${side}${finger}Distal`;
        this._snapshotDistalTip(vrm, BN, distalName);
      }
    }
  }

  _snapshotChain(vrm, BN, parentName, childName) {
    const p = vrm.humanoid.getBoneNode(BN[parentName]);
    const c = vrm.humanoid.getBoneNode(BN[childName]);
    if (!p || !c) return;
    const pPos = new THREE.Vector3();
    const cPos = new THREE.Vector3();
    p.getWorldPosition(pPos);
    c.getWorldPosition(cPos);
    this._restWorldDirs[parentName] = cPos.sub(pPos).normalize();

    const wq = new THREE.Quaternion();
    p.getWorldQuaternion(wq);
    this._restWorldQuats[parentName] = wq;
  }

  _snapshotDistalTip(vrm, BN, distalName) {
    const distal = vrm.humanoid.getBoneNode(BN[distalName]);
    if (!distal) return;
    const dPos = new THREE.Vector3();
    distal.getWorldPosition(dPos);

    // Try a child object first; if absent, project +Y in local space
    // (typical VRM finger-bone "forward" direction) into world.
    let tipPos = null;
    if (distal.children && distal.children.length > 0) {
      tipPos = new THREE.Vector3();
      distal.children[0].getWorldPosition(tipPos);
    }
    if (!tipPos || tipPos.distanceTo(dPos) < 1e-5) {
      const localTip = new THREE.Vector3(0, 1, 0).multiplyScalar(0.02);
      tipPos = localTip.applyMatrix4(distal.matrixWorld);
    }

    this._restWorldDirs[distalName] = tipPos.sub(dPos).normalize();
    const wq = new THREE.Quaternion();
    distal.getWorldQuaternion(wq);
    this._restWorldQuats[distalName] = wq;
  }

  /** Called by the retarget layer each frame it writes bones. */
  markActive() { this._silentFrames = 0; }

  /**
   * Actively slerp a set of bones back toward their rest snapshot.
   * Used by retarget.js when a per-arm visibility check fails — we
   * don't want those bones to freeze at a hallucinated rotation.
   */
  slerpToRest(boneNames, lerpAmount = 0.18) {
    if (!this.vrm) return;
    const BN = THREE.VRMSchema.HumanoidBoneName;
    for (const n of boneNames) {
      const key = BN[n];
      const rest = this._restTargets[key];
      if (!rest) continue;
      const node = this.vrm.humanoid.getBoneNode(key);
      if (node) node.quaternion.slerp(rest, lerpAmount);
    }
  }

  _rebiasToRestIfIdle() {
    if (!this.vrm || !this._playing) return;
    this._silentFrames++;
    if (this._silentFrames < REST_REBIAS_FRAMES) return;
    for (const [boneName, restQ] of Object.entries(this._restTargets)) {
      const node = this.vrm.humanoid.getBoneNode(boneName);
      if (node) node.quaternion.slerp(restQ, REST_REBIAS_LERP);
    }
  }

  setPlaying(on) { this._playing = !!on; this._silentFrames = 0; }
}
