/* ============================================================
   SgSL Avatar — Kalidokit Retargeting (VRM 0.x)
   ============================================================
   EXACT copy of Kalidokit demo (github.com/yeemachine/kalidokit)
   using VRM 0.x API (getBoneNode, blendShapeProxy, lookAt.applyer).

   The ONLY change from the demo: wrapped in a class, and
   results.ea → results.za for MediaPipe v0.5 compatibility.
   ============================================================ */

import * as Kalidokit from 'kalidokit';

// Import helpers from Kalidokit — EXACT same as demo
const remap = Kalidokit.Utils.remap;
const clamp = Kalidokit.Utils.clamp;
const lerp = Kalidokit.Vector.lerp;

let oldLookTarget = new THREE.Euler();

export class SMPLXRetarget {
  constructor() {}
  reset() { oldLookTarget = new THREE.Euler(); }

  // ─── rigRotation: EXACT COPY from demo ─────────────────
  _rigRotation(vrm, name, rotation = { x: 0, y: 0, z: 0 }, dampener = 1, lerpAmount = 0.3) {
    if (!vrm) return;
    const Part = vrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName[name]);
    if (!Part) return;

    let euler = new THREE.Euler(
      rotation.x * dampener,
      rotation.y * dampener,
      rotation.z * dampener,
      rotation.rotationOrder || "XYZ"
    );
    let quaternion = new THREE.Quaternion().setFromEuler(euler);
    Part.quaternion.slerp(quaternion, lerpAmount);
  }

  // ─── rigPosition: EXACT COPY from demo ─────────────────
  _rigPosition(vrm, name, position = { x: 0, y: 0, z: 0 }, dampener = 1, lerpAmount = 0.3) {
    if (!vrm) return;
    const Part = vrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName[name]);
    if (!Part) return;

    let vector = new THREE.Vector3(position.x * dampener, position.y * dampener, position.z * dampener);
    Part.position.lerp(vector, lerpAmount);
  }

  // ─── rigFace: EXACT COPY from demo ─────────────────────
  _rigFace(vrm, riggedFace) {
    if (!vrm) return;
    this._rigRotation(vrm, "Neck", riggedFace.head, 0.7);

    // Blendshapes and Preset Name Schema — EXACT demo API
    const Blendshape = vrm.blendShapeProxy;
    const PresetName = THREE.VRMSchema.BlendShapePresetName;

    if (!Blendshape) return;

    // Blink — EXACT from demo
    riggedFace.eye.l = lerp(clamp(1 - riggedFace.eye.l, 0, 1), Blendshape.getValue(PresetName.Blink), 0.5);
    riggedFace.eye.r = lerp(clamp(1 - riggedFace.eye.r, 0, 1), Blendshape.getValue(PresetName.Blink), 0.5);
    riggedFace.eye = Kalidokit.Face.stabilizeBlink(riggedFace.eye, riggedFace.head.y);
    Blendshape.setValue(PresetName.Blink, riggedFace.eye.l);

    // Mouth — EXACT from demo
    Blendshape.setValue(PresetName.I, lerp(riggedFace.mouth.shape.I, Blendshape.getValue(PresetName.I), 0.5));
    Blendshape.setValue(PresetName.A, lerp(riggedFace.mouth.shape.A, Blendshape.getValue(PresetName.A), 0.5));
    Blendshape.setValue(PresetName.E, lerp(riggedFace.mouth.shape.E, Blendshape.getValue(PresetName.E), 0.5));
    Blendshape.setValue(PresetName.O, lerp(riggedFace.mouth.shape.O, Blendshape.getValue(PresetName.O), 0.5));
    Blendshape.setValue(PresetName.U, lerp(riggedFace.mouth.shape.U, Blendshape.getValue(PresetName.U), 0.5));

    // Pupils — EXACT from demo
    let lookTarget = new THREE.Euler(
      lerp(oldLookTarget.x, riggedFace.pupil.y, 0.4),
      lerp(oldLookTarget.y, riggedFace.pupil.x, 0.4),
      0,
      "XYZ"
    );
    oldLookTarget.copy(lookTarget);
    if (vrm.lookAt && vrm.lookAt.applyer) {
      vrm.lookAt.applyer.lookAt(lookTarget);
    }
  }

  // ─── animateVRM: EXACT COPY from demo ──────────────────
  applyFromMediaPipe(vrm, results) {
    if (!vrm) return;

    let riggedPose, riggedLeftHand, riggedRightHand, riggedFace;

    const faceLandmarks = results.faceLandmarks;
    // ONLY CHANGE: results.ea → results.za for MediaPipe v0.5
    const pose3DLandmarks = results.za || results.ea;
    const pose2DLandmarks = results.poseLandmarks;
    // Be careful, hand landmarks may be reversed — EXACT from demo
    const leftHandLandmarks = results.rightHandLandmarks;
    const rightHandLandmarks = results.leftHandLandmarks;

    // Animate Face — EXACT from demo
    if (faceLandmarks) {
      riggedFace = Kalidokit.Face.solve(faceLandmarks, {
        runtime: "mediapipe",
        video: document.getElementById('rec-video'),
      });
      if (riggedFace) this._rigFace(vrm, riggedFace);
    }

    // Animate Pose — EXACT from demo
    if (pose2DLandmarks && pose3DLandmarks) {
      riggedPose = Kalidokit.Pose.solve(pose3DLandmarks, pose2DLandmarks, {
        runtime: "mediapipe",
        video: document.getElementById('rec-video'),
      });

      if (riggedPose) {
        this._rigRotation(vrm, "Hips", riggedPose.Hips.rotation, 0.7);
        this._rigPosition(vrm, "Hips", {
          x: riggedPose.Hips.position.x,
          y: riggedPose.Hips.position.y + 1,
          z: -riggedPose.Hips.position.z,
        }, 1, 0.07);

        this._rigRotation(vrm, "Chest", riggedPose.Spine, 0.25, 0.3);
        this._rigRotation(vrm, "Spine", riggedPose.Spine, 0.45, 0.3);

        this._rigRotation(vrm, "RightUpperArm", riggedPose.RightUpperArm, 1, 0.3);
        this._rigRotation(vrm, "RightLowerArm", riggedPose.RightLowerArm, 1, 0.3);
        this._rigRotation(vrm, "LeftUpperArm", riggedPose.LeftUpperArm, 1, 0.3);
        this._rigRotation(vrm, "LeftLowerArm", riggedPose.LeftLowerArm, 1, 0.3);

        this._rigRotation(vrm, "LeftUpperLeg", riggedPose.LeftUpperLeg, 1, 0.3);
        this._rigRotation(vrm, "LeftLowerLeg", riggedPose.LeftLowerLeg, 1, 0.3);
        this._rigRotation(vrm, "RightUpperLeg", riggedPose.RightUpperLeg, 1, 0.3);
        this._rigRotation(vrm, "RightLowerLeg", riggedPose.RightLowerLeg, 1, 0.3);
      }
    }

    // Animate Hands — EXACT from demo
    if (leftHandLandmarks && riggedPose) {
      riggedLeftHand = Kalidokit.Hand.solve(leftHandLandmarks, "Left");
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

    if (rightHandLandmarks && riggedPose) {
      riggedRightHand = Kalidokit.Hand.solve(rightHandLandmarks, "Right");
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
