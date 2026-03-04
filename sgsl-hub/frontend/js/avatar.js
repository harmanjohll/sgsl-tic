/* ============================================================
   SgSL Hub — Avatar System
   ============================================================
   SVG-based animated avatar for sign language demonstration.
   High-quality cartoon character inspired by professional
   sign language teaching applications.
   ============================================================ */

// --- Character Definitions ---
const CHARS = {
  rajan: {
    name: 'Rajan', gender: 'male',
    skin: '#C68642', skinLt: '#D4A06A', skinDk: '#8B5E34',
    hair: '#1A1A2E',
    shirt: '#2D6A4F', shirtLt: '#40916C', shirtDk: '#1B4332',
    pants: '#1A1A2E', belt: '#2A2A2A',
    iris: '#3E2723',
  },
  meiling: {
    name: 'Mei Ling', gender: 'female',
    skin: '#F0C2A0', skinLt: '#FADCC8', skinDk: '#C99B78',
    hair: '#1A1A2E',
    shirt: '#7C3AED', shirtLt: '#9F67FF', shirtDk: '#5B21B6',
    pants: '#1A1A2E', belt: '#2A2A2A',
    iris: '#2C1810',
  },
};

// MediaPipe hand skeleton
const BONES = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17],
];
const TIPS = [4, 8, 12, 16, 20];
const FINGERS = [
  [1, 2, 3, 4],
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
];

// --- Coordinate mapping ---
function lmToSVG(lm) {
  return { x: 60 + (1 - lm[0]) * 280, y: 150 + lm[1] * 310 };
}

// --- SVG Components ---

function defsSVG(c) {
  return `
    <defs>
      <radialGradient id="av-bg" cx="50%" cy="25%" r="75%">
        <stop offset="0%" stop-color="#1e2140"/>
        <stop offset="100%" stop-color="#13152a"/>
      </radialGradient>
      <radialGradient id="face-shading" cx="45%" cy="38%" r="55%">
        <stop offset="0%" stop-color="${c.skinLt}" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="${c.skinDk}" stop-opacity="0.15"/>
      </radialGradient>
      <linearGradient id="shirt-shading" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${c.shirtDk}"/>
        <stop offset="40%" stop-color="${c.shirt}"/>
        <stop offset="60%" stop-color="${c.shirt}"/>
        <stop offset="100%" stop-color="${c.shirtDk}"/>
      </linearGradient>
    </defs>`;
}

function pantsSVG(c) {
  return `
    <g class="pants">
      <path d="M132,348 L126,520 L274,520 L268,348 Z" fill="${c.pants}"/>
      <line x1="200" y1="355" x2="200" y2="520" stroke="${c.pants}" stroke-width="2" opacity="0.3"/>
    </g>`;
}

function beltSVG(c) {
  return `
    <g class="belt">
      <rect x="132" y="340" width="136" height="14" rx="3" fill="${c.belt}"/>
      <rect x="192" y="340" width="16" height="14" rx="2" fill="#666" opacity="0.5"/>
      <rect x="197" y="343" width="6" height="8" rx="1" fill="#999" opacity="0.4"/>
    </g>`;
}

