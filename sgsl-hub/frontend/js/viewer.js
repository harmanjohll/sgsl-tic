/* ============================================================
   SgSL Hub — 3D Hand Viewer (Text-to-Sign)
   ============================================================
   Three.js procedural hand with cylindrical bones, translucent
   palm, motion ghost trail, and polished playback controls.
   ============================================================ */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { fetchSigns, fetchSign } from './api.js';
import { setStatus, viewMode } from './app.js';
import { playSign as avatarPlay, togglePause as avatarToggle, replay as avatarReplay, setSpeed as avatarSetSpeed } from './avatar.js';

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
let joints = [], boneMeshes = [], palmMesh, ghostGroups = [], group;
let currentSeq = [], playing = false, paused = false;
let frameIdx = 0, frameAcc = 0, speed = 1;
let prevPose = null, poseHistory = [];
let inited = false;

function to3D(p) {
  return new THREE.Vector3(
    (p[0] - 0.5) * 2,
    (0.5 - p[1]) * 2,
    -(p[2] ?? 0) * 0.7
  );
}

function smooth(curr) {
  if (!prevPose || prevPose.length !== curr.length) {
    prevPose = curr.map(p => p.slice());
    return curr;
  }
  const out = curr.map((p, i) => [
    prevPose[i][0] * (1 - SMOOTHING) + p[0] * SMOOTHING,
    prevPose[i][1] * (1 - SMOOTHING) + p[1] * SMOOTHING,
    (prevPose[i][2] ?? 0) * (1 - SMOOTHING) + (p[2] ?? 0) * SMOOTHING,
  ]);
  prevPose = out.map(p => p.slice());
  return out;
}

function placeCyl(mesh, a, b) {
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  mesh.position.copy(mid);
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  mesh.scale.set(1, len, 1);
  if (len > 1e-4) mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.normalize());
}

function applyPose(pose) {
  const pos = [];
  for (let i = 0; i < 21; i++) {
    const p = to3D(pose[i]);
    joints[i].position.copy(p);
    pos.push(p);
  }
  boneMeshes.forEach(({ a, b, mesh }) => placeCyl(mesh, pos[a], pos[b]));

  if (palmMesh) {
    const attr = palmMesh.geometry.attributes.position;
    let vi = 0;
    PALM_TRIS.forEach(([i0,i1,i2]) => {
      attr.setXYZ(vi++, pos[i0].x, pos[i0].y, pos[i0].z);
      attr.setXYZ(vi++, pos[i1].x, pos[i1].y, pos[i1].z);
      attr.setXYZ(vi++, pos[i2].x, pos[i2].y, pos[i2].z);
    });
    attr.needsUpdate = true;
    palmMesh.geometry.computeVertexNormals();
  }

  poseHistory.push(pos.map(p => p.clone()));
  if (poseHistory.length > GHOST_COUNT * GHOST_SPACING + 1) poseHistory.shift();

  ghostGroups.forEach((ghost, gi) => {
    const hi = poseHistory.length - 1 - (gi + 1) * GHOST_SPACING;
    if (hi >= 0 && hi < poseHistory.length) {
      ghost.visible = true;
      const hp = poseHistory[hi];
      ghost.children.forEach(child => {
        if (child.userData.jointIdx !== undefined) {
          child.position.copy(hp[child.userData.jointIdx]);
        } else if (child.userData.boneA !== undefined) {
          placeCyl(child, hp[child.userData.boneA], hp[child.userData.boneB]);
        }
      });
    } else {
      ghost.visible = false;
    }
  });

  const fi = document.getElementById('frame-info');
  if (fi) fi.textContent = `${frameIdx} / ${currentSeq.length}`;
}

