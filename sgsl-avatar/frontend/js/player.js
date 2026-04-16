/* ============================================================
   SgSL Avatar — Playback Engine
   ============================================================
   Drives sign playback on the SMPL-X avatar. Handles:
   - Frame-by-frame playback with timing
   - Min-jerk interpolation between frames
   - Pause/resume/replay/speed controls
   - Sign loading from backend API
   ============================================================ */

import { SMPLXAvatar } from './avatar.js';
import { SMPLXRetarget } from './retarget.js';

// ─── Min-jerk interpolation ─────────────────────────────────
function mjEval(x0, xf, t) {
  // 5th-order polynomial: smooth start and stop
  const t3 = t * t * t;
  const t4 = t3 * t;
  const t5 = t4 * t;
  return x0 + (xf - x0) * (10 * t3 - 15 * t4 + 6 * t5);
}

function lerpHand(a, b, t) {
  if (!a) return b;
  if (!b) return a;
  return b.map((lm, i) => [
    mjEval(a[i][0], lm[0], t),
    mjEval(a[i][1], lm[1], t),
    mjEval(a[i][2] ?? 0, lm[2] ?? 0, t),
  ]);
}

function lerpFrame(a, b, t) {
  if (!a) return b;
  return {
    leftHand:  lerpHand(a.leftHand, b.leftHand, t),
    rightHand: lerpHand(a.rightHand, b.rightHand, t),
    face:      lerpHand(a.face, b.face, t),
    pose:      lerpHand(a.pose, b.pose, t),
  };
}

// ─── Main application ───────────────────────────────────────

let avatar = null;
let retarget = null;
let signs = [];

// Playback state
let seq = [];
let playing = false;
let paused = false;
let fi = 0;
let fAcc = 0;
let speed = 1;
let lastT = 0;
let rafId = null;

// ─── API ────────────────────────────────────────────────────

async function fetchSigns() {
  const res = await fetch('/api/signs');
  if (!res.ok) throw new Error('Failed to load signs');
  return res.json();
}

async function fetchSign(label) {
  const res = await fetch(`/api/sign/${label}`);
  if (!res.ok) throw new Error(`Sign "${label}" not found`);
  return res.json();
}

// ─── Playback ───────────────────────────────────────────────

function tick() {
  if (!playing || paused) return;

  const now = performance.now();
  const dt = Math.min((now - lastT) / 1000, 0.05);
  fAcc += dt * 30 * speed;
  lastT = now;

  let steps = 0;
  while (fAcc >= 1 && fi < seq.length - 1 && steps < 2) {
    fi++; fAcc -= 1; steps++;
  }
  if (fAcc > 1) fAcc = 1;

  // Update progress bar
  const prog = document.getElementById('progress-fill');
  const info = document.getElementById('frame-info');
  if (prog) prog.style.width = `${(fi / Math.max(seq.length - 1, 1)) * 100}%`;
  if (info) info.textContent = `${fi + 1} / ${seq.length}`;

  if (fi >= seq.length - 1) {
    renderFrame(seq[seq.length - 1]);
    playing = false;
    avatar.setPlaying(false);
    updatePlayBtn();
    setStatus('Playback complete.', 'success');
    return;
  }

  // Interpolate between current and next frame
  const t = Math.min(fAcc, 1);
  renderFrame(lerpFrame(seq[fi], seq[fi + 1], t));
  rafId = requestAnimationFrame(tick);
}

function renderFrame(frame) {
  if (!avatar || !retarget || !frame) return;
  const data = avatar.renderFrame(frame);
  if (!data) return;
  retarget.applyFrame(data.bones, data.restPose, frame, avatar.getCalibration());
  avatar.updateVisuals();
}

async function playSign(label) {
  setStatus(`Loading "${label}"...`, 'loading');
  try {
    const data = await fetchSign(label);
    seq = (data.landmarks || []).filter(f =>
      f && (f.leftHand || f.rightHand));
    if (!seq.length) {
      setStatus(`No valid frames for "${label}".`, 'error');
      avatar.setPlaying(false);
      return;
    }

    retarget.reset();
    fi = 0; fAcc = 0;
    playing = true; paused = false;
    avatar.setPlaying(true);
    lastT = performance.now();
    if (rafId) cancelAnimationFrame(rafId);
    updatePlayBtn();
    setStatus(`Playing "${label}" (${seq.length} frames)`, 'info');
    tick();
  } catch (err) {
    setStatus(err.message, 'error');
  }
}

function togglePause() {
  if (!playing) return;
  paused = !paused;
  if (!paused) { lastT = performance.now(); tick(); }
  updatePlayBtn();
}

function replay() {
  if (!seq.length) return;
  retarget.reset();
  fi = 0; fAcc = 0;
  paused = false; playing = true;
  lastT = performance.now();
  if (rafId) cancelAnimationFrame(rafId);
  updatePlayBtn();
  tick();
}

function stopPlayback() {
  playing = false;
  paused = false;
  if (avatar) avatar.setPlaying(false);
  if (rafId) cancelAnimationFrame(rafId);
  updatePlayBtn();
}

// ─── UI helpers ─────────────────────────────────────────────

function setStatus(msg, type) {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = msg;
  el.className = `status status-${type}`;
}

function updatePlayBtn() {
  const btn = document.getElementById('btn-pause');
  if (btn) btn.textContent = paused ? 'Resume' : 'Pause';
}

// ─── Init ───────────────────────────────────────────────────

async function init() {
  // Create avatar
  avatar = new SMPLXAvatar('avatar-viewport');
  retarget = new SMPLXRetarget();

  // Load sign library
  try {
    signs = await fetchSigns();
    const list = document.getElementById('sign-list');
    if (list) {
      list.innerHTML = '';
      for (const s of signs) {
        const row = document.createElement('div');
        row.className = 'sign-row';

        const btn = document.createElement('button');
        btn.className = 'sign-btn';
        btn.textContent = s.label;
        btn.title = `${s.frames} frames`;
        btn.addEventListener('click', () => {
          list.querySelectorAll('.sign-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          playSign(s.label);
        });

        const delBtn = document.createElement('button');
        delBtn.className = 'sign-del';
        delBtn.textContent = '\u00d7';
        delBtn.title = `Delete "${s.label}"`;
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm(`Delete sign "${s.label}"?`)) return;
          try {
            const res = await fetch(`/api/sign/${s.label}`, { method: 'DELETE' });
            if (res.ok) {
              row.remove();
              setStatus(`"${s.label}" deleted.`, 'info');
            }
          } catch (err) {
            setStatus(`Delete failed: ${err.message}`, 'error');
          }
        });

        row.appendChild(btn);
        row.appendChild(delBtn);
        list.appendChild(row);
      }
    }
    setStatus(`${signs.length} signs loaded. Click one to play.`, 'success');
  } catch (err) {
    setStatus(`Failed to load signs: ${err.message}`, 'error');
  }

  // Controls
  document.getElementById('btn-pause')?.addEventListener('click', togglePause);
  document.getElementById('btn-replay')?.addEventListener('click', replay);
  document.getElementById('btn-stop')?.addEventListener('click', stopPlayback);

  const speedSlider = document.getElementById('speed-slider');
  const speedLabel = document.getElementById('speed-label');
  if (speedSlider) {
    speedSlider.addEventListener('input', () => {
      speed = parseFloat(speedSlider.value);
      if (speedLabel) speedLabel.textContent = `${speed.toFixed(1)}x`;
    });
  }
}

// Auto-init when imported
init();
