/* ============================================================
   SgSL Hub — Sign-to-Text (Recognition)
   ============================================================
   Captures a sign via webcam, extracts features, and compares
   against the sign library using DTW. Shows top-N results
   with confidence scores.
   ============================================================ */

import { db, TABLE, TOP_N_RESULTS } from './config.js';
import { sequenceToFeatureSeq, dtwDistance, dtwToConfidence } from './features.js';
import { HandTracker } from './handTracking.js';
import { showToast, setStatus } from './app.js';

let tracker = null;
let initialized = false;

export function initSignToText() {
  if (initialized) return;
  initialized = true;

  const videoEl       = document.getElementById('stt-video');
  const canvasEl      = document.getElementById('stt-canvas');
  const startBtn      = document.getElementById('stt-start-btn');
  const stopBtn       = document.getElementById('stt-stop-btn');
  const statusEl      = document.getElementById('stt-status');
  const resultsDiv    = document.getElementById('stt-results');
  const matchesDiv    = document.getElementById('stt-matches');
  const recIndicator  = document.getElementById('stt-recording-indicator');

  // Initialize tracker on first interaction
  startBtn.addEventListener('click', async () => {
    if (!tracker) {
      tracker = new HandTracker(videoEl, canvasEl);
      setStatus(statusEl, 'Starting camera...', 'loading');
      await tracker.start();
    }

    // Reset state
    resultsDiv.classList.add('hidden');
    matchesDiv.innerHTML = '';
    startBtn.disabled = true;
    stopBtn.disabled = false;
    recIndicator.classList.remove('hidden');

    tracker.startRecording();
    setStatus(statusEl, 'Capturing... perform the sign now.', 'info');
  });

  stopBtn.addEventListener('click', async () => {
    const frames = tracker.stopRecording();
    stopBtn.disabled = true;
    recIndicator.classList.add('hidden');

    setStatus(statusEl, `Captured ${frames.length} frames. Recognizing...`, 'loading');

    try {
      // Extract first hand per frame
      const firstHandSeq = frames.map(fr => fr?.[0]).filter(Boolean);
      if (firstHandSeq.length < 5) {
        throw new Error('Too few frames with hand detected. Show your hand clearly and try again.');
      }

      const queryFeatures = sequenceToFeatureSeq(firstHandSeq);

      // Fetch all signs from library
      const { data: rows, error } = await db
        .from(TABLE)
        .select('label, features, landmarks');
      if (error) throw error;

      if (!rows || rows.length === 0) {
        throw new Error('Sign library is empty. Contribute some signs first!');
      }

      // Compare against each entry
      const scores = [];
      for (const row of rows) {
        let ref = row.features;
        // Fall back to computing features from landmarks if needed
        if (!ref || !ref.length) {
          const seq = (row.landmarks || []).map(fr => fr?.[0]).filter(Boolean);
          if (!seq.length) continue;
          ref = sequenceToFeatureSeq(seq);
        }
        if (!ref?.length) continue;

        const dist = dtwDistance(queryFeatures, ref);
        scores.push({
          label: row.label,
          distance: dist,
          confidence: dtwToConfidence(dist),
        });
      }

      if (scores.length === 0) {
        throw new Error('No valid entries in library to compare against.');
      }

      // Sort by distance (ascending) and take top N
      scores.sort((a, b) => a.distance - b.distance);

      // Aggregate: if multiple entries for the same label, keep best score
      const seen = new Map();
      for (const s of scores) {
        if (!seen.has(s.label) || s.confidence > seen.get(s.label).confidence) {
          seen.set(s.label, s);
        }
      }
      const unique = [...seen.values()].sort((a, b) => a.distance - b.distance);
      const topN = unique.slice(0, TOP_N_RESULTS);

      // Display results
      displayResults(matchesDiv, topN);
      resultsDiv.classList.remove('hidden');

      const best = topN[0];
      setStatus(
        statusEl,
        `Best match: "${best.label}" (${best.confidence.toFixed(0)}% confidence)`,
        'success'
      );
    } catch (err) {
      console.error('Recognition error:', err);
      setStatus(statusEl, `Error: ${err.message}`, 'error');
      showToast('Recognition failed.', 'error');
    } finally {
      startBtn.disabled = false;
    }
  });
}

function displayResults(container, matches) {
  container.innerHTML = '';

  matches.forEach((match, i) => {
    const item = document.createElement('div');
    item.className = 'match-item';
    item.innerHTML = `
      <span class="match-rank">#${i + 1}</span>
      <span class="match-label">${escapeHtml(match.label)}</span>
      <div class="match-confidence">
        <div class="confidence-bar">
          <div class="confidence-bar-fill" style="width: ${match.confidence}%"></div>
        </div>
        <span>${match.confidence.toFixed(0)}%</span>
      </div>
    `;
    container.appendChild(item);
  });

  if (matches.length === 0) {
    container.innerHTML = '<p class="hint">No matches found.</p>';
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
