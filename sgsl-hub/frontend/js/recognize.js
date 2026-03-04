/* ============================================================
   SgSL Hub — Sign Recognition Module (Sign-to-Text)
   ============================================================
   Captures holistic landmarks (two hands + face + pose), sends
   to backend for DTW + k-NN recognition, and displays results.
   ============================================================ */

import { HolisticTracker } from './camera.js';
import { recognize } from './api.js';
import { setStatus, toast } from './app.js';

let tracker = null;
let capturing = false;
let frames = [];
let autoStopTimeout = null;

const CAPTURE_DURATION = 4000;  // auto-stop after 4 seconds
const TRIM_START_MS = 500;      // trim first 0.5s
const TRIM_END_MS = 400;        // trim last 0.4s

export function initRecognize() {
  const enableBtn = document.getElementById('stt-enable-camera');
  const prompt = document.getElementById('stt-camera-prompt');
  const videoArea = document.getElementById('stt-video-area');
  const startBtn = document.getElementById('stt-start-btn');
  const stopBtn = document.getElementById('stt-stop-btn');
  const statusEl = document.getElementById('stt-status');
  const handStatus = document.getElementById('stt-hand-status');
  const resultsPanel = document.getElementById('stt-results');

  enableBtn.addEventListener('click', async () => {
    try {
      enableBtn.disabled = true;
      enableBtn.textContent = 'Starting camera...';

      tracker = new HolisticTracker(
        document.getElementById('stt-video'),
        document.getElementById('stt-canvas'),
        {
          onResults: (frame) => {
            if (capturing) frames.push(frame);
          },
          onTrackingDetected: () => {
            handStatus.classList.add('detected');
            handStatus.querySelector('span:last-child').textContent = 'Tracking active';
            startBtn.disabled = false;
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
      setStatus(statusEl, 'Camera ready. Show your hands, then click Start.', 'info');
    } catch (err) {
      enableBtn.disabled = false;
      enableBtn.textContent = 'Enable Camera';
      setStatus(statusEl, `Camera error: ${err.message}`, 'error');
    }
  });

  startBtn.addEventListener('click', () => {
    frames = [];
    capturing = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    resultsPanel.classList.add('hidden');
    document.getElementById('stt-rec-badge').classList.remove('hidden');
    setStatus(statusEl, `Capturing for ${CAPTURE_DURATION / 1000}s... Perform the sign now.`, 'info');

    // Auto-stop after CAPTURE_DURATION
    autoStopTimeout = setTimeout(() => finishCapture(statusEl, startBtn, stopBtn, resultsPanel), CAPTURE_DURATION);
  });

  stopBtn.addEventListener('click', () => {
    if (autoStopTimeout) { clearTimeout(autoStopTimeout); autoStopTimeout = null; }
    finishCapture(statusEl, startBtn, stopBtn, resultsPanel);
  });
}

async function finishCapture(statusEl, startBtn, stopBtn, resultsPanel) {
  capturing = false;
  stopBtn.disabled = true;
  document.getElementById('stt-rec-badge').classList.add('hidden');

  // Trim start and end frames to remove button-click artefacts
  const fps = 30;
  const trimStart = Math.round((TRIM_START_MS / 1000) * fps);
  const trimEnd = Math.round((TRIM_END_MS / 1000) * fps);
  const trimmed = frames.slice(trimStart, frames.length - trimEnd);

  if (trimmed.length < 5) {
    setStatus(statusEl, 'Capture too short after trimming. Try again — hold the sign longer.', 'error');
    startBtn.disabled = false;
    return;
  }

  setStatus(statusEl, `Recognizing (${trimmed.length} frames, trimmed from ${frames.length})...`, 'loading');

  try {
    const result = await recognize(trimmed);
    displayResults(result, resultsPanel);
    setStatus(statusEl, `Recognition complete (${result.method}).`, 'success');
  } catch (err) {
    setStatus(statusEl, err.message, 'error');
    toast('Recognition failed', 'error');
  }

  startBtn.disabled = false;
}

function displayResults(result, panel) {
  const matchesEl = document.getElementById('stt-matches');
  const combined = mergeResults(result.dtw || [], result.knn || []);

  if (!combined.length) {
    matchesEl.innerHTML = '<p class="hint">No matches found.</p>';
    panel.classList.remove('hidden');
    return;
  }

  matchesEl.innerHTML = combined.map((m, i) => `
    <div class="match-item ${i === 0 ? 'top-match' : ''}">
      <span class="match-rank">${i + 1}</span>
      <span class="match-label">${esc(m.label)}</span>
      <div class="match-confidence">
        <div class="conf-bar">
          <div class="conf-fill" style="width: ${(m.confidence * 100).toFixed(0)}%"></div>
        </div>
        <span>${(m.confidence * 100).toFixed(0)}%</span>
      </div>
      <span class="match-method">${m.method}</span>
    </div>
  `).join('');

  panel.classList.remove('hidden');
}

function mergeResults(dtw, knn) {
  const map = {};

  dtw.forEach(r => {
    map[r.label] = {
      label: r.label,
      confidence: r.confidence ?? 0,
      method: 'DTW',
    };
  });

  knn.forEach(r => {
    if (map[r.label]) {
      map[r.label].confidence = (map[r.label].confidence + r.confidence) / 2;
      map[r.label].method = 'DTW+KNN';
    } else {
      map[r.label] = {
        label: r.label,
        confidence: r.confidence ?? 0,
        method: 'KNN',
      };
    }
  });

  return Object.values(map).sort((a, b) => b.confidence - a.confidence).slice(0, 5);
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
