/* ============================================================
   SgSL Avatar — Retargeting
   ============================================================
   What this module does, top to bottom:

   1. ARMS are NOT driven by Kalidokit's pose solver any more.
      That solver returns local-bone Eulers based on a hallucinated
      elbow when the elbow is out of frame (laptop webcam case),
      and local Eulers depend on bone-axis conventions we don't
      control — that combination cost us many iterations of
      visible regressions.

      Instead: we read the 2D shoulder→wrist vector from MediaPipe,
      flip image-Y to world-Y, and rotate the UpperArm bone via a
      world-space quaternion so its rest direction aligns with
      that vector. THREE.Quaternion.setFromUnitVectors handles
      every axis convention for us. Mei's wrist ends up where the
      user's wrist actually is. The lower arm is left in its rest
      orientation (no elbow bend driven from the camera) — it'll
      look stick-like at extreme angles but the hand position is
      what matters for sign legibility.

   2. HANDS (fingers + wrist) are still driven by Kalidokit.Hand.solve
      from the 21 hand-landmark feed. That part has worked
      consistently. Wrist rotation no longer mixes the pose
      solver's hallucinated Z component.

   3. FACE is still driven by Kalidokit.Face.solve.

   4. TORSO (Hips/Spine/Chest) is dampened so MediaPipe noise
      doesn't tilt the avatar. Hips position transfer is disabled
      (SgSL signer stays planted). Legs are never driven.

   5. Per-arm 5-frame hysteresis absorbs MediaPipe hand-detection
      flicker so a brief drop doesn't collapse Mei to rest.
   ============================================================ */

import * as Kalidokit from 'kalidokit';

const remap = Kalidokit.Utils.remap;
const clamp = Kalidokit.Utils.clamp;
const lerp = Kalidokit.Vector.lerp;

const FINGER_NAMES = ['Ring','Index','Middle','Thumb','Little'];
const FINGER_SEGMENTS = ['Proximal','Intermediate','Distal'];

const POSE_MIN_VISIBLE_LMS = 20;   // of 33
const POSE_VIS_THRESH = 0.5;
const HAND_MIN_VISIBLE_LMS = 12;   // of 21 (lowered from 15; we now have hysteresis)
const WRIST_VIS_THRESH = 0.5;

// Hysteresis: once an arm is "on", it can absorb up to this many
// consecutive failure frames before we start slerping it back to
// rest. 5 frames at ~30 fps = ~160 ms grace window.
const ARM_HYSTERESIS_FRAMES = 5;

let oldLookTarget = new THREE.Euler();

export class SMPLXRetarget {
  constructor() {
    this._lastDebug = '';
    this._dc = 0;
    this._video = null;
    this._avatar = null;
    // Hysteresis counters per arm. Treated as "arm is on" whenever > 0.
    this._rightArmStreak = 0;
    this._leftArmStreak = 0;
  }
  reset() {
    oldLookTarget = new THREE.Euler();
    this._rightArmStreak = 0;
    this._leftArmStreak = 0;
  }

  /** Caller wires up a video element (recorder) or null (viewer). */
  setVideo(video) { this._video = video || null; }

  /** Avatar instance so we can poke its rest-rebias watchdog. */
  setAvatar(avatar) { this._avatar = avatar || null; }

