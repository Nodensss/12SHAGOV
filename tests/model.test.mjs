import test from 'node:test';
import assert from 'node:assert/strict';
import { freshState, normalize, normalizeDraft } from '../public/model.js';

test('malformed nested drafts cannot reach exercise map/push/fields operations', () => {
  const state = normalize({
    drafts: {
      1: 'primitive', 2: null, 3: [],
      8: { fields: { amendsWho: { nested: 'bad' }, amendsWhat: 'text' }, entries: { not: 'an array' }, answers: [], selections: 'invalid' },
      9: { entries: [null, 2, 'text', { who: 'псевдоним', what: {}, understand: 'вопрос', id: 'entry-id' }] },
    },
    daily: { '2026-02-31': { fields: {} }, '2026-10-31': { entries: null } },
    contacts: [{ name: 'A', detail: 4 }, null, { name: 'Б', detail: 'телефон' }],
  });
  assert.deepEqual(Object.keys(state.drafts), ['8', '9']);
  assert.deepEqual(state.drafts[8].fields, { amendsWhat: 'text' });
  assert.deepEqual(state.drafts[8].entries, []);
  assert.deepEqual(state.drafts[8].answers, {});
  assert.deepEqual(state.drafts[8].selections, {});
  assert.deepEqual(state.drafts[9].entries, [{ who: 'псевдоним', understand: 'вопрос', id: 'entry-id' }]);
  assert.deepEqual(Object.keys(state.daily), ['2026-10-31']);
  assert.deepEqual(state.contacts, [{ name: 'Б', detail: 'телефон' }]);
  assert.doesNotThrow(() => state.drafts[8].entries.map(entry => entry.who));
});

test('prototype keys, unexpected fields and inherited properties are discarded', () => {
  const data = JSON.parse('{"drafts":{"__proto__":{"polluted":true},"constructor":{"x":1},"13":{"fields":{"x":"bad"}},"01":{"fields":{"x":"bad"}},"1":{"fields":{"__proto__":"bad","constructor":"bad","prototype":"bad","safe":"ok"},"admin":true}},"bookmarks":{"__proto__":true,"1":true,"13":true},"prefs":{"font":999}}');
  const result = normalize(data);
  assert.deepEqual(Object.keys(result.drafts), ['1']);
  assert.deepEqual(result.drafts[1].fields, { safe: 'ok' });
  assert.deepEqual(result.bookmarks, { 1: true });
  assert.equal('prefs' in result, false);
  assert.equal('admin' in result.drafts[1], false);
  assert.equal({}.polluted, undefined);
  assert.deepEqual(normalize(Object.create({ drafts: { 1: {} } })), freshState());
});

test('answers, booleans, dates and positions retain only their expected types', () => {
  const draft = normalizeDraft({
    fields: { x: 'x'.repeat(100001), wrong: 2 },
    answers: { 0: 'yes', 1: { bad: true } },
    skipped: { 0: true, 1: 'false' },
    selections: { mood: 'Спокойно', supports: ['Люди', false, { bad: 1 }, 'Группа'], invalid: 5 },
    cardLanes: { 0: 'после', 1: {} }, zoneCards: { 0: '2' },
    checkinDates: ['2026-10-31', '2026-10-31', '2026-02-31', null],
    opened: '2026-10-31T04:00:00.000Z', savedAt: 'yesterday', readPosition: -5,
  });
  assert.equal(draft.fields.x.length, 100000);
  assert.deepEqual(draft.answers, { 0: 'yes' });
  assert.deepEqual(draft.skipped, { 0: true });
  assert.deepEqual(draft.selections, { mood: 'Спокойно', supports: ['Люди', 'Группа'] });
  assert.deepEqual(draft.cardLanes, { 0: 'после' });
  assert.deepEqual(draft.checkinDates, ['2026-10-31']);
  assert.equal(draft.opened, '2026-10-31T04:00:00.000Z');
  assert.equal(Object.hasOwn(draft, 'savedAt'), false);
  assert.equal(Object.hasOwn(draft, 'readPosition'), false);
  assert.equal(Object.hasOwn(normalizeDraft({ readPosition: Infinity }), 'readPosition'), false);
});

test('fresh state and normalized copies do not alias an imported backup', () => {
  const first = freshState(), second = freshState();
  first.drafts[1] = {};
  assert.deepEqual(second.drafts, {});
  const backup = { drafts: { 1: { fields: { x: 'original' }, selections: { supports: ['A'] }, entries: [{ who: 'B' }] } }, contacts: [{ name: 'Друг', detail: 'Как связаться' }], lastStep: '1', visitCount: { 1: 3, 2: -1, 3: '4' }, bookmarks: { 1: true, 2: 1 } };
  const result = normalize(backup);
  result.drafts[1].fields.x = 'changed';
  result.drafts[1].selections.supports.push('C');
  result.drafts[1].entries[0].who = 'D';
  result.contacts[0].name = 'E';
  assert.equal(backup.drafts[1].fields.x, 'original');
  assert.deepEqual(backup.drafts[1].selections.supports, ['A']);
  assert.equal(backup.drafts[1].entries[0].who, 'B');
  assert.equal(backup.contacts[0].name, 'Друг');
  assert.equal(result.lastStep, 1);
  assert.deepEqual(result.visitCount, { 1: 3 });
  assert.deepEqual(result.bookmarks, { 1: true });
  assert.deepEqual(normalize(null), freshState());
});

