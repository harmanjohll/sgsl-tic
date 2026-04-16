/* ============================================================
   SgSL Avatar — Three.js Scene + VRM Loader (three-vrm v3)
   ============================================================ */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

export class SMPLXAvatar {
  constructor(containerEl) {
    this.container = typeof containerEl === 'string'
      ? document.getElementById(containerEl) : containerEl;
    if (!this.container) return;

    this.vrm = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.clock = new THREE.Clock();
    this.loaded = false;
    this._statusEl = null;

    this._initScene();
    this._loadVRM();
  }

  _initScene() {
    const w = this.container.clientWidth || 400;
    const h = this.container.clientHeight || 520;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 1000);
    this.camera.position.set(0.0, 1.4, 0.7);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.screenSpacePanning = true;
    this.controls.target.set(0.0, 1.4, 0.0);
    this.controls.update();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1d3e);

    const light = new THREE.DirectionalLight(0xffffff);
    light.position.set(1.0, 1.0, 1.0).normalize();
    this.scene.add(light);
    this.scene.add(new THREE.AmbientLight(0x666666));

    this._statusEl = document.createElement('div');
    this._statusEl.style.cssText = `position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#8888cc;font:14px/1.4 Inter,sans-serif;text-align:center;`;
    this._statusEl.textContent = 'Loading avatar...';
    this.container.style.position = 'relative';
    this.container.appendChild(this._statusEl);

    new ResizeObserver(() => {
      const nw = this.container.clientWidth, nh = this.container.clientHeight;
      if (!nw || !nh) return;
      this.renderer.setSize(nw, nh);
      this.camera.aspect = nw / nh;
      this.camera.updateProjectionMatrix();
    }).observe(this.container);

    const animate = () => {
      requestAnimationFrame(animate);
      if (this.vrm) this.vrm.update(this.clock.getDelta());
      if (this.controls) this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  _loadVRM() {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load('assets/avatar.vrm',
      (gltf) => {
        const vrm = gltf.userData.vrm;
        if (!vrm) { this._showError('VRM data not found'); return; }

        VRMUtils.rotateVRM0(vrm);
        this.vrm = vrm;
        this.scene.add(vrm.scene);

        vrm.scene.traverse((child) => {
          if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }
        });

        if (this._statusEl) { this._statusEl.remove(); this._statusEl = null; }
        this.loaded = true;
        console.log('[Avatar] VRM loaded');
      },
      (p) => { if (p.total > 0 && this._statusEl) this._statusEl.textContent = `Loading avatar... ${Math.round(p.loaded/p.total*100)}%`; },
      (e) => { console.warn('[Avatar] VRM not found:', e.message); this._showError('No avatar.vrm found'); }
    );
  }

  _showError(msg) {
    if (this._statusEl) this._statusEl.textContent = msg;
  }

  setPlaying() {}
  updateVisuals() {}
  getCalibration() { return {}; }
  renderFrame() { return null; }
}
