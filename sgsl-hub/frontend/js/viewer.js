/* ============================================================
   SgSL Hub — Sign Viewer (Text-to-Sign)
   ============================================================
   Drives the 3D humanoid avatar for sign playback. Supports
   both individual sign lookup and sentence translation via the
   SgSL gloss parser.
   ============================================================ */

import { fetchSigns, fetchSign, deleteSign } from './api.js';
import { setStatus, toast } from './app.js';
import { isLoggedIn } from './auth.js';
import { HumanoidAvatar } from './humanoid.js';
import { parseSentence } from './gloss.js';

let humanoid = null;
let inited = false;
let _signs = [];
let _searchBound = false;
let speed = 1;

// Parse raw DB landmarks into a sequence of holistic frames
function parseSequence(landmarks) {
  if (!landmarks || !landmarks.length) return [];

  const first = landmarks[0];

  // Holistic format: array of {leftHand, rightHand, face, pose}
  if (first && typeof first === 'object' && !Array.isArray(first) && ('leftHand' in first || 'rightHand' in first)) {
    return landmarks.filter(f => f.leftHand || f.rightHand);
  }

  // Legacy formats
  return landmarks
    .map(fr => {
      if (!Array.isArray(fr)) return null;

      // Direct 21 landmarks: [[x,y,z], ...]
      if (fr.length >= 21 && Array.isArray(fr[0]) && fr[0].length >= 2 && typeof fr[0][0] === 'number') {
        return { rightHand: fr, leftHand: null, face: null };
      }

      // Wrapped format: [[[x,y,z],...21]] or [[[x,y,z],...21], [[x,y,z],...21]]
      if (fr.length <= 2 && Array.isArray(fr[0]) && fr[0].length >= 21
          && Array.isArray(fr[0][0]) && fr[0][0].length >= 2) {
        const rightHand = fr[0];
        const leftHand = fr.length === 2 && Array.isArray(fr[1]) && fr[1].length >= 21 ? fr[1] : null;
        return { rightHand, leftHand, face: null };
      }

      return null;
    })
    .filter(f => f !== null);
}

async function playLabel(label) {
  const statusEl = document.getElementById('tts-status');
  const bar = document.getElementById('playback-bar');
  const avatarEmpty = document.getElementById('avatar-empty');
  const prog = document.getElementById('tts-progress');

  try {
    setStatus(statusEl, `Loading "${label}"...`, 'loading');
    const data = await fetchSign(label);
    const seq = parseSequence(data.landmarks);

    if (!seq.length) throw new Error(`No valid landmarks for "${label}".`);

    if (avatarEmpty) avatarEmpty.classList.add('hidden');
    if (bar) bar.classList.remove('hidden');

    if (humanoid) {
      humanoid.setSpeed(speed);
      humanoid.playSequence(data.landmarks, speed, (fi, total) => {
        if (prog) prog.style.width = `${(fi / total) * 100}%`;
        const fiEl = document.getElementById('frame-info');
        if (fiEl) fiEl.textContent = `${fi} / ${total}`;
      }, () => {
        const pauseBtn = document.getElementById('pause-btn');
        if (pauseBtn) pauseBtn.textContent = 'Pause';
        setStatus(statusEl, 'Playback complete.', 'success');
      });
    }

    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) pauseBtn.textContent = 'Pause';
    if (prog) prog.style.width = '0%';

    setStatus(statusEl, `Playing "${label}" (${seq.length} frames)`, 'info');
  } catch (err) {
    setStatus(statusEl, err.message, 'error');
  }
}

// Play a sequence of signs (sentence translation)
async function playSentence(glossTokens) {
  const statusEl = document.getElementById('tts-status');
  const bar = document.getElementById('playback-bar');
  const avatarEmpty = document.getElementById('avatar-empty');
  const prog = document.getElementById('tts-progress');

  if (!glossTokens || !glossTokens.length) {
    setStatus(statusEl, 'No signs to play.', 'error');
    return;
  }

  if (avatarEmpty) avatarEmpty.classList.add('hidden');
  if (bar) bar.classList.remove('hidden');

  // Collect all sign data for the sentence
  const signSequences = [];
  const missing = [];

  for (const token of glossTokens) {
    try {
      const data = await fetchSign(token.sign);
      const seq = parseSequence(data.landmarks);
      if (seq.length) {
        signSequences.push({ sign: token.sign, frames: seq, nmm: token.nmm });
      } else {
        missing.push(token.sign);
      }
    } catch {
      missing.push(token.sign);
    }
  }

  if (!signSequences.length) {
    setStatus(statusEl, `No signs found in library for: ${missing.join(', ')}`, 'error');
    return;
  }

  // Build a combined sequence with transition pauses between signs
  const PAUSE_FRAMES = 6; // ~200ms pause at 30fps
  const combined = [];
  for (let i = 0; i < signSequences.length; i++) {
    combined.push(...signSequences[i].frames);
    // Insert pause (repeat last frame) between signs
    if (i < signSequences.length - 1 && signSequences[i].frames.length > 0) {
      const lastFrame = signSequences[i].frames[signSequences[i].frames.length - 1];
      for (let p = 0; p < PAUSE_FRAMES; p++) combined.push(lastFrame);
    }
  }

  if (missing.length) {
    setStatus(statusEl, `Playing ${signSequences.length} signs (missing: ${missing.join(', ')})`, 'info');
  } else {
    setStatus(statusEl, `Playing sentence: ${signSequences.map(s => s.sign).join(' → ')} (${combined.length} frames)`, 'info');
  }

  if (humanoid) {
    humanoid.setSpeed(speed);
    humanoid.playSequence(combined, speed, (fi, total) => {
      if (prog) prog.style.width = `${(fi / total) * 100}%`;
      const fiEl = document.getElementById('frame-info');
      if (fiEl) fiEl.textContent = `${fi} / ${total}`;
    }, () => {
      const pauseBtn = document.getElementById('pause-btn');
      if (pauseBtn) pauseBtn.textContent = 'Pause';
      setStatus(statusEl, 'Sentence playback complete.', 'success');
    });
  }

  if (prog) prog.style.width = '0%';
  const pauseBtn = document.getElementById('pause-btn');
  if (pauseBtn) pauseBtn.textContent = 'Pause';
}

