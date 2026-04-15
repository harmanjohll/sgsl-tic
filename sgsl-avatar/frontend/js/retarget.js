/* ============================================================
   SgSL Avatar — VRM Retargeting Engine
   ============================================================
   Converts MediaPipe Holistic landmarks to VRM bone rotations.
   Uses VRM standardized bone names — no guessing.
   ============================================================ */

import * as THREE from 'three';

// ─── MediaPipe pose landmark indices ────────────────────────
const MP = {
  left_shoulder: 11, right_shoulder: 12,
  left_elbow: 13, right_elbow: 14,
  left_wrist: 15, right_wrist: 16,
  nose: 0, left_ear: 7, right_ear: 8,
};

// MediaPipe hand landmark indices
const HAND = { wrist: 0,
  thumb: [1, 2, 3, 4], index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12], ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
};

// VRM finger bone names per finger
const FINGERS = {
  thumb: {
    joints: ['ThumbMetacarpal', 'ThumbProximal', 'ThumbDistal'],
    // Fallback names for VRM 0.x
    alt: ['ThumbProximal', 'ThumbIntermediate', 'ThumbDistal'],
    mp: HAND.thumb,
  },
  index: {
    joints: ['IndexProximal', 'IndexIntermediate', 'IndexDistal'],
    mp: HAND.index,
  },
  middle: {
    joints: ['MiddleProximal', 'MiddleIntermediate', 'MiddleDistal'],
    mp: HAND.middle,
  },
  ring: {
    joints: ['RingProximal', 'RingIntermediate', 'RingDistal'],
    mp: HAND.ring,
  },
  pinky: {
    joints: ['LittleProximal', 'LittleIntermediate', 'LittleDistal'],
    mp: HAND.pinky,
  },
};

const DIP_PIP_RATIO = 2 / 3;

// ─── One-Euro Filter ────────────────────────────────────────
class OneEuroFilter {
  constructor(mc = 1.0, beta = 0.007, dc = 1.0) {
    this.mc = mc; this.beta = beta; this.dc = dc;
    this.xP = null; this.dP = null; this.tP = null;
  }
  _a(c, dt) { return 1 / (1 + 1 / (2 * Math.PI * c * dt)); }
  filter(x, t) {
    if (this.tP === null) { this.xP = x; this.dP = 0; this.tP = t; return x; }
    const dt = Math.max(t - this.tP, 1e-6);
    const dx = (x - this.xP) / dt;
    const ad = this._a(this.dc, dt);
    const dH = ad * dx + (1 - ad) * this.dP;
    const ax = this._a(this.mc + this.beta * Math.abs(dH), dt);
    const xH = ax * x + (1 - ax) * this.xP;
    this.xP = xH; this.dP = dH; this.tP = t;
    return xH;
  }
  reset() { this.xP = null; this.dP = null; this.tP = null; }
}

class QFilter {
  constructor(mc = 1.5, beta = 0.01) {
    this.f = Array.from({ length: 4 }, () => new OneEuroFilter(mc, beta));
    this._p = null;
  }
  filter(q, t) {
    if (this._p && q.dot(this._p) < 0) q = new THREE.Quaternion(-q.x, -q.y, -q.z, -q.w);
    const o = new THREE.Quaternion(
      this.f[0].filter(q.x, t), this.f[1].filter(q.y, t),
      this.f[2].filter(q.z, t), this.f[3].filter(q.w, t)).normalize();
    this._p = o.clone();
    return o;
  }
  reset() { this.f.forEach(f => f.reset()); this._p = null; }
}

// ─── Retargeting Engine ─────────────────────────────────────
export class SMPLXRetarget {
  constructor() {
    this._filters = {};
    this._time = 0;
  }

  _qf(name, mc, beta) {
    if (!this._filters[name]) this._filters[name] = new QFilter(mc, beta);
    return this._filters[name];
  }

  reset() {
    Object.values(this._filters).forEach(f => f.reset());
    this._time = 0;
  }

