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
function lmToSVG(lm) {
  return { x: 60 + (1 - lm[0]) * 280, y: 150 + lm[1] * 310 };
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
      <!-- Collar -->
      <path d="M176,174 L183,198 L200,180 Z" fill="${c.shirtLt}"/>
      <path d="M224,174 L217,198 L200,180 Z" fill="${c.shirtLt}"/>
      <line x1="200" y1="180" x2="200" y2="260" stroke="${c.shirtDk}" stroke-width="1" opacity="0.1"/>
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
  const nw = isFemale ? 24 : 30;
  const nx = isFemale ? 188 : 185;
  return `
    <g class="neck">
      <rect x="${nx}" y="146" width="${nw}" height="34" rx="12" fill="${c.skin}"/>
      <ellipse cx="200" cy="150" rx="${isFemale ? 15 : 18}" ry="5" fill="${c.skinDk}" opacity="0.12"/>
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
  return `
    <g class="hair-back">
      <path d="M134,52
               C134,14 166,-8 200,-8
               C234,-8 266,14 266,52
               L268,140 L266,185
               Q264,206 252,216
               Q234,228 200,230
               Q166,228 148,216
               Q136,206 134,185
               L132,140 Z"
            fill="${c.hair}"/>
      <path d="M140,130 Q138,170 142,210" stroke="${c.hairHi}" stroke-width="0.6" fill="none" opacity="0.05"/>
      <path d="M260,130 Q262,170 258,210" stroke="${c.hairHi}" stroke-width="0.6" fill="none" opacity="0.05"/>
    </g>`;
}

function hairSVG(c) {
  if (c.gender === 'female') {
    return `
      <g class="hair">
        <path d="M146,52
                 C148,14 174,-6 200,-8
                 C226,-6 252,14 254,52
                 Q252,28 232,14 Q216,2 200,0
                 Q184,2 168,14 Q148,28 146,52 Z"
              fill="${c.hair}"/>
        <!-- Side curtains to ear level -->
        <path d="M146,52 C144,68 141,82 139,100 Q138,110 140,118
                 L148,115 Q149,105 150,92 C150,78 151,66 150,52 Z"
              fill="${c.hair}"/>
        <path d="M254,52 C256,68 259,82 261,100 Q262,110 260,118
                 L252,115 Q251,105 250,92 C250,78 249,66 250,52 Z"
              fill="${c.hair}"/>
        <!-- Loose strands bridging to back hair -->
        <path d="M140,105 Q138,130 140,155" stroke="${c.hair}" stroke-width="3.5" fill="none" stroke-linecap="round" opacity="0.7"/>
        <path d="M260,105 Q262,130 260,155" stroke="${c.hair}" stroke-width="3.5" fill="none" stroke-linecap="round" opacity="0.7"/>
        <path d="M142,108 Q140,128 142,148" stroke="${c.hair}" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.4"/>
        <path d="M258,108 Q260,128 258,148" stroke="${c.hair}" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.4"/>
        <!-- Bangs -->
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
  const rx = isFemale ? 12 : 11;
  const ry = isFemale ? 10 : 9;
  const irisR = isFemale ? 9 : 8;   // large relative to eye
  const pupilR = isFemale ? 4 : 3.5;

  let lashes = '';
  if (isFemale) {
    lashes = `
      <path d="M${180 - rx + 2},${84 - ry + 3} Q${180 - rx - 1},${84 - ry - 3} ${180 - rx - 1},${84 - ry - 6}"
            stroke="${c.brow}" stroke-width="1" fill="none" stroke-linecap="round" opacity="0.35"/>
      <path d="M${180 - rx / 2},${84 - ry + 1} Q${180 - rx / 2 - 1},${84 - ry - 3} ${180 - rx / 2},${84 - ry - 5}"
            stroke="${c.brow}" stroke-width="0.8" fill="none" stroke-linecap="round" opacity="0.25"/>
      <path d="M${220 + rx - 2},${84 - ry + 3} Q${220 + rx + 1},${84 - ry - 3} ${220 + rx + 1},${84 - ry - 6}"
            stroke="${c.brow}" stroke-width="1" fill="none" stroke-linecap="round" opacity="0.35"/>
      <path d="M${220 + rx / 2},${84 - ry + 1} Q${220 + rx / 2 + 1},${84 - ry - 3} ${220 + rx / 2},${84 - ry - 5}"
            stroke="${c.brow}" stroke-width="0.8" fill="none" stroke-linecap="round" opacity="0.25"/>
    `;
  }

  return `
    <g class="eyes">
      ${lashes}
      <!-- Left eye: white → iris → pupil → highlight → lid -->
      <ellipse cx="180" cy="84" rx="${rx}" ry="${ry}" fill="white"/>
      <circle cx="181" cy="85" r="${irisR}" fill="url(#iris-grad-l)"/>
      <circle cx="181" cy="85" r="${pupilR}" fill="#111"/>
      <circle cx="184" cy="82" r="2.5" fill="white" opacity="0.9"/>
      <path d="M${180 - rx + 1},${84 - ry + 3} Q180,${84 - ry - 1} ${180 + rx - 1},${84 - ry + 3}"
            stroke="${c.skinDk}" stroke-width="${isFemale ? 2 : 1.6}" fill="none" opacity="0.3"/>

      <!-- Right eye -->
      <ellipse cx="220" cy="84" rx="${rx}" ry="${ry}" fill="white"/>
      <circle cx="219" cy="85" r="${irisR}" fill="url(#iris-grad-r)"/>
      <circle cx="219" cy="85" r="${pupilR}" fill="#111"/>
      <circle cx="222" cy="82" r="2.5" fill="white" opacity="0.9"/>
      <path d="M${220 - rx + 1},${84 - ry + 3} Q220,${84 - ry - 1} ${220 + rx - 1},${84 - ry + 3}"
            stroke="${c.skinDk}" stroke-width="${isFemale ? 2 : 1.6}" fill="none" opacity="0.3"/>
    </g>`;
}

