/* ============================================================
   SgSL Avatar — SMPL-X Retargeting Engine
   ============================================================
   Converts MediaPipe Holistic landmarks to SMPL-X joint rotations.

   Key difference from old system: every bone name and axis is
   HARDCODED to match the SMPL-X skeleton. No auto-detection,
   no guessing, no ambiguity.

   SMPL-X joint hierarchy (55 joints):
     Body: pelvis, left/right_hip/knee/ankle/foot, spine1/2/3,
           neck, head, left/right_collar/shoulder/elbow/wrist
     Hands (15 per hand): index1/2/3, middle1/2/3, pinky1/2/3,
           ring1/2/3, thumb1/2/3
     Face: jaw, left_eye, right_eye
   ============================================================ */

import * as THREE from 'three';

// ─── SMPL-X Joint Indices ───────────────────────────────────
// These match the official SMPL-X model specification exactly.
export const SMPLX_JOINTS = {
  pelvis: 0,
  left_hip: 1, right_hip: 2, spine1: 3,
  left_knee: 4, right_knee: 5, spine2: 6,
  left_ankle: 7, right_ankle: 8, spine3: 9,
  left_foot: 10, right_foot: 11, neck: 12,
  left_collar: 13, right_collar: 14, head: 15,
  left_shoulder: 16, right_shoulder: 17,
  left_elbow: 18, right_elbow: 19,
  left_wrist: 20, right_wrist: 21,
  // Left hand (indices 22-36)
  left_index1: 22, left_index2: 23, left_index3: 24,
  left_middle1: 25, left_middle2: 26, left_middle3: 27,
  left_pinky1: 28, left_pinky2: 29, left_pinky3: 30,
  left_ring1: 31, left_ring2: 32, left_ring3: 33,
  left_thumb1: 34, left_thumb2: 35, left_thumb3: 36,
  // Right hand (indices 37-51)
  right_index1: 37, right_index2: 38, right_index3: 39,
  right_middle1: 40, right_middle2: 41, right_middle3: 42,
  right_pinky1: 43, right_pinky2: 44, right_pinky3: 45,
  right_ring1: 46, right_ring2: 47, right_ring3: 48,
  right_thumb1: 49, right_thumb2: 50, right_thumb3: 51,
  // Face
  jaw: 52, left_eye: 53, right_eye: 54,
};

// ─── MediaPipe landmark indices ─────────────────────────────
const MP_POSE = {
  left_shoulder: 11, right_shoulder: 12,
  left_elbow: 13, right_elbow: 14,
  left_wrist: 15, right_wrist: 16,
  nose: 0, left_ear: 7, right_ear: 8,
};

// MediaPipe hand landmark indices (21 points per hand)
const MP_HAND = {
  wrist: 0,
  thumb: [1, 2, 3, 4],
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
};

// SMPL-X finger joint names mapped to MediaPipe finger groups
const FINGER_MAP = {
  thumb:  { joints: ['thumb1', 'thumb2', 'thumb3'],   mp: MP_HAND.thumb },
  index:  { joints: ['index1', 'index2', 'index3'],   mp: MP_HAND.index },
  middle: { joints: ['middle1', 'middle2', 'middle3'], mp: MP_HAND.middle },
  ring:   { joints: ['ring1', 'ring2', 'ring3'],       mp: MP_HAND.ring },
  pinky:  { joints: ['pinky1', 'pinky2', 'pinky3'],    mp: MP_HAND.pinky },
};

// Biomechanical coupling: DIP flexion = 2/3 of PIP flexion
const DIP_PIP_RATIO = 2 / 3;

// ─── One-Euro Filter ────────────────────────────────────────
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
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(x, t) {
    if (this.tPrev === null) {
      this.xPrev = x; this.dxPrev = 0; this.tPrev = t;
      return x;
    }
    const dt = Math.max(t - this.tPrev, 1e-6);
    const dx = (x - this.xPrev) / dt;
    const adx = this._alpha(this.dCutoff, dt);
    const dxHat = adx * dx + (1 - adx) * this.dxPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const ax = this._alpha(cutoff, dt);
    const xHat = ax * x + (1 - ax) * this.xPrev;
    this.xPrev = xHat; this.dxPrev = dxHat; this.tPrev = t;
    return xHat;
  }

  reset() { this.xPrev = null; this.dxPrev = null; this.tPrev = null; }
}

