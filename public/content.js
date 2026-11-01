const BLOCKED_STATUSES = new Set(['draft', 'internal', 'blocked', 'withdrawn', 'unpublished']);
const DRAFT_NAME = /черновик|только\s+для\s+внутреннего|не\s+для\s+продажи|chernovik|internal[-_\s]+only|\bdraft\b/i;

function text(value) { return typeof value === 'string' ? value : ''; }
function record(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function status(source) { return text(source?.status).trim().toLowerCase(); }

function explicitlyBlocked(source) {
  return !record(source) || BLOCKED_STATUSES.has(status(source)) ||
    source.blocked === true || source.internal === true || source.draft === true ||
    source.withdrawn === true || DRAFT_NAME.test([
      text(source.filename), text(source.file), text(source.title), text(source.edition),
    ].join(' '));
}

/** A private preview never changes a source's publication status. */
export function canReadSource(source, privatePreview = false) {
  if (explicitlyBlocked(source)) return false;
  if (status(source) === 'approved') return true;
  return status(source) === 'unverified' && privatePreview === true && source.privatePreviewEligible !== false;
}

export function sourceStatusLabel(source) {
  if (!record(source)) return 'Статус не указан · чтение заблокировано';
  if (explicitlyBlocked(source)) {
    if (status(source) === 'withdrawn') return 'Материал снят с публикации';
    if (status(source) === 'internal' || source?.internal === true) return 'Внутренний материал · чтение заблокировано';
    return 'Черновой или закрытый материал · чтение заблокировано';
  }
  if (status(source) === 'approved') return 'Редакторский статус: одобрено';
  if (status(source) === 'unverified') return 'Статус публикации не подтверждён';
  return 'Статус не указан · чтение заблокировано';
}

function integer(value) { return Number.isInteger(value) && value > 0 ? value : null; }
function sourcesArray(sources) {
  if (Array.isArray(sources)) return sources;
  return record(sources) && Array.isArray(sources.sources) ? sources.sources : [];
}

function snippet(value, query, baseLine = 1) {
  const lower = value.toLocaleLowerCase('ru-RU');
  const index = lower.indexOf(query.toLocaleLowerCase('ru-RU'));
  if (index < 0) return null;
  const before = value.slice(0, index);
  const lineStartIndex = before.lastIndexOf('\n') + 1;
  const after = value.indexOf('\n', index + query.length);
  const lineEndIndex = after < 0 ? value.length : after;
  const from = Math.max(lineStartIndex, index - 220);
  const to = Math.min(lineEndIndex, index + query.length + 260);
  const actualLine = baseLine + (before.match(/\n/g) || []).length;
  return {
    text: value.slice(from, to),
    lineStart: actualLine,
    lineEnd: actualLine + (value.slice(from, to).match(/\n/g) || []).length,
    truncatedStart: from > 0,
    truncatedEnd: to < value.length,
  };
}

/**
 * Return plain data only. Callers must escape result text before inserting HTML.
 * PDF line locators are relative to the extracted PDF page; TXT and editorial
 * locators are relative to the named file. No locators are taken from another edition.
 */
export function findPassages(content, sources, query, options = {}) {
  if (!record(content) || typeof query !== 'string') return [];
  const needle = query.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200);
  if (!needle) return [];
  const settings = record(options) ? options : {};
  const privatePreview = settings.privatePreview === true;
  const sourceFilter = text(settings.sourceId).trim();
  const limit = Number.isInteger(settings.limit) ? Math.max(0, Math.min(settings.limit, 100)) : 40;
  if (!limit) return [];
  const sourceMap = new Map();
  for (const source of sourcesArray(sources)) {
    if (record(source) && text(source.id) && !sourceMap.has(source.id)) sourceMap.set(source.id, source);
  }
  const matches = [];
  for (const passage of Array.isArray(content.passages) ? content.passages : []) {
    if (matches.length >= limit) break;
    if (!record(passage) || !text(passage.text) || !text(passage.sourceId)) continue;
    const source = sourceMap.get(passage.sourceId);
    if (sourceFilter && sourceFilter !== passage.sourceId) continue;
    if (!canReadSource(source, privatePreview)) continue;
    // A passage may have stricter restrictions than its containing source.
    if (passage.status && !canReadSource({ ...source, ...passage, id: source.id }, privatePreview)) continue;
    const hit = snippet(passage.text, needle, integer(passage.lineStart) || 1);
    if (!hit) continue;
    const page = integer(passage.page);
    const citation = {
      sourceId: source.id,
      title: text(source.title),
      edition: text(source.edition),
      file: text(source.file),
      page,
      lineStart: hit.lineStart,
      lineEnd: hit.lineEnd,
      locatorKind: page ? 'pdf-page-lines' : 'file-lines',
    };
    matches.push({
      kind: 'source-passage', id: text(passage.id), ...hit,
      sourceId: source.id, sourceTitle: citation.title, edition: citation.edition,
      file: citation.file, page, step: integer(passage.step),
      status: status(source), statusLabel: sourceStatusLabel(source), citation,
    });
  }
  for (const summary of Array.isArray(content.summaries) ? content.summaries : []) {
    if (matches.length >= limit) break;
    if (sourceFilter && sourceFilter !== 'editorial-summary') continue;
    if (!record(summary) || summary.kind !== 'editorial-summary' || !text(summary.text)) continue;
    if (BLOCKED_STATUSES.has(status(summary)) || summary.blocked === true || summary.internal === true || summary.draft === true) continue;
    const hit = snippet(summary.text, needle, 1);
    if (!hit) continue;
    const citation = {
      sourceId: 'editorial-summary', title: text(summary.title), edition: '',
      file: text(summary.file), page: null,
      lineStart: hit.lineStart, lineEnd: hit.lineEnd, locatorKind: 'editorial-file-lines',
    };
    matches.push({
      kind: 'editorial-summary', id: text(summary.file), ...hit,
      sourceId: 'editorial-summary', sourceTitle: citation.title, edition: '',
      file: citation.file, page: null, step: integer(summary.step),
      status: 'editorial', statusLabel: 'Авторский пересказ · не цитата из литературы', citation,
    });
  }
  return matches;
}