function eyebrowsSVG(c) {
  const isFemale = c.gender === 'female';
  const sw = isFemale ? 2.5 : 4.5;
  const archL = isFemale
    ? 'M164,65 Q180,54 194,64'
    : 'M163,68 Q179,58 195,68';
  const archR = isFemale
    ? 'M206,64 Q220,54 236,65'
    : 'M205,68 Q221,58 237,68';
  return `
    <g class="eyebrows">
      <path d="${archL}" stroke="${c.brow}" stroke-width="${sw}" fill="none" stroke-linecap="round"/>
      <path d="${archR}" stroke="${c.brow}" stroke-width="${sw}" fill="none" stroke-linecap="round"/>
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

// --- Arms: natural two-segment (upper arm + forearm) ---
function armSVG(c, side, wristPt) {
  const sx = side === 'L' ? 115 : 285;
  const sy = 244;
  const sDir = side === 'L' ? -1 : 1;

  if (!wristPt) {
    const elbowX = side === 'L' ? 120 : 280;
    const elbowY = 295;
    const handX = side === 'L' ? 168 : 232;
    const handY = 305;

    return `
      <g class="arm-${side}">
        <path d="M${sx},${sy} Q${sx},${(sy + elbowY) / 2} ${elbowX},${elbowY}"
              stroke="${c.skin}" stroke-width="22" fill="none" stroke-linecap="round"/>
        <path d="M${sx},${sy} Q${sx},${(sy + elbowY) / 2} ${elbowX},${elbowY}"
              stroke="${c.skinDk}" stroke-width="22" fill="none" stroke-linecap="round" opacity="0.06"/>
        <path d="M${elbowX},${elbowY} Q${(elbowX + handX) / 2},${(elbowY + handY) / 2 + 2} ${handX},${handY}"
              stroke="${c.skin}" stroke-width="18" fill="none" stroke-linecap="round"/>
        <path d="M${elbowX},${elbowY} Q${(elbowX + handX) / 2},${(elbowY + handY) / 2 + 2} ${handX},${handY}"
              stroke="${c.skinDk}" stroke-width="18" fill="none" stroke-linecap="round" opacity="0.04"/>
      </g>`;
  }

  // Animated: natural elbow calculation
  const elbowT = 0.45;
  const elbowBias = sDir * 12;
  const elbowX = sx + (wristPt.x - sx) * elbowT + elbowBias;
  const elbowY = Math.max(sy + 10, sy + (wristPt.y - sy) * elbowT);

  return `
    <g class="arm-${side}">
      <path d="M${sx},${sy} Q${sx + sDir * 2},${(sy + elbowY) / 2} ${elbowX},${elbowY}"
            stroke="${c.skin}" stroke-width="22" fill="none" stroke-linecap="round"/>
      <path d="M${sx},${sy} Q${sx + sDir * 2},${(sy + elbowY) / 2} ${elbowX},${elbowY}"
            stroke="${c.skinDk}" stroke-width="22" fill="none" stroke-linecap="round" opacity="0.06"/>
      <path d="M${elbowX},${elbowY} Q${(elbowX + wristPt.x) / 2 - elbowBias * 0.3},${(elbowY + wristPt.y) / 2} ${wristPt.x},${wristPt.y}"
            stroke="${c.skin}" stroke-width="18" fill="none" stroke-linecap="round"/>
      <path d="M${elbowX},${elbowY} Q${(elbowX + wristPt.x) / 2 - elbowBias * 0.3},${(elbowY + wristPt.y) / 2} ${wristPt.x},${wristPt.y}"
            stroke="${c.skinDk}" stroke-width="18" fill="none" stroke-linecap="round" opacity="0.04"/>
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

// --- Animated hand: fleshy, oriented fingertips ---
function handSVG(c, landmarks) {
  if (!landmarks || landmarks.length < 21) return '';
  const pts = landmarks.map(lm => lmToSVG(lm));
  let s = '';

  // Palm
  const palmIdx = [0, 1, 5, 9, 13, 17];
  const palmPath = palmIdx.map((i, idx) =>
    `${idx === 0 ? 'M' : 'L'}${pts[i].x},${pts[i].y}`
  ).join(' ') + ' Z';
  s += `<path d="${palmPath}" fill="${c.skin}" opacity="0.95"/>`;

  // Fingers — fleshy tapered segments
  for (const finger of FINGERS) {
    for (let i = 0; i < finger.length - 1; i++) {
      const a = finger[i], b = finger[i + 1];
      const w = i === 0 ? 12 : (i === 1 ? 10 : 8);
      s += `<line x1="${pts[a].x}" y1="${pts[a].y}" x2="${pts[b].x}" y2="${pts[b].y}"
            stroke="${c.skin}" stroke-width="${w}" stroke-linecap="round"/>`;
    }
    // Oriented fingertip pad
    const tip = finger[finger.length - 1];
    const prev = finger[finger.length - 2];
    const dx = pts[tip].x - pts[prev].x;
    const dy = pts[tip].y - pts[prev].y;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    s += `<ellipse cx="${pts[tip].x}" cy="${pts[tip].y}" rx="5" ry="3.5"
          fill="${c.skin}" transform="rotate(${angle},${pts[tip].x},${pts[tip].y})"/>`;
  }

  // Wrist
  s += `<ellipse cx="${pts[0].x}" cy="${pts[0].y}" rx="10" ry="8" fill="${c.skin}"/>`;

  return s;
}

// --- Full body composite ---
function bodySVG(c) {
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

// --- Minimum-jerk trajectory (from Avatars.md research) ---
// 5th-order polynomial: creates bell-shaped velocity profile
// for natural-looking acceleration/deceleration.
function minimumJerk(t) {
  return 10 * t * t * t - 15 * t * t * t * t + 6 * t * t * t * t * t;
}

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
      ${backgroundSVG()}
      ${bodySVG(c)}
      ${hasHands
        ? `${armSVG(c, 'L', wrist)}${armSVG(c, 'R', null)}${handSVG(c, landmarks)}`
        : `${armSVG(c, 'L', null)}${armSVG(c, 'R', null)}${idleHandSVG(c, 'L')}${idleHandSVG(c, 'R')}`
      }
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

  // Advance frame index
  while (fAcc >= 1 && fi < seq.length - 1) {
    fi++;
    fAcc -= 1;
    if (_onFrame) _onFrame(fi, seq.length);
  }

  if (fi >= seq.length - 1) {
    prevLandmarks = seq[seq.length - 1];
    render(prevLandmarks);
    playing = false;
    if (_onDone) _onDone();
    return;
  }

  // Sub-frame interpolation with minimum-jerk easing
  const t = Math.min(fAcc, 1);
  const eased = minimumJerk(t);
  const blended = lerpPose(seq[fi], seq[fi + 1], eased);

  // Apply biomechanical finger constraints
  const constrained = applyFingerConstraints(blended);
  prevLandmarks = constrained;
  render(constrained);

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
