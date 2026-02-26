/* ============================================================
   SgSL Hub — Contribute Tab
   ============================================================
   Handles:
   - Email authentication (domain-restricted)
   - Sign recording with countdown & timer
   - Upload landmarks + features to Supabase
   ============================================================ */

import { db, ALLOWED_DOMAIN, TABLE } from './config.js';
import { sequenceToFeatureSeq } from './features.js';
import { HandTracker } from './handTracking.js';
import { showToast, setStatus } from './app.js';

let tracker = null;
let recordingTimer = null;
let recordStartTime = 0;

export function initContribute() {
  const emailInput    = document.getElementById('email-input');
  const loginBtn      = document.getElementById('login-btn');
  const authCard      = document.getElementById('auth-card');
  const recordCard    = document.getElementById('record-card');
  const labelInput    = document.getElementById('label-input');
  const recordBtn     = document.getElementById('record-btn');
  const stopRecordBtn = document.getElementById('stop-record-btn');
  const statusEl      = document.getElementById('contribute-status');
  const recIndicator  = document.getElementById('recording-indicator');
  const recTimer      = document.getElementById('rec-timer');
  const countdown     = document.getElementById('countdown');
  const videoEl       = document.getElementById('contribute-video');
  const canvasEl      = document.getElementById('contribute-canvas');

  // --- Auth ---
  loginBtn.addEventListener('click', () => {
    const email = emailInput.value.trim().toLowerCase();
    if (!email) {
      setStatus(statusEl, 'Please enter your school email.', 'error');
      return;
    }
    if (!email.endsWith(ALLOWED_DOMAIN)) {
      setStatus(statusEl, `Only ${ALLOWED_DOMAIN} emails are allowed.`, 'error');
      return;
    }

    setStatus(statusEl, '');
    authCard.classList.add('hidden');
    recordCard.classList.remove('hidden');

    // Initialize hand tracking
    tracker = new HandTracker(videoEl, canvasEl);
    tracker.start();
    setStatus(statusEl, 'Camera active. Enter a sign label and start recording.', 'info');
  });

  // Allow Enter key for login
  emailInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') loginBtn.click();
  });

  // --- Record ---
  recordBtn.addEventListener('click', () => {
    const label = labelInput.value.trim();
    if (!label) {
      setStatus(statusEl, 'Enter a label for the sign first.', 'error');
      return;
    }

    // Countdown 3, 2, 1
    recordBtn.disabled = true;
    stopRecordBtn.disabled = true;
    setStatus(statusEl, 'Get ready...', 'info');
    runCountdown(countdown, () => {
      // Start recording after countdown
      tracker.startRecording();
      stopRecordBtn.disabled = false;
      recIndicator.classList.remove('hidden');
      recordStartTime = Date.now();
      recTimer.textContent = '0.0s';

      recordingTimer = setInterval(() => {
        const elapsed = ((Date.now() - recordStartTime) / 1000).toFixed(1);
        recTimer.textContent = `${elapsed}s`;
      }, 100);

      setStatus(statusEl, 'Recording... perform the sign now.', 'info');
    });
  });

  // --- Stop & Upload ---
  stopRecordBtn.addEventListener('click', async () => {
    // Stop recording
    const frames = tracker.stopRecording();
    stopRecordBtn.disabled = true;
    recIndicator.classList.add('hidden');
    clearInterval(recordingTimer);

    const elapsed = ((Date.now() - recordStartTime) / 1000).toFixed(1);
    setStatus(statusEl, `Captured ${frames.length} frames (${elapsed}s). Uploading...`, 'loading');

    try {
      // Extract first hand from each frame
      const firstHandSeq = frames.map(fr => fr?.[0]).filter(Boolean);
      if (firstHandSeq.length < 5) {
        throw new Error('Too few frames with hand detected. Try again with your hand clearly visible.');
      }

      const featureSeq = sequenceToFeatureSeq(firstHandSeq);

      const { error } = await db.from(TABLE).insert([{
        label: labelInput.value.trim(),
        landmarks: frames,
        features: featureSeq,
      }]);

      if (error) throw error;

      setStatus(statusEl, `Uploaded "${labelInput.value.trim()}" successfully! (${firstHandSeq.length} frames)`, 'success');
      showToast(`Sign "${labelInput.value.trim()}" contributed!`, 'success');
      labelInput.value = '';
    } catch (err) {
      console.error('Upload error:', err);
      setStatus(statusEl, `Upload failed: ${err.message}`, 'error');
      showToast('Upload failed. Please try again.', 'error');
    } finally {
      recordBtn.disabled = false;
    }
  });

  // Allow Enter key for label
  labelInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !recordBtn.disabled) recordBtn.click();
  });
}

/**
 * Show a 3-2-1 countdown overlay, then call onDone.
 */
function runCountdown(el, onDone) {
  let count = 3;
  el.classList.remove('hidden');
  el.textContent = count;

  const tick = setInterval(() => {
    count--;
    if (count > 0) {
      el.textContent = count;
      // Re-trigger animation
      el.style.animation = 'none';
      el.offsetHeight; // force reflow
      el.style.animation = '';
    } else {
      clearInterval(tick);
      el.classList.add('hidden');
      onDone();
    }
  }, 800);
}
