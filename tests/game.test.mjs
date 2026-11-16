import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import {
  advance, answerLater, choose, fill, freshGame, leaveJournal, normalizeGame, progressOf,
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
    for (const key of ['label', 'epithet', 'quote', 'lore', 'art']) assert.ok(variant[key], variant.id + ': нет ' + key);
    await access(new URL('../' + variant.art, data));
  }
});

test('подстановка слов работает для каждого варианта', () => {
  for (const variant of vocab.variants) for (const chapter of chapters) for (const scene of Object.values(chapter.scenes)) {
    for (const line of scene.lines || []) assert.doesNotMatch(fill(line.text, vocab, variant.id), /[{}]/);
  }
  assert.equal(fill('только {once}', vocab, 'нет-такого'), 'только один раз');
});

function playThrough(chapter, pick) {
  const game = freshGame(), progress = progressOf(game, chapter), visited = [];
  for (let guard = 0; guard < 500; guard += 1) {
    const now = stage(progress, chapter);
    if (visited.at(-1) !== progress.scene) visited.push(progress.scene);
    if (now === 'ending') return { game, progress, visited };
    if (now === 'choice') choose(progress, chapter, chapter.scenes[progress.scene].choice.options[pick].id);
    else if (now === 'journal') {
      const id = chapter.scenes[progress.scene].questionIds[0];
      if (pick === 0) { setDraft(game, id, '  вымышленная запись  ', chapter.id); assert.equal(saveEntry(game, id, chapter.id), true); }
      else { setDraft(game, id, 'черновик', chapter.id); answerLater(game, id, chapter.id); }
      leaveJournal(progress, chapter);
    } else advance(progress, chapter);
  }
  assert.fail('глава не закончилась');
}

test('обе ветки первого эпизода доходят до концовки разными сценами', () => {
  const chapter = chapters[0], a = playThrough(chapter, 0), b = playThrough(chapter, 1);
  assert.notDeepEqual(a.visited, b.visited);
  assert.equal(a.progress.done, true);
  assert.equal(b.progress.done, true);
  const saved = Object.values(a.game.journal)[0], later = Object.values(b.game.journal)[0];
  assert.equal(saved.text, 'вымышленная запись');
  assert.equal(saved.later, false);
  assert.deepEqual([later.text, later.draft, later.later], ['', 'черновик', true]);
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
