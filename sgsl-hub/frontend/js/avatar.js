/* ============================================================
   SgSL Hub — Avatar System
   ============================================================
   Clean, friendly SVG avatar for sign language demonstration.
   Biomechanically-informed animation using minimum-jerk
   trajectories and DIP=2/3×PIP finger coupling.
   ============================================================ */

// --- Character Definitions ---
const CHARS = {
  rajan: {
    name: 'Rajan', gender: 'male',
    skin: '#C68642', skinLt: '#D9A867', skinDk: '#8B5E34',
    hair: '#1A1A2E', hairHi: '#2E2E48',
    shirt: '#2D6A4F', shirtLt: '#40916C', shirtDk: '#1B4332',
    pants: '#2B2B42', pantsDk: '#1A1A2E',
    belt: '#3A3028', beltBuckle: '#C4A35A',
    iris: '#3E2723', irisRing: '#5D4037',
    lip: '#9E6B4A', lipDk: '#7A503A',
    brow: '#1A1A2E',
    cheek: '#D4915A',
    rimLight: '#6C8EFF',
  },
  meiling: {
    name: 'Mei Ling', gender: 'female',
    skin: '#F0C2A0', skinLt: '#FADCC8', skinDk: '#C99B78',
    hair: '#2A1A12', hairHi: '#4A3428',
    shirt: '#7C3AED', shirtLt: '#9F67FF', shirtDk: '#5B21B6',
    pants: '#2B2B42', pantsDk: '#1A1A2E',
    belt: '#3A3028', beltBuckle: '#C4A35A',
    iris: '#2C1810', irisRing: '#4A332A',
    lip: '#E08888', lipDk: '#C06868',
    brow: '#3A2A20',
    cheek: '#F0A8A0',
    rimLight: '#A78BFA',
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
// Avatar reference points (SVG coords)
const AVATAR_NOSE = { x: 200, y: 116 };
const AVATAR_LEFT_EYE = { x: 180, y: 84 };
const AVATAR_RIGHT_EYE = { x: 220, y: 84 };
const AVATAR_EYE_DIST = 40; // inter-eye distance in SVG px

// Face-relative mapping: anchors hand position to avatar's face
// Uses face nose as origin, inter-eye distance as scale unit
function lmToSVG(lm, faceAnchor) {
  if (faceAnchor) {
    // Face-relative: map hand position proportionally
    const scale = AVATAR_EYE_DIST / (faceAnchor.eyeDist || 0.08);
    return {
      x: AVATAR_NOSE.x + ((1 - lm[0]) - (1 - faceAnchor.nose[0])) * scale,
      y: AVATAR_NOSE.y + (lm[1] - faceAnchor.nose[1]) * scale,
    };
  }
  // Fallback: absolute mapping (legacy)
  return { x: 60 + (1 - lm[0]) * 280, y: 100 + lm[1] * 280 };
}

// Extract face anchor from holistic face data (32-point subset)
// Indices: 10=left eye outer, 14=right eye outer, 18=nose tip
function extractFaceAnchor(faceData) {
  if (!faceData || faceData.length < 32) return null;
  const nose = faceData[18]; // _FACE_NOSE[0]
  const leftEye = faceData[10]; // _FACE_LEFT_EYE[0]
  const rightEye = faceData[14]; // _FACE_RIGHT_EYE[0]
  const dx = leftEye[0] - rightEye[0];
  const dy = leftEye[1] - rightEye[1];
  const eyeDist = Math.sqrt(dx * dx + dy * dy);
  if (eyeDist < 0.01) return null;
  return { nose, eyeDist };
}

// --- SVG Definitions (simplified) ---
function defsSVG(c) {
  return `
    <defs>
      <radialGradient id="av-bg" cx="50%" cy="30%" r="75%">
        <stop offset="0%" stop-color="#2a2d55"/>
        <stop offset="60%" stop-color="#1a1d38"/>
        <stop offset="100%" stop-color="#0e1020"/>
      </radialGradient>
      <radialGradient id="spotlight" cx="50%" cy="45%" r="40%">
        <stop offset="0%" stop-color="${c.rimLight}" stop-opacity="0.06"/>
        <stop offset="100%" stop-color="${c.rimLight}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="cheek-l" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${c.cheek}" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="${c.cheek}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="cheek-r" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${c.cheek}" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="${c.cheek}" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="shirt-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${c.shirtLt}" stop-opacity="0.3"/>
        <stop offset="30%" stop-color="${c.shirt}"/>
        <stop offset="70%" stop-color="${c.shirt}"/>
        <stop offset="100%" stop-color="${c.shirtDk}"/>
      </linearGradient>
      <linearGradient id="shirt-side-l" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${c.shirtDk}"/>
        <stop offset="100%" stop-color="${c.shirt}" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="shirt-side-r" x1="100%" y1="0%" x2="0%" y2="0%">
        <stop offset="0%" stop-color="${c.shirtDk}"/>
        <stop offset="100%" stop-color="${c.shirt}" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="pants-grad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="${c.pants}"/>
        <stop offset="100%" stop-color="${c.pantsDk}"/>
      </linearGradient>
      <radialGradient id="iris-grad-l" cx="45%" cy="40%" r="50%">
        <stop offset="0%" stop-color="${c.irisRing}"/>
        <stop offset="80%" stop-color="${c.iris}"/>
        <stop offset="100%" stop-color="#1a1a1a"/>
      </radialGradient>
      <radialGradient id="iris-grad-r" cx="55%" cy="40%" r="50%">
        <stop offset="0%" stop-color="${c.irisRing}"/>
        <stop offset="80%" stop-color="${c.iris}"/>
        <stop offset="100%" stop-color="#1a1a1a"/>
      </radialGradient>
      <filter id="hand-shadow" x="-5%" y="-5%" width="115%" height="115%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur"/>
        <feOffset in="blur" dx="1" dy="2" result="off"/>
        <feFlood flood-color="#000" flood-opacity="0.08" result="color"/>
        <feComposite in="color" in2="off" operator="in" result="shadow"/>
        <feMerge>
          <feMergeNode in="shadow"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>`;
}

function backgroundSVG() {
  return `
    <rect width="400" height="520" fill="url(#av-bg)" rx="8"/>
    <rect width="400" height="520" fill="url(#spotlight)" rx="8"/>
    <ellipse cx="200" cy="515" rx="90" ry="6" fill="#000" opacity="0.15"/>`;
}

function pantsSVG(c) {
  return `
    <g class="pants">
      <path d="M136,350 L130,520 L196,520 L200,360 Z" fill="url(#pants-grad)"/>
      <path d="M200,360 L204,520 L270,520 L264,350 Z" fill="url(#pants-grad)"/>
      <line x1="200" y1="358" x2="200" y2="520" stroke="${c.pantsDk}" stroke-width="1.5" opacity="0.2"/>
      <path d="M136,350 Q200,356 264,350 Q200,362 136,350 Z" fill="${c.pantsDk}" opacity="0.15"/>
    </g>`;
}

function beltSVG(c) {
  return `
    <g class="belt">
      <rect x="130" y="340" width="140" height="14" rx="3" fill="${c.belt}"/>
      <rect x="189" y="339" width="22" height="16" rx="3" fill="${c.beltBuckle}"/>
      <rect x="192" y="342" width="16" height="10" rx="2" fill="none"
            stroke="${c.belt}" stroke-width="1.5"/>
      <line x1="200" y1="340" x2="200" y2="354" stroke="${c.belt}" stroke-width="1.2"/>
    </g>`;
}

function shirtSVG(c) {
  return `
    <g class="shirt">
      <path d="M116,200 Q116,182 200,174 Q284,182 284,200 L270,342 L130,342 Z"
            fill="url(#shirt-grad)"/>
      <path d="M116,200 L130,342 L155,342 L138,200 Z" fill="url(#shirt-side-l)" opacity="0.4"/>
      <path d="M284,200 L270,342 L245,342 L262,200 Z" fill="url(#shirt-side-r)" opacity="0.4"/>
      <path d="M162,220 Q165,270 160,330" stroke="${c.shirtDk}" stroke-width="0.7" fill="none" opacity="0.08"/>
      <path d="M238,220 Q235,270 240,330" stroke="${c.shirtDk}" stroke-width="0.7" fill="none" opacity="0.08"/>
      <!-- Neckline — clear round collar with visible edge -->
      <path d="M174,176 Q200,192 226,176" fill="none" stroke="${c.shirtDk}" stroke-width="2" opacity="0.3"/>
      <path d="M176,174 L186,196 L200,184 Z" fill="${c.shirtLt}"/>
      <path d="M224,174 L214,196 L200,184 Z" fill="${c.shirtLt}"/>
      <line x1="200" y1="184" x2="200" y2="260" stroke="${c.shirtDk}" stroke-width="1" opacity="0.1"/>
      ${[204, 226, 248].map(y => `
        <circle cx="200" cy="${y}" r="2.8" fill="${c.shirtLt}" stroke="${c.shirtDk}" stroke-width="0.5" opacity="0.5"/>
      `).join('')}
      <!-- Sleeves -->
      <path d="M116,200 Q100,216 94,246 L136,246 Q128,220 128,200 Z" fill="${c.shirt}"/>
      <path d="M94,244 Q115,250 136,244" stroke="${c.shirtDk}" stroke-width="1.5" fill="none" opacity="0.15"/>
      <path d="M284,200 Q300,216 306,246 L264,246 Q272,220 272,200 Z" fill="${c.shirt}"/>
      <path d="M264,244 Q285,250 306,244" stroke="${c.shirtDk}" stroke-width="1.5" fill="none" opacity="0.15"/>
    </g>`;
}

function neckSVG(c) {
  const isFemale = c.gender === 'female';
  // Tapered neck: narrower at jaw, wider at shoulders, smooth curves
  const topW = isFemale ? 24 : 30;   // width at jaw
  const botW = isFemale ? 36 : 44;   // width at base (into shirt)
  const topY = 145;
  const botY = 178;
  const cx = 200;

  return `
    <g class="neck">
      <!-- Smooth tapered neck shape -->
      <path d="M${cx - topW / 2},${topY}
               Q${cx - topW / 2 - 2},${(topY + botY) / 2}
                ${cx - botW / 2},${botY}
               L${cx + botW / 2},${botY}
               Q${cx + topW / 2 + 2},${(topY + botY) / 2}
                ${cx + topW / 2},${topY} Z"
            fill="${c.skin}"/>
      <!-- Chin shadow (soft gradient feel) -->
      <ellipse cx="${cx}" cy="${topY + 3}" rx="${topW / 2 - 1}" ry="3.5"
               fill="${c.skinDk}" opacity="0.08"/>
      <!-- Side shadows for roundness -->
      <path d="M${cx - topW / 2},${topY}
               Q${cx - topW / 2 - 2},${(topY + botY) / 2}
                ${cx - botW / 2},${botY}
               L${cx - botW / 2 + 6},${botY}
               Q${cx - topW / 2 + 4},${(topY + botY) / 2}
                ${cx - topW / 2 + 3},${topY} Z"
            fill="${c.skinDk}" opacity="0.05"/>
      <path d="M${cx + topW / 2},${topY}
               Q${cx + topW / 2 + 2},${(topY + botY) / 2}
                ${cx + botW / 2},${botY}
               L${cx + botW / 2 - 6},${botY}
               Q${cx + topW / 2 - 4},${(topY + botY) / 2}
                ${cx + topW / 2 - 3},${topY} Z"
            fill="${c.skinDk}" opacity="0.05"/>
      ${!isFemale ? `
        <!-- Subtle adam's apple for male -->
        <ellipse cx="${cx}" cy="163" rx="2.5" ry="3.5"
                 fill="${c.skinDk}" opacity="0.035"/>
      ` : ''}
    </g>`;
}

// --- Head: clean, friendly rendering (NO inner-shadow filter) ---
function headSVG(c) {
  const isFemale = c.gender === 'female';
  const jaw = isFemale
    ? `C224,148 216,162 200,168 C184,162 176,148 168,140`
    : `C220,150 212,158 200,160 C188,158 180,150 168,142`;
  const chinY = isFemale ? 168 : 160;

  return `
    <g class="head">
      <!-- Face — single clean fill, no heavy filters -->
      <path d="M200,18
               C236,18 256,46 256,80
               C256,112 246,132 230,142
               ${jaw}
               C156,132 146,112 146,80
               C146,46 164,18 200,18 Z"
            fill="${c.skin}"/>

      <!-- Subtle forehead glow -->
      <path d="M200,22 C230,22 248,44 250,68
               C250,54 238,30 200,26
               C162,30 150,54 150,68
               C152,44 170,22 200,22 Z"
            fill="${c.skinLt}" opacity="0.15"/>

      <!-- Warm cheek blush -->
      <ellipse cx="${isFemale ? 168 : 166}" cy="${isFemale ? 110 : 108}" rx="16" ry="12" fill="url(#cheek-l)"/>
      <ellipse cx="${isFemale ? 232 : 234}" cy="${isFemale ? 110 : 108}" rx="16" ry="12" fill="url(#cheek-r)"/>

      <!-- Subtle jaw shadow -->
      <path d="M168,132 Q184,146 200,${chinY} Q216,146 232,132
               Q224,150 200,${chinY + 3} Q176,150 168,132 Z"
            fill="${c.skinDk}" opacity="0.06"/>
    </g>`;
}

function earsSVG(c) {
  const isFemale = c.gender === 'female';
  return `
    <g class="ears">
      <ellipse cx="145" cy="88" rx="10" ry="15" fill="${c.skin}"/>
      <ellipse cx="147" cy="88" rx="6" ry="10" fill="${c.skinDk}" opacity="0.06"/>
      <ellipse cx="255" cy="88" rx="10" ry="15" fill="${c.skin}"/>
      <ellipse cx="253" cy="88" rx="6" ry="10" fill="${c.skinDk}" opacity="0.06"/>
      ${isFemale ? `
        <circle cx="145" cy="101" r="2.5" fill="${c.rimLight}" opacity="0.35"/>
        <circle cx="255" cy="101" r="2.5" fill="${c.rimLight}" opacity="0.35"/>
      ` : ''}
    </g>`;
}

// --- Hair ---
function hairBackSVG(c) {
  if (c.gender !== 'female') return '';
  // Short bob — only behind the head, stops well above chin
  return `
    <g class="hair-back">
      <path d="M138,52
               C138,14 168,-8 200,-8
               C232,-8 262,14 262,52
               L264,90 L260,120
               Q250,140 200,142
               Q150,140 140,120
               L136,90 Z"
            fill="${c.hair}"/>
    </g>`;
}

function hairSVG(c) {
  if (c.gender === 'female') {
    return `
      <g class="hair">
        <!-- Top of head — simple volume -->
        <path d="M146,52
                 C148,14 174,-6 200,-8
                 C226,-6 252,14 254,52
                 Q252,28 232,14 Q216,2 200,0
                 Q184,2 168,14 Q148,28 146,52 Z"
              fill="${c.hair}"/>
        <!-- Soft swept bangs only — no side hair hanging down -->
        <path d="M156,44 Q168,22 188,14 Q178,32 170,48 Z" fill="${c.hair}"/>
        <path d="M168,40 Q182,18 202,10 Q190,28 184,44 Z" fill="${c.hair}"/>
        <path d="M182,42 Q196,22 216,16 Q204,34 196,48 Z" fill="${c.hair}"/>
        <!-- Shine -->
        <path d="M174,6 Q190,-2 212,2 Q196,4 180,12" fill="${c.hairHi}" opacity="0.2"/>
      </g>`;
  }

  // Rajan: fuller hair
  return `
    <g class="hair">
      <path d="M142,68
               C142,22 168,0 200,-2 C232,0 258,22 258,68
               Q258,44 244,28 Q230,12 200,8
               Q170,12 156,28 Q142,44 142,68 Z"
            fill="${c.hair}"/>
      <path d="M150,54
               C152,20 174,0 200,-2 C226,0 248,20 250,54
               Q248,30 232,18 Q216,4 200,2
               Q184,4 168,18 Q152,30 150,54 Z"
            fill="${c.hair}"/>
      <path d="M145,64 Q143,76 144,92" stroke="${c.hair}" stroke-width="7" stroke-linecap="round"/>
      <path d="M255,64 Q257,76 256,92" stroke="${c.hair}" stroke-width="7" stroke-linecap="round"/>
      <path d="M178,10 Q192,2 214,6 Q198,6 184,14" fill="${c.hairHi}" opacity="0.2"/>
      <path d="M146,68 Q145,80 147,94" stroke="${c.hair}" stroke-width="5" stroke-linecap="round" opacity="0.6"/>
      <path d="M254,68 Q255,80 253,94" stroke="${c.hair}" stroke-width="5" stroke-linecap="round" opacity="0.6"/>
    </g>`;
}

// --- Eyes: clean, large-iris friendly style ---
// Large iris fills most of the eye (75%+ ratio) → less white sclera → friendlier
function eyesSVG(c) {
  const isFemale = c.gender === 'female';
  // Slightly smaller overall eyes
  const rx = isFemale ? 11 : 10;
  const ry = isFemale ? 8.5 : 8;
  // Large iris relative to eye → friendly, less white showing
  const irisR = isFemale ? 7.5 : 7;
  // SMALLER pupil → less staring/scary, more colored iris visible
  const pupilR = isFemale ? 3 : 2.8;

  let lashes = '';
  if (isFemale) {
    // Softer, lighter lashes
    lashes = `
      <path d="M${180 - rx + 2},${84 - ry + 2} Q${180 - rx},${84 - ry - 2} ${180 - rx},${84 - ry - 4}"
            stroke="${c.brow}" stroke-width="0.8" fill="none" stroke-linecap="round" opacity="0.25"/>
      <path d="M${220 + rx - 2},${84 - ry + 2} Q${220 + rx},${84 - ry - 2} ${220 + rx},${84 - ry - 4}"
            stroke="${c.brow}" stroke-width="0.8" fill="none" stroke-linecap="round" opacity="0.25"/>
    `;
  }

  return `
    <g class="eyes">
      ${lashes}
      <!-- Left eye -->
      <ellipse cx="180" cy="84" rx="${rx}" ry="${ry}" fill="white"/>
      <circle cx="180" cy="85" r="${irisR}" fill="url(#iris-grad-l)"/>
      <circle cx="180" cy="85" r="${pupilR}" fill="#1a1a1a"/>
      <!-- Larger, brighter highlight for warmth -->
      <circle cx="183" cy="82" r="3" fill="white" opacity="0.95"/>
      <circle cx="178" cy="87" r="1.2" fill="white" opacity="0.4"/>
      <!-- Soft upper lid line -->
      <path d="M${180 - rx + 1},${84 - ry + 2} Q180,${84 - ry} ${180 + rx - 1},${84 - ry + 2}"
            stroke="${c.skinDk}" stroke-width="${isFemale ? 1.5 : 1.2}" fill="none" opacity="0.25"/>

      <!-- Right eye -->
      <ellipse cx="220" cy="84" rx="${rx}" ry="${ry}" fill="white"/>
      <circle cx="220" cy="85" r="${irisR}" fill="url(#iris-grad-r)"/>
      <circle cx="220" cy="85" r="${pupilR}" fill="#1a1a1a"/>
      <circle cx="223" cy="82" r="3" fill="white" opacity="0.95"/>
      <circle cx="218" cy="87" r="1.2" fill="white" opacity="0.4"/>
      <path d="M${220 - rx + 1},${84 - ry + 2} Q220,${84 - ry} ${220 + rx - 1},${84 - ry + 2}"
            stroke="${c.skinDk}" stroke-width="${isFemale ? 1.5 : 1.2}" fill="none" opacity="0.25"/>
    </g>`;
}

function eyebrowsSVG(c) {
  const isFemale = c.gender === 'female';
  // Much thinner, softer brows — no harsh angular slashes
  const sw = isFemale ? 1.8 : 2.8;
  // Gentler arch, slightly higher for a more open/friendly expression
  const archL = isFemale
    ? 'M166,64 Q180,56 192,63'
    : 'M164,66 Q180,58 194,66';
  const archR = isFemale
    ? 'M208,63 Q220,56 234,64'
    : 'M206,66 Q220,58 236,66';
  return `
    <g class="eyebrows">
      <path d="${archL}" stroke="${c.brow}" stroke-width="${sw}" fill="none" stroke-linecap="round" opacity="${isFemale ? 0.5 : 0.65}"/>
      <path d="${archR}" stroke="${c.brow}" stroke-width="${sw}" fill="none" stroke-linecap="round" opacity="${isFemale ? 0.5 : 0.65}"/>
    </g>`;
}

// --- Nose: minimal hint, no detailed anatomy ---
function noseSVG(c) {
  const isFemale = c.gender === 'female';
  return `
    <g class="nose">
      <path d="M198,92 Q196,104 195,112"
            stroke="${c.skinDk}" stroke-width="0.8" fill="none" opacity="0.08"/>
      <path d="M${isFemale ? 193 : 191},114 Q200,${isFemale ? 117 : 119} ${isFemale ? 207 : 209},114"
            stroke="${c.skinDk}" stroke-width="${isFemale ? 1 : 1.3}" fill="none" opacity="0.15" stroke-linecap="round"/>
    </g>`;
}

// --- Mouth: clean, warm smile ---
function mouthSVG(c) {
  const isFemale = c.gender === 'female';
  return `
    <g class="mouth">
      <path d="M186,128 Q200,${isFemale ? 141 : 139} 214,128"
            stroke="${c.lipDk}" stroke-width="${isFemale ? 2 : 1.8}" fill="none" stroke-linecap="round" opacity="0.35"/>
      ${isFemale ? `
        <path d="M188,128 Q200,139 212,128"
              fill="${c.lip}" opacity="0.25"/>
      ` : ''}
    </g>`;
}

// --- Arms: organic contour-based limbs (no wooden dowels) ---
// Draws a filled shape with natural tapering from shoulder to wrist.
function _armContour(sx, sy, ex, ey, wTop, wBot, side, c) {
  // Perpendicular offsets for the two edges of the arm
  const dx = ex - sx, dy = ey - sy;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const px = -dy / len, py = dx / len;
  const sDir = side === 'L' ? -1 : 1;

  // Outer edge (away from body) has a slight muscle bulge
  const mx = (sx + ex) / 2 + px * sDir * 4;
  const my = (sy + ey) / 2 + py * sDir * 4;

  // Four corners of the tapered arm shape
  const s1x = sx + px * wTop / 2, s1y = sy + py * wTop / 2;
  const s2x = sx - px * wTop / 2, s2y = sy - py * wTop / 2;
  const e1x = ex + px * wBot / 2, e1y = ey + py * wBot / 2;
  const e2x = ex - px * wBot / 2, e2y = ey - py * wBot / 2;

  // Outer bulge control points
  const m1x = mx + px * (wTop + wBot) / 4, m1y = my + py * (wTop + wBot) / 4;
  const m2x = mx - px * (wTop + wBot) / 4, m2y = my - py * (wTop + wBot) / 4;

  return `
    <path d="M${s1x.toFixed(1)},${s1y.toFixed(1)}
             Q${m1x.toFixed(1)},${m1y.toFixed(1)} ${e1x.toFixed(1)},${e1y.toFixed(1)}
             L${e2x.toFixed(1)},${e2y.toFixed(1)}
             Q${m2x.toFixed(1)},${m2y.toFixed(1)} ${s2x.toFixed(1)},${s2y.toFixed(1)} Z"
          fill="${c.skin}"/>
    <path d="M${s1x.toFixed(1)},${s1y.toFixed(1)}
             Q${m1x.toFixed(1)},${m1y.toFixed(1)} ${e1x.toFixed(1)},${e1y.toFixed(1)}
             L${e2x.toFixed(1)},${e2y.toFixed(1)}
             Q${m2x.toFixed(1)},${m2y.toFixed(1)} ${s2x.toFixed(1)},${s2y.toFixed(1)} Z"
          fill="${c.skinDk}" opacity="0.06"/>`;
}

function armSVG(c, side, wristPt) {
  const sx = side === 'L' ? 115 : 285;
  const sy = 244;
  const sDir = side === 'L' ? -1 : 1;

  if (!wristPt) {
    const elbowX = side === 'L' ? 120 : 280;
    const elbowY = 295;
    const handX = side === 'L' ? 168 : 232;
    const handY = 305;

    return `<g class="arm-${side}">
      ${_armContour(sx, sy, elbowX, elbowY, 24, 20, side, c)}
      ${_armContour(elbowX, elbowY, handX, handY, 20, 14, side, c)}
    </g>`;
  }

  // Animated: natural elbow calculation
  const elbowT = 0.45;
  const elbowBias = sDir * 12;
  const elbowX = sx + (wristPt.x - sx) * elbowT + elbowBias;
  const elbowY = Math.max(sy + 10, sy + (wristPt.y - sy) * elbowT);

  return `<g class="arm-${side}">
    ${_armContour(sx, sy, elbowX, elbowY, 24, 20, side, c)}
    ${_armContour(elbowX, elbowY, wristPt.x, wristPt.y, 20, 14, side, c)}
  </g>`;
}

// --- Idle hands: relaxed, fingers down ---
function idleHandSVG(c, side) {
  const x = side === 'L' ? 168 : 232;
  const y = 305;
  const dir = side === 'L' ? 1 : -1;

  const fingers = [
    { dx: -9, len: 16, w: 4.8, rot: 6 },
    { dx: -3, len: 20, w: 5.2, rot: 2 },
    { dx: 3,  len: 22, w: 5.5, rot: -1 },
    { dx: 9,  len: 19, w: 5.0, rot: -3 },
  ];

  return `
    <g class="idle-hand" filter="url(#hand-shadow)">
      <ellipse cx="${x}" cy="${y}" rx="15" ry="12" fill="${c.skin}"/>
      <ellipse cx="${x + dir * 2}" cy="${y + 1}" rx="8" ry="7" fill="${c.skinDk}" opacity="0.04"/>
      <!-- Thumb -->
      <ellipse cx="${x + 16 * dir}" cy="${y + 1}" rx="4.5" ry="8"
               fill="${c.skin}" stroke="${c.skinDk}" stroke-width="0.3"
               transform="rotate(${dir * 18},${x + 16 * dir},${y + 1})"/>
      <!-- Fingers down -->
      ${fingers.map(f => {
        const fx = x + f.dx * dir;
        return `<rect x="${fx - f.w / 2}" y="${y + 7}" width="${f.w}" height="${f.len}" rx="${f.w / 2}"
              fill="${c.skin}" stroke="${c.skinDk}" stroke-width="0.25"
              transform="rotate(${f.rot * dir},${fx},${y + 7 + f.len / 2})"/>`;
      }).join('')}
      <path d="M${x - 12 * dir},${y + 6} Q${x},${y + 9} ${x + 12 * dir},${y + 6}"
            stroke="${c.skinDk}" stroke-width="0.4" fill="none" opacity="0.06"/>
    </g>`;
}

// --- Biomechanical finger constraint: DIP = 2/3 × PIP ---
// From Avatars.md: ensures natural finger curl during animation
function applyFingerConstraints(landmarks) {
  if (!landmarks || landmarks.length < 21) return landmarks;
  const out = landmarks.map(lm => [...lm]);

  // Finger joint chains: [MCP, PIP, DIP, TIP] — skip thumb (different DoF)
  const chains = [[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]];

  for (const [mcp, pip, dip, tip] of chains) {
    // PIP angle (curl at the middle knuckle)
    const v1x = out[mcp][0] - out[pip][0], v1y = out[mcp][1] - out[pip][1];
    const v2x = out[dip][0] - out[pip][0], v2y = out[dip][1] - out[pip][1];
    const pipAngle = Math.atan2(v1x * v2y - v1y * v2x, v1x * v2x + v1y * v2y);

    // DIP angle (curl at the fingertip knuckle)
    const v3x = out[pip][0] - out[dip][0], v3y = out[pip][1] - out[dip][1];
    const v4x = out[tip][0] - out[dip][0], v4y = out[tip][1] - out[dip][1];
    const dipAngle = Math.atan2(v3x * v4y - v3y * v4x, v3x * v4x + v3y * v4y);

    // Target: DIP should be 2/3 of PIP. Blend 40% toward target.
    const target = pipAngle * (2 / 3);
    const diff = (target - dipAngle) * 0.4;
    const cos = Math.cos(diff), sin = Math.sin(diff);
    const dx = out[tip][0] - out[dip][0], dy = out[tip][1] - out[dip][1];
    out[tip][0] = out[dip][0] + dx * cos - dy * sin;
    out[tip][1] = out[dip][1] + dx * sin + dy * cos;
  }

  return out;
}

// --- Animated hand: clearly defined fingers with outlines ---
// Each finger is drawn as a distinct, outlined shape so sign hand shapes are readable
function handSVG(c, landmarks, faceAnchor) {
  if (!landmarks || landmarks.length < 21) return '';
  const pts = landmarks.map(lm => lmToSVG(lm, faceAnchor));
  let s = '<g class="signing-hand" filter="url(#hand-shadow)">';

  // Palm — filled shape with outline
  const palmIdx = [0, 1, 5, 9, 13, 17];
  const palmPath = palmIdx.map((i, idx) =>
    `${idx === 0 ? 'M' : 'L'}${pts[i].x},${pts[i].y}`
  ).join(' ') + ' Z';
  s += `<path d="${palmPath}" fill="${c.skin}" stroke="none" opacity="0.95"/>`;
  // Palm outline (on top, thin)
  s += `<path d="${palmPath}" fill="none" stroke="${c.skinDk}" stroke-width="0.5" opacity="0.15"/>`;

  // Fingers — each segment has a distinct outlined rounded-rect shape
  // Widths taper: base=10, mid=8, distal=6; thumb is slightly wider
  const fingerWidths = {
    0: [10, 9, 8, 7],   // thumb
    1: [9, 8, 7, 6],    // index
    2: [9, 8, 7, 6],    // middle
    3: [8, 7, 6, 5.5],  // ring
    4: [7, 6, 5.5, 5],  // pinky
  };

  for (let fi = 0; fi < FINGERS.length; fi++) {
    const finger = FINGERS[fi];
    const widths = fingerWidths[fi];

    for (let i = 0; i < finger.length - 1; i++) {
      const a = finger[i], b = finger[i + 1];
      const wA = widths[i] / 2;
      const wB = widths[i + 1] / 2;
      const dx = pts[b].x - pts[a].x;
      const dy = pts[b].y - pts[a].y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      // Perpendicular unit vector
      const px = -dy / len, py = dx / len;

      // Draw a tapered quad with rounded ends for each segment
      const x1 = pts[a].x + px * wA, y1 = pts[a].y + py * wA;
      const x2 = pts[a].x - px * wA, y2 = pts[a].y - py * wA;
      const x3 = pts[b].x - px * wB, y3 = pts[b].y - py * wB;
      const x4 = pts[b].x + px * wB, y4 = pts[b].y + py * wB;

      s += `<path d="M${x1.toFixed(1)},${y1.toFixed(1)} L${x4.toFixed(1)},${y4.toFixed(1)}
                     A${wB.toFixed(1)},${wB.toFixed(1)} 0 0 1 ${x3.toFixed(1)},${y3.toFixed(1)}
                     L${x2.toFixed(1)},${y2.toFixed(1)}
                     A${wA.toFixed(1)},${wA.toFixed(1)} 0 0 1 ${x1.toFixed(1)},${y1.toFixed(1)} Z"
            fill="${c.skin}" stroke="none"/>`;

      // Joint cover circle — fills the seam between adjacent segments
      if (i > 0) {
        s += `<circle cx="${pts[a].x.toFixed(1)}" cy="${pts[a].y.toFixed(1)}" r="${wA.toFixed(1)}"
              fill="${c.skin}" stroke="none"/>`;
      }

      // Knuckle crease at each joint (except fingertip)
      if (i < finger.length - 2) {
        s += `<line x1="${(pts[b].x + px * wB * 0.6).toFixed(1)}" y1="${(pts[b].y + py * wB * 0.6).toFixed(1)}"
                    x2="${(pts[b].x - px * wB * 0.6).toFixed(1)}" y2="${(pts[b].y - py * wB * 0.6).toFixed(1)}"
              stroke="${c.skinDk}" stroke-width="0.6" opacity="0.2"/>`;
      }
    }

    // Rounded fingertip
    const tip = finger[finger.length - 1];
    const prev = finger[finger.length - 2];
    const dx = pts[tip].x - pts[prev].x;
    const dy = pts[tip].y - pts[prev].y;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const tipW = widths[widths.length - 1] / 2;
    s += `<ellipse cx="${pts[tip].x.toFixed(1)}" cy="${pts[tip].y.toFixed(1)}"
          rx="${(tipW + 1).toFixed(1)}" ry="${tipW.toFixed(1)}"
          fill="${c.skin}" stroke="${c.skinDk}" stroke-width="0.5"
          transform="rotate(${angle.toFixed(1)},${pts[tip].x.toFixed(1)},${pts[tip].y.toFixed(1)})"/>`;

    // Fingernail on extended fingers (tiny crescent near tip)
    const segLen = Math.sqrt(dx * dx + dy * dy);
    if (segLen > 8) {
      const nx = dx / (segLen || 1), ny = dy / (segLen || 1);
      s += `<path d="M${(pts[tip].x - ny * tipW * 0.5).toFixed(1)},${(pts[tip].y + nx * tipW * 0.5).toFixed(1)}
                     Q${(pts[tip].x + nx * 3).toFixed(1)},${pts[tip].y.toFixed(1)}
                      ${(pts[tip].x + ny * tipW * 0.5).toFixed(1)},${(pts[tip].y - nx * tipW * 0.5).toFixed(1)}"
            stroke="${c.skinDk}" stroke-width="0.4" fill="none" opacity="0.2"/>`;
    }
  }

  // Wrist
  s += `<ellipse cx="${pts[0].x.toFixed(1)}" cy="${pts[0].y.toFixed(1)}" rx="10" ry="8"
        fill="${c.skin}" stroke="${c.skinDk}" stroke-width="0.5"/>`;

  s += '</g>';
  return s;
}

// --- Full body composite ---
// --- Face expression from landmark data ---
// face subset indices (matching camera.js FACE_KEY_INDICES order):
// 0-4: left brow, 5-9: right brow, 10-13: left eye, 14-17: right eye
// 18-20: nose, 21-28: mouth, 29-31: jaw
function facialExpressionSVG(c, faceData) {
  if (!faceData || faceData.length < 32) return '';
  let s = '';

  // Compute brow raise: avg y of brow relative to eye top
  const leftBrowY = (faceData[0][1] + faceData[1][1] + faceData[2][1] + faceData[3][1] + faceData[4][1]) / 5;
  const leftEyeTop = faceData[12][1];  // top of left eye
  const rightBrowY = (faceData[5][1] + faceData[6][1] + faceData[7][1] + faceData[8][1] + faceData[9][1]) / 5;
  const rightEyeTop = faceData[16][1]; // top of right eye

  // Brow raise offset (negative = raised): map to SVG offset
  const browRaise = ((leftBrowY - leftEyeTop) + (rightBrowY - rightEyeTop)) / 2;
  const browOffset = Math.max(-8, Math.min(4, browRaise * -80)); // pixels

  // Mouth opening: distance between top and bottom lip points
  const mouthTop = faceData[25];    // top inner lip
  const mouthBottom = faceData[26]; // bottom inner lip
  const mouthOpen = Math.abs(mouthTop[1] - mouthBottom[1]) * 400; // scale up
  const mouthWidth = Math.abs(faceData[21][0] - faceData[22][0]) * 300;

  // Animated eyebrows (override static ones)
  const isFemale = c.gender === 'female';
  const sw = isFemale ? 1.8 : 2.8;
  const baseY = isFemale ? 60 : 62;
  const y = baseY + browOffset;
  s += `<g class="eyebrows-animated">
    <path d="M166,${y} Q180,${y - 8} 192,${y + 1}" stroke="${c.brow}" stroke-width="${sw}" fill="none" stroke-linecap="round" opacity="${isFemale ? 0.5 : 0.65}"/>
    <path d="M208,${y + 1} Q220,${y - 8} 234,${y}" stroke="${c.brow}" stroke-width="${sw}" fill="none" stroke-linecap="round" opacity="${isFemale ? 0.5 : 0.65}"/>
  </g>`;

  // Animated mouth
  if (mouthOpen > 3) {
    const mw = Math.min(18, Math.max(10, mouthWidth));
    const mh = Math.min(10, Math.max(2, mouthOpen));
    s += `<ellipse cx="200" cy="${isFemale ? 132 : 130}" rx="${mw}" ry="${mh}"
          fill="${c.lipDk}" opacity="0.3"/>`;
  }

  return s;
}

function bodySVG(c, faceData) {
  const hasFace = faceData && faceData.length >= 32;
  return `
    <g class="avatar-body">
      ${pantsSVG(c)}
      ${beltSVG(c)}
      ${shirtSVG(c)}
      ${hairBackSVG(c)}
      ${neckSVG(c)}
      ${earsSVG(c)}
      ${headSVG(c)}
      ${hairSVG(c)}
      ${eyesSVG(c)}
      ${hasFace ? '' : eyebrowsSVG(c)}
      ${noseSVG(c)}
      ${hasFace ? '' : mouthSVG(c)}
      ${hasFace ? facialExpressionSVG(c, faceData) : ''}
    </g>`;
}

// --- State ---
let charId = 'meiling';
let container = null;
let seq = [], playing = false, paused = false;
let fi = 0, fAcc = 0, spd = 1;
let rafId = null, lastT = 0;
let prevFrame = null;  // holistic frame: {leftHand, rightHand, face}
let _onFrame = null, _onDone = null;

// --- Minimum-jerk trajectory (from Avatars.md research) ---
function minimumJerk(t) {
  return 10 * t * t * t - 15 * t * t * t * t + 6 * t * t * t * t * t;
}

// Interpolate a single hand landmark array
function _lerpHand(a, b, t) {
  if (!a) return b;
  if (!b) return a;
  return b.map((lm, i) => [
    a[i][0] * (1 - t) + lm[0] * t,
    a[i][1] * (1 - t) + lm[1] * t,
    (a[i][2] ?? 0) * (1 - t) + (lm[2] ?? 0) * t,
  ]);
}

// Interpolate a holistic frame
function lerpFrame(a, b, t) {
  if (!a) return b;
  return {
    leftHand: _lerpHand(a.leftHand, b.leftHand, t),
    rightHand: _lerpHand(a.rightHand, b.rightHand, t),
    face: _lerpHand(a.face, b.face, t),  // same lerp logic works for face points
  };
}

// --- Render (holistic frame) ---
function render(frame) {
  if (!container) return;
  const c = CHARS[charId];

  // Extract hands from frame (support legacy and holistic)
  let leftHand = null, rightHand = null, faceData = null;

  if (frame) {
    if (frame.leftHand || frame.rightHand) {
      // Holistic format
      leftHand = frame.leftHand;
      rightHand = frame.rightHand;
      faceData = frame.face;
    } else if (Array.isArray(frame) && frame.length >= 21) {
      // Legacy single-hand format
      rightHand = frame;
    }
  }

  // Compute face anchor for proportional mapping
  const faceAnchor = extractFaceAnchor(faceData);

  const leftWrist = leftHand ? lmToSVG(leftHand[0], faceAnchor) : null;
  const rightWrist = rightHand ? lmToSVG(rightHand[0], faceAnchor) : null;

  // Build arm + hand SVG
  let armHandSVG = '';
  armHandSVG += armSVG(c, 'L', leftWrist);
  armHandSVG += armSVG(c, 'R', rightWrist);

  // Render hands with face-relative positioning
  if (leftHand) {
    armHandSVG += handSVG(c, leftHand, faceAnchor);
  } else if (!rightHand) {
    armHandSVG += idleHandSVG(c, 'L');
  }

  if (rightHand) {
    armHandSVG += handSVG(c, rightHand, faceAnchor);
  } else if (!leftHand) {
    armHandSVG += idleHandSVG(c, 'R');
  }

  // Add idle hands when neither hand is detected
  if (!leftHand && !rightHand) {
    armHandSVG = armSVG(c, 'L', null) + armSVG(c, 'R', null) +
                 idleHandSVG(c, 'L') + idleHandSVG(c, 'R');
  }

  container.innerHTML = `
    <svg viewBox="0 0 400 520" xmlns="http://www.w3.org/2000/svg"
         style="width:100%;height:100%;display:block;">
      ${defsSVG(c)}
      ${backgroundSVG()}
      ${bodySVG(c, faceData)}
      ${armHandSVG}
      <text x="200" y="508" text-anchor="middle" fill="rgba(255,255,255,0.18)"
            font-family="Inter,system-ui,sans-serif" font-size="11" font-weight="600"
            letter-spacing="0.5">${c.name}</text>
    </svg>`;
}

// --- Animation with minimum-jerk sub-frame interpolation ---
function tick() {
  if (!playing || paused) return;
  const now = performance.now();
  const dt = (now - lastT) / 1000;
  lastT = now;
  fAcc += dt * 30 * spd;

  while (fAcc >= 1 && fi < seq.length - 1) {
    fi++;
    fAcc -= 1;
    if (_onFrame) _onFrame(fi, seq.length);
  }

  if (fi >= seq.length - 1) {
    prevFrame = seq[seq.length - 1];
    render(prevFrame);
    playing = false;
    if (_onDone) _onDone();
    return;
  }

  const t = Math.min(fAcc, 1);
  const eased = minimumJerk(t);
  const blended = lerpFrame(seq[fi], seq[fi + 1], eased);

  // Apply biomechanical finger constraints to both hands
  if (blended.leftHand) blended.leftHand = applyFingerConstraints(blended.leftHand);
  if (blended.rightHand) blended.rightHand = applyFingerConstraints(blended.rightHand);

  prevFrame = blended;
  render(blended);

  rafId = requestAnimationFrame(tick);
}

// --- Frame format helpers ---
// Normalize any frame to holistic format {leftHand, rightHand, face}
function _toHolisticFrame(fr) {
  if (!fr) return null;
  // Already holistic
  if (fr.leftHand !== undefined || fr.rightHand !== undefined) {
    return { leftHand: fr.leftHand || null, rightHand: fr.rightHand || null, face: fr.face || null };
  }
  // Legacy: array of 21 landmarks → treat as right hand (dominant)
  if (Array.isArray(fr) && fr.length >= 21) {
    // Check if it's wrapped: [[21 lms], ...]
    if (Array.isArray(fr[0]) && fr[0].length === 3) {
      return { leftHand: null, rightHand: fr, face: null };
    }
    // Maybe double-wrapped: [[[x,y,z],...21]]
    if (Array.isArray(fr[0]) && Array.isArray(fr[0][0]) && fr[0][0].length === 3 && fr[0].length >= 21) {
      return { leftHand: null, rightHand: fr[0], face: null };
    }
    return { leftHand: null, rightHand: fr, face: null };
  }
  return null;
}

// --- Public API ---
export function getCharacters() {
  return Object.entries(CHARS).map(([id, c]) => ({ id, name: c.name, gender: c.gender }));
}

export function setCharacter(id) {
  if (CHARS[id]) { charId = id; render(prevFrame); }
}

export function getCurrentCharacter() { return charId; }

export function initAvatar(el) {
  container = typeof el === 'string' ? document.getElementById(el) : el;
  render(null);
}

export function playSign(landmarks, speed = 1, onFrame = null, onDone = null) {
  // Parse frames: support both legacy and holistic formats
  seq = (landmarks || [])
    .map(fr => _toHolisticFrame(fr))
    .filter(f => f !== null && (f.leftHand || f.rightHand));

  if (!seq.length) return false;
  spd = speed;
  fi = 0; fAcc = 0;
  prevFrame = null;
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
  fi = 0; fAcc = 0; prevFrame = null;
  paused = false; playing = true;
  lastT = performance.now();
  if (rafId) cancelAnimationFrame(rafId);
  tick();
}

export function setSpeed(s) { spd = s; }
export function isPlaying() { return playing && !paused; }
export function getFrameInfo() { return { current: fi, total: seq.length }; }