  _rigRotation(vrm, name, rotation, dampener = 1, lerpAmount = 0.3) {
    if (!vrm || !rotation) return;
    const Part = vrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName[name]);
    if (!Part) return;
    const euler = new THREE.Euler(
      (rotation.x || 0) * dampener,
      (rotation.y || 0) * dampener,
      (rotation.z || 0) * dampener,
      rotation.rotationOrder || "XYZ"
    );
    const quaternion = new THREE.Quaternion().setFromEuler(euler);
    Part.quaternion.slerp(quaternion, lerpAmount);
  }

  _rigPosition(vrm, name, position, dampener = 1, lerpAmount = 0.3) {
    if (!vrm || !position) return;
    const Part = vrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName[name]);
    if (!Part) return;
    const vector = new THREE.Vector3(
      (position.x || 0) * dampener,
      (position.y || 0) * dampener,
      (position.z || 0) * dampener
    );
    Part.position.lerp(vector, lerpAmount);
  }

  _countVisible(landmarks, thresh = POSE_VIS_THRESH) {
    let n = 0;
    for (const lm of landmarks) {
      if (lm && (lm.visibility === undefined || lm.visibility >= thresh)) n++;
    }
    return n;
  }

  _rigFace(vrm, riggedFace) {
    if (!vrm || !riggedFace) return;
    this._rigRotation(vrm, "Neck", riggedFace.head, 0.7, 0.3);
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

    const lookTarget = new THREE.Euler(
      lerp(oldLookTarget.x, riggedFace.pupil.y, 0.4),
      lerp(oldLookTarget.y, riggedFace.pupil.x, 0.4),
      0, "XYZ"
    );
    oldLookTarget.copy(lookTarget);
    if (vrm.lookAt && vrm.lookAt.applyer) vrm.lookAt.applyer.lookAt(lookTarget);
  }

  /**
   * Rotate a bone in WORLD space so its rest direction aligns with
   * `desiredWorldDir`. Bypasses local-bone-Euler conventions
   * entirely — Three.Quaternion.setFromUnitVectors does the axis
   * math, and we convert back to local using the bone's parent.
   *
   * Returns true if applied, false if the rest snapshot is missing.
   */
  _pointBoneInWorld(vrm, boneName, desiredWorldDir, lerpAmount = 0.5) {
    if (!this._avatar || !desiredWorldDir) return false;
    const restWorldDir = this._avatar._restWorldDirs?.[boneName];
    if (!restWorldDir) return false;

    const BN = THREE.VRMSchema.HumanoidBoneName;
    const bone = vrm.humanoid.getBoneNode(BN[boneName]);
    if (!bone) return false;

    const restLocalQuat = this._avatar._restTargets?.[BN[boneName]];
    if (!restLocalQuat) return false;

    // World-space delta that takes restDir → desiredDir.
    const Qworld = new THREE.Quaternion().setFromUnitVectors(
      restWorldDir, desiredWorldDir.clone().normalize(),
    );

    // Convert to bone-local: newLocal = parentWorld⁻¹ * Qworld * parentWorld * restLocal.
    const parentWorld = new THREE.Quaternion();
    bone.parent.getWorldQuaternion(parentWorld);

    const restWorld = parentWorld.clone().multiply(restLocalQuat);
    const newWorld = Qworld.clone().multiply(restWorld);
    const newLocal = parentWorld.clone().invert().multiply(newWorld);

    bone.quaternion.slerp(newLocal, lerpAmount);
    return true;
  }

  /**
   * Compute a desired arm direction in avatar world space from a 2D
   * shoulder→wrist vector in MediaPipe image coordinates.
   *
   * Image: +x right, +y down, no z.
   * Avatar world (after vrm.scene.rotation.y = π): +Y up, +X to
   * viewer's left, +Z toward viewer.
   *
   * The CSS mirrors the camera preview so the user sees themselves
   * naturally. MediaPipe processes the un-mirrored raw video, but
   * since both the user's right hand AND Mei's right (as viewed)
   * end up on the same side of the screen after Mei's 180°
   * rotation, we can pass image dx through directly. Image dy
   * negates (image-down → world-up). Z=0 keeps things in the
   * frontal plane (sign language is mostly frontal).
   */
  _imageToWorldArmDir(shoulder2D, wrist2D) {
    if (!shoulder2D || !wrist2D) return null;
    const dx = wrist2D.x - shoulder2D.x;
    const dy = wrist2D.y - shoulder2D.y;
    const v = new THREE.Vector3(dx, -dy, 0);
    if (v.lengthSq() < 1e-6) return null;
    return v.normalize();
  }

  _writeHand(vrm, side, riggedHand) {
    if (!riggedHand) return;
    const wrist = riggedHand[`${side}Wrist`];
    if (wrist) {
      // Drop the pose-solver's wrist z. It was a Kalidokit-demo
      // pattern that only held up when the full body was in frame.
      // In laptop crops, pose-z is hallucinated and tilts the palm
      // onto a bad plane, so open hands render as curls. Use only
      // the hand-solve's own xyz.
      this._rigRotation(vrm, `${side}Hand`, {
        x: wrist.x,
        y: wrist.y,
        z: wrist.z ?? 0,
      });
    }
    for (const f of FINGER_NAMES) {
      for (const s of FINGER_SEGMENTS) {
        const key = `${side}${f}${s}`;
        const rot = riggedHand[key];
        if (rot) this._rigRotation(vrm, key, rot);
      }
    }
  }

  applyFromMediaPipe(vrm, results) {
    if (!vrm) return;
    let riggedPose, riggedLeftHand, riggedRightHand, riggedFace;

    const faceLandmarks = results.faceLandmarks;
    const pose3DLandmarks = results.za || results.ea;
    const pose2DLandmarks = results.poseLandmarks;
    // MediaPipe reports hands as the camera sees them; Kalidokit's
    // demo swaps so "Left" refers to the signer's own left hand.
    const leftHandLandmarks = results.rightHandLandmarks;
    const rightHandLandmarks = results.leftHandLandmarks;

    const solveOpts = this._video
      ? { runtime: "mediapipe", video: this._video }
      : { runtime: "mediapipe" };

    this._dc++;
    const emitDebug = (this._dc % 30 === 0);

    if (faceLandmarks && faceLandmarks.length >= 468) {
      riggedFace = Kalidokit.Face.solve(faceLandmarks, solveOpts);
      if (riggedFace) this._rigFace(vrm, riggedFace);
    }

    const poseVisible = pose2DLandmarks
      ? this._countVisible(pose2DLandmarks) >= POSE_MIN_VISIBLE_LMS
      : false;

    // Raw per-frame "arm is trustworthy" signal. Hand detection is
    // the strong signal; wrist visibility is a fallback for the
    // no-hand-raised case.
    const vis = (i) => pose2DLandmarks?.[i]?.visibility ?? 0;
    const handDetected = (lms) =>
      lms && this._countVisible(lms, 0) >= HAND_MIN_VISIBLE_LMS;    // MediaPipe pose wrist indices: 15 = signer's right, 16 = signer's left.
    const rawRightOk = handDetected(rightHandLandmarks) || vis(15) >= WRIST_VIS_THRESH;
    const rawLeftOk  = handDetected(leftHandLandmarks)  || vis(16) >= WRIST_VIS_THRESH;

    // Hysteresis: fill the streak up to MAX when the raw signal is
    // good; decrement when it's bad. Arm is "on" whenever > 0.
    const bump = (streak, ok) => ok
      ? ARM_HYSTERESIS_FRAMES
      : Math.max(0, streak - 1);
    this._rightArmStreak = bump(this._rightArmStreak, rawRightOk);
    this._leftArmStreak  = bump(this._leftArmStreak,  rawLeftOk);
    const signerRightArmOn = this._rightArmStreak > 0;
    const signerLeftArmOn  = this._leftArmStreak  > 0;

    // We still call Pose.solve for torso (Hips/Spine/Chest), but we
    // ignore its arm Eulers entirely.
    if (poseVisible && pose3DLandmarks) {
      riggedPose = Kalidokit.Pose.solve(pose3DLandmarks, pose2DLandmarks, solveOpts);
      if (riggedPose) {
        if (this._avatar) this._avatar.markActive();

        this._rigRotation(vrm, "Hips", riggedPose.Hips.rotation, 0.2, 0.15);
        this._rigRotation(vrm, "Chest", riggedPose.Spine, 0.1, 0.15);
        this._rigRotation(vrm, "Spine", riggedPose.Spine, 0.2, 0.15);
      }
    }

    // Arms: direct world-space pointing.
    //
    // For each arm, we want the shoulder→wrist direction to match
    // what the user is showing. Source for the wrist landmark:
    //   - Hand-detection wrist (hand-array index 0) when a hand was
    //     detected. This is the most accurate source.
    //   - Pose 2D wrist landmark (15/16) as a fallback.
    //
    // MediaPipe pose 2D shoulder indices: 11 = signer's left,
    // 12 = signer's right. Our retarget code uses the swap convention
    // where leftHandLandmarks (variable) holds the signer's right
    // hand data (via results.rightHandLandmarks), and we drive Mei's
    // RightUpperArm bone with the signer's right side.
    if (pose2DLandmarks) {
      // Signer's RIGHT side (Mei's RightUpperArm).
      // Shoulder = MP[12]. Wrist = rightHandLandmarks[0] (which is
      // results.leftHandLandmarks under the swap) if detected, else MP[16].
      if (signerRightArmOn) {
        const sh = pose2DLandmarks[12];
        const wr = (rightHandLandmarks?.[0]) || pose2DLandmarks[16];
        const dir = this._imageToWorldArmDir(sh, wr);
        if (dir) this._pointBoneInWorld(vrm, "RightUpperArm", dir, 0.5);
      } else if (this._avatar) {
        this._avatar.slerpToRest(["RightUpperArm", "RightLowerArm", "RightHand"], 0.18);
      }

      // Signer's LEFT side (Mei's LeftUpperArm).
      if (signerLeftArmOn) {
        const sh = pose2DLandmarks[11];
        const wr = (leftHandLandmarks?.[0]) || pose2DLandmarks[15];
        const dir = this._imageToWorldArmDir(sh, wr);
        if (dir) this._pointBoneInWorld(vrm, "LeftUpperArm", dir, 0.5);
      } else if (this._avatar) {
        this._avatar.slerpToRest(["LeftUpperArm", "LeftLowerArm", "LeftHand"], 0.18);
      }
    }

    if (emitDebug) {
      // Pose-side shoulder→wrist 2D vector in normalized image coords.
      // The label "Rsh->wrist" reads "MP-right shoulder to MP-right
      // wrist" = user's anatomical right side. Use to verify
      // framing + that detection is reaching expected coords.
      const sw = (shoulderIdx, wristIdx) => {
        const s = pose2DLandmarks?.[shoulderIdx];
        const w = pose2DLandmarks?.[wristIdx];
        if (!s || !w) return 'NULL';
        const dx = (w.x - s.x).toFixed(2);
        const dy = (w.y - s.y).toFixed(2);
        return `dx=${dx} dy=${dy}`;
      };
      const restDirs = this._avatar?._restWorldDirs;
      const rdr = restDirs?.RightUpperArm;
      const ldr = restDirs?.LeftUpperArm;
      const fmtV = (v) => v ? `(${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)})` : 'NULL';
      this._lastDebug = `Frame: ${this._dc}`
        + `\npose3D: ${pose3DLandmarks ? pose3DLandmarks.length + ' lm' : 'NULL'}`
        + `\npose2D: ${pose2DLandmarks ? pose2DLandmarks.length + ' lm' : 'NULL'}`
        + `\nface: ${faceLandmarks ? faceLandmarks.length + ' lm' : 'NULL'}`
        + `\nrightHand(MP): ${rightHandLandmarks ? 'yes' : 'no'}`
        + `\nleftHand(MP): ${leftHandLandmarks ? 'yes' : 'no'}`
        + `\narmStreak: R=${this._rightArmStreak} L=${this._leftArmStreak}`
        + `\nMP12->16: ${sw(12, 16)}`
        + `\nMP11->15: ${sw(11, 15)}`
        + `\nrestRUpDir: ${fmtV(rdr)}`
        + `\nrestLUpDir: ${fmtV(ldr)}`;
    }

    // Hand writes: hand-solve only, no longer mix in pose-Z.
    if (handDetected(leftHandLandmarks)) {
      riggedLeftHand = Kalidokit.Hand.solve(leftHandLandmarks, "Left");
      this._writeHand(vrm, "Left", riggedLeftHand);
    }

    if (handDetected(rightHandLandmarks)) {
      riggedRightHand = Kalidokit.Hand.solve(rightHandLandmarks, "Right");
      this._writeHand(vrm, "Right", riggedRightHand);
    }

    return { hasPose: !!riggedPose, hasLeft: !!riggedLeftHand, hasRight: !!riggedRightHand };
  }
}
