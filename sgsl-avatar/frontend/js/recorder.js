/* ============================================================
   SgSL Avatar — Sign Recorder
   ============================================================
   Captures sign language via webcam using MediaPipe Holistic.
   - Live VRM avatar preview (real-time retargeting)
   - Quality gate scoring before save
   - Stores full holistic data (hands + pose + face)
   ============================================================ */

import { SMPLXAvatar } from './avatar.js';
import { SMPLXRetarget } from './retarget.js';
import { QualityGate } from './quality.js';

// ─── State ──────────────────────────────────────────────────
let avatar = null;
let retarget = null;
let holisticModel = null;
let camera = null;
let recording = false;
let frames = [];
let startTime = 0;
let timerInterval = null;
let lastQuality = null;
let inited = false;

// MediaPipe face key-point indices (subset of 468 for storage)
const FACE_KEYS = [
  10, 67, 109, 338, 297,        // brow inner L/R, outer L/R, center
  159, 145, 386, 374,            // eye top/bottom L, top/bottom R
  1, 4, 5,                       // nose tip, bridge, base
  61, 291, 13, 14, 78, 308,     // mouth corners, top/bottom, inner L/R
  17, 18, 200,                   // chin points
  127, 356,                      // cheeks
  33, 133, 362, 263,             // eye corners
  152, 148, 176, 149,            // jaw line
];

// ─── Init ───────────────────────────────────────────────────
export async function init() {
  if (inited) return;
  inited = true;

  // Create avatar for live preview
  avatar = new SMPLXAvatar('rec-avatar-viewport');
  retarget = new SMPLXRetarget();

  // Setup MediaPipe Holistic
  await setupMediaPipe();

  // Wire up buttons
  document.getElementById('btn-rec-start')?.addEventListener('click', startRecording);
  document.getElementById('btn-rec-stop')?.addEventListener('click', stopRecording);
  document.getElementById('btn-rec-preview')?.addEventListener('click', previewRecording);
  document.getElementById('btn-rec-save')?.addEventListener('click', saveRecording);
  document.getElementById('btn-rec-discard')?.addEventListener('click', discardRecording);

  setRecStatus('Ready. Enter a sign label and click Record.', 'success');
}

// Auto-init when module is imported
init();

