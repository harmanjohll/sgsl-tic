/* ============================================================
   SgSL Avatar — App Controller
   ============================================================
   Handles tab switching and lazy-loads modules for each tab.
   ============================================================ */

// Tab switching
const tabs = document.querySelectorAll('.tab');
const contents = document.querySelectorAll('.tab-content');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    contents.forEach(c => {
      c.classList.toggle('active', c.id === `tab-${target}`);
    });

    // Lazy-init modules
    if (target === 'viewer' && !viewerLoaded) initViewer();
    if (target === 'record' && !recorderLoaded) initRecorder();
  });
});

// ─── Viewer tab ─────────────────────────────────────────────
let viewerLoaded = false;
async function initViewer() {
  viewerLoaded = true;
  await import('./player.js');
}

// ─── Record tab ─────────────────────────────────────────────
let recorderLoaded = false;
async function initRecorder() {
  recorderLoaded = true;
  await import('./recorder.js');
}

// Auto-init viewer on load
initViewer();
