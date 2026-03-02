/* ============================================================
   SgSL Hub — Text-to-Sign (3D Playback)
   ============================================================
   Three.js-based 3D hand skeleton that plays back recorded signs.
   Features:
   - Procedurally generated hand model (no GLB files)
   - Smooth animation with interpolation
   - Orbit controls for 3D interaction
   - Speed control
   - Sign library browser with search
   ============================================================ */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { db, TABLE, SMOOTHING_ALPHA } from './config.js';
import { setStatus } from './app.js';

// MediaPipe hand bone connections
const HAND_BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],          // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],          // index
  [5, 9], [9, 10], [10, 11], [11, 12],     // middle
  [9, 13], [13, 14], [14, 15], [15, 16],   // ring
  [13, 17], [17, 18], [18, 19], [19, 20],  // pinky
  [0, 17],                                  // palm base
];

// State
let scene, camera, renderer, controls;
let joints = [];
let bones = [];
let group;
let currentSeq = [];
let playing = false;
let frameIdx = 0;
let prevPose = null;
let playbackSpeed = 1;
let inited = false;
let frameAccumulator = 0;
let animFrame = null;

// --- Coordinate conversion ---
function to3D(p) {
  const S = 2.0;
  return new THREE.Vector3(
    (p[0] - 0.5) * S,
    (0.5 - p[1]) * S,
    -(p[2] ?? 0) * 0.7
  );
}

// --- Pose smoothing ---
function smoothPose(curr, alpha = SMOOTHING_ALPHA) {
  if (!prevPose || prevPose.length !== curr.length) {
    prevPose = curr.map(p => p.slice());
    return curr;
  }
  const out = curr.map((p, i) => [
    prevPose[i][0] * (1 - alpha) + p[0] * alpha,
    prevPose[i][1] * (1 - alpha) + p[1] * alpha,
    (prevPose[i][2] ?? 0) * (1 - alpha) + (p[2] ?? 0) * alpha,
  ]);
  prevPose = out.map(p => p.slice());
  return out;
}

// --- Apply pose to 3D model ---
function applyPose(pose) {
  for (let i = 0; i < 21; i++) {
    joints[i].position.copy(to3D(pose[i]));
  }
  bones.forEach(({ a, b, line }) => {
    const posAttr = line.geometry.attributes.position;
    const A = joints[a].position;
    const B = joints[b].position;
    posAttr.setXYZ(0, A.x, A.y, A.z);
    posAttr.setXYZ(1, B.x, B.y, B.z);
    posAttr.needsUpdate = true;
  });
}

// --- Build Three.js scene ---
function buildScene() {
  const container = document.getElementById('threejs-container');
  const canvas = document.createElement('canvas');
  container.innerHTML = '';
  container.appendChild(canvas);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    50,
    container.clientWidth / container.clientHeight,
    0.1,
    100
  );
  camera.position.set(0, 0, 2.2);

  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  // Lighting
  scene.add(new THREE.HemisphereLight(0xddeeff, 0x222233, 1.0));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(2, 3, 4);
  scene.add(dirLight);

  // Hand model group
  group = new THREE.Group();
  scene.add(group);

  // Joints (spheres)
  const jointGeom = new THREE.SphereGeometry(0.022, 16, 16);
  const jointMat = new THREE.MeshStandardMaterial({
    color: 0x6C63FF,
    metalness: 0.2,
    roughness: 0.5,
    emissive: 0x2a2660,
    emissiveIntensity: 0.15,
  });
  // Fingertip material (slightly brighter)
  const tipMat = new THREE.MeshStandardMaterial({
    color: 0x8B85FF,
    metalness: 0.2,
    roughness: 0.4,
    emissive: 0x4a44a0,
    emissiveIntensity: 0.2,
  });
  const tips = [4, 8, 12, 16, 20]; // fingertip indices

  for (let i = 0; i < 21; i++) {
    const mesh = new THREE.Mesh(
      tips.includes(i) ? new THREE.SphereGeometry(0.025, 16, 16) : jointGeom,
      tips.includes(i) ? tipMat : jointMat
    );
    group.add(mesh);
    joints.push(mesh);
  }

  // Bones (lines)
  const boneMat = new THREE.LineBasicMaterial({
    color: 0x8B85FF,
    linewidth: 2,
    transparent: true,
    opacity: 0.7,
  });
  HAND_BONES.forEach(([a, b]) => {
    const geom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    const line = new THREE.Line(geom, boneMat);
    group.add(line);
    bones.push({ a, b, line });
  });

  // Handle resize
  const resizeObserver = new ResizeObserver(() => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  });
  resizeObserver.observe(container);

  // Render loop
  function animate() {
    animFrame = requestAnimationFrame(animate);
    controls.update();

    if (playing && currentSeq.length) {
      frameAccumulator += playbackSpeed;
      while (frameAccumulator >= 1 && frameIdx < currentSeq.length) {
        const pose = smoothPose(currentSeq[frameIdx]);
        applyPose(pose);
        frameIdx++;
        frameAccumulator -= 1;
      }

      if (frameIdx >= currentSeq.length) {
        playing = false;
        frameIdx = 0;
        prevPose = null;
        const statusEl = document.getElementById('tts-status');
        if (statusEl) setStatus(statusEl, 'Playback complete.', 'success');
      }
    }

    renderer.render(scene, camera);
  }
  animate();

  inited = true;
}