function shirtSVG(c) {
  return `
    <g class="shirt">
      <!-- Main torso -->
      <path d="M120,198 Q120,182 200,174 Q280,182 280,198 L268,340 L132,340 Z"
            fill="url(#shirt-shading)"/>

      <!-- Collar shadow -->
      <path d="M172,176 Q200,184 228,176 Q200,190 172,176 Z"
            fill="${c.shirtDk}" opacity="0.25"/>

      <!-- Left collar flap -->
      <path d="M178,174 L186,196 L200,180 Z" fill="${c.shirtLt}"/>
      <path d="M178,174 L186,196 L200,180 Z" fill="none" stroke="${c.shirtDk}" stroke-width="0.5" opacity="0.3"/>

      <!-- Right collar flap -->
      <path d="M222,174 L214,196 L200,180 Z" fill="${c.shirtLt}"/>
      <path d="M222,174 L214,196 L200,180 Z" fill="none" stroke="${c.shirtDk}" stroke-width="0.5" opacity="0.3"/>

      <!-- Placket line -->
      <line x1="200" y1="180" x2="200" y2="260" stroke="${c.shirtDk}" stroke-width="1" opacity="0.15"/>

      <!-- Buttons -->
      <circle cx="200" cy="200" r="3" fill="${c.shirtLt}" stroke="${c.shirtDk}" stroke-width="0.5" opacity="0.6"/>
      <circle cx="200" cy="222" r="3" fill="${c.shirtLt}" stroke="${c.shirtDk}" stroke-width="0.5" opacity="0.6"/>
      <circle cx="200" cy="244" r="3" fill="${c.shirtLt}" stroke="${c.shirtDk}" stroke-width="0.5" opacity="0.5"/>

      <!-- Left sleeve -->
      <path d="M120,198 Q108,210 102,238 L136,238 Q130,215 130,198 Z" fill="${c.shirt}"/>
      <path d="M102,236 Q119,242 136,236" stroke="${c.shirtDk}" stroke-width="1.5" fill="none" opacity="0.2"/>

      <!-- Right sleeve -->
      <path d="M280,198 Q292,210 298,238 L264,238 Q270,215 270,198 Z" fill="${c.shirt}"/>
      <path d="M264,236 Q281,242 298,236" stroke="${c.shirtDk}" stroke-width="1.5" fill="none" opacity="0.2"/>
    </g>`;
}

function neckSVG(c) {
  return `
    <g class="neck">
      <rect x="186" y="148" width="28" height="30" rx="10" fill="${c.skin}"/>
      <rect x="189" y="148" width="22" height="18" rx="7" fill="${c.skinLt}" opacity="0.12"/>
      <!-- Neck shadow under chin -->
      <ellipse cx="200" cy="152" rx="18" ry="5" fill="${c.skinDk}" opacity="0.15"/>
    </g>`;
}

function headSVG(c) {
  // Egg/oblong face shape with defined chin
  return `
    <g class="head">
      <!-- Face shape -->
      <path d="M200,18
               C236,18 252,46 252,78
               C252,108 244,130 230,142
               C218,152 208,156 200,156
               C192,156 182,152 170,142
               C156,130 148,108 148,78
               C148,46 164,18 200,18 Z"
            fill="${c.skin}"/>
      <!-- Face shading -->
      <path d="M200,18
               C236,18 252,46 252,78
               C252,108 244,130 230,142
               C218,152 208,156 200,156
               C192,156 182,152 170,142
               C156,130 148,108 148,78
               C148,46 164,18 200,18 Z"
            fill="url(#face-shading)"/>

      <!-- Jaw shadow -->
      <path d="M165,130 Q182,140 200,142 Q218,140 235,130 Q228,145 200,150 Q172,145 165,130 Z"
            fill="${c.skinDk}" opacity="0.08"/>
    </g>`;
}

function earsSVG(c) {
  return `
    <g class="ears">
      <!-- Left ear -->
      <ellipse cx="148" cy="85" rx="10" ry="14" fill="${c.skin}"/>
      <ellipse cx="150" cy="85" rx="6" ry="10" fill="${c.skinDk}" opacity="0.12"/>
      <path d="M148,77 Q153,82 152,90" stroke="${c.skinDk}" stroke-width="1" fill="none" opacity="0.15"/>

      <!-- Right ear -->
      <ellipse cx="252" cy="85" rx="10" ry="14" fill="${c.skin}"/>
      <ellipse cx="250" cy="85" rx="6" ry="10" fill="${c.skinDk}" opacity="0.12"/>
      <path d="M252,77 Q247,82 248,90" stroke="${c.skinDk}" stroke-width="1" fill="none" opacity="0.15"/>
    </g>`;
}

