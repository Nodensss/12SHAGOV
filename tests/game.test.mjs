import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import {
  advance, answerLater, choose, fill, freshGame, isLocked, leaveJournal, linesOf, normalizeGame, progressOf,
  saveEntry, setDraft, stage, validateChapter, validateVocab,
  levelOf, recordFight,
} from '../public/game/engine.js';
import { canUse, playTurn, skillsOf, startBattle, validateFight } from '../public/game/battle.js';

const data = new URL('../public/game/data/', import.meta.url);
const load = async file => JSON.parse(await readFile(new URL(file, data), 'utf8'));
const index = await load('episodes.json'), vocab = await load('vocab.json');
const episodes = index.chapters.filter(item => item.type !== 'fight'), bouts = index.chapters.filter(item => item.type === 'fight');
const chapters = await Promise.all(episodes.map(item => load(item.file)));
const fights = await Promise.all(bouts.map(item => load(item.file)));
const { skills } = await load('skills.json');

test('словарь и все главы игры проходят проверку', () => {
  assert.deepEqual(validateVocab(vocab), []);
  assert.equal(new Set(index.chapters.map(c => c.id)).size, index.chapters.length);
  chapters.forEach((chapter, i) => {
    assert.equal(chapter.id, episodes[i].id);
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
    if (item.type === 'fight') recordFight(game, item.id, true);
    else playThrough(game, chapters[episodes.indexOf(item)], i % 2);
  });
  assert.equal(levelOf(game), bouts.length + 1);
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

function fightWith(fight, choose) {
  let state = startBattle(fight);
  for (let turn = 0; turn < 40 && !state.over; turn += 1) state = playTurn(state, fight, choose(state, skillsOf(fight, skills).filter(s => canUse(state, s))));
  return state;
}

test('бои: данные верны, сложность растёт, награды идут по порядку', () => {
  fights.forEach((fight, i) => {
    assert.equal(fight.id, bouts[i].id);
    assert.deepEqual(validateFight(fight, skills), []);
    assert.equal(fight.reward.level, i + 2);
    if (i) assert.ok(fight.hp > fights[i - 1].hp, fight.id);
  });
});

test('одной силой воли бой не выиграть, а приёмами из сюжета — можно', () => {
  for (const fight of fights) {
    const will = fightWith(fight, (state, usable) => usable.find(s => s.id === 'will'));
    assert.equal(will.over, 'lose', fight.id + ': сила воли не должна побеждать');
    const smart = fightWith(fight, (state, usable) => {
      const opener = fight.armor && !state.open && usable.find(s => s.id === fight.armor.opener);
      return opener || usable.filter(s => s.id !== 'will' && s.id !== 'admit').sort((a, b) => b.dmg - a.dmg)[0] || usable[0];
    });
    assert.equal(smart.over, 'win', fight.id + ': должен быть путь к победе');
    assert.ok(smart.hp >= 3, fight.id + ': победа не должна висеть на волоске, осталось ' + smart.hp);
  }
});

test('броня босса снимается только признанием', () => {
  const boss = fights.at(-1), by = id => skills.find(s => s.id === id);
  let state = playTurn(startBattle(boss), boss, by('group'));
  assert.equal(state.foe, boss.hp);
  state = playTurn(state, boss, by('admit'));
  assert.equal(state.open, true);
  const before = state.foe;
  state = playTurn(state, boss, by('truth'));
  assert.ok(state.foe < before);
  assert.equal(canUse(state, by('truth')), false);
});
