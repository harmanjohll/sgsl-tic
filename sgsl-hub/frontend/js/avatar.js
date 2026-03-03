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
    return `<path d="M154,60 Q156,26 200,20 Q244,26 246,60
                     Q246,44 230,34 Q200,26 170,34 Q154,44 154,60"
                  fill="${c.hair}"/>`;
  }
  // Female: fuller, longer hair with fringe/bangs, shoulder-length sides
  return `
    <path d="M158,64 Q159,24 200,18 Q241,24 242,64
             Q242,42 226,32 Q200,22 174,32 Q158,42 158,64" fill="${c.hair}"/>
    <path d="M158,64 L152,155 Q150,172 160,170 Q168,168 166,152 L168,68" fill="${c.hair}"/>
    <path d="M242,64 L248,155 Q250,172 240,170 Q232,168 234,152 L232,68" fill="${c.hair}"/>
    <path d="M170,40 Q178,52 172,64 L164,64 Q168,50 170,40" fill="${c.hair}" opacity="0.7"/>
    <path d="M230,40 Q222,52 228,64 L236,64 Q232,50 230,40" fill="${c.hair}" opacity="0.7"/>`;
}

function bodySVG(c) {
  const f = c.gender === 'female';

  // Gender-specific dimensions
  const headRx = f ? 42 : 46;
  const headRy = f ? 54 : 50;
  const eyeRx  = f ? 5 : 4;
  const eyeRy  = f ? 5.5 : 4.5;
  const earRx  = f ? 6 : 8;
  const earRy  = f ? 10 : 12;
  const neckW  = f ? 22 : 30;
  const neckX  = 200 - neckW / 2;
  const browW  = f ? 1.6 : 2.8;
  const browL  = f ? 'M177,65 Q184,60 191,65' : 'M174,68 Q184,64 194,68';
  const browR  = f ? 'M209,65 Q216,60 223,65' : 'M206,68 Q216,64 226,68';
  const nose   = f ? 'M198,86 Q200,89 202,86' : 'M196,82 Q200,91 204,82';
  const mouth  = f ? 'M192,96 Q200,102 208,96' : 'M188,97 Q200,104 212,97';

  // Eyelashes for female character
  const lashes = f ? `
      <path d="M179,73 L176,70" stroke="${c.hair}" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M178,75 L174,73.5" stroke="${c.hair}" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M221,73 L224,70" stroke="${c.hair}" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M222,75 L226,73.5" stroke="${c.hair}" stroke-width="1.2" stroke-linecap="round"/>` : '';

  // Subtle lip tint for female
  const lipFill = f
    ? `<path d="M194,96 Q200,100 206,96 Q200,103 194,96 Z" fill="${c.skinDk}" opacity="0.2"/>`
    : '';

  return `
    <g class="avatar-body">
      <path d="M128,176 Q128,162 200,155 Q272,162 272,176 L276,340 Q276,358 200,362 Q124,358 124,340 Z"
            fill="${c.shirt}"/>
      <path d="M168,155 Q200,148 232,155 L232,208 Q200,218 168,208 Z"
            fill="${c.shirtLt}" opacity="0.3"/>
      ${f
        ? `<path d="M185,158 Q200,172 215,158" stroke="${c.shirtLt}" stroke-width="2" fill="none" opacity="0.5"/>`
        : `<path d="M180,160 Q200,164 220,160" stroke="${c.shirtLt}" stroke-width="1.5" fill="none" opacity="0.4"/>`
      }
      <rect x="${neckX}" y="126" width="${neckW}" height="32" rx="9" fill="${c.skin}"/>
      <ellipse cx="200" cy="78" rx="${headRx}" ry="${headRy}" fill="${c.skin}"/>
      ${hairSVG(c)}
      <ellipse cx="${200 - headRx - earRx + 3}" cy="80" rx="${earRx}" ry="${earRy}" fill="${c.skin}"/>
      <ellipse cx="${200 + headRx + earRx - 3}" cy="80" rx="${earRx}" ry="${earRy}" fill="${c.skin}"/>
      <ellipse cx="184" cy="76" rx="${eyeRx}" ry="${eyeRy}" fill="${c.eyes}"/>
      <ellipse cx="216" cy="76" rx="${eyeRx}" ry="${eyeRy}" fill="${c.eyes}"/>
      ${lashes}
      <circle cx="${f ? 186 : 185.5}" cy="75" r="1.5" fill="white" opacity="0.6"/>
      <circle cx="${f ? 218 : 217.5}" cy="75" r="1.5" fill="white" opacity="0.6"/>
      <path d="${browL}" stroke="${c.hair}" stroke-width="${browW}" fill="none" stroke-linecap="round"/>
      <path d="${browR}" stroke="${c.hair}" stroke-width="${browW}" fill="none" stroke-linecap="round"/>
      <path d="${nose}" stroke="${c.skinDk}" stroke-width="1.5" fill="none" opacity="0.4"/>
      ${lipFill}
      <path d="${mouth}" stroke="${c.skinDk}" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.5"/>
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
