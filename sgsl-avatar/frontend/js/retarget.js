/* ============================================================
   SgSL Avatar — Retargeting via Kalidokit (v3)
   ============================================================
   Based on the official Kalidokit demo (github.com/yeemachine/kalidokit)
   Adapted for @pixiv/three-vrm v3.x API.

   Key differences from our previous attempts:
   1. rigRotation creates Euler → Quaternion → SLERP (not direct Euler set)
   2. Left/right hand landmarks are SWAPPED (selfie mirror)
   3. Arm dampener = 1 (full rotation, no scaling)
   4. Uses three-vrm v3 API (getNormalizedBoneNode, expressionManager)
   ============================================================ */

import * as Kalidokit from 'kalidokit';
import * as THREE from 'three';

const { Face, Pose, Hand } = Kalidokit;

const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
const lerp = (a, b, t) => a + (b - a) * t;

// Track old look target for smooth eye movement
let oldLookTarget = new THREE.Euler();

export class SMPLXRetarget {
  constructor() {}
  reset() { oldLookTarget = new THREE.Euler(); }

  /**
   * Core helper: apply rotation to a VRM bone.
   * Matches the Kalidokit demo's rigRotation exactly:
   * Euler → Quaternion → SLERP interpolation.
   */
  _rigRotation(vrm, boneName, rotation, dampener = 1, lerpAmount = 0.3) {
    if (!rotation) return;
    // three-vrm v3: bone names are lowercase-first (rightUpperArm, not RightUpperArm)
    const name = boneName.charAt(0).toLowerCase() + boneName.slice(1);
    const bone = vrm.humanoid?.getNormalizedBoneNode(name);
    if (!bone) return;

    const euler = new THREE.Euler(
      (rotation.x || 0) * dampener,
      (rotation.y || 0) * dampener,
      (rotation.z || 0) * dampener,
      rotation.rotationOrder || 'XYZ'
    );
    const quaternion = new THREE.Quaternion().setFromEuler(euler);
    bone.quaternion.slerp(quaternion, lerpAmount);
  }

  _rigPosition(vrm, boneName, position, dampener = 1, lerpAmount = 0.3) {
    if (!position) return;
    const name = boneName.charAt(0).toLowerCase() + boneName.slice(1);
    const bone = vrm.humanoid?.getNormalizedBoneNode(name);
    if (!bone) return;

    const vector = new THREE.Vector3(
      (position.x || 0) * dampener,
      (position.y || 0) * dampener,
      (position.z || 0) * dampener
    );
    bone.position.lerp(vector, lerpAmount);
  }

  /**
   * Apply MediaPipe Holistic results to VRM.
   * Follows the Kalidokit demo's animateVRM function exactly.
   */
  applyFromMediaPipe(vrm, results) {
    if (!vrm?.humanoid) return;

    let riggedPose, riggedLeftHand, riggedRightHand, riggedFace;

    const faceLandmarks = results.faceLandmarks;
    // World landmarks: 'za' in MediaPipe v0.5, 'ea' in older versions
    const pose3DLandmarks = results.za || results.ea;
    const pose2DLandmarks = results.poseLandmarks;

    // CRITICAL: Hands are SWAPPED in selfie mode!
    // MediaPipe's "right hand" in selfie camera = signer's LEFT hand
    const leftHandLandmarks = results.rightHandLandmarks;
    const rightHandLandmarks = results.leftHandLandmarks;

    // ─── Face ─────────────────────────────────────────────
    if (faceLandmarks) {
      riggedFace = Face.solve(faceLandmarks, {
        runtime: 'mediapipe',
        video: null,
      });
      if (riggedFace) this._rigFace(vrm, riggedFace);
    }

    // ─── Pose (body + arms) ───────────────────────────────
    if (pose2DLandmarks && pose3DLandmarks) {
      riggedPose = Pose.solve(pose3DLandmarks, pose2DLandmarks, {
        runtime: 'mediapipe',
        video: null,
      });

      if (riggedPose) {
        // Hips
        this._rigRotation(vrm, 'Hips', riggedPose.Hips.rotation, 0.7);
        // NO hip position for sign language — keep avatar planted
        // this._rigPosition(vrm, 'Hips', {...}, 1, 0.07);

        // Spine
        this._rigRotation(vrm, 'Chest', riggedPose.Spine, 0.25, 0.3);
        this._rigRotation(vrm, 'Spine', riggedPose.Spine, 0.45, 0.3);

        // Arms — dampener 1 = full rotation, no scaling!
        this._rigRotation(vrm, 'RightUpperArm', riggedPose.RightUpperArm, 1, 0.3);
        this._rigRotation(vrm, 'RightLowerArm', riggedPose.RightLowerArm, 1, 0.3);
        this._rigRotation(vrm, 'LeftUpperArm', riggedPose.LeftUpperArm, 1, 0.3);
        this._rigRotation(vrm, 'LeftLowerArm', riggedPose.LeftLowerArm, 1, 0.3);

        // No legs for sign language
      }
    }

    // ─── Left hand ────────────────────────────────────────
    if (leftHandLandmarks && riggedPose) {
      riggedLeftHand = Hand.solve(leftHandLandmarks, 'Left');
      if (riggedLeftHand) {
        this._rigRotation(vrm, 'LeftHand', {
          z: riggedPose.LeftHand?.z || 0,
          y: riggedLeftHand.LeftWrist?.y || 0,
          x: riggedLeftHand.LeftWrist?.x || 0,
        });
        // All finger bones
        for (const finger of ['Ring', 'Index', 'Middle', 'Thumb', 'Little']) {
          for (const segment of ['Proximal', 'Intermediate', 'Distal']) {
            const key = `Left${finger}${segment}`;
            this._rigRotation(vrm, key, riggedLeftHand[key]);
          }
        }
      }
    }

    // ─── Right hand ───────────────────────────────────────
    if (rightHandLandmarks && riggedPose) {
      riggedRightHand = Hand.solve(rightHandLandmarks, 'Right');
      if (riggedRightHand) {
        this._rigRotation(vrm, 'RightHand', {
          z: riggedPose.RightHand?.z || 0,
          y: riggedRightHand.RightWrist?.y || 0,
          x: riggedRightHand.RightWrist?.x || 0,
        });
        // All finger bones
        for (const finger of ['Ring', 'Index', 'Middle', 'Thumb', 'Little']) {
          for (const segment of ['Proximal', 'Intermediate', 'Distal']) {
            const key = `Right${finger}${segment}`;
            this._rigRotation(vrm, key, riggedRightHand[key]);
          }
        }
      }
    }
  }

