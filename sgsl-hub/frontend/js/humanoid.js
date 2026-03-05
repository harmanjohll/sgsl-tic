/* ============================================================
   SgSL Hub — 3D Humanoid Avatar for Sign Language Production
   ============================================================
   Biomechanically-driven stylized humanoid with:
   - H-Anim-inspired skeletal hierarchy
   - 22 DoF articulated hand rig per hand
   - Two-bone IK for arm positioning from MediaPipe landmarks
   - Facial expression from face landmark data
   - Automated torso rotation based on signing space
   - Minimum-jerk interpolation for smooth transitions
   - DIP = 2/3 x PIP biomechanical finger coupling
   ============================================================ */

import * as THREE from 'three';

// --- Character palettes ---
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

// --- Body proportions (in world units, ~1.7 total height) ---
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

// Finger base positions on the palm (relative to palm center, X-right Z-forward)
const FINGER_BASES = {
  thumb:  { x: -0.038, y: -0.01, z: 0.01 },
  index:  { x: -0.02,  y: 0.03,  z: 0.005 },
  middle: { x: -0.005, y: 0.032, z: 0.005 },
  ring:   { x: 0.01,   y: 0.03,  z: 0.005 },
  pinky:  { x: 0.025,  y: 0.025, z: 0.005 },
};

// --- Geometry helpers ---
function createCapsule(radius, length, segments = 8) {
  return new THREE.CapsuleGeometry(radius, length, segments, segments * 2);
}

function createJointSphere(radius) {
  return new THREE.SphereGeometry(radius, 12, 12);
}

// --- Material factory ---
function makeMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.55,
    metalness: opts.metalness ?? 0.05,
    flatShading: opts.flat ?? false,
    ...opts,
  });
}

