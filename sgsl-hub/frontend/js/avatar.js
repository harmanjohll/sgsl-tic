/* ============================================================
   SgSL Hub — Avatar System
   ============================================================
   SVG-based animated avatar for sign language demonstration.
   Natural posture with anatomically-informed arm/hand placement.
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
    rimLight: '#6C8EFF',
  },
  meiling: {
    name: 'Mei Ling', gender: 'female',
    skin: '#F0C2A0', skinLt: '#FADCC8', skinDk: '#C99B78', skinMid: '#E8B494',
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

// --- SVG Components ---

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
      <radialGradient id="face-grad" cx="42%" cy="35%" r="60%">
        <stop offset="0%" stop-color="${c.skinLt}" stop-opacity="0.5"/>
        <stop offset="70%" stop-color="${c.skin}" stop-opacity="0"/>
        <stop offset="100%" stop-color="${c.skinDk}" stop-opacity="0.2"/>
      </radialGradient>
      <radialGradient id="cheek-l" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${c.cheek}" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="${c.cheek}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="cheek-r" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${c.cheek}" stop-opacity="0.22"/>
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
      <filter id="rim-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur"/>
        <feFlood flood-color="${c.rimLight}" flood-opacity="0.5" result="color"/>
        <feComposite in="color" in2="blur" operator="in" result="glow"/>
        <feMerge>
          <feMergeNode in="glow"/>
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
      <path d="M163,400 L163,500" stroke="${c.pantsDk}" stroke-width="0.8" opacity="0.08"/>
      <path d="M237,400 L237,500" stroke="${c.pantsDk}" stroke-width="0.8" opacity="0.08"/>
      <path d="M136,350 Q200,356 264,350 Q200,362 136,350 Z" fill="${c.pantsDk}" opacity="0.15"/>
      <ellipse cx="165" cy="440" rx="12" ry="20" fill="${c.pants}" opacity="0.08"/>
      <ellipse cx="235" cy="440" rx="12" ry="20" fill="${c.pants}" opacity="0.08"/>
    </g>`;
}

function beltSVG(c) {
  return `
    <g class="belt">
      <rect x="130" y="340" width="140" height="14" rx="3" fill="${c.belt}"/>
      <line x1="138" y1="347" x2="183" y2="347" stroke="#000" stroke-width="0.4" opacity="0.08"/>
      <line x1="217" y1="347" x2="262" y2="347" stroke="#000" stroke-width="0.4" opacity="0.08"/>
      <line x1="132" y1="341" x2="268" y2="341" stroke="${c.skinLt}" stroke-width="0.5" opacity="0.06"/>
      <rect x="189" y="339" width="22" height="16" rx="3" fill="${c.beltBuckle}"/>
      <rect x="192" y="342" width="16" height="10" rx="2" fill="none"
            stroke="${c.belt}" stroke-width="1.5"/>
      <line x1="200" y1="340" x2="200" y2="354" stroke="${c.belt}" stroke-width="1.2"/>
      <rect x="190" y="340" width="8" height="2" rx="1" fill="white" opacity="0.25"/>
    </g>`;
}

function shirtSVG(c) {
  return `
    <g class="shirt">
      <path d="M116,200 Q116,182 200,174 Q284,182 284,200 L270,342 L130,342 Z"
            fill="url(#shirt-grad)"/>
      <path d="M116,200 L130,342 L155,342 L138,200 Z" fill="url(#shirt-side-l)" opacity="0.4"/>
      <path d="M284,200 L270,342 L245,342 L262,200 Z" fill="url(#shirt-side-r)" opacity="0.4"/>
      <path d="M116,200 Q116,182 200,174"
            stroke="${c.rimLight}" stroke-width="1" fill="none" opacity="0.08"/>
      <path d="M284,200 Q284,182 200,174"
            stroke="${c.rimLight}" stroke-width="1" fill="none" opacity="0.08"/>
      <path d="M162,220 Q165,270 160,330" stroke="${c.shirtDk}" stroke-width="0.7" fill="none" opacity="0.08"/>
      <path d="M238,220 Q235,270 240,330" stroke="${c.shirtDk}" stroke-width="0.7" fill="none" opacity="0.08"/>
      <path d="M195,210 Q193,250 196,300" stroke="${c.shirtDk}" stroke-width="0.4" fill="none" opacity="0.05"/>
      <path d="M205,210 Q207,250 204,300" stroke="${c.shirtDk}" stroke-width="0.4" fill="none" opacity="0.05"/>
      <path d="M170,176 Q200,186 230,176 Q200,194 170,176 Z"
            fill="${c.shirtDk}" opacity="0.2"/>
      <path d="M176,174 L183,198 L200,180 Z" fill="${c.shirtLt}"/>
      <path d="M176,174 L183,198 L200,180 Z" fill="none"
            stroke="${c.shirtDk}" stroke-width="0.6" opacity="0.25"/>
      <path d="M178,176 L184,194" stroke="white" stroke-width="0.6" opacity="0.12"/>
      <path d="M224,174 L217,198 L200,180 Z" fill="${c.shirtLt}"/>
      <path d="M224,174 L217,198 L200,180 Z" fill="none"
            stroke="${c.shirtDk}" stroke-width="0.6" opacity="0.25"/>
      <path d="M222,176 L216,194" stroke="white" stroke-width="0.6" opacity="0.12"/>
      <line x1="200" y1="180" x2="200" y2="265" stroke="${c.shirtDk}" stroke-width="1" opacity="0.12"/>
      ${[202, 224, 246].map(y => `
        <circle cx="200" cy="${y}" r="3.2" fill="${c.shirtLt}" stroke="${c.shirtDk}" stroke-width="0.6" opacity="0.65"/>
        <line x1="198" y1="${y}" x2="202" y2="${y}" stroke="${c.shirtDk}" stroke-width="0.3" opacity="0.3"/>
        <line x1="200" y1="${y - 2}" x2="200" y2="${y + 2}" stroke="${c.shirtDk}" stroke-width="0.3" opacity="0.3"/>
      `).join('')}
      <path d="M116,200 Q100,216 94,246 L136,246 Q128,220 128,200 Z" fill="${c.shirt}"/>
      <path d="M116,200 Q100,216 94,246 L108,246 Q112,220 116,206 Z" fill="${c.shirtDk}" opacity="0.15"/>
      <path d="M94,244 Q115,250 136,244" stroke="${c.shirtDk}" stroke-width="1.8" fill="none" opacity="0.18"/>
      <path d="M130,200 Q124,210 118,222" stroke="${c.shirtDk}" stroke-width="0.8" fill="none" opacity="0.12"/>
      <path d="M116,200 Q100,216 94,246" stroke="${c.rimLight}" stroke-width="0.8" fill="none" opacity="0.06"/>
      <path d="M284,200 Q300,216 306,246 L264,246 Q272,220 272,200 Z" fill="${c.shirt}"/>
      <path d="M284,200 Q300,216 306,246 L292,246 Q288,220 284,206 Z" fill="${c.shirtDk}" opacity="0.15"/>
      <path d="M264,244 Q285,250 306,244" stroke="${c.shirtDk}" stroke-width="1.8" fill="none" opacity="0.18"/>
      <path d="M270,200 Q276,210 282,222" stroke="${c.shirtDk}" stroke-width="0.8" fill="none" opacity="0.12"/>
      <path d="M284,200 Q300,216 306,246" stroke="${c.rimLight}" stroke-width="0.8" fill="none" opacity="0.06"/>
    </g>`;
}

function neckSVG(c) {
  const isFemale = c.gender === 'female';
  const nx = isFemale ? 188 : 185;
  const nw = isFemale ? 24 : 30;
  return `
    <g class="neck">
      <rect x="${nx}" y="146" width="${nw}" height="34" rx="12" fill="${c.skin}"/>
      <rect x="${nx}" y="146" width="${Math.round(nw / 2)}" height="28" rx="7" fill="${c.skinDk}" opacity="0.06"/>
      <ellipse cx="${nx + nw - 9}" cy="158" rx="4" ry="9" fill="${c.skinLt}" opacity="0.12"/>
      ${!isFemale ? `<ellipse cx="200" cy="162" rx="3" ry="2" fill="${c.skinDk}" opacity="0.05"/>` : ''}
      <ellipse cx="200" cy="150" rx="${isFemale ? 16 : 20}" ry="6" fill="${c.skinDk}" opacity="0.18"/>
      <ellipse cx="200" cy="176" rx="${isFemale ? 16 : 20}" ry="5" fill="${c.skinDk}" opacity="0.1"/>
    </g>`;
}

function headSVG(c) {
  const isMale = c.gender === 'male';
  const isFemale = !isMale;
  const jaw = isMale
    ? `C220,150 212,158 200,160 C188,158 180,150 168,142`
    : `C224,148 216,162 200,168 C184,162 176,148 168,140`;
  const chinY = isMale ? 160 : 168;
  const faceTop = isFemale ? 18 : 16;
  const faceWR = isFemale ? 256 : 258;
  const faceLX = isFemale ? 146 : 144;

  return `
    <g class="head">
      <ellipse cx="200" cy="158" rx="42" ry="6" fill="#000" opacity="0.06"/>
      <path d="M200,${faceTop}
               C${faceWR - 20},${faceTop} ${faceWR},46 ${faceWR},80
               C${faceWR},112 ${faceWR - 10},132 ${faceWR - 26},142
               ${jaw}
               C${faceLX + 10},132 ${faceLX},112 ${faceLX},80
               C${faceLX},46 ${faceLX + 16},${faceTop} 200,${faceTop} Z"
            fill="${c.skin}" filter="url(#inner-shadow)"/>
      <path d="M200,${faceTop + 4}
               C232,${faceTop + 4} 250,44 252,72
               C252,58 238,28 200,${faceTop + 8}
               C162,28 148,58 148,72
               C150,44 168,${faceTop + 4} 200,${faceTop + 4} Z"
            fill="${c.skinLt}" opacity="0.2"/>
      <path d="M200,${faceTop}
               C${faceWR - 20},${faceTop} ${faceWR},46 ${faceWR},80
               C${faceWR},112 ${faceWR - 10},132 ${faceWR - 26},142
               ${jaw}
               C${faceLX + 10},132 ${faceLX},112 ${faceLX},80
               C${faceLX},46 ${faceLX + 16},${faceTop} 200,${faceTop} Z"
            fill="url(#face-grad)"/>
      <path d="M236,140 C250,126 256,108 256,80 C256,50 244,26 220,18"
            stroke="${c.rimLight}" stroke-width="1.5" fill="none" opacity="0.08"/>
      <path d="M164,132 Q182,144 200,${chinY} Q218,144 236,132
               Q228,150 200,${chinY + 4} Q172,150 164,132 Z"
            fill="${c.skinDk}" opacity="0.08"/>
      <ellipse cx="${isFemale ? 168 : 166}" cy="${isFemale ? 110 : 108}" rx="${isFemale ? 16 : 15}" ry="${isFemale ? 12 : 11}" fill="url(#cheek-l)"/>
      <ellipse cx="${isFemale ? 232 : 234}" cy="${isFemale ? 110 : 108}" rx="${isFemale ? 16 : 15}" ry="${isFemale ? 12 : 11}" fill="url(#cheek-r)"/>
      <path d="M166,140 C154,128 146,108 146,80"
            stroke="${c.skinDk}" stroke-width="0.8" fill="none" opacity="0.06"/>
      <path d="M234,140 C246,128 254,108 254,80"
            stroke="${c.skinDk}" stroke-width="0.8" fill="none" opacity="0.06"/>
    </g>`;
}

function earsSVG(c) {
  const isFemale = c.gender === 'female';
  let earrings = '';
  if (isFemale) {
    earrings = `
      <circle cx="146" cy="102" r="3" fill="${c.rimLight}" opacity="0.4"/>
      <circle cx="146" cy="102" r="1.5" fill="white" opacity="0.3"/>
      <circle cx="254" cy="102" r="3" fill="${c.rimLight}" opacity="0.4"/>
      <circle cx="254" cy="102" r="1.5" fill="white" opacity="0.3"/>
    `;
  }
  return `
    <g class="ears">
      <ellipse cx="145" cy="88" rx="11" ry="16" fill="${c.skin}"/>
      <ellipse cx="145" cy="88" rx="11" ry="16" fill="${c.skinDk}" opacity="0.06"/>
      <ellipse cx="147" cy="88" rx="7" ry="11" fill="${c.skinDk}" opacity="0.08"/>
      <path d="M144,78 Q150,84 149,94 Q147,98 145,100"
            stroke="${c.skinDk}" stroke-width="1" fill="none" opacity="0.15"/>
      <ellipse cx="146" cy="98" rx="4" ry="4" fill="${c.skinLt}" opacity="0.1"/>
      <ellipse cx="255" cy="88" rx="11" ry="16" fill="${c.skin}"/>
      <ellipse cx="255" cy="88" rx="11" ry="16" fill="${c.skinDk}" opacity="0.06"/>
      <ellipse cx="253" cy="88" rx="7" ry="11" fill="${c.skinDk}" opacity="0.08"/>
      <path d="M256,78 Q250,84 251,94 Q253,98 255,100"
            stroke="${c.skinDk}" stroke-width="1" fill="none" opacity="0.15"/>
      <ellipse cx="254" cy="98" rx="4" ry="4" fill="${c.skinLt}" opacity="0.1"/>
      ${earrings}
    </g>`;
}

// --- Hair back layer (behind head — visible below chin as shoulder-length volume) ---
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
      <!-- Subtle strand texture on back hair -->
      <path d="M140,130 Q138,170 142,210" stroke="${c.hairHi}" stroke-width="0.7" fill="none" opacity="0.05"/>
      <path d="M260,130 Q262,170 258,210" stroke="${c.hairHi}" stroke-width="0.7" fill="none" opacity="0.05"/>
      <path d="M145,140 Q143,175 147,208" stroke="${c.hairHi}" stroke-width="0.4" fill="none" opacity="0.04"/>
      <path d="M255,140 Q257,175 253,208" stroke="${c.hairHi}" stroke-width="0.4" fill="none" opacity="0.04"/>
    </g>`;
}

function hairSVG(c) {
  if (c.gender === 'female') {
    // Shoulder-length straight hair. Front curtains end at ear level to
    // avoid "beard" effect. Back hair (hairBackSVG) handles below-ear volume.
    return `
      <g class="hair">
        <!-- Top hair mass -->
        <path d="M146,52
                 C148,14 174,-6 200,-8
                 C226,-6 252,14 254,52
                 Q252,28 232,14
                 Q216,2 200,0
                 Q184,2 168,14
                 Q148,28 146,52 Z"
              fill="${c.hair}"/>

        <!-- Side curtain left — frames face, ends at ear level -->
        <path d="M146,52
                 C144,68 141,82 139,100
                 Q138,110 140,118
                 L148,115
                 Q149,105 150,92
                 C150,78 151,66 150,52 Z"
              fill="${c.hair}"/>

        <!-- Side curtain right -->
        <path d="M254,52
                 C256,68 259,82 261,100
                 Q262,110 260,118
                 L252,115
                 Q251,105 250,92
                 C250,78 249,66 250,52 Z"
              fill="${c.hair}"/>

        <!-- Thin loose strands past ears (connects front curtain to back hair) -->
        <path d="M140,105 Q138,130 140,155"
              stroke="${c.hair}" stroke-width="3.5" fill="none" stroke-linecap="round" opacity="0.7"/>
        <path d="M260,105 Q262,130 260,155"
              stroke="${c.hair}" stroke-width="3.5" fill="none" stroke-linecap="round" opacity="0.7"/>
        <path d="M142,108 Q140,128 142,148"
              stroke="${c.hair}" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.4"/>
        <path d="M258,108 Q260,128 258,148"
              stroke="${c.hair}" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.4"/>

        <!-- Soft bangs -->
        <path d="M156,44 Q168,22 188,14 Q178,32 170,48 Z" fill="${c.hair}"/>
        <path d="M168,40 Q182,18 202,10 Q190,28 184,44 Z" fill="${c.hair}"/>
        <path d="M182,42 Q196,22 216,16 Q204,34 196,48 Z" fill="${c.hair}"/>

        <!-- Hair shine -->
        <path d="M174,6 Q190,-2 212,2 Q196,4 180,12"
              fill="${c.hairHi}" opacity="0.25"/>
        <path d="M166,18 Q182,8 200,4" stroke="${c.hairHi}"
              stroke-width="1.5" fill="none" opacity="0.12"/>
      </g>`;
  }

  // Rajan: fuller medium-short hair with volume
  return `
    <g class="hair">
      <!-- Main hair volume (taller, wider) -->
      <path d="M142,68
               C142,22 168,0 200,-2
               C232,0 258,22 258,68
               Q258,44 244,28
               Q230,12 200,8
               Q170,12 156,28
               Q142,44 142,68 Z"
            fill="${c.hair}"/>

      <!-- Inner texture layer -->
      <path d="M150,54
               C152,20 174,0 200,-2
               C226,0 248,20 250,54
               Q248,30 232,18
               Q216,4 200,2
               Q184,4 168,18
               Q152,30 150,54 Z"
            fill="${c.hair}"/>

      <!-- Side coverage past ears -->
      <path d="M145,64 Q143,76 144,92"
            stroke="${c.hair}" stroke-width="7" stroke-linecap="round"/>
      <path d="M255,64 Q257,76 256,92"
            stroke="${c.hair}" stroke-width="7" stroke-linecap="round"/>

      <!-- Hair part -->
      <path d="M172,20 Q186,8 200,4 Q194,12 184,22"
            fill="${c.hairHi}" opacity="0.15"/>

      <!-- Hair shine -->
      <path d="M178,10 Q192,2 214,6 Q198,6 184,14"
            fill="${c.hairHi}" opacity="0.25"/>

      <!-- Strand texture details -->
      <path d="M168,24 Q185,12 200,8" stroke="${c.hairHi}" stroke-width="0.8" fill="none" opacity="0.12"/>
      <path d="M232,24 Q215,12 200,8" stroke="${c.hairHi}" stroke-width="0.8" fill="none" opacity="0.08"/>
      <path d="M155,36 Q170,22 190,12" stroke="${c.hairHi}" stroke-width="0.5" fill="none" opacity="0.08"/>
      <path d="M245,36 Q230,22 210,12" stroke="${c.hairHi}" stroke-width="0.5" fill="none" opacity="0.06"/>

      <!-- Sideburns -->
      <path d="M146,68 Q145,80 147,94" stroke="${c.hair}" stroke-width="5" stroke-linecap="round" opacity="0.6"/>
      <path d="M254,68 Q255,80 253,94" stroke="${c.hair}" stroke-width="5" stroke-linecap="round" opacity="0.6"/>
    </g>`;
}

function eyesSVG(c) {
  const isFemale = c.gender === 'female';
  // Natural proportioned eyes — not oversized
  const rx = isFemale ? 13 : 11.5;
  const ry = isFemale ? 11 : 10;
  const irisR = isFemale ? 7 : 5.8;
  const pupilR = isFemale ? 3.8 : 3.2;

  let lashes = '';
  if (isFemale) {
    // Subtle curved lashes — 3 per eye, elegant not spiky
    lashes = `
      <path d="M169,76 Q166,71 165,67" stroke="${c.brow}" stroke-width="1.2" fill="none" stroke-linecap="round" opacity="0.4"/>
      <path d="M175,73 Q174,68 174,65" stroke="${c.brow}" stroke-width="1" fill="none" stroke-linecap="round" opacity="0.35"/>
      <path d="M182,73 Q183,69 184,66" stroke="${c.brow}" stroke-width="0.8" fill="none" stroke-linecap="round" opacity="0.25"/>
      <path d="M231,76 Q234,71 235,67" stroke="${c.brow}" stroke-width="1.2" fill="none" stroke-linecap="round" opacity="0.4"/>
      <path d="M225,73 Q226,68 226,65" stroke="${c.brow}" stroke-width="1" fill="none" stroke-linecap="round" opacity="0.35"/>
      <path d="M218,73 Q217,69 216,66" stroke="${c.brow}" stroke-width="0.8" fill="none" stroke-linecap="round" opacity="0.25"/>
    `;
  }

  return `
    <g class="eyes">
      ${lashes}
      <!-- Left eye -->
      <ellipse cx="180" cy="84" rx="${rx + 1}" ry="${ry + 0.5}" fill="${c.skinDk}" opacity="0.04"/>
      <ellipse cx="180" cy="84" rx="${rx}" ry="${ry}" fill="url(#eye-white-l)"/>
      <ellipse cx="180" cy="84" rx="${rx}" ry="${ry}" fill="none"
               stroke="${c.skinDk}" stroke-width="0.8" opacity="0.15"/>
      <circle cx="181" cy="85" r="${irisR}" fill="url(#iris-grad-l)"/>
      <circle cx="181" cy="85" r="${irisR}" fill="none" stroke="${c.iris}" stroke-width="0.5" opacity="0.3"/>
      <circle cx="181" cy="85" r="${pupilR}" fill="#0D0D0D"/>
      <circle cx="184" cy="82" r="${isFemale ? 2.5 : 2.2}" fill="white" opacity="0.92"/>
      <circle cx="178" cy="87" r="${isFemale ? 1.3 : 1.1}" fill="white" opacity="0.4"/>
      <path d="M${180 - rx},${84 - ry + 4} Q180,${84 - ry - 2} ${180 + rx},${84 - ry + 4}"
            stroke="${c.skinDk}" stroke-width="${isFemale ? 2.2 : 1.8}" fill="none" opacity="${isFemale ? 0.45 : 0.3}"/>
      <path d="M${180 - rx + 3},${84 + ry - 2} Q180,${84 + ry + 1} ${180 + rx - 3},${84 + ry - 2}"
            stroke="${c.skinDk}" stroke-width="0.5" fill="none" opacity="0.08"/>

      <!-- Right eye -->
      <ellipse cx="220" cy="84" rx="${rx + 1}" ry="${ry + 0.5}" fill="${c.skinDk}" opacity="0.04"/>
      <ellipse cx="220" cy="84" rx="${rx}" ry="${ry}" fill="url(#eye-white-r)"/>
      <ellipse cx="220" cy="84" rx="${rx}" ry="${ry}" fill="none"
               stroke="${c.skinDk}" stroke-width="0.8" opacity="0.15"/>
      <circle cx="219" cy="85" r="${irisR}" fill="url(#iris-grad-r)"/>
      <circle cx="219" cy="85" r="${irisR}" fill="none" stroke="${c.iris}" stroke-width="0.5" opacity="0.3"/>
      <circle cx="219" cy="85" r="${pupilR}" fill="#0D0D0D"/>
      <circle cx="222" cy="82" r="${isFemale ? 2.5 : 2.2}" fill="white" opacity="0.92"/>
      <circle cx="216" cy="87" r="${isFemale ? 1.3 : 1.1}" fill="white" opacity="0.4"/>
      <path d="M${220 - rx},${84 - ry + 4} Q220,${84 - ry - 2} ${220 + rx},${84 - ry + 4}"
            stroke="${c.skinDk}" stroke-width="${isFemale ? 2.2 : 1.8}" fill="none" opacity="${isFemale ? 0.45 : 0.3}"/>
      <path d="M${220 - rx + 3},${84 + ry - 2} Q220,${84 + ry + 1} ${220 + rx - 3},${84 + ry - 2}"
            stroke="${c.skinDk}" stroke-width="0.5" fill="none" opacity="0.08"/>
    </g>`;
}

function eyebrowsSVG(c) {
  const isFemale = c.gender === 'female';
  const sw = isFemale ? 2.8 : 5.5;
  const archL = isFemale
    ? 'M162,64 Q179,52 196,63'
    : 'M162,68 Q179,58 196,68';
  const archR = isFemale
    ? 'M204,63 Q221,52 238,64'
    : 'M204,68 Q221,58 238,68';

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
  const isFemale = c.gender === 'female';
  const tipRx = isFemale ? 7 : 10;
  const tipRy = isFemale ? 5 : 7;
  const nostrilSpread = isFemale ? 5 : 7;
  return `
    <g class="nose">
      <path d="M198,86 Q195,98 194,110"
            stroke="${c.skinDk}" stroke-width="${isFemale ? 0.8 : 1.2}" fill="none" opacity="${isFemale ? 0.1 : 0.15}"/>
      <path d="M202,86 Q205,98 206,110"
            stroke="${c.skinDk}" stroke-width="0.6" fill="none" opacity="0.06"/>
      <ellipse cx="200" cy="112" rx="${tipRx}" ry="${tipRy}" fill="${c.skin}"/>
      <ellipse cx="200" cy="112" rx="${tipRx}" ry="${tipRy}" fill="${c.skinDk}" opacity="0.06"/>
      <ellipse cx="201" cy="${isFemale ? 110 : 109}" rx="${isFemale ? 3 : 4}" ry="${isFemale ? 2 : 3}" fill="${c.skinLt}" opacity="0.25"/>
      <path d="M${200 - nostrilSpread - 4},114 Q200,${isFemale ? 118 : 120} ${200 + nostrilSpread + 4},114"
            stroke="${c.skinDk}" stroke-width="${isFemale ? 1.2 : 1.6}" fill="none" opacity="${isFemale ? 0.16 : 0.22}" stroke-linecap="round"/>
      <ellipse cx="${200 - nostrilSpread}" cy="114" rx="${isFemale ? 2 : 3}" ry="${isFemale ? 1.5 : 2}" fill="${c.skinDk}" opacity="${isFemale ? 0.08 : 0.12}"/>
      <ellipse cx="${200 + nostrilSpread}" cy="114" rx="${isFemale ? 2 : 3}" ry="${isFemale ? 1.5 : 2}" fill="${c.skinDk}" opacity="${isFemale ? 0.08 : 0.12}"/>
    </g>`;
}

function mouthSVG(c) {
  const isFemale = c.gender === 'female';
  return `
    <g class="mouth">
      <path d="M185,128 Q192,124 200,126 Q208,124 215,128"
            stroke="${c.lipDk}" stroke-width="${isFemale ? 2.2 : 1.5}" fill="none" opacity="${isFemale ? 0.55 : 0.35}"/>
      <path d="M192,126 L200,123 L208,126" stroke="${c.lipDk}" stroke-width="${isFemale ? 1 : 0.8}" fill="none" opacity="${isFemale ? 0.2 : 0.15}"/>
      <path d="M190,128 Q200,132 210,128" fill="white" opacity="0.15"/>
      <path d="M${isFemale ? 186 : 187},128 Q200,${isFemale ? 142 : 140} ${isFemale ? 214 : 213},128"
            fill="${c.lip}" opacity="${isFemale ? 0.35 : 0.12}"/>
      ${isFemale ? `
      <path d="M187,128 Q200,124 213,128 Q200,126 187,128 Z"
            fill="${c.lip}" opacity="0.2"/>` : ''}
      <path d="M185,128 Q200,${isFemale ? 141 : 139} 215,128"
            stroke="${c.lipDk}" stroke-width="${isFemale ? 2 : 1.8}" fill="none" stroke-linecap="round" opacity="${isFemale ? 0.35 : 0.3}"/>
      <path d="M194,${isFemale ? 134 : 133} Q200,${isFemale ? 138 : 136} 206,${isFemale ? 134 : 133}"
            fill="${c.skinLt}" opacity="0.08"/>
      <path d="M183,127 Q182,130 183,134" stroke="${c.skinDk}" stroke-width="0.8" fill="none" opacity="0.08"/>
      <path d="M217,127 Q218,130 217,134" stroke="${c.skinDk}" stroke-width="0.8" fill="none" opacity="0.08"/>
    </g>`;
}

// --- Arms: natural two-segment design (upper arm + forearm) ---
// Upper arm drops from sleeve; forearm angles inward to hand position.
// Animated arm calculates a natural elbow midpoint.

function armSVG(c, side, wristPt) {
  const sx = side === 'L' ? 115 : 285;
  const sy = 244;
  const sDir = side === 'L' ? -1 : 1; // outward direction from body

  if (!wristPt) {
    // Idle signing-ready position: arms relaxed in front of body
    const elbowX = side === 'L' ? 120 : 280;
    const elbowY = 295;
    const handX = side === 'L' ? 168 : 232;
    const handY = 305;

    return `
      <g class="arm-${side}">
        <!-- Upper arm: drops naturally from sleeve -->
        <path d="M${sx},${sy} Q${sx},${(sy + elbowY) / 2} ${elbowX},${elbowY}"
              stroke="${c.skin}" stroke-width="22" fill="none" stroke-linecap="round"/>
        <path d="M${sx},${sy} Q${sx},${(sy + elbowY) / 2} ${elbowX},${elbowY}"
              stroke="${c.skinDk}" stroke-width="22" fill="none" stroke-linecap="round" opacity="0.06"/>

        <!-- Forearm: angles inward to hand position -->
        <path d="M${elbowX},${elbowY} Q${(elbowX + handX) / 2},${(elbowY + handY) / 2 + 2} ${handX},${handY}"
              stroke="${c.skin}" stroke-width="18" fill="none" stroke-linecap="round"/>
        <path d="M${elbowX},${elbowY} Q${(elbowX + handX) / 2},${(elbowY + handY) / 2 + 2} ${handX},${handY}"
              stroke="${c.skinDk}" stroke-width="18" fill="none" stroke-linecap="round" opacity="0.05"/>
        <path d="M${elbowX},${elbowY} Q${(elbowX + handX) / 2},${(elbowY + handY) / 2 + 2} ${handX},${handY}"
              stroke="${c.skinLt}" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.06"/>
      </g>`;
  }

  // Animated: calculate natural elbow position
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
            stroke="${c.skinDk}" stroke-width="18" fill="none" stroke-linecap="round" opacity="0.05"/>
      <path d="M${elbowX},${elbowY} Q${(elbowX + wristPt.x) / 2 - elbowBias * 0.3},${(elbowY + wristPt.y) / 2} ${wristPt.x},${wristPt.y}"
            stroke="${c.skinLt}" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.06"/>
    </g>`;
}

// --- Idle hands: fingers point DOWN naturally, relaxed signing-ready position ---
function idleHandSVG(c, side) {
  const x = side === 'L' ? 168 : 232;
  const y = 305;
  const dir = side === 'L' ? 1 : -1; // dir toward body center

  // Finger specs: [dx from center (dir-adjusted), length, width]
  // Ordered: pinky (outside) → index (center side)
  const fingers = [
    { dx: -9, len: 16, w: 4.8, rot: 6 },
    { dx: -3, len: 20, w: 5.2, rot: 2 },
    { dx: 3,  len: 22, w: 5.5, rot: -1 },
    { dx: 9,  len: 19, w: 5.0, rot: -3 },
  ];

  return `
    <g class="idle-hand" filter="url(#inner-shadow)">
      <!-- Palm -->
      <ellipse cx="${x}" cy="${y}" rx="15" ry="12" fill="${c.skin}"/>
      <ellipse cx="${x + dir * 2}" cy="${y + 2}" rx="9" ry="8" fill="${c.skinDk}" opacity="0.04"/>
      <ellipse cx="${x - dir * 1}" cy="${y - 2}" rx="7" ry="6" fill="${c.skinLt}" opacity="0.07"/>

      <!-- Thumb (toward body center) -->
      <ellipse cx="${x + 16 * dir}" cy="${y + 1}" rx="4.5" ry="8"
               fill="${c.skin}" stroke="${c.skinDk}" stroke-width="0.3"
               transform="rotate(${dir * 18},${x + 16 * dir},${y + 1})"/>
      <ellipse cx="${x + 16 * dir}" cy="${y - 2}" rx="2" ry="3.5"
               fill="${c.skinLt}" opacity="0.07"
               transform="rotate(${dir * 18},${x + 16 * dir},${y - 2})"/>

      <!-- Fingers hanging down -->
      ${fingers.map(f => {
        const fx = x + f.dx * dir;
        const fy = y + 7;
        return `
        <rect x="${fx - f.w / 2}" y="${fy}" width="${f.w}" height="${f.len}" rx="${f.w / 2}"
              fill="${c.skin}" stroke="${c.skinDk}" stroke-width="0.3"
              transform="rotate(${f.rot * dir},${fx},${fy + f.len / 2})"/>
        <circle cx="${fx}" cy="${fy + f.len - 2}" r="1.5" fill="${c.skinLt}" opacity="0.08"/>`;
      }).join('')}

      <!-- Knuckle line -->
      <path d="M${x - 12 * dir},${y + 6} Q${x},${y + 9} ${x + 12 * dir},${y + 6}"
            stroke="${c.skinDk}" stroke-width="0.5" fill="none" opacity="0.06"/>
    </g>`;
}

// --- Animated hand: realistic fleshy appearance ---
function handSVG(c, landmarks) {
  if (!landmarks || landmarks.length < 21) return '';
  const pts = landmarks.map(lm => lmToSVG(lm));
  let s = '';

  // Palm — smooth filled shape
  const palmIdx = [0, 1, 5, 9, 13, 17];
  const palmPath = palmIdx.map((i, idx) =>
    `${idx === 0 ? 'M' : 'L'}${pts[i].x},${pts[i].y}`
  ).join(' ') + ' Z';
  s += `<path d="${palmPath}" fill="${c.skin}" opacity="0.95"/>`;
  s += `<path d="${palmPath}" fill="${c.skinLt}" opacity="0.04"/>`;

  // Finger segments — fleshy widths, tapered
  for (const finger of FINGERS) {
    for (let i = 0; i < finger.length - 1; i++) {
      const a = finger[i], b = finger[i + 1];
      const w = i === 0 ? 12 : (i === 1 ? 10 : 8);
      s += `<line x1="${pts[a].x}" y1="${pts[a].y}" x2="${pts[b].x}" y2="${pts[b].y}"
            stroke="${c.skin}" stroke-width="${w}" stroke-linecap="round"/>`;
      s += `<line x1="${pts[a].x}" y1="${pts[a].y}" x2="${pts[b].x}" y2="${pts[b].y}"
            stroke="${c.skinDk}" stroke-width="${w}" stroke-linecap="round" opacity="0.03"/>`;
    }

    // Fingertip — oriented oval pad with nail hint
    const tip = finger[finger.length - 1];
    const prev = finger[finger.length - 2];
    const dx = pts[tip].x - pts[prev].x;
    const dy = pts[tip].y - pts[prev].y;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    s += `<ellipse cx="${pts[tip].x}" cy="${pts[tip].y}" rx="5" ry="3.5"
          fill="${c.skin}" transform="rotate(${angle},${pts[tip].x},${pts[tip].y})"/>`;
    s += `<ellipse cx="${pts[tip].x + dx * 0.12}" cy="${pts[tip].y + dy * 0.12}" rx="3" ry="2"
          fill="${c.skinLt}" opacity="0.06"
          transform="rotate(${angle},${pts[tip].x + dx * 0.12},${pts[tip].y + dy * 0.12})"/>`;
  }

  // Wrist — smooth oval transition
  s += `<ellipse cx="${pts[0].x}" cy="${pts[0].y}" rx="10" ry="8" fill="${c.skin}"/>`;
  s += `<ellipse cx="${pts[0].x}" cy="${pts[0].y}" rx="10" ry="8" fill="${c.skinDk}" opacity="0.03"/>`;

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

function lerpPose(a, b, t) {
  if (!a) return b;
  return b.map((lm, i) => [
    a[i][0] * (1 - t) + lm[0] * t,
    a[i][1] * (1 - t) + lm[1] * t,
    (a[i][2] ?? 0) * (1 - t) + (lm[2] ?? 0) * t,
  ]);
}

// --- Render ---
// Body renders FIRST, then arms and hands ON TOP (SVG painter's model).
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
