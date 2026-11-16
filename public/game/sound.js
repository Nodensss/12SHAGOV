// Звук игры. Всё синтезируется в браузере через WebAudio: аудиофайлов нет, сеть не нужна.
// По умолчанию звук выключен. Включает его сам игрок; выбор хранится на устройстве отдельно от прогресса.
// Звуки рассчитаны на динамик телефона: основная энергия лежит между 300 Гц и 4 кГц, громкость сдержанная.
// Какой фон звучит в какой сцене, задаёт data/sounds.json; рецепты самих звуков — в этом файле.

export const SOUND_KEY = '12shagov-game-sound';

const noiseBuffers = new WeakMap();

// Один и тот же шум при каждом запуске, чтобы проверки громкости были повторяемыми.
function noiseBuffer(ctx) {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 22222;
    for (let i = 0; i < data.length; i += 1) { seed = (seed * 16807) % 2147483647; data[i] = seed / 1073741823.5 - 1; }
    noiseBuffers.set(ctx, buffer);
  }
  return buffer;
}

function envelope(ctx, out, t, peak, attack, decay) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  gain.connect(out);
  return gain;
}

// Короткий тон: частота может съезжать от from к to.
function tone(ctx, out, t, { type = 'sine', from, to = from, peak, attack = 0.008, decay }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
  osc.connect(envelope(ctx, out, t, peak, attack, decay));
  osc.start(t);
  osc.stop(t + attack + decay + 0.05);
}

// Короткий шум через фильтр: шорох, удар, воздух.
function hiss(ctx, out, t, { filter = 'lowpass', from, to = from, q = 0.7, peak, attack = 0.008, decay }) {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx);
  source.loop = true;
  const biquad = ctx.createBiquadFilter();
  biquad.type = filter;
  biquad.Q.value = q;
  biquad.frequency.setValueAtTime(from, t);
  if (to !== from) biquad.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
  source.connect(biquad);
  biquad.connect(envelope(ctx, out, t, peak, attack, decay));
  source.start(t);
  source.stop(t + attack + decay + 0.05);
}

// Короткие звуки событий. Каждый рецепт: (контекст, выход, время начала).
// Громкость подобрана по измерениям: интерфейсные звуки — пик около 0,15–0,2 от полной шкалы,
// удары в бою — около 0,35. Проверка в tests/game-sound-flow.py не даст им стать громче или пропасть.
export const EFFECTS = {
  // Смена сцены: тихий выдох, как перевёрнутая страница.
  scene: (ctx, out, t) => hiss(ctx, out, t, { filter: 'bandpass', from: 700, to: 1600, q: 0.8, peak: 0.39, attack: 0.06, decay: 0.3 }),
  // Выбор сделан.
  choice: (ctx, out, t) => {
    tone(ctx, out, t, { from: 520, peak: 0.15, decay: 0.16 });
    tone(ctx, out, t, { from: 780, peak: 0.057, decay: 0.1 });
  },
  // Запись в дневник: три коротких штриха карандаша.
  write: (ctx, out, t) => {
    for (const offset of [0, 0.1, 0.22]) hiss(ctx, out, t + offset, { filter: 'bandpass', from: 3000, q: 1.5, peak: 0.34, decay: 0.05 });
  },
  // Что-то открылось: новый шаг, уровень, конец испытания.
  unlock: (ctx, out, t) => {
    tone(ctx, out, t, { from: 660, peak: 0.19, decay: 0.7 });
    tone(ctx, out, t + 0.07, { from: 990, peak: 0.11, decay: 0.5 });
  },
  // Приём в бою.
  skill: (ctx, out, t) => {
    tone(ctx, out, t, { type: 'triangle', from: 320, to: 200, peak: 0.28, decay: 0.12 });
    hiss(ctx, out, t, { from: 1200, peak: 0.11, decay: 0.05 });
  },
  // Удар дошёл до тяги.
  hitFoe: (ctx, out, t) => {
    hiss(ctx, out, t, { from: 2400, to: 500, peak: 0.3, decay: 0.16 });
    tone(ctx, out, t, { type: 'triangle', from: 300, to: 140, peak: 0.3, decay: 0.2 });
  },
  // Тяга ударила героя.
  hitYou: (ctx, out, t) => {
    tone(ctx, out, t, { type: 'triangle', from: 220, to: 110, peak: 0.4, decay: 0.26 });
    hiss(ctx, out, t, { from: 900, to: 300, peak: 0.25, decay: 0.2 });
  },
  // Удар увяз в броне: глухо, без отдачи.
  blocked: (ctx, out, t) => {
    tone(ctx, out, t, { type: 'triangle', from: 180, to: 160, peak: 0.22, decay: 0.22 });
    hiss(ctx, out, t, { filter: 'bandpass', from: 400, q: 2, peak: 0.125, decay: 0.15 });
  },
  // Стойкость вернулась.
  heal: (ctx, out, t) => tone(ctx, out, t, { from: 440, to: 660, peak: 0.16, attack: 0.08, decay: 0.35 }),
  // Броня снята признанием: не удар, а выдох.
  release: (ctx, out, t) => {
    hiss(ctx, out, t, { filter: 'bandpass', from: 600, to: 3000, q: 0.8, peak: 0.19, attack: 0.5, decay: 0.9 });
    tone(ctx, out, t, { from: 330, peak: 0.19, attack: 0.4, decay: 1 });
  },
  // Тяга отступила.
  win: (ctx, out, t) => {
    hiss(ctx, out, t, { filter: 'bandpass', from: 900, to: 2600, q: 0.8, peak: 0.14, attack: 0.35, decay: 1.1 });
    tone(ctx, out, t, { from: 392, peak: 0.2, attack: 0.25, decay: 1.4 });
    tone(ctx, out, t, { from: 588, peak: 0.12, attack: 0.45, decay: 1.2 });
  },
  // Победа над боссом: один долгий затухающий звук, после которого остаётся тишина.
  silence: (ctx, out, t) => {
    tone(ctx, out, t, { type: 'triangle', from: 220, to: 110, peak: 0.24, attack: 0.02, decay: 2.6 });
    hiss(ctx, out, t, { from: 1500, to: 200, peak: 0.145, attack: 0.02, decay: 2.2 });
  },
  // Срыв: без драмы, просто вниз.
  lose: (ctx, out, t) => {
    tone(ctx, out, t, { type: 'triangle', from: 330, to: 165, peak: 0.23, attack: 0.02, decay: 0.9 });
    hiss(ctx, out, t, { from: 700, to: 250, peak: 0.1, decay: 0.7 });
  },
};

