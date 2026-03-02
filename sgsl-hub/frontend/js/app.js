/* ============================================================
   SgSL Hub v2 — App Shell
   ============================================================
   Tab navigation, status helpers, toast notifications,
   and lazy module initialization.
   ============================================================ */

import { initContribute } from './contribute.js';
import { initViewer } from './viewer.js';
import { initRecognize } from './recognize.js';

// --- Status helper ---
export function setStatus(el, msg, type = '') {
  if (!el) return;
  el.textContent = msg;
  el.className = 'status-msg';
  if (type) el.classList.add(type);
}

// --- Toast notifications ---
export function toast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// --- Tab navigation ---
const tabMap = {
  'tab-contribute': 'contribute',
  'tab-text-to-sign': 'text-to-sign',
  'tab-sign-to-text': 'sign-to-text',
};

const inited = {};

function activateTab(tabId) {
  // Update tab buttons
  document.querySelectorAll('.tab').forEach(t => {
    const isActive = t.id === tabId;
    t.classList.toggle('active', isActive);
    t.setAttribute('aria-selected', isActive);
  });

  // Update sections
  const sectionId = tabMap[tabId];
  document.querySelectorAll('.section').forEach(s => {
    s.classList.toggle('active', s.id === sectionId);
  });

  // Lazy init modules
  if (sectionId === 'contribute' && !inited.contribute) {
    inited.contribute = true;
    initContribute();
  }
  if (sectionId === 'text-to-sign' && !inited.viewer) {
    inited.viewer = true;
    initViewer();
  }
  if (sectionId === 'sign-to-text' && !inited.recognize) {
    inited.recognize = true;
    initRecognize();
  }
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => activateTab(tab.id));
  });

  // Init first tab
  activateTab('tab-contribute');
});
