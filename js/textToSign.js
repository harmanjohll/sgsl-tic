/* ============================================================
   SgSL Hub — Text-to-Sign (3D Playback)
   ============================================================
   Three.js-based 3D hand model that plays back recorded signs.
   Features:
   - Procedurally generated hand with cylindrical bones & palm mesh
   - Motion ghost trail showing recent poses
   - Smooth animation with interpolation
   - Orbit controls for 3D interaction
   - Speed & playback controls
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

// Palm triangle indices (connects wrist + finger bases)
const PALM_TRIS = [
  [0, 1, 5], [0, 5, 17], [5, 9, 17], [5, 6, 9],
  [9, 13, 17],
];

// Ghost trail config
const GHOST_COUNT = 3;
const GHOST_SPACING = 3; // frames between ghosts

// State
let scene, camera, renderer, controls;
let joints = [];
let boneMeshes = [];
let palmMesh;
let ghostGroups = [];
let group;
let currentSeq = [];
let playing = false;
let paused = false;
let frameIdx = 0;
let prevPose = null;
let playbackSpeed = 1;
let inited = false;
let frameAccumulator = 0;
let animFrame = null;
let poseHistory = [];

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

// --- Position a cylinder between two points ---
function placeCylinder(mesh, posA, posB) {
  const mid = new THREE.Vector3().addVectors(posA, posB).multiplyScalar(0.5);
  mesh.position.copy(mid);
  const dir = new THREE.Vector3().subVectors(posB, posA);
  const len = dir.length();
  mesh.scale.set(1, len, 1);
  if (len > 0.0001) {
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.normalize()
    );
  }
}

// --- Apply pose to 3D model ---
function applyPose(pose) {
  const positions = [];
  for (let i = 0; i < 21; i++) {
    const pos = to3D(pose[i]);
    joints[i].position.copy(pos);
    positions.push(pos);
  }

  // Update cylindrical bones
  boneMeshes.forEach(({ a, b, mesh }) => {
    placeCylinder(mesh, positions[a], positions[b]);
  });

  // Update palm mesh
  if (palmMesh) {
    const palmPos = palmMesh.geometry.attributes.position;
    let vi = 0;
    PALM_TRIS.forEach(([i0, i1, i2]) => {
      palmPos.setXYZ(vi++, positions[i0].x, positions[i0].y, positions[i0].z);
      palmPos.setXYZ(vi++, positions[i1].x, positions[i1].y, positions[i1].z);
      palmPos.setXYZ(vi++, positions[i2].x, positions[i2].y, positions[i2].z);
    });
    palmPos.needsUpdate = true;
    palmMesh.geometry.computeVertexNormals();
  }

  // Store pose for ghost trail
  poseHistory.push(positions.map(p => p.clone()));
  if (poseHistory.length > GHOST_COUNT * GHOST_SPACING + 1) {
    poseHistory.shift();
  }

  // Update ghost trails
  ghostGroups.forEach((ghost, gi) => {
    const histIdx = poseHistory.length - 1 - (gi + 1) * GHOST_SPACING;
    if (histIdx >= 0 && histIdx < poseHistory.length) {
      ghost.visible = true;
      const histPositions = poseHistory[histIdx];
      ghost.children.forEach((child, ci) => {
        if (ci < 21) {
          child.position.copy(histPositions[ci]);
        }
      });
      // Update ghost bones
      let boneIdx = 0;
      ghost.children.forEach(child => {
        if (child.userData.boneA !== undefined) {
          placeCylinder(child, histPositions[child.userData.boneA], histPositions[child.userData.boneB]);
          boneIdx++;
        }
      });
    } else {
      ghost.visible = false;
    }
  });

  // Update frame counter
  updateFrameCounter();
}

function updateFrameCounter() {
  const el = document.getElementById('frame-counter');
  if (el && currentSeq.length) {
    el.textContent = `${frameIdx} / ${currentSeq.length}`;
  }
}

// --- Build a ghost hand group ---
function buildGhostHand(opacity) {
  const g = new THREE.Group();
  const ghostJointMat = new THREE.MeshStandardMaterial({
    color: 0x6C63FF,
    transparent: true,
    opacity: opacity * 0.4,
    emissive: 0x6C63FF,
    emissiveIntensity: 0.3,
  });
  const ghostBoneMat = new THREE.MeshStandardMaterial({
    color: 0x8B85FF,
    transparent: true,
    opacity: opacity * 0.25,
    emissive: 0x8B85FF,
    emissiveIntensity: 0.2,
  });
  const jointGeom = new THREE.SphereGeometry(0.018, 8, 8);
  for (let i = 0; i < 21; i++) {
    g.add(new THREE.Mesh(jointGeom, ghostJointMat));
  }
  const boneGeom = new THREE.CylinderGeometry(0.006, 0.006, 1, 4);
  HAND_BONES.forEach(([a, b]) => {
    const mesh = new THREE.Mesh(boneGeom, ghostBoneMat);
    mesh.userData.boneA = a;
    mesh.userData.boneB = b;
    g.add(mesh);
  });
  g.visible = false;
  return g;
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
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  // Lighting — hemisphere for soft ambient
  scene.add(new THREE.HemisphereLight(0xddeeff, 0x222233, 0.8));

  // Key light — warm directional from upper-right
  const keyLight = new THREE.DirectionalLight(0xfff4e6, 1.0);
  keyLight.position.set(2, 3, 4);
  scene.add(keyLight);

  // Rim light — cool back light for edge definition
  const rimLight = new THREE.DirectionalLight(0x8B85FF, 0.6);
  rimLight.position.set(-2, -1, -3);
  scene.add(rimLight);

  // Fill light — subtle from below-left
  const fillLight = new THREE.PointLight(0x6C63FF, 0.3, 10);
  fillLight.position.set(-3, -2, 2);
  scene.add(fillLight);

  // Hand model group
  group = new THREE.Group();
  scene.add(group);

  // --- Joints (spheres with glow-like material) ---
  const jointGeom = new THREE.SphereGeometry(0.022, 20, 20);
  const tipGeom = new THREE.SphereGeometry(0.028, 20, 20);
  const wristGeom = new THREE.SphereGeometry(0.03, 20, 20);

  const jointMat = new THREE.MeshStandardMaterial({
    color: 0x7C74FF,
    metalness: 0.35,
    roughness: 0.3,
    emissive: 0x3a34a0,
    emissiveIntensity: 0.25,
  });
  const tipMat = new THREE.MeshStandardMaterial({
    color: 0xA89FFF,
    metalness: 0.4,
    roughness: 0.2,
    emissive: 0x6C63FF,
    emissiveIntensity: 0.35,
  });
  const wristMat = new THREE.MeshStandardMaterial({
    color: 0x5A52D5,
    metalness: 0.3,
    roughness: 0.35,
    emissive: 0x2a2660,
    emissiveIntensity: 0.2,
  });

  const tips = [4, 8, 12, 16, 20];

  for (let i = 0; i < 21; i++) {
    let geom, mat;
    if (i === 0) { geom = wristGeom; mat = wristMat; }
    else if (tips.includes(i)) { geom = tipGeom; mat = tipMat; }
    else { geom = jointGeom; mat = jointMat; }
    const mesh = new THREE.Mesh(geom, mat);
    group.add(mesh);
    joints.push(mesh);
  }

  // --- Bones (cylinders instead of lines) ---
  const boneGeom = new THREE.CylinderGeometry(0.008, 0.008, 1, 8);
  const boneMat = new THREE.MeshStandardMaterial({
    color: 0x9590FF,
    metalness: 0.3,
    roughness: 0.35,
    emissive: 0x4a44a0,
    emissiveIntensity: 0.2,
    transparent: true,
    opacity: 0.85,
  });
  HAND_BONES.forEach(([a, b]) => {
    const mesh = new THREE.Mesh(boneGeom, boneMat);
    group.add(mesh);
    boneMeshes.push({ a, b, mesh });
  });

  // --- Palm mesh (translucent triangles) ---
  const palmVerts = new Float32Array(PALM_TRIS.length * 3 * 3);
  const palmGeom = new THREE.BufferGeometry();
  palmGeom.setAttribute('position', new THREE.BufferAttribute(palmVerts, 3));
  const palmMat = new THREE.MeshStandardMaterial({
    color: 0x6C63FF,
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
    emissive: 0x6C63FF,
    emissiveIntensity: 0.1,
    depthWrite: false,
  });
  palmMesh = new THREE.Mesh(palmGeom, palmMat);
  group.add(palmMesh);

  // --- Ghost trails ---
  for (let i = 0; i < GHOST_COUNT; i++) {
    const opacity = 1 - (i + 1) / (GHOST_COUNT + 1);
    const ghost = buildGhostHand(opacity);
    group.add(ghost);
    ghostGroups.push(ghost);
  }

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

    if (playing && !paused && currentSeq.length) {
      frameAccumulator += playbackSpeed;
      while (frameAccumulator >= 1 && frameIdx < currentSeq.length) {
        const pose = smoothPose(currentSeq[frameIdx]);
        applyPose(pose);
        frameIdx++;
        frameAccumulator -= 1;
      }

      // Update progress bar
      const progressEl = document.getElementById('playback-progress');
      if (progressEl && currentSeq.length) {
        progressEl.style.width = `${(frameIdx / currentSeq.length) * 100}%`;
      }

      if (frameIdx >= currentSeq.length) {
        playing = false;
        frameIdx = 0;
        prevPose = null;
        poseHistory = [];
        ghostGroups.forEach(g => g.visible = false);
        const statusEl = document.getElementById('tts-status');
        if (statusEl) setStatus(statusEl, 'Playback complete.', 'success');
        // Update button states
        const pauseBtn = document.getElementById('pause-btn');
        if (pauseBtn) pauseBtn.textContent = 'Pause';
        paused = false;
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
    poseHistory = [];
    paused = false;
    playing = true;

    // Reset pause button
    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) pauseBtn.textContent = 'Pause';

    // Reset progress
    const progressEl = document.getElementById('playback-progress');
    if (progressEl) progressEl.style.width = '0%';

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
        poseHistory = [];
        paused = false;
        playing = true;
        const pauseBtn = document.getElementById('pause-btn');
        if (pauseBtn) pauseBtn.textContent = 'Pause';
        const progressEl = document.getElementById('playback-progress');
        if (progressEl) progressEl.style.width = '0%';
      }
    });
  }

  // Pause button
  const pauseBtn = document.getElementById('pause-btn');
  if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
      if (!playing && !paused) return;
      paused = !paused;
      pauseBtn.textContent = paused ? 'Resume' : 'Pause';
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
