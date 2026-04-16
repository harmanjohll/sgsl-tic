/* ============================================================
   SgSL Avatar — Sign Recorder
   ============================================================
   - Live MediaPipe Holistic capture with VRM avatar preview.
   - Deterministic framing gate: signer must be centered and at
     the right distance before Record is enabled. No more guessing
     and re-recording.
   - Calibration pose: 1.5s "hold still, arms at sides" baseline
     captured when starting a session. Stored with each sign so
     future ML pipelines can normalize across signers.
   - Per-frame timestamps (schema v2) so playback stays at the
     signer's real cadence.
   ============================================================ */

import { SMPLXAvatar } from './avatar.js';
import { SMPLXRetarget } from './retarget.js';
import { QualityGate, framingScore } from './quality.js';

// ─── State ──────────────────────────────────────────────────
let avatar = null;
let retarget = null;
let holisticModel = null;
let camera = null;
let recording = false;
let frames = [];
let startTime = 0;          // performance.now() at record start
let timerInterval = null;
let lastQuality = null;
let inited = false;

// Framing gate state.
let framingOk = false;
let framingStreak = 0;       // consecutive frames in the target box
const FRAMING_STREAK_REQUIRED = 30;  // ~1s at 30fps
let latestFraming = null;    // {ok, score, reasons[]}

// Calibration state.
let calibrating = false;
let calibBuf = [];           // pose frames captured during calibration
let calibBaseline = null;    // persisted baseline for this session

// ─── Init ───────────────────────────────────────────────────
export async function init() {
  if (inited) return;
  inited = true;

  avatar = new SMPLXAvatar('rec-avatar-viewport');
  retarget = new SMPLXRetarget();
  retarget.setVideo(document.getElementById('rec-video'));
  retarget.setAvatar(avatar);

  await setupMediaPipe();

  document.getElementById('btn-rec-start')?.addEventListener('click', startRecording);
  document.getElementById('btn-rec-stop')?.addEventListener('click', stopRecording);
  document.getElementById('btn-rec-preview')?.addEventListener('click', previewRecording);
  document.getElementById('btn-rec-save')?.addEventListener('click', saveRecording);
  document.getElementById('btn-rec-discard')?.addEventListener('click', discardRecording);
  document.getElementById('btn-calibrate')?.addEventListener('click', startCalibration);

  // Record is disabled until framing is good AND calibration exists.
  const startBtn = document.getElementById('btn-rec-start');
  if (startBtn) startBtn.disabled = true;

  setRecStatus('Stand so the green guide turns solid, then calibrate, then record.', 'info');
}

// Auto-init when module is imported
init();

