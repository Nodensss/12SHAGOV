import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import {
  advance, answerLater, choose, fill, freshGame, isLocked, leaveJournal, linesOf, normalizeGame, progressOf,
  saveEntry, setDraft, stage, validateChapter, validateVocab,
} from '../public/game/engine.js';

const data = new URL('../public/game/data/', import.meta.url);
const load = async file => JSON.parse(await readFile(new URL(file, data), 'utf8'));
const index = await load('episodes.json'), vocab = await load('vocab.json');
const chapters = await Promise.all(index.chapters.map(item => load(item.file)));

test('словарь и все главы игры проходят проверку', () => {
  assert.deepEqual(validateVocab(vocab), []);
  assert.equal(new Set(index.chapters.map(c => c.id)).size, index.chapters.length);
  chapters.forEach((chapter, i) => {
    assert.equal(chapter.id, index.chapters[i].id);
    assert.deepEqual(validateChapter(chapter, vocab), []);
  });
});

test('у каждого героя есть название, описание и картинка', async () => {
  for (const variant of vocab.variants) {
    assert.equal(vocab.variants.filter(v => !v.locked).length >= 1, true);
    for (const key of ['label', 'epithet', 'quote', 'lore', 'art']) assert.ok(variant[key], variant.id + ': нет ' + key);
    await access(new URL('../' + variant.art, data));
  }
});

test('подстановка слов работает для каждого варианта', () => {
  for (const variant of vocab.variants) for (const chapter of chapters) for (const scene of Object.values(chapter.scenes)) {
    for (const line of scene.lines || []) assert.doesNotMatch(fill(line.text, vocab, variant.id), /[{}]/);
  }
  assert.equal(fill('только {once}', vocab, 'нет-такого'), fill('только {once}', vocab, vocab.default));
});

function playThrough(game, chapter, pick) {
  delete game.chapters[chapter.id];
  const progress = progressOf(game, chapter), visited = [];
  for (let guard = 0; guard < 500; guard += 1) {
    const now = stage(progress, chapter, game);
    if (visited.at(-1) !== progress.scene) visited.push(progress.scene);
    if (now === 'ending') return { progress, visited };
    if (now === 'choice') choose(progress, chapter, chapter.scenes[progress.scene].choice.options[pick].id, game);
    else if (now === 'journal') {
      const id = chapter.scenes[progress.scene].questionIds[0];
      if (pick === 0) { setDraft(game, id, '  вымышленная запись  ', chapter.id); assert.equal(saveEntry(game, id, chapter.id), true); }
      else { setDraft(game, id, 'черновик', chapter.id); answerLater(game, id, chapter.id); }
      leaveJournal(progress, chapter, game);
    } else advance(progress, chapter, game);
  }
  assert.fail('глава не закончилась');
}

test('обе ветки каждого эпизода доходят до концовки разными сценами', () => {
  for (const chapter of chapters) {
    const first = freshGame(), second = freshGame();
    const a = playThrough(first, chapter, 0), b = playThrough(second, chapter, 1);
    assert.notDeepEqual(a.visited, b.visited, chapter.id);
    assert.equal(a.progress.done && b.progress.done, true);
    const saved = Object.values(first.journal)[0], later = Object.values(second.journal)[0];
    assert.equal(saved.text, 'вымышленная запись');
    assert.deepEqual([later.text, later.draft, later.later], ['', 'черновик', true]);
  }
});

test('эпизоды открываются по порядку, а условия ссылаются на существующие варианты', () => {
  const options = [];
  for (const chapter of chapters) for (const scene of Object.values(chapter.scenes)) for (const o of scene.choice?.options || []) options.push(o.id);
  assert.equal(new Set(options).size, options.length, 'id вариантов выбора уникальны во всей игре');
  for (const chapter of chapters) for (const scene of Object.values(chapter.scenes)) {
    const conditional = [...(scene.lines || []), ...(Array.isArray(scene.next) ? scene.next : [])];
    for (const item of conditional) for (const key of ['if', 'ifNot']) if (item[key]) assert.ok(options.includes(item[key]), chapter.id + ': ' + item[key]);
  }
  const game = freshGame();
  index.chapters.forEach((item, i) => {
    if (item.after) assert.ok(index.chapters.slice(0, i).some(c => c.id === item.after), item.id);
    assert.equal(isLocked(item, freshGame()), i > 0);
    assert.equal(isLocked(item, game), false);
    playThrough(game, chapters[i], i % 2);
  });
});

test('реплики зависят от решений из прошлых эпизодов', () => {
  const [first, second] = chapters, scene = second.scenes[second.start];
  const honest = freshGame(), joke = freshGame();
  playThrough(honest, first, 0); playThrough(joke, first, 1);
  const a = linesOf(scene, honest).map(l => l.id), b = linesOf(scene, joke).map(l => l.id);
  assert.equal(a.length, b.length);
  assert.notDeepEqual(a, b);
  assert.ok(linesOf(scene, freshGame()).length < scene.lines.length);
});

test('пустой ответ не сохраняется, а повреждённые данные не ломают игру', () => {
  const game = freshGame();
  setDraft(game, 'q', '   ');
  assert.equal(saveEntry(game, 'q'), false);
  const restored = normalizeGame({ variant: 5, chapters: { x: { scene: 's', line: -3, choices: [] } }, journal: { q: { draft: 'д', later: 'да' } , bad: 1 } });
  assert.deepEqual(restored.chapters.x, { scene: 's', line: 0, choices: {}, done: false });
  assert.deepEqual(restored.journal, { q: { draft: 'д', text: '', savedAt: null, later: false, chapter: null } });
  assert.equal(progressOf(restored, { id: 'x', start: 'a', scenes: { a: { type: 'story', lines: [{}] } } }).scene, 'a');
});