class QuatFilter {
  constructor(minCutoff = 1.5, beta = 0.01) {
    this.f = [
      new OneEuroFilter(minCutoff, beta),
      new OneEuroFilter(minCutoff, beta),
      new OneEuroFilter(minCutoff, beta),
      new OneEuroFilter(minCutoff, beta),
    ];
    this._prev = null;
  }

  filter(q, t) {
    if (this._prev && q.dot(this._prev) < 0) {
      q = new THREE.Quaternion(-q.x, -q.y, -q.z, -q.w);
    }
    const out = new THREE.Quaternion(
      this.f[0].filter(q.x, t), this.f[1].filter(q.y, t),
      this.f[2].filter(q.z, t), this.f[3].filter(q.w, t),
    ).normalize();
    this._prev = out.clone();
    return out;
  }

  reset() { this.f.forEach(f => f.reset()); this._prev = null; }
}

// ─── Retargeting Engine ─────────────────────────────────────
export class SMPLXRetarget {
  constructor() {
    this._filters = {};
    this._time = 0;
  }

  _getFilter(name, minCutoff, beta) {
    if (!this._filters[name]) {
      this._filters[name] = new QuatFilter(minCutoff, beta);
    }
    return this._filters[name];
  }

  reset() {
    Object.values(this._filters).forEach(f => f.reset());
    this._time = 0;
  }

  /**
   * Apply a single frame of landmarks to the avatar skeleton.
   * @param {Object} bones - Map of joint name → THREE.Bone
   * @param {Object} restPose - Map of joint name → rest quaternion
   * @param {Object} frame - {leftHand, rightHand, face, pose}
   * @param {Object} calib - Body calibration data from avatar
   */
  applyFrame(bones, restPose, frame, calib) {
    this._time += 1 / 30; // assume 30fps

    const pose = frame.pose;
    const lh = frame.leftHand;
    const rh = frame.rightHand;
    const face = frame.face;

    // Arms from pose landmarks
    if (pose) {
      this._applyArm('right', bones, restPose, pose, calib);
      this._applyArm('left', bones, restPose, pose, calib);
    }

    // Fingers from hand landmarks
    if (rh && rh.length >= 21) this._applyFingers('right', bones, restPose, rh);
    if (lh && lh.length >= 21) this._applyFingers('left', bones, restPose, lh);

    // Hand orientation from hand landmarks
    if (rh && rh.length >= 21) this._applyHandOrient('right', bones, restPose, rh);
    if (lh && lh.length >= 21) this._applyHandOrient('left', bones, restPose, lh);

    // Head from pose
    if (pose) this._applyHead(bones, restPose, pose);

    // Jaw from face
    if (face && face.length >= 32) this._applyJaw(bones, restPose, face);
  }

  // ─── Arm retargeting ────────────────────────────────────
  _applyArm(side, bones, restPose, pose, calib) {
    const sIdx = side === 'left' ? MP_POSE.left_shoulder : MP_POSE.right_shoulder;
    const eIdx = side === 'left' ? MP_POSE.left_elbow : MP_POSE.right_elbow;
    const wIdx = side === 'left' ? MP_POSE.left_wrist : MP_POSE.right_wrist;

    if (!pose[sIdx] || !pose[eIdx] || !pose[wIdx]) return;

    const pS = pose[sIdx], pE = pose[eIdx], pW = pose[wIdx];
    const zDamp = 0.3;

    // Upper arm: shoulder → elbow direction in world space
    // MediaPipe: x=left→right, y=top→bottom, z=into screen
    // SMPL-X world: x=right, y=up, z=forward (toward camera)
    const upperDir = new THREE.Vector3(
      -(pE[0] - pS[0]),
      -(pE[1] - pS[1]),
      -((pE[2] ?? 0) - (pS[2] ?? 0)) * zDamp,
    );
    if (upperDir.length() < 0.001) return;
    upperDir.normalize();

    // Forearm: elbow → wrist direction
    const foreDir = new THREE.Vector3(
      -(pW[0] - pE[0]),
      -(pW[1] - pE[1]),
      -((pW[2] ?? 0) - (pE[2] ?? 0)) * zDamp,
    );
    if (foreDir.length() < 0.001) return;
    foreDir.normalize();

    // Apply upper arm
    const upperName = `${side}_shoulder`;
    const upperBone = bones[upperName];
    if (upperBone) {
      this._pointBone(upperBone, upperName, restPose, upperDir, calib, 2.5, 0.04);
    }

    // Apply forearm
    const foreName = `${side}_elbow`;
    const foreBone = bones[foreName];
    if (foreBone && upperBone) {
      upperBone.updateWorldMatrix(true, true);
      this._pointBone(foreBone, foreName, restPose, foreDir, calib, 2.5, 0.04);
    }
  }