async function loadLibrary(retries = 3) {
  const el = document.getElementById('sign-library');
  const searchInput = document.getElementById('tts-search');

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      _signs = await fetchSigns();
      break;
    } catch (err) {
      if (attempt === retries) {
        el.innerHTML = `<p class="hint" style="color: var(--danger);">Failed to load sign library: ${err.message}<br><button class="btn btn-sm" onclick="location.reload()">Retry</button></p>`;
        return;
      }
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }

  if (!_signs.length) {
    el.innerHTML = '<p class="hint">No signs yet. Contribute some first!</p>';
    return;
  }

  renderLibrary();
  if (!_searchBound) {
    _searchBound = true;
    searchInput.addEventListener('input', () => renderLibrary(searchInput.value.trim()));
  }
}

function renderLibrary(filter = '') {
  const el = document.getElementById('sign-library');
  const searchInput = document.getElementById('tts-search');

  const filtered = filter
    ? _signs.filter(s => s.label.toLowerCase().includes(filter.toLowerCase()))
    : _signs;

  if (!filtered.length) {
    el.innerHTML = '<p class="hint">No matching signs.</p>';
    return;
  }

  const loggedIn = isLoggedIn();
  el.innerHTML = filtered.map(s =>
    `<div class="sign-library-item" data-label="${esc(s.label)}">
      <span class="sign-label-text">${esc(s.label)}</span>
      <span class="sign-item-actions">
        <span class="sign-count">${s.count}</span>
        ${loggedIn ? `<button class="sign-delete-btn" data-label="${esc(s.label)}" title="Delete sign">&times;</button>` : ''}
      </span>
    </div>`
  ).join('');

  el.querySelectorAll('.sign-library-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.sign-delete-btn')) return;
      el.querySelectorAll('.sign-library-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      searchInput.value = item.dataset.label;
      playLabel(item.dataset.label);
    });
  });

  el.querySelectorAll('.sign-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const label = btn.dataset.label;
      if (!confirm(`Delete all recordings for "${label}"?`)) return;
      try {
        await deleteSign(label);
        toast(`Deleted "${label}"`, 'success');
        _signs.splice(_signs.findIndex(s => s.label === label), 1);
        renderLibrary(searchInput.value.trim());
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}

export function initViewer() {
  if (!inited) {
    inited = true;
    loadLibrary();

    document.getElementById('tts-search').addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const v = e.target.value.trim();
        if (v) playLabel(v);
      }
    });

    // Sentence translation
    const translateBtn = document.getElementById('tts-translate-btn');
    const sentenceInput = document.getElementById('tts-sentence');
    const glossDisplay = document.getElementById('gloss-display');
    const glossTokensEl = document.getElementById('gloss-tokens');

    translateBtn?.addEventListener('click', () => translateSentence());
    sentenceInput?.addEventListener('keydown', e => {
      if (e.key === 'Enter') translateSentence();
    });

    function translateSentence() {
      const text = sentenceInput?.value.trim();
      if (!text) return;

      const tokens = parseSentence(text);
      if (!tokens.length) {
        setStatus(document.getElementById('tts-status'), 'Could not parse sentence.', 'error');
        return;
      }

      // Display gloss
      if (glossDisplay && glossTokensEl) {
        glossTokensEl.innerHTML = tokens.map(t =>
          `<span class="gloss-token${t.nmm ? ' nmm-' + t.nmm : ''}">${esc(t.sign.toUpperCase())}</span>`
        ).join(' ');
        glossDisplay.classList.remove('hidden');
      }

      playSentence(tokens);
    }
  } else {
    loadLibrary();
  }

  // Initialize humanoid 3D avatar
  if (!humanoid) {
    humanoid = new HumanoidAvatar(document.getElementById('avatar-container'));
  }

  setStatus(document.getElementById('tts-status'), 'Select a sign or type a sentence.', 'info');

  document.getElementById('replay-btn')?.addEventListener('click', () => {
    if (humanoid) {
      humanoid.replay();
      document.getElementById('pause-btn').textContent = 'Pause';
      const prog = document.getElementById('tts-progress');
      if (prog) prog.style.width = '0%';
    }
  });

  document.getElementById('pause-btn')?.addEventListener('click', () => {
    if (humanoid) {
      const paused = humanoid.togglePause();
      document.getElementById('pause-btn').textContent = paused ? 'Resume' : 'Pause';
    }
  });

  const slider = document.getElementById('speed-slider');
  const sval = document.getElementById('speed-val');
  slider?.addEventListener('input', () => {
    speed = parseFloat(slider.value);
    sval.textContent = `${speed}x`;
    if (humanoid) humanoid.setSpeed(speed);
  });
}

export function getHumanoid() { return humanoid; }
export function setHumanoidCharacter(id) { if (humanoid) humanoid.setCharacter(id); }

function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
