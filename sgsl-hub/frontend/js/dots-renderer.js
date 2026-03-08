/* ============================================================
   SgSL Hub — Dots-Only Landmark Renderer
   ============================================================
   Simple 2D canvas renderer that draws hand/face/pose landmarks
   as colored dots and connections. Useful for debugging sign
   accuracy without the complexity of the 3D avatar.

   Includes a One-Euro filter for temporal stabilization to
   reduce jitter in landmark positions frame-to-frame.

   Implements the same playback API as HumanoidAvatar so it can
   be swapped in as a drop-in replacement.
   ============================================================ */

const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17],
];

const FINGER_TIPS = [4, 8, 12, 16, 20];

// ─── One-Euro Filter for landmark stabilization ─────────────
// Reduces jitter while preserving fast movements

class OneEuroScalar {
  constructor(minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }

  _alpha(cutoff, dt) {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  filter(x, t) {
    if (this.tPrev === null) {
      this.xPrev = x;
      this.tPrev = t;
      return x;
    }
    const dt = Math.max(t - this.tPrev, 1e-6);

    // Derivative (speed)
    const dx = (x - this.xPrev) / dt;
    const adx = this._alpha(this.dCutoff, dt);
    const dxHat = adx * dx + (1 - adx) * this.dxPrev;

    // Adaptive cutoff based on speed
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const ax = this._alpha(cutoff, dt);
    const xHat = ax * x + (1 - ax) * this.xPrev;

    this.xPrev = xHat;
    this.dxPrev = dxHat;
    this.tPrev = t;
    return xHat;
  }

  reset() {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }
}

class LandmarkFilter {
  constructor(count, minCutoff = 3.0, beta = 0.05) {
    this.filters = [];
    for (let i = 0; i < count; i++) {
      this.filters.push({
        x: new OneEuroScalar(minCutoff, beta),
        y: new OneEuroScalar(minCutoff, beta),
        z: new OneEuroScalar(minCutoff, beta),
      });
    }
  }

  filter(landmarks, t) {
    if (!landmarks) return null;
    return landmarks.map((lm, i) => {
      if (i >= this.filters.length) return lm;
      const f = this.filters[i];
      return [
        f.x.filter(lm[0], t),
        f.y.filter(lm[1], t),
        f.z.filter(lm[2] ?? 0, t),
      ];
    });
  }

  reset() {
    for (const f of this.filters) {
      f.x.reset();
      f.y.reset();
      f.z.reset();
    }
  }
}

// ─── Dots Renderer ──────────────────────────────────────────

export class DotsRenderer {
  constructor(container) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'width:100%;height:100%;display:block;background:#1a1a2e;border-radius:8px;';
    this.ctx = this.canvas.getContext('2d');

    this.seq = [];
    this.fi = 0;
    this.fAcc = 0;
    this.speed = 1;
    this.playing = false;
    this.paused = false;
    this.lastT = 0;
    this.rafId = null;
    this._onFrame = null;
    this._onDone = null;
    this.loaded = true;

    // Stabilization filters (21 landmarks per hand, face subset)
    // Lower minCutoff = more smoothing; lower beta = less speed adaptation (smoother)
    this._filters = {
      leftHand:  new LandmarkFilter(21, 0.8, 0.01),
      rightHand: new LandmarkFilter(21, 0.8, 0.01),
      face:      new LandmarkFilter(50, 0.5, 0.005),
    };

    // Resize observer
    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(container);

    container.appendChild(this.canvas);
    this._resize();
    this._drawEmpty();
  }

  _resize() {
    const w = this.container.clientWidth || 400;
    const h = this.container.clientHeight || 400;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.W = w;
    this.H = h;
  }

