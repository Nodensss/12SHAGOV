import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AMBIENCES, EFFECTS, SOUND_KEY, createSound } from '../public/game/sound.js';

const read = async path => readFile(new URL('../public/game/' + path, import.meta.url), 'utf8');
const config = JSON.parse(await read('data/sounds.json'));
const index = JSON.parse(await read('data/episodes.json'));

test('настройки звука ссылаются на существующие фоны, эпизоды и сцены', async () => {
  assert.ok(config.volume > 0 && config.volume <= 1);
  const names = new Set(Object.keys(AMBIENCES));
  assert.ok(names.has(config.ambience.fight));
  const episodes = new Map(index.chapters.filter(item => !item.type).map(item => [item.id, item]));
  for (const [id, name] of Object.entries(config.ambience.chapters)) {
    assert.ok(episodes.has(id), 'нет эпизода ' + id);
    assert.ok(names.has(name), id + ': нет фона ' + name);
  }
  for (const [id, scenes] of Object.entries(config.ambience.scenes)) {
    assert.ok(episodes.has(id), 'нет эпизода ' + id);
    const chapter = JSON.parse(await read('data/' + episodes.get(id).file));
    for (const [scene, name] of Object.entries(scenes)) {
      assert.ok(chapter.scenes[scene], id + ': нет сцены ' + scene);
      assert.ok(names.has(name), id + '/' + scene + ': нет фона ' + name);
    }
  }
  const fights = new Set(index.chapters.filter(item => item.type === 'fight').map(item => item.id));
  for (const id of config.silenceAfter) assert.ok(fights.has(id), 'нет боя ' + id);
});

test('у каждого эпизода есть фон, а игра вызывает только существующие звуки', async () => {
  for (const item of index.chapters.filter(item => !item.type)) assert.ok(config.ambience.chapters[item.id], 'эпизод без фона: ' + item.id);
  const source = await read('game.js');
  const used = [...source.matchAll(/sound\.play\(([^)]*)\)/g)].flatMap(match => [...match[1].matchAll(/'([a-zA-Z]+)'/g)].map(name => name[1]));
  assert.ok(used.length >= 8);
  for (const name of used) assert.ok(EFFECTS[name], 'нет звука ' + name);
  const page = await read('sounds-page.js');
  for (const name of [...Object.keys(EFFECTS), ...Object.keys(AMBIENCES)]) assert.ok(page.includes(name + ':'), 'на странице прослушивания нет названия для ' + name);
});

test('звук выключен по умолчанию, запоминает выбор и не падает без AudioContext', () => {
  const store = new Map(), storage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  const sound = createSound({ storage, AudioContextClass: undefined, root: undefined });
  assert.equal(sound.enabled, false);
  assert.equal(sound.play('scene'), false);
  assert.equal(sound.setEnabled(true), true);
  assert.equal(store.get(SOUND_KEY), 'on');
  assert.equal(sound.play('scene'), false, 'без AudioContext звука нет, но и ошибки нет');
  sound.ambience('yard'); sound.ambience('нет такого'); sound.wake(); sound.pause(); sound.configure({ volume: 5 });
  assert.equal(createSound({ storage, AudioContextClass: undefined, root: undefined }).enabled, true, 'выбор пережил перезапуск');
  sound.setEnabled(false);
  assert.equal(store.get(SOUND_KEY), 'off');
  const broken = { getItem() { throw new Error('нет доступа'); }, setItem() { throw new Error('нет доступа'); } };
  assert.equal(createSound({ storage: broken, AudioContextClass: undefined, root: undefined }).setEnabled(true), true);
});

test('звуки события включаются и планируются на контексте', () => {
  const calls = [];
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} });
  const node = kind => ({ kind, connect() {}, disconnect() {}, start() { calls.push(kind); }, stop() {}, gain: param(), frequency: param(), Q: param(), threshold: param(), ratio: param(), type: '', buffer: null, loop: false });
  class FakeContext {
    constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 8000; this.destination = node('out'); }
    createGain() { return node('gain'); } createOscillator() { return node('osc'); } createBiquadFilter() { return node('filter'); }
    createBufferSource() { return node('noise'); } createDynamicsCompressor() { return node('limiter'); }
    createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; }
    resume() { this.state = 'running'; return Promise.resolve(); } suspend() { this.state = 'suspended'; return Promise.resolve(); }
  }
  const store = new Map(), storage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  const sound = createSound({ storage, AudioContextClass: FakeContext, root: undefined });
  assert.equal(sound.play('hitFoe'), false, 'пока выключен — тишина');
  assert.equal(calls.length, 0);
  sound.setEnabled(true);
  for (const name of Object.keys(EFFECTS)) assert.equal(sound.play(name), true, name);
  assert.ok(calls.length >= Object.keys(EFFECTS).length);
  assert.equal(sound.play('нет такого'), false);
  for (const name of Object.keys(AMBIENCES)) { sound.ambience(name); assert.equal(sound.ambienceName, name); }
  sound.ambience(null);
  assert.equal(sound.ambienceName, null);
  sound.ambience('yard');
  sound.setEnabled(false);
  assert.equal(sound.ambienceName, null, 'после выключения фон остановлен');
});