// --- Play a sign by label ---
async function playLabel(label) {
  const statusEl = document.getElementById('tts-status');
  const emptyState = document.getElementById('tts-empty');
  const playbackCtrl = document.getElementById('playback-controls');

  try {
    setStatus(statusEl, `Loading "${label}"...`, 'loading');

    const { data, error } = await db
      .from(TABLE)
      .select('landmarks')
      .eq('label', label)
      .limit(1);

    if (error) throw error;

    const seq = (data?.[0]?.landmarks || []).map(fr => fr?.[0]).filter(Boolean);
    if (!seq.length) throw new Error(`No landmarks found for "${label}".`);

    // Hide empty state, show controls
    if (emptyState) emptyState.classList.add('hidden');
    if (playbackCtrl) playbackCtrl.classList.remove('hidden');

    currentSeq = seq;
    frameIdx = 0;
    frameAccumulator = 0;
    prevPose = null;
    playing = true;

    setStatus(statusEl, `Playing "${label}" (${seq.length} frames)`, 'info');
  } catch (err) {
    console.error('Playback error:', err);
    setStatus(statusEl, err.message, 'error');
  }
}

// --- Fetch and display sign library ---
async function loadSignLibrary() {
  const libraryEl = document.getElementById('sign-library');
  const searchInput = document.getElementById('tts-input');

  try {
    const { data, error } = await db
      .from(TABLE)
      .select('label');

    if (error) throw error;

    if (!data || data.length === 0) {
      libraryEl.innerHTML = '<p class="hint" style="padding: 1rem;">No signs in the library yet. Contribute some signs first!</p>';
      return;
    }

    // Count occurrences per label
    const counts = {};
    data.forEach(row => {
      const label = row.label;
      counts[label] = (counts[label] || 0) + 1;
    });

    const labels = Object.keys(counts).sort();

    function renderList(filter = '') {
      const filtered = filter
        ? labels.filter(l => l.toLowerCase().includes(filter.toLowerCase()))
        : labels;

      if (filtered.length === 0) {
        libraryEl.innerHTML = '<p class="hint" style="padding: 1rem;">No matching signs found.</p>';
        return;
      }

      libraryEl.innerHTML = filtered.map(label => `
        <div class="sign-library-item" data-label="${escapeAttr(label)}">
          <span>${escapeHtml(label)}</span>
          <span class="sign-count">${counts[label]} sample${counts[label] > 1 ? 's' : ''}</span>
        </div>
      `).join('');

      // Click handler for each item
      libraryEl.querySelectorAll('.sign-library-item').forEach(item => {
        item.addEventListener('click', () => {
          // Highlight active
          libraryEl.querySelectorAll('.sign-library-item').forEach(el =>
            el.classList.remove('active')
          );
          item.classList.add('active');
          searchInput.value = item.dataset.label;
          playLabel(item.dataset.label);
        });
      });
    }

    renderList();

    // Search filter
    searchInput.addEventListener('input', () => {
      renderList(searchInput.value.trim());
    });
  } catch (err) {
    console.error('Library load error:', err);
    libraryEl.innerHTML = `<p class="hint" style="padding: 1rem; color: var(--danger);">Failed to load library: ${err.message}</p>`;
  }
}

// --- Public init ---
export function initTextToSign() {
  if (!inited) {
    buildScene();
    loadSignLibrary();
  }

  const statusEl = document.getElementById('tts-status');
  setStatus(statusEl, '3D scene ready. Select a sign from the library.', 'info');

  // Play button
  const playBtn = document.getElementById('tts-play-btn');
  playBtn.addEventListener('click', () => {
    const label = document.getElementById('tts-input').value.trim();
    if (label) playLabel(label);
  });

  // Enter key on input
  document.getElementById('tts-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') playBtn.click();
  });

  // Replay button
  const replayBtn = document.getElementById('replay-btn');
  if (replayBtn) {
    replayBtn.addEventListener('click', () => {
      if (currentSeq.length) {
        frameIdx = 0;
        frameAccumulator = 0;
        prevPose = null;
        playing = true;
      }
    });
  }

  // Speed slider
  const speedSlider = document.getElementById('speed-slider');
  const speedValue = document.getElementById('speed-value');
  if (speedSlider) {
    speedSlider.addEventListener('input', () => {
      playbackSpeed = parseFloat(speedSlider.value);
      speedValue.textContent = `${playbackSpeed}x`;
    });
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
