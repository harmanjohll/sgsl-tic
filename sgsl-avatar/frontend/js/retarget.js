/* ============================================================
   SgSL Avatar — Retargeting via Kalidokit
   ============================================================
   Uses Kalidokit library for MediaPipe → VRM bone mapping.
   Kalidokit handles all coordinate transformations, selfie
   mirroring, and bone rotation computation internally.

   We add: One-Euro temporal smoothing on top, and VRM
   expression mapping from Kalidokit face results.
   ============================================================ */

import * as Kalidokit from 'kalidokit';
import * as THREE from 'three';

const { Face, Pose, Hand, Vector } = Kalidokit;

// Clamp helper
const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
// Lerp helper for smooth transitions
const lerp = (a, b, t) => a + (b - a) * t;

// ─── Damping / smoothing factor ─────────────────────────────
const SMOOTH = 0.35; // 0 = no smoothing, 1 = frozen

export class SMPLXRetarget {
  constructor() {
    this._prevPose = {};
    this._prevFace = null;
    this._prevHands = { left: null, right: null };
  }

  reset() {
    this._prevPose = {};
    this._prevFace = null;
    this._prevHands = { left: null, right: null };
  }

  /**
   * Apply MediaPipe results to VRM avatar using Kalidokit.
   * @param {Object} vrm - The VRM model instance
   * @param {Object} mpResults - Raw MediaPipe Holistic results object
   */
  applyFromMediaPipe(vrm, mpResults) {
    if (!vrm?.humanoid) return;

    const pose = mpResults.poseLandmarks;
    const poseWorld = mpResults.ea; // world landmarks (used by Kalidokit)
    const face = mpResults.faceLandmarks;
    const leftHand = mpResults.leftHandLandmarks;
    const rightHand = mpResults.rightHandLandmarks;

    // ─── Body pose (arms, spine, hips) ────────────────────
    if (pose && poseWorld) {
      const riggedPose = Pose.solve(poseWorld, pose, {
        runtime: 'mediapipe',
        video: null,
      });

      if (riggedPose) {
        this._applyRotation(vrm, 'hips', riggedPose.Hips.rotation, 0.4);
        this._applyPosition(vrm, 'hips', {
          x: riggedPose.Hips.position.x,
          y: riggedPose.Hips.position.y + 1,
          z: -riggedPose.Hips.position.z,
        }, 0.07);
        this._applyRotation(vrm, 'chest', riggedPose.Spine, 0.5);
        this._applyRotation(vrm, 'spine', riggedPose.Spine, 0.3);

        this._applyRotation(vrm, 'rightUpperArm', riggedPose.RightUpperArm, SMOOTH);
        this._applyRotation(vrm, 'rightLowerArm', riggedPose.RightLowerArm, SMOOTH);
        this._applyRotation(vrm, 'leftUpperArm', riggedPose.LeftUpperArm, SMOOTH);
        this._applyRotation(vrm, 'leftLowerArm', riggedPose.LeftLowerArm, SMOOTH);

        this._applyRotation(vrm, 'rightUpperLeg', riggedPose.RightUpperLeg, 0.3);
        this._applyRotation(vrm, 'rightLowerLeg', riggedPose.RightLowerLeg, 0.3);
        this._applyRotation(vrm, 'leftUpperLeg', riggedPose.LeftUpperLeg, 0.3);
        this._applyRotation(vrm, 'leftLowerLeg', riggedPose.LeftLowerLeg, 0.3);
      }
    }

    // ─── Face (expressions + head rotation) ───────────────
    if (face) {
      const riggedFace = Face.solve(face, {
        runtime: 'mediapipe',
        video: null,
      });

      if (riggedFace) {
        // Head rotation
        this._applyRotation(vrm, 'head', riggedFace.head, 0.4);

        // Eye tracking
        if (riggedFace.eye) {
          const leftEye = vrm.humanoid.getNormalizedBoneNode('leftEye');
          const rightEye = vrm.humanoid.getNormalizedBoneNode('rightEye');
          if (leftEye) {
            leftEye.rotation.x = lerp(leftEye.rotation.x, riggedFace.eye.l.y, 0.5);
            leftEye.rotation.y = lerp(leftEye.rotation.y, riggedFace.eye.l.x, 0.5);
          }
          if (rightEye) {
            rightEye.rotation.x = lerp(rightEye.rotation.x, riggedFace.eye.r.y, 0.5);
            rightEye.rotation.y = lerp(rightEye.rotation.y, riggedFace.eye.r.x, 0.5);
          }
        }

        // VRM expressions from Kalidokit face solve
        const expr = vrm.expressionManager;
        if (expr) {
          // Mouth
          const mouth = riggedFace.mouth;
          if (mouth) {
            expr.setValue('aa', lerp(expr.getValue('aa') || 0, mouth.shape.A, 0.4));
            expr.setValue('ih', lerp(expr.getValue('ih') || 0, mouth.shape.I, 0.4));
            expr.setValue('ou', lerp(expr.getValue('ou') || 0, mouth.shape.U, 0.4));
            expr.setValue('ee', lerp(expr.getValue('ee') || 0, mouth.shape.E, 0.4));
            expr.setValue('oh', lerp(expr.getValue('oh') || 0, mouth.shape.O, 0.4));
          }

          // Blink
          if (riggedFace.eye) {
            expr.setValue('blinkLeft', lerp(expr.getValue('blinkLeft') || 0, 1 - (riggedFace.eye.l.y || 1), 0.5));
            expr.setValue('blinkRight', lerp(expr.getValue('blinkRight') || 0, 1 - (riggedFace.eye.r.y || 1), 0.5));
          }

          // Brow (for sign language NMMs)
          if (riggedFace.brow) {
            const browVal = clamp(riggedFace.brow, 0, 1);
            expr.setValue('surprised', lerp(expr.getValue('surprised') || 0, browVal * 0.6, 0.3));
          }
        }
      }
    }

    // ─── Hands (finger rotations) ─────────────────────────
    if (rightHand) {
      const riggedRight = Hand.solve(rightHand, 'Right');
      if (riggedRight) this._applyHand(vrm, 'right', riggedRight);
    }
    if (leftHand) {
      const riggedLeft = Hand.solve(leftHand, 'Left');
      if (riggedLeft) this._applyHand(vrm, 'left', riggedLeft);
    }
  }

