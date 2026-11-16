import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advance, assignSteering, canLeaveSteering, freshGame, itemsOf, leaveSteering, linesOf,
  loadGame, normalizeGame, picked, progressOf, restartChapter, saveGame, setDraft, stage,
  steeringOf, validateChapter,
} from '../public/game/engine.js';

const zoneIds = ['act', 'help', 'release'];
function fixture() {
  const chapter = {
    id: 'steering-fixture', start: 'before', questions: [], speakers: { narrator: { role: 'narrator' } },
    scenes: {
      before: { type: 'story', lines: [{ id: 'before-line', speaker: 'narrator', text: 'Дождь мешает планам.' }], next: 'wheel' },
      wheel: {
        type: 'steering', intro: 'Разложи части ситуации.', continueLabel: 'Продолжить сцену',
        zones: zoneIds.map(id => ({ id, title: id, hint: 'Пояснение зоны ' + id })),
        parts: ['part-a', 'part-b'].map(id => ({
          id, text: 'Часть ситуации ' + id,
          options: zoneIds.map(zone => ({ id: id + '-' + zone, zone, text: 'Отклик ' + id + '-' + zone })),
        })),
        next: [{ if: 'part-a-act', to: 'act-ending' }, { if: 'part-a-help', to: 'help-ending' }, { to: 'release-ending' }],
      },
      'act-ending': { type: 'ending', title: 'Своя часть', lines: [] },
      'help-ending': { type: 'ending', title: 'Разговор', lines: [] },
      'release-ending': { type: 'ending', title: 'Отпустить', lines: [] },
    },
  };
  return chapter;
}

function atWheel(game, chapter) {
  const progress = progressOf(game, chapter);
  advance(progress, chapter, game);
  assert.equal(stage(progress, chapter, game), 'steering');
  return progress;
}

test('Руль: все зоны осмысленны, раскладка влияет на переход и ничего не оценивает', () => {
  const chapter = fixture();
  assert.deepEqual(validateChapter(chapter), []);
  for (const first of zoneIds) for (const second of zoneIds) {
    const game = freshGame(), progress = atWheel(game, chapter);
    assert.deepEqual(steeringOf(progress, chapter), {});
    assignSteering(progress, chapter, 'part-a', first);
    assignSteering(progress, chapter, 'part-b', second);
    assert.equal(canLeaveSteering(progress, chapter), true);
    assert.equal(steeringOf(progress, chapter)['part-a'].text, 'Отклик part-a-' + first);
    leaveSteering(progress, chapter, game);
    assert.equal(progress.scene, first + '-ending');
    assert.equal(progress.done, true);
    assert.equal(stage(progress, chapter, game), 'ending');
  }
});

test('незавершённую раскладку нельзя пропустить, чужая зона и часть не меняют выбор', () => {
  const game = freshGame(), chapter = fixture(), progress = atWheel(game, chapter);
  assert.equal(canLeaveSteering(progress, chapter), false);
  advance(progress, chapter, game);
  leaveSteering(progress, chapter, game);
  assert.equal(progress.scene, 'wheel');
  for (const [part, zone] of [['missing', 'act'], ['part-a', 'wrong'], ['part-a', '__proto__']]) assignSteering(progress, chapter, part, zone);
  assert.deepEqual(progress.choices, {});
  assignSteering(progress, chapter, 'part-a', 'help');
  leaveSteering(progress, chapter, game);
  assert.equal(progress.scene, 'wheel');
  progress.choices['part-b'] = 'part-from-another-scene';
  assert.equal(canLeaveSteering(progress, chapter), false);
  assert.deepEqual(Object.keys(steeringOf(progress, chapter)), ['part-a']);
  assert.equal(canLeaveSteering({}, chapter), false);
  assert.equal(canLeaveSteering(undefined, undefined), false);
  assert.deepEqual(steeringOf(undefined, undefined), {});
});

test('перераскладка меняет условия реплик и находок вместо накопления прежних решений', () => {
  const game = freshGame(), chapter = fixture(), progress = atWheel(game, chapter);
  const conditional = { lines: [{ id: 'self', if: 'part-a-act' }, { id: 'request', if: 'part-a-help' }, { id: 'not-alone', ifNot: 'part-a-act' }] };
  const items = [{ id: 'self-note', when: 'part-a-act' }, { id: 'contact', when: 'part-a-help' }];
  assignSteering(progress, chapter, 'part-a', 'act');
  assert.deepEqual(linesOf(conditional, game).map(line => line.id), ['self']);
  assignSteering(progress, chapter, 'part-a', 'help');
  assert.equal(picked(game).has('part-a-act'), false);
  assert.equal(picked(game).has('part-a-help'), true);
  assert.deepEqual(linesOf(conditional, game).map(line => line.id), ['request', 'not-alone']);
  assert.deepEqual(itemsOf(items, game).map(item => item.found), [false, true]);
});

