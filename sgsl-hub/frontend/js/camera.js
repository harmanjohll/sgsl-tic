/* ============================================================
   SgSL Hub — Camera & Holistic Tracking Manager
   ============================================================
   Uses MediaPipe Holistic to capture two hands, face mesh, and
   body pose in a single pass. Provides a clean API for modules.

   Frame format emitted via onResults callback:
   {
     leftHand:  [[x,y,z], ...] | null,   // 21 landmarks
     rightHand: [[x,y,z], ...] | null,   // 21 landmarks
     face:      [[x,y,z], ...] | null,   // key face landmarks (subset)
     pose:      [[x,y,z], ...] | null,   // 33 pose landmarks
   }
   ============================================================ */

const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17],
];

// Key face landmark indices (from MediaPipe 468-point mesh)
// We store a meaningful subset for sign language: brows, eyes, nose, mouth, jaw
const FACE_KEY_INDICES = [
  // Brows (10 points)
  70, 63, 105, 66, 107,   // left brow
  336, 296, 334, 293, 300, // right brow
  // Eyes (8 points)
  33, 133, 159, 145,       // left eye corners + top/bottom
  362, 263, 386, 374,      // right eye corners + top/bottom
  // Nose (3 points)
  1, 4, 5,
  // Mouth (8 points — outer ring)
  61, 291, 0, 17, 13, 14, 78, 308,
  // Jaw / chin (3 points)
  152, 234, 454,
];

function _extractArray(lm) {
  if (!lm) return null;
  return lm.map(l => [l.x, l.y, l.z ?? 0]);
}

function _extractFaceSubset(faceLandmarks) {
  if (!faceLandmarks || faceLandmarks.length < 468) return null;
  return FACE_KEY_INDICES.map(i => [
    faceLandmarks[i].x,
    faceLandmarks[i].y,
    faceLandmarks[i].z ?? 0,
  ]);
}

export class HolisticTracker {
  constructor(videoEl, canvasEl, { onResults, onTrackingDetected, onTrackingLost } = {}) {
    this.video = videoEl;
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.onResults = onResults;
    this.onTrackingDetected = onTrackingDetected;
    this.onTrackingLost = onTrackingLost;
    this.holistic = null;
    this.mpCamera = null;
    this.running = false;
    this.trackingVisible = false;
  }

  async start() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    this.video.srcObject = stream;
    await this.video.play();

    this.canvas.width = this.video.videoWidth;
    this.canvas.height = this.video.videoHeight;

    // MediaPipe Holistic — two hands + face + pose in one model
    this.holistic = new window.Holistic({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629/${f}`,
    });
    this.holistic.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      smoothSegmentation: false,
      refineFaceLandmarks: true,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.5,
    });
    this.holistic.onResults(results => this._processResults(results));

    this.mpCamera = new window.Camera(this.video, {
      onFrame: async () => {
        if (this.running) await this.holistic.send({ image: this.video });
      },
      width: 640,
      height: 480,
    });

    this.running = true;
    this.mpCamera.start();
  }

  stop() {
    this.running = false;
    if (this.mpCamera) this.mpCamera.stop();
    const stream = this.video.srcObject;
    if (stream) stream.getTracks().forEach(t => t.stop());
    this.video.srcObject = null;
  }

  _processResults(results) {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const hasLeft = results.leftHandLandmarks?.length > 0;
    const hasRight = results.rightHandLandmarks?.length > 0;
    const hasFace = results.faceLandmarks?.length > 0;
    const hasAny = hasLeft || hasRight;

    // Draw left hand (green-blue)
    if (hasLeft) {
      this._drawHand(results.leftHandLandmarks, 'rgba(72, 199, 142, 0.7)', '#48C78E');
    }

    // Draw right hand (purple)
    if (hasRight) {
      this._drawHand(results.rightHandLandmarks, 'rgba(108, 99, 255, 0.6)', '#6C63FF');
    }

    // Draw face dots (subtle)
    if (hasFace) {
      for (const idx of FACE_KEY_INDICES) {
        if (idx < results.faceLandmarks.length) {
          const lm = results.faceLandmarks[idx];
          ctx.beginPath();
          ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 1.5, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 180, 100, 0.5)';
          ctx.fill();
        }
      }
    }

    if (hasAny) {
      // Build structured frame
      const frame = {
        leftHand: hasLeft ? _extractArray(results.leftHandLandmarks) : null,
        rightHand: hasRight ? _extractArray(results.rightHandLandmarks) : null,
        face: hasFace ? _extractFaceSubset(results.faceLandmarks) : null,
        pose: results.poseLandmarks ? _extractArray(results.poseLandmarks) : null,
      };

      if (!this.trackingVisible) {
        this.trackingVisible = true;
        this.onTrackingDetected?.();
      }

      this.onResults?.(frame);
    } else {
      if (this.trackingVisible) {
        this.trackingVisible = false;
        this.onTrackingLost?.();
      }
    }
  }

  _drawHand(landmarks, strokeColor, dotColor) {
    const { ctx, canvas } = this;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 3;
    for (const [a, b] of HAND_CONNECTIONS) {
      ctx.beginPath();
      ctx.moveTo(landmarks[a].x * canvas.width, landmarks[a].y * canvas.height);
      ctx.lineTo(landmarks[b].x * canvas.width, landmarks[b].y * canvas.height);
      ctx.stroke();
    }
    const tips = [4, 8, 12, 16, 20];
    for (let i = 0; i < landmarks.length; i++) {
      ctx.beginPath();
      ctx.arc(
        landmarks[i].x * canvas.width,
        landmarks[i].y * canvas.height,
        tips.includes(i) ? 5 : 3, 0, Math.PI * 2,
      );
      ctx.fillStyle = tips.includes(i) ? dotColor : strokeColor;
      ctx.fill();
    }
  }
}

// Re-export key face indices so other modules can reference the count
export const FACE_LANDMARK_COUNT = FACE_KEY_INDICES.length;