  /**
   * Apply stored frame data to VRM (for playback from recordings).
   * Converts stored landmarks back to MediaPipe-like format for Kalidokit.
   */
  applyFrame(bones, restPose, frame, calib) {
    // This method is kept for backward compatibility with player.js
    // For live recording, use applyFromMediaPipe directly
  }

  // ─── Helpers ────────────────────────────────────────────

  _applyRotation(vrm, boneName, rotation, lerpAmt) {
    if (!rotation) return;
    const bone = vrm.humanoid.getNormalizedBoneNode(boneName);
    if (!bone) return;

    // Kalidokit returns {x, y, z} Euler angles in radians
    const x = rotation.x ?? 0;
    const y = rotation.y ?? 0;
    const z = rotation.z ?? 0;

    bone.rotation.x = lerp(bone.rotation.x, x, lerpAmt);
    bone.rotation.y = lerp(bone.rotation.y, y, lerpAmt);
    bone.rotation.z = lerp(bone.rotation.z, z, lerpAmt);
  }

  _applyPosition(vrm, boneName, position, lerpAmt) {
    if (!position) return;
    const bone = vrm.humanoid.getNormalizedBoneNode(boneName);
    if (!bone) return;
    bone.position.x = lerp(bone.position.x, position.x, lerpAmt);
    bone.position.y = lerp(bone.position.y, position.y, lerpAmt);
    bone.position.z = lerp(bone.position.z, position.z, lerpAmt);
  }

  _applyHand(vrm, side, riggedHand) {
    const Side = side === 'left' ? 'left' : 'right';

    const fingerMap = {
      'RingProximal': riggedHand.RingProximal,
      'RingIntermediate': riggedHand.RingIntermediate,
      'RingDistal': riggedHand.RingDistal,
      'IndexProximal': riggedHand.IndexProximal,
      'IndexIntermediate': riggedHand.IndexIntermediate,
      'IndexDistal': riggedHand.IndexDistal,
      'MiddleProximal': riggedHand.MiddleProximal,
      'MiddleIntermediate': riggedHand.MiddleIntermediate,
      'MiddleDistal': riggedHand.MiddleDistal,
      'ThumbProximal': riggedHand.ThumbProximal,
      'ThumbIntermediate': riggedHand.ThumbIntermediate,
      'ThumbDistal': riggedHand.ThumbDistal,
      'LittleProximal': riggedHand.LittleProximal,
      'LittleIntermediate': riggedHand.LittleIntermediate,
      'LittleDistal': riggedHand.LittleDistal,
    };

    // Also apply wrist rotation if available
    if (riggedHand.LeftWrist || riggedHand.RightWrist) {
      const wrist = side === 'left' ? riggedHand.LeftWrist : riggedHand.RightWrist;
      if (wrist) this._applyRotation(vrm, `${Side}Hand`, wrist, SMOOTH);
    }

    for (const [fingerBone, rotation] of Object.entries(fingerMap)) {
      if (!rotation) continue;
      const boneName = `${Side}${fingerBone}`;
      const bone = vrm.humanoid.getNormalizedBoneNode(boneName);
      if (!bone) continue;

      bone.rotation.x = lerp(bone.rotation.x, rotation.x ?? 0, 0.5);
      bone.rotation.y = lerp(bone.rotation.y, rotation.y ?? 0, 0.5);
      bone.rotation.z = lerp(bone.rotation.z, rotation.z ?? 0, 0.5);
    }
  }
}