// ─── MediaPipe Setup ────────────────────────────────────────
async function setupMediaPipe() {
  const videoEl = document.getElementById('rec-video');
  const statusEl = document.getElementById('rec-camera-status');
  if (!videoEl) return;

  // @ts-ignore — loaded via CDN
  holisticModel = new window.Holistic({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629/${file}`,
  });
  holisticModel.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    smoothSegmentation: false,
    refineFaceLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  holisticModel.onResults(onHolisticResults);

  try {
    // @ts-ignore — loaded via CDN
    camera = new window.Camera(videoEl, {
      onFrame: async () => { if (holisticModel) await holisticModel.send({ image: videoEl }); },
      width: 640,
      height: 480,
    });
    await camera.start();
    if (statusEl) statusEl.classList.add('hidden');
  } catch (err) {
    if (statusEl) statusEl.textContent = `Camera error: ${err.message}`;
    setRecStatus(`Camera failed: ${err.message}`, 'error');
  }
}

// ─── MediaPipe Results Handler ──────────────────────────────
function onHolisticResults(results) {
  // 1) Evaluate framing (needed by overlay + by gate).
  latestFraming = framingScore(results.poseLandmarks);
  updateFramingGate(latestFraming);

  // 2) Draw overlay (framing box color reflects gate state).
  drawOverlay(results, latestFraming);

  // 3) Live avatar preview.
  if (avatar?.vrm && retarget) {
    retarget.applyFromMediaPipe(avatar.vrm, results);
  }
  const dbg = document.getElementById('rec-debug');
  if (dbg && retarget._lastDebug) dbg.textContent = retarget._lastDebug;

  // 4) Capture: record frame or calibration sample.
  const frame = extractFrame(results);
  if (calibrating && frame?.pose) {
    calibBuf.push(frame);
  } else if (recording && frame) {
    frame.t = performance.now() - startTime;
    frames.push(frame);
  }
}

function extractFrame(results) {
  const frame = {
    t: 0,
    rightHand: null,
    leftHand: null,
    face: null,
    pose: null,
    poseWorld: null,
  };

  if (results.rightHandLandmarks) {
    frame.rightHand = results.rightHandLandmarks.map(lm => [lm.x, lm.y, lm.z]);
  }
  if (results.leftHandLandmarks) {
    frame.leftHand = results.leftHandLandmarks.map(lm => [lm.x, lm.y, lm.z]);
  }
  if (results.poseLandmarks) {
    frame.pose = results.poseLandmarks.map(lm => [lm.x, lm.y, lm.z, lm.visibility ?? 0]);
  }
  const poseWorld = results.za || results.ea;
  if (poseWorld) {
    frame.poseWorld = poseWorld.map(lm => [lm.x, lm.y, lm.z, lm.visibility ?? 0]);
  }
  if (results.faceLandmarks && results.faceLandmarks.length >= 468) {
    frame.face = results.faceLandmarks.map(lm => [lm.x, lm.y, lm.z]);
  }
  return frame;
}

// ─── Framing gate ───────────────────────────────────────────
function updateFramingGate(fr) {
  if (fr?.ok) framingStreak++; else framingStreak = 0;
  framingOk = framingStreak >= FRAMING_STREAK_REQUIRED;

  // Surface state.
  const fel = document.getElementById('rec-framing');
  if (fel) {
    const pct = Math.round((fr?.score ?? 0) * 100);
    fel.textContent = `Framing: ${pct}%`
      + (fr?.ok
          ? ` • ready in ${Math.max(0, FRAMING_STREAK_REQUIRED - framingStreak)}`
          : (fr?.reasons?.length ? ` • ${fr.reasons[0]}` : ''));
    fel.className = 'framing-badge ' + (framingOk ? 'ok' : (fr?.ok ? 'warming' : 'bad'));
  }

  const startBtn = document.getElementById('btn-rec-start');
  const calBtn = document.getElementById('btn-calibrate');
  if (startBtn) startBtn.disabled = !(framingOk && calibBaseline && !recording && !calibrating);
  if (calBtn) calBtn.disabled = !framingOk || recording || calibrating;
}

// ─── Calibration ────────────────────────────────────────────
const CALIB_MS = 1500;
function startCalibration() {
  if (!framingOk || recording) return;
  calibBuf = [];
  calibrating = true;
  setRecStatus('Calibrating — hold still with arms at sides...', 'loading');
  setTimeout(() => finishCalibration(), CALIB_MS);
}

function finishCalibration() {
  calibrating = false;
  if (calibBuf.length < 10) {
    setRecStatus('Calibration failed (not enough pose frames). Try again.', 'error');
    return;
  }

  // Average shoulder width + head-to-shoulder distance + shoulder midpoint.
  // Landmarks: 11 L-shoulder, 12 R-shoulder, 0 nose.
  let sw = 0, hsd = 0, midx = 0, midy = 0, n = 0;
  for (const f of calibBuf) {
    const p = f.pose;
    if (!p || !p[11] || !p[12] || !p[0]) continue;
    const L = p[11], R = p[12], N = p[0];
    sw  += Math.hypot(L[0] - R[0], L[1] - R[1]);
    const mx = (L[0] + R[0]) / 2, my = (L[1] + R[1]) / 2;
    hsd += Math.hypot(mx - N[0], my - N[1]);
    midx += mx; midy += my;
    n++;
  }
  if (!n) {
    setRecStatus('Calibration failed (no valid pose). Try again.', 'error');
    return;
  }
  calibBaseline = {
    shoulderWidth: sw / n,
    headToShoulder: hsd / n,
    shoulderMid: [midx / n, midy / n],
    frames: n,
    capturedAt: new Date().toISOString(),
  };
  calibBuf = [];
  setRecStatus('Calibration captured. You can record now.', 'success');
  updateFramingGate(latestFraming);  // re-enable record button
}

// ─── Camera Overlay ─────────────────────────────────────────
function drawOverlay(results, fr) {
  const canvas = document.getElementById('rec-overlay');
  const video = document.getElementById('rec-video');
  if (!canvas || !video) return;

  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const drawPts = (landmarks, color, r = 3) => {
    if (!landmarks) return;
    ctx.fillStyle = color;
    for (const lm of landmarks) {
      ctx.beginPath();
      ctx.arc(lm.x * canvas.width, lm.y * canvas.height, r, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  drawPts(results.rightHandLandmarks, '#00ff88');
  drawPts(results.leftHandLandmarks, '#ff8800');

  if (results.faceLandmarks) {
    ctx.fillStyle = 'rgba(136, 170, 238, 0.6)';
    const faceKeys = [10, 67, 109, 338, 297, 159, 145, 386, 374, 1, 4, 61, 291, 13, 14, 33, 133, 362, 263];
    for (const idx of faceKeys) {
      const lm = results.faceLandmarks[idx];
      if (lm) {
        ctx.beginPath();
        ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Framing guide — color reflects gate state.
  const color = fr?.ok
    ? (framingOk ? 'rgba(80, 220, 120, 0.85)' : 'rgba(220, 200, 80, 0.7)')
    : 'rgba(230, 90, 90, 0.8)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash(fr?.ok ? [] : [6, 4]);

  // Head ellipse — target centered at cx, headY.
  const cx = canvas.width * 0.5, headY = canvas.height * 0.17;
  ctx.beginPath();
  ctx.ellipse(cx, headY, canvas.width * 0.09, canvas.height * 0.11, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Shoulder line target width ~22% of frame.
  const shW = canvas.width * 0.22;
  ctx.beginPath();
  ctx.moveTo(cx - shW, canvas.height * 0.35);
  ctx.lineTo(cx + shW, canvas.height * 0.35);
  ctx.stroke();
  // Signing-space box.
  ctx.strokeRect(cx - canvas.width * 0.3, canvas.height * 0.05, canvas.width * 0.6, canvas.height * 0.75);
  ctx.setLineDash([]);

  // Arm connections.
  if (results.poseLandmarks) {
    ctx.strokeStyle = '#4488ff';
    ctx.lineWidth = 2;
    const pairs = [[11, 13], [13, 15], [12, 14], [14, 16], [11, 12]];
    for (const [a, b] of pairs) {
      const la = results.poseLandmarks[a];
      const lb = results.poseLandmarks[b];
      if (la && lb) {
        ctx.beginPath();
        ctx.moveTo(la.x * canvas.width, la.y * canvas.height);
        ctx.lineTo(lb.x * canvas.width, lb.y * canvas.height);
        ctx.stroke();
      }
    }
  }

  if (recording) {
    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.arc(20, 20, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px Inter, sans-serif';
    ctx.fillText('REC', 34, 25);
  }
  if (calibrating) {
    ctx.fillStyle = 'rgba(80, 140, 220, 0.95)';
    ctx.font = 'bold 16px Inter, sans-serif';
    ctx.fillText('CALIBRATING', canvas.width - 140, 24);
  }
}

// ─── Recording Controls ─────────────────────────────────────
function startRecording() {
  const label = document.getElementById('rec-label')?.value.trim();
  if (!label) { setRecStatus('Please enter a sign label first.', 'error'); return; }
  if (!framingOk) { setRecStatus('Framing not ready — align with the guide.', 'error'); return; }
  if (!calibBaseline) { setRecStatus('Please calibrate first (arms at sides).', 'error'); return; }

  frames = [];
  recording = true;
  startTime = performance.now();
  retarget.reset();

  document.getElementById('btn-rec-start').disabled = true;
  document.getElementById('btn-rec-stop').disabled = false;
  document.getElementById('quality-panel')?.classList.add('hidden');

  const timerEl = document.getElementById('rec-timer');
  timerInterval = setInterval(() => {
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
    if (timerEl) timerEl.textContent = `${elapsed}s (${frames.length} frames)`;
  }, 100);

  setRecStatus(`Recording "${label}"... Perform the sign now.`, 'loading');
}

function stopRecording() {
  recording = false;
  clearInterval(timerInterval);

  document.getElementById('btn-rec-start').disabled = false;
  document.getElementById('btn-rec-stop').disabled = true;

  if (frames.length < 5) {
    setRecStatus('Too few frames. Try again — hold the sign longer.', 'error');
    return;
  }

  lastQuality = QualityGate.analyze(frames);
  showQualityResults(lastQuality);
  setRecStatus(lastQuality.message, lastQuality.pass ? 'success' : 'error');
}

function showQualityResults(report) {
  const panel = document.getElementById('quality-panel');
  const scoresEl = document.getElementById('quality-scores');
  const overallEl = document.getElementById('quality-overall');
  const saveBtn = document.getElementById('btn-rec-save');
  if (!panel) return;
  panel.classList.remove('hidden');

  const channels = [
    { key: 'rightHand', label: 'Right Hand' },
    { key: 'leftHand',  label: 'Left Hand' },
    { key: 'pose',      label: 'Body Pose' },
    { key: 'face',      label: 'Face' },
    { key: 'jitter',    label: 'Stability' },
    { key: 'framing',   label: 'Framing' },
  ];

  let html = '';
  for (const ch of channels) {
    const d = report.details[ch.key];
    const score = d?.score ?? 0;
    const pct = Math.round(score * 100);
    const cls = pct >= 70 ? 'good' : pct >= 40 ? 'ok' : 'bad';
    const extra = d?.completeness !== undefined
      ? ` (${Math.round(d.completeness * 100)}% present)` : '';
    html += `<div class="q-row">
      <span class="q-label">${ch.label}</span>
      <div class="q-bar"><div class="q-fill q-${cls}" style="width:${pct}%"></div></div>
      <span class="q-pct">${pct}%${extra}</span>
    </div>`;
  }
  if (scoresEl) scoresEl.innerHTML = html;

  const cls = report.grade === 'A' ? 'good' : (report.grade === 'B' || report.grade === 'C') ? 'ok' : 'bad';
  if (overallEl) {
    overallEl.innerHTML = `
      <span class="q-grade q-${cls}">${report.grade}</span>
      <span class="q-overall-text">${report.overall}% — ${report.details.frameCount} frames, ${report.details.duration}</span>
    `;
  }
  if (report.issues?.length) {
    const issueHtml = report.issues.map(i => `<li>${i}</li>`).join('');
    if (overallEl) overallEl.innerHTML += `<ul class="q-issues">${issueHtml}</ul>`;
  }
  if (saveBtn) saveBtn.disabled = !report.pass;
}

function previewRecording() {
  if (!frames.length || !avatar?.loaded) return;

  setRecStatus(`Previewing (${frames.length} frames)...`, 'info');
  retarget.reset();
  avatar.setPlaying(true);

  // Real-time preview driven by stored frame timestamps.
  const t0 = performance.now();
  const baseT = frames[0].t ?? 0;
  let i = 0;

  const step = () => {
    const target = performance.now() - t0 + baseT;
    while (i < frames.length - 1 && frames[i + 1].t <= target) i++;

    if (i >= frames.length - 1) {
      renderPreviewFrame(frames[frames.length - 1]);
      avatar.setPlaying(false);
      setRecStatus('Preview complete. Save or discard.', 'success');
      return;
    }

    const a = frames[i], b = frames[i + 1];
    const span = Math.max(b.t - a.t, 1);
    const u = Math.min(Math.max((target - a.t) / span, 0), 1);
    renderPreviewFrame(interp(a, b, u));
    requestAnimationFrame(step);
  };
  step();
}

function interp(a, b, u) {
  const iLM = (la, lb) => {
    if (!la || !lb) return lb || la;
    return lb.map((pt, j) => {
      const pa = la[j] || pt;
      const out = [
        (pa[0] ?? pt[0]) + ((pt[0] - (pa[0] ?? pt[0])) * u),
        (pa[1] ?? pt[1]) + ((pt[1] - (pa[1] ?? pt[1])) * u),
        (pa[2] ?? 0) + ((pt[2] ?? 0) - (pa[2] ?? 0)) * u,
      ];
      if (pt.length > 3) out.push(pt[3]);
      return out;
    });
  };
  return {
    pose:      iLM(a.pose, b.pose),
    poseWorld: iLM(a.poseWorld, b.poseWorld),
    face:      iLM(a.face, b.face),
    leftHand:  iLM(a.leftHand, b.leftHand),
    rightHand: iLM(a.rightHand, b.rightHand),
  };
}

function renderPreviewFrame(frame) {
  if (!avatar?.vrm || !retarget || !frame) return;
  const toMP = (arr) => arr ? arr.map(p => ({ x: p[0], y: p[1], z: p[2] ?? 0, visibility: p[3] ?? 1 })) : null;
  retarget.applyFromMediaPipe(avatar.vrm, {
    poseLandmarks: toMP(frame.pose),
    za: toMP(frame.poseWorld || frame.pose),
    faceLandmarks: toMP(frame.face),
    rightHandLandmarks: toMP(frame.rightHand),
    leftHandLandmarks: toMP(frame.leftHand),
  });
}

async function saveRecording() {
  const label = document.getElementById('rec-label')?.value.trim();
  if (!label || !frames.length) return;

  setRecStatus('Saving...', 'loading');

  try {
    const res = await fetch('/api/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label,
        schema_version: 2,
        landmarks: frames,
        calibration: calibBaseline,
        quality: lastQuality ? {
          overall: lastQuality.overall,
          grade: lastQuality.grade,
          details: lastQuality.details,
        } : null,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Save failed' }));
      throw new Error(err.detail || 'Save failed');
    }

    setRecStatus(`Sign "${label}" saved successfully!`, 'success');
    discardRecording();
  } catch (err) {
    setRecStatus(`Save failed: ${err.message}`, 'error');
  }
}

function discardRecording() {
  frames = [];
  lastQuality = null;
  document.getElementById('quality-panel')?.classList.add('hidden');
  const timerEl = document.getElementById('rec-timer');
  if (timerEl) timerEl.textContent = '';
  const saveBtn = document.getElementById('btn-rec-save');
  if (saveBtn) saveBtn.disabled = true;
}

// ─── Helpers ────────────────────────────────────────────────
function setRecStatus(msg, type) {
  const el = document.getElementById('rec-status');
  if (el) {
    el.textContent = msg;
    el.className = `status status-${type}`;
  }
}
