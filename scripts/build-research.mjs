// Собирает www/research.html из docs/issledovanie.md, чтобы полный текст
// исследования открывался в приложении без интернета.
// Запуск: npm run research
import { readFileSync, writeFileSync } from 'node:fs';
import { marked } from 'marked';

const md = readFileSync(new URL('../docs/issledovanie.md', import.meta.url), 'utf8');

const renderer = new marked.Renderer();
const baseLink = renderer.link.bind(renderer);
renderer.link = (token) => {
  const html = baseLink(token);
  return /^https?:/.test(token.href) ? html.replace('<a ', '<a target="_blank" rel="noopener noreferrer" ') : html;
};

let body = marked.parse(md, { renderer, gfm: true });
body = body
  .replace(/<table>/g, '<div class="table-wrap"><table>')
  .replace(/<\/table>/g, '</table></div>');

const page = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="light dark">
  <title>Исследование — 12 шагов</title>
  <link rel="stylesheet" href="css/app.css">
  <style>
    .doc { max-width: 760px; margin: 0 auto; padding: 16px 16px calc(var(--safe-bottom) + 40px); }
    .doc h1 { font-size: 1.5rem; line-height: 1.25; }
    .doc h2 { margin-top: 2rem; }
    .doc h3 { margin-top: 1.5rem; }
    .doc blockquote { margin: 1rem 0; padding: 12px 16px; border-radius: var(--radius); background: var(--accent-soft); }
    .doc ul, .doc ol { padding-left: 1.25rem; }
    .doc li + li { margin-top: .35rem; }
    .doc hr { border: 0; border-top: 1px solid var(--line); margin: 2rem 0; }
    .table-wrap { overflow-x: auto; margin: 1rem 0; border: 1px solid var(--line); border-radius: 12px; }
    .doc table { border-collapse: collapse; min-width: 560px; font-size: .9rem; }
    .doc th, .doc td { padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
    .doc th { background: var(--surface-2); }
    .doc a { word-break: break-word; }
  </style>
</head>
<body>
  <header class="topbar">
    <a class="icon-btn" href="index.html#/more" aria-label="Назад в приложение">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
    </a>
    <h1 class="topbar-title">Исследование</h1>
  </header>
  <main class="doc">
${body}
  </main>
</body>
</html>
`;

writeFileSync(new URL('../www/research.html', import.meta.url), page);
console.log('www/research.html готов:', Math.round(page.length / 1024), 'КБ');