function hairSVG(c) {
  return `
    <g class="hair">
      <!-- Main hair mass -->
      <path d="M148,72
               C148,32 170,12 200,10
               C230,12 252,32 252,72
               Q252,52 240,38
               Q226,22 200,18
               Q174,22 160,38
               Q148,52 148,72 Z"
            fill="${c.hair}"/>

      <!-- Hair volume / top -->
      <path d="M155,58
               C156,30 175,10 200,8
               C225,10 244,30 245,58
               Q242,40 228,28
               Q212,16 200,14
               Q188,16 172,28
               Q158,40 155,58 Z"
            fill="${c.hair}"/>

      <!-- Side part highlight -->
      <path d="M170,28 Q180,18 200,14 Q195,20 185,28"
            fill="${c.hair}" opacity="0.5"/>

      <!-- Hair texture lines -->
      <path d="M172,30 Q185,22 200,18" stroke="#333" stroke-width="0.8" fill="none" opacity="0.15"/>
      <path d="M228,30 Q215,22 200,18" stroke="#333" stroke-width="0.8" fill="none" opacity="0.1"/>
    </g>`;
}

function eyesSVG(c) {
  return `
    <g class="eyes">
      <!-- Left eye -->
      <ellipse cx="180" cy="82" rx="12" ry="10" fill="white"/>
      <ellipse cx="180" cy="82" rx="12" ry="10" fill="none" stroke="${c.skinDk}" stroke-width="0.8" opacity="0.2"/>
      <circle cx="181" cy="83" r="6" fill="${c.iris}"/>
      <circle cx="181" cy="83" r="3.2" fill="#0D0D0D"/>
      <circle cx="183" cy="80.5" r="2" fill="white" opacity="0.9"/>
      <circle cx="179" cy="85" r="1" fill="white" opacity="0.35"/>
      <!-- Upper eyelid -->
      <path d="M168,78 Q180,72 192,78" stroke="${c.skinDk}" stroke-width="1.8" fill="none" opacity="0.35"/>

      <!-- Right eye -->
      <ellipse cx="220" cy="82" rx="12" ry="10" fill="white"/>
      <ellipse cx="220" cy="82" rx="12" ry="10" fill="none" stroke="${c.skinDk}" stroke-width="0.8" opacity="0.2"/>
      <circle cx="219" cy="83" r="6" fill="${c.iris}"/>
      <circle cx="219" cy="83" r="3.2" fill="#0D0D0D"/>
      <circle cx="221" cy="80.5" r="2" fill="white" opacity="0.9"/>
      <circle cx="217" cy="85" r="1" fill="white" opacity="0.35"/>
      <!-- Upper eyelid -->
      <path d="M208,78 Q220,72 232,78" stroke="${c.skinDk}" stroke-width="1.8" fill="none" opacity="0.35"/>
    </g>`;
}

function eyebrowsSVG(c) {
  // Thick, prominent eyebrows (like reference)
  return `
    <g class="eyebrows">
      <path d="M166,68 Q178,60 194,68"
            stroke="${c.hair}" stroke-width="4.5" fill="none" stroke-linecap="round"/>
      <path d="M206,68 Q222,60 234,68"
            stroke="${c.hair}" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    </g>`;
}

function noseSVG(c) {
  // Prominent cartoon nose (like reference)
  return `
    <g class="nose">
      <!-- Nose bridge shadow -->
      <path d="M198,84 Q196,95 196,104"
            stroke="${c.skinDk}" stroke-width="1.5" fill="none" opacity="0.2"/>
      <!-- Nose tip -->
      <ellipse cx="200" cy="108" rx="8" ry="5.5" fill="${c.skin}"/>
      <ellipse cx="200" cy="108" rx="8" ry="5.5" fill="${c.skinDk}" opacity="0.08"/>
      <!-- Nostril line -->
      <path d="M193,110 Q200,116 207,110"
            stroke="${c.skinDk}" stroke-width="1.5" fill="none" opacity="0.3" stroke-linecap="round"/>
      <!-- Nostril dots -->
      <circle cx="194" cy="109" r="2" fill="${c.skinDk}" opacity="0.1"/>
      <circle cx="206" cy="109" r="2" fill="${c.skinDk}" opacity="0.1"/>
      <!-- Nose highlight -->
      <ellipse cx="201" cy="105" rx="3" ry="2" fill="${c.skinLt}" opacity="0.2"/>
    </g>`;
}

