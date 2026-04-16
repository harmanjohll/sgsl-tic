/* ============================================================
   SgSL Avatar — Kalidokit Retargeting (three-vrm v3)
   ============================================================
   Based on Kalidokit demo, adapted for three-vrm v3.
   Uses getRawBoneNode (equivalent to demo's getBoneNode).
   ============================================================ */

import * as Kalidokit from 'kalidokit';
import * as THREE from 'three';

const clamp = Kalidokit.Utils.clamp;
const lerp = Kalidokit.Vector.lerp;

let oldLookTarget = new THREE.Euler();

export class SMPLXRetarget {
  constructor() {
    this._lastDebug = '';
    this._debugCount = 0;
  }
  reset() { oldLookTarget = new THREE.Euler(); }

  /* ─── rigRotation: try both bone access methods ────────── */
  _rigRotation(vrm, name, rotation = { x: 0, y: 0, z: 0 }, dampener = 1, lerpAmount = 0.3) {
    if (!vrm) return;
    const boneName = name.charAt(0).toLowerCase() + name.slice(1);

    // Use getNormalizedBoneNode — these are the bones connected to the rendered mesh
    // getRawBoneNode returns J_Bip_R_UpperArm (disconnected from render after rotateVRM0)
    // getNormalizedBoneNode returns Normalized_J_Bip_R_UpperArm (actually rendered)
    let Part = vrm.humanoid.getNormalizedBoneNode(boneName);
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

  _rigPosition(vrm, name, position = { x: 0, y: 0, z: 0 }, dampener = 1, lerpAmount = 0.3) {
    if (!vrm) return;
    const boneName = name.charAt(0).toLowerCase() + name.slice(1);
    const Part = vrm.humanoid.getNormalizedBoneNode(boneName);
    if (!Part) return;
    let vector = new THREE.Vector3(position.x * dampener, position.y * dampener, position.z * dampener);
    Part.position.lerp(vector, lerpAmount);
  }

  _rigFace(vrm, riggedFace) {
    if (!vrm) return;
    this._rigRotation(vrm, "Neck", riggedFace.head, 0.7);

    const expr = vrm.expressionManager;
    if (!expr) return;

    if (riggedFace.eye) {
      let blinkL = lerp(clamp(1 - riggedFace.eye.l, 0, 1), expr.getValue('blink') || 0, 0.5);
      let blinkR = lerp(clamp(1 - riggedFace.eye.r, 0, 1), expr.getValue('blink') || 0, 0.5);
      const stabilized = Kalidokit.Face.stabilizeBlink({ l: blinkL, r: blinkR }, riggedFace.head.y);
      expr.setValue('blink', stabilized.l);
    }

    if (riggedFace.mouth) {
      expr.setValue('ih', lerp(riggedFace.mouth.shape.I || 0, expr.getValue('ih') || 0, 0.5));
      expr.setValue('aa', lerp(riggedFace.mouth.shape.A || 0, expr.getValue('aa') || 0, 0.5));
      expr.setValue('ee', lerp(riggedFace.mouth.shape.E || 0, expr.getValue('ee') || 0, 0.5));
      expr.setValue('oh', lerp(riggedFace.mouth.shape.O || 0, expr.getValue('oh') || 0, 0.5));
      expr.setValue('ou', lerp(riggedFace.mouth.shape.U || 0, expr.getValue('ou') || 0, 0.5));
    }
  }

  /* ─── animateVRM: from demo ─────────────────────────────── */
  applyFromMediaPipe(vrm, results) {
    if (!vrm) return;

    let riggedPose, riggedLeftHand, riggedRightHand, riggedFace;

    const faceLandmarks = results.faceLandmarks;
    const pose3DLandmarks = results.za || results.ea;
    const pose2DLandmarks = results.poseLandmarks;

    // Debug every 30 frames (~1 second)
    this._debugCount++;
    const doDebug = (this._debugCount % 30 === 0);
    if (doDebug) {
      const boneName = 'rightUpperArm';
      const rawBone = vrm.humanoid.getRawBoneNode(boneName);
      const normBone = vrm.humanoid.getNormalizedBoneNode(boneName);
      const lines = [
        `Frame: ${this._debugCount}`,
        `pose3D: ${pose3DLandmarks ? pose3DLandmarks.length + ' landmarks' : 'NULL'}`,
        `pose2D: ${pose2DLandmarks ? pose2DLandmarks.length + ' landmarks' : 'NULL'}`,
        `face: ${faceLandmarks ? faceLandmarks.length + ' landmarks' : 'NULL'}`,
        `rightHand(MP): ${results.leftHandLandmarks ? 'yes' : 'no'}`,
        `leftHand(MP): ${results.rightHandLandmarks ? 'yes' : 'no'}`,
        `getRawBoneNode('${boneName}'): ${rawBone ? rawBone.name : 'NULL'}`,
        `getNormalizedBoneNode('${boneName}'): ${normBone ? normBone.name : 'NULL'}`,
      ];
      this._lastDebug = lines.join('\n');
    }
    const leftHandLandmarks = results.rightHandLandmarks;
    const rightHandLandmarks = results.leftHandLandmarks;

    if (faceLandmarks) {
      riggedFace = Kalidokit.Face.solve(faceLandmarks, { runtime: "mediapipe", video: document.getElementById('rec-video') });
      if (riggedFace) this._rigFace(vrm, riggedFace);
    }

    if (pose2DLandmarks && pose3DLandmarks) {
      riggedPose = Kalidokit.Pose.solve(pose3DLandmarks, pose2DLandmarks, { runtime: "mediapipe", video: document.getElementById('rec-video') });

      if (riggedPose) {
        if (doDebug) {
          const rua = riggedPose.RightUpperArm;
          this._lastDebug += `\nKalidokit RightUpperArm: x=${rua?.x?.toFixed(2)} y=${rua?.y?.toFixed(2)} z=${rua?.z?.toFixed(2)}`;
          const lua = riggedPose.LeftUpperArm;
          this._lastDebug += `\nKalidokit LeftUpperArm: x=${lua?.x?.toFixed(2)} y=${lua?.y?.toFixed(2)} z=${lua?.z?.toFixed(2)}`;
        }
        this._rigRotation(vrm, "Hips", riggedPose.Hips.rotation, 0.7);
        this._rigRotation(vrm, "Chest", riggedPose.Spine, 0.25, 0.3);
        this._rigRotation(vrm, "Spine", riggedPose.Spine, 0.45, 0.3);
        this._rigRotation(vrm, "RightUpperArm", riggedPose.RightUpperArm, 1, 0.3);
        this._rigRotation(vrm, "RightLowerArm", riggedPose.RightLowerArm, 1, 0.3);
        this._rigRotation(vrm, "LeftUpperArm", riggedPose.LeftUpperArm, 1, 0.3);
        this._rigRotation(vrm, "LeftLowerArm", riggedPose.LeftLowerArm, 1, 0.3);
      }
    }

    if (leftHandLandmarks && riggedPose) {
      riggedLeftHand = Kalidokit.Hand.solve(leftHandLandmarks, "Left");
      if (riggedLeftHand) {
        this._rigRotation(vrm, "LeftHand", { z: riggedPose.LeftHand.z, y: riggedLeftHand.LeftWrist.y, x: riggedLeftHand.LeftWrist.x });
        for (const f of ['Ring','Index','Middle','Thumb','Little']) {
          for (const s of ['Proximal','Intermediate','Distal']) {
            this._rigRotation(vrm, `Left${f}${s}`, riggedLeftHand[`Left${f}${s}`]);
          }
        }
      }
    }

    if (rightHandLandmarks && riggedPose) {
      riggedRightHand = Kalidokit.Hand.solve(rightHandLandmarks, "Right");
      if (riggedRightHand) {
        this._rigRotation(vrm, "RightHand", { z: riggedPose.RightHand.z, y: riggedRightHand.RightWrist.y, x: riggedRightHand.RightWrist.x });
        for (const f of ['Ring','Index','Middle','Thumb','Little']) {
          for (const s of ['Proximal','Intermediate','Distal']) {
            this._rigRotation(vrm, `Right${f}${s}`, riggedRightHand[`Right${f}${s}`]);
          }
        }
      }
    }
  }

  applyFrame() {}
}
