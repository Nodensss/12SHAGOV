const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

function inline(text) {
  return escapeHtml(String(text).replace(/\\([*_`|])/g, '$1'))
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

const isHeading = line => /^#{1,4}\s+/.test(line);
const isList = line => /^\s*(?:[-*]\s+|\d+\.\s+)/.test(line);
const isTable = line => /^\s*\|.*\|\s*$/.test(line);
const isBlock = line => isHeading(line) || isList(line) || isTable(line);
const tableCells = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(cell => cell.trim());
const isDivider = cells => cells.every(cell => /^:?-{3,}:?$/.test(cell));

export function renderEditorialSummary(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const outline = [], blocks = [];
  let title = '', i = 0, headingCount = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length, label = heading[2].trim();
      if (level === 1 && !title) title = label;
      else {
        const id = 'reader-section-' + (++headingCount);
        blocks.push('<h' + Math.min(level, 3) + ' id="' + id + '">' + inline(label) + '</h' + Math.min(level, 3) + '>');
        if (level === 2) outline.push({ id, label });
      }
      i++; continue;
    }
    if (isTable(line)) {
      const rows = [];
      while (i < lines.length && isTable(lines[i])) rows.push(tableCells(lines[i++]));
      if (!rows.length) continue;
      const header = rows[0], body = rows.slice(isDivider(rows[1] || []) ? 2 : 1);
      blocks.push('<div class="reader-table-wrap" tabindex="0" role="region" aria-label="Таблица из конспекта"><table><thead><tr>' +
        header.map(cell => '<th scope="col">' + inline(cell) + '</th>').join('') + '</tr></thead><tbody>' +
        body.map(row => '<tr>' + header.map((_, index) => '<td>' + inline(row[index] || '') + '</td>').join('') + '</tr>').join('') +
        '</tbody></table></div>');
      continue;
    }
    if (isList(line)) {
      const ordered = /^\d+\.\s+/.test(line), tag = ordered ? 'ol' : 'ul', items = [];
      const start = ordered ? Number(line.match(/^(\d+)\./)[1]) : 1;
      while (i < lines.length && isList(lines[i].trim()) && /^\d+\.\s+/.test(lines[i].trim()) === ordered) {
        items.push(lines[i++].trim().replace(ordered ? /^\d+\.\s+/ : /^[-*]\s+/, ''));
      }
      blocks.push('<' + tag + (ordered && start !== 1 ? ' start="' + start + '"' : '') + '>' + items.map(item => '<li>' + inline(item) + '</li>').join('') + '</' + tag + '>');
      continue;
    }
    const paragraph = [];
    while (i < lines.length && lines[i].trim() && !isBlock(lines[i].trim())) paragraph.push(lines[i++].trim());
    if (paragraph.length) blocks.push('<p>' + inline(paragraph.join(' ')) + '</p>');
  }
  return { title, outline, html: blocks.join('') };
}
