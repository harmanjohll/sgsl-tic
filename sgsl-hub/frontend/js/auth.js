/* ============================================================
   SgSL Hub — Authentication Module
   ============================================================
   Client-side session management for email-based auth.
   Stores authenticated email in localStorage.
   ============================================================ */

const STORAGE_KEY = 'sgsl_auth';

export function getAuth() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export function saveAuth(email) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ email, ts: Date.now() }));
}

export function clearAuth() {
  localStorage.removeItem(STORAGE_KEY);
}

export function isLoggedIn() {
  return !!getAuth()?.email;
}

export function getEmail() {
  return getAuth()?.email || null;
}