  /**
   * Face rigging — adapted from Kalidokit demo for three-vrm v3 API.
   */
  _rigFace(vrm, riggedFace) {
    // Head/neck rotation
    this._rigRotation(vrm, 'Neck', riggedFace.head, 0.7);

    // Expressions via three-vrm v3 expressionManager
    const expr = vrm.expressionManager;
    if (!expr) return;

    // Blink
    if (riggedFace.eye) {
      let blinkL = clamp(1 - riggedFace.eye.l, 0, 1);
      let blinkR = clamp(1 - riggedFace.eye.r, 0, 1);
      // Stabilize blink
      const stabilized = Face.stabilizeBlink(
        { l: blinkL, r: blinkR },
        riggedFace.head.y
      );
      blinkL = lerp(stabilized.l, expr.getValue('blink') || 0, 0.5);
      blinkR = lerp(stabilized.r, expr.getValue('blink') || 0, 0.5);
      // VRM v3: use 'blink' or individual 'blinkLeft'/'blinkRight'
      expr.setValue('blink', (blinkL + blinkR) / 2);
    }

    // Mouth shapes
    if (riggedFace.mouth) {
      const m = riggedFace.mouth.shape;
      expr.setValue('ih', lerp(m.I || 0, expr.getValue('ih') || 0, 0.5));
      expr.setValue('aa', lerp(m.A || 0, expr.getValue('aa') || 0, 0.5));
      expr.setValue('ee', lerp(m.E || 0, expr.getValue('ee') || 0, 0.5));
      expr.setValue('oh', lerp(m.O || 0, expr.getValue('oh') || 0, 0.5));
      expr.setValue('ou', lerp(m.U || 0, expr.getValue('ou') || 0, 0.5));
    }

    // Pupil / eye look
    if (riggedFace.pupil) {
      const lookTarget = new THREE.Euler(
        lerp(oldLookTarget.x, riggedFace.pupil.y, 0.4),
        lerp(oldLookTarget.y, riggedFace.pupil.x, 0.4),
        0,
        'XYZ'
      );
      oldLookTarget.copy(lookTarget);

      // three-vrm v3 lookAt
      if (vrm.lookAt) {
        const yaw = THREE.MathUtils.RAD2DEG * lookTarget.y;
        const pitch = THREE.MathUtils.RAD2DEG * lookTarget.x;
        vrm.lookAt.target = undefined;
        vrm.lookAt.autoUpdate = false;
        vrm.lookAt.applyYawPitch(yaw, pitch);
      }
    }
  }

  // Kept for backward compatibility with player.js
  applyFrame() {}
}