// ─── MediaPipe Setup ────────────────────────────────────────
async function setupMediaPipe() {
  const videoEl = document.getElementById('rec-video');
  const statusEl = document.getElementById('rec-camera-status');

  if (!videoEl) return;

  // Create Holistic model
  // @ts-ignore — loaded via CDN script tag
  holisticModel = new window.Holistic({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629/${file}`,
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

  // Start camera
  try {
    // @ts-ignore — loaded via CDN script tag
    camera = new window.Camera(videoEl, {
      onFrame: async () => {
        if (holisticModel) await holisticModel.send({ image: videoEl });
      },
      width: 640,
      height: 480,
    });
    await camera.start();
    if (statusEl) statusEl.classList.add('hidden');
    setRecStatus('Camera ready. Enter a sign label and click Record.', 'success');
  } catch (err) {
    if (statusEl) statusEl.textContent = `Camera error: ${err.message}`;
    setRecStatus(`Camera failed: ${err.message}`, 'error');
  }
}

// ─── MediaPipe Results Handler ──────────────────────────────
function onHolisticResults(results) {
  // Draw overlay on camera feed
  drawOverlay(results);

  // Live avatar preview via Kalidokit
  if (avatar?.vrm && retarget) {
    retarget.applyFromMediaPipe(avatar.vrm, results);
  }

  // Debug: show what's happening on screen
  const dbg = document.getElementById('rec-debug');
  if (dbg && retarget._lastDebug) {
    dbg.textContent = retarget._lastDebug;
  }

  // Record frame data for storage (extract to our holistic format)
  const frame = extractFrame(results);
  if (recording && frame) {
    frames.push(frame);
  }
}

function extractFrame(results) {
  const frame = {
    rightHand: null,
    leftHand: null,
    face: null,
    pose: null,
  };

  // Right hand (21 landmarks)
  if (results.rightHandLandmarks) {
    frame.rightHand = results.rightHandLandmarks.map(lm => [lm.x, lm.y, lm.z]);
  }

  // Left hand (21 landmarks)
  if (results.leftHandLandmarks) {
    frame.leftHand = results.leftHandLandmarks.map(lm => [lm.x, lm.y, lm.z]);
  }

  // Pose (33 landmarks)
  if (results.poseLandmarks) {
    frame.pose = results.poseLandmarks.map(lm => [lm.x, lm.y, lm.z, lm.visibility ?? 0]);
  }

  // Face (32 key points from 468 mesh)
  if (results.faceLandmarks && results.faceLandmarks.length >= 468) {
    frame.face = FACE_KEYS.map(idx => {
      const lm = results.faceLandmarks[idx];
      return lm ? [lm.x, lm.y, lm.z] : [0, 0, 0];
    });
  }

  return frame;
}

// ─── Camera Overlay Drawing ─────────────────────────────────
function drawOverlay(results) {
  const canvas = document.getElementById('rec-overlay');
  const video = document.getElementById('rec-video');
  if (!canvas || !video) return;

  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw hand landmarks
  const drawHand = (landmarks, color) => {
    if (!landmarks) return;
    ctx.fillStyle = color;
    for (const lm of landmarks) {
      ctx.beginPath();
      ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  drawHand(results.rightHandLandmarks, '#00ff88');
  drawHand(results.leftHandLandmarks, '#ff8800');

  // Draw face landmarks
  if (results.faceLandmarks) {
    ctx.fillStyle = 'rgba(136, 170, 238, 0.6)';
    // Draw key face points (brows, eyes, nose, mouth)
    const faceKeys = [
      10, 67, 109, 338, 297,     // brows
      159, 145, 386, 374,         // eyes
      1, 4,                        // nose
      61, 291, 13, 14,            // mouth
      33, 133, 362, 263,          // eye corners
    ];
    for (const idx of faceKeys) {
      const lm = results.faceLandmarks[idx];
      if (lm) {
        ctx.beginPath();
        ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Draw pose connections (arms only)
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

  // Recording indicator
  if (recording) {
    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.arc(20, 20, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px Inter, sans-serif';
    ctx.fillText('REC', 34, 25);
  }
}

// ─── Recording Controls ─────────────────────────────────────
function startRecording() {
  const label = document.getElementById('rec-label')?.value.trim();
  if (!label) {
    setRecStatus('Please enter a sign label first.', 'error');
    return;
  }

  frames = [];
  recording = true;
  startTime = Date.now();
  retarget.reset();

  // UI
  document.getElementById('btn-rec-start').disabled = true;
  document.getElementById('btn-rec-stop').disabled = false;
  document.getElementById('quality-panel')?.classList.add('hidden');

  // Timer
  const timerEl = document.getElementById('rec-timer');
  timerInterval = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
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

  // Run quality gate
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

  // Render individual scores
  const channels = [
    { key: 'rightHand', label: 'Right Hand', icon: 'R' },
    { key: 'leftHand', label: 'Left Hand', icon: 'L' },
    { key: 'pose', label: 'Body Pose', icon: 'P' },
    { key: 'face', label: 'Face', icon: 'F' },
    { key: 'jitter', label: 'Stability', icon: 'S' },
    { key: 'framing', label: 'Framing', icon: 'Fr' },
  ];

  let html = '';
  for (const ch of channels) {
    const d = report.details[ch.key];
    const score = d?.score ?? 0;
    const pct = Math.round(score * 100);
    const cls = pct >= 70 ? 'good' : pct >= 40 ? 'ok' : 'bad';
    const extra = d?.completeness !== undefined
      ? ` (${Math.round(d.completeness * 100)}% present)`
      : '';
    html += `<div class="q-row">
      <span class="q-label">${ch.label}</span>
      <div class="q-bar"><div class="q-fill q-${cls}" style="width:${pct}%"></div></div>
      <span class="q-pct">${pct}%${extra}</span>
    </div>`;
  }
  if (scoresEl) scoresEl.innerHTML = html;

  // Overall
  const cls = report.grade === 'A' ? 'good' : report.grade === 'B' || report.grade === 'C' ? 'ok' : 'bad';
  if (overallEl) {
    overallEl.innerHTML = `
      <span class="q-grade q-${cls}">${report.grade}</span>
      <span class="q-overall-text">${report.overall}% — ${report.details.frameCount} frames, ${report.details.duration}</span>
    `;
  }

  // Issues
  if (report.issues?.length) {
    const issueHtml = report.issues.map(i => `<li>${i}</li>`).join('');
    if (overallEl) overallEl.innerHTML += `<ul class="q-issues">${issueHtml}</ul>`;
  }

  // Enable save only if passed
  if (saveBtn) saveBtn.disabled = !report.pass;
}

async function previewRecording() {
  if (!frames.length || !avatar?.loaded) return;

  setRecStatus(`Previewing (${frames.length} frames)...`, 'info');
  retarget.reset();
  avatar.setPlaying(true);

  let fi = 0;
  const play = () => {
    if (fi >= frames.length) {
      avatar.setPlaying(false);
      setRecStatus('Preview complete. Save or discard.', 'success');
      return;
    }
    const data = avatar.renderFrame(frames[fi]);
    if (data) {
      retarget.applyFrame(data.bones, data.restPose, frames[fi], avatar.getCalibration());
      avatar.updateVisuals();
    }
    fi++;
    requestAnimationFrame(play);
  };
  play();
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
        landmarks: frames,
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
  document.getElementById('rec-timer').textContent = '';
  document.getElementById('btn-rec-save').disabled = true;
}

// ─── Helpers ────────────────────────────────────────────────
function setRecStatus(msg, type) {
  const el = document.getElementById('rec-status');
  if (el) {
    el.textContent = msg;
    el.className = `status status-${type}`;
  }
}