// --- Main class ---
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
    this.controls = null;

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

    // Face morph state
    this.browRaise = 0;
    this.mouthOpen = 0;
    this.mouthWidth = 0;

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
      skin: makeMat(c.skin),
      skinDk: makeMat(c.skinDk),
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

    // Spine (rotates for torso coordination)
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
    head.scale.set(1, 1.12, 0.95); // Slightly elongated
    headGroup.add(head);

    // Hair (top hemisphere)
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

      // Highlight
      const hlGeo = new THREE.SphereGeometry(0.004, 6, 6);
      const hlMat = makeMat(0xFFFFFF, { roughness: 0.1, metalness: 0.0, emissive: 0xFFFFFF, emissiveIntensity: 0.5 });
      const hl = new THREE.Mesh(hlGeo, hlMat);
      hl.position.set(side * 0.004, 0.004, 0.012);
      eyeGroup.add(hl);
    }

    // Eyebrows
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

    // Mouth
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

    // Finger base group (at MCP position on palm)
    const baseGroup = new THREE.Group();
    baseGroup.position.set(base.x * mirror, -B.palmH + base.y, base.z);
    handGroup.add(baseGroup);

    let parent = baseGroup;
    const chain = [];

    for (let i = 0; i < 3; i++) {
      const segLen = segLens[i];
      const r = B.fingerR * (1 - i * 0.15); // Taper

      // Joint group (rotation point)
      const jointGroup = new THREE.Group();
      if (i > 0) jointGroup.position.y = -segLens[i - 1];
      parent.add(jointGroup);

      // Joint sphere
      const jGeo = createJointSphere(r + 0.002);
      const jMesh = new THREE.Mesh(jGeo, this.materials.skin);
      jointGroup.add(jMesh);

      // Segment capsule
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

      // Shoe
      const shoeGeo = new THREE.BoxGeometry(0.07, 0.04, 0.11, 2, 1, 2);
      this._roundBox(shoeGeo, 0.01);
      const shoe = new THREE.Mesh(shoeGeo, makeMat(0x222222));
      shoe.position.set(0, -(B.legH + B.legR + 0.02), 0.015);
      legGroup.add(shoe);
    }
  }

  // Softly round box geometry vertices
  _roundBox(geo, amount) {
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const len = v.length();
      if (len > 0) {
        v.normalize().multiplyScalar(len + amount * (1 - Math.abs(v.y) / (len || 1)) * 0.3);
        // Gentle rounding on edges
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

  // --- IK and Pose Application ---

  // Map a MediaPipe wrist position (normalized 0-1) to world coordinates
  _landmarkToWorld(lm) {
    return new THREE.Vector3(
      (0.5 - lm[0]) * 1.2,   // Mirror X, scale
      (0.5 - lm[1]) * 1.2,   // Flip Y
      -(lm[2] ?? 0) * 0.3
    );
  }

  // Two-bone IK solver for arm chain
  _solveArmIK(targetWorld, side) {
    const sign = side === 'left' ? -1 : 1;
    const shoulderGroup = this.groups[side + 'Shoulder'];
    const upperArmGroup = this.groups[side + 'UpperArm'];
    const elbowGroup = this.groups[side + 'Elbow'];
    const foreArmGroup = this.groups[side + 'ForeArm'];

    // Get shoulder world position
    const shoulderWorld = new THREE.Vector3();
    shoulderGroup.getWorldPosition(shoulderWorld);

    // Direction from shoulder to target
    const toTarget = new THREE.Vector3().subVectors(targetWorld, shoulderWorld);
    const dist = toTarget.length();

    const L1 = B.upperArmLen + B.upperArmR * 2;
    const L2 = B.foreArmLen + B.foreArmR * 2;
    const maxReach = L1 + L2 - 0.01;

    // Clamp distance
    const d = Math.min(dist, maxReach);
    const dir = toTarget.normalize();

    // Elbow angle via law of cosines
    let cosElbow = (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2);
    cosElbow = Math.max(-1, Math.min(1, cosElbow));
    const elbowAngle = Math.PI - Math.acos(cosElbow);

    // Shoulder angle
    let cosShoulder = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d);
    cosShoulder = Math.max(-1, Math.min(1, cosShoulder));
    const shoulderOffset = Math.acos(cosShoulder);

    // Convert direction to euler angles for the upper arm
    // We need to point the upper arm toward the target, offset by shoulderOffset
    const targetLocal = shoulderGroup.worldToLocal(targetWorld.clone());
    const armDir = targetLocal.normalize();

    // Compute rotation to point -Y axis toward target
    const restDir = new THREE.Vector3(0, -1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(restDir, armDir);

    upperArmGroup.quaternion.copy(quat);

    // Elbow bend (around local X axis)
    foreArmGroup.rotation.set(0, 0, 0);
    foreArmGroup.rotation.x = elbowAngle;
  }

  // Set finger joint rotations from MediaPipe landmarks
  _setFingerPose(handLandmarks, side) {
    if (!handLandmarks || handLandmarks.length < 21) return;

    const wrist = handLandmarks[0];

    for (const fname of FINGER_NAMES) {
      const chain = this.fingerChains[side][fname];
      if (!chain) continue;

      const indices = FINGER_LANDMARKS[fname];
      const pts = indices.map(i => handLandmarks[i]);

      // Compute angles between consecutive segments
      for (let j = 0; j < 3; j++) {
        const prev = j === 0 ? wrist : pts[j - 1];
        const curr = pts[j];
        const next = pts[j + 1] || pts[j]; // TIP doesn't have next

        // Direction vectors
        const v1 = [curr[0] - prev[0], curr[1] - prev[1], curr[2] - (prev[2] ?? 0)];
        const v2 = j < 2
          ? [next[0] - curr[0], next[1] - curr[1], (next[2] ?? 0) - (curr[2] ?? 0)]
          : v1;

        // Angle between segments (flexion)
        const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
        const m1 = Math.sqrt(v1[0] * v1[0] + v1[1] * v1[1] + v1[2] * v1[2]) || 1;
        const m2 = Math.sqrt(v2[0] * v2[0] + v2[1] * v2[1] + v2[2] * v2[2]) || 1;
        let angle = Math.acos(Math.max(-1, Math.min(1, dot / (m1 * m2))));

        // Cross product for sign
        const cross = v1[0] * v2[1] - v1[1] * v2[0];
        if (cross < 0) angle = -angle;

        // Apply DIP = 2/3 PIP constraint for non-thumb fingers
        if (fname !== 'thumb' && j === 2 && chain.length >= 3) {
          const pipAngle = chain[1].rotation.x;
          angle = pipAngle * (2 / 3);
        }

        // Clamp to biomechanical range
        const maxFlex = fname === 'thumb' ? Math.PI * 0.5 : Math.PI * 0.55;
        angle = Math.max(-0.2, Math.min(maxFlex, angle));

        chain[j].rotation.x = angle;
      }

      // Thumb abduction (spread) from lateral movement
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

  // Update facial expression from face landmark data
  _updateFace(faceData) {
    if (!faceData || faceData.length < 32) {
      // Reset to neutral
      this._lerpFace(0, 0, 0.035);
      return;
    }

    // Brow raise: avg brow Y relative to eye Y
    const lBrowY = (faceData[0][1] + faceData[1][1] + faceData[2][1] + faceData[3][1] + faceData[4][1]) / 5;
    const lEyeTop = faceData[12][1];
    const rBrowY = (faceData[5][1] + faceData[6][1] + faceData[7][1] + faceData[8][1] + faceData[9][1]) / 5;
    const rEyeTop = faceData[16][1];
    const browRaise = ((lBrowY - lEyeTop) + (rBrowY - rEyeTop)) / 2;
    const browOffset = Math.max(-0.015, Math.min(0.008, browRaise * -0.15));

    // Mouth opening
    const mouthTop = faceData[25];
    const mouthBottom = faceData[26];
    const mouthOpen = Math.abs(mouthTop[1] - mouthBottom[1]) * 0.8;
    const mouthW = Math.abs(faceData[21][0] - faceData[22][0]) * 0.6;

    this._lerpFace(browOffset, mouthOpen, mouthW);
  }

  _lerpFace(browTarget, mouthOpenTarget, mouthWidthTarget) {
    const t = 0.15; // Smoothing factor
    this.browRaise += (browTarget - this.browRaise) * t;
    this.mouthOpen += (mouthOpenTarget - this.mouthOpen) * t;
    this.mouthWidth += (mouthWidthTarget - this.mouthWidth) * t;

    // Apply brow position
    if (this.groups.browL) {
      this.groups.browL.position.y = 0.04 + this.browRaise;
    }
    if (this.groups.browR) {
      this.groups.browR.position.y = 0.04 + this.browRaise;
    }

    // Apply mouth
    if (this.groups.upperLip && this.groups.lowerLip) {
      const openAmt = Math.min(0.015, this.mouthOpen * 0.08);
      this.groups.upperLip.position.y = 0.003 + openAmt * 0.3;
      this.groups.lowerLip.position.y = -0.003 - openAmt;
      this.groups.upperLip.scale.x = 1 + this.mouthWidth * 0.5;
      this.groups.lowerLip.scale.x = 1 + this.mouthWidth * 0.5;
    }
  }

  // Automated torso rotation based on hand positions in signing space
  _updateTorso(leftWrist, rightWrist) {
    if (!this.groups.spine) return;

    let targetRotY = 0;
    if (leftWrist && rightWrist) {
      // Both hands: rotate toward the average horizontal position
      const avgX = ((0.5 - leftWrist[0]) + (0.5 - rightWrist[0])) / 2;
      targetRotY = avgX * 0.3; // Subtle rotation
    } else if (leftWrist) {
      targetRotY = (0.5 - leftWrist[0]) * 0.2;
    } else if (rightWrist) {
      targetRotY = (0.5 - rightWrist[0]) * 0.2;
    }

    // Smooth torso rotation
    const curr = this.groups.spine.rotation.y;
    this.groups.spine.rotation.y += (targetRotY - curr) * 0.1;
  }

  // --- Frame rendering ---
  render(frame) {
    if (!frame) {
      // Idle pose: arms at sides
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

    // Solve arm IK from wrist positions
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

    // Face expressions
    this._updateFace(faceData);

    // Torso rotation based on hand positions
    const lw = leftHand ? leftHand[0] : null;
    const rw = rightHand ? rightHand[0] : null;
    this._updateTorso(lw, rw);
  }

  _setIdlePose() {
    for (const side of ['left', 'right']) {
      this._setArmIdle(side);
      // Reset fingers to relaxed curl
      for (const fname of FINGER_NAMES) {
        const chain = this.fingerChains[side][fname];
        if (!chain) continue;
        const curl = fname === 'thumb' ? 0.15 : 0.3;
        for (let i = 0; i < chain.length; i++) {
          chain[i].rotation.x = curl * (i + 1) * 0.5;
          chain[i].rotation.z = 0;
        }
      }
    }
    this._lerpFace(0, 0, 0.035);
    if (this.groups.spine) {
      this.groups.spine.rotation.y *= 0.9; // Slowly return to neutral
    }
  }

  _setArmIdle(side) {
    const sign = side === 'left' ? -1 : 1;
    const ua = this.groups[side + 'UpperArm'];
    const fa = this.groups[side + 'ForeArm'];
    if (ua) {
      // Arms slightly out and forward
      ua.quaternion.setFromEuler(new THREE.Euler(0.1, 0, sign * 0.15));
    }
    if (fa) {
      fa.rotation.set(0.35, 0, 0); // Slight elbow bend
    }
  }

  // --- Minimum-jerk trajectory ---
  _minimumJerk(t) {
    return 10 * t * t * t - 15 * t * t * t * t + 6 * t * t * t * t * t;
  }

  // Interpolate hand landmarks
  _lerpHand(a, b, t) {
    if (!a) return b;
    if (!b) return a;
    return b.map((lm, i) => [
      a[i][0] * (1 - t) + lm[0] * t,
      a[i][1] * (1 - t) + lm[1] * t,
      (a[i][2] ?? 0) * (1 - t) + (lm[2] ?? 0) * t,
    ]);
  }

  _lerpFrame(a, b, t) {
    if (!a) return b;
    return {
      leftHand: this._lerpHand(a.leftHand, b.leftHand, t),
      rightHand: this._lerpHand(a.rightHand, b.rightHand, t),
      face: this._lerpHand(a.face, b.face, t),
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

  // --- Playback API ---
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

    const t = Math.min(this.fAcc, 1);
    const eased = this._minimumJerk(t);
    const blended = this._lerpFrame(this.seq[this.fi], this.seq[this.fi + 1], eased);
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