  /**
   * Point a bone in a given world-space direction.
   * Uses the bone's rest direction (from its child offset) to compute rotation.
   */
  _pointBone(bone, name, restPose, worldDir, calib, filterCut, filterBeta) {
    const restQ = restPose[name];
    if (restQ) bone.quaternion.copy(restQ);
    bone.updateWorldMatrix(true, false);

    // Get parent's world quaternion
    const parentWorldQ = new THREE.Quaternion();
    if (bone.parent) bone.parent.getWorldQuaternion(parentWorldQ);
    const parentInv = parentWorldQ.clone().invert();

    // Target direction in bone's parent-local space
    const localDir = worldDir.clone().applyQuaternion(parentInv);

    // Rest direction: use cached or compute from child position
    const restDir = calib?.restDirs?.[name] ||
      new THREE.Vector3(name.startsWith('left') ? -1 : 1, 0, 0);

    // Rotation from rest direction to target direction
    const q = new THREE.Quaternion().setFromUnitVectors(restDir.clone().normalize(), localDir);
    bone.quaternion.multiplyQuaternions(q, restQ || new THREE.Quaternion());

    // Temporal filter
    const filter = this._getFilter(name, filterCut, filterBeta);
    bone.quaternion.copy(filter.filter(bone.quaternion, this._time));
  }

  // ─── Finger retargeting ─────────────────────────────────
  _applyFingers(side, bones, restPose, handLM) {
    for (const [fingerName, config] of Object.entries(FINGER_MAP)) {
      const mpIndices = config.mp;

      for (let j = 0; j < 3; j++) {
        const jointName = `${side}_${config.joints[j]}`;
        const bone = bones[jointName];
        if (!bone) continue;

        const restQ = restPose[jointName];
        if (restQ) bone.quaternion.copy(restQ);

        // Compute bend angle from 3 consecutive landmarks
        // prev → curr → next defines the joint angle
        const prevIdx = j === 0 ? 0 : mpIndices[j - 1]; // wrist for first joint
        const currIdx = mpIndices[j];
        const nextIdx = mpIndices[j + 1] ?? mpIndices[j]; // clamp

        if (j >= mpIndices.length - 1) {
          // DIP joint: apply coupling constraint
          const pipName = `${side}_${config.joints[1]}`;
          const pipBone = bones[pipName];
          if (pipBone) {
            const pipAngle = this._getBendAngle(pipBone);
            bone.rotateX(Math.abs(pipAngle) * DIP_PIP_RATIO);
          }
          continue;
        }

        const prev = handLM[prevIdx];
        const curr = handLM[currIdx];
        const next = handLM[nextIdx];

        if (!prev || !curr || !next) continue;

        const v1 = new THREE.Vector3(
          curr[0] - prev[0], curr[1] - prev[1], (curr[2] ?? 0) - (prev[2] ?? 0));
        const v2 = new THREE.Vector3(
          next[0] - curr[0], next[1] - curr[1], (next[2] ?? 0) - (curr[2] ?? 0));

        if (v1.length() < 1e-6 || v2.length() < 1e-6) continue;

        v1.normalize();
        v2.normalize();

        let angle = Math.acos(Math.max(-1, Math.min(1, v1.dot(v2))));

        // Clamp to biomechanical limits
        const maxFlex = fingerName === 'thumb' ? Math.PI / 2 : Math.PI * 0.55;
        angle = Math.min(angle, maxFlex);

        // Apply as X-axis rotation (flexion)
        // SMPL-X finger bones: X = flexion/extension axis
        bone.rotateX(angle);

        // Thumb abduction (first joint only)
        if (fingerName === 'thumb' && j === 0) {
          const cross = new THREE.Vector3().crossVectors(v1, v2);
          const abdAngle = Math.atan2(cross.length(), v1.dot(v2)) * 0.3;
          bone.rotateZ(side === 'left' ? -abdAngle : abdAngle);
        }

        // Apply temporal filter
        const filter = this._getFilter(jointName, 3.0, 0.05);
        bone.quaternion.copy(filter.filter(bone.quaternion, this._time));
      }
    }
  }