  applyFrame(bones, restPose, frame, calib) {
    this._time += 1 / 30;
    const { pose, leftHand: lh, rightHand: rh, face } = frame;

    // Arms: use pose landmarks if available, otherwise fall back to hand wrist position
    if (pose) {
      this._applyArm('right', bones, restPose, pose, calib);
      this._applyArm('left', bones, restPose, pose, calib);
      this._applyHead(bones, restPose, pose);
    } else {
      // Fallback: use hand wrist landmark to aim the arm
      if (rh && rh.length >= 21) this._applyArmFromWrist('right', bones, restPose, rh[0], calib);
      if (lh && lh.length >= 21) this._applyArmFromWrist('left', bones, restPose, lh[0], calib);
    }

    if (rh && rh.length >= 21) {
      this._applyFingers('right', bones, restPose, rh);
      this._applyHandOrient('right', bones, restPose, rh);
    }
    if (lh && lh.length >= 21) {
      this._applyFingers('left', bones, restPose, lh);
      this._applyHandOrient('left', bones, restPose, lh);
    }
  }

  // ─── Arm retargeting ────────────────────────────────────
  _applyArm(side, bones, restPose, pose, calib) {
    const sIdx = side === 'left' ? MP.left_shoulder : MP.right_shoulder;
    const eIdx = side === 'left' ? MP.left_elbow : MP.right_elbow;
    const wIdx = side === 'left' ? MP.left_wrist : MP.right_wrist;
    if (!pose[sIdx] || !pose[eIdx] || !pose[wIdx]) return;

    const pS = pose[sIdx], pE = pose[eIdx], pW = pose[wIdx];
    const zD = 0.3;

    // Upper arm: shoulder → elbow
    const uDir = new THREE.Vector3(
      -(pE[0] - pS[0]), -(pE[1] - pS[1]),
      -((pE[2] ?? 0) - (pS[2] ?? 0)) * zD).normalize();

    // Forearm: elbow → wrist
    const fDir = new THREE.Vector3(
      -(pW[0] - pE[0]), -(pW[1] - pE[1]),
      -((pW[2] ?? 0) - (pE[2] ?? 0)) * zD).normalize();

    if (uDir.length() < 0.001 || fDir.length() < 0.001) return;

    // VRM bone names
    const upperName = side === 'left' ? 'leftUpperArm' : 'rightUpperArm';
    const foreName = side === 'left' ? 'leftLowerArm' : 'rightLowerArm';

    this._pointBone(bones[upperName], upperName, restPose, uDir, calib, 2.5, 0.04);
    if (bones[upperName]) bones[upperName].updateWorldMatrix(true, true);
    this._pointBone(bones[foreName], foreName, restPose, fDir, calib, 2.5, 0.04);
  }

  // ─── Fallback: aim arm at wrist position (no pose data) ──
  _applyArmFromWrist(side, bones, restPose, wristLM, calib) {
    const upperName = side === 'left' ? 'leftUpperArm' : 'rightUpperArm';
    const foreName = side === 'left' ? 'leftLowerArm' : 'rightLowerArm';
    const upperBone = bones[upperName];
    const foreBone = bones[foreName];
    if (!upperBone) return;

    // Convert MediaPipe wrist landmark to world-space target position
    // MediaPipe: x=0..1 (left→right in image), y=0..1 (top→bottom), z=depth
    // The signer's right hand appears on the LEFT side of the image (mirrored)
    // World space: x=right, y=up, z=toward camera
    const target = this._lmToWorld(wristLM, side);

    // Get shoulder world position
    const restQ = restPose[upperName];
    if (restQ) upperBone.quaternion.copy(restQ);
    upperBone.updateWorldMatrix(true, false);
    const shoulderPos = new THREE.Vector3();
    upperBone.getWorldPosition(shoulderPos);

    // Direction from shoulder to target
    const toTarget = new THREE.Vector3().subVectors(target, shoulderPos);
    if (toTarget.length() < 0.01) return;
    toTarget.normalize();

    // Point upper arm toward target
    this._pointBone(upperBone, upperName, restPose, toTarget, calib, 2.0, 0.03);
    upperBone.updateWorldMatrix(true, true);

    // Point forearm also toward target
    if (foreBone) {
      this._pointBone(foreBone, foreName, restPose, toTarget, calib, 2.0, 0.03);
    }
  }

