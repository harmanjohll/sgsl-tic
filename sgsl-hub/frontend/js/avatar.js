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
    hair: '#1A1A2E', shirt: '#1B4332', shirtLt: '#2D6A4F',
    iris: '#3E2723', blush: '#C47A4A',
  },
  meiling: {
    name: 'Mei Ling', gender: 'female',
    skin: '#F5D0A9', skinLt: '#FDE8CD', skinDk: '#D4A574',
    hair: '#1A1A2E', shirt: '#6B21A8', shirtLt: '#9333EA',
    iris: '#2C1810', blush: '#E8A090',
  },
};

// MediaPipe hand skeleton bones
const BONES = [
  [0,1],[1,2],[2,3],[3,4],         // Thumb
  [0,5],[5,6],[6,7],[7,8],         // Index
  [5,9],[9,10],[10,11],[11,12],    // Middle
  [9,13],[13,14],[14,15],[15,16],  // Ring
  [13,17],[17,18],[18,19],[19,20], // Pinky
  [0,17],                          // Palm base
];
const TIPS = [4, 8, 12, 16, 20];

// Finger groups for filled hand rendering
const FINGERS = [
  [1, 2, 3, 4],     // Thumb
  [5, 6, 7, 8],     // Index
  [9, 10, 11, 12],  // Middle
  [13, 14, 15, 16], // Ring
  [17, 18, 19, 20], // Pinky
];

// --- Coordinate mapping ---
function lmToSVG(lm) {
  return { x: 60 + (1 - lm[0]) * 280, y: 150 + lm[1] * 310 };
}

// --- SVG Body Parts ---
function hairSVG(c) {
  if (c.gender === 'male') {
    return `
      <path d="M153,68 Q154,26 200,18 Q246,26 247,68
               Q247,44 230,32 Q200,22 170,32 Q153,44 153,68" fill="${c.hair}"/>
      <path d="M163,36 Q170,20 200,16 Q230,20 237,36 Q228,26 200,22 Q172,26 163,36"
            fill="${c.hair}" opacity="0.6"/>`;
  }
  return `
    <path d="M156,68 Q157,24 200,16 Q243,24 244,68
             Q244,42 228,30 Q200,20 172,30 Q156,42 156,68" fill="${c.hair}"/>
    <path d="M156,68 L150,158 Q148,178 160,175 Q170,172 168,155 L170,72" fill="${c.hair}"/>
    <path d="M244,68 L250,158 Q252,178 240,175 Q230,172 232,155 L230,72" fill="${c.hair}"/>
    <path d="M168,38 Q176,52 170,68 L162,68 Q166,50 168,38" fill="${c.hair}" opacity="0.6"/>
    <path d="M232,38 Q224,52 230,68 L238,68 Q234,50 232,38" fill="${c.hair}" opacity="0.6"/>`;
}

function eyeSVG(c, cx, cy, isLeft) {
  const f = c.gender === 'female';
  const sx = f ? 9 : 8;
  const sy = f ? 8 : 7;
  const ir = f ? 4.5 : 4;
  const pr = f ? 2.2 : 2;

  let svg = `
    <ellipse cx="${cx}" cy="${cy}" rx="${sx}" ry="${sy}" fill="white"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${sx}" ry="${sy}" fill="none" stroke="${c.skinDk}" stroke-width="0.6" opacity="0.3"/>
    <circle cx="${cx}" cy="${cy + 0.5}" r="${ir}" fill="${c.iris}"/>
    <circle cx="${cx}" cy="${cy + 0.5}" r="${pr}" fill="#0D0D0D"/>
    <circle cx="${cx + 1.5}" cy="${cy - 1}" r="1.8" fill="white" opacity="0.85"/>
    <circle cx="${cx - 1}" cy="${cy + 2}" r="0.8" fill="white" opacity="0.4"/>`;

  if (f) {
    const dir = isLeft ? -1 : 1;
    svg += `
      <path d="M${cx + dir * sx},${cy - 1} L${cx + dir * (sx + 3)},${cy - 4}"
            stroke="${c.hair}" stroke-width="1.3" stroke-linecap="round"/>
      <path d="M${cx + dir * (sx - 1)},${cy - 3} L${cx + dir * (sx + 2)},${cy - 6}"
            stroke="${c.hair}" stroke-width="1.3" stroke-linecap="round"/>`;
  }

  return svg;
}