function buildGhost(opacity) {
  const g = new THREE.Group();
  const jm = new THREE.MeshStandardMaterial({
    color: 0x6C63FF, transparent: true, opacity: opacity * 0.35,
    emissive: 0x6C63FF, emissiveIntensity: 0.3,
  });
  const bm = new THREE.MeshStandardMaterial({
    color: 0x8B85FF, transparent: true, opacity: opacity * 0.2,
    emissive: 0x8B85FF, emissiveIntensity: 0.2,
  });
  const jg = new THREE.SphereGeometry(0.016, 8, 8);
  for (let i = 0; i < 21; i++) {
    const m = new THREE.Mesh(jg, jm);
    m.userData.jointIdx = i;
    g.add(m);
  }
  const bg = new THREE.CylinderGeometry(0.005, 0.005, 1, 4);
  BONES.forEach(([a, b]) => {
    const m = new THREE.Mesh(bg, bm);
    m.userData.boneA = a;
    m.userData.boneB = b;
    g.add(m);
  });
  g.visible = false;
  return g;
}

function buildScene() {
  const container = document.getElementById('threejs-container');
  const canvas = document.createElement('canvas');
  container.innerHTML = '';
  container.appendChild(canvas);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 100);
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

  group = new THREE.Group();
  scene.add(group);

  // Joints
  const jg = new THREE.SphereGeometry(0.022, 20, 20);
  const tg = new THREE.SphereGeometry(0.028, 20, 20);
  const wg = new THREE.SphereGeometry(0.03, 20, 20);
  const jm = new THREE.MeshStandardMaterial({ color: 0x7C74FF, metalness: 0.35, roughness: 0.3, emissive: 0x3a34a0, emissiveIntensity: 0.25 });
  const tm = new THREE.MeshStandardMaterial({ color: 0xA89FFF, metalness: 0.4, roughness: 0.2, emissive: 0x6C63FF, emissiveIntensity: 0.35 });
  const wm = new THREE.MeshStandardMaterial({ color: 0x5A52D5, metalness: 0.3, roughness: 0.35, emissive: 0x2a2660, emissiveIntensity: 0.2 });
  const tips = [4,8,12,16,20];

  for (let i = 0; i < 21; i++) {
    const mesh = new THREE.Mesh(
      i === 0 ? wg : tips.includes(i) ? tg : jg,
      i === 0 ? wm : tips.includes(i) ? tm : jm
    );
    group.add(mesh);
    joints.push(mesh);
  }

  // Bones (cylinders)
  const boneGeom = new THREE.CylinderGeometry(0.008, 0.008, 1, 8);
  const boneMat = new THREE.MeshStandardMaterial({
    color: 0x9590FF, metalness: 0.3, roughness: 0.35,
    emissive: 0x4a44a0, emissiveIntensity: 0.2,
    transparent: true, opacity: 0.85,
  });
  BONES.forEach(([a, b]) => {
    const mesh = new THREE.Mesh(boneGeom, boneMat);
    group.add(mesh);
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
  palmMesh = new THREE.Mesh(pg, pm);
  group.add(palmMesh);

  // Ghosts
  for (let i = 0; i < GHOST_COUNT; i++) {
    const g = buildGhost(1 - (i + 1) / (GHOST_COUNT + 1));
    group.add(g);
    ghostGroups.push(g);
  }

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
        applyPose(smooth(currentSeq[frameIdx]));
        frameIdx++;
        frameAcc -= 1;
      }
      const prog = document.getElementById('tts-progress');
      if (prog) prog.style.width = `${(frameIdx / currentSeq.length) * 100}%`;

      if (frameIdx >= currentSeq.length) {
        playing = false;
        frameIdx = 0;
        prevPose = null;
        poseHistory = [];
        ghostGroups.forEach(g => g.visible = false);
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

async function playLabel(label) {
  const statusEl = document.getElementById('tts-status');
  const emptyState = document.getElementById('tts-empty');
  const bar = document.getElementById('playback-bar');

  try {
    setStatus(statusEl, `Loading "${label}"...`, 'loading');
    const data = await fetchSign(label);
    const seq = (data.landmarks || []).map(fr => Array.isArray(fr?.[0]) && fr[0].length === 3 ? fr[0] : fr).filter(f => Array.isArray(f) && f.length >= 21);

    if (!seq.length) {
      // Try treating each frame directly as 21 landmarks
      const flatSeq = (data.landmarks || []).filter(f => Array.isArray(f) && f.length >= 21);
      if (!flatSeq.length) throw new Error(`No valid landmarks for "${label}".`);
      currentSeq = flatSeq;
    } else {
      currentSeq = seq;
    }

    if (emptyState) emptyState.classList.add('hidden');
    const avatarEmpty = document.getElementById('avatar-empty');
    if (avatarEmpty) avatarEmpty.classList.add('hidden');
    if (bar) bar.classList.remove('hidden');

    frameIdx = 0;
    frameAcc = 0;
    prevPose = null;
    poseHistory = [];
    paused = false;
    playing = true;

    // Also play on avatar
    const prog = document.getElementById('tts-progress');
    avatarPlay(data.landmarks, speed, (fi, total) => {
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

    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) pauseBtn.textContent = 'Pause';
    if (prog) prog.style.width = '0%';

    setStatus(statusEl, `Playing "${label}" (${currentSeq.length} frames)`, 'info');
  } catch (err) {
    setStatus(statusEl, err.message, 'error');
  }
}

async function loadLibrary() {
  const el = document.getElementById('sign-library');
  const searchInput = document.getElementById('tts-search');

  try {
    const signs = await fetchSigns();
    if (!signs.length) {
      el.innerHTML = '<p class="hint">No signs yet. Contribute some first!</p>';
      return;
    }

    function render(filter = '') {
      const filtered = filter
        ? signs.filter(s => s.label.toLowerCase().includes(filter.toLowerCase()))
        : signs;

      if (!filtered.length) {
        el.innerHTML = '<p class="hint">No matching signs.</p>';
        return;
      }

      el.innerHTML = filtered.map(s =>
        `<div class="sign-library-item" data-label="${esc(s.label)}">
          <span>${esc(s.label)}</span>
          <span class="sign-count">${s.count}</span>
        </div>`
      ).join('');

      el.querySelectorAll('.sign-library-item').forEach(item => {
        item.addEventListener('click', () => {
          el.querySelectorAll('.sign-library-item').forEach(i => i.classList.remove('active'));
          item.classList.add('active');
          searchInput.value = item.dataset.label;
          playLabel(item.dataset.label);
        });
      });
    }

    render();
    searchInput.addEventListener('input', () => render(searchInput.value.trim()));
  } catch (err) {
    el.innerHTML = `<p class="hint" style="color: var(--danger);">Failed to load: ${err.message}</p>`;
  }
}

export function initViewer() {
  if (!inited) {
    buildScene();
    loadLibrary();
  }

  setStatus(document.getElementById('tts-status'), 'Select a sign from the library.', 'info');

  document.getElementById('tts-search').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const v = e.target.value.trim();
      if (v) playLabel(v);
    }
  });

  document.getElementById('replay-btn')?.addEventListener('click', () => {
    if (currentSeq.length) {
      frameIdx = 0; frameAcc = 0; prevPose = null; poseHistory = [];
      paused = false; playing = true;
      document.getElementById('pause-btn').textContent = 'Pause';
      const prog = document.getElementById('tts-progress');
      if (prog) prog.style.width = '0%';
      avatarReplay();
    }
  });

  document.getElementById('pause-btn')?.addEventListener('click', () => {
    if (!playing && !paused) return;
    paused = !paused;
    document.getElementById('pause-btn').textContent = paused ? 'Resume' : 'Pause';
    avatarToggle();
  });

  const slider = document.getElementById('speed-slider');
  const sval = document.getElementById('speed-val');
  slider?.addEventListener('input', () => {
    speed = parseFloat(slider.value);
    sval.textContent = `${speed}x`;
    avatarSetSpeed(speed);
  });
}

function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
