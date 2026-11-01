import test from 'node:test';
import assert from 'node:assert/strict';
import { canReadSource, findPassages, sourceStatusLabel } from '../public/content.js';

const sources = [
  { id: 'edition-5', status: 'approved', title: 'Издание 5', edition: '5-е', file: 'fifth.pdf' },
  { id: 'edition-6', status: 'unverified', title: 'Издание 6', edition: '6-е', file: 'sixth.pdf' },
  { id: 'draft', status: 'draft', title: 'Черновик', file: 'draft.pdf' },
];
const content = {
  passages: [
    { id: 'a', sourceId: 'edition-5', page: 40, lineStart: 10, text: 'Первая строка\nЗдесь есть надежда\nЕщё одна строка.' },
    { id: 'b', sourceId: 'edition-6', page: 54, lineStart: 3, text: 'Та же надежда в другой редакции.' },
    { id: 'c', sourceId: 'draft', page: 5, text: 'Надежда из черновика не должна попасть в выдачу.' },
    { id: 'unknown', sourceId: 'missing', page: 99, text: 'Надежда без зарегистрированного источника.' },
  ],
  summaries: [
    { kind: 'editorial-summary', step: 1, file: 'docs/step01.md', title: 'Авторский пересказ', text: '# Заголовок\nАвторское слово: надежда.' },
    { title: 'Не размечен', text: 'Надежда без явного типа.' },
  ],
};

test('explicit drafts and internal sources stay blocked even in private preview', () => {
  for (const value of ['draft', 'internal', 'blocked', 'withdrawn', 'unpublished']) {
    assert.equal(canReadSource({ status: value }, true), false);
  }
  assert.equal(canReadSource({ status: 'approved', file: 'chernovik.pdf' }, true), false);
  assert.equal(canReadSource({ status: 'approved', title: 'Только для внутреннего использования' }, true), false);
  assert.equal(canReadSource({ status: 'approved', internal: true }, true), false);
  assert.equal(canReadSource({ status: 'approved' }), true);
  assert.equal(canReadSource({ status: 'unverified' }), false);
  assert.equal(canReadSource({ status: 'unverified' }, true), true);
  assert.equal(canReadSource({ status: 'unverified', privatePreviewEligible: false }, true), false);
  assert.equal(canReadSource({ published: true, publicationVerified: true }, true), false);
  assert.equal(canReadSource(null, true), false);
});

test('results retain edition, PDF page and exact excerpt line locators without mixing sources', () => {
  const results = findPassages(content, { sources }, 'НАДЕЖДА', { privatePreview: true });
  assert.equal(results.length, 3);
  const fifth = results[0];
  assert.equal(fifth.text, 'Здесь есть надежда');
  assert.deepEqual(fifth.citation, {
    sourceId: 'edition-5', title: 'Издание 5', edition: '5-е', file: 'fifth.pdf',
    page: 40, lineStart: 11, lineEnd: 11, locatorKind: 'pdf-page-lines',
  });
  assert.equal(results[1].page, 54);
  assert.equal(results[1].edition, '6-е');
  assert.equal(results[1].status, 'unverified');
  assert.equal(results[2].kind, 'editorial-summary');
  assert.equal(results[2].page, null);
  assert.equal(results[2].lineStart, 2);
  assert.equal(results.some(result => result.sourceId === 'draft'), false);
  assert.equal(results.some(result => result.sourceId === 'missing'), false);
});

test('source filters do not leak other editions or editorial text and limits are bounded', () => {
  assert.deepEqual(findPassages(content, sources, 'надежда', { sourceId: 'edition-6' }), []);
  const selected = findPassages(content, sources, 'надежда', { sourceId: 'edition-6', privatePreview: true });
  assert.equal(selected.length, 1);
  assert.equal(selected[0].sourceId, 'edition-6');
  const editorial = findPassages(content, sources, 'надежда', { sourceId: 'editorial-summary' });
  assert.equal(editorial.length, 1);
  assert.equal(editorial[0].status, 'editorial');
  assert.equal(findPassages(content, sources, 'надежда', { limit: 1 }).length, 1);
  assert.deepEqual(findPassages(content, sources, 'надежда', { limit: 0 }), []);
});

test('malformed and blank inputs return safely; queries stay plain text rather than HTML or regex', () => {
  assert.deepEqual(findPassages(null, sources, 'надежда'), []);
  assert.deepEqual(findPassages(content, sources, null), []);
  assert.deepEqual(findPassages(content, sources, ' \n\u0000 '), []);
  assert.deepEqual(findPassages(content, null, 'надежда').map(result => result.kind), ['editorial-summary']);
  const xss = '<img src=x onerror=alert(1)>';
  const xssContent = { passages: [{ sourceId: 'edition-5', text: 'Текст ' + xss }] };
  const result = findPassages(xssContent, sources, xss)[0];
  assert.equal(result.text, 'Текст ' + xss);
  assert.equal(result.text.includes('<mark>'), false);
  assert.deepEqual(findPassages(xssContent, sources, '.*'), []);
});

test('source approval cannot override stricter passage restrictions and labels do not fabricate approval', () => {
  const blocked = { passages: [{ sourceId: 'edition-5', status: 'draft', text: 'надежда' }] };
  assert.deepEqual(findPassages(blocked, sources, 'надежда', { privatePreview: true }), []);
  assert.equal(sourceStatusLabel({ status: 'unverified', statusLabel: 'Одобрено' }), 'Статус публикации не подтверждён');
  assert.equal(sourceStatusLabel({ published: true, publicationVerified: true }), 'Статус не указан · чтение заблокировано');
});