function mouthSVG(c) {
  return `
    <g class="mouth">
      <!-- Smile line -->
      <path d="M188,124 Q200,132 212,124"
            stroke="${c.skinDk}" stroke-width="2.2" fill="none" stroke-linecap="round" opacity="0.4"/>
      <!-- Lower lip hint -->
      <path d="M192,126 Q200,130 208,126"
            fill="${c.skinDk}" opacity="0.06"/>
    </g>`;
}

function armSVG(c, side, wristPt) {
  // Arm starts at bottom-center of sleeve opening
  const sx = side === 'L' ? 119 : 281;
  const sy = 238;

  if (!wristPt) {
    // Idle arm: hanging down naturally
    const ex = side === 'L' ? 84 : 316;
    const ey = 368;
    const cx1 = side === 'L' ? 98 : 302;
    const cy1 = 290;
    return `
      <path d="M${sx},${sy} Q${cx1},${cy1} ${ex},${ey}"
            stroke="${c.skin}" stroke-width="22" fill="none" stroke-linecap="round"/>
      <path d="M${sx},${sy} Q${cx1},${cy1} ${ex},${ey}"
            stroke="${c.skinDk}" stroke-width="22" fill="none" stroke-linecap="round" opacity="0.06"/>`;
  }

  // Animated arm: follows wrist
  const mx = (sx + wristPt.x) / 2;
  const my = (sy + wristPt.y) / 2;
  const off = side === 'L' ? 30 : -30;
  return `
    <path d="M${sx},${sy} Q${mx + off},${Math.max(my - 15, sy + 10)} ${wristPt.x},${wristPt.y}"
          stroke="${c.skin}" stroke-width="22" fill="none" stroke-linecap="round"/>
    <path d="M${sx},${sy} Q${mx + off},${Math.max(my - 15, sy + 10)} ${wristPt.x},${wristPt.y}"
          stroke="${c.skinDk}" stroke-width="22" fill="none" stroke-linecap="round" opacity="0.06"/>`;
}

function idleHandSVG(c, side) {
  // Hand center matches arm endpoint exactly
  const x = side === 'L' ? 84 : 316;
  const y = 368;
  const dir = side === 'L' ? 1 : -1;

  // Cartoon hand: oval palm + 4 fingers + thumb
  return `
    <g class="idle-hand">
      <!-- Palm -->
      <ellipse cx="${x}" cy="${y}" rx="16" ry="18" fill="${c.skin}"
               stroke="${c.skinDk}" stroke-width="0.5" opacity="0.95"/>
      <!-- Palm shading -->
      <ellipse cx="${x + dir * 2}" cy="${y + 2}" rx="10" ry="12" fill="${c.skinDk}" opacity="0.06"/>

      <!-- Index finger -->
      <rect x="${x - 10 * dir}" y="${y - 32}" width="7" height="22" rx="3.5"
            fill="${c.skin}" stroke="${c.skinDk}" stroke-width="0.4"
            transform="rotate(${dir * -4},${x - 10 * dir + 3.5},${y - 10})"/>
      <!-- Middle finger -->
      <rect x="${x - 3 * dir}" y="${y - 34}" width="7" height="24" rx="3.5"
            fill="${c.skin}" stroke="${c.skinDk}" stroke-width="0.4"
            transform="rotate(${dir * -1},${x - 3 * dir + 3.5},${y - 10})"/>
      <!-- Ring finger -->
      <rect x="${x + 4 * dir}" y="${y - 32}" width="7" height="22" rx="3.5"
            fill="${c.skin}" stroke="${c.skinDk}" stroke-width="0.4"
            transform="rotate(${dir * 2},${x + 4 * dir + 3.5},${y - 10})"/>
      <!-- Pinky finger -->
      <rect x="${x + 11 * dir}" y="${y - 28}" width="6" height="18" rx="3"
            fill="${c.skin}" stroke="${c.skinDk}" stroke-width="0.4"
            transform="rotate(${dir * 6},${x + 11 * dir + 3},${y - 10})"/>
      <!-- Thumb -->
      <rect x="${x - 18 * dir}" y="${y - 8}" width="7" height="16" rx="3.5"
            fill="${c.skin}" stroke="${c.skinDk}" stroke-width="0.4"
            transform="rotate(${dir * -30},${x - 18 * dir + 3.5},${y - 8})"/>

      <!-- Knuckle line -->
      <path d="M${x - 12 * dir},${y - 10} Q${x},${y - 13} ${x + 14 * dir},${y - 10}"
            stroke="${c.skinDk}" stroke-width="0.6" fill="none" opacity="0.12"/>
    </g>`;
}

