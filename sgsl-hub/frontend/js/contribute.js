/* ============================================================
   SgSL Hub — Contribute Module
   ============================================================
   Handles the recording flow: camera enable, countdown,
   holistic landmark capture (two hands + face + pose),
   and upload to the backend.
   ============================================================ */

import { HolisticTracker } from './camera.js';
import { contribute } from './api.js';
import { setStatus, toast } from './app.js';
import { getEmail } from './auth.js';

let tracker = null;
let recording = false;
let frames = [];
let recStart = 0;
let timerInterval = null;
let autoStopTimeout = null;

const RECORD_DURATION = 4000;    // auto-stop after 4 seconds
const TRIM_START_MS = 500;       // trim first 0.5s (hand returning from click)
const TRIM_END_MS = 400;         // trim last 0.4s (anticipatory movement to stop)

export function initContribute() {
  const enableBtn = document.getElementById('contribute-enable-camera');
  const prompt = document.getElementById('contribute-camera-prompt');
  const videoArea = document.getElementById('contribute-video-area');
  const recordBtn = document.getElementById('record-btn');
  const stopBtn = document.getElementById('stop-btn');
  const statusEl = document.getElementById('contribute-status');
  const handStatus = document.getElementById('contribute-hand-status');

  enableBtn.addEventListener('click', async () => {
    try {
      enableBtn.disabled = true;
      enableBtn.textContent = 'Starting camera...';

      tracker = new HolisticTracker(
        document.getElementById('contribute-video'),
        document.getElementById('contribute-canvas'),
        {
          onResults: (frame) => {
            if (recording) frames.push(frame);
          },
          onTrackingDetected: () => {
            handStatus.classList.add('detected');
            handStatus.querySelector('span:last-child').textContent = 'Tracking active';
            recordBtn.disabled = false;
          },
          onTrackingLost: () => {
            handStatus.classList.remove('detected');
            handStatus.querySelector('span:last-child').textContent = 'Waiting for hands...';
          },
        }
      );

      await tracker.start();

      prompt.classList.add('hidden');
      videoArea.classList.remove('hidden');
      setStatus(statusEl, 'Camera ready. Show your hands, then click Record.', 'info');
    } catch (err) {
      enableBtn.disabled = false;
      enableBtn.textContent = 'Enable Camera';
      setStatus(statusEl, `Camera error: ${err.message}`, 'error');
    }
  });

  recordBtn.addEventListener('click', () => {
    const label = document.getElementById('label-input').value.trim();
    if (!label) {
      setStatus(statusEl, 'Please name the sign first (Step 1).', 'error');
      toast('Enter a sign label first', 'error');
      return;
    }
    startCountdown(() => {
      frames = [];
      recording = true;
      recStart = Date.now();
      recordBtn.disabled = true;
      stopBtn.disabled = false;
      document.getElementById('rec-badge').classList.remove('hidden');
      timerInterval = setInterval(updateTimer, 100);
      setStatus(statusEl, `Recording for ${RECORD_DURATION / 1000}s... Perform the sign now.`, 'info');

      // Auto-stop after RECORD_DURATION
      autoStopTimeout = setTimeout(() => finishRecording(statusEl, recordBtn, stopBtn), RECORD_DURATION);
    });
  });

  stopBtn.addEventListener('click', () => {
    if (autoStopTimeout) { clearTimeout(autoStopTimeout); autoStopTimeout = null; }
    finishRecording(statusEl, recordBtn, stopBtn);
  });
}

async function finishRecording(statusEl, recordBtn, stopBtn) {
  recording = false;
  stopBtn.disabled = true;
  clearInterval(timerInterval);
  document.getElementById('rec-badge').classList.add('hidden');

  // Trim start and end frames to remove button-click artefacts
  // At ~30 fps: 0.5s = ~15 frames, 0.4s = ~12 frames
  const fps = 30;
  const trimStart = Math.round((TRIM_START_MS / 1000) * fps);
  const trimEnd = Math.round((TRIM_END_MS / 1000) * fps);
  const trimmed = frames.slice(trimStart, frames.length - trimEnd);

  if (trimmed.length < 5) {
    setStatus(statusEl, 'Recording too short after trimming. Try again — hold the sign longer.', 'error');
    recordBtn.disabled = false;
    return;
  }

  const label = document.getElementById('label-input').value.trim().toLowerCase();
  setStatus(statusEl, `Uploading "${label}" (${trimmed.length} frames, trimmed from ${frames.length})...`, 'loading');

  try {
    const result = await contribute(label, trimmed, getEmail());
    setStatus(statusEl, `Saved "${label}" — ${result.frames} frames, ${result.features} features.`, 'success');
    toast(`Sign "${label}" contributed!`, 'success');
  } catch (err) {
    setStatus(statusEl, err.message, 'error');
    toast('Upload failed', 'error');
  }

  recordBtn.disabled = false;
}

function startCountdown(onDone) {
  const overlay = document.getElementById('countdown-overlay');
  overlay.classList.remove('hidden');
  let count = 3;
  overlay.textContent = count;

  const tick = setInterval(() => {
    count--;
    if (count > 0) {
      overlay.textContent = count;
    } else {
      clearInterval(tick);
      overlay.classList.add('hidden');
      onDone();
    }
  }, 800);
}

function updateTimer() {
  const el = document.getElementById('rec-timer');
  if (el) {
    const elapsed = ((Date.now() - recStart) / 1000).toFixed(1);
    el.textContent = `${elapsed}s`;
  }
}
