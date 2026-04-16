/* ============================================================
   SgSL Avatar — Three.js Scene + VRM 0.x Loader
   ============================================================
   Uses THREE (global) and THREE.VRM (three-vrm 0.6.x) to match
   the Kalidokit demo exactly. No ES module imports for Three/VRM.
   ============================================================ */

// THREE is global (loaded via <script> tag)

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

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    // Camera — same as demo
    this.camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 1000);
    this.camera.position.set(0.0, 1.4, 0.7);

    // Controls — same as demo
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.screenSpacePanning = true;
    this.controls.target.set(0.0, 1.4, 0.0);
    this.controls.update();

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1d3e);

    // Light — same as demo
    const light = new THREE.DirectionalLight(0xffffff);
    light.position.set(1.0, 1.0, 1.0).normalize();
    this.scene.add(light);

    // Extra ambient for better visibility
    const ambient = new THREE.AmbientLight(0x666666);
    this.scene.add(ambient);

    // Loading indicator
    this._statusEl = document.createElement('div');
    this._statusEl.style.cssText = `
      position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
      color:#8888cc; font:14px/1.4 Inter,sans-serif; text-align:center;
    `;
    this._statusEl.textContent = 'Loading avatar...';
    this.container.style.position = 'relative';
    this.container.appendChild(this._statusEl);

    // Resize
    new ResizeObserver(() => {
      const nw = this.container.clientWidth;
      const nh = this.container.clientHeight;
      if (!nw || !nh) return;
      this.renderer.setSize(nw, nh);
      this.camera.aspect = nw / nh;
      this.camera.updateProjectionMatrix();
    }).observe(this.container);

    // Render loop — EXACT same as demo
    const animate = () => {
      requestAnimationFrame(animate);
      if (this.vrm) {
        this.vrm.update(this.clock.getDelta());
      }
      if (this.controls) this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  _loadVRM() {
    // EXACT same loading pattern as Kalidokit demo
    const loader = new THREE.GLTFLoader();
    loader.crossOrigin = 'anonymous';

    loader.load(
      'assets/avatar.vrm',
      (gltf) => {
        THREE.VRMUtils.removeUnnecessaryJoints(gltf.scene);

        THREE.VRM.from(gltf).then((vrm) => {
          this.scene.add(vrm.scene);
          this.vrm = vrm;
          // EXACT same rotation as demo
          this.vrm.scene.rotation.y = Math.PI;

          if (this._statusEl) {
            this._statusEl.remove();
            this._statusEl = null;
          }

          this.loaded = true;

          // Log bone info
          const bones = Object.keys(THREE.VRMSchema.HumanoidBoneName);
          let mapped = 0;
          for (const name of bones) {
            const bone = vrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName[name]);
            if (bone) mapped++;
          }
          console.log(`[Avatar] VRM 0.x loaded: ${mapped} bones mapped`);
        });
      },
      (progress) => {
        if (progress.total > 0 && this._statusEl) {
          const pct = Math.round((progress.loaded / progress.total) * 100);
          this._statusEl.textContent = `Loading avatar... ${pct}%`;
        }
      },
      (error) => {
        console.warn('[Avatar] VRM not found:', error.message);
        if (this._statusEl) {
          this._statusEl.innerHTML = `
            <div style="opacity:0.7">
              <p style="font-size:12px;white-space:pre-line">No avatar.vrm found.\n\nPlace a VRM file at frontend/assets/avatar.vrm</p>
            </div>`;
        }
      }
    );
  }

  // Public API
  setPlaying(val) { /* no-op for now */ }
  updateVisuals() { /* handled by render loop */ }
  getCalibration() { return {}; }
  renderFrame() { return null; }
}
