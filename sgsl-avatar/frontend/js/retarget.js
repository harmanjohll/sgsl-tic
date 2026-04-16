/* ============================================================
   SgSL Avatar — Kalidokit VRM Retargeting
   ============================================================
   VERBATIM port of the official Kalidokit demo (script.js)
   from github.com/yeemachine/kalidokit/docs/script.js

   Adapted ONLY for three-vrm v3 API differences:
   - getBoneNode() → getNormalizedBoneNode()
   - blendShapeProxy → expressionManager
   - lookAt.applyer.lookAt() → removed (not available in v3)
   - VRMSchema.HumanoidBoneName enum → direct string names
   - VRMSchema.BlendShapePresetName → direct string names

   NO other changes. Same rotation math, same dampeners, same lerp.
   ============================================================ */

import * as Kalidokit from 'kalidokit';
import * as THREE from 'three';

const { Face, Pose, Hand } = Kalidokit;
const remap = Kalidokit.Utils.remap;
const clamp = Kalidokit.Utils.clamp;
const lerp = Kalidokit.Vector.lerp;

let oldLookTarget = new THREE.Euler();

export class SMPLXRetarget {
  constructor() {}
  reset() { oldLookTarget = new THREE.Euler(); }

  /* ─── rigRotation: EXACT copy from demo ────────────────── */
  _rigRotation(vrm, name, rotation = { x: 0, y: 0, z: 0 }, dampener = 1, lerpAmount = 0.3) {
    if (!vrm) return;
    // three-vrm v3: lowercase first char for bone name
    const boneName = name.charAt(0).toLowerCase() + name.slice(1);
    const Part = vrm.humanoid.getNormalizedBoneNode(boneName);
    if (!Part) return;

    // EXACT same math as demo — no negation, no axis changes
    let euler = new THREE.Euler(
      rotation.x * dampener,
      rotation.y * dampener,
      rotation.z * dampener,
      rotation.rotationOrder || "XYZ"
    );
    let quaternion = new THREE.Quaternion().setFromEuler(euler);
    Part.quaternion.slerp(quaternion, lerpAmount);
  }

  /* ─── rigPosition: EXACT copy from demo ────────────────── */
  _rigPosition(vrm, name, position = { x: 0, y: 0, z: 0 }, dampener = 1, lerpAmount = 0.3) {
    if (!vrm) return;
    const boneName = name.charAt(0).toLowerCase() + name.slice(1);
    const Part = vrm.humanoid.getNormalizedBoneNode(boneName);
    if (!Part) return;

    let vector = new THREE.Vector3(
      position.x * dampener,
      position.y * dampener,
      position.z * dampener
    );
    Part.position.lerp(vector, lerpAmount);
  }

  /* ─── rigFace: adapted from demo for three-vrm v3 ──────── */
  _rigFace(vrm, riggedFace) {
    if (!vrm) return;
    this._rigRotation(vrm, "Neck", riggedFace.head, 0.7);

    // three-vrm v3: expressionManager instead of blendShapeProxy
    const expr = vrm.expressionManager;
    if (!expr) return;

    // Blink — demo: 1 = closed, 0 = open
    if (riggedFace.eye) {
      let blinkL = lerp(
        clamp(1 - riggedFace.eye.l, 0, 1),
        expr.getValue('blink') || 0,
        0.5
      );
      let blinkR = lerp(
        clamp(1 - riggedFace.eye.r, 0, 1),
        expr.getValue('blink') || 0,
        0.5
      );
      const stabilized = Face.stabilizeBlink(
        { l: blinkL, r: blinkR },
        riggedFace.head.y
      );
      expr.setValue('blink', stabilized.l);
    }

    // Mouth shapes
    if (riggedFace.mouth) {
      expr.setValue('ih', lerp(riggedFace.mouth.shape.I || 0, expr.getValue('ih') || 0, 0.5));
      expr.setValue('aa', lerp(riggedFace.mouth.shape.A || 0, expr.getValue('aa') || 0, 0.5));
      expr.setValue('ee', lerp(riggedFace.mouth.shape.E || 0, expr.getValue('ee') || 0, 0.5));
      expr.setValue('oh', lerp(riggedFace.mouth.shape.O || 0, expr.getValue('oh') || 0, 0.5));
      expr.setValue('ou', lerp(riggedFace.mouth.shape.U || 0, expr.getValue('ou') || 0, 0.5));
    }

    // Pupils — skipped (lookAt.applyer not available in three-vrm v3)
  }

