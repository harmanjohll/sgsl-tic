/* ============================================================
   SgSL Hub — Avatar System
   ============================================================
   SVG-based animated avatars for sign language demonstration.
   Two characters representing Singapore's diversity:
     Rajan  — male, darker skin tone (South Asian)
     Mei Ling — female, lighter skin tone (Chinese)
   ============================================================ */

// --- Character Definitions ---
const CHARS = {
  rajan: {
    name: 'Rajan', gender: 'male',
    skin: '#8D5524', skinLt: '#A0673B', skinDk: '#6B3F1A',
    hair: '#1A1A2E', shirt: '#1B4332', shirtLt: '#2D6A4F', eyes: '#1A1A2E',
  },
  meiling: {
    name: 'Mei Ling', gender: 'female',
    skin: '#F5D0A9', skinLt: '#FDE8CD', skinDk: '#D4A574',
    hair: '#1A1A2E', shirt: '#6B21A8', shirtLt: '#9333EA', eyes: '#1A1A2E',
  },
};

const BONES = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17],
];
const TIPS = [4, 8, 12, 16, 20];

// --- Coordinate mapping ---
function lmToSVG(lm) {
  return { x: 60 + (1 - lm[0]) * 280, y: 150 + lm[1] * 310 };
}

// --- SVG Body Parts ---
function hairSVG(c) {
  if (c.gender === 'male') {
    return `<path d="M156,62 Q158,28 200,22 Q242,28 244,62
                     Q244,46 228,36 Q200,28 172,36 Q156,46 156,62"
                  fill="${c.hair}"/>`;
  }
  return `<path d="M154,66 Q155,26 200,20 Q245,26 246,66
                   Q246,44 224,34 Q200,24 176,34 Q154,44 154,66" fill="${c.hair}"/>
          <path d="M154,66 L149,148 Q147,164 156,162 Q163,160 161,144 L163,70" fill="${c.hair}"/>
          <path d="M246,66 L251,148 Q253,164 244,162 Q237,160 239,144 L237,70" fill="${c.hair}"/>`;
}

function bodySVG(c) {
  return `
    <g class="avatar-body">
      <path d="M128,176 Q128,162 200,155 Q272,162 272,176 L276,340 Q276,358 200,362 Q124,358 124,340 Z"
            fill="${c.shirt}"/>
      <path d="M168,155 Q200,148 232,155 L232,208 Q200,218 168,208 Z"
            fill="${c.shirtLt}" opacity="0.3"/>
      <rect x="187" y="126" width="26" height="32" rx="9" fill="${c.skin}"/>
      <ellipse cx="200" cy="78" rx="44" ry="52" fill="${c.skin}"/>
      ${hairSVG(c)}
      <ellipse cx="155" cy="80" rx="7" ry="11" fill="${c.skin}"/>
      <ellipse cx="245" cy="80" rx="7" ry="11" fill="${c.skin}"/>
      <ellipse cx="184" cy="76" rx="4" ry="5" fill="${c.eyes}"/>
      <ellipse cx="216" cy="76" rx="4" ry="5" fill="${c.eyes}"/>
      <circle cx="185.5" cy="75" r="1.5" fill="white" opacity="0.6"/>
      <circle cx="217.5" cy="75" r="1.5" fill="white" opacity="0.6"/>
      <path d="M176,67 Q184,63 192,67" stroke="${c.hair}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <path d="M208,67 Q216,63 224,67" stroke="${c.hair}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <path d="M197,84 Q200,89 203,84" stroke="${c.skinDk}" stroke-width="1.5" fill="none" opacity="0.4"/>
      <path d="M190,96 Q200,104 210,96" stroke="${c.skinDk}" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.5"/>
    </g>`;
}

function armSVG(c, side, wristPt) {
  const sx = side === 'L' ? 134 : 266;
  const sy = 178;
  if (!wristPt) {
    const rx = side === 'L' ? 95 : 305;
    const ey = 260, ry = 330;
    const ex = side === 'L' ? 108 : 292;
    return `<path d="M${sx},${sy} Q${ex},${ey} ${rx},${ry}"
            stroke="${c.skin}" stroke-width="22" fill="none" stroke-linecap="round"/>`;
  }
  const mx = (sx + wristPt.x) / 2;
  const my = (sy + wristPt.y) / 2;
  const off = side === 'L' ? 30 : -30;
  return `<path d="M${sx},${sy} Q${mx + off},${Math.max(my - 15, sy + 10)} ${wristPt.x},${wristPt.y}"
          stroke="${c.skin}" stroke-width="22" fill="none" stroke-linecap="round"/>`;
}