  _getBendAngle(bone) {
    // Extract X rotation from quaternion
    const euler = new THREE.Euler().setFromQuaternion(bone.quaternion, 'XYZ');
    return euler.x;
  }

  // ─── Hand orientation ───────────────────────────────────
  _applyHandOrient(side, bones, restPose, handLM) {
    const wristName = `${side}_wrist`;
    const bone = bones[wristName];
    if (!bone || !handLM || handLM.length < 21) return;

    const restQ = restPose[wristName];

    const w = handLM[0];   // wrist
    const mmcp = handLM[9]; // middle MCP
    const imcp = handLM[5]; // index MCP
    const pmcp = handLM[17]; // pinky MCP

    const zRatio = 0.25;

    // Finger direction: wrist → middle MCP
    const fingerDir = new THREE.Vector3(
      -(mmcp[0] - w[0]), -(mmcp[1] - w[1]),
      -((mmcp[2] ?? 0) - (w[2] ?? 0)) * zRatio,
    ).normalize();

    // Palm width: index MCP → pinky MCP
    const palmWidth = new THREE.Vector3(
      -(pmcp[0] - imcp[0]), -(pmcp[1] - imcp[1]),
      -((pmcp[2] ?? 0) - (imcp[2] ?? 0)) * zRatio,
    ).normalize();

    // Palm normal
    const palmNormal = new THREE.Vector3().crossVectors(palmWidth, fingerDir).normalize();
    if (side === 'left') palmNormal.negate();

    // Build target orientation matrix
    const up = palmNormal;
    const forward = fingerDir;
    const right = new THREE.Vector3().crossVectors(up, forward).normalize();

    const mat = new THREE.Matrix4().makeBasis(right, up, forward);
    const targetQ = new THREE.Quaternion().setFromRotationMatrix(mat);

    // Apply relative to rest pose
    if (restQ) {
      const restInv = restQ.clone().invert();
      const delta = targetQ.clone().multiply(restInv);
      bone.quaternion.multiplyQuaternions(delta, restQ);
    } else {
      bone.quaternion.copy(targetQ);
    }

    const filter = this._getFilter(wristName, 2.0, 0.03);
    bone.quaternion.copy(filter.filter(bone.quaternion, this._time));
  }

  // ─── Head orientation ───────────────────────────────────
  _applyHead(bones, restPose, pose) {
    const headBone = bones.head;
    if (!headBone) return;

    const nose = pose[MP_POSE.nose];
    const lEar = pose[MP_POSE.left_ear];
    const rEar = pose[MP_POSE.right_ear];
    if (!nose || !lEar || !rEar) return;

    const restQ = restPose.head;
    if (restQ) headBone.quaternion.copy(restQ);

    const earMidX = (lEar[0] + rEar[0]) / 2;
    const earDist = Math.abs(lEar[0] - rEar[0]) || 0.1;

    const yaw = ((nose[0] - earMidX) / earDist) * 0.6;
    const earMidY = (lEar[1] + rEar[1]) / 2;
    const pitch = ((nose[1] - earMidY) / earDist) * 0.4;
    const roll = Math.atan2(rEar[1] - lEar[1], rEar[0] - lEar[0]) * 0.5;

    const clamp = (v, lim) => Math.max(-lim, Math.min(lim, isFinite(v) ? v : 0));
    headBone.rotateY(clamp(yaw, 0.8));
    headBone.rotateX(clamp(pitch, 0.6));
    headBone.rotateZ(clamp(roll, 0.4));

    const filter = this._getFilter('head', 1.5, 0.02);
    headBone.quaternion.copy(filter.filter(headBone.quaternion, this._time));
  }

  // ─── Jaw (mouth opening) ────────────────────────────────
  _applyJaw(bones, restPose, face) {
    const jawBone = bones.jaw;
    if (!jawBone || !face || face.length < 27) return;

    const restQ = restPose.jaw;
    if (restQ) jawBone.quaternion.copy(restQ);

    // face[25] = upper lip, face[26] = lower lip
    const mouthOpen = Math.abs(face[26][1] - face[25][1]);
    const jawAngle = Math.min(mouthOpen * 8, 0.4); // clamp
    jawBone.rotateX(jawAngle);
  }
}