  // Convert MediaPipe normalized landmark to 3D world position
  _lmToWorld(lm, side) {
    // MediaPipe image coords: x=0(left)..1(right), y=0(top)..1(bottom)
    // Selfie/mirrored camera: signer's right hand appears at varying x positions
    // Data range observed: x=[0.26..0.82], y=[0.34..0.69]
    //
    // Map to world space centered on avatar:
    //   x: image 0.5 → world 0 (center), scale to signing space width
    //   y: image ~0.5 → chest height (~1.1m), inverted (image y goes down)
    //   z: slight forward offset so hands are in front of body
    const scale = 1.0;
    const x = (0.5 - lm[0]) * scale;
    const y = (0.5 - lm[1]) * scale + 1.1;  // chest height offset
    const z = -(lm[2] ?? 0) * 0.3 + 0.25;   // in front of body
    return new THREE.Vector3(x, y, z);
  }

  _pointBone(bone, name, restPose, worldDir, calib, fCut, fBeta) {
    if (!bone) return;
    const restQ = restPose[name];
    if (restQ) bone.quaternion.copy(restQ);
    bone.updateWorldMatrix(true, false);

    const parentWorldQ = new THREE.Quaternion();
    if (bone.parent) bone.parent.getWorldQuaternion(parentWorldQ);
    const localDir = worldDir.clone().applyQuaternion(parentWorldQ.clone().invert());

    const restDir = calib?.restDirs?.[name]?.clone()
      || new THREE.Vector3(name.includes('left') ? -1 : 1, 0, 0);

    const q = new THREE.Quaternion().setFromUnitVectors(restDir.normalize(), localDir);
    bone.quaternion.multiplyQuaternions(q, restQ || new THREE.Quaternion());

    bone.quaternion.copy(this._qf(name, fCut, fBeta).filter(bone.quaternion, this._time));
  }

  // ─── Fingers ────────────────────────────────────────────
  _applyFingers(side, bones, restPose, handLM) {
    const Side = side === 'left' ? 'left' : 'right';

    for (const [fingerName, cfg] of Object.entries(FINGERS)) {
      const mpIdx = cfg.mp;

      for (let j = 0; j < 3; j++) {
        // Try VRM 1.0 name, then VRM 0.x alt name
        let jointName = Side + cfg.joints[j];
        let bone = bones[jointName];
        if (!bone && cfg.alt) {
          jointName = Side + cfg.alt[j];
          bone = bones[jointName];
        }
        if (!bone) continue;

        const restQ = restPose[jointName];
        if (restQ) bone.quaternion.copy(restQ);

        // DIP joint: coupling constraint
        if (j === 2) {
          const pipName = Side + cfg.joints[1];
          const pipBone = bones[pipName] || (cfg.alt ? bones[Side + cfg.alt[1]] : null);
          if (pipBone) {
            const euler = new THREE.Euler().setFromQuaternion(pipBone.quaternion, 'XYZ');
            bone.rotateX(Math.abs(euler.x) * DIP_PIP_RATIO);
          }
          continue;
        }

        // Compute bend angle from landmarks
        const prevIdx = j === 0 ? 0 : mpIdx[j - 1];
        const currIdx = mpIdx[j];
        const nextIdx = mpIdx[j + 1] ?? mpIdx[j];

        const prev = handLM[prevIdx], curr = handLM[currIdx], next = handLM[nextIdx];
        if (!prev || !curr || !next) continue;

        const v1 = new THREE.Vector3(
          curr[0] - prev[0], curr[1] - prev[1], (curr[2] ?? 0) - (prev[2] ?? 0));
        const v2 = new THREE.Vector3(
          next[0] - curr[0], next[1] - curr[1], (next[2] ?? 0) - (curr[2] ?? 0));

        if (v1.length() < 1e-6 || v2.length() < 1e-6) continue;
        v1.normalize(); v2.normalize();

        let angle = Math.acos(Math.max(-1, Math.min(1, v1.dot(v2))));
        const maxFlex = fingerName === 'thumb' ? Math.PI / 2 : Math.PI * 0.55;
        angle = Math.min(angle, maxFlex);

        bone.rotateX(angle);

        // Thumb abduction
        if (fingerName === 'thumb' && j === 0) {
          const cross = new THREE.Vector3().crossVectors(v1, v2);
          bone.rotateZ((side === 'left' ? -1 : 1) * Math.atan2(cross.length(), v1.dot(v2)) * 0.3);
        }

        bone.quaternion.copy(
          this._qf(jointName, 3.0, 0.05).filter(bone.quaternion, this._time));
      }
    }
  }