function handSVG(c, landmarks) {
  if (!landmarks || landmarks.length < 21) return '';
  const pts = landmarks.map(lm => lmToSVG(lm));
  let s = '';

  // Filled palm
  const palmIdx = [0, 1, 5, 9, 13, 17];
  const palmPath = palmIdx.map((i, idx) =>
    `${idx === 0 ? 'M' : 'L'}${pts[i].x},${pts[i].y}`
  ).join(' ') + ' Z';
  s += `<path d="${palmPath}" fill="${c.skin}" stroke="${c.skinDk}" stroke-width="0.5" opacity="0.95"/>`;

  // Filled fingers
  for (const finger of FINGERS) {
    for (let i = 0; i < finger.length - 1; i++) {
      const a = finger[i], b = finger[i + 1];
      const w = i === 0 ? 10 : (i === 1 ? 8 : 7);
      s += `<line x1="${pts[a].x}" y1="${pts[a].y}" x2="${pts[b].x}" y2="${pts[b].y}"
            stroke="${c.skin}" stroke-width="${w}" stroke-linecap="round"/>`;
    }
    // Fingertip
    const tip = finger[finger.length - 1];
    s += `<circle cx="${pts[tip].x}" cy="${pts[tip].y}" r="4.5" fill="${c.skinLt}"
          stroke="${c.skinDk}" stroke-width="0.5"/>`;
  }

  // Subtle joint dots
  for (let i = 0; i < 21; i++) {
    if (TIPS.includes(i) || i === 0) continue;
    s += `<circle cx="${pts[i].x}" cy="${pts[i].y}" r="1.5" fill="${c.skinDk}" opacity="0.1"/>`;
  }

  // Wrist
  s += `<circle cx="${pts[0].x}" cy="${pts[0].y}" r="12" fill="${c.skin}"
        stroke="${c.skinDk}" stroke-width="0.6" opacity="0.95"/>`;

  return s;
}

// --- Full body composite ---
function bodySVG(c) {
  return `
    <g class="avatar-body">
      ${pantsSVG(c)}
      ${beltSVG(c)}
      ${shirtSVG(c)}
      ${neckSVG(c)}
      ${earsSVG(c)}
      ${headSVG(c)}
      ${hairSVG(c)}
      ${eyesSVG(c)}
      ${eyebrowsSVG(c)}
      ${noseSVG(c)}
      ${mouthSVG(c)}
    </g>`;
}

// --- State ---
let charId = 'meiling';
let container = null;
let seq = [], playing = false, paused = false;
let fi = 0, fAcc = 0, spd = 1;
let rafId = null, lastT = 0;
let prevLandmarks = null;
let _onFrame = null, _onDone = null;

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
      ${defsSVG(c)}
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
  // Try nested format first: [[hand_landmarks], ...] per frame
  seq = (landmarks || [])
    .map(fr => (Array.isArray(fr?.[0]) && fr[0].length === 3) ? fr[0] : fr)
    .filter(f => Array.isArray(f) && f.length >= 21);

  // Fallback: flat format (each frame is directly 21+ landmarks)
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
