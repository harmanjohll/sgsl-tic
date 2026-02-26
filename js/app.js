/* ============================================================
   SgSL Hub — Main Application Entry Point
   ============================================================
   Handles:
   - Tab navigation
   - Module initialization (lazy-loaded per tab)
   - Toast notifications
   - Status message utility
   ============================================================ */

import { initContribute } from './contribute.js';
import { initSignToText } from './signToText.js';
import { initTextToSign } from './textToSign.js';

/* ---------- Tab navigation ---------- */

const TABS = [
  { id: 'contribute',    btn: 'tab-contribute',    init: () => initContribute() },
  { id: 'text-to-sign',  btn: 'tab-text-to-sign',  init: () => initTextToSign() },
  { id: 'sign-to-text',  btn: 'tab-sign-to-text',  init: () => initSignToText() },
];

const initialized = new Set();

function switchTab(tabId) {
  // Update nav buttons
  document.querySelectorAll('.tab').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`tab-${tabId}`);
  if (activeBtn) activeBtn.classList.add('active');

  // Update sections
  document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
  const activeSec = document.getElementById(tabId);
  if (activeSec) activeSec.classList.add('active');

  // Initialize module on first visit
  const tab = TABS.find(t => t.id === tabId);
  if (tab && !initialized.has(tabId)) {
    initialized.add(tabId);
    tab.init();
  }
}

/* ---------- Toast notifications ---------- */

const TOAST_DURATION = 3000;

export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, TOAST_DURATION);
}

/* ---------- Status message utility ---------- */

export function setStatus(el, message, type = '') {
  if (!el) return;
  el.textContent = message;
  el.className = 'status';
  if (type) el.classList.add(type);
}

/* ---------- Bootstrap ---------- */

document.addEventListener('DOMContentLoaded', () => {
  // Wire up tab buttons
  TABS.forEach(tab => {
    const btn = document.getElementById(tab.btn);
    if (btn) {
      btn.addEventListener('click', () => switchTab(tab.id));
    }
  });

  // Start on Contribute tab
  switchTab('contribute');
});