function bodySVG(c) {
  const f = c.gender === 'female';
  const headRx = f ? 44 : 48;
  const headRy = f ? 52 : 48;
  const earRx  = f ? 6 : 8;
  const earRy  = f ? 9 : 11;
  const neckW  = f ? 22 : 30;
  const neckX  = 200 - neckW / 2;
  const browW  = f ? 1.8 : 2.8;
  const browL  = f ? 'M173,63 Q182,58 191,63' : 'M171,66 Q182,62 193,66';
  const browR  = f ? 'M209,63 Q218,58 227,63' : 'M207,66 Q218,62 229,66';
  const nose   = f ? 'M198,86 Q200,90 202,86' : 'M196,83 Q200,92 204,83';
  const mouth  = f ? 'M190,98 Q200,106 210,98' : 'M187,99 Q200,107 213,99';
  const lipFill = f
    ? `<path d="M192,98 Q200,104 208,98 Q200,107 192,98 Z" fill="#D4877A" opacity="0.25"/>`
    : '';
  const earLx = 200 - headRx - earRx + 4;
  const earRx2 = 200 + headRx + earRx - 4;

  return `
    <g class="avatar-body">
      <path d="M128,180 Q128,164 200,157 Q272,164 272,180 L276,340 Q276,358 200,362 Q124,358 124,340 Z"
            fill="${c.shirt}"/>
      <path d="M168,157 Q200,150 232,157 L232,210 Q200,220 168,210 Z"
            fill="${c.shirtLt}" opacity="0.25"/>
      ${f
        ? `<path d="M184,161 Q200,176 216,161" stroke="${c.shirtLt}" stroke-width="2" fill="none" opacity="0.4"/>`
        : `<path d="M180,163 Q200,167 220,163" stroke="${c.shirtLt}" stroke-width="1.5" fill="none" opacity="0.3"/>`
      }
      <rect x="${neckX}" y="126" width="${neckW}" height="34" rx="10" fill="${c.skin}"/>
      <rect x="${neckX + 2}" y="126" width="${neckW - 4}" height="20" rx="6" fill="${c.skinLt}" opacity="0.15"/>
      <ellipse cx="200" cy="78" rx="${headRx}" ry="${headRy}" fill="${c.skin}"/>
      <ellipse cx="200" cy="82" rx="${headRx - 4}" ry="${headRy - 6}" fill="${c.skinLt}" opacity="0.1"/>
      <ellipse cx="${earLx}" cy="80" rx="${earRx}" ry="${earRy}" fill="${c.skin}"/>
      <ellipse cx="${earLx + 2}" cy="80" rx="${earRx - 2}" ry="${earRy - 3}" fill="${c.skinDk}" opacity="0.15"/>
      <ellipse cx="${earRx2}" cy="80" rx="${earRx}" ry="${earRy}" fill="${c.skin}"/>
      <ellipse cx="${earRx2 - 2}" cy="80" rx="${earRx - 2}" ry="${earRy - 3}" fill="${c.skinDk}" opacity="0.15"/>
      ${hairSVG(c)}
      ${eyeSVG(c, 184, 76, true)}
      ${eyeSVG(c, 216, 76, false)}
      <path d="${browL}" stroke="${c.hair}" stroke-width="${browW}" fill="none" stroke-linecap="round"/>
      <path d="${browR}" stroke="${c.hair}" stroke-width="${browW}" fill="none" stroke-linecap="round"/>
      <circle cx="170" cy="90" r="8" fill="${c.blush}" opacity="0.2"/>
      <circle cx="230" cy="90" r="8" fill="${c.blush}" opacity="0.2"/>
      <path d="${nose}" stroke="${c.skinDk}" stroke-width="1.5" fill="none" opacity="0.35"/>
      ${lipFill}
      <path d="${mouth}" stroke="${c.skinDk}" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.45"/>
    </g>`;
}

