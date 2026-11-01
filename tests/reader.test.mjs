import test from 'node:test';
import assert from 'node:assert/strict';
import { renderEditorialSummary } from '../public/reader.js';

test('editorial Markdown becomes navigable sections, lists and accessible tables', () => {
  const result = renderEditorialSummary('# Заголовок\n\n## Смысл\n\nТекст с **выделением**.\n\n| Код | Источник |\n| --- | --- |\n| БТ5 | стр. 40 |\n\n1. Первое\n2. Второе\n\n- Свой выбор');
  assert.equal(result.title, 'Заголовок');
  assert.deepEqual(result.outline, [{ id: 'reader-section-1', label: 'Смысл' }]);
  assert.match(result.html, /<h2 id="reader-section-1">Смысл<\/h2>/);
  assert.match(result.html, /<strong>выделением<\/strong>/);
  assert.match(result.html, /<th scope="col">Источник<\/th>/);
  assert.match(result.html, /<td>стр\. 40<\/td>/);
  assert.match(result.html, /<ol><li>Первое<\/li><li>Второе<\/li><\/ol>/);
  assert.match(result.html, /<ul><li>Свой выбор<\/li><\/ul>/);
});

test('source text cannot inject HTML through a heading, paragraph, or table', () => {
  const result = renderEditorialSummary('# <img src=x onerror=alert(1)>\n\n## <script>x</script>\n\n<a href=x>hi</a>\n\n| X |\n| --- |\n| <svg onload=alert(1)> |');
  assert.equal(result.html.includes('<script>'), false);
  assert.equal(result.html.includes('<svg'), false);
  assert.equal(result.html.includes('<a href='), false);
  assert.match(result.html, /&lt;script&gt;x&lt;\/script&gt;/);
  assert.match(result.html, /&lt;svg onload=alert\(1\)&gt;/);
});
