/* ============================================================
   SgSL Avatar — Kalidokit Retargeting
   EXACT COPY of Kalidokit demo script.js
   Using VRM 0.x API (getBoneNode, blendShapeProxy)
   ONLY change: results.ea → results.za for MediaPipe v0.5
   ============================================================ */

import * as Kalidokit from 'kalidokit';

const remap = Kalidokit.Utils.remap;
const clamp = Kalidokit.Utils.clamp;
const lerp = Kalidokit.Vector.lerp;

let oldLookTarget = new THREE.Euler();

export class SMPLXRetarget {
  constructor() { this._lastDebug = ''; this._dc = 0; }
  reset() { oldLookTarget = new THREE.Euler(); }

  _rigRotation(vrm, name, rotation = { x: 0, y: 0, z: 0 }, dampener = 1, lerpAmount = 0.3) {
    if (!vrm) return;
    const Part = vrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName[name]);
    if (!Part) return;
    let euler = new THREE.Euler(rotation.x * dampener, rotation.y * dampener, rotation.z * dampener, rotation.rotationOrder || "XYZ");
    let quaternion = new THREE.Quaternion().setFromEuler(euler);
    Part.quaternion.slerp(quaternion, lerpAmount);
  }

  _rigPosition(vrm, name, position = { x: 0, y: 0, z: 0 }, dampener = 1, lerpAmount = 0.3) {
    if (!vrm) return;
    const Part = vrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName[name]);
    if (!Part) return;
    let vector = new THREE.Vector3(position.x * dampener, position.y * dampener, position.z * dampener);
    Part.position.lerp(vector, lerpAmount);
  }

  _rigFace(vrm, riggedFace) {
    if (!vrm) return;
    this._rigRotation(vrm, "Neck", riggedFace.head, 0.7);
    const Blendshape = vrm.blendShapeProxy;
    const PresetName = THREE.VRMSchema.BlendShapePresetName;
    if (!Blendshape) return;

    riggedFace.eye.l = lerp(clamp(1 - riggedFace.eye.l, 0, 1), Blendshape.getValue(PresetName.Blink), 0.5);
    riggedFace.eye.r = lerp(clamp(1 - riggedFace.eye.r, 0, 1), Blendshape.getValue(PresetName.Blink), 0.5);
    riggedFace.eye = Kalidokit.Face.stabilizeBlink(riggedFace.eye, riggedFace.head.y);
    Blendshape.setValue(PresetName.Blink, riggedFace.eye.l);

    Blendshape.setValue(PresetName.I, lerp(riggedFace.mouth.shape.I, Blendshape.getValue(PresetName.I), 0.5));
    Blendshape.setValue(PresetName.A, lerp(riggedFace.mouth.shape.A, Blendshape.getValue(PresetName.A), 0.5));
    Blendshape.setValue(PresetName.E, lerp(riggedFace.mouth.shape.E, Blendshape.getValue(PresetName.E), 0.5));
    Blendshape.setValue(PresetName.O, lerp(riggedFace.mouth.shape.O, Blendshape.getValue(PresetName.O), 0.5));
    Blendshape.setValue(PresetName.U, lerp(riggedFace.mouth.shape.U, Blendshape.getValue(PresetName.U), 0.5));

    let lookTarget = new THREE.Euler(lerp(oldLookTarget.x, riggedFace.pupil.y, 0.4), lerp(oldLookTarget.y, riggedFace.pupil.x, 0.4), 0, "XYZ");
    oldLookTarget.copy(lookTarget);
    if (vrm.lookAt && vrm.lookAt.applyer) vrm.lookAt.applyer.lookAt(lookTarget);
  }

  applyFromMediaPipe(vrm, results) {
    if (!vrm) return;
    let riggedPose, riggedLeftHand, riggedRightHand, riggedFace;

    const faceLandmarks = results.faceLandmarks;
    const pose3DLandmarks = results.za || results.ea;
    const pose2DLandmarks = results.poseLandmarks;
    const leftHandLandmarks = results.rightHandLandmarks;
    const rightHandLandmarks = results.leftHandLandmarks;

    this._dc++;
    if (this._dc % 30 === 0) {
      this._lastDebug = `Frame: ${this._dc}\npose3D: ${pose3DLandmarks ? pose3DLandmarks.length + ' lm' : 'NULL'}\npose2D: ${pose2DLandmarks ? pose2DLandmarks.length + ' lm' : 'NULL'}\nface: ${faceLandmarks ? faceLandmarks.length + ' lm' : 'NULL'}\nrightHand(MP): ${rightHandLandmarks ? 'yes' : 'no'}\nleftHand(MP): ${leftHandLandmarks ? 'yes' : 'no'}`;
    }

    if (faceLandmarks) {
      riggedFace = Kalidokit.Face.solve(faceLandmarks, { runtime: "mediapipe", video: document.getElementById('rec-video') });
      if (riggedFace) this._rigFace(vrm, riggedFace);
    }

    if (pose2DLandmarks && pose3DLandmarks) {
      riggedPose = Kalidokit.Pose.solve(pose3DLandmarks, pose2DLandmarks, { runtime: "mediapipe", video: document.getElementById('rec-video') });
      if (riggedPose) {
        if (this._dc % 30 === 0) {
          const r = riggedPose.RightUpperArm, l = riggedPose.LeftUpperArm;
          this._lastDebug += `\nRUA: x=${r?.x?.toFixed(2)} y=${r?.y?.toFixed(2)} z=${r?.z?.toFixed(2)}`;
          this._lastDebug += `\nLUA: x=${l?.x?.toFixed(2)} y=${l?.y?.toFixed(2)} z=${l?.z?.toFixed(2)}`;
          const bone = vrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName["RightUpperArm"]);
          this._lastDebug += `\nBone found: ${bone ? bone.name : 'NULL'}`;
        }

        this._rigRotation(vrm, "Hips", riggedPose.Hips.rotation, 0.7);
        this._rigPosition(vrm, "Hips", { x: riggedPose.Hips.position.x, y: riggedPose.Hips.position.y + 1, z: -riggedPose.Hips.position.z }, 1, 0.07);
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

    if (leftHandLandmarks && riggedPose) {
      riggedLeftHand = Kalidokit.Hand.solve(leftHandLandmarks, "Left");
      if (riggedLeftHand) {
        this._rigRotation(vrm, "LeftHand", { z: riggedPose.LeftHand.z, y: riggedLeftHand.LeftWrist.y, x: riggedLeftHand.LeftWrist.x });
        for (const f of ['Ring','Index','Middle','Thumb','Little'])
          for (const s of ['Proximal','Intermediate','Distal'])
            this._rigRotation(vrm, `Left${f}${s}`, riggedLeftHand[`Left${f}${s}`]);
      }
    }

    if (rightHandLandmarks && riggedPose) {
      riggedRightHand = Kalidokit.Hand.solve(rightHandLandmarks, "Right");
      if (riggedRightHand) {
        this._rigRotation(vrm, "RightHand", { z: riggedPose.RightHand.z, y: riggedRightHand.RightWrist.y, x: riggedRightHand.RightWrist.x });
        for (const f of ['Ring','Index','Middle','Thumb','Little'])
          for (const s of ['Proximal','Intermediate','Distal'])
            this._rigRotation(vrm, `Right${f}${s}`, riggedRightHand[`Right${f}${s}`]);
      }
    }
  }

  applyFrame() {}
}
