/* ============================================================
   SgSL Hub — 3D Hand Viewer (Text-to-Sign)
   ============================================================
   Three.js procedural hand with cylindrical bones, translucent
   palm, motion ghost trail, and polished playback controls.
   Supports two hands (holistic) and legacy single-hand format.
   ============================================================ */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { fetchSigns, fetchSign, deleteSign } from './api.js';
import { setStatus, viewMode, toast } from './app.js';
import { isLoggedIn } from './auth.js';
import { HumanoidAvatar } from './humanoid.js';

let humanoid = null;

const BONES = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17],
];

const PALM_TRIS = [
  [0,1,5],[0,5,17],[5,9,17],[5,6,9],[9,13,17],
];

const GHOST_COUNT = 3;
const GHOST_SPACING = 3;
const SMOOTHING = 0.6;

let scene, camera, renderer, controls;
// Two sets of hand meshes
let rightJoints = [], rightBoneMeshes = [], rightPalmMesh;
let leftJoints = [], leftBoneMeshes = [], leftPalmMesh;
let rightGroup, leftGroup;
let ghostGroups = [], mainGroup;
let currentSeq = [], playing = false, paused = false;
let frameIdx = 0, frameAcc = 0, speed = 1;
let prevRight = null, prevLeft = null, poseHistory = [];
let inited = false;

function to3D(p, xOffset = 0) {
  return new THREE.Vector3(
    (p[0] - 0.5) * 2 + xOffset,
    (0.5 - p[1]) * 2,
    -(p[2] ?? 0) * 0.7
  );
}

function smoothHand(curr, prev) {
  if (!prev || prev.length !== curr.length) return curr.map(p => p.slice());
  return curr.map((p, i) => [
    prev[i][0] * (1 - SMOOTHING) + p[0] * SMOOTHING,
    prev[i][1] * (1 - SMOOTHING) + p[1] * SMOOTHING,
    (prev[i][2] ?? 0) * (1 - SMOOTHING) + (p[2] ?? 0) * SMOOTHING,
  ]);
}

function placeCyl(mesh, a, b) {
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  mesh.position.copy(mid);
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  mesh.scale.set(1, len, 1);
  if (len > 1e-4) mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.normalize());
}

function applyHandPose(handLandmarks, joints, boneMeshes, palm, xOffset = 0) {
  if (!handLandmarks) {
    joints.forEach(j => j.visible = false);
    boneMeshes.forEach(b => b.mesh.visible = false);
    if (palm) palm.visible = false;
    return null;
  }

  const pos = [];
  for (let i = 0; i < 21; i++) {
    const p = to3D(handLandmarks[i], xOffset);
    joints[i].position.copy(p);
    joints[i].visible = true;
    pos.push(p);
  }
  boneMeshes.forEach(({ a, b, mesh }) => { mesh.visible = true; placeCyl(mesh, pos[a], pos[b]); });

  if (palm) {
    palm.visible = true;
    const attr = palm.geometry.attributes.position;
    let vi = 0;
    PALM_TRIS.forEach(([i0,i1,i2]) => {
      attr.setXYZ(vi++, pos[i0].x, pos[i0].y, pos[i0].z);
      attr.setXYZ(vi++, pos[i1].x, pos[i1].y, pos[i1].z);
      attr.setXYZ(vi++, pos[i2].x, pos[i2].y, pos[i2].z);
    });
    attr.needsUpdate = true;
    palm.geometry.computeVertexNormals();
  }

  return pos;
}

function applyFrame(frame) {
  // Parse frame
  let rightHand = null, leftHand = null;
  if (frame.rightHand || frame.leftHand) {
    rightHand = frame.rightHand;
    leftHand = frame.leftHand;
  } else if (Array.isArray(frame) && frame.length >= 21) {
    rightHand = frame;
  }

  // Smooth
  const smoothedRight = rightHand ? smoothHand(rightHand, prevRight) : null;
  const smoothedLeft = leftHand ? smoothHand(leftHand, prevLeft) : null;
  prevRight = smoothedRight ? smoothedRight.map(p => p.slice()) : null;
  prevLeft = smoothedLeft ? smoothedLeft.map(p => p.slice()) : null;

  applyHandPose(smoothedRight, rightJoints, rightBoneMeshes, rightPalmMesh);
  applyHandPose(smoothedLeft, leftJoints, leftBoneMeshes, leftPalmMesh);

  const fi = document.getElementById('frame-info');
  if (fi) fi.textContent = `${frameIdx} / ${currentSeq.length}`;
}