  // ─── Hand orientation ───────────────────────────────────
  _applyHandOrient(side, bones, restPose, handLM) {
    const boneName = side === 'left' ? 'leftHand' : 'rightHand';
    const bone = bones[boneName];
    if (!bone) return;

    const restQ = restPose[boneName];
    const w = handLM[0], mmcp = handLM[9], imcp = handLM[5], pmcp = handLM[17];
    const zR = 0.25;

    const fingerDir = new THREE.Vector3(
      -(mmcp[0] - w[0]), -(mmcp[1] - w[1]),
      -((mmcp[2] ?? 0) - (w[2] ?? 0)) * zR).normalize();
    const palmW = new THREE.Vector3(
      -(pmcp[0] - imcp[0]), -(pmcp[1] - imcp[1]),
      -((pmcp[2] ?? 0) - (imcp[2] ?? 0)) * zR).normalize();

    const palmN = new THREE.Vector3().crossVectors(palmW, fingerDir).normalize();
    if (side === 'left') palmN.negate();

    const right = new THREE.Vector3().crossVectors(palmN, fingerDir).normalize();
    const mat = new THREE.Matrix4().makeBasis(right, palmN, fingerDir);
    const targetQ = new THREE.Quaternion().setFromRotationMatrix(mat);

    if (restQ) {
      const delta = targetQ.clone().multiply(restQ.clone().invert());
      bone.quaternion.multiplyQuaternions(delta, restQ);
    } else {
      bone.quaternion.copy(targetQ);
    }

    bone.quaternion.copy(
      this._qf(boneName, 2.0, 0.03).filter(bone.quaternion, this._time));
  }

  // ─── Head ───────────────────────────────────────────────
  _applyHead(bones, restPose, pose) {
    const bone = bones.head;
    if (!bone) return;

    const nose = pose[MP.nose], lE = pose[MP.left_ear], rE = pose[MP.right_ear];
    if (!nose || !lE || !rE) return;

    const restQ = restPose.head;
    if (restQ) bone.quaternion.copy(restQ);

    const eMX = (lE[0] + rE[0]) / 2;
    const eD = Math.abs(lE[0] - rE[0]) || 0.1;

    const yaw = ((nose[0] - eMX) / eD) * 0.6;
    const pitch = ((nose[1] - (lE[1] + rE[1]) / 2) / eD) * 0.4;
    const roll = Math.atan2(rE[1] - lE[1], rE[0] - lE[0]) * 0.5;

    const cl = (v, l) => Math.max(-l, Math.min(l, isFinite(v) ? v : 0));
    bone.rotateY(cl(yaw, 0.8));
    bone.rotateX(cl(pitch, 0.6));
    bone.rotateZ(cl(roll, 0.4));

    bone.quaternion.copy(
      this._qf('head', 1.5, 0.02).filter(bone.quaternion, this._time));
  }
}
