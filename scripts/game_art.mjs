import { writeFile } from 'node:fs/promises';
const out = process.argv[2];
const INK = '#0b100d', COAT = '#141c17', COAT2 = '#1c2620', SKIN = '#a3ab98', SKIN2 = '#737d6c';
// Общая фигура: сутулый человек в рваном пальто, голова опущена.
function figure(c, o = {}) {
  const hem = 'M82 130 Q120 100 158 130 L170 240 L160 232 L152 248 L142 234 L132 250 L121 236 L110 250 L100 234 L90 248 L82 232 L70 242 Z';
  return `
  <g stroke="${c}" stroke-opacity=".55" stroke-width="1.5" stroke-linejoin="round">
    <path d="M98 232 L90 328 L76 334 L76 340 L110 340 L116 252 L124 252 L132 340 L166 340 L166 334 L150 328 L144 232 Z" fill="${INK}"/>
    <path d="${hem}" fill="${COAT}"/>
    <path d="M120 112 L112 236 M120 112 L130 238" fill="none" stroke-opacity=".25"/>
    <path d="M104 118 L120 140 L136 118" fill="${COAT2}"/>
  </g>
  ${o.neck ?? ''}
  <path d="M110 104 h22 v18 q-11 8 -22 0 Z" fill="${SKIN2}"/>
  <g transform="rotate(6 122 90)">
    <ellipse cx="122" cy="88" rx="22" ry="26" fill="${o.face === false ? INK : SKIN}"/>
    ${o.face === false ? '' : `
    <path d="M102 96 q6 16 20 18 q14 -2 20 -18 q-4 22 -20 24 q-16 -2 -20 -24Z" fill="${SKIN2}" opacity=".8"/>
    <path d="M104 84 q8 -7 15 -1 M126 83 q8 -6 15 1" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <ellipse cx="112" cy="90" rx="6.5" ry="5" fill="${INK}"/><ellipse cx="133" cy="90" rx="6.5" ry="5" fill="${INK}"/>
    <ellipse cx="112" cy="90.5" rx="3" ry="2" fill="${c}" filter="url(#glow)"/><ellipse cx="133" cy="90.5" rx="3" ry="2" fill="${c}" filter="url(#glow)"/>
    <path d="M106 97 q6 4 12 0 M127 97 q6 4 12 0" stroke="${SKIN2}" stroke-width="1.6" fill="none"/>
    <path d="M122 92 l-3 10 h6" stroke="${SKIN2}" stroke-width="1.6" fill="none"/>
    <path d="${o.mouth ?? 'M114 108 q8 -4 16 0'}" stroke="${INK}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    ${o.stubble === false ? '' : `<g fill="${INK}" opacity=".45">${[[108,104],[112,110],[118,113],[126,113],[132,110],[136,104],[115,105],[129,105],[122,116]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r=".9"/>`).join('')}</g>`}`}
    ${o.head ?? `<path d="M99 84 q-2 -28 24 -30 q26 2 22 30 q-6 -14 -14 -16 q-4 6 -12 2 q-6 6 -10 2 q-6 2 -10 12Z" fill="${INK}"/><path d="M103 66 l-6 -8 M112 60 l-2 -10 M128 58 l4 -9 M140 66 l8 -5" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`}
  </g>
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="${o.armL ?? 'M88 136 L72 190 L74 238'}" stroke="${c}" stroke-opacity=".5" stroke-width="19"/>
    <path d="${o.armL ?? 'M88 136 L72 190 L74 238'}" stroke="${COAT}" stroke-width="16"/>
    <path d="${o.armR ?? 'M152 136 L172 180 L160 214'}" stroke="${c}" stroke-opacity=".5" stroke-width="19"/>
    <path d="${o.armR ?? 'M152 136 L172 180 L160 214'}" stroke="${COAT}" stroke-width="16"/>
  </g>
  <circle cx="${o.handL?.[0] ?? 74}" cy="${o.handL?.[1] ?? 244}" r="8" fill="${SKIN}"/>
  <circle cx="${o.handR?.[0] ?? 158}" cy="${o.handR?.[1] ?? 220}" r="8" fill="${SKIN}"/>`;
}
function svg(c, bg, back, body, front) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 360" role="img">
  <defs>
    <radialGradient id="aura" cx="50%" cy="42%" r="62%"><stop offset="0" stop-color="${c}" stop-opacity=".42"/><stop offset=".55" stop-color="${c}" stop-opacity=".08"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".16"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient>
    <filter id="glow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>
  </defs>
  <rect width="240" height="360" fill="${bg}"/>
  <rect width="240" height="360" fill="url(#aura)"/>
  <path d="M0 322 H240 V360 H0Z" fill="url(#floor)"/>
  ${back}
  <ellipse cx="121" cy="340" rx="72" ry="9" fill="#000" opacity=".55"/>
  ${body}
  ${front}
</svg>
`;
}
const bottle = (x, y, r, c, s = 1) => `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})"><path d="M-7 0 h14 v-30 q0 -6 -3 -9 v-13 h-8 v13 q-3 3 -3 9Z" fill="#12261a" stroke="${c}" stroke-width="1.4"/><rect x="-5" y="-22" width="10" height="12" fill="${c}" opacity=".5"/><path d="M-4 -3 v-8" stroke="${c}" stroke-opacity=".7"/></g>`;
const arts = {
  neutral: () => { const c = '#a9c4a4'; return svg(c, '#0d1310',
    `<circle cx="120" cy="150" r="96" fill="none" stroke="${c}" stroke-opacity=".3" stroke-width="2" stroke-dasharray="3 9"/><circle cx="120" cy="150" r="78" fill="none" stroke="${c}" stroke-opacity=".18" stroke-width="10"/>`,
    figure(c, { face: false, head: `<path d="M96 96 q-4 -46 26 -48 q30 2 26 48 q-2 14 -10 20 h-32 q-8 -6 -10 -20Z" fill="${COAT}" stroke="${c}" stroke-opacity=".55" stroke-width="1.5"/><ellipse cx="122" cy="92" rx="15" ry="19" fill="#050806"/><path d="M114 92 h4 M127 92 h4" stroke="${c}" stroke-width="2.4" stroke-linecap="round" filter="url(#glow)"/>` }),
    `<text x="120" y="92" font-family="Georgia,serif" font-size="0"></text>`); },
  alcohol: () => { const c = '#e3a53f'; return svg(c, '#130f08',
    `<path d="M150 20 h60 v120 h-60Z" fill="${c}" opacity=".07"/><path d="M180 20 v120 M150 80 h60" stroke="${c}" stroke-opacity=".2" stroke-width="2"/>` + bottle(40, 338, 0, c, .9) + bottle(60, 340, 84, c, .8) + bottle(204, 338, 0, c, .85),
    figure(c, { mouth: 'M113 109 q9 3 17 -2', armR: 'M152 136 L180 168 L176 196', handR: [176, 202],
      neck: `<path d="M118 122 l-6 34 l8 10 l8 -12 Z" fill="#5a1f1c" stroke="${c}" stroke-opacity=".4"/>` }) +
      `<ellipse cx="123" cy="99" rx="5" ry="4" fill="#c2543e" opacity=".85"/>`,
    bottle(178, 208, 14, c, 1.25) + `<g fill="${c}" filter="url(#glow)" opacity=".8"><circle cx="196" cy="140" r="1.6"/><circle cx="203" cy="126" r="1.2"/><circle cx="190" cy="118" r="1"/></g>` + `<path d="M186 340 q10 -4 22 0" stroke="${c}" stroke-opacity=".35" fill="none"/>`); },
  drugs: () => { const c = '#9ee37c'; return svg(c, '#0a100c',
    `<g fill="none" stroke="${c}" stroke-opacity=".28" stroke-width="2" stroke-linecap="round"><path d="M40 300 q-18 -40 6 -70 q22 -28 -2 -62 q-18 -28 4 -58"/><path d="M206 290 q16 -34 -4 -62 q-20 -30 2 -60 q14 -22 -2 -44"/><path d="M60 120 q10 -20 -2 -40"/></g><g filter="url(#soft)" fill="${c}" opacity=".12"><circle cx="48" cy="150" r="26"/><circle cx="200" cy="120" r="30"/></g>`,
    figure(c, { stubble: false, mouth: 'M115 109 h14', armL: 'M88 136 L66 176 L92 204', handL: [98, 206], armR: 'M152 136 L170 182 L140 204', handR: [134, 206],
      head: `<path d="M92 100 q-8 -54 30 -56 q38 2 30 56 q-2 -30 -12 -38 q-18 -8 -36 0 q-10 8 -12 38Z" fill="${COAT}" stroke="${c}" stroke-opacity=".6" stroke-width="1.5"/><path d="M100 76 q22 -14 44 0" stroke="#050806" stroke-width="7" fill="none" opacity=".7"/>` }) +
      `<g stroke="#4b5a48" stroke-width="1.2" fill="none"><path d="M104 96 q8 6 16 1 M125 97 q8 5 16 -1"/></g>`,
    `<g transform="translate(116 210)"><rect x="-13" y="-6" width="26" height="17" rx="3" fill="#1d2a22" stroke="${c}" stroke-width="1.3"/><g fill="${c}" filter="url(#glow)"><circle cx="-6" cy="0" r="2.4"/><circle cx="2" cy="0" r="2.4"/><circle cx="-6" cy="6" r="2.4"/></g><circle cx="2" cy="6" r="2.4" fill="none" stroke="${c}" stroke-opacity=".5"/><circle cx="9" cy="3" r="2.4" fill="none" stroke="${c}" stroke-opacity=".5"/></g>` +
    `<g fill="${c}" opacity=".75">${[[70,336,20],[92,341,-30],[168,338,60],[186,342,10],[150,343,-50]].map(([x,y,r])=>`<rect x="${x}" y="${y}" width="9" height="4" rx="2" transform="rotate(${r} ${x} ${y})"/>`).join('')}</g>`); },
  gambling: () => { const c = '#e5574b'; const card = (x, y, r, s) => `<g transform="translate(${x} ${y}) rotate(${r})"><rect x="-11" y="-32" width="22" height="32" rx="3" fill="#e9e3d2" stroke="${INK}"/><text x="0" y="-10" text-anchor="middle" font-size="15" font-family="Georgia,serif" fill="${s === '♠' || s === '♣' ? INK : c}">${s}</text></g>`;
    const chip = (x, y, k) => `<g><ellipse cx="${x}" cy="${y}" rx="11" ry="4" fill="${k}" stroke="${INK}"/><ellipse cx="${x}" cy="${y - 3}" rx="11" ry="4" fill="${k}" stroke="${INK}"/><ellipse cx="${x}" cy="${y - 3}" rx="6" ry="2" fill="none" stroke="#e9e3d2" stroke-opacity=".7"/></g>`;
    return svg(c, '#120a0a',
    `<g font-family="Georgia,serif" font-weight="700" font-size="54" fill="${c}" opacity=".16" text-anchor="middle"><text x="120" y="70" letter-spacing="10">777</text></g><g stroke="${c}" stroke-opacity=".14" stroke-width="2">${[0,1,2,3,4,5,6,7].map(i=>`<path d="M120 150 L${120+200*Math.cos(i*Math.PI/4+.3)} ${150+200*Math.sin(i*Math.PI/4+.3)}"/>`).join('')}</g>` + chip(44, 340, c) + chip(52, 334, '#27433a') + chip(200, 340, '#27433a'),
    figure(c, { mouth: 'M114 110 q8 -5 16 -1', armR: 'M152 136 L182 160 L176 182', handR: [176, 190],
      neck: `<path d="M106 120 l14 12 l14 -12 l6 8 l-20 26 l-20 -26Z" fill="#d9d2bf" opacity=".85"/><path d="M118 132 l-3 34 l5 6 l5 -6 l-3 -34Z" fill="${c}"/>`,
      head: `<path d="M99 82 q-2 -28 24 -30 q26 2 22 30 q-8 -16 -22 -16 q-14 0 -24 16Z" fill="${INK}"/><path d="M96 70 h54 l-8 -6 q-18 -22 -38 0Z" fill="#1b1414" stroke="${c}" stroke-opacity=".6"/>` }),
    card(160, 188, -34, '♠') + card(170, 184, -12, '♥') + card(181, 184, 10, '♦') + card(192, 189, 32, '♣') + `<circle cx="176" cy="192" r="8" fill="${SKIN}"/>` +
    `<g transform="translate(88 334) rotate(-14)"><rect x="-8" y="-8" width="16" height="16" rx="3" fill="#e9e3d2" stroke="${INK}"/><circle cx="-3" cy="-3" r="1.6" fill="${INK}"/><circle cx="3" cy="3" r="1.6" fill="${INK}"/></g><path d="M150 338 l20 -3 l2 5 l-20 3Z" fill="#e9e3d2" opacity=".6"/>`); },
  games: () => { const c = '#5ad2ea'; const can = (x, r) => `<g transform="translate(${x} 340) rotate(${r})"><rect x="-6" y="-22" width="12" height="22" rx="2" fill="#16242a" stroke="${c}"/><path d="M-2 -17 l4 5 h-4 l4 6" stroke="${c}" fill="none" filter="url(#glow)"/></g>`;
    return svg(c, '#081014',
    `<rect x="38" y="36" width="164" height="104" rx="6" fill="${c}" opacity=".13" stroke="${c}" stroke-opacity=".5" stroke-width="2"/><g stroke="${c}" stroke-opacity=".28">${[52,68,84,100,116].map(y=>`<path d="M48 ${y} H${120 + (y * 7) % 70}"/>`).join('')}</g><path d="M112 140 h16 v12 h18 v5 h-52 v-5 h18Z" fill="${c}" opacity=".2"/>` + can(46, 0) + can(64, 80) + can(198, -6),
    figure(c, { stubble: false, mouth: 'M116 109 h12', armL: 'M88 136 L74 184 L104 204', handL: [108, 206], armR: 'M152 136 L170 184 L140 204', handR: [136, 206],
      head: `<path d="M99 84 q-2 -28 24 -30 q26 2 22 30 q-6 -12 -12 -14 q-6 8 -14 2 q-10 4 -20 12Z" fill="${INK}"/><path d="M98 86 q0 -40 25 -40 q25 0 25 40" fill="none" stroke="#22323a" stroke-width="6"/><path d="M98 86 q0 -40 25 -40 q25 0 25 40" fill="none" stroke="${c}" stroke-width="1.2" stroke-opacity=".8"/><rect x="92" y="78" width="10" height="20" rx="4" fill="#22323a" stroke="${c}"/><rect x="144" y="78" width="10" height="20" rx="4" fill="#22323a" stroke="${c}"/><path d="M96 98 q2 14 16 14" stroke="${c}" fill="none" stroke-width="1.6"/><circle cx="113" cy="112" r="2.4" fill="${c}" filter="url(#glow)"/>` }),
    `<g transform="translate(122 210)"><path d="M-24 -8 q24 -8 48 0 q8 14 4 20 q-8 4 -14 -8 h-28 q-6 12 -14 8 q-4 -6 4 -20Z" fill="#1a2a31" stroke="${c}" stroke-width="1.4"/><path d="M-14 -2 v8 M-18 2 h8" stroke="${c}" stroke-width="2"/><g fill="${c}" filter="url(#glow)"><circle cx="12" cy="0" r="2"/><circle cx="18" cy="4" r="2"/></g></g>` +
    `<text x="120" y="26" text-anchor="middle" font-family="monospace" font-size="11" fill="${c}" opacity=".7" letter-spacing="2">05:47</text>`); },
  phone: () => { const c = '#8fb6ff'; const bub = (x, y, t) => `<g transform="translate(${x} ${y})"><rect x="-13" y="-9" width="26" height="18" rx="9" fill="#1a2440" stroke="${c}" stroke-opacity=".8"/><text y="4" text-anchor="middle" font-size="10" font-family="Arial,sans-serif" fill="${c}">${t}</text></g>`;
    return svg(c, '#090c14',
    bub(46, 96, '♥ 9') + bub(200, 70, '+1') + bub(58, 170, '•••') + bub(196, 150, '99+') + `<g opacity=".5">` + bub(34, 236, '!') + bub(206, 232, '@') + `</g>`,
    `<path d="M150 196 L98 74 L148 68 L168 190Z" fill="${c}" opacity=".16"/>` +
    figure(c, { stubble: false, mouth: 'M116 110 q6 2 12 0', armR: 'M152 136 L168 186 L158 200', handR: [158, 206] }) +
    `<path d="M100 74 l44 -5 l4 40 q-22 18 -44 4Z" fill="${c}" opacity=".2"/>`,
    `<g transform="translate(158 196) rotate(-18)"><rect x="-11" y="-20" width="22" height="38" rx="4" fill="#0c1220" stroke="${c}" stroke-width="1.5"/><rect x="-8" y="-16" width="16" height="29" rx="1.5" fill="${c}" filter="url(#glow)" opacity=".9"/></g>` +
    `<path d="M150 214 q-20 30 -42 -10 q-10 -30 14 -84" fill="none" stroke="${c}" stroke-opacity=".6" stroke-width="1.6" stroke-dasharray="5 4"/>`); },
  nicotine: () => { const c = '#ff8d3f'; return svg(c, '#110d0a',
    `<g fill="none" stroke="#cfcabc" stroke-linecap="round" opacity=".28"><path d="M150 96 q22 -16 6 -40 q-14 -22 10 -44" stroke-width="7"/><path d="M158 100 q34 -10 26 -44 q-6 -22 14 -38" stroke-width="4"/><path d="M146 90 q8 -26 -8 -40" stroke-width="3"/></g><g filter="url(#soft)" fill="#cfcabc" opacity=".14"><circle cx="170" cy="40" r="34"/><circle cx="110" cy="30" r="26"/><circle cx="60" cy="60" r="22"/></g>`,
    figure(c, { mouth: 'M114 109 h16', armR: 'M152 136 L176 170 L152 126', handR: [148, 118] }),
    `<g transform="rotate(8 140 110)"><rect x="128" y="108" width="24" height="4" rx="2" fill="#e9e3d2"/><rect x="149" y="108" width="6" height="4" rx="2" fill="${c}" filter="url(#glow)"/></g>` +
    `<g fill="#e9e3d2" opacity=".7">${[[46,338,10],[60,342,-40],[78,339,70],[176,341,20],[194,338,-20],[208,342,50],[160,344,-70]].map(([x,y,r])=>`<rect x="${x}" y="${y}" width="10" height="3" rx="1.5" transform="rotate(${r} ${x} ${y})"/>`).join('')}</g>` +
    `<g transform="translate(74 262) rotate(-10)"><rect x="-10" y="-14" width="20" height="28" rx="2" fill="#2a1d14" stroke="${c}"/><rect x="-10" y="-14" width="20" height="8" fill="${c}" opacity=".6"/></g>`); },
  shopping: () => { const c = '#ff7fbd'; const bag = (x, y, w, hh, k) => `<g transform="translate(${x} ${y})"><path d="M${-w/2+5} 0 q0 -16 ${w/2-5} -16 q${w/2-5} 0 ${w/2-5} 16" fill="none" stroke="${c}" stroke-width="1.6"/><path d="M${-w/2} 0 h${w} l4 ${hh} h${-w-8}Z" fill="${k}" stroke="${c}" stroke-width="1.3"/><text y="${hh/2+5}" text-anchor="middle" font-size="13" font-family="Georgia,serif" fill="${c}">%</text></g>`;
    const box = (x, y, w, hh) => `<g><rect x="${x}" y="${y - hh}" width="${w}" height="${hh}" fill="#241a20" stroke="${c}" stroke-opacity=".7"/><path d="M${x} ${y - hh/2} h${w} M${x + w/2} ${y - hh} v${hh}" stroke="${c}" stroke-opacity=".4"/></g>`;
    return svg(c, '#120a10',
    `<g font-family="Georgia,serif" font-weight="700" fill="${c}" opacity=".16" text-anchor="middle"><text x="60" y="80" font-size="44" transform="rotate(-12 60 80)">−70%</text><text x="186" y="130" font-size="30" transform="rotate(10 186 130)">SALE</text></g>` + box(22, 340, 36, 26) + box(30, 314, 24, 18) + box(186, 340, 38, 30) + box(194, 310, 22, 16),
    figure(c, { stubble: false, mouth: 'M114 108 q8 5 16 0', armL: 'M88 136 L66 186 L64 226', handL: [64, 232], armR: 'M152 136 L176 186 L178 226', handR: [178, 232] }),
    bag(54, 244, 34, 44, '#2a1420') + bag(76, 250, 26, 34, '#1d1420') + bag(186, 244, 36, 46, '#2a1420') + bag(164, 252, 24, 32, '#1d1420') +
    `<g transform="translate(120 330) rotate(-8)"><rect x="-17" y="-10" width="34" height="21" rx="3" fill="#e9e3d2" stroke="${INK}"/><rect x="-17" y="-5" width="34" height="5" fill="${INK}"/><text x="0" y="8" text-anchor="middle" font-size="7" font-family="monospace" fill="${c}">0.00</text></g>`); },
};
for (const [id, make] of Object.entries(arts)) await writeFile(`${out}/${id}.svg`, make());
