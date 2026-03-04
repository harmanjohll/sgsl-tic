/* ============================================================
   SgSL Hub — Avatar System
   ============================================================
   SVG-based animated avatar for sign language demonstration.
   Friendly cartoon characters for sign language teaching.
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

  // Female: rounder cheeks, softer V-chin; Male: angular jaw
  const jaw = isMale
    ? `C220,150 212,158 200,160 C188,158 180,150 168,142`
    : `C224,148 216,162 200,168 C184,162 176,148 168,140`;
  const chinY = isMale ? 160 : 168;

  // Female face slightly rounder
  const faceTop = isFemale ? 18 : 16;
  const faceW = isFemale ? 236 : 240;
  const faceWR = isFemale ? 256 : 258;
  const faceLX = isFemale ? 146 : 144;

  return `
    <g class="head">
      <ellipse cx="200" cy="158" rx="42" ry="6" fill="#000" opacity="0.06"/>

      <path d="M200,${faceTop}
               C${faceW},${faceTop} ${faceWR},46 ${faceWR},80
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
               C${faceW},${faceTop} ${faceWR},46 ${faceWR},80
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

// --- Hair: back layer drawn behind head for shoulder-length styles ---
function hairBackSVG(c) {
  if (c.gender !== 'female') return '';
  return `
    <g class="hair-back">
      <path d="M138,56
               C138,18 166,-4 200,-4
               C234,-4 262,18 262,56
               L264,140 L262,182
               Q260,202 250,212
               Q232,222 200,224
               Q168,222 150,212
               Q140,202 138,182
               L136,140 Z"
            fill="${c.hair}"/>
      <path d="M142,150 Q140,182 145,210" stroke="${c.hairHi}" stroke-width="0.5" fill="none" opacity="0.06"/>
      <path d="M258,150 Q260,182 255,210" stroke="${c.hairHi}" stroke-width="0.5" fill="none" opacity="0.06"/>
    </g>`;
}

function hairSVG(c) {
  if (c.gender === 'female') {
    // Simple straight shoulder-length hair
    return `
      <g class="hair">
        <!-- Top hair mass -->
        <path d="M148,56
                 C150,18 174,-2 200,-4
                 C226,-2 250,18 252,56
                 Q250,32 230,18
                 Q214,6 200,4
                 Q186,6 170,18
                 Q150,32 148,56 Z"
              fill="${c.hair}"/>

        <!-- Side hair left (smooth straight curtain to shoulders) -->
        <path d="M146,60
                 Q144,90 142,125
                 Q140,160 141,192
                 Q142,206 148,214
                 L154,210
                 Q153,198 153,182
                 Q154,152 154,125
                 Q153,90 150,60 Z"
              fill="${c.hair}"/>

        <!-- Side hair right (smooth straight curtain) -->
        <path d="M254,60
                 Q256,90 258,125
                 Q260,160 259,192
                 Q258,206 252,214
                 L246,210
                 Q247,198 247,182
                 Q246,152 246,125
                 Q247,90 250,60 Z"
              fill="${c.hair}"/>

        <!-- Soft side-swept bangs -->
        <path d="M156,48 Q168,26 188,18 Q178,36 170,52 Z" fill="${c.hair}"/>
        <path d="M168,44 Q182,22 202,14 Q190,32 184,48 Z" fill="${c.hair}"/>
        <path d="M182,46 Q196,26 216,20 Q204,38 196,52 Z" fill="${c.hair}"/>

        <!-- Hair shine -->
        <path d="M174,10 Q190,2 212,6 Q196,8 180,16"
              fill="${c.hairHi}" opacity="0.25"/>
        <path d="M166,22 Q182,12 200,8" stroke="${c.hairHi}"
              stroke-width="1.5" fill="none" opacity="0.12"/>

        <!-- Subtle strand highlights on side curtains -->
        <path d="M145,90 Q143,140 145,192" stroke="${c.hairHi}" stroke-width="0.5" fill="none" opacity="0.07"/>
        <path d="M255,90 Q257,140 255,192" stroke="${c.hairHi}" stroke-width="0.5" fill="none" opacity="0.07"/>
        <path d="M148,100 Q146,145 148,188" stroke="${c.hairHi}" stroke-width="0.3" fill="none" opacity="0.05"/>
        <path d="M252,100 Q254,145 252,188" stroke="${c.hairHi}" stroke-width="0.3" fill="none" opacity="0.05"/>

        <!-- Soft hair tips -->
        <path d="M141,190 Q144,210 148,216" stroke="${c.hair}" stroke-width="2" fill="none" opacity="0.5"/>
        <path d="M259,190 Q256,210 252,216" stroke="${c.hair}" stroke-width="2" fill="none" opacity="0.5"/>
      </g>`;
  }

  // Rajan: neat short hair
  return `
    <g class="hair">
      <path d="M146,74
               C146,30 168,8 200,6
               C232,8 254,30 254,74
               Q254,50 240,34
               Q226,16 200,12
               Q174,16 160,34
               Q146,50 146,74 Z"
            fill="${c.hair}"/>
      <path d="M152,58
               C154,26 174,6 200,4
               C226,6 246,26 248,58
               Q244,36 228,24
               Q212,12 200,10
               Q188,12 172,24
               Q156,36 152,58 Z"
            fill="${c.hair}"/>
      <path d="M172,26 Q186,14 200,10 Q194,18 184,28"
            fill="${c.hairHi}" opacity="0.15"/>
      <path d="M178,16 Q192,8 214,12 Q198,12 184,20"
            fill="${c.hairHi}" opacity="0.25"/>
      <path d="M168,30 Q185,18 200,14" stroke="${c.hairHi}" stroke-width="0.8" fill="none" opacity="0.12"/>
      <path d="M232,30 Q215,18 200,14" stroke="${c.hairHi}" stroke-width="0.8" fill="none" opacity="0.08"/>
      <path d="M148,72 L147,86" stroke="${c.hair}" stroke-width="4" stroke-linecap="round" opacity="0.5"/>
      <path d="M252,72 L253,86" stroke="${c.hair}" stroke-width="4" stroke-linecap="round" opacity="0.5"/>
    </g>`;
}

function eyesSVG(c) {
  const isFemale = c.gender === 'female';
  // Bigger eyes for female — more expressive and feminine
  const rx = isFemale ? 16 : 13;
  const ry = isFemale ? 14 : 11;
  const irisR = isFemale ? 8.5 : 6.5;
  const pupilR = isFemale ? 4.5 : 3.5;

  let lashes = '';
  if (isFemale) {
    lashes = `
      <!-- Upper lashes — elegant curves -->
      <path d="M164,76 L159,70" stroke="${c.brow}" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
      <path d="M170,73 L166,66" stroke="${c.brow}" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
      <path d="M177,71 L175,64" stroke="${c.brow}" stroke-width="1.3" stroke-linecap="round" opacity="0.45"/>
      <path d="M184,70 L184,63" stroke="${c.brow}" stroke-width="1.1" stroke-linecap="round" opacity="0.35"/>
      <path d="M191,72 L194,67" stroke="${c.brow}" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
      <path d="M209,72 L206,67" stroke="${c.brow}" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
      <path d="M216,70 L216,63" stroke="${c.brow}" stroke-width="1.1" stroke-linecap="round" opacity="0.35"/>
      <path d="M223,71 L225,64" stroke="${c.brow}" stroke-width="1.3" stroke-linecap="round" opacity="0.45"/>
      <path d="M230,73 L234,66" stroke="${c.brow}" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
      <path d="M236,76 L241,70" stroke="${c.brow}" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
    `;
  }

  return `
    <g class="eyes">
      ${lashes}
      <!-- Left eye -->
      <ellipse cx="180" cy="84" rx="${rx + 2}" ry="${ry + 1}" fill="${c.skinDk}" opacity="0.04"/>
      <ellipse cx="180" cy="84" rx="${rx}" ry="${ry}" fill="url(#eye-white-l)"/>
      <ellipse cx="180" cy="84" rx="${rx}" ry="${ry}" fill="none"
               stroke="${c.skinDk}" stroke-width="0.8" opacity="0.15"/>
      <circle cx="181" cy="85" r="${irisR}" fill="url(#iris-grad-l)"/>
      <circle cx="181" cy="85" r="${irisR}" fill="none" stroke="${c.iris}" stroke-width="0.5" opacity="0.3"/>
      <path d="M${181 - irisR * 0.4},${85 - irisR * 0.4} L181,85 L${181 - irisR * 0.5},${85 + irisR * 0.3}"
            stroke="${c.irisRing}" stroke-width="0.3" fill="none" opacity="0.15"/>
      <path d="M${181 + irisR * 0.4},${85 - irisR * 0.4} L181,85 L${181 + irisR * 0.5},${85 + irisR * 0.3}"
            stroke="${c.irisRing}" stroke-width="0.3" fill="none" opacity="0.15"/>
      <circle cx="181" cy="85" r="${pupilR}" fill="#0D0D0D"/>
      <circle cx="${181 + irisR * 0.35}" cy="${85 - irisR * 0.35}" r="${isFemale ? 3 : 2.5}" fill="white" opacity="0.92"/>
      <circle cx="${181 - irisR * 0.35}" cy="${85 + irisR * 0.3}" r="${isFemale ? 1.6 : 1.3}" fill="white" opacity="0.4"/>
      <path d="M${180 - rx},${84 - ry + 4} Q180,${84 - ry - 3} ${180 + rx},${84 - ry + 4}"
            stroke="${c.skinDk}" stroke-width="${isFemale ? 2.5 : 2}" fill="none" opacity="${isFemale ? 0.5 : 0.35}"/>
      <path d="M${180 - rx + 3},${84 + ry - 2} Q180,${84 + ry + 1} ${180 + rx - 3},${84 + ry - 2}"
            stroke="${c.skinDk}" stroke-width="0.5" fill="none" opacity="0.08"/>

      <!-- Right eye -->
      <ellipse cx="220" cy="84" rx="${rx + 2}" ry="${ry + 1}" fill="${c.skinDk}" opacity="0.04"/>
      <ellipse cx="220" cy="84" rx="${rx}" ry="${ry}" fill="url(#eye-white-r)"/>
      <ellipse cx="220" cy="84" rx="${rx}" ry="${ry}" fill="none"
               stroke="${c.skinDk}" stroke-width="0.8" opacity="0.15"/>
      <circle cx="219" cy="85" r="${irisR}" fill="url(#iris-grad-r)"/>
      <circle cx="219" cy="85" r="${irisR}" fill="none" stroke="${c.iris}" stroke-width="0.5" opacity="0.3"/>
      <path d="M${219 - irisR * 0.4},${85 - irisR * 0.4} L219,85 L${219 - irisR * 0.5},${85 + irisR * 0.3}"
            stroke="${c.irisRing}" stroke-width="0.3" fill="none" opacity="0.15"/>
      <path d="M${219 + irisR * 0.4},${85 - irisR * 0.4} L219,85 L${219 + irisR * 0.5},${85 + irisR * 0.3}"
            stroke="${c.irisRing}" stroke-width="0.3" fill="none" opacity="0.15"/>
      <circle cx="219" cy="85" r="${pupilR}" fill="#0D0D0D"/>
      <circle cx="${219 + irisR * 0.35}" cy="${85 - irisR * 0.35}" r="${isFemale ? 3 : 2.5}" fill="white" opacity="0.92"/>
      <circle cx="${219 - irisR * 0.35}" cy="${85 + irisR * 0.3}" r="${isFemale ? 1.6 : 1.3}" fill="white" opacity="0.4"/>
      <path d="M${220 - rx},${84 - ry + 4} Q220,${84 - ry - 3} ${220 + rx},${84 - ry + 4}"
            stroke="${c.skinDk}" stroke-width="${isFemale ? 2.5 : 2}" fill="none" opacity="${isFemale ? 0.5 : 0.35}"/>
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
  // Smaller, more delicate nose for female
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
      <!-- Upper lip -->
      <path d="M185,128 Q192,124 200,126 Q208,124 215,128"
            stroke="${c.lipDk}" stroke-width="${isFemale ? 2.2 : 1.5}" fill="none" opacity="${isFemale ? 0.55 : 0.35}"/>
      <!-- Cupid's bow -->
      <path d="M192,126 L200,123 L208,126" stroke="${c.lipDk}" stroke-width="${isFemale ? 1 : 0.8}" fill="none" opacity="${isFemale ? 0.2 : 0.15}"/>

      <!-- Teeth hint -->
      <path d="M190,128 Q200,132 210,128" fill="white" opacity="0.15"/>

      <!-- Lower lip (fuller for female) -->
      <path d="M${isFemale ? 186 : 187},128 Q200,${isFemale ? 142 : 140} ${isFemale ? 214 : 213},128"
            fill="${c.lip}" opacity="${isFemale ? 0.35 : 0.12}"/>
      ${isFemale ? `
      <!-- Upper lip fill for female -->
      <path d="M187,128 Q200,124 213,128 Q200,126 187,128 Z"
            fill="${c.lip}" opacity="0.2"/>
      ` : ''}

      <!-- Smile line -->
      <path d="M185,128 Q200,${isFemale ? 141 : 139} 215,128"
            stroke="${c.lipDk}" stroke-width="${isFemale ? 2 : 1.8}" fill="none" stroke-linecap="round" opacity="${isFemale ? 0.35 : 0.3}"/>
      <!-- Lower lip highlight -->
      <path d="M194,${isFemale ? 134 : 133} Q200,${isFemale ? 138 : 136} 206,${isFemale ? 134 : 133}"
            fill="${c.skinLt}" opacity="0.08"/>

      <!-- Smile dimples -->
      <path d="M183,127 Q182,130 183,134" stroke="${c.skinDk}" stroke-width="0.8" fill="none" opacity="0.08"/>
      <path d="M217,127 Q218,130 217,134" stroke="${c.skinDk}" stroke-width="0.8" fill="none" opacity="0.08"/>
    </g>`;
}

// --- Arms: forearms emerge from sleeves, elbows bent, hands in front ---

function armSVG(c, side, wristPt) {
  const sx = side === 'L' ? 115 : 285;
  const sy = 244;

  if (!wristPt) {
    const elbowX = side === 'L' ? 128 : 272;
    const elbowY = 308;
    const handX = side === 'L' ? 158 : 242;
    const handY = 330;

    return `
      <g class="arm-${side}">
        <path d="M${sx},${sy} Q${side === 'L' ? 108 : 292},${272} ${elbowX},${elbowY}"
              stroke="${c.skin}" stroke-width="24" fill="none" stroke-linecap="round"/>
        <path d="M${sx},${sy} Q${side === 'L' ? 108 : 292},${272} ${elbowX},${elbowY}"
              stroke="${c.skinDk}" stroke-width="24" fill="none" stroke-linecap="round" opacity="0.08"/>

        <path d="M${elbowX},${elbowY} Q${side === 'L' ? 140 : 260},${322} ${handX},${handY}"
              stroke="${c.skin}" stroke-width="22" fill="none" stroke-linecap="round"/>
        <path d="M${elbowX},${elbowY} Q${side === 'L' ? 140 : 260},${322} ${handX},${handY}"
              stroke="${c.skinDk}" stroke-width="22" fill="none" stroke-linecap="round" opacity="0.06"/>
        <path d="M${elbowX},${elbowY} Q${side === 'L' ? 140 : 260},${322} ${handX},${handY}"
              stroke="${c.skinLt}" stroke-width="7" fill="none" stroke-linecap="round" opacity="0.08"/>
        <path d="M${sx},${sy} Q${side === 'L' ? 108 : 292},${272} ${elbowX},${elbowY}"
              stroke="${c.rimLight}" stroke-width="1" fill="none" stroke-linecap="round" opacity="0.05"/>
      </g>`;
  }

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
  const x = side === 'L' ? 158 : 242;
  const y = 330;
  const dir = side === 'L' ? 1 : -1;

  return `
    <g class="idle-hand" filter="url(#inner-shadow)">
      <ellipse cx="${x - 21 * dir}" cy="${y + 2}" rx="5.5" ry="9.5"
               fill="${c.skin}" stroke="${c.skinDk}" stroke-width="0.4"
               transform="rotate(${dir * -20},${x - 21 * dir},${y + 2})"/>
      <ellipse cx="${x - 21 * dir}" cy="${y - 2}" rx="2.5" ry="4"
               fill="${c.skinLt}" opacity="0.1"
               transform="rotate(${dir * -20},${x - 21 * dir},${y - 2})"/>

      <ellipse cx="${x}" cy="${y + 4}" rx="18" ry="20" fill="${c.skin}"/>
      <ellipse cx="${x + dir * 3}" cy="${y + 7}" rx="12" ry="14" fill="${c.skinDk}" opacity="0.05"/>
      <ellipse cx="${x - dir * 2}" cy="${y}" rx="9" ry="11" fill="${c.skinLt}" opacity="0.1"/>

      <rect x="${x - 12 * dir - 3.5}" y="${y - 30}" width="7" height="22" rx="3.5"
            fill="${c.skin}" stroke="${c.skinDk}" stroke-width="0.4"
            transform="rotate(${dir * -6},${x - 12 * dir},${y - 8})"/>
      <rect x="${x - 4 * dir - 3.75}" y="${y - 34}" width="7.5" height="26" rx="3.75"
            fill="${c.skin}" stroke="${c.skinDk}" stroke-width="0.4"
            transform="rotate(${dir * -2},${x - 4 * dir},${y - 8})"/>
      <rect x="${x + 4 * dir - 3.5}" y="${y - 31}" width="7" height="23" rx="3.5"
            fill="${c.skin}" stroke="${c.skinDk}" stroke-width="0.4"
            transform="rotate(${dir * 2},${x + 4 * dir},${y - 8})"/>
      <rect x="${x + 11 * dir - 3}" y="${y - 26}" width="6" height="18" rx="3"
            fill="${c.skin}" stroke="${c.skinDk}" stroke-width="0.4"
            transform="rotate(${dir * 6},${x + 11 * dir},${y - 8})"/>

      <circle cx="${x - 12 * dir}" cy="${y - 29}" r="2.5" fill="${c.skinLt}" opacity="0.12"/>
      <circle cx="${x - 4 * dir}" cy="${y - 33}" r="2.5" fill="${c.skinLt}" opacity="0.12"/>
      <circle cx="${x + 4 * dir}" cy="${y - 30}" r="2.5" fill="${c.skinLt}" opacity="0.12"/>
      <circle cx="${x + 11 * dir}" cy="${y - 25}" r="2" fill="${c.skinLt}" opacity="0.12"/>

      <ellipse cx="${x - 12 * dir}" cy="${y - 29}" rx="2" ry="2.5" fill="${c.skinLt}" opacity="0.06"/>
      <ellipse cx="${x - 4 * dir}" cy="${y - 33}" rx="2" ry="2.5" fill="${c.skinLt}" opacity="0.06"/>
      <ellipse cx="${x + 4 * dir}" cy="${y - 30}" rx="2" ry="2.5" fill="${c.skinLt}" opacity="0.06"/>

      <path d="M${x - 15 * dir},${y - 6} Q${x},${y - 10} ${x + 15 * dir},${y - 6}"
            stroke="${c.skinDk}" stroke-width="0.7" fill="none" opacity="0.1"/>

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

  // Palm fill
  const palmIdx = [0, 1, 5, 9, 13, 17];
  const palmPath = palmIdx.map((i, idx) =>
    `${idx === 0 ? 'M' : 'L'}${pts[i].x},${pts[i].y}`
  ).join(' ') + ' Z';
  s += `<path d="${palmPath}" fill="${c.skin}" opacity="0.95"/>`;
  s += `<path d="${palmPath}" fill="${c.skinDk}" opacity="0.05"/>`;

  // Finger segments — skin-colored, clean look
  for (const finger of FINGERS) {
    for (let i = 0; i < finger.length - 1; i++) {
      const a = finger[i], b = finger[i + 1];
      const w = i === 0 ? 10 : (i === 1 ? 8 : 6.5);
      s += `<line x1="${pts[a].x}" y1="${pts[a].y}" x2="${pts[b].x}" y2="${pts[b].y}"
            stroke="${c.skin}" stroke-width="${w}" stroke-linecap="round"/>`;
      s += `<line x1="${pts[a].x}" y1="${pts[a].y}" x2="${pts[b].x}" y2="${pts[b].y}"
            stroke="${c.skinDk}" stroke-width="${w}" stroke-linecap="round" opacity="0.04"/>`;
    }
    // Fingertips — smaller, subtle
    const tip = finger[finger.length - 1];
    s += `<circle cx="${pts[tip].x}" cy="${pts[tip].y}" r="4" fill="${c.skin}"/>`;
    s += `<circle cx="${pts[tip].x}" cy="${pts[tip].y}" r="4" fill="${c.skinDk}" opacity="0.04"/>`;
    s += `<circle cx="${pts[tip].x - 0.5}" cy="${pts[tip].y - 0.5}" r="1.5" fill="${c.skinLt}" opacity="0.12"/>`;
  }

  // Wrist — smaller, less prominent
  s += `<circle cx="${pts[0].x}" cy="${pts[0].y}" r="9" fill="${c.skin}"/>`;
  s += `<circle cx="${pts[0].x}" cy="${pts[0].y}" r="9" fill="${c.skinDk}" opacity="0.05"/>`;

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
// CRITICAL: Body renders FIRST, then arms and hands ON TOP.
// SVG painter's model: later elements appear in front of earlier ones.
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