test('direct callers cannot trigger accessors while normalizing', () => {
  const data = {};
  Object.defineProperty(data, 'drafts', { enumerable: true, get() { throw new Error('Do not execute'); } });
  assert.doesNotThrow(() => normalize(data));
  const field = {};
  Object.defineProperty(field, 'unsafe', { enumerable: true, get() { throw new Error('Do not execute'); } });
  assert.deepEqual(normalizeDraft({ fields: field }).fields, {});
});

test('journey progress and existing exercise records survive a JSON backup roundtrip', () => {
  const completedAt = '2026-11-04T10:20:30.000Z';
  const initial = normalize({
    drafts: {
      1: {
        fields: { discussion: 'О чём поговорить' }, answers: { 0: 'Мой ответ' }, skipped: { 1: true },
        cardLanes: { 0: 'до', 1: 'после' }, selections: { consequences: ['Просил(а) поддержки'] },
        opened: completedAt,
        journey: { phase: 'takeaway', visited: ['intro', 'exercise', 'reflection', 'takeaway'], completedAt, takeaway: 'Поддержка доступна' },
      },
      8: { fields: { amendsWho: 'Псевдоним' }, entries: [{ id: 'entry-1', who: 'Псевдоним', what: 'Короткое наблюдение' }] },
    },
    lastStep: 1, bookmarks: { 1: true },
    daily: { '2026-11-04': { fields: { dayImportant: 'Обычный день' }, journey: { phase: 'exercise', visited: ['intro'] } } },
  });
  // Storage and backup imports both normalize JSON-decoded state.
  const loaded = normalize(JSON.parse(JSON.stringify(initial)));
  const backup = JSON.parse(JSON.stringify({ data: loaded }));
  const restored = normalize(backup.data);
  assert.deepEqual(loaded, initial);
  assert.deepEqual(restored, initial);
  assert.deepEqual(restored.drafts[1].journey, {
    phase: 'takeaway', visited: ['intro', 'exercise', 'reflection', 'takeaway'], completedAt, takeaway: 'Поддержка доступна',
  });
  assert.deepEqual(restored.drafts[1].answers, { 0: 'Мой ответ' });
  assert.deepEqual(restored.drafts[1].cardLanes, { 0: 'до', 1: 'после' });
  assert.deepEqual(restored.drafts[8].entries, [{ id: 'entry-1', who: 'Псевдоним', what: 'Короткое наблюдение' }]);
  assert.equal(Object.hasOwn(restored.drafts[8], 'journey'), false);
});

test('model integration cleans malformed journeys without discarding older exercise data', () => {
  const restored = normalize({ drafts: {
    1: { fields: { discussion: 'Старая заметка' }, answers: { 0: 'Ответ' }, journey: null },
    2: { selections: { supports: ['Люди'] }, journey: ['exercise'] },
    3: {
      zoneCards: { 0: 'Могу сделать сам(а)' },
      journey: {
        phase: 'source', visited: ['exercise', 'intro', 'exercise', {}, 'unexpected'],
        completedAt: '2026-02-31T10:00:00.000Z', takeaway: { text: 'Неверный формат' }, unexpected: 'discard',
      },
    },
  } });
  assert.deepEqual(restored.drafts[1].fields, { discussion: 'Старая заметка' });
  assert.deepEqual(restored.drafts[1].answers, { 0: 'Ответ' });
  assert.deepEqual(restored.drafts[2].selections, { supports: ['Люди'] });
  assert.equal(Object.hasOwn(restored.drafts[1], 'journey'), false);
  assert.equal(Object.hasOwn(restored.drafts[2], 'journey'), false);
  assert.deepEqual(restored.drafts[3].journey, { phase: 'intro', visited: ['intro', 'exercise'], completedAt: null, takeaway: '' });
  assert.deepEqual(restored.drafts[3].zoneCards, { 0: 'Могу сделать сам(а)' });
});

test('normalized journey state neither aliases a backup nor executes journey accessors', () => {
  const backup = { drafts: { 1: { journey: { phase: 'exercise', visited: ['intro'], takeaway: 'Личный вывод' } } } };
  const restored = normalize(backup);
  restored.drafts[1].journey.phase = 'reflection';
  restored.drafts[1].journey.visited.push('exercise');
  restored.drafts[1].journey.takeaway = 'Другой вывод';
  assert.deepEqual(backup.drafts[1].journey, { phase: 'exercise', visited: ['intro'], takeaway: 'Личный вывод' });

  const draft = {}, journey = {};
  const fail = () => { throw new Error('Do not execute journey accessor'); };
  Object.defineProperty(draft, 'journey', { enumerable: true, get: fail });
  Object.defineProperty(journey, 'phase', { enumerable: true, get: fail });
  const clean = normalize({ drafts: { 1: draft, 2: { journey } } });
  assert.equal(Object.hasOwn(clean.drafts[1], 'journey'), false);
  assert.deepEqual(clean.drafts[2].journey, { phase: 'intro', visited: [], completedAt: null, takeaway: '' });
});
