/* ============================================================
   SgSL Hub — API Client
   ============================================================
   Talks to the Python FastAPI backend.
   ============================================================ */

const BASE = '';  // same origin

async function safeJSON(res) {
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { return { detail: text || `HTTP ${res.status}` }; }
}

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
  const body = JSON.stringify({ label, landmarks, contributor });
  // Retry up to 2 times on server errors (DB may need to fall back to SQLite)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${BASE}/api/contribute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      const data = await safeJSON(res);
      if (res.ok) return data;
      if (res.status >= 500 && attempt < 3) {
        await new Promise(r => setTimeout(r, 1000 * attempt));
        continue;
      }
      throw new Error(data.detail || 'Contribution failed');
    } catch (err) {
      if (attempt < 3 && (err.name === 'TypeError' || err.message.includes('fetch'))) {
        await new Promise(r => setTimeout(r, 1000 * attempt));
        continue;
      }
      throw err;
    }
  }
}

export async function recognize(landmarks) {
  const res = await fetch(`${BASE}/api/recognize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ landmarks }),
  });
  const data = await safeJSON(res);
  if (!res.ok) throw new Error(data.detail || 'Recognition failed');
  return data;
}

export async function deleteSign(label) {
  const res = await fetch(`${BASE}/api/sign/${encodeURIComponent(label)}`, {
    method: 'DELETE',
  });
  const data = await safeJSON(res);
  if (!res.ok) throw new Error(data.detail || 'Delete failed');
  return data;
}

export async function login(email) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await safeJSON(res);
  if (!res.ok) throw new Error(data.detail || 'Login failed');
  return data;
}
