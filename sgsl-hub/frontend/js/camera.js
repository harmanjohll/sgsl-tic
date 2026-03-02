/* ============================================================
   SgSL Hub — Camera & Hand Tracking Manager
   ============================================================
   Handles camera permissions, MediaPipe Hands setup, and
   provides a clean API for starting/stopping tracking.
   ============================================================ */

const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17],
];

export class HandTracker {
  constructor(videoEl, canvasEl, { onResults, onHandDetected, onHandLost } = {}) {
    this.video = videoEl;
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.onResults = onResults;
    this.onHandDetected = onHandDetected;
    this.onHandLost = onHandLost;
    this.hands = null;
    this.mpCamera = null;
    this.running = false;
    this.handVisible = false;
  }

  async start() {
    // Request camera with explicit user gesture
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    this.video.srcObject = stream;
    await this.video.play();

    // Sync canvas size
    this.canvas.width = this.video.videoWidth;
    this.canvas.height = this.video.videoHeight;

    // MediaPipe Hands
    this.hands = new window.Hands({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
    });
    this.hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.5,
    });
    this.hands.onResults(results => this._processResults(results));

    // Camera utility for frame pumping
    this.mpCamera = new window.Camera(this.video, {
      onFrame: async () => {
        if (this.running) await this.hands.send({ image: this.video });
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

    if (results.multiHandLandmarks?.length > 0) {
      const landmarks = results.multiHandLandmarks[0];

      // Draw connections
      ctx.strokeStyle = 'rgba(108, 99, 255, 0.6)';
      ctx.lineWidth = 3;
      for (const [a, b] of HAND_CONNECTIONS) {
        ctx.beginPath();
        ctx.moveTo(landmarks[a].x * canvas.width, landmarks[a].y * canvas.height);
        ctx.lineTo(landmarks[b].x * canvas.width, landmarks[b].y * canvas.height);
        ctx.stroke();
      }

      // Draw joints
      for (let i = 0; i < landmarks.length; i++) {
        const x = landmarks[i].x * canvas.width;
        const y = landmarks[i].y * canvas.height;
        const isTip = [4, 8, 12, 16, 20].includes(i);
        ctx.beginPath();
        ctx.arc(x, y, isTip ? 5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = isTip ? '#A59FFF' : '#6C63FF';
        ctx.fill();
      }

      // Extract as array of [x, y, z]
      const pts = landmarks.map(l => [l.x, l.y, l.z ?? 0]);

      if (!this.handVisible) {
        this.handVisible = true;
        this.onHandDetected?.();
      }

      this.onResults?.(pts);
    } else {
      if (this.handVisible) {
        this.handVisible = false;
        this.onHandLost?.();
      }
    }
  }
}