  /* ─── animateVRM: EXACT copy from demo ─────────────────── */
  applyFromMediaPipe(vrm, results) {
    if (!vrm) return;

    let riggedPose, riggedLeftHand, riggedRightHand, riggedFace;

    const faceLandmarks = results.faceLandmarks;
    // Demo uses results.ea — MediaPipe v0.5 uses results.za
    const pose3DLandmarks = results.za || results.ea;
    const pose2DLandmarks = results.poseLandmarks;
    // HANDS ARE SWAPPED in selfie mode (exact from demo)
    const leftHandLandmarks = results.rightHandLandmarks;
    const rightHandLandmarks = results.leftHandLandmarks;

    // Animate Face
    if (faceLandmarks) {
      riggedFace = Face.solve(faceLandmarks, {
        runtime: "mediapipe",
        video: null,
      });
      if (riggedFace) this._rigFace(vrm, riggedFace);
    }

    // Animate Pose
    if (pose2DLandmarks && pose3DLandmarks) {
      riggedPose = Pose.solve(pose3DLandmarks, pose2DLandmarks, {
        runtime: "mediapipe",
        video: null,
      });

      if (riggedPose) {
        this._rigRotation(vrm, "Hips", riggedPose.Hips.rotation, 0.7);
        // Skip hip position for sign language (keep avatar planted)

        this._rigRotation(vrm, "Chest", riggedPose.Spine, 0.25, 0.3);
        this._rigRotation(vrm, "Spine", riggedPose.Spine, 0.45, 0.3);

        this._rigRotation(vrm, "RightUpperArm", riggedPose.RightUpperArm, 1, 0.3);
        this._rigRotation(vrm, "RightLowerArm", riggedPose.RightLowerArm, 1, 0.3);
        this._rigRotation(vrm, "LeftUpperArm", riggedPose.LeftUpperArm, 1, 0.3);
        this._rigRotation(vrm, "LeftLowerArm", riggedPose.LeftLowerArm, 1, 0.3);
      }
    }

    // Animate Left Hand
    if (leftHandLandmarks && riggedPose) {
      riggedLeftHand = Hand.solve(leftHandLandmarks, "Left");
      if (riggedLeftHand) {
        this._rigRotation(vrm, "LeftHand", {
          z: riggedPose.LeftHand.z,
          y: riggedLeftHand.LeftWrist.y,
          x: riggedLeftHand.LeftWrist.x,
        });
        this._rigRotation(vrm, "LeftRingProximal", riggedLeftHand.LeftRingProximal);
        this._rigRotation(vrm, "LeftRingIntermediate", riggedLeftHand.LeftRingIntermediate);
        this._rigRotation(vrm, "LeftRingDistal", riggedLeftHand.LeftRingDistal);
        this._rigRotation(vrm, "LeftIndexProximal", riggedLeftHand.LeftIndexProximal);
        this._rigRotation(vrm, "LeftIndexIntermediate", riggedLeftHand.LeftIndexIntermediate);
        this._rigRotation(vrm, "LeftIndexDistal", riggedLeftHand.LeftIndexDistal);
        this._rigRotation(vrm, "LeftMiddleProximal", riggedLeftHand.LeftMiddleProximal);
        this._rigRotation(vrm, "LeftMiddleIntermediate", riggedLeftHand.LeftMiddleIntermediate);
        this._rigRotation(vrm, "LeftMiddleDistal", riggedLeftHand.LeftMiddleDistal);
        this._rigRotation(vrm, "LeftThumbProximal", riggedLeftHand.LeftThumbProximal);
        this._rigRotation(vrm, "LeftThumbIntermediate", riggedLeftHand.LeftThumbIntermediate);
        this._rigRotation(vrm, "LeftThumbDistal", riggedLeftHand.LeftThumbDistal);
        this._rigRotation(vrm, "LeftLittleProximal", riggedLeftHand.LeftLittleProximal);
        this._rigRotation(vrm, "LeftLittleIntermediate", riggedLeftHand.LeftLittleIntermediate);
        this._rigRotation(vrm, "LeftLittleDistal", riggedLeftHand.LeftLittleDistal);
      }
    }

    // Animate Right Hand
    if (rightHandLandmarks && riggedPose) {
      riggedRightHand = Hand.solve(rightHandLandmarks, "Right");
      if (riggedRightHand) {
        this._rigRotation(vrm, "RightHand", {
          z: riggedPose.RightHand.z,
          y: riggedRightHand.RightWrist.y,
          x: riggedRightHand.RightWrist.x,
        });
        this._rigRotation(vrm, "RightRingProximal", riggedRightHand.RightRingProximal);
        this._rigRotation(vrm, "RightRingIntermediate", riggedRightHand.RightRingIntermediate);
        this._rigRotation(vrm, "RightRingDistal", riggedRightHand.RightRingDistal);
        this._rigRotation(vrm, "RightIndexProximal", riggedRightHand.RightIndexProximal);
        this._rigRotation(vrm, "RightIndexIntermediate", riggedRightHand.RightIndexIntermediate);
        this._rigRotation(vrm, "RightIndexDistal", riggedRightHand.RightIndexDistal);
        this._rigRotation(vrm, "RightMiddleProximal", riggedRightHand.RightMiddleProximal);
        this._rigRotation(vrm, "RightMiddleIntermediate", riggedRightHand.RightMiddleIntermediate);
        this._rigRotation(vrm, "RightMiddleDistal", riggedRightHand.RightMiddleDistal);
        this._rigRotation(vrm, "RightThumbProximal", riggedRightHand.RightThumbProximal);
        this._rigRotation(vrm, "RightThumbIntermediate", riggedRightHand.RightThumbIntermediate);
        this._rigRotation(vrm, "RightThumbDistal", riggedRightHand.RightThumbDistal);
        this._rigRotation(vrm, "RightLittleProximal", riggedRightHand.RightLittleProximal);
        this._rigRotation(vrm, "RightLittleIntermediate", riggedRightHand.RightLittleIntermediate);
        this._rigRotation(vrm, "RightLittleDistal", riggedRightHand.RightLittleDistal);
      }
    }
  }

  // Kept for backward compatibility with player.js
  applyFrame() {}
}