function armSVG(c, side, wristPt) {
  const sx = side === 'L' ? 134 : 266;
  const sy = 182;
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

// --- Idle hands (visible at rest when no animation is playing) ---
function idleHandSVG(c, side) {
  const x = side === 'L' ? 82 : 318;
  const y = 342;
  const dir = side === 'L' ? 1 : -1;

  // Simple cartoon hand: palm with 4 fingers and thumb
  return `
    <g>
      <!-- Palm -->
      <ellipse cx="${x}" cy="${y}" rx="14" ry="16" fill="${c.skin}"
               stroke="${c.skinDk}" stroke-width="0.5" opacity="0.9"/>
      <!-- Fingers -->
      <rect x="${x - 9 * dir}" y="${y - 28}" width="5" height="18" rx="2.5"
            fill="${c.skin}" stroke="${c.skinDk}" stroke-width="0.5" transform="rotate(${dir * -5},${x},${y})"/>
      <rect x="${x - 3 * dir}" y="${y - 30}" width="5" height="20" rx="2.5"
            fill="${c.skin}" stroke="${c.skinDk}" stroke-width="0.5"/>
      <rect x="${x + 3 * dir}" y="${y - 29}" width="5" height="19" rx="2.5"
            fill="${c.skin}" stroke="${c.skinDk}" stroke-width="0.5" transform="rotate(${dir * 3},${x},${y})"/>
      <rect x="${x + 9 * dir}" y="${y - 26}" width="5" height="16" rx="2.5"
            fill="${c.skin}" stroke="${c.skinDk}" stroke-width="0.5" transform="rotate(${dir * 7},${x},${y})"/>
      <!-- Thumb -->
      <rect x="${x - 15 * dir}" y="${y - 10}" width="5" height="14" rx="2.5"
            fill="${c.skin}" stroke="${c.skinDk}" stroke-width="0.5"
            transform="rotate(${dir * -35},${x - 15 * dir + 2.5},${y - 10})"/>
      <!-- Knuckle creases -->
      <line x1="${x - 10 * dir}" y1="${y - 10}" x2="${x + 12 * dir}" y2="${y - 10}"
            stroke="${c.skinDk}" stroke-width="0.5" opacity="0.2" stroke-linecap="round"/>
    </g>`;
}

// --- Animated hand with filled fingers ---
function handSVG(c, landmarks) {
  if (!landmarks || landmarks.length < 21) return '';
  const pts = landmarks.map(lm => lmToSVG(lm));
  let s = '';

  // Draw filled palm (polygon connecting wrist area)
  const palmIdx = [0, 1, 5, 9, 13, 17];
  const palmPath = palmIdx.map((i, idx) =>
    `${idx === 0 ? 'M' : 'L'}${pts[i].x},${pts[i].y}`
  ).join(' ') + ' Z';
  s += `<path d="${palmPath}" fill="${c.skin}" stroke="${c.skinDk}" stroke-width="0.5" opacity="0.9"/>`;

  // Draw each finger as a thick filled path
  for (const finger of FINGERS) {
    // Draw finger segments with rounded caps
    for (let i = 0; i < finger.length - 1; i++) {
      const a = finger[i], b = finger[i + 1];
      const w = i === 0 ? 8 : (i === 1 ? 7 : 6); // Thicker at base, thinner at tip
      s += `<line x1="${pts[a].x}" y1="${pts[a].y}" x2="${pts[b].x}" y2="${pts[b].y}"
            stroke="${c.skin}" stroke-width="${w}" stroke-linecap="round"/>`;
    }
    // Fingertip circle
    const tip = finger[finger.length - 1];
    s += `<circle cx="${pts[tip].x}" cy="${pts[tip].y}" r="4" fill="${c.skinLt}"
          stroke="${c.skinDk}" stroke-width="0.6"/>`;
  }

  // Draw joints as subtle dots
  for (let i = 0; i < 21; i++) {
    if (TIPS.includes(i) || i === 0) continue;
    s += `<circle cx="${pts[i].x}" cy="${pts[i].y}" r="2" fill="${c.skinDk}" opacity="0.15"/>`;
  }

  // Wrist circle
  s += `<circle cx="${pts[0].x}" cy="${pts[0].y}" r="10" fill="${c.skin}"
        stroke="${c.skinDk}" stroke-width="0.8" opacity="0.9"/>`;

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
  const hasHands = landmarks && landmarks.length >= 21;

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
      ${hasHands ? handSVG(c, landmarks) : `${idleHandSVG(c, 'L')}${idleHandSVG(c, 'R')}`}
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
  // Try nested format: [[hand_landmarks], ...] per frame
  seq = (landmarks || [])
    .map(fr => (Array.isArray(fr?.[0]) && fr[0].length === 3) ? fr[0] : fr)
    .filter(f => Array.isArray(f) && f.length >= 21);

  // Fallback: try flat format (each frame is directly 21+ landmarks)
  if (!seq.length) {
    seq = (landmarks || []).filter(f => Array.isArray(f) && f.length >= 21);
  }

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