  _drawEmpty() {
    const { ctx, W, H } = this;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#555';
    ctx.font = '14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Dots mode — select a sign to play', W / 2, H / 2);
  }

  _toFrame(fr) {
    if (!fr) return null;
    if (fr.leftHand !== undefined || fr.rightHand !== undefined)
      return { leftHand: fr.leftHand || null, rightHand: fr.rightHand || null, face: fr.face || null, pose: fr.pose || null };
    if (!Array.isArray(fr)) return null;
    if (fr.length >= 21 && Array.isArray(fr[0]) && typeof fr[0][0] === 'number')
      return { rightHand: fr, leftHand: null, face: null, pose: null };
    if (fr.length <= 2 && Array.isArray(fr[0]) && fr[0].length >= 21
        && Array.isArray(fr[0][0]) && fr[0][0].length >= 2) {
      return { rightHand: fr[0], leftHand: fr.length === 2 ? fr[1] : null, face: null, pose: null };
    }
    return null;
  }

  // Lerp between two frames for smooth playback
  _lerp(a, b, t) {
    if (!a) return b;
    if (!b) return a;
    return {
      leftHand: this._lerpHand(a.leftHand, b.leftHand, t),
      rightHand: this._lerpHand(a.rightHand, b.rightHand, t),
      face: this._lerpHand(a.face, b.face, t),
      pose: this._lerpHand(a.pose, b.pose, t),
    };
  }

  _lerpHand(a, b, t) {
    if (!a) return b;
    if (!b) return a;
    return b.map((lm, i) => [
      a[i][0] + (lm[0] - a[i][0]) * t,
      a[i][1] + (lm[1] - a[i][1]) * t,
      (a[i][2] ?? 0) + ((lm[2] ?? 0) - (a[i][2] ?? 0)) * t,
    ]);
  }

  // Apply stabilization filter to a frame
  _stabilize(frame) {
    if (!frame) return frame;
    const t = performance.now() / 1000;
    return {
      leftHand:  this._filters.leftHand.filter(frame.leftHand, t),
      rightHand: this._filters.rightHand.filter(frame.rightHand, t),
      face:      this._filters.face.filter(frame.face, t),
      pose:      frame.pose, // pass through
    };
  }

  _resetFilters() {
    this._filters.leftHand.reset();
    this._filters.rightHand.reset();
    this._filters.face.reset();
  }

  // ─── Drawing ──────────────────────────────────────────────

  _drawHand(lm, strokeColor, dotColor, label) {
    if (!lm || lm.length < 21) return;
    const { ctx, W, H } = this;
    const PAD = 0.1; // 10% padding

    // Map normalized coords to canvas with padding
    const px = (v) => (PAD + v * (1 - 2 * PAD)) * W;
    const py = (v) => (PAD + v * (1 - 2 * PAD)) * H;

    // Draw connections
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    for (const [a, b] of HAND_CONNECTIONS) {
      if (a >= lm.length || b >= lm.length) continue;
      ctx.beginPath();
      ctx.moveTo(px(lm[a][0]), py(lm[a][1]));
      ctx.lineTo(px(lm[b][0]), py(lm[b][1]));
      ctx.stroke();
    }

    // Draw dots
    for (let i = 0; i < Math.min(lm.length, 21); i++) {
      const isTip = FINGER_TIPS.includes(i);
      const r = isTip ? 5 : 3;
      ctx.beginPath();
      ctx.arc(px(lm[i][0]), py(lm[i][1]), r, 0, Math.PI * 2);
      ctx.fillStyle = isTip ? dotColor : strokeColor;
      ctx.fill();
    }

    // Label
    if (label) {
      ctx.fillStyle = dotColor;
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, px(lm[0][0]), py(lm[0][1]) - 12);
    }
  }

  _drawFace(face) {
    if (!face || face.length < 5) return;
    const { ctx, W, H } = this;
    const PAD = 0.1;
    const px = (v) => (PAD + v * (1 - 2 * PAD)) * W;
    const py = (v) => (PAD + v * (1 - 2 * PAD)) * H;

    for (let i = 0; i < face.length; i++) {
      ctx.beginPath();
      ctx.arc(px(face[i][0]), py(face[i][1]), 2, 0, Math.PI * 2);
      ctx.fillStyle = '#00E6FF';
      ctx.fill();
    }
  }

  render(frame) {
    if (!frame) { this._drawEmpty(); return; }

    // Apply stabilization
    const stable = this._stabilize(frame);

    const { ctx, W, H } = this;
    ctx.clearRect(0, 0, W, H);

    // Draw face first (background layer)
    if (stable.face) this._drawFace(stable.face);

    // Draw hands
    if (stable.rightHand) {
      this._drawHand(stable.rightHand, 'rgba(108, 99, 255, 0.7)', '#6C63FF', 'R');
    }
    if (stable.leftHand) {
      this._drawHand(stable.leftHand, 'rgba(72, 199, 142, 0.7)', '#48C78E', 'L');
    }

    // Frame counter in corner
    if (this.playing) {
      ctx.fillStyle = '#666';
      ctx.font = '11px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${this.fi + 1}/${this.seq.length}`, W - 8, H - 8);
    }
  }

  // ─── Playback API (same interface as HumanoidAvatar) ──────

  playSequence(landmarks, speed = 1, onFrame = null, onDone = null) {
    this.seq = (landmarks || [])
      .map(f => this._toFrame(f))
      .filter(f => f && (f.leftHand || f.rightHand));

    if (!this.seq.length) return false;

    this.speed = speed;
    this.fi = 0;
    this.fAcc = 0;
    this.playing = true;
    this.paused = false;
    this._onFrame = onFrame;
    this._onDone = onDone;
    this.lastT = performance.now();
    this._resetFilters();

    if (this.rafId) cancelAnimationFrame(this.rafId);
    this._tick();
    return true;
  }

  _tick() {
    if (!this.playing || this.paused) return;
    const now = performance.now();
    const dt = Math.min((now - this.lastT) / 1000, 0.05);
    this.fAcc += dt * 30 * this.speed;
    this.lastT = now;

    let steps = 0;
    while (this.fAcc >= 1 && this.fi < this.seq.length - 1 && steps < 2) {
      this.fi++; this.fAcc -= 1; steps++;
      if (this._onFrame) this._onFrame(this.fi, this.seq.length);
    }
    if (this.fAcc > 1) this.fAcc = 1;

    if (this.fi >= this.seq.length - 1) {
      this.render(this.seq[this.seq.length - 1]);
      this.playing = false;
      if (this._onDone) this._onDone();
      return;
    }

    const t = Math.min(this.fAcc, 1);
    this.render(this._lerp(this.seq[this.fi], this.seq[this.fi + 1], t));
    this.rafId = requestAnimationFrame(() => this._tick());
  }

  togglePause() {
    this.paused = !this.paused;
    if (!this.paused) { this.lastT = performance.now(); this._tick(); }
    return this.paused;
  }

  replay() {
    this.fi = 0; this.fAcc = 0;
    this.paused = false; this.playing = true;
    this.lastT = performance.now();
    this._resetFilters();
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this._tick();
  }

  setSpeed(s) { this.speed = s; }
  isPlaying() { return this.playing && !this.paused; }
  getFrameInfo() { return { current: this.fi, total: this.seq.length }; }

  // No-ops for API compatibility
  setCharacter() {}
  setZoom() {}
  getCharacters() { return []; }

  destroy() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this._ro.disconnect();
    this.canvas.remove();
  }
}
