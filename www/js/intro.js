/*
 * Вступление «12 шагов»: фигура в капюшоне зажигает огонь и раскрывает книгу,
 * из страниц поднимаются строки, в конце — название.
 * Картинка нарисована в SVG/CSS, огонь и искры — на canvas, звук синтезируется
 * через Web Audio прямо в браузере (без аудиофайлов).
 */
(function () {
  'use strict';

  var KEY = 'twelve-steps:intro';
  var LINES = [
    'Эту книгу никто не напишет за тебя.',
    'В ней двенадцать шагов — и ни одного приговора.',
    'Можно сомневаться. Можно идти в своём темпе.',
    'Каждая страница — честность. Каждая строка — выбор.'
  ];
  var TITLE = '12 шагов';
  var SUBTITLE = 'Книга, которую пишешь ты';
  var GO = 'Начать путь';

  /* ---------------- настройки ---------------- */

  function settings() {
    var s = { auto: true, sound: true };
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || '{}');
      if (typeof raw.auto === 'boolean') s.auto = raw.auto;
      if (typeof raw.sound === 'boolean') s.sound = raw.sound;
    } catch (e) { /* по умолчанию */ }
    return s;
  }
  function setSetting(k, v) {
    var s = settings();
    s[k] = v;
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* не критично */ }
  }

  /* ---------------- графика ---------------- */

  function rng(seed) {
    return function () {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  }

  /* «рукописные» строки чернилами */
  function scribble(r, x0, x1, y0, y1, gap) {
    var d = '';
    for (var y = y0; y <= y1; y += gap) {
      var x = x0 + r() * 3;
      var end = x1 - r() * 10;
      while (x < end) {
        var nx = Math.min(end, x + 3 + r() * 7);
        d += 'M' + x.toFixed(1) + ' ' + y.toFixed(1);
        for (var k = x + 1.2; k < nx; k += 1.2) d += 'L' + k.toFixed(1) + ' ' + (y + (r() - 0.5) * 2.4).toFixed(1);
        x = nx + 1.6 + r() * 2.2;
      }
    }
    return '<path d="' + d + '" fill="none" stroke="#6e1f10" stroke-opacity=".72" stroke-width=".55" stroke-linecap="round" stroke-linejoin="round"/>';
  }

  function pageSvg(inner) {
    return '<svg viewBox="0 0 100 97" preserveAspectRatio="none" aria-hidden="true">' + inner + '</svg>';
  }

  function rightPage() {
    var r = rng(7), ticks = '', dots = '';
    for (var i = 0; i < 12; i++) {
      var a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      ticks += 'M' + (50 + Math.cos(a) * 14).toFixed(1) + ' ' + (28 + Math.sin(a) * 14).toFixed(1) +
        'L' + (50 + Math.cos(a) * 20).toFixed(1) + ' ' + (28 + Math.sin(a) * 20).toFixed(1);
      dots += '<circle cx="' + (50 + Math.cos(a) * 24).toFixed(1) + '" cy="' + (28 + Math.sin(a) * 24).toFixed(1) + '" r="1.3" fill="#7a2412" fill-opacity=".75"/>';
    }
    return pageSvg(
      '<g fill="none" stroke="#7a2412" stroke-opacity=".8" stroke-width=".7">' +
        '<circle cx="50" cy="28" r="20"/><circle cx="50" cy="28" r="14"/><path d="' + ticks + '"/>' +
        '<path d="M42 35h4v-4h4v-4h4v-4h4" stroke-width="1.1"/></g>' + dots +
      scribble(r, 4, 96, 58, 94, 6.5));
  }

  function leftPage() {
    var r = rng(11);
    return pageSvg(
      '<g fill="none" stroke="#7a2412" stroke-opacity=".8" stroke-width=".8" stroke-linecap="round">' +
        '<path d="M24 44c-6-9 3-15 1-25 8 7 13 16 6 25z"/>' +
        '<path d="M27 40c-2-4 1-7 1-11 3 4 4 8 1 11z" stroke-opacity=".6"/>' +
        '<path d="M12 50c6-6 22-6 28 0-6 5-22 5-28 0z"/>' +
        '<path d="M16 51c-2 4-2 8 0 12M36 51c2 4 2 8 0 12"/></g>' +
      scribble(r, 52, 96, 8, 50, 6) +
      scribble(r, 4, 96, 62, 94, 6.5) +
      '<circle cx="86" cy="86" r="6" fill="#8a1c10" fill-opacity=".35"/>');
  }

  function plainPage(seed) {
    return pageSvg(scribble(rng(seed), 4, 96, 6, 94, 6.5));
  }

  function emblem() {
    var notches = '';
    for (var i = 0; i < 12; i++) {
      var a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      var x = 50 + Math.cos(a) * 36, y = 50 + Math.sin(a) * 36;
      notches += '<path d="M' + x.toFixed(1) + ' ' + (y - 3).toFixed(1) + 'l2.4 3-2.4 3-2.4-3z"/>';
    }
    return '<svg viewBox="0 0 100 100" aria-hidden="true"><g fill="#c9a052" fill-opacity=".85" stroke="none">' + notches + '</g>' +
      '<g fill="none" stroke="#c9a052" stroke-opacity=".85" stroke-width="2">' +
      '<circle cx="50" cy="50" r="44"/><circle cx="50" cy="50" r="29"/>' +
      '<path d="M34 64h8v-8h8v-8h8v-8h8" stroke-width="3"/></g></svg>';
  }

  /* палец: сужающийся контур вдоль кривой Безье, с утолщениями-суставами */
  function finger(c, w0, w1) {
    var L = [], R = [], N = 16;
    for (var i = 0; i <= N; i++) {
      var t = i / N, m = 1 - t;
      var x = m * m * m * c[0] + 3 * m * m * t * c[2] + 3 * m * t * t * c[4] + t * t * t * c[6];
      var y = m * m * m * c[1] + 3 * m * m * t * c[3] + 3 * m * t * t * c[5] + t * t * t * c[7];
      var dx = 3 * m * m * (c[2] - c[0]) + 6 * m * t * (c[4] - c[2]) + 3 * t * t * (c[6] - c[4]);
      var dy = 3 * m * m * (c[3] - c[1]) + 6 * m * t * (c[5] - c[3]) + 3 * t * t * (c[7] - c[5]);
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var w = (w0 + (w1 - w0) * t) / 2 * (1 + 0.16 * Math.exp(-Math.pow((t - 0.42) / 0.07, 2)) + 0.12 * Math.exp(-Math.pow((t - 0.74) / 0.06, 2)));
      L.push((x - dy / len * w).toFixed(1) + ' ' + (y + dx / len * w).toFixed(1));
      R.push((x + dy / len * w).toFixed(1) + ' ' + (y - dx / len * w).toFixed(1));
    }
    var r = (w1 / 2).toFixed(1);
    return 'M' + L.join('L') + 'A' + r + ' ' + r + ' 0 0 0 ' + R[N] + 'L' + R.slice(0, N).reverse().join('L') + 'Z';
  }
  function hand(fingers, palm, fill) {
    return '<g fill="' + fill + '" stroke="#3a140c" stroke-opacity=".55" stroke-width=".8" stroke-linejoin="round">' +
      fingers.map(function (f) { return '<path d="' + finger(f[0], f[1], f[2]) + '"/>'; }).join('') +
      '<path d="' + palm + '"/></g>';
  }
  var HAND_L = hand([
    [[90, 152, 87, 133, 85, 120, 83, 106], 6.2, 3.6],
    [[96, 149, 96, 128, 97, 114, 98, 100], 6.4, 3.8],
    [[102, 150, 105, 131, 108, 120, 111, 108], 5.8, 3.4],
    [[107, 154, 113, 142, 117, 134, 121, 126], 5, 3],
    [[87, 163, 79, 156, 73, 150, 68, 143], 6.6, 4]
  ], 'M84 177C80 166 81 156 86 148C93 144 104 145 109 151C112 159 110 169 105 177C99 181 90 181 84 177Z', 'url(#ixSkin)');
  var HAND_R = hand([
    [[293, 472, 287, 488, 283, 498, 280, 509], 5.8, 3.4],
    [[300, 476, 298, 494, 297, 505, 297, 517], 6, 3.6],
    [[307, 476, 309, 494, 311, 504, 313, 515], 5.8, 3.4],
    [[313, 471, 319, 485, 323, 494, 327, 502], 5, 3],
    [[292, 463, 282, 467, 274, 473, 268, 481], 6.2, 3.8]
  ], 'M292 438C299 436 308 436 314 439L319 468C321 477 313 482 303 482C293 482 285 477 287 468Z', 'url(#ixSkinR)');

  function leaf(cls, back) {
    return '<div class="ix-leaf ' + cls + '"><div class="face front"></div><div class="face back ix-page">' + back + '</div></div>';
  }

  var FIGURE =
    '<svg class="ix-figure" viewBox="0 0 400 720" aria-hidden="true"><defs>' +
      '<radialGradient id="ixHalo" cx="200" cy="250" r="320" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#8a2a18" stop-opacity=".55"/><stop offset=".5" stop-color="#3a0d14" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="ixRobe" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6e2018"/><stop offset=".38" stop-color="#3c1119"/><stop offset=".75" stop-color="#211024"/><stop offset="1" stop-color="#120a20"/></linearGradient>' +
      '<linearGradient id="ixShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".5" stop-color="#000" stop-opacity=".3"/><stop offset="1" stop-color="#000" stop-opacity=".85"/></linearGradient>' +
      '<linearGradient id="ixHood" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#a3361f"/><stop offset=".3" stop-color="#5e171a"/><stop offset=".7" stop-color="#2e0f28"/><stop offset="1" stop-color="#170a1e"/></linearGradient>' +
      '<linearGradient id="ixSleeveL" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c04a2a"/><stop offset=".45" stop-color="#621b1c"/><stop offset="1" stop-color="#28091c"/></linearGradient>' +
      '<linearGradient id="ixSleeveR" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7a2236"/><stop offset=".5" stop-color="#40142e"/><stop offset="1" stop-color="#1c0c28"/></linearGradient>' +
      '<radialGradient id="ixVoid" cx=".5" cy=".42" r=".62"><stop offset="0" stop-color="#000"/><stop offset=".78" stop-color="#030102"/><stop offset="1" stop-color="#220708"/></radialGradient>' +
      '<linearGradient id="ixRim" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffb070"/><stop offset=".35" stop-color="#c2542c" stop-opacity=".7"/><stop offset=".7" stop-color="#5a1a2a" stop-opacity=".4"/><stop offset="1" stop-color="#7a5aa8" stop-opacity=".45"/></linearGradient>' +
      '<linearGradient id="ixSkin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe6bf"/><stop offset=".5" stop-color="#d9a780"/><stop offset="1" stop-color="#7d5544"/></linearGradient>' +
      '<radialGradient id="ixOrb" cx="98" cy="84" r="130" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff3cf" stop-opacity=".95"/><stop offset=".12" stop-color="#ffc86a" stop-opacity=".8"/><stop offset=".35" stop-color="#ff7a20" stop-opacity=".32"/><stop offset="1" stop-color="#ff4a10" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="ixFire" cx="95" cy="110" r="280" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ff9a40" stop-opacity=".45"/><stop offset=".5" stop-color="#ff6a20" stop-opacity=".12"/><stop offset="1" stop-color="#ff6a20" stop-opacity="0"/></radialGradient>' +
      '<clipPath id="ixVoidClip"><path d="M200 138C170 140 152 170 151 212C150 258 168 296 200 318C232 296 250 258 249 212C248 170 230 140 200 138Z"/></clipPath>' +
      '<radialGradient id="ixUnder" cx=".5" cy=".75" r=".6"><stop offset="0" stop-color="#ffb25a" stop-opacity=".55"/><stop offset="1" stop-color="#ff7a20" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="ixGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe7a3"/><stop offset=".5" stop-color="#c08a3a"/><stop offset="1" stop-color="#6a4214"/></linearGradient>' +
    '</defs>' +
    '<rect width="400" height="720" fill="url(#ixHalo)"/>' +
    /* мантия */
    '<path d="M112 262C86 300 70 350 62 420C52 520 34 620 14 720H386C366 620 348 520 338 420C330 350 314 300 288 262Z" fill="url(#ixRobe)"/>' +
    '<g fill="none" stroke-linecap="round">' +
      '<path d="M150 340C140 450 120 580 100 720" stroke="#000" stroke-opacity=".35" stroke-width="5"/>' +
      '<path d="M145 342C135 450 115 580 94 720" stroke="#ff9a60" stroke-opacity=".1" stroke-width="2"/>' +
      '<path d="M250 340C262 450 282 590 300 720" stroke="#000" stroke-opacity=".35" stroke-width="5"/>' +
      '<path d="M120 360C100 470 80 600 60 720" stroke="#000" stroke-opacity=".25" stroke-width="4"/>' +
      '<path d="M285 360C305 480 320 600 345 720" stroke="#000" stroke-opacity=".3" stroke-width="4"/>' +
      '<path d="M188 352C186 470 182 600 178 720M212 352C214 470 218 600 222 720" stroke="url(#ixGold)" stroke-opacity=".4" stroke-width="2.4"/>' +
    '</g>' +
    '<path d="M112 262C86 300 70 350 62 420C52 520 34 620 14 720H386C366 620 348 520 338 420C330 350 314 300 288 262Z" fill="url(#ixShade)"/>' +
    /* правый рукав (к книге) */
    '<path d="M262 296C300 316 328 360 338 420C341 436 334 446 322 448L290 452C280 452 276 444 278 436C276 390 262 350 240 320Z" fill="url(#ixSleeveR)" stroke="#ff9a70" stroke-opacity=".18" stroke-width="1.5"/>' +
    '<path d="M282 330C300 360 312 395 316 430" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="3"/>' +
    '<path d="M279 444C292 452 312 452 334 440" fill="none" stroke="url(#ixGold)" stroke-opacity=".6" stroke-width="2"/>' +
    /* капюшон */
    '<path d="M200 76C170 86 134 112 124 166C116 210 118 250 108 282C100 308 92 330 104 346C138 332 170 328 200 330C230 328 262 332 296 346C308 330 300 308 292 282C282 250 284 210 276 166C266 112 230 86 200 76Z" fill="url(#ixHood)"/>' +
    '<g fill="none" stroke="#000" stroke-opacity=".3" stroke-linecap="round">' +
      '<path d="M200 82C186 110 176 140 170 160M200 82C214 110 226 140 232 160" stroke-width="3"/>' +
      '<path d="M130 200C128 240 122 270 114 300M270 200C272 240 278 270 286 300" stroke-width="4"/></g>' +
    '<path d="M200 126C162 128 140 166 139 212C138 264 162 306 200 332C238 306 262 264 261 212C260 166 238 128 200 126Z" fill="#2a0a0e" stroke="url(#ixRim)" stroke-width="3"/>' +
    '<path d="M200 138C170 140 152 170 151 212C150 258 168 296 200 318C232 296 250 258 249 212C248 170 230 140 200 138Z" fill="url(#ixVoid)"/>' +
    '<g class="ix-voidglow" clip-path="url(#ixVoidClip)"><ellipse cx="200" cy="318" rx="60" ry="46" fill="url(#ixUnder)"/></g>' +
    '<path d="M150 334C170 350 190 352 200 350C210 352 230 350 250 334" fill="none" stroke="url(#ixGold)" stroke-opacity=".8" stroke-width="2"/>' +
    '<circle cx="200" cy="350" r="9" fill="url(#ixGold)"/><circle cx="200" cy="350" r="4" fill="#3a0a0a"/>' +
    /* левый рукав (поднят) */
    '<path d="M108 318C92 280 76 236 66 194C64 186 72 180 82 178L112 174C122 173 126 180 124 188C132 226 146 262 164 292Z" fill="url(#ixSleeveL)"/>' +
    '<path d="M96 200C104 240 118 270 136 300" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="3"/>' +
    '<ellipse cx="95" cy="179" rx="27" ry="7" transform="rotate(-8 95 179)" fill="#1a0507" stroke="url(#ixGold)" stroke-opacity=".6" stroke-width="1.6"/>' +
    /* отсвет огня */
    '<g class="ix-firelight"><rect width="400" height="720" fill="url(#ixFire)" style="mix-blend-mode:screen"/></g>' +
    '<g class="ix-orbglow"><circle cx="98" cy="84" r="130" fill="url(#ixOrb)"/></g>' +
    /* левая кисть с огнём */
    HAND_L +
    '</svg>';

  var FRONT =
    '<svg class="ix-front" viewBox="0 0 400 720" aria-hidden="true"><defs>' +
      '<linearGradient id="ixSkinR" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d8b294"/><stop offset="1" stop-color="#6d4b45"/></linearGradient>' +
    '<linearGradient id="ixCuffR" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5a1a33"/><stop offset="1" stop-color="#24102c"/></linearGradient>' +
    '</defs>' + HAND_R +
    '<path d="M281 432C294 440 316 440 333 430L335 441C318 452 293 453 280 444Z" fill="url(#ixCuffR)"/>' +
    '<path d="M280 444C293 453 318 452 335 441" fill="none" stroke="#d9a650" stroke-opacity=".7" stroke-width="2"/>' +
    '</svg>';

  var ICON_SOUND = '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11"/></svg>';
  var ICON_MUTE = '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6"/></svg>';

  function buildDom() {
    var root = document.createElement('div');
    root.className = 'intro';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Вступление');
    root.innerHTML =
      '<div class="ix-sky"></div><div class="ix-smoke"><span></span><span></span><span></span></div>' +
      '<div class="ix-camera"><div class="ix-scene">' + FIGURE +
        '<div class="ix-beam"></div>' +
        '<div class="ix-book-wrap"><div class="ix-book">' +
          '<div class="ix-half l"><div class="ix-block"></div></div>' +
          '<div class="ix-half r"><div class="ix-block"></div><div class="ix-page">' + rightPage() + '</div>' +
            leaf('f1', leftPage()) + leaf('f2', plainPage(3)) + leaf('f3', plainPage(5)) + leaf('f4', plainPage(9)) +
            '<div class="ix-cover"><div class="face front">' + emblem() + '</div><div class="face back"></div></div>' +
          '</div>' +
          '<div class="ix-pageglow"></div>' +
        '</div></div>' +
        FRONT +
        '<i class="ix-m ix-m-orb" style="left:24.5%;top:11.7%"></i>' +
        '<i class="ix-m ix-m-book" style="left:50%;top:79%"></i>' +
        '<i class="ix-m ix-m-focus" style="left:50%;top:58%"></i>' +
      '</div></div>' +
      '<div class="ix-dim"></div>' +
      '<canvas class="ix-fx"></canvas>' +
      '<div class="ix-flash"></div>' +
      '<div class="ix-lines" aria-live="polite"></div>' +
      '<div class="ix-final"><h1 class="ix-title">' + TITLE + '</h1><p class="ix-sub">' + SUBTITLE + '</p></div>' +
      '<button class="ix-go" type="button">' + GO + '</button>' +
      '<div class="ix-tap">Коснись, чтобы открыть книгу</div>' +
      '<div class="ix-ui"><button class="ix-btn ix-sound" type="button"></button>' +
        '<button class="ix-btn ix-skip" type="button">Пропустить</button></div>';
    return root;
  }

  /* ---------------- частицы ---------------- */

  function sprite(r, g, b) {
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var x = c.getContext('2d');
    var gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',1)');
    gr.addColorStop(0.35, 'rgba(' + r + ',' + g + ',' + b + ',.45)');
    gr.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 64, 64);
    return c;
  }

  function Fx(root, reduce) {
    var canvas = root.querySelector('.ix-fx');
    var g = canvas.getContext('2d');
    var scene = root.querySelector('.ix-scene');
    var mOrb = root.querySelector('.ix-m-orb');
    var mBook = root.querySelector('.ix-m-book');
    var S = { white: sprite(255, 250, 230), yellow: sprite(255, 200, 90), orange: sprite(255, 120, 30), red: sprite(200, 40, 10), gold: sprite(255, 214, 130) };
    var parts = [];
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0, raf = 0, last = 0, alive = true;
    var self = { orb: false, stream: false, embers: 10 };

    function size() {
      W = root.clientWidth; H = root.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    window.addEventListener('resize', size);

    function pos(el) {
      var r = el.getBoundingClientRect();
      return { x: r.left, y: r.top };
    }
    function unit() { return scene.getBoundingClientRect().height / 720; }
    function add(p) { if (parts.length < (reduce ? 150 : 650)) parts.push(p); }
    function rnd(a, b) { return a + Math.random() * (b - a); }

    self.burst = function (where, n, power) {
      var p = where === 'orb' ? pos(mOrb) : pos(mBook), u = unit();
      for (var i = 0; i < n; i++) {
        var a = rnd(-Math.PI * 0.95, -Math.PI * 0.05), v = rnd(40, 200) * u * (power || 1);
        add({ k: 'spark', x: p.x + rnd(-30, 30) * u, y: p.y + rnd(-6, 6) * u, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: rnd(0.8, 1.8), s: rnd(1.5, 3.4) * u });
      }
    };
    self.dissolve = function (rect) {
      var u = unit();
      for (var i = 0; i < (reduce ? 25 : 90); i++) {
        add({ k: 'dust', x: rnd(rect.left, rect.right), y: rnd(rect.top, rect.bottom), vx: rnd(-12, 12), vy: rnd(-70, -20), t: 0, life: rnd(0.9, 1.9), s: rnd(1.4, 3) * u });
      }
    };

    function tick(now) {
      if (!alive) return;
      var dt = Math.min(0.05, (now - (last || now)) / 1000);
      last = now;
      var u = unit();
      g.clearRect(0, 0, W, H);
      g.globalCompositeOperation = 'lighter';

      /* угольки в воздухе */
      var n = self.embers * dt * (reduce ? 0.3 : 1);
      while (n > 0) {
        if (Math.random() < n) add({ k: 'ember', x: rnd(0, W), y: H + 10, vx: 0, vy: -rnd(18, 45) * u, ph: rnd(0, 6), t: 0, life: rnd(4, 8), s: rnd(1, 2.4) * u });
        n -= 1;
      }

      var orb = pos(mOrb);
      if (self.orb) {
        for (var i = 0; i < (reduce ? 2 : 4); i++) {
          add({ k: 'flame', x: orb.x + rnd(-8, 8) * u, y: orb.y + rnd(0, 12) * u, vx: rnd(-14, 14) * u, vy: -rnd(45, 100) * u, t: 0, life: rnd(0.35, 0.7), s: rnd(4, 8) * u });
        }
        var fl = 0.8 + Math.random() * 0.2;
        g.globalAlpha = 0.3 * fl;
        g.drawImage(S.orange, orb.x - 85 * u, orb.y - 80 * u, 170 * u, 170 * u);
        g.globalAlpha = 0.4 * fl;
        g.drawImage(S.yellow, orb.x - 24 * u, orb.y - 16 * u, 48 * u, 48 * u);
        g.globalAlpha = 0.6 * fl;
        g.drawImage(S.white, orb.x - 9 * u, orb.y - 2 * u, 18 * u, 18 * u);
      }
      if (self.stream) {
        var bk = pos(mBook);
        for (var j = 0; j < (reduce ? 1 : 3); j++) {
          add({ k: 'stream', s0: orb, s1: bk, t: 0, life: rnd(1.1, 1.6), ph: rnd(0, 6), amp: rnd(4, 14) * u, s: rnd(1.6, 3.4) * u });
        }
      }

      for (var p = parts.length - 1; p >= 0; p--) {
        var q = parts[p];
        q.t += dt;
        var k = q.t / q.life;
        if (k >= 1) { parts.splice(p, 1); continue; }
        var img = S.gold, a = 1, s = q.s;
        if (q.k === 'ember') {
          q.x += Math.sin(q.t * 1.7 + q.ph) * 14 * u * dt;
          q.y += q.vy * dt;
          a = Math.min(1, k * 6) * (1 - k) * (0.6 + 0.4 * Math.sin(q.t * 9 + q.ph));
          img = k < 0.5 ? S.orange : S.red;
        } else if (q.k === 'flame') {
          q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.96;
          s = q.s * (1 - k * 0.8);
          img = k < 0.12 ? S.white : k < 0.4 ? S.yellow : k < 0.7 ? S.orange : S.red;
          a = 0.5 * (1 - k);
        } else if (q.k === 'spark') {
          q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.97; q.vy = q.vy * 0.97 + 25 * u * dt;
          img = k < 0.3 ? S.white : S.gold;
          a = 1 - k;
        } else if (q.k === 'dust') {
          q.x += q.vx * dt; q.y += q.vy * dt;
          img = k < 0.3 ? S.yellow : S.orange;
          a = (1 - k) * 0.9;
        } else if (q.k === 'stream') {
          var e = k * k * (3 - 2 * k);
          var cx = q.s0.x + 90 * u, cy = Math.min(q.s0.y, q.s1.y) + 60 * u;
          var mx = (1 - e) * (1 - e) * q.s0.x + 2 * (1 - e) * e * cx + e * e * q.s1.x;
          var my = (1 - e) * (1 - e) * q.s0.y + 2 * (1 - e) * e * cy + e * e * q.s1.y;
          q.x = mx + Math.sin(q.t * 7 + q.ph) * q.amp;
          q.y = my + Math.cos(q.t * 6 + q.ph) * q.amp * 0.6;
          img = Math.random() < 0.15 ? S.white : S.gold;
          a = Math.sin(k * Math.PI);
        }
        g.globalAlpha = Math.max(0, Math.min(1, a));
        g.drawImage(img, q.x - s * 2, q.y - s * 2, s * 4, s * 4);
      }
      g.globalAlpha = 1;
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    self.stop = function () {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
    };
    return self;
  }

  /* ---------------- звук ---------------- */

  function Sound(muted, external) {
    var AC = window.AudioContext || window.webkitAudioContext;
    var ctx = external;
    if (!ctx) {
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
    }
    var sr = ctx.sampleRate;

    var out = ctx.createGain();
    out.gain.value = muted ? 0 : 1;
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4;
    comp.attack.value = 0.004; comp.release.value = 0.3;
    var limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -4; limiter.knee.value = 0; limiter.ratio.value = 20;
    limiter.attack.value = 0.001; limiter.release.value = 0.15;
    var master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(comp); comp.connect(limiter); limiter.connect(out); out.connect(ctx.destination);

    function buf(ch, dur, fill) {
      var b = ctx.createBuffer(ch, Math.floor(sr * dur), sr);
      for (var c = 0; c < ch; c++) fill(b.getChannelData(c));
      return b;
    }
    var verb = ctx.createConvolver();
    verb.buffer = buf(2, 4.2, function (d) {
      for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.6);
    });
    var verbOut = ctx.createGain();
    verbOut.gain.value = 0.75;
    verb.connect(verbOut); verbOut.connect(master);

    var noise = buf(1, 3, function (d) { for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; });
    var crackleBuf = buf(1, 4, function (d) {
      for (var i = 0; i < d.length; i++) {
        d[i] += (Math.random() * 2 - 1) * 0.012;
        if (Math.random() < 0.0007) {
          var n = 30 + (Math.random() * 260 | 0), a = 0.15 + Math.random() * 0.85;
          for (var k = 0; k < n && i + k < d.length; k++) d[i + k] += (Math.random() * 2 - 1) * a * Math.pow(1 - k / n, 3);
        }
      }
    });

    var T0 = 0;
    function at(t) { return T0 + t; }
    function env(param, t, a, peak, hold, r) {
      param.setValueAtTime(0.0001, t);
      param.exponentialRampToValueAtTime(peak, t + a);
      param.setValueAtTime(peak, t + a + hold);
      param.exponentialRampToValueAtTime(0.0001, t + a + hold + r);
    }
    function send(node, dry, wet) {
      if (dry) { var d = ctx.createGain(); d.gain.value = dry; node.connect(d); d.connect(master); }
      if (wet) { var w = ctx.createGain(); w.gain.value = wet; node.connect(w); w.connect(verb); }
    }
    function noiseSrc(t, dur, b) {
      var s = ctx.createBufferSource();
      s.buffer = b || noise; s.loop = true;
      s.start(t, Math.random() * 2); s.stop(t + dur + 0.1);
      return s;
    }
    function osc(type, f, t, dur, detune) {
      var o = ctx.createOscillator();
      o.type = type; o.frequency.value = f;
      if (detune) o.detune.value = detune;
      o.start(t); o.stop(t + dur + 0.1);
      return o;
    }

    var api = {};
    api.drone = function (t0, dur) {
      var t = at(t0);
      /* гармоники выше 250 Гц нужны, чтобы гул был слышен в динамике телефона */
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 560; lp.Q.value = 1.2;
      var lfo = osc('sine', 0.07, t, dur), lg = ctx.createGain(); lg.gain.value = 260; lfo.connect(lg); lg.connect(lp.frequency);
      [['sawtooth', 73.42, 0, 0.5], ['sawtooth', 73.42, 9, 0.5], ['sawtooth', 146.83, -6, 0.4], ['sine', 36.71, 0, 0.3], ['triangle', 220, 4, 0.15]].forEach(function (v) {
        var o = osc(v[0], v[1], t, dur, v[2]), gn = ctx.createGain(); gn.gain.value = v[3]; o.connect(gn); gn.connect(lp);
      });
      var g = ctx.createGain(); env(g.gain, t, 4, 0.13, dur - 7, 3);
      lp.connect(g); send(g, 1, 0.25);
    };
    api.rumble = function (t0, dur) {
      var t = at(t0), s = noiseSrc(t, dur);
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 110;
      var g = ctx.createGain(); env(g.gain, t, 3, 0.12, dur - 6, 3);
      s.connect(lp); lp.connect(g); send(g, 1, 0);
    };
    api.crackle = function (t0, dur) {
      var t = at(t0), s = noiseSrc(t, dur, crackleBuf);
      var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
      var g = ctx.createGain(); env(g.gain, t, 0.6, 0.16, dur - 2, 1.5);
      s.connect(hp); hp.connect(g); send(g, 1, 0.15);
      var r = noiseSrc(t, dur), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 380; bp.Q.value = 0.6;
      var rg = ctx.createGain(); env(rg.gain, t, 0.8, 0.07, dur - 2, 1.5);
      r.connect(bp); bp.connect(rg); send(rg, 1, 0.1);
    };
    api.whoosh = function (t0, dur, f0, f1, vol) {
      var t = at(t0), s = noiseSrc(t, dur);
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.1;
      bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
      var g = ctx.createGain(); env(g.gain, t, dur * 0.45, vol, 0, dur * 0.55);
      s.connect(bp); bp.connect(g); send(g, 1, 0.5);
    };
    api.thump = function (t0, vol) {
      var t = at(t0), o = osc('sine', 120, t, 1.2);
      o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(36, t + 0.6);
      var g = ctx.createGain(); env(g.gain, t, 0.008, vol * 0.6, 0, 1);
      o.connect(g); send(g, 1, 0.35);
      var m = osc('triangle', 230, t, 0.5), mg = ctx.createGain();
      m.frequency.setValueAtTime(230, t); m.frequency.exponentialRampToValueAtTime(90, t + 0.25);
      env(mg.gain, t, 0.005, vol * 0.55, 0, 0.35);
      m.connect(mg); send(mg, 1, 0.4);
      var s = noiseSrc(t, 0.15), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
      var ng = ctx.createGain(); env(ng.gain, t, 0.004, vol * 0.5, 0, 0.12);
      s.connect(lp); lp.connect(ng); send(ng, 1, 0.3);
    };
    api.flip = function (t0) {
      var t = at(t0), s = noiseSrc(t, 0.3);
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
      bp.frequency.setValueAtTime(1800 + Math.random() * 1400, t); bp.frequency.exponentialRampToValueAtTime(4200, t + 0.2);
      var g = ctx.createGain(); env(g.gain, t, 0.03, 0.22, 0.04, 0.16);
      s.connect(bp); bp.connect(g); send(g, 1, 0.25);
    };
    api.choir = function (t0, dur, freqs, vol, attack, release) {
      var t = at(t0);
      var pre = ctx.createGain(); pre.gain.value = 1;
      var bus = ctx.createGain(); env(bus.gain, t, attack, vol, Math.max(0, dur - attack - release), release);
      [[650, 5, 1], [1080, 7, 0.7], [2400, 8, 0.25]].forEach(function (f) {
        var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f[0]; bp.Q.value = f[1];
        var fg = ctx.createGain(); fg.gain.value = f[2];
        pre.connect(bp); bp.connect(fg); fg.connect(bus);
      });
      var vib = osc('sine', 5.2, t, dur), vg = ctx.createGain(); vg.gain.value = 9; vib.connect(vg);
      freqs.forEach(function (f) {
        [-7, 0, 6].forEach(function (d) {
          var o = osc('sawtooth', f, t, dur, d + (Math.random() - 0.5) * 4);
          vg.connect(o.detune); o.connect(pre);
        });
      });
      send(bus, 0.55, 1);
    };
    api.shimmer = function (t0, vol) {
      var t = at(t0);
      [1174.66, 1760, 2349.32].forEach(function (f, i) {
        var o = osc('sine', f, t + i * 0.07, 3.2), g = ctx.createGain();
        env(g.gain, t + i * 0.07, 0.015, vol * (1 - i * 0.25), 0, 3);
        o.connect(g); send(g, 0.3, 1);
      });
    };
    api.riser = function (t0, dur) {
      var t = at(t0), s = noiseSrc(t, dur);
      var hp = ctx.createBiquadFilter(); hp.type = 'highpass';
      hp.frequency.setValueAtTime(400, t); hp.frequency.exponentialRampToValueAtTime(5000, t + dur);
      var g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + dur); g.gain.setValueAtTime(0.0001, t + dur + 0.02);
      s.connect(hp); hp.connect(g); send(g, 1, 0.4);
      var o = osc('sawtooth', 80, t, dur), og = ctx.createGain(), lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 700;
      o.frequency.setValueAtTime(80, t); o.frequency.exponentialRampToValueAtTime(320, t + dur);
      og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.08, t + dur); og.gain.setValueAtTime(0.0001, t + dur + 0.02);
      o.connect(lp); lp.connect(og); send(og, 1, 0.3);
    };
    api.boom = function (t0) {
      var t = at(t0);
      var o = osc('sine', 70, t, 3.2);
      o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(28, t + 1.4);
      var sh = ctx.createWaveShaper(), curve = new Float32Array(1024);
      for (var i = 0; i < 1024; i++) { var x = i / 512 - 1; curve[i] = Math.tanh(2.6 * x); }
      sh.curve = curve;
      var g = ctx.createGain(); env(g.gain, t, 0.01, 0.6, 0, 3);
      o.connect(sh); sh.connect(g); send(g, 1, 0.6);
      var s = noiseSrc(t, 2), lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(2600, t); lp.frequency.exponentialRampToValueAtTime(150, t + 0.9);
      var ng = ctx.createGain(); env(ng.gain, t, 0.005, 0.7, 0, 1.6);
      s.connect(lp); lp.connect(ng); send(ng, 1, 0.8);
      var sub = osc('sine', 36.71, t, 5), sg = ctx.createGain();
      env(sg.gain, t, 0.02, 0.25, 0.5, 4); sub.connect(sg); send(sg, 1, 0);
      api.tom(t0, 1);
      api.gong(t0 + 0.02, 0.22);
    };
    /* низкий барабан: слышен и в маленьком динамике */
    api.tom = function (t0, vol) {
      var t = at(t0);
      var o = osc('triangle', 150, t, 1), g = ctx.createGain();
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(62, t + 0.35);
      env(g.gain, t, 0.004, vol * 0.7, 0, 0.7);
      o.connect(g); send(g, 1, 0.35);
      var s = noiseSrc(t, 0.2), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.8;
      var ng = ctx.createGain(); env(ng.gain, t, 0.002, vol * 0.25, 0, 0.09);
      s.connect(bp); bp.connect(ng); send(ng, 1, 0.3);
    };
    /* гонг: негармонические обертоны с долгим затуханием */
    api.gong = function (t0, vol) {
      var t = at(t0);
      [[1, 1, 6], [1.483, 0.7, 5], [2.09, 0.6, 4.5], [2.62, 0.45, 4], [3.2, 0.35, 3.4], [4.15, 0.25, 2.8], [5.3, 0.15, 2.2]].forEach(function (p) {
        var o = osc('sine', 98 * p[0], t, p[2] + 0.2, (Math.random() - 0.5) * 8), g = ctx.createGain();
        env(g.gain, t, 0.01, vol * p[1], 0, p[2]);
        o.connect(g); send(g, 0.6, 0.8);
      });
    };

    api.start = function () {
      if (!external && ctx.state === 'suspended') ctx.resume();
      T0 = ctx.currentTime + 0.06;
    };
    api.mute = function (m) {
      out.gain.cancelScheduledValues(ctx.currentTime);
      out.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.08);
    };
    api.fade = function (sec) {
      try {
        var now = ctx.currentTime;
        out.gain.cancelScheduledValues(now);
        out.gain.setValueAtTime(out.gain.value, now);
        out.gain.linearRampToValueAtTime(0, now + sec);
      } catch (e) { /* ignore */ }
      setTimeout(function () { try { ctx.close(); } catch (e) { /* ignore */ } }, sec * 1000 + 300);
    };
    api.suspend = function (yes) {
      try { if (yes) ctx.suspend(); else ctx.resume(); } catch (e) { /* ignore */ }
    };
    return api;
  }

  /* ---------------- сценарий ---------------- */

  var D_MINOR = [146.83, 174.61, 220, 293.66];
  var B_FLAT = [116.54, 146.83, 174.61, 233.08];
  var A_MAJOR = [110, 138.59, 164.81, 220];
  var D_MAJOR = [146.83, 185, 220, 293.66, 440];

  /* партитура: время в секундах от касания */
  function score(sound) {
    sound.drone(0, 90); sound.rumble(0, 90);
    sound.whoosh(0.8, 1.1, 180, 2600, 0.5); sound.thump(0.95, 0.35); sound.crackle(0.9, 88);
    sound.whoosh(2.3, 1.3, 300, 1600, 0.16); sound.shimmer(2.4, 0.035);
    sound.whoosh(3.3, 1.2, 2400, 300, 0.32); sound.thump(4.65, 0.9);
    [4.5, 4.8, 5.1, 5.45].forEach(function (t) { sound.flip(t); });
    sound.shimmer(4.9, 0.06);
    sound.choir(4.6, 9.4, D_MINOR, 0.16, 3, 2.2);
    sound.choir(12.6, 7.8, B_FLAT, 0.22, 2.2, 1.6);
    sound.choir(18.8, 2.8, A_MAJOR, 0.3, 1.2, 0.6);
    for (var p = 6.4; p < 19.6; p += 1.7) sound.tom(p, 0.22 + (p - 6.4) / 13 * 0.4);
    [6.4, 9.8, 13.2, 16.6].forEach(function (t) { sound.shimmer(t, 0.05); sound.whoosh(t, 1, 400, 1800, 0.1); });
    [9.3, 12.7, 16.1, 19.5].forEach(function (t) { sound.whoosh(t, 0.8, 3000, 900, 0.07); });
    sound.riser(19.6, 1.6);
    sound.boom(21.2);
    sound.choir(21.2, 60, D_MAJOR, 0.26, 0.4, 3);
    sound.shimmer(21.3, 0.08);
  }

  /* звуковая дорожка без воспроизведения — для видео-превью */
  function renderAudio(seconds) {
    var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    var octx = new OAC(2, Math.ceil(44100 * seconds), 44100);
    var snd = Sound(false, octx);
    snd.start();
    score(snd);
    return octx.startRendering();
  }

  function vibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* ignore */ } }

  function play(opts) {
    opts = opts || {};
    if (document.querySelector('.intro')) return;
    var cfg = settings();
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var root = buildDom();
    document.body.appendChild(root);
    document.documentElement.style.overflow = 'hidden';

    var timers = [], sound = null, fx = Fx(root, reduce), started = false, closed = false;
    var camera = root.querySelector('.ix-camera');
    var linesBox = root.querySelector('.ix-lines');
    var soundBtn = root.querySelector('.ix-sound');
    var muted = !cfg.sound;

    if (document.fonts && document.fonts.load) {
      document.fonts.load('italic 600 30px "Cormorant Garamond"', 'Книга');
      document.fonts.load('700 60px "Cormorant SC"', '12 шагов');
    }

    function paintSound() {
      soundBtn.innerHTML = (muted ? ICON_MUTE : ICON_SOUND) + (muted ? 'Без звука' : 'Звук');
      soundBtn.setAttribute('aria-pressed', String(!muted));
    }
    paintSound();
    soundBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      muted = !muted;
      setSetting('sound', !muted);
      if (sound) sound.mute(muted);
      paintSound();
    });
    root.querySelector('.ix-skip').addEventListener('click', function (e) { e.stopPropagation(); close(0.6); });
    root.querySelector('.ix-go').addEventListener('click', function (e) { e.stopPropagation(); close(1.2); });

    function later(ms, fn) { timers.push(setTimeout(fn, ms)); }
    function cls(c, on) { root.classList.toggle(c, on !== false); }

    function focusCamera(scale, yFrac) {
      if (reduce) return;
      camera.style.transform = 'none';
      var m = root.querySelector('.ix-m-focus').getBoundingClientRect();
      var cx = root.clientWidth / 2, cy = root.clientHeight * yFrac;
      camera.style.transformOrigin = m.left + 'px ' + m.top + 'px';
      void camera.offsetWidth;
      camera.style.transform = 'translate(' + (cx - m.left) + 'px,' + (cy - m.top) + 'px) scale(' + scale + ')';
    }

    function showLine(i) {
      var el = document.createElement('div');
      el.className = 'ix-line';
      var n = 0;
      LINES[i].split(' ').forEach(function (word, wi) {
        var w = document.createElement('span');
        w.className = 'ix-w';
        Array.prototype.forEach.call(word, function (ch) {
          var c = document.createElement('span');
          c.className = 'ix-ch';
          c.style.setProperty('--i', n++);
          c.textContent = ch;
          w.appendChild(c);
        });
        if (wi) el.appendChild(document.createTextNode(' '));
        el.appendChild(w);
      });
      linesBox.appendChild(el);
      return el;
    }
    function hideLine(el) {
      fx.dissolve(el.getBoundingClientRect());
      el.classList.add('out');
      later(1400, function () { el.remove(); });
    }

    function begin() {
      if (started) return;
      started = true;
      sound = Sound(muted);
      if (sound) { sound.start(); score(sound); }

      cls('lit');
      fx.embers = 14;
      later(900, function () { cls('orb'); fx.orb = true; fx.burst('orb', reduce ? 10 : 34, 0.8); });
      later(2300, function () { fx.stream = true; });
      later(3300, function () { cls('open'); vibrate(20); });
      later(4300, function () { fx.stream = false; cls('glow'); fx.burst('book', reduce ? 20 : 70, 1); fx.embers = 22; });
      later(4650, function () { vibrate(40); });
      later(5600, function () { cls('reading'); focusCamera(1.2, 0.52); });
      var t = 6400;
      LINES.forEach(function (_, i) {
        var el;
        later(t, function () { el = showLine(i); });
        later(t + 2900, function () { if (el) hideLine(el); });
        t += 3400;
      });
      later(19600, function () { focusCamera(1.1, 0.52); });
      later(21200, function () {
        root.querySelector('.ix-flash').classList.add('on');
        root.querySelector('.ix-final').classList.add('on');
        cls('final');
        fx.burst('book', reduce ? 30 : 140, 1.6);
        fx.embers = 34;
        vibrate([60, 40, 140]);
      });
      later(22400, function () { root.querySelector('.ix-final').classList.add('sub'); });
      later(23400, function () { root.querySelector('.ix-go').classList.add('on'); });
    }

    function onVisibility() { if (sound) sound.suspend(document.visibilityState === 'hidden'); }
    document.addEventListener('visibilitychange', onVisibility);

    root.addEventListener('click', function () { if (root.classList.contains('ready')) begin(); });

    function close(sec) {
      if (closed) return;
      closed = true;
      timers.forEach(clearTimeout);
      if (sound) sound.fade(sec);
      root.style.transitionDuration = sec + 's';
      root.classList.add('closing');
      document.removeEventListener('visibilitychange', onVisibility);
      setTimeout(function () {
        fx.stop();
        root.remove();
        document.documentElement.style.overflow = '';
        if (opts.onDone) opts.onDone();
      }, sec * 1000 + 50);
    }

    requestAnimationFrame(function () { requestAnimationFrame(function () { cls('ready'); }); });
    if (opts.autostart) begin();
    return { close: close, begin: begin };
  }

  window.Intro = {
    settings: settings,
    set: setSetting,
    play: play,
    renderAudio: renderAudio
  };
})();
