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
    skin: '#C68642', skinLt: '#D9A867', skinDk: '#8B5E34', skinMid: '#B5753A',
    hair: '#1A1A2E', hairHi: '#2E2E48',
    shirt: '#2D6A4F', shirtLt: '#40916C', shirtDk: '#1B4332',
    pants: '#2B2B42', pantsDk: '#1A1A2E',
    belt: '#3A3028', beltBuckle: '#C4A35A',
    iris: '#3E2723', irisRing: '#5D4037',
    lip: '#9E6B4A', lipDk: '#7A503A',
    brow: '#1A1A2E',
    cheek: '#D4915A',
  },
  meiling: {
    name: 'Mei Ling', gender: 'female',
    skin: '#F0C2A0', skinLt: '#FADCC8', skinDk: '#C99B78', skinMid: '#E8B494',
    hair: '#1A1A2E', hairHi: '#2E2E48',
    shirt: '#7C3AED', shirtLt: '#9F67FF', shirtDk: '#5B21B6',
    pants: '#2B2B42', pantsDk: '#1A1A2E',
    belt: '#3A3028', beltBuckle: '#C4A35A',
    iris: '#2C1810', irisRing: '#4A332A',
    lip: '#D4847A', lipDk: '#B86B68',
    brow: '#222240',
    cheek: '#F0A8A0',
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
      <radialGradient id="av-bg" cx="50%" cy="20%" r="80%">
        <stop offset="0%" stop-color="#252850"/>
        <stop offset="100%" stop-color="#13152a"/>
      </radialGradient>
      <radialGradient id="face-grad" cx="42%" cy="35%" r="60%">
        <stop offset="0%" stop-color="${c.skinLt}" stop-opacity="0.5"/>
        <stop offset="70%" stop-color="${c.skin}" stop-opacity="0"/>
        <stop offset="100%" stop-color="${c.skinDk}" stop-opacity="0.2"/>
      </radialGradient>
      <radialGradient id="cheek-l" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${c.cheek}" stop-opacity="0.2"/>
        <stop offset="100%" stop-color="${c.cheek}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="cheek-r" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${c.cheek}" stop-opacity="0.2"/>
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
      <radialGradient id="eye-white-l" cx="45%" cy="40%" r="55%">
        <stop offset="0%" stop-color="#FFFFFF"/>
        <stop offset="100%" stop-color="#F0F0F0"/>
      </radialGradient>
      <radialGradient id="eye-white-r" cx="55%" cy="40%" r="55%">
        <stop offset="0%" stop-color="#FFFFFF"/>
        <stop offset="100%" stop-color="#F0F0F0"/>
      </radialGradient>
      <radialGradient id="iris-grad-l" cx="48%" cy="40%" r="50%">
        <stop offset="0%" stop-color="${c.irisRing}"/>
        <stop offset="60%" stop-color="${c.iris}"/>
        <stop offset="100%" stop-color="#0D0D0D"/>
      </radialGradient>
      <radialGradient id="iris-grad-r" cx="52%" cy="40%" r="50%">
        <stop offset="0%" stop-color="${c.irisRing}"/>
        <stop offset="60%" stop-color="${c.iris}"/>
        <stop offset="100%" stop-color="#0D0D0D"/>
      </radialGradient>
      <filter id="soft-shadow" x="-10%" y="-10%" width="130%" height="130%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="blur"/>
        <feOffset in="blur" dx="2" dy="3" result="off"/>
        <feFlood flood-color="#000" flood-opacity="0.12" result="color"/>
        <feComposite in="color" in2="off" operator="in" result="shadow"/>
        <feMerge>
          <feMergeNode in="shadow"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      <filter id="inner-shadow" x="-5%" y="-5%" width="115%" height="115%">
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

function pantsSVG(c) {
  return `
    <g class="pants">
      <!-- Left leg -->
      <path d="M136,350 L130,520 L196,520 L200,360 Z" fill="url(#pants-grad)"/>
      <!-- Right leg -->
      <path d="M200,360 L204,520 L270,520 L264,350 Z" fill="url(#pants-grad)"/>
      <!-- Center seam -->
      <line x1="200" y1="358" x2="200" y2="520" stroke="${c.pantsDk}" stroke-width="1.5" opacity="0.2"/>
      <!-- Crease lines -->
      <path d="M163,400 L163,500" stroke="${c.pantsDk}" stroke-width="0.8" opacity="0.08"/>
      <path d="M237,400 L237,500" stroke="${c.pantsDk}" stroke-width="0.8" opacity="0.08"/>
      <!-- Waistband shadow -->
      <path d="M136,350 Q200,356 264,350 Q200,362 136,350 Z" fill="${c.pantsDk}" opacity="0.15"/>
    </g>`;
}

function beltSVG(c) {
  return `
    <g class="belt">
      <rect x="132" y="340" width="136" height="14" rx="3" fill="${c.belt}"/>
      <!-- Belt texture lines -->
      <line x1="140" y1="347" x2="185" y2="347" stroke="#000" stroke-width="0.4" opacity="0.08"/>
      <line x1="215" y1="347" x2="260" y2="347" stroke="#000" stroke-width="0.4" opacity="0.08"/>
      <!-- Buckle -->
      <rect x="189" y="339" width="22" height="16" rx="3" fill="${c.beltBuckle}"/>
      <rect x="192" y="342" width="16" height="10" rx="2" fill="none"
            stroke="${c.belt}" stroke-width="1.5"/>
      <!-- Prong -->
      <line x1="200" y1="340" x2="200" y2="354" stroke="${c.belt}" stroke-width="1.2"/>
      <!-- Buckle highlight -->
      <rect x="190" y="340" width="8" height="2" rx="1" fill="white" opacity="0.2"/>
    </g>`;
}

function shirtSVG(c) {
  return `
    <g class="shirt">
      <!-- Main torso -->
      <path d="M120,200 Q120,184 200,176 Q280,184 280,200 L268,342 L132,342 Z"
            fill="url(#shirt-grad)"/>

      <!-- Side shading left -->
      <path d="M120,200 L132,342 L155,342 L140,200 Z" fill="url(#shirt-side-l)" opacity="0.4"/>
      <!-- Side shading right -->
      <path d="M280,200 L268,342 L245,342 L260,200 Z" fill="url(#shirt-side-r)" opacity="0.4"/>

      <!-- Subtle fold lines -->
      <path d="M165,220 Q168,270 162,330" stroke="${c.shirtDk}" stroke-width="0.7" fill="none" opacity="0.08"/>
      <path d="M235,220 Q232,270 238,330" stroke="${c.shirtDk}" stroke-width="0.7" fill="none" opacity="0.08"/>

      <!-- Collar shadow on shirt -->
      <path d="M172,178 Q200,186 228,178 Q200,192 172,178 Z"
            fill="${c.shirtDk}" opacity="0.2"/>

      <!-- Left collar flap -->
      <path d="M178,176 L184,198 L200,182 Z" fill="${c.shirtLt}"/>
      <path d="M178,176 L184,198 L200,182 Z" fill="none"
            stroke="${c.shirtDk}" stroke-width="0.6" opacity="0.25"/>
      <path d="M180,178 L185,192" stroke="white" stroke-width="0.5" opacity="0.12"/>

      <!-- Right collar flap -->
      <path d="M222,176 L216,198 L200,182 Z" fill="${c.shirtLt}"/>
      <path d="M222,176 L216,198 L200,182 Z" fill="none"
            stroke="${c.shirtDk}" stroke-width="0.6" opacity="0.25"/>
      <path d="M220,178 L215,192" stroke="white" stroke-width="0.5" opacity="0.12"/>

      <!-- Placket line -->
      <line x1="200" y1="182" x2="200" y2="262" stroke="${c.shirtDk}" stroke-width="1" opacity="0.12"/>

      <!-- Buttons with stitch detail -->
      ${[202, 224, 246].map(y => `
        <circle cx="200" cy="${y}" r="3.2" fill="${c.shirtLt}" stroke="${c.shirtDk}" stroke-width="0.6" opacity="0.65"/>
        <line x1="198" y1="${y}" x2="202" y2="${y}" stroke="${c.shirtDk}" stroke-width="0.3" opacity="0.3"/>
        <line x1="200" y1="${y - 2}" x2="200" y2="${y + 2}" stroke="${c.shirtDk}" stroke-width="0.3" opacity="0.3"/>
      `).join('')}

      <!-- Left sleeve -->
      <path d="M120,200 Q106,214 100,242 L138,242 Q130,218 130,200 Z" fill="${c.shirt}"/>
      <path d="M120,200 Q106,214 100,242 L112,242 Q116,218 120,205 Z" fill="${c.shirtDk}" opacity="0.15"/>
      <path d="M100,240 Q119,246 138,240" stroke="${c.shirtDk}" stroke-width="1.8" fill="none" opacity="0.18"/>
      <path d="M132,200 Q126,208 122,218" stroke="${c.shirtDk}" stroke-width="0.8" fill="none" opacity="0.12"/>

      <!-- Right sleeve -->
      <path d="M280,200 Q294,214 300,242 L262,242 Q270,218 270,200 Z" fill="${c.shirt}"/>
      <path d="M280,200 Q294,214 300,242 L288,242 Q284,218 280,205 Z" fill="${c.shirtDk}" opacity="0.15"/>
      <path d="M262,240 Q281,246 300,240" stroke="${c.shirtDk}" stroke-width="1.8" fill="none" opacity="0.18"/>
      <path d="M268,200 Q274,208 278,218" stroke="${c.shirtDk}" stroke-width="0.8" fill="none" opacity="0.12"/>
    </g>`;
}

function neckSVG(c) {
  return `
    <g class="neck">
      <rect x="186" y="148" width="28" height="32" rx="11" fill="${c.skin}"/>
      <rect x="186" y="148" width="14" height="28" rx="7" fill="${c.skinDk}" opacity="0.06"/>
      <ellipse cx="202" cy="160" rx="4" ry="8" fill="${c.skinLt}" opacity="0.12"/>
      <ellipse cx="200" cy="152" rx="20" ry="6" fill="${c.skinDk}" opacity="0.18"/>
      <ellipse cx="200" cy="176" rx="18" ry="4" fill="${c.skinDk}" opacity="0.1"/>
    </g>`;
}

function headSVG(c) {
  const isMale = c.gender === 'male';
  const jaw = isMale
    ? `C218,150 210,158 200,160 C190,158 182,150 170,142`
    : `C216,152 210,160 200,162 C190,160 184,152 172,142`;
  const chinY = isMale ? 160 : 162;
  return `
    <g class="head">
      <ellipse cx="200" cy="158" rx="40" ry="6" fill="#000" opacity="0.06"/>
      <path d="M200,18
               C238,18 254,46 254,80
               C254,110 244,130 230,142
               ${jaw}
               C156,130 146,110 146,80
               C146,46 162,18 200,18 Z"
            fill="${c.skin}" filter="url(#inner-shadow)"/>
      <path d="M200,22
               C230,22 246,44 248,70
               C248,58 236,30 200,26
               C164,30 152,58 152,70
               C154,44 170,22 200,22 Z"
            fill="${c.skinLt}" opacity="0.2"/>
      <path d="M200,18
               C238,18 254,46 254,80
               C254,110 244,130 230,142
               ${jaw}
               C156,130 146,110 146,80
               C146,46 162,18 200,18 Z"
            fill="url(#face-grad)"/>
      <path d="M166,132 Q183,142 200,${chinY} Q217,142 234,132
               Q226,148 200,${chinY + 4} Q174,148 166,132 Z"
            fill="${c.skinDk}" opacity="0.08"/>
      <ellipse cx="168" cy="108" rx="14" ry="10" fill="url(#cheek-l)"/>
      <ellipse cx="232" cy="108" rx="14" ry="10" fill="url(#cheek-r)"/>
      <path d="M168,140 C156,128 148,108 148,80"
            stroke="${c.skinDk}" stroke-width="0.8" fill="none" opacity="0.06"/>
      <path d="M232,140 C244,128 252,108 252,80"
            stroke="${c.skinDk}" stroke-width="0.8" fill="none" opacity="0.06"/>
    </g>`;
}

function earsSVG(c) {
  return `
    <g class="ears">
      <ellipse cx="147" cy="88" rx="11" ry="15" fill="${c.skin}"/>
      <ellipse cx="147" cy="88" rx="11" ry="15" fill="${c.skinDk}" opacity="0.06"/>
      <ellipse cx="149" cy="88" rx="7" ry="11" fill="${c.skinDk}" opacity="0.08"/>
      <path d="M146,78 Q152,84 151,94 Q149,98 147,100"
            stroke="${c.skinDk}" stroke-width="1" fill="none" opacity="0.15"/>
      <ellipse cx="148" cy="98" rx="4" ry="4" fill="${c.skinLt}" opacity="0.1"/>
      <ellipse cx="253" cy="88" rx="11" ry="15" fill="${c.skin}"/>
      <ellipse cx="253" cy="88" rx="11" ry="15" fill="${c.skinDk}" opacity="0.06"/>
      <ellipse cx="251" cy="88" rx="7" ry="11" fill="${c.skinDk}" opacity="0.08"/>
      <path d="M254,78 Q248,84 249,94 Q251,98 253,100"
            stroke="${c.skinDk}" stroke-width="1" fill="none" opacity="0.15"/>
      <ellipse cx="252" cy="98" rx="4" ry="4" fill="${c.skinLt}" opacity="0.1"/>
    </g>`;
}

function hairSVG(c) {
  if (c.gender === 'female') {
    return `
      <g class="hair">
        <path d="M142,70
                 C142,28 168,4 200,2
                 C232,4 258,28 258,70
                 L260,120 L252,140
                 L248,100 L248,70
                 Q248,36 200,14
                 Q152,36 152,70
                 L152,100 L148,140
                 L140,120 Z"
              fill="${c.hair}"/>
        <path d="M148,70 L144,140 Q140,155 136,165
                 Q134,155 138,130 L142,90 Z"
              fill="${c.hair}"/>
        <path d="M252,70 L256,140 Q260,155 264,165
                 Q266,155 262,130 L258,90 Z"
              fill="${c.hair}"/>
        <path d="M153,60
                 C154,26 174,6 200,4
                 C226,6 246,26 247,60
                 Q244,38 228,24
                 Q212,12 200,10
                 Q188,12 172,24
                 Q156,38 153,60 Z"
              fill="${c.hair}"/>
        <path d="M158,52 Q164,34 185,26 Q175,38 170,56 Z" fill="${c.hair}"/>
        <path d="M168,48 Q178,32 200,24 Q188,36 182,54 Z" fill="${c.hair}"/>
        <path d="M178,50 Q190,34 210,28 Q198,40 192,55 Z" fill="${c.hair}"/>
        <path d="M175,20 Q190,12 210,16 Q195,18 180,26"
              fill="${c.hairHi}" opacity="0.3"/>
        <path d="M168,32 Q180,22 195,20" stroke="${c.hairHi}"
              stroke-width="1.5" fill="none" opacity="0.15"/>
        <path d="M144,105 Q146,85 152,70" stroke="${c.hairHi}" stroke-width="0.7" fill="none" opacity="0.1"/>
        <path d="M256,105 Q254,85 248,70" stroke="${c.hairHi}" stroke-width="0.7" fill="none" opacity="0.1"/>
      </g>`;
  }

  return `
    <g class="hair">
      <path d="M148,74
               C148,32 170,10 200,8
               C230,10 252,32 252,74
               Q252,52 240,36
               Q226,18 200,14
               Q174,18 160,36
               Q148,52 148,74 Z"
            fill="${c.hair}"/>
      <path d="M154,58
               C156,28 176,8 200,6
               C224,8 244,28 246,58
               Q242,38 228,26
               Q212,14 200,12
               Q188,14 172,26
               Q158,38 154,58 Z"
            fill="${c.hair}"/>
      <path d="M172,28 Q186,16 200,12 Q194,20 184,30"
            fill="${c.hairHi}" opacity="0.15"/>
      <path d="M178,18 Q192,10 212,14 Q198,14 184,22"
            fill="${c.hairHi}" opacity="0.25"/>
      <path d="M170,32 Q185,20 200,16" stroke="${c.hairHi}" stroke-width="0.8" fill="none" opacity="0.12"/>
      <path d="M230,32 Q215,20 200,16" stroke="${c.hairHi}" stroke-width="0.8" fill="none" opacity="0.08"/>
      <path d="M150,72 L149,82" stroke="${c.hair}" stroke-width="3" stroke-linecap="round" opacity="0.6"/>
      <path d="M250,72 L251,82" stroke="${c.hair}" stroke-width="3" stroke-linecap="round" opacity="0.6"/>
    </g>`;
}

function eyesSVG(c) {
  const isFemale = c.gender === 'female';
  const rx = isFemale ? 13 : 12;
  const ry = isFemale ? 11 : 10;
  const irisR = isFemale ? 6.5 : 6;
  const pupilR = isFemale ? 3.5 : 3.2;

  let lashes = '';
  if (isFemale) {
    lashes = `
      <path d="M167,76 L164,72" stroke="${c.brow}" stroke-width="1.2" stroke-linecap="round" opacity="0.5"/>
      <path d="M172,74 L170,69" stroke="${c.brow}" stroke-width="1.2" stroke-linecap="round" opacity="0.5"/>
      <path d="M178,73 L178,68" stroke="${c.brow}" stroke-width="1" stroke-linecap="round" opacity="0.4"/>
      <path d="M184,73 L185,68" stroke="${c.brow}" stroke-width="1" stroke-linecap="round" opacity="0.35"/>
      <path d="M189,75 L192,71" stroke="${c.brow}" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
      <path d="M211,75 L208,71" stroke="${c.brow}" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
      <path d="M216,73 L215,68" stroke="${c.brow}" stroke-width="1" stroke-linecap="round" opacity="0.35"/>
      <path d="M222,73 L222,68" stroke="${c.brow}" stroke-width="1" stroke-linecap="round" opacity="0.4"/>
      <path d="M228,74 L230,69" stroke="${c.brow}" stroke-width="1.2" stroke-linecap="round" opacity="0.5"/>
      <path d="M233,76 L236,72" stroke="${c.brow}" stroke-width="1.2" stroke-linecap="round" opacity="0.5"/>
    `;
  }

  return `
    <g class="eyes">
      ${lashes}
      <ellipse cx="180" cy="84" rx="${rx + 2}" ry="${ry + 1}" fill="${c.skinDk}" opacity="0.04"/>
      <ellipse cx="180" cy="84" rx="${rx}" ry="${ry}" fill="url(#eye-white-l)"/>
      <ellipse cx="180" cy="84" rx="${rx}" ry="${ry}" fill="none"
               stroke="${c.skinDk}" stroke-width="0.8" opacity="0.15"/>
      <circle cx="181" cy="85" r="${irisR}" fill="url(#iris-grad-l)"/>
      <circle cx="181" cy="85" r="${irisR}" fill="none" stroke="${c.iris}" stroke-width="0.5" opacity="0.3"/>
      <circle cx="181" cy="85" r="${pupilR}" fill="#0D0D0D"/>
      <circle cx="184" cy="82" r="2.2" fill="white" opacity="0.92"/>
      <circle cx="178" cy="87" r="1.2" fill="white" opacity="0.35"/>
      <path d="M${180 - rx},${84 - ry + 4} Q180,${84 - ry - 2} ${180 + rx},${84 - ry + 4}"
            stroke="${c.skinDk}" stroke-width="${isFemale ? 2 : 1.8}" fill="none" opacity="${isFemale ? 0.4 : 0.3}"/>
      <path d="M${180 - rx + 2},${84 + ry - 2} Q180,${84 + ry + 1} ${180 + rx - 2},${84 + ry - 2}"
            stroke="${c.skinDk}" stroke-width="0.5" fill="none" opacity="0.08"/>
      <ellipse cx="220" cy="84" rx="${rx + 2}" ry="${ry + 1}" fill="${c.skinDk}" opacity="0.04"/>
      <ellipse cx="220" cy="84" rx="${rx}" ry="${ry}" fill="url(#eye-white-r)"/>
      <ellipse cx="220" cy="84" rx="${rx}" ry="${ry}" fill="none"
               stroke="${c.skinDk}" stroke-width="0.8" opacity="0.15"/>
      <circle cx="219" cy="85" r="${irisR}" fill="url(#iris-grad-r)"/>
      <circle cx="219" cy="85" r="${irisR}" fill="none" stroke="${c.iris}" stroke-width="0.5" opacity="0.3"/>
      <circle cx="219" cy="85" r="${pupilR}" fill="#0D0D0D"/>
      <circle cx="222" cy="82" r="2.2" fill="white" opacity="0.92"/>
      <circle cx="216" cy="87" r="1.2" fill="white" opacity="0.35"/>
      <path d="M${220 - rx},${84 - ry + 4} Q220,${84 - ry - 2} ${220 + rx},${84 - ry + 4}"
            stroke="${c.skinDk}" stroke-width="${isFemale ? 2 : 1.8}" fill="none" opacity="${isFemale ? 0.4 : 0.3}"/>
      <path d="M${220 - rx + 2},${84 + ry - 2} Q220,${84 + ry + 1} ${220 + rx - 2},${84 + ry - 2}"
            stroke="${c.skinDk}" stroke-width="0.5" fill="none" opacity="0.08"/>
    </g>`;
}

function eyebrowsSVG(c) {
  const isFemale = c.gender === 'female';
  const sw = isFemale ? 3.2 : 5;
  const archL = isFemale
    ? 'M164,66 Q179,56 194,65'
    : 'M164,68 Q179,59 194,68';
  const archR = isFemale
    ? 'M206,65 Q221,56 236,66'
    : 'M206,68 Q221,59 236,68';

  return `
    <g class="eyebrows">
      <path d="${archL}" stroke="${c.brow}" stroke-width="${sw}" fill="none" stroke-linecap="round"/>
      <path d="${archR}" stroke="${c.brow}" stroke-width="${sw}" fill="none" stroke-linecap="round"/>
      ${!isFemale ? `
        <path d="${archL}" stroke="${c.brow}" stroke-width="1" fill="none" opacity="0.2"
              stroke-dasharray="2,3" stroke-linecap="round"/>
        <path d="${archR}" stroke="${c.brow}" stroke-width="1" fill="none" opacity="0.2"
              stroke-dasharray="2,3" stroke-linecap="round"/>
      ` : ''}
    </g>`;
}

function noseSVG(c) {
  return `
    <g class="nose">
      <path d="M198,86 Q195,98 195,108"
            stroke="${c.skinDk}" stroke-width="1.2" fill="none" opacity="0.15"/>
      <path d="M202,86 Q205,98 205,108"
            stroke="${c.skinDk}" stroke-width="0.6" fill="none" opacity="0.06"/>
      <ellipse cx="200" cy="110" rx="9" ry="6" fill="${c.skin}"/>
      <ellipse cx="200" cy="110" rx="9" ry="6" fill="${c.skinDk}" opacity="0.06"/>
      <ellipse cx="201" cy="107" rx="3.5" ry="2.5" fill="${c.skinLt}" opacity="0.22"/>
      <path d="M192,112 Q200,118 208,112"
            stroke="${c.skinDk}" stroke-width="1.6" fill="none" opacity="0.22" stroke-linecap="round"/>
      <ellipse cx="194" cy="112" rx="2.5" ry="1.8" fill="${c.skinDk}" opacity="0.12"/>
      <ellipse cx="206" cy="112" rx="2.5" ry="1.8" fill="${c.skinDk}" opacity="0.12"/>
    </g>`;
}

function mouthSVG(c) {
  const isFemale = c.gender === 'female';
  return `
    <g class="mouth">
      <path d="M186,126 Q193,122 200,124 Q207,122 214,126"
            stroke="${c.lipDk}" stroke-width="${isFemale ? 1.8 : 1.5}" fill="none" opacity="${isFemale ? 0.5 : 0.35}"/>
      <path d="M193,124 L200,122 L207,124" stroke="${c.lipDk}" stroke-width="0.8" fill="none" opacity="0.15"/>
      <path d="M188,126 Q200,136 212,126"
            fill="${c.lip}" opacity="${isFemale ? 0.2 : 0.1}"/>
      <path d="M186,126 Q200,135 214,126"
            stroke="${c.lipDk}" stroke-width="1.8" fill="none" stroke-linecap="round" opacity="0.3"/>
      <path d="M194,130 Q200,133 206,130"
            fill="${c.skinLt}" opacity="0.08"/>
      <path d="M184,125 Q183,128 184,131" stroke="${c.skinDk}" stroke-width="0.7" fill="none" opacity="0.08"/>
      <path d="M216,125 Q217,128 216,131" stroke="${c.skinDk}" stroke-width="0.7" fill="none" opacity="0.08"/>
    </g>`;
}

// --- Arms: forearms emerge from sleeves, elbows bent, hands in front ---

function armSVG(c, side, wristPt) {
  // Arm starts at bottom-center of sleeve opening
  const sx = side === 'L' ? 119 : 281;
  const sy = 240;

  if (!wristPt) {
    // IDLE POSE: Arms bent at elbows, hands in front of body at waist level
    // Upper arm goes from sleeve down and slightly inward to elbow
    const elbowX = side === 'L' ? 130 : 270;
    const elbowY = 305;
    // Forearm goes from elbow inward to hands in front of belly
    const handX = side === 'L' ? 158 : 242;
    const handY = 330;

    return `
      <g class="arm-${side}">
        <!-- Upper arm: sleeve to elbow -->
        <path d="M${sx},${sy} Q${side === 'L' ? 112 : 288},${270} ${elbowX},${elbowY}"
              stroke="${c.skin}" stroke-width="24" fill="none" stroke-linecap="round"/>
        <path d="M${sx},${sy} Q${side === 'L' ? 112 : 288},${270} ${elbowX},${elbowY}"
              stroke="${c.skinDk}" stroke-width="24" fill="none" stroke-linecap="round" opacity="0.08"/>

        <!-- Forearm: elbow to hand position -->
        <path d="M${elbowX},${elbowY} Q${side === 'L' ? 140 : 260},${320} ${handX},${handY}"
              stroke="${c.skin}" stroke-width="22" fill="none" stroke-linecap="round"/>
        <path d="M${elbowX},${elbowY} Q${side === 'L' ? 140 : 260},${320} ${handX},${handY}"
              stroke="${c.skinDk}" stroke-width="22" fill="none" stroke-linecap="round" opacity="0.06"/>
        <!-- Arm highlight -->
        <path d="M${elbowX},${elbowY} Q${side === 'L' ? 140 : 260},${320} ${handX},${handY}"
              stroke="${c.skinLt}" stroke-width="7" fill="none" stroke-linecap="round" opacity="0.08"/>
      </g>`;
  }

  // Animated arm: follows wrist with elbow bend
  const mx = (sx + wristPt.x) / 2;
  const my = (sy + wristPt.y) / 2;
  const off = side === 'L' ? 30 : -30;
  return `
    <g class="arm-${side}">
      <path d="M${sx},${sy} Q${mx + off},${Math.max(my - 15, sy + 10)} ${wristPt.x},${wristPt.y}"
            stroke="${c.skin}" stroke-width="24" fill="none" stroke-linecap="round"/>
      <path d="M${sx},${sy} Q${mx + off},${Math.max(my - 15, sy + 10)} ${wristPt.x},${wristPt.y}"
            stroke="${c.skinDk}" stroke-width="24" fill="none" stroke-linecap="round" opacity="0.08"/>
      <path d="M${sx},${sy} Q${mx + off},${Math.max(my - 15, sy + 10)} ${wristPt.x},${wristPt.y}"
            stroke="${c.skinLt}" stroke-width="8" fill="none" stroke-linecap="round" opacity="0.08"/>
    </g>`;
}

function idleHandSVG(c, side) {
  // Hands are now IN FRONT of the body, palms facing viewer
  const x = side === 'L' ? 158 : 242;
  const y = 330;
  const dir = side === 'L' ? 1 : -1;

  // Relaxed open hand, palm facing forward, fingers slightly spread
  return `
    <g class="idle-hand" filter="url(#inner-shadow)">
      <!-- Thumb (to the side) -->
      <ellipse cx="${x - 20 * dir}" cy="${y + 2}" rx="5.5" ry="9"
               fill="${c.skin}" stroke="${c.skinDk}" stroke-width="0.4"
               transform="rotate(${dir * -20},${x - 20 * dir},${y + 2})"/>
      <!-- Thumb highlight -->
      <ellipse cx="${x - 20 * dir}" cy="${y - 2}" rx="2.5" ry="4"
               fill="${c.skinLt}" opacity="0.1"
               transform="rotate(${dir * -20},${x - 20 * dir},${y - 2})"/>

      <!-- Palm -->
      <ellipse cx="${x}" cy="${y + 4}" rx="18" ry="20" fill="${c.skin}"/>
      <ellipse cx="${x + dir * 3}" cy="${y + 7}" rx="12" ry="14" fill="${c.skinDk}" opacity="0.05"/>
      <ellipse cx="${x - dir * 2}" cy="${y}" rx="9" ry="11" fill="${c.skinLt}" opacity="0.1"/>

      <!-- Fingers (pointing upward/forward, slightly spread) -->
      <!-- Index -->
      <rect x="${x - 12 * dir - 3.5}" y="${y - 30}" width="7" height="22" rx="3.5"
            fill="${c.skin}" stroke="${c.skinDk}" stroke-width="0.4"
            transform="rotate(${dir * -6},${x - 12 * dir},${y - 8})"/>
      <!-- Middle (longest) -->
      <rect x="${x - 4 * dir - 3.75}" y="${y - 34}" width="7.5" height="26" rx="3.75"
            fill="${c.skin}" stroke="${c.skinDk}" stroke-width="0.4"
            transform="rotate(${dir * -2},${x - 4 * dir},${y - 8})"/>
      <!-- Ring -->
      <rect x="${x + 4 * dir - 3.5}" y="${y - 31}" width="7" height="23" rx="3.5"
            fill="${c.skin}" stroke="${c.skinDk}" stroke-width="0.4"
            transform="rotate(${dir * 2},${x + 4 * dir},${y - 8})"/>
      <!-- Pinky -->
      <rect x="${x + 11 * dir - 3}" y="${y - 26}" width="6" height="18" rx="3"
            fill="${c.skin}" stroke="${c.skinDk}" stroke-width="0.4"
            transform="rotate(${dir * 6},${x + 11 * dir},${y - 8})"/>

      <!-- Fingertip highlights -->
      <circle cx="${x - 12 * dir}" cy="${y - 29}" r="2.5" fill="${c.skinLt}" opacity="0.12"/>
      <circle cx="${x - 4 * dir}" cy="${y - 33}" r="2.5" fill="${c.skinLt}" opacity="0.12"/>
      <circle cx="${x + 4 * dir}" cy="${y - 30}" r="2.5" fill="${c.skinLt}" opacity="0.12"/>
      <circle cx="${x + 11 * dir}" cy="${y - 25}" r="2" fill="${c.skinLt}" opacity="0.12"/>

      <!-- Knuckle line -->
      <path d="M${x - 15 * dir},${y - 6} Q${x},${y - 10} ${x + 15 * dir},${y - 6}"
            stroke="${c.skinDk}" stroke-width="0.7" fill="none" opacity="0.1"/>

      <!-- Finger crease hints -->
      <line x1="${x - 12 * dir - 2}" y1="${y - 16}" x2="${x - 12 * dir + 2}" y2="${y - 16}"
            stroke="${c.skinDk}" stroke-width="0.4" opacity="0.08"/>
      <line x1="${x - 4 * dir - 2}" y1="${y - 18}" x2="${x - 4 * dir + 2}" y2="${y - 18}"
            stroke="${c.skinDk}" stroke-width="0.4" opacity="0.08"/>
      <line x1="${x + 4 * dir - 2}" y1="${y - 16}" x2="${x + 4 * dir + 2}" y2="${y - 16}"
            stroke="${c.skinDk}" stroke-width="0.4" opacity="0.08"/>
    </g>`;
}

function handSVG(c, landmarks) {
  if (!landmarks || landmarks.length < 21) return '';
  const pts = landmarks.map(lm => lmToSVG(lm));
  let s = '';

  // Filled palm polygon
  const palmIdx = [0, 1, 5, 9, 13, 17];
  const palmPath = palmIdx.map((i, idx) =>
    `${idx === 0 ? 'M' : 'L'}${pts[i].x},${pts[i].y}`
  ).join(' ') + ' Z';
  s += `<path d="${palmPath}" fill="${c.skin}" opacity="0.95"/>`;
  s += `<path d="${palmPath}" fill="${c.skinDk}" opacity="0.05"/>`;

  // Thick filled fingers with rounded segments
  for (const finger of FINGERS) {
    for (let i = 0; i < finger.length - 1; i++) {
      const a = finger[i], b = finger[i + 1];
      const w = i === 0 ? 11 : (i === 1 ? 9 : 7.5);
      s += `<line x1="${pts[a].x}" y1="${pts[a].y}" x2="${pts[b].x}" y2="${pts[b].y}"
            stroke="${c.skin}" stroke-width="${w}" stroke-linecap="round"/>`;
      s += `<line x1="${pts[a].x}" y1="${pts[a].y}" x2="${pts[b].x}" y2="${pts[b].y}"
            stroke="${c.skinDk}" stroke-width="${w}" stroke-linecap="round" opacity="0.04"/>`;
    }
    const tip = finger[finger.length - 1];
    s += `<circle cx="${pts[tip].x}" cy="${pts[tip].y}" r="5" fill="${c.skin}"/>`;
    s += `<circle cx="${pts[tip].x}" cy="${pts[tip].y}" r="5" fill="${c.skinDk}" opacity="0.04"/>`;
    s += `<circle cx="${pts[tip].x - 1}" cy="${pts[tip].y - 1}" r="2" fill="${c.skinLt}" opacity="0.15"/>`;
    s += `<circle cx="${pts[tip].x}" cy="${pts[tip].y}" r="3" fill="${c.skinLt}" opacity="0.06"/>`;
  }

  // Subtle joint indicators
  for (let i = 0; i < 21; i++) {
    if (TIPS.includes(i) || i === 0) continue;
    s += `<circle cx="${pts[i].x}" cy="${pts[i].y}" r="1.5" fill="${c.skinDk}" opacity="0.06"/>`;
  }

  // Wrist
  s += `<circle cx="${pts[0].x}" cy="${pts[0].y}" r="13" fill="${c.skin}"/>`;
  s += `<circle cx="${pts[0].x}" cy="${pts[0].y}" r="13" fill="${c.skinDk}" opacity="0.05"/>`;

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
      <rect width="400" height="520" fill="url(#av-bg)" rx="8"/>
      ${hasHands
        ? `${armSVG(c, 'L', wrist)}${armSVG(c, 'R', null)}${bodySVG(c)}${handSVG(c, landmarks)}`
        : `${armSVG(c, 'L', null)}${armSVG(c, 'R', null)}${bodySVG(c)}${idleHandSVG(c, 'L')}${idleHandSVG(c, 'R')}`
      }
      <text x="200" y="508" text-anchor="middle" fill="rgba(255,255,255,0.2)"
            font-family="Inter,system-ui,sans-serif" font-size="11" font-weight="600"
            letter-spacing="0.5">${c.name}</text>
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