function handSVG(c, landmarks) {
  if (!landmarks || landmarks.length < 21) return '';
  const pts = landmarks.map(lm => lmToSVG(lm));
  let s = '';
  for (const [a, b] of BONES) {
    s += `<line x1="${pts[a].x}" y1="${pts[a].y}" x2="${pts[b].x}" y2="${pts[b].y}"
          stroke="${c.skinLt}" stroke-width="6" stroke-linecap="round"/>`;
  }
  for (let i = 0; i < 21; i++) {
    const r = TIPS.includes(i) ? 7 : (i === 0 ? 8 : 4.5);
    const f = TIPS.includes(i) ? c.skinLt : c.skin;
    s += `<circle cx="${pts[i].x}" cy="${pts[i].y}" r="${r}" fill="${f}"
          stroke="${c.skinDk}" stroke-width="0.8"/>`;
  }
  return s;
}

// --- State ---
let charId = 'meiling';
let container = null;
let seq = [], playing = false, paused = false;
let fi = 0, fAcc = 0, spd = 1;
let rafId = null, lastT = 0;
let prevLandmarks = null;
let _onFrame = null, _onDone = null;

// Smooth pose transitions
function lerpPose(a, b, t) {
  if (!a) return b;
  return b.map((lm, i) => [
    a[i][0] * (1 - t) + lm[0] * t,
    a[i][1] * (1 - t) + lm[1] * t,
    (a[i][2] ?? 0) * (1 - t) + (lm[2] ?? 0) * t,
  ]);
}

// --- Render ---
function render(landmarks) {
  if (!container) return;
  const c = CHARS[charId];
  const wrist = landmarks ? lmToSVG(landmarks[0]) : null;

  container.innerHTML = `
    <svg viewBox="0 0 400 520" xmlns="http://www.w3.org/2000/svg"
         style="width:100%;height:100%;display:block;">
      <defs>
        <radialGradient id="av-bg" cx="50%" cy="25%" r="75%">
          <stop offset="0%" stop-color="#1e2140"/>
          <stop offset="100%" stop-color="#13152a"/>
        </radialGradient>
      </defs>
      <rect width="400" height="520" fill="url(#av-bg)"/>
      ${armSVG(c, 'L', wrist)}
      ${armSVG(c, 'R', null)}
      ${bodySVG(c)}
      ${handSVG(c, landmarks)}
      <text x="200" y="508" text-anchor="middle" fill="rgba(255,255,255,0.25)"
            font-family="Inter,sans-serif" font-size="12" font-weight="600">${c.name}</text>
    </svg>`;
}

// --- Animation ---
function tick() {
  if (!playing || paused) return;
  const now = performance.now();
  const dt = (now - lastT) / 1000;
  lastT = now;
  fAcc += dt * 30 * spd;

  while (fAcc >= 1 && fi < seq.length) {
    const frame = seq[fi];
    const smoothed = lerpPose(prevLandmarks, frame, 0.65);
    render(smoothed);
    prevLandmarks = smoothed;
    if (_onFrame) _onFrame(fi, seq.length);
    fi++;
    fAcc -= 1;
  }

  if (fi >= seq.length) {
    playing = false;
    if (_onDone) _onDone();
    return;
  }
  rafId = requestAnimationFrame(tick);
}

// --- Public API ---
export function getCharacters() {
  return Object.entries(CHARS).map(([id, c]) => ({ id, name: c.name, gender: c.gender }));
}

export function setCharacter(id) {
  if (CHARS[id]) { charId = id; render(prevLandmarks); }
}

export function getCurrentCharacter() { return charId; }

export function initAvatar(el) {
  container = typeof el === 'string' ? document.getElementById(el) : el;
  render(null);
}

export function playSign(landmarks, speed = 1, onFrame = null, onDone = null) {
  seq = (landmarks || [])
    .map(fr => (Array.isArray(fr?.[0]) && fr[0].length === 3) ? fr[0] : fr)
    .filter(f => Array.isArray(f) && f.length >= 21);
  if (!seq.length) return false;
  spd = speed;
  fi = 0; fAcc = 0;
  prevLandmarks = null;
  playing = true; paused = false;
  _onFrame = onFrame; _onDone = onDone;
  lastT = performance.now();
  if (rafId) cancelAnimationFrame(rafId);
  tick();
  return true;
}

export function togglePause() {
  paused = !paused;
  if (!paused) { lastT = performance.now(); tick(); }
  return paused;
}

export function replay() {
  fi = 0; fAcc = 0; prevLandmarks = null;
  paused = false; playing = true;
  lastT = performance.now();
  if (rafId) cancelAnimationFrame(rafId);
  tick();
}

export function setSpeed(s) { spd = s; }
export function isPlaying() { return playing && !paused; }
export function getFrameInfo() { return { current: fi, total: seq.length }; }
