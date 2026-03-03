/* ============================================================
   SgSL Hub v2 — App Shell
   ============================================================
   Tab navigation, authentication, status helpers, toast
   notifications, and lazy module initialization.
   ============================================================ */

import { initContribute } from './contribute.js';
import { initViewer } from './viewer.js';
import { initRecognize } from './recognize.js';
import { initHowItWorks } from './howitworks.js';
import { initAvatar, setCharacter } from './avatar.js';
import { isLoggedIn, getEmail, saveAuth, clearAuth } from './auth.js';
import { login as apiLogin } from './api.js';

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

// --- Auth UI ---
function updateAuthUI() {
  const authArea = document.getElementById('auth-area');
  const gate = document.getElementById('contribute-auth-gate');
  const content = document.getElementById('contribute-content');

  if (isLoggedIn()) {
    const email = getEmail();
    authArea.innerHTML =
      `<span class="auth-email">${esc(email)}</span>` +
      `<button class="btn btn-sm" id="signout-btn">Sign Out</button>`;
    if (gate) gate.classList.add('hidden');
    if (content) content.classList.remove('hidden');
  } else {
    authArea.innerHTML =
      `<button class="btn btn-sm auth-signin-btn" id="signin-btn">Sign In</button>`;
    if (gate) gate.classList.remove('hidden');
    if (content) content.classList.add('hidden');
  }
}

function openLoginModal() {
  const modal = document.getElementById('login-modal');
  const errorEl = document.getElementById('login-error');
  if (errorEl) errorEl.classList.add('hidden');
  modal.classList.remove('hidden');
  setTimeout(() => document.getElementById('login-email')?.focus(), 100);
}

async function handleLogin() {
  const emailInput = document.getElementById('login-email');
  const errorEl = document.getElementById('login-error');
  const submitBtn = document.getElementById('login-submit-btn');
  const email = emailInput.value.trim().toLowerCase();

  if (!email || !email.includes('@')) {
    errorEl.textContent = 'Please enter a valid email address.';
    errorEl.classList.remove('hidden');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Signing in...';

  try {
    const result = await apiLogin(email);
    saveAuth(result.email);
    document.getElementById('login-modal').classList.add('hidden');
    emailInput.value = '';
    updateAuthUI();
    toast(`Signed in as ${result.email}`, 'success');
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign In';
  }
}

function initAuth() {
  updateAuthUI();

  // Delegate click handlers for dynamically created auth buttons
  document.addEventListener('click', (e) => {
    if (e.target.id === 'signin-btn' || e.target.id === 'auth-gate-signin') {
      openLoginModal();
    }
    if (e.target.id === 'signout-btn') {
      clearAuth();
      updateAuthUI();
      toast('Signed out', 'info');
    }
  });

  // Login modal close
  const modal = document.getElementById('login-modal');
  document.getElementById('modal-close-btn')?.addEventListener('click', () => {
    modal.classList.add('hidden');
  });
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });

  // Login form submit
  document.getElementById('login-submit-btn')?.addEventListener('click', handleLogin);
  document.getElementById('login-email')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
}

// --- Tab navigation ---
const tabMap = {
  'tab-contribute': 'contribute',
  'tab-text-to-sign': 'text-to-sign',
  'tab-sign-to-text': 'sign-to-text',
  'tab-how-it-works': 'how-it-works',
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
    initAvatar('avatar-container');
    initViewer();
    initViewToggle();
  }
  if (sectionId === 'sign-to-text' && !inited.recognize) {
    inited.recognize = true;
    initRecognize();
  }
  if (sectionId === 'how-it-works' && !inited.howitworks) {
    inited.howitworks = true;
    initHowItWorks();
  }
}

// --- Helpers ---
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --- View toggle (Avatar vs 3D) ---
export let viewMode = 'avatar'; // 'avatar' or '3d'

function initViewToggle() {
  const avatarBtn = document.getElementById('view-avatar-btn');
  const threeDBtn = document.getElementById('view-3d-btn');
  const avatarContainer = document.getElementById('avatar-container');
  const threejsContainer = document.getElementById('threejs-container');
  const avatarSelector = document.getElementById('avatar-selector');

  function setView(mode) {
    viewMode = mode;
    avatarBtn.classList.toggle('active', mode === 'avatar');
    threeDBtn.classList.toggle('active', mode === '3d');
    avatarContainer.classList.toggle('hidden', mode !== 'avatar');
    threejsContainer.classList.toggle('hidden', mode !== '3d');
    avatarSelector.classList.toggle('hidden', mode !== 'avatar');
  }

  avatarBtn.addEventListener('click', () => setView('avatar'));
  threeDBtn.addEventListener('click', () => setView('3d'));

  // Avatar character selector
  document.querySelectorAll('.avatar-pick').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.avatar-pick').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setCharacter(btn.dataset.avatar);
    });
  });

  setView('avatar');
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  initAuth();

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => activateTab(tab.id));
  });

  // Init first tab
  activateTab('tab-contribute');
});
