/* ============================================================
   SgSL Hub — Sign Recognition Module (Sign-to-Text)
   ============================================================
   Captures hand landmarks, sends to backend for DTW + k-NN
   recognition, and displays results.
   ============================================================ */

import { HandTracker } from './camera.js';
import { recognize } from './api.js';
import { setStatus, toast } from './app.js';

let tracker = null;
let capturing = false;
let frames = [];

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

      tracker = new HandTracker(
        document.getElementById('stt-video'),
        document.getElementById('stt-canvas'),
        {
          onResults: (pts) => {
            if (capturing) frames.push(pts);
          },
          onHandDetected: () => {
            handStatus.classList.add('detected');
            handStatus.querySelector('span:last-child').textContent = 'Hand detected';
            startBtn.disabled = false;
          },
          onHandLost: () => {
            handStatus.classList.remove('detected');
            handStatus.querySelector('span:last-child').textContent = 'Waiting for hand...';
          },
        }
      );

      await tracker.start();

      prompt.classList.add('hidden');
      videoArea.classList.remove('hidden');
      setStatus(statusEl, 'Camera ready. Show your hand, then click Start.', 'info');
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
    setStatus(statusEl, 'Capturing... Perform the sign now.', 'info');
  });

  stopBtn.addEventListener('click', async () => {
    capturing = false;
    stopBtn.disabled = true;
    document.getElementById('stt-rec-badge').classList.add('hidden');

    if (frames.length < 5) {
      setStatus(statusEl, 'Capture too short. Try again.', 'error');
      startBtn.disabled = false;
      return;
    }

    setStatus(statusEl, `Recognizing (${frames.length} frames)...`, 'loading');

    try {
      const result = await recognize(frames);
      displayResults(result, resultsPanel);
      setStatus(statusEl, `Recognition complete (${result.method}).`, 'success');
    } catch (err) {
      setStatus(statusEl, err.message, 'error');
      toast('Recognition failed', 'error');
    }

    startBtn.disabled = false;
  });
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
      // Average confidences, mark as combined
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
