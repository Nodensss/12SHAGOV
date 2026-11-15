/*
 * Cinematic book prologue. Photography is bundled for completely offline use.
 * The former illustrated character is intentionally absent from this scene.
 */
(function () {
  'use strict';

  var KEY = 'twelve-steps:intro';
  var VERSION = 'cinematic-entity-v1';
  var active = null;
  var STORY = [
    { at: 0.25, until: 3.5, text: 'Иногда кажется,\nчто выхода больше нет.', note: '' },
    { at: 4, until: 6.8, text: 'Но это ещё не\nпоследняя страница.', note: '' },
    { at: 11.4, until: 15.2, text: 'Двенадцать шагов —\nчтобы увидеть,\nгде ты сейчас.', note: 'Сначала — честный взгляд.' },
    { at: 15.9, until: 19.7, text: 'Найти опору.\nРазобраться в себе.\nВернуться к жизни.', note: 'По одному шагу.' },
    { at: 20.4, until: 24.1, text: 'Здесь можно сомневаться.\nОстанавливаться.\nПросить помощи.', note: 'Темп выбираешь ты.' },
    { at: 24.8, until: 28.6, text: 'Достаточно начать\nс первой страницы.', note: 'Не нужно проходить весь путь сегодня.' }
  ];

  function settings() {
    var result = { auto: true, sound: false };
    try {
      var saved = JSON.parse(localStorage.getItem(KEY) || '{}');
      if (saved && typeof saved.auto === 'boolean') result.auto = saved.auto;
      if (saved && typeof saved.sound === 'boolean') result.sound = saved.sound;
    } catch (e) { /* A blocked store does not prevent entering the step. */ }
    return result;
  }

  function setSetting(key, value) {
    if (key !== 'auto' && key !== 'sound') return;
    var result = settings();
    result[key] = Boolean(value);
    try { localStorage.setItem(KEY, JSON.stringify(result)); } catch (e) { /* Optional preference. */ }
  }

  function quietPromise(value) {
    if (value && typeof value.catch === 'function') value.catch(function () {});
  }

  function clamp(value) { return Math.max(0, Math.min(1, value)); }
  function smooth(value) { value = clamp(value); return value * value * (3 - 2 * value); }
  function rng(seed) {
    return function () {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  }

  var ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>';
  var SOUND_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5 5 9H2v6h3l5 4V5Zm4 3c2 2 2 6 0 8m3-11c4 4 4 10 0 14"/></svg>';

  function createScene() {
    var root = document.createElement('section');
    root.className = 'intro ci-intro';
    root.dataset.introVersion = VERSION;
    root.dataset.scene = 'waiting';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Предисловие к Первому шагу');
    root.tabIndex = -1;
    root.innerHTML =
      '<div class="ci-camera" aria-hidden="true"><div class="ci-artwork">' +
        '<img class="ci-portrait-open" src="images/intro-entity-open.png" alt="" decoding="async" draggable="false">' +
        '<img class="ci-portrait-closed" src="images/intro-entity-closed.png" alt="" decoding="async" draggable="false">' +
        '<div class="ci-cover"><div class="ci-cover-front"></div><div class="ci-cover-back"></div></div>' +
      '</div></div>' +
      '<div class="ci-realm" aria-hidden="true"></div>' +
      '<canvas class="ci-particles" aria-hidden="true"></canvas>' +
      '<div class="ci-shade" aria-hidden="true"></div>' +
      '<header class="ci-ui"><button class="ci-sound" type="button" aria-pressed="false">' + SOUND_ICON + '<span>Звук выключен</span></button>' +
        '<button class="ci-skip" type="button">Пропустить ' + ARROW + '</button></header>' +
      '<div class="ci-idle"><span class="ci-kicker">ПРЕДИСЛОВИЕ / 00</span>' +
        '<h1>Это ещё<br><em>не конец.</em></h1><p role="status">Готовим страницу…</p>' +
        '<button class="ci-start" type="button" disabled><span>Открыть книгу</span>' + ARROW + '</button></div>' +
      '<div class="ci-caption-region" aria-live="polite" aria-atomic="true"><p class="ci-caption"></p><span class="ci-caption-note"></span></div>' +
      '<div class="ci-final" hidden><span class="ci-kicker">ГЛАВА I / ТОЧКА ОТСЧЁТА</span><h2>12 <em>шагов</em></h2>' +
        '<p>Здесь начинается твоя работа.\nМожно идти в своём темпе.</p>' +
        '<button class="ci-enter" type="button"><span>Открыть Первый шаг</span>' + ARROW + '</button></div>' +
      '<footer class="ci-footer"><span class="ci-act">Книга, которую пишешь ты</span>' +
        '<div class="ci-progress" role="progressbar" aria-label="Предисловие" aria-valuemin="0" aria-valuemax="30" aria-valuenow="0"><i></i></div></footer>';
    return root;
  }

  /* The original local Web Audio engine; no recording or network is used. */

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
      if (!external && ctx.state === 'suspended') quietPromise(ctx.resume());
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
      setTimeout(function () { try { quietPromise(ctx.close()); } catch (e) { /* optional audio */ } }, sec * 1000 + 300);
    };
    api.suspend = function (yes) {
      try { quietPromise(yes ? ctx.suspend() : ctx.resume()); } catch (e) { /* optional audio */ }
    };
    return api;
  }


  /* A quiet score: no voice, sudden loud hit or sound before a user gesture. */
  function score(sound, elapsed) {
    if (!sound) return;
    elapsed = elapsed || 0;
    var remaining = 37 - elapsed;
    if (remaining > 8) {
      sound.drone(0, remaining);
      sound.rumble(0, remaining);
    }
    function cue(time, play) { if (time >= elapsed) play(time - elapsed); }
    cue(0, function (t) { sound.choir(t, 10, [146.83, 174.61, 220], 0.07, 3.5, 3); });
    cue(2.5, function (t) { sound.whoosh(t, 2.8, 380, 1300, 0.12); });
    cue(3.1, function (t) { sound.thump(t, 0.14); });
    [4.8, 5.2, 5.6].forEach(function (time) { cue(time, function (t) { sound.flip(t); }); });
    cue(7.1, function (t) { sound.whoosh(t, 3.2, 280, 2200, 0.24); });
    cue(10.1, function (t) { sound.thump(t, 0.24); sound.gong(t, 0.05); });
    cue(10.5, function (t) { sound.choir(t, 12, [146.83, 174.61, 220, 293.66], 0.10, 3, 4); });
    cue(20, function (t) { sound.choir(t, 10, [146.83, 196, 246.94, 293.66], 0.11, 3, 3); });
    cue(28.8, function (t) { sound.choir(t, 8, [146.83, 196, 246.94, 293.66], 0.12, 2, 4); sound.gong(t, 0.055); });
  }

  function renderAudio(seconds) {
    var Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Offline) return Promise.reject(new Error('Автономный рендер звука недоступен.'));
    var duration = Math.max(1, Math.min(300, Number(seconds) || 39));
    var context = new Offline(2, Math.ceil(duration * 44100), 44100);
    var sound = Sound(false, context);
    sound.start();
    score(sound, 0);
    return context.startRendering();
  }

  /* Dust is drawn into one decorative canvas; captions and controls never move. */
  function particleField(canvas, image) {
    var context = canvas.getContext('2d');
    if (!context) return { resize: function () {}, draw: function () {} };
    var width = 1, height = 1, ratio = 1;
    var random = rng(12);
    var motes = Array.from({ length: 64 }, function () {
      return { x: random(), y: random(), radius: 0.5 + random() * 1.1, speed: 0.4 + random(), phase: random() * Math.PI * 2 };
    });
    function resize() {
      width = Math.max(1, canvas.clientWidth);
      height = Math.max(1, canvas.clientHeight);
      ratio = Math.min(1.5, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    function draw(time, elapsed, reduced) {
      context.clearRect(0, 0, width, height);
      var clock = reduced ? 0 : time;
      var count = reduced ? 12 : motes.length;
      var inBook = smooth((elapsed - 8) / 3);
      for (var i = 0; i < count; i++) {
        var mote = motes[i];
        var x = mote.x * width + Math.sin(clock * 0.11 + mote.phase) * 9;
        var y = ((mote.y - clock * 0.005 * mote.speed) % 1 + 1) % 1 * height;
        var opacity = (0.16 + Math.sin(clock * 0.3 + mote.phase) * 0.07) * (0.6 + inBook * 0.4);
        context.fillStyle = 'rgba(202,166,103,' + opacity.toFixed(3) + ')';
        context.beginPath();
        context.arc(x, y, mote.radius, 0, Math.PI * 2);
        context.fill();
      }
      var passage = smooth((elapsed - 7.6) / 1.2) * (1 - smooth((elapsed - 12.2) / 1.7));
      if (reduced || passage <= 0) return;
      context.save();
      context.translate(width * 0.5, height * 0.52);
      for (var j = 0; j < 9; j++) {
        var depth = ((elapsed - 7.6) * 0.27 + j / 9) % 1;
        var size = 20 + Math.pow(depth, 2.6) * Math.max(width, height) * 1.1;
        context.save();
        context.rotate((j % 2 ? 1 : -1) * depth * 0.13);
        context.strokeStyle = 'rgba(191,157,100,' + (passage * (1 - depth) * 0.17).toFixed(3) + ')';
        context.lineWidth = 0.7;
        context.strokeRect(-size * 0.43, -size * 0.6, size * 0.86, size * 1.2);
        context.restore();
      }
      if (image.complete && image.naturalWidth) {
        for (var k = 0; k < 4; k++) {
          var flight = ((elapsed - 7) * 0.22 + k / 4) % 1;
          var reach = 22 + flight * flight * Math.max(width, height) * 0.8;
          var angle = k * Math.PI / 2 + 0.5;
          var pageWidth = 8 + flight * flight * 150;
          context.save();
          context.translate(Math.cos(angle) * reach, Math.sin(angle) * reach);
          context.rotate(angle * 0.2 + flight * 0.45);
          context.globalAlpha = passage * (1 - flight) * 0.23;
          context.drawImage(image, image.naturalWidth * 0.22, image.naturalHeight * 0.57, image.naturalWidth * 0.25, image.naturalHeight * 0.18, -pageWidth * 0.5, -pageWidth * 0.33, pageWidth, pageWidth * 0.66);
          context.restore();
        }
      }
      context.restore();
    }
    resize();
    return { resize: resize, draw: draw };
  }

  function imageReady(image) {
    return new Promise(function (resolve, reject) {
      if (image.complete) {
        if (image.naturalWidth) resolve(); else reject(new Error('Не удалось открыть иллюстрацию.'));
        return;
      }
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', reject, { once: true });
    }).then(function () {
      return typeof image.decode === 'function' ? image.decode().catch(function () {}) : undefined;
    });
  }

  function play(options) {
    if (active) return active;
    options = options || {};
    var root = createScene();
    var camera = root.querySelector('.ci-camera');
    var closedPortrait = root.querySelector('.ci-portrait-closed');
    var openPortrait = root.querySelector('.ci-portrait-open');
    var cover = root.querySelector('.ci-cover');
    var realm = root.querySelector('.ci-realm');
    var start = root.querySelector('.ci-start');
    var soundButton = root.querySelector('.ci-sound');
    var skip = root.querySelector('.ci-skip');
    var enter = root.querySelector('.ci-enter');
    var idle = root.querySelector('.ci-idle');
    var status = idle.querySelector('p');
    var captionRegion = root.querySelector('.ci-caption-region');
    var caption = root.querySelector('.ci-caption');
    var captionNote = root.querySelector('.ci-caption-note');
    var final = root.querySelector('.ci-final');
    var act = root.querySelector('.ci-act');
    var progress = root.querySelector('.ci-progress');
    var progressFill = progress.querySelector('i');
    var previousFocus = document.activeElement;
    var oldBodyOverflow = document.body.style.overflow;
    var oldHtmlOverflow = document.documentElement.style.overflow;
    var siblings = Array.from(document.body.children).map(function (element) {
      return { element: element, inert: element.inert, hidden: element.getAttribute('aria-hidden') };
    });
    var media = window.matchMedia('(prefers-reduced-motion: reduce)');
    var reduced = media.matches;
    var muted = !settings().sound;
    var sound = null;
    var assetsReady = false;
    var started = false;
    var closing = false;
    var elapsed = 0;
    var dustTime = 0;
    var last = 0;
    var raf = 0;
    var lastCaption = -1;
    var lastPhase = '';
    var lastProgress = -1;
    var height = window.innerHeight;

    /* The dialog owns focus and scroll until its single cleanup path restores them. */
    siblings.forEach(function (saved) {
      saved.element.inert = true;
      saved.element.setAttribute('aria-hidden', 'true');
    });
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    root.classList.toggle('ci-reduced', reduced);
    document.body.appendChild(root);
    root.focus({ preventScroll: true });
    var particles = particleField(root.querySelector('.ci-particles'), openPortrait);

    function updateSoundButton() {
      soundButton.setAttribute('aria-pressed', String(!muted));
      soundButton.setAttribute('aria-label', muted ? 'Включить звук' : 'Выключить звук');
      soundButton.querySelector('span').textContent = muted ? 'Звук выключен' : 'Звук включён';
    }
    updateSoundButton();

    function startSound() {
      if (sound || !started || closing) return;
      try {
        sound = Sound(muted);
        if (sound) {
          sound.start();
          score(sound, elapsed);
          if (document.hidden) sound.suspend(true);
        }
      } catch (e) { /* Audio is optional; the complete scene still works silently. */ }
    }

    function begin(event) {
      if (closing || started || !assetsReady) return;
      started = true;
      last = 0;
      root.classList.add('ci-started');
      idle.setAttribute('aria-hidden', 'true');
      start.disabled = true;
      root.focus({ preventScroll: true });
      if (event && event.isTrusted) startSound();
      render();
      requestFrame();
    }

    function phase() {
      if (!started) return 'waiting';
      if (elapsed < 7) return 'opening';
      if (elapsed < 11) return 'falling';
      if (elapsed < 29) return 'prologue';
      return 'ready';
    }

    function render() {
      var scene = phase();
      if (scene !== lastPhase) {
        lastPhase = scene;
        root.dataset.scene = scene;
        act.textContent = { waiting: 'Книга, которую пишешь ты', opening: 'Предисловие / Открывая книгу', falling: 'Предисловие / Внутри страницы', prologue: 'Предисловие / По одному шагу', ready: 'Первый шаг / Точка отсчёта' }[scene];
      }
      var opening = started ? smooth((elapsed - 2.5) / 3.5) : 0;
      var falling = started ? smooth((elapsed - 7) / 4) : 0;
      closedPortrait.style.opacity = String(1 - (started ? smooth((elapsed - 2.7) / 1.2) : 0));
      cover.style.opacity = reduced ? '0' : String(smooth((elapsed - 2.3) / 0.3) * (1 - smooth((elapsed - 5.8) / 0.5)));
      cover.style.transform = reduced ? 'none' : 'perspective(900px) rotateY(' + (-opening * 170).toFixed(2) + 'deg)';
      camera.style.transform = reduced ? 'none' : 'translateY(' + (-height * 0.15 * falling).toFixed(2) + 'px) scale(' + (1 + 14 * Math.pow(falling, 2.7)).toFixed(4) + ')';
      camera.style.opacity = String(1 - (reduced ? smooth((elapsed - 7) / 3) : smooth((falling - 0.58) / 0.4)));
      realm.style.opacity = String(started ? smooth((elapsed - 8.4) / 2.3) : 0);
      var index = -1;
      for (var i = 0; i < STORY.length; i++) {
        if (started && elapsed >= STORY[i].at && elapsed <= STORY[i].until) { index = i; break; }
      }
      if (index !== lastCaption) {
        lastCaption = index;
        caption.textContent = index < 0 ? '' : STORY[index].text;
        captionNote.textContent = index < 0 ? '' : STORY[index].note;
      }
      var captionOpacity = index < 0 ? 0 : Math.min(smooth((elapsed - STORY[index].at) / 0.65), smooth((STORY[index].until - elapsed) / 0.65));
      captionRegion.style.opacity = String(captionOpacity);
      if (scene === 'ready') {
        final.hidden = false;
        final.style.opacity = String(smooth((elapsed - 29) / 1.2));
        root.classList.add('ci-ready');
      }
      var progressValue = Math.min(30, Math.floor(elapsed));
      progressFill.style.transform = 'scaleX(' + clamp(elapsed / 30).toFixed(4) + ')';
      if (progressValue !== lastProgress) {
        progress.setAttribute('aria-valuenow', String(progressValue));
        lastProgress = progressValue;
      }
      particles.draw(dustTime, elapsed, reduced);
    }

    function frame(now) {
      raf = 0;
      if (closing || document.hidden) { last = 0; return; }
      var delta = last ? Math.max(0, (now - last) / 1000) : 0;
      last = now;
      dustTime += delta;
      if (started) elapsed += delta;
      render();
      if (!started || elapsed < 40) requestFrame();
    }
    function requestFrame() {
      if (!closing && !document.hidden && !raf && (!started || elapsed < 40)) raf = requestAnimationFrame(frame);
    }
    function onVisibility() {
      last = 0;
      if (document.hidden) {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      } else requestFrame();
      if (sound) sound.suspend(document.hidden);
    }
    function onResize() {
      height = root.clientHeight;
      particles.resize();
      render();
    }
    function onReducedMotion(event) {
      reduced = event.matches;
      root.classList.toggle('ci-reduced', reduced);
      render();
    }
    function onKeydown(event) {
      if (event.key === 'Escape') { event.preventDefault(); close(0.4, true); return; }
      if (event.key !== 'Tab') return;
      var buttons = Array.from(root.querySelectorAll('button')).filter(function (button) {
        return !button.disabled && button.getClientRects().length && getComputedStyle(button).visibility !== 'hidden';
      });
      if (!buttons.length) { event.preventDefault(); root.focus(); return; }
      var first = buttons[0], finalButton = buttons[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) {
        event.preventDefault(); finalButton.focus();
      } else if (!event.shiftKey && (document.activeElement === finalButton || document.activeElement === root)) {
        event.preventDefault(); first.focus();
      }
    }
    function restoreFocus(enterStep) {
      var target = enterStep ? document.querySelector('#view h2, #view') : previousFocus;
      if (!target || !target.isConnected || target.closest('[inert]')) target = previousFocus;
      if (target && target.isConnected && typeof target.focus === 'function') {
        var oldTabindex = target.getAttribute('tabindex');
        if (!target.matches('button, input, textarea, select, a[href], [tabindex]')) target.tabIndex = -1;
        target.focus({ preventScroll: true });
        if (oldTabindex === null) target.removeAttribute('tabindex');
      }
    }
    function close(seconds, enterStep) {
      if (closing) return;
      closing = true;
      seconds = reduced ? 0 : Math.max(0, Math.min(2, Number(seconds) || 0));
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
      root.removeEventListener('keydown', onKeydown);
      if (media.removeEventListener) media.removeEventListener('change', onReducedMotion);
      else media.removeListener(onReducedMotion);
      if (sound) sound.fade(seconds);
      root.classList.add('ci-closing');
      root.style.transitionDuration = seconds + 's';
      if (enterStep) window.location.hash = '#/step/1';
      setTimeout(function () {
        root.remove();
        document.body.style.overflow = oldBodyOverflow;
        document.documentElement.style.overflow = oldHtmlOverflow;
        siblings.forEach(function (saved) {
          saved.element.inert = saved.inert;
          if (saved.hidden === null) saved.element.removeAttribute('aria-hidden');
          else saved.element.setAttribute('aria-hidden', saved.hidden);
        });
        if (active === controller) active = null;
        restoreFocus(enterStep);
        if (typeof options.onDone === 'function') options.onDone();
      }, seconds * 1000);
    }
    function onPageHide() { close(0, false); }

    start.addEventListener('click', begin);
    skip.addEventListener('click', function () { close(0.4, true); });
    enter.addEventListener('click', function () { close(0.6, true); });
    soundButton.addEventListener('click', function (event) {
      muted = !muted;
      setSetting('sound', !muted);
      updateSoundButton();
      if (event.isTrusted) startSound();
      if (sound) sound.mute(muted);
    });
    root.addEventListener('keydown', onKeydown);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('resize', onResize);
    window.addEventListener('pagehide', onPageHide);
    if (media.addEventListener) media.addEventListener('change', onReducedMotion);
    else media.addListener(onReducedMotion);
    var controller = { close: function (seconds) { close(seconds === undefined ? 0.4 : seconds, true); }, begin: begin };
    active = controller;
    Promise.all([imageReady(closedPortrait), imageReady(openPortrait)]).then(function () {
      if (closing) return;
      assetsReady = true;
      start.disabled = false;
      status.textContent = 'Следующая страница — твоя.';
      if (options.autostart) begin();
    }).catch(function () {
      if (!closing) status.textContent = 'Не удалось открыть иллюстрацию. Можно перейти к шагу.';
    });
    render();
    requestFrame();
    return controller;
  }

  window.Intro = { settings: settings, set: setSetting, play: play, renderAudio: renderAudio, version: VERSION };
}());
