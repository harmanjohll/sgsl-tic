/* ============================================================
   SgSL Hub — Hand Tracking (MediaPipe Wrapper)
   ============================================================
   Provides a reusable HandTracker class that:
   - Initializes MediaPipe Hands
   - Manages the camera feed
   - Draws hand landmarks on an overlay canvas
   - Supports frame recording for sign capture
   ============================================================ */

import { MEDIAPIPE_CDN, HAND_OPTIONS, CAMERA_SIZE } from './config.js';

export class HandTracker {
  /**
   * @param {HTMLVideoElement} videoEl
   * @param {HTMLCanvasElement} canvasEl
   * @param {Object} opts
   * @param {Function} [opts.onFrame] - Called each frame with { landmarks, image }
   */
  constructor(videoEl, canvasEl, opts = {}) {
    this.videoEl = videoEl;
    this.canvasEl = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.onFrameCb = opts.onFrame || null;

    this.hands = null;
    this.camera = null;
    this.recording = false;
    this.frames = [];
    this._started = false;
  }

  /** Initialize MediaPipe Hands and start the camera. */
  async start() {
    if (this._started) return;
    this._started = true;

    // Match canvas to container size
    this._resizeCanvas();

    this.hands = new Hands({
      locateFile: f => `${MEDIAPIPE_CDN}/${f}`,
    });
    this.hands.setOptions(HAND_OPTIONS);
    this.hands.onResults(r => this._onResults(r));

    this.camera = new Camera(this.videoEl, {
      onFrame: async () => this.hands.send({ image: this.videoEl }),
      width: CAMERA_SIZE.width,
      height: CAMERA_SIZE.height,
    });

    await this.camera.start();
  }

  /** Stop the camera and release resources. */
  stop() {
    if (this.camera) {
      this.camera.stop();
      this.camera = null;
    }
    this._started = false;
  }

  /** Begin recording frames. */
  startRecording() {
    this.frames = [];
    this.recording = true;
  }

  /** Stop recording and return the captured frames. */
  stopRecording() {
    this.recording = false;
    const captured = this.frames;
    this.frames = [];
    return captured;
  }

  /** @private */
  _resizeCanvas() {
    const rect = this.canvasEl.parentElement.getBoundingClientRect();
    this.canvasEl.width = rect.width;
    this.canvasEl.height = rect.height;
  }

  /** @private */
  _onResults(results) {
    const { ctx, canvasEl } = this;
    const w = canvasEl.width;
    const h = canvasEl.height;

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(results.image, 0, 0, w, h);

    const allHands = results.multiHandLandmarks || [];

    // Draw landmarks
    allHands.forEach(landmarks => {
      drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
        color: 'rgba(108, 99, 255, 0.7)',
        lineWidth: 2,
      });
      drawLandmarks(ctx, landmarks, {
        color: '#6C63FF',
        fillColor: 'rgba(108, 99, 255, 0.4)',
        lineWidth: 1,
        radius: 3,
      });
    });

    // Record if active
    if (this.recording) {
      this.frames.push(
        allHands.map(h => h.map(p => [p.x, p.y, p.z]))
      );
    }

    // Notify callback
    if (this.onFrameCb) {
      this.onFrameCb({
        landmarks: allHands,
        image: results.image,
        handsDetected: allHands.length,
      });
    }
  }
}