// Непрерывный шум через фильтр; sway — медленное «дыхание» громкости.
function bed(ctx, out, { filter = 'lowpass', freq, q = 0.7, gain, sway }) {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx);
  source.loop = true;
  const biquad = ctx.createBiquadFilter();
  biquad.type = filter;
  biquad.frequency.value = freq;
  biquad.Q.value = q;
  const level = ctx.createGain();
  level.gain.value = gain;
  source.connect(biquad);
  biquad.connect(level);
  level.connect(out);
  const nodes = [source];
  if (sway) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = sway.rate;
    const depth = ctx.createGain();
    depth.gain.value = gain * sway.depth;
    lfo.connect(depth);
    depth.connect(level.gain);
    lfo.start();
    nodes.push(lfo);
  }
  source.start();
  return nodes;
}

// Непрерывный тон: гул холодильника, напряжение боя.
function hum(ctx, out, { type = 'sine', freq, gain, cutoff }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const level = ctx.createGain();
  level.gain.value = gain;
  if (cutoff) {
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = cutoff;
    osc.connect(lowpass);
    lowpass.connect(level);
  } else osc.connect(level);
  level.connect(out);
  osc.start();
  return [osc];
}

// Фоны мест. Каждый рецепт: (контекст, выход) → список узлов, которые потом останавливаются.
// Фон намного тише событий: он не должен мешать читать.
export const AMBIENCES = {
  // Двор: ветер и шорох листьев.
  yard: (ctx, out) => [
    ...bed(ctx, out, { freq: 700, gain: 0.22, sway: { rate: 0.09, depth: 0.45 } }),
    ...bed(ctx, out, { filter: 'bandpass', freq: 2500, q: 0.5, gain: 0.033 }),
  ],
  // Кухня: гул холодильника.
  kitchen: (ctx, out) => [
    ...hum(ctx, out, { freq: 120, gain: 0.025 }),
    ...hum(ctx, out, { freq: 240, gain: 0.017 }),
    ...hum(ctx, out, { freq: 360, gain: 0.008 }),
    ...bed(ctx, out, { freq: 500, gain: 0.017 }),
  ],
  // Комната группы: тихое помещение, где есть люди.
  room: (ctx, out) => [
    ...bed(ctx, out, { filter: 'bandpass', freq: 600, q: 0.4, gain: 0.066 }),
    ...hum(ctx, out, { freq: 180, gain: 0.019 }),
  ],
  // Набережная: вода идёт мимо.
  river: (ctx, out) => [
    ...bed(ctx, out, { filter: 'bandpass', freq: 1000, q: 0.5, gain: 0.14, sway: { rate: 0.23, depth: 0.4 } }),
    ...bed(ctx, out, { freq: 400, gain: 0.08 }),
  ],
  // Дождь на остановке.
  rain: (ctx, out) => [
    ...bed(ctx, out, { filter: 'highpass', freq: 1800, gain: 0.052 }),
    ...bed(ctx, out, { filter: 'bandpass', freq: 700, q: 0.6, gain: 0.021, sway: { rate: 0.05, depth: 0.3 } }),
  ],
  // Ночь в квартире: почти тишина.
  night: (ctx, out) => [
    ...bed(ctx, out, { freq: 600, gain: 0.042 }),
    ...hum(ctx, out, { freq: 150, gain: 0.016 }),
  ],
  // Бой: низкое напряжение, которое не отпускает.
  battle: (ctx, out) => [
    ...hum(ctx, out, { type: 'sawtooth', freq: 110, gain: 0.048, cutoff: 500 }),
    ...hum(ctx, out, { type: 'sawtooth', freq: 110.7, gain: 0.048, cutoff: 500 }),
    ...bed(ctx, out, { freq: 300, gain: 0.048, sway: { rate: 0.35, depth: 0.6 } }),
  ],
};

