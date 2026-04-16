/* ============================================================
   SgSL Avatar — Playback Engine
   ============================================================
   Drives sign playback on the VRM avatar. Handles:
   - Real-timestamp-driven playback (no fixed-fps assumption)
   - Min-jerk interpolation between frames (all channels in sync)
   - Pause/resume/replay/speed controls
   - Sign loading from backend API

   Schema v2: each frame has { t, pose, poseWorld, face, leftHand, rightHand }
   where t is ms since recording start. Schema v1 (no t, no poseWorld) is
   rejected by the backend — legacy signs are expected to be re-recorded.
   ============================================================ */

import { SMPLXAvatar } from './avatar.js';
import { SMPLXRetarget } from './retarget.js';

// ─── Min-jerk interpolation ─────────────────────────────────
function mjEval(x0, xf, t) {
  const t3 = t * t * t;
  const t4 = t3 * t;
  const t5 = t4 * t;
  return x0 + (xf - x0) * (10 * t3 - 15 * t4 + 6 * t5);
}

function lerpLM(a, b, t) {
  if (!a) return b;
  if (!b) return a;
  return b.map((lm, i) => {
    const pa = a[i] || lm;
    const out = [
      mjEval(pa[0] ?? lm[0], lm[0], t),
      mjEval(pa[1] ?? lm[1], lm[1], t),
      mjEval(pa[2] ?? 0, lm[2] ?? 0, t),
    ];
    if (lm.length > 3) out.push(lm[3]);  // preserve visibility unchanged
    return out;
  });
}

function lerpFrame(a, b, t) {
  if (!a) return b;
  return {
    leftHand:  lerpLM(a.leftHand, b.leftHand, t),
    rightHand: lerpLM(a.rightHand, b.rightHand, t),
    face:      lerpLM(a.face, b.face, t),
    pose:      lerpLM(a.pose, b.pose, t),
    poseWorld: lerpLM(a.poseWorld, b.poseWorld, t),
  };
}

// ─── Main application ───────────────────────────────────────

let avatar = null;
let retarget = null;
let signs = [];

// Playback state (timestamp-driven)
let seq = [];
let playing = false;
let paused = false;
let fi = 0;
let speed = 1;
let startWall = 0;   // performance.now() at playback start
let startT = 0;      // seq[0].t at playback start
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

function currentTargetT() {
  return startT + (performance.now() - startWall) * speed;
}

function tick() {
  if (!playing || paused) return;

  const targetT = currentTargetT();

  // Advance fi to the last frame whose timestamp is <= targetT.
  while (fi < seq.length - 2 && seq[fi + 1].t <= targetT) fi++;

  const prog = document.getElementById('progress-fill');
  const info = document.getElementById('frame-info');
  if (prog) prog.style.width = `${(fi / Math.max(seq.length - 1, 1)) * 100}%`;
  if (info) info.textContent = `${fi + 1} / ${seq.length}`;

  if (targetT >= seq[seq.length - 1].t) {
    renderFrame(seq[seq.length - 1]);
    playing = false;
    avatar.setPlaying(false);
    updatePlayBtn();
    setStatus('Playback complete.', 'success');
    return;
  }

  const a = seq[fi];
  const b = seq[fi + 1];
  const span = Math.max(b.t - a.t, 1);
  const u = Math.min(Math.max((targetT - a.t) / span, 0), 1);
  renderFrame(lerpFrame(a, b, u));
  rafId = requestAnimationFrame(tick);
}

function renderFrame(frame) {
  if (!avatar?.vrm || !retarget || !frame) return;

  // Kalidokit.Pose.solve(world3D, screen2D).
  // Kalidokit.Face.solve needs 478 face landmarks.
  // Kalidokit.Hand.solve is passed raw MediaPipe-side labels; the
  // retarget layer swaps to the signer's own-side perspective.
  const toMP = (arr) => arr ? arr.map(p => ({
    x: p[0],
    y: p[1],
    z: p[2] ?? 0,
    visibility: p[3] ?? 1,
  })) : null;

  const fakeResults = {
    poseLandmarks: toMP(frame.pose),
    za: toMP(frame.poseWorld || frame.pose),
    faceLandmarks: toMP(frame.face),
    rightHandLandmarks: toMP(frame.rightHand),
    leftHandLandmarks: toMP(frame.leftHand),
  };

  retarget.applyFromMediaPipe(avatar.vrm, fakeResults);
}

async function playSign(label) {
  setStatus(`Loading "${label}"...`, 'loading');
  try {
    const data = await fetchSign(label);
    const frames = (data.landmarks || []).filter(f => f && (f.pose || f.leftHand || f.rightHand));
    if (!frames.length) {
      setStatus(`No valid frames for "${label}".`, 'error');
      avatar.setPlaying(false);
      return;
    }

    // Backfill timestamps if missing (schema v1). Assume 30 fps as a
    // last resort so legacy signs still play back at ~roughly the right
    // speed. New recordings (schema v2) carry real timestamps.
    const hasT = frames.every(f => typeof f.t === 'number');
    if (!hasT) {
      for (let i = 0; i < frames.length; i++) frames[i] = { ...frames[i], t: i * (1000 / 30) };
    }

    seq = frames;
    retarget.reset();
    fi = 0;
    playing = true; paused = false;
    avatar.setPlaying(true);
    startWall = performance.now();
    startT = seq[0].t;
    if (rafId) cancelAnimationFrame(rafId);
    updatePlayBtn();
    const durS = ((seq[seq.length - 1].t - seq[0].t) / 1000).toFixed(1);
    setStatus(`Playing "${label}" (${seq.length} frames, ${durS}s)`, 'info');
    tick();
  } catch (err) {
    setStatus(err.message, 'error');
  }
}

function togglePause() {
  if (!playing) return;
  if (!paused) {
    // pausing: remember the elapsed logical time
    startT = currentTargetT();
    paused = true;
  } else {
    // resuming: reset wall anchor so elapsed logical time continues
    startWall = performance.now();
    paused = false;
    tick();
  }
  updatePlayBtn();
}

function replay() {
  if (!seq.length) return;
  retarget.reset();
  fi = 0;
  paused = false; playing = true;
  startWall = performance.now();
  startT = seq[0].t;
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
  avatar = new SMPLXAvatar('avatar-viewport');
  retarget = new SMPLXRetarget();
  retarget.setVideo(null);  // viewer has no camera feed
  retarget.setAvatar(avatar);

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

  document.getElementById('btn-pause')?.addEventListener('click', togglePause);
  document.getElementById('btn-replay')?.addEventListener('click', replay);
  document.getElementById('btn-stop')?.addEventListener('click', stopPlayback);

  const speedSlider = document.getElementById('speed-slider');
  const speedLabel = document.getElementById('speed-label');
  if (speedSlider) {
    speedSlider.addEventListener('input', () => {
      // Rebase time anchors so mid-play speed change doesn't jump.
      if (playing && !paused) {
        startT = currentTargetT();
        startWall = performance.now();
      }
      speed = parseFloat(speedSlider.value);
      if (speedLabel) speedLabel.textContent = `${speed.toFixed(1)}x`;
    });
  }
}

init();