function buildHandMeshes(parentGroup, color, emissiveColor) {
  const joints = [], boneMeshes = [];
  const jg = new THREE.SphereGeometry(0.022, 20, 20);
  const tg = new THREE.SphereGeometry(0.028, 20, 20);
  const wg = new THREE.SphereGeometry(0.03, 20, 20);
  const jm = new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.3, emissive: emissiveColor, emissiveIntensity: 0.25 });
  const tm = new THREE.MeshStandardMaterial({ color: 0xA89FFF, metalness: 0.4, roughness: 0.2, emissive: 0x6C63FF, emissiveIntensity: 0.35 });
  const wm = new THREE.MeshStandardMaterial({ color: 0x5A52D5, metalness: 0.3, roughness: 0.35, emissive: 0x2a2660, emissiveIntensity: 0.2 });
  const tips = [4,8,12,16,20];

  for (let i = 0; i < 21; i++) {
    const mesh = new THREE.Mesh(
      i === 0 ? wg : tips.includes(i) ? tg : jg,
      i === 0 ? wm : tips.includes(i) ? tm : jm
    );
    mesh.visible = false;
    parentGroup.add(mesh);
    joints.push(mesh);
  }

  const boneGeom = new THREE.CylinderGeometry(0.008, 0.008, 1, 8);
  const boneMat = new THREE.MeshStandardMaterial({
    color: 0x9590FF, metalness: 0.3, roughness: 0.35,
    emissive: 0x4a44a0, emissiveIntensity: 0.2,
    transparent: true, opacity: 0.85,
  });
  BONES.forEach(([a, b]) => {
    const mesh = new THREE.Mesh(boneGeom, boneMat);
    mesh.visible = false;
    parentGroup.add(mesh);
    boneMeshes.push({ a, b, mesh });
  });

  // Palm
  const pv = new Float32Array(PALM_TRIS.length * 9);
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pv, 3));
  const pm = new THREE.MeshStandardMaterial({
    color: 0x6C63FF, transparent: true, opacity: 0.15,
    side: THREE.DoubleSide, emissive: 0x6C63FF, emissiveIntensity: 0.1, depthWrite: false,
  });
  const palmMesh = new THREE.Mesh(pg, pm);
  palmMesh.visible = false;
  parentGroup.add(palmMesh);

  return { joints, boneMeshes, palmMesh };
}

function buildScene() {
  const container = document.getElementById('threejs-container');
  const canvas = document.createElement('canvas');
  container.innerHTML = '';
  container.appendChild(canvas);

  // Use fallback dimensions if container is hidden (0 size)
  const w = container.clientWidth || 400;
  const h = container.clientHeight || 520;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
  camera.position.set(0, 0, 2.2);

  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  // Lights
  scene.add(new THREE.HemisphereLight(0xddeeff, 0x222233, 0.8));
  const key = new THREE.DirectionalLight(0xfff4e6, 1.0);
  key.position.set(2, 3, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8B85FF, 0.6);
  rim.position.set(-2, -1, -3);
  scene.add(rim);
  const fill = new THREE.PointLight(0x6C63FF, 0.3, 10);
  fill.position.set(-3, -2, 2);
  scene.add(fill);

  mainGroup = new THREE.Group();
  scene.add(mainGroup);

  // Build right hand (purple)
  rightGroup = new THREE.Group();
  mainGroup.add(rightGroup);
  const rh = buildHandMeshes(rightGroup, 0x7C74FF, 0x3a34a0);
  rightJoints = rh.joints;
  rightBoneMeshes = rh.boneMeshes;
  rightPalmMesh = rh.palmMesh;

  // Build left hand (teal-tinted)
  leftGroup = new THREE.Group();
  mainGroup.add(leftGroup);
  const lh = buildHandMeshes(leftGroup, 0x48C78E, 0x2a6648);
  leftJoints = lh.joints;
  leftBoneMeshes = lh.boneMeshes;
  leftPalmMesh = lh.palmMesh;

  // Resize
  new ResizeObserver(() => {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }).observe(container);

  // Animate
  (function animate() {
    requestAnimationFrame(animate);
    controls.update();

    if (playing && !paused && currentSeq.length) {
      frameAcc += speed;
      while (frameAcc >= 1 && frameIdx < currentSeq.length) {
        applyFrame(currentSeq[frameIdx]);
        frameIdx++;
        frameAcc -= 1;
      }
      const prog = document.getElementById('tts-progress');
      if (prog) prog.style.width = `${(frameIdx / currentSeq.length) * 100}%`;

      if (frameIdx >= currentSeq.length) {
        playing = false;
        frameIdx = 0;
        prevRight = null;
        prevLeft = null;
        poseHistory = [];
        const pauseBtn = document.getElementById('pause-btn');
        if (pauseBtn) pauseBtn.textContent = 'Pause';
        paused = false;
        setStatus(document.getElementById('tts-status'), 'Playback complete.', 'success');
      }
    }

    renderer.render(scene, camera);
  })();

  inited = true;
}

