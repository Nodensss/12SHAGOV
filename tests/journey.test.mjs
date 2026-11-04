import test from 'node:test';
import assert from 'node:assert/strict';
import { journeyFor, journeyStages, sessionPhases, normalizeJourney, getJourney, journeySummary } from '../public/journey.js';

const completedAt = '2026-11-04T09:30:00.000Z';

test('the three journey stages cover every step once in order', () => {
  assert.deepEqual(journeyStages.flatMap(stage => stage.steps), Array.from({ length: 12 }, (_, index) => index + 1));
  assert.equal(new Set(journeyStages.map(stage => stage.id)).size, 3);
  for (const id of journeyStages.flatMap(stage => stage.steps)) {
    const metadata = journeyFor(id);
    for (const key of ['symbol', 'place', 'invitation', 'takeaway', 'nextHint']) assert.equal(typeof metadata[key], 'string');
    assert.ok(metadata.invitation.length > 30);
    assert.ok(metadata.nextHint.length > 30);
  }
  assert.equal(new Set(Array.from({ length: 12 }, (_, index) => journeyFor(index + 1).takeaway)).size, 12);
  assert.equal(journeyFor('2'), journeyFor(2));
  for (const invalid of [null, undefined, 0, -1, 13, 1.5, 'unknown']) assert.equal(journeyFor(invalid), null);
});

test('an old draft starts a fresh session without modifying its existing notes', () => {
  const oldDraft = { fields: { note: 'Моя заметка' }, opened: completedAt };
  assert.deepEqual(getJourney(oldDraft), { phase: 'intro', visited: [], completedAt: null, takeaway: '' });
  assert.deepEqual(getJourney(), normalizeJourney(null));
  assert.deepEqual(oldDraft, { fields: { note: 'Моя заметка' }, opened: completedAt });
  assert.deepEqual(journeySummary({ 1: oldDraft }), { visited: 1, completed: 0, insights: 0 });
});

test('a paused session keeps its phase, optional insight and completion through normalization', () => {
  const raw = { phase: 'reflection', visited: ['exercise', 'intro', 'exercise'], completedAt, takeaway: 'Попросить поддержки' };
  const result = getJourney({ journey: raw });
  assert.deepEqual(result, { phase: 'reflection', visited: ['intro', 'exercise'], completedAt, takeaway: 'Попросить поддержки' });
  assert.deepEqual(normalizeJourney(result), result);
  result.visited.push('takeaway');
  assert.deepEqual(raw.visited, ['exercise', 'intro', 'exercise']);
});

test('malformed imports cannot produce invalid session phases or false completions', () => {
  const result = normalizeJourney({
    phase: '__proto__', visited: ['intro', {}, 'unknown', 'takeaway', 2],
    completedAt: '2026-02-31T12:00:00.000Z', takeaway: { nested: 'invalid' }, arbitrary: true,
  });
  assert.deepEqual(result, { phase: 'intro', visited: ['intro', 'takeaway'], completedAt: null, takeaway: '' });
  for (const invalid of ['yesterday', '', '2026-11-04', '2026-11-04T24:00:00.000Z', '2026-13-01T12:00:00Z', true, 123, {}]) {
    assert.equal(normalizeJourney({ completedAt: invalid }).completedAt, null);
  }
  assert.equal(normalizeJourney({ completedAt: '2026-11-04T12:30:00+03:00' }).completedAt, '2026-11-04T12:30:00+03:00');
  assert.equal(normalizeJourney({ takeaway: 'я'.repeat(10001) }).takeaway.length, 10000);
  for (const invalid of [null, undefined, [], 5, 'intro']) assert.deepEqual(normalizeJourney(invalid), normalizeJourney({}));
  assert.deepEqual(normalizeJourney({ visited: 'intro' }).visited, []);
});

test('completion does not require disclosure or every phase', () => {
  const drafts = {
    1: { journey: { completedAt, visited: ['takeaway'] } },
    2: { journey: { phase: 'exercise', visited: ['intro'] } },
    3: { journey: { takeaway: 'Поговорить с другом' } },
    4: { journey: { takeaway: '   ' } },
    13: { journey: { completedAt, takeaway: 'Outside the twelve steps' } },
    invalid: { opened: completedAt },
  };
  assert.deepEqual(journeySummary(drafts), { visited: 3, completed: 1, insights: 1 });
  assert.deepEqual(journeySummary(null), { visited: 0, completed: 0, insights: 0 });
});

test('inherited fields and accessors cannot inject journey data or execute code', () => {
  const danger = () => { throw new Error('Do not execute accessor'); };
  const draft = {}, journey = {};
  Object.defineProperty(draft, 'journey', { get: danger });
  Object.defineProperties(journey, { phase: { get: danger }, visited: { get: danger }, completedAt: { get: danger }, takeaway: { get: danger } });
  assert.deepEqual(getJourney(draft), normalizeJourney(null));
  assert.deepEqual(normalizeJourney(journey), normalizeJourney(null));
  assert.deepEqual(getJourney(Object.create({ journey: { completedAt } })), normalizeJourney(null));
  const visited = ['intro'];
  Object.defineProperty(visited, '1', { get: danger, enumerable: true });
  assert.deepEqual(normalizeJourney({ visited }).visited, ['intro']);
  const drafts = {};
  Object.defineProperty(drafts, '1', { get: danger });
  assert.deepEqual(journeySummary(drafts), { visited: 0, completed: 0, insights: 0 });
  assert.deepEqual(sessionPhases, ['intro', 'exercise', 'reflection', 'takeaway']);
});