test('старое сохранение, черновик и частичная раскладка переживают загрузку без новой схемы', () => {
  const game = freshGame();
  game.variant = 'drugs';
  game.chapters['old-step'] = { scene: 'old-ending', line: 0, choices: { truth: 'told-the-truth' }, done: true };
  game.fights['old-fight'] = { won: true, tries: 2 };
  game.journal['old-question'] = { draft: 'Личная запись', text: 'Личная запись', savedAt: '2026-01-01T00:00:00.000Z', later: false, chapter: 'old-step' };
  const old = structuredClone(game), chapter = fixture(), progress = atWheel(game, chapter);
  assignSteering(progress, chapter, 'part-a', 'release');
  setDraft(game, 'new-question', 'Черновик без отправки', chapter.id);
  const records = new Map(), storage = { getItem: key => records.get(key), setItem: (key, value) => records.set(key, value) };
  assert.equal(saveGame(game, storage), true);
  const restored = loadGame(storage), resumed = progressOf(restored, chapter);
  assert.deepEqual(restored.chapters['old-step'], old.chapters['old-step']);
  assert.deepEqual(restored.fights, old.fights);
  assert.deepEqual(restored.journal['old-question'], old.journal['old-question']);
  assert.equal(restored.journal['new-question'].draft, 'Черновик без отправки');
  assert.equal(stage(resumed, chapter, restored), 'steering');
  assert.equal(steeringOf(resumed, chapter)['part-a'].zone, 'release');
  assert.equal(canLeaveSteering(resumed, chapter), false);
  assignSteering(resumed, chapter, 'part-b', 'act');
  leaveSteering(resumed, chapter, restored);
  assert.equal(resumed.scene, 'release-ending');
  const replay = restartChapter(restored, chapter);
  assert.deepEqual(replay.choices, {});
  assert.equal(replay.done, true);
  assert.deepEqual(restored.chapters['old-step'], old.chapters['old-step']);
  assert.deepEqual(normalizeGame(restored), restored);
});

test('проверка Руля отклоняет пустые отклики, дубли, пропущенные зоны и тупики', () => {
  const mutations = [
    chapter => chapter.scenes.wheel.zones.pop(),
    chapter => chapter.scenes.wheel.zones[1].id = 'act',
    chapter => chapter.scenes.wheel.zones[1].id = 'unknown',
    chapter => chapter.scenes.wheel.zones[0].hint = '',
    chapter => chapter.scenes.wheel.zones = {},
    chapter => chapter.scenes.wheel.parts = [],
    chapter => chapter.scenes.wheel.parts[0] = null,
    chapter => chapter.scenes.wheel.parts[0].options.pop(),
    chapter => chapter.scenes.wheel.parts[0].options[0] = null,
    chapter => chapter.scenes.wheel.parts[0].options[0].zone = 'unknown',
    chapter => chapter.scenes.wheel.parts[0].options[0].text = ' ',
    chapter => chapter.scenes.wheel.parts[1].options[0].id = 'part-a-act',
    chapter => chapter.scenes.wheel.parts[0].id = 'before',
    chapter => chapter.scenes.wheel.intro = '',
    chapter => chapter.scenes.wheel.continueLabel = '',
    chapter => chapter.scenes.wheel.next = 'missing',
    chapter => chapter.scenes.wheel.next = 'wheel',
    chapter => chapter.scenes.wheel.next = [{ if: 'part-a-act', to: 'act-ending' }],
  ];
  for (const mutate of mutations) {
    const chapter = fixture();
    mutate(chapter);
    assert.notDeepEqual(validateChapter(chapter), []);
  }
});

test('два черновика восстанавливаются вместе с выбранным вопросом, старые сохранения не меняют форму', () => {
  const game = freshGame(), chapter = fixture();
  chapter.questions = [{ id: 'question-first', text: 'Что сейчас зависит от меня?' }, { id: 'question-second', text: 'О какой помощи можно попросить?' }];
  chapter.scenes.before.next = 'page';
  chapter.scenes.page = { type: 'journal', questionIds: chapter.questions.map(question => question.id), next: 'act-ending' };
  game.chapters['old-chapter'] = { scene: 'old-ending', line: 0, choices: { old: 'old-choice' }, done: true };
  const legacy = structuredClone(game.chapters['old-chapter']), progress = progressOf(game, chapter);
  advance(progress, chapter, game);
  setDraft(game, 'question-first', 'Первый незавершённый ответ', chapter.id);
  setDraft(game, 'question-second', 'Второй незавершённый ответ', chapter.id);
  progress.question = 'question-second';
  const records = new Map(), storage = { getItem: key => records.get(key), setItem: (key, value) => records.set(key, value) };
  assert.equal(saveGame(game, storage), true);
  const restored = loadGame(storage), resumed = progressOf(restored, chapter);
  assert.equal(stage(resumed, chapter, restored), 'journal');
  assert.equal(resumed.question, 'question-second');
  assert.equal(restored.journal['question-first'].draft, 'Первый незавершённый ответ');
  assert.equal(restored.journal['question-second'].draft, 'Второй незавершённый ответ');
  assert.deepEqual(restored.chapters['old-chapter'], legacy);
  assert.equal(Object.hasOwn(restored.chapters['old-chapter'], 'question'), false);
  assert.equal(Object.hasOwn(restartChapter(restored, chapter), 'question'), false);
  for (const question of ['', ' ', null, 4]) {
    const old = normalizeGame({ chapters: { old: { ...legacy, question } } });
    assert.deepEqual(old.chapters.old, legacy);
  }
});