// Parse raw DB landmarks into a sequence of holistic frames
function parseSequence(landmarks) {
  if (!landmarks || !landmarks.length) return [];

  // Check first frame to determine format
  const first = landmarks[0];

  // Holistic format: array of {leftHand, rightHand, face, pose}
  if (first && typeof first === 'object' && !Array.isArray(first) && ('leftHand' in first || 'rightHand' in first)) {
    return landmarks.filter(f => f.leftHand || f.rightHand);
  }

  // Legacy: array of [21 landmarks] or [[21 landmarks]] or [[[x,y,z],...21]]
  const seq = landmarks
    .map(fr => {
      if (!Array.isArray(fr)) return null;

      // Direct 21 landmarks: [[x,y,z], ...] where fr.length >= 21
      if (fr.length >= 21 && Array.isArray(fr[0]) && fr[0].length >= 2 && typeof fr[0][0] === 'number') {
        return { rightHand: fr, leftHand: null, face: null };
      }

      // Wrapped format from old DB: [[[x,y,z],...21]] or [[[x,y,z],...21], [[x,y,z],...21]]
      if (fr.length <= 2 && Array.isArray(fr[0]) && fr[0].length >= 21
          && Array.isArray(fr[0][0]) && fr[0][0].length >= 2) {
        const rightHand = fr[0];
        const leftHand = fr.length === 2 && Array.isArray(fr[1]) && fr[1].length >= 21 ? fr[1] : null;
        return { rightHand, leftHand, face: null };
      }

      return null;
    })
    .filter(f => f !== null);

  return seq;
}

async function playLabel(label) {
  const statusEl = document.getElementById('tts-status');
  const emptyState = document.getElementById('tts-empty');
  const bar = document.getElementById('playback-bar');

  try {
    setStatus(statusEl, `Loading "${label}"...`, 'loading');
    const data = await fetchSign(label);
    currentSeq = parseSequence(data.landmarks);

    if (!currentSeq.length) throw new Error(`No valid landmarks for "${label}".`);

    if (emptyState) emptyState.classList.add('hidden');
    const avatarEmpty = document.getElementById('avatar-empty');
    if (avatarEmpty) avatarEmpty.classList.add('hidden');
    if (bar) bar.classList.remove('hidden');

    frameIdx = 0;
    frameAcc = 0;
    prevRight = null;
    prevLeft = null;
    poseHistory = [];
    paused = false;
    playing = true;

    // Also play on humanoid avatar
    const prog = document.getElementById('tts-progress');
    if (humanoid) {
      humanoid.setSpeed(speed);
      humanoid.playSequence(data.landmarks, speed, (fi, total) => {
        if (prog && viewMode === 'avatar') prog.style.width = `${(fi / total) * 100}%`;
        const fiEl = document.getElementById('frame-info');
        if (fiEl && viewMode === 'avatar') fiEl.textContent = `${fi} / ${total}`;
      }, () => {
        if (viewMode === 'avatar') {
          const pauseBtn = document.getElementById('pause-btn');
          if (pauseBtn) pauseBtn.textContent = 'Pause';
          setStatus(statusEl, 'Playback complete.', 'success');
        }
      });
    }

    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) pauseBtn.textContent = 'Pause';
    if (prog) prog.style.width = '0%';

    setStatus(statusEl, `Playing "${label}" (${currentSeq.length} frames)`, 'info');
  } catch (err) {
    setStatus(statusEl, err.message, 'error');
  }
}

let _signs = [];
let _searchBound = false;

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
      // Wait before retrying (exponential backoff)
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
    buildScene();
    loadLibrary();

    document.getElementById('tts-search').addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const v = e.target.value.trim();
        if (v) playLabel(v);
      }
    });
  } else {
    // Refresh library on subsequent tab switches to pick up newly contributed signs
    loadLibrary();
  }

  // Initialize humanoid 3D avatar in the avatar container
  if (!humanoid) {
    humanoid = new HumanoidAvatar(document.getElementById('avatar-container'));
  }

  setStatus(document.getElementById('tts-status'), 'Select a sign from the library.', 'info');

  document.getElementById('replay-btn')?.addEventListener('click', () => {
    if (currentSeq.length) {
      frameIdx = 0; frameAcc = 0; prevRight = null; prevLeft = null; poseHistory = [];
      paused = false; playing = true;
      document.getElementById('pause-btn').textContent = 'Pause';
      const prog = document.getElementById('tts-progress');
      if (prog) prog.style.width = '0%';
      if (humanoid) humanoid.replay();
    }
  });

  document.getElementById('pause-btn')?.addEventListener('click', () => {
    if (!playing && !paused) return;
    paused = !paused;
    document.getElementById('pause-btn').textContent = paused ? 'Resume' : 'Pause';
    if (humanoid) humanoid.togglePause();
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