const clamp = value => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0.8));

// Управление звуком игры. Без AudioContext (старый браузер, тесты в Node) все методы тихо ничего не делают.
export function createSound({ storage = globalThis.localStorage, AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext, root = globalThis.document } = {}) {
  let enabled = false, volume = 0.8, bedVolume = 1, ctx = null, master = null, wanted = null, current = null;
  try { enabled = storage?.getItem(SOUND_KEY) === 'on'; } catch { enabled = false; }

  // Состояние видно снаружи: по нему рисуется кнопка и работают проверки.
  function publish(type, name) {
    if (!root?.documentElement) return;
    root.documentElement.dataset.gameSound = enabled ? 'on' : 'off';
    root.documentElement.dataset.gameAmbience = current?.name || '';
    if (type) root.dispatchEvent(new CustomEvent('game-sound', { detail: { type, name } }));
  }

  function context() {
    if (ctx || !AudioContextClass) return ctx;
    ctx = new AudioContextClass();
    // Ограничитель на выходе: даже несколько звуков разом не дадут резкого пика.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.ratio.value = 6;
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(limiter);
    limiter.connect(ctx.destination);
    return ctx;
  }

  function stopCurrent(fade = 0.8) {
    if (!current) return;
    const { bus, nodes } = current, now = ctx.currentTime;
    current = null;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setValueAtTime(bus.gain.value, now);
    bus.gain.linearRampToValueAtTime(0, now + fade);
    setTimeout(() => { for (const node of nodes) { try { node.stop(); } catch { /* уже остановлен */ } } bus.disconnect(); }, (fade + 0.1) * 1000);
  }

  function applyAmbience() {
    if (!ctx || !enabled || ctx.state !== 'running') { if (ctx && !enabled) stopCurrent(0.2); publish(); return; }
    if (current?.name === wanted) return;
    stopCurrent();
    if (wanted) {
      const bus = ctx.createGain(), now = ctx.currentTime;
      bus.gain.setValueAtTime(0, now);
      bus.gain.linearRampToValueAtTime(bedVolume, now + 1.5);
      bus.connect(master);
      current = { name: wanted, bus, nodes: AMBIENCES[wanted](ctx, bus) };
    }
    publish('ambience', wanted || '');
  }

  // Браузер разрешает звук только после действия игрока: будим контекст при первом касании.
  function wake() {
    if (!enabled || !context()) return;
    if (ctx.state === 'running') applyAmbience();
    else ctx.resume().then(applyAmbience).catch(() => {});
  }

  publish();
  return {
    get enabled() { return enabled; },
    get ambienceName() { return current?.name || null; },
    configure(config) {
      volume = clamp(config?.volume);
      bedVolume = config?.ambienceVolume === undefined ? 1 : clamp(config.ambienceVolume);
      if (master) master.gain.value = volume;
    },
    setEnabled(value) {
      enabled = !!value;
      try { storage?.setItem(SOUND_KEY, enabled ? 'on' : 'off'); } catch { /* хранилище недоступно: выбор живёт до закрытия вкладки */ }
      if (enabled) wake();
      else if (ctx) { stopCurrent(0.2); ctx.suspend().catch(() => {}); }
      publish('toggle', enabled ? 'on' : 'off');
      return enabled;
    },
    // Короткий звук события; delay — через сколько секунд.
    play(name, delay = 0) {
      if (!enabled || !EFFECTS[name] || !context()) return false;
      if (ctx.state !== 'running') ctx.resume().then(applyAmbience).catch(() => {});
      EFFECTS[name](ctx, master, ctx.currentTime + 0.02 + delay);
      publish('effect', name);
      return true;
    },
    // Фон места; null или неизвестное имя — тишина.
    ambience(name) {
      wanted = AMBIENCES[name] ? name : null;
      applyAmbience();
    },
    wake,
    // Вкладка скрыта: звук не должен играть в фоне.
    pause() { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); },
  };
}
