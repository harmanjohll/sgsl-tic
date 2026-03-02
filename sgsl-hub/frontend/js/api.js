/* ============================================================
   SgSL Hub — API Client
   ============================================================
   Talks to the Python FastAPI backend.
   ============================================================ */

const BASE = '';  // same origin

export async function fetchSigns() {
  const res = await fetch(`${BASE}/api/signs`);
  if (!res.ok) throw new Error('Failed to load sign library');
  return res.json();
}

export async function fetchSign(label) {
  const res = await fetch(`${BASE}/api/sign/${encodeURIComponent(label)}`);
  if (!res.ok) throw new Error(`No sign found for "${label}"`);
  return res.json();
}

export async function contribute(label, landmarks, contributor = null) {
  const res = await fetch(`${BASE}/api/contribute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label, landmarks, contributor }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Contribution failed');
  return data;
}

export async function recognize(landmarks) {
  const res = await fetch(`${BASE}/api/recognize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ landmarks }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Recognition failed');
  return data;
}

export async function login(email) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Login failed');
  return data;
}
