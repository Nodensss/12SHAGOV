import { steps } from './steps.js';
import { createStore, loadPreferences, savePreferences } from './storage.js';
import { createExerciseRenderer } from './exercises.js';
import { canReadSource, findPassages, sourceStatusLabel } from './content.js';
import { freshState, normalize } from './model.js';
import { renderEditorialSummary } from './reader.js';

const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
let state = freshState(), store, content = { steps: [], summaries: [], passages: [] }, sources = [];
let prefs = { font: 100, contrast: false, speechRate: 1, privatePreview: false };
let currentStep = 0, saveTimer, toastTimer, timerInterval, timerEnd = 0;
let contentAvailable = false, sourceSearch = '', noteSearch = '', pendingSave = Promise.resolve();
let maintenance = false, lockPromise = null, unsavedWarning = false;
const $ = selector => document.querySelector(selector);
const h = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const today = () => {
  const date = new Date();
  return date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0');
};
const stepBy = id => steps.find(s => s.id === Number(id));
function draftFor(id) {
  state.drafts[id] ||= {};
  const d = state.drafts[id];
  for (const key of ['fields','answers','skipped','selections','cardLanes','zoneCards']) d[key] ||= {};
  d.entries ||= [];
  return d;
}
function toast(text) {
  $('#toast').textContent = text; $('#toast').classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3500);
}
function applyPrefs() {
  document.documentElement.style.setProperty('--scale', String(Math.min(160,Math.max(100,Number(prefs.font)||100))/100));
  document.body.classList.toggle('high-contrast', !!prefs.contrast);
}
function cleanPreferences(value) {
  const input=value && typeof value==='object' ? value : {};
  return {
    font:typeof input.font==='number' && Number.isFinite(input.font)?Math.min(160,Math.max(100,input.font)):100,
    contrast:input.contrast===true,
    speechRate:[0.8,1,1.2].includes(input.speechRate)?input.speechRate:1,
    privatePreview:input.privatePreview===true
  };
}
function setDraftStatus(text) { document.querySelectorAll('.draft-status').forEach(el => el.textContent = text); }
function scheduleSave() {
  if (maintenance || !state) return;
  setDraftStatus('Сохраняю на устройстве…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => flush().catch(error => toast(error.message)), 300);
}
async function flush() {
  clearTimeout(saveTimer);
  if (!state || store.isLocked() || maintenance) return;
  pendingSave = store.save(state);
  await pendingSave;
  setDraftStatus('Сохранено на устройстве');
}
function link(text, href, cls = 'button button-quiet') { return '<a class="' + cls + '" href="' + href + '">' + h(text) + '</a>'; }
function action(text, name, cls = 'button button-secondary', attrs = '') { return '<button type="button" class="' + cls + '" data-action="' + name + '" ' + attrs + '>' + h(text) + '</button>'; }
function heading(title, copy, eyebrow = '') {
  return '<div class="view-head"><div>' + (eyebrow ? '<div class="eyebrow">' + h(eyebrow) + '</div>' : '') + '<h1 tabindex="-1">' + h(title) + '</h1><p>' + h(copy) + '</p></div></div>';
}
function field(label, name, placeholder) {
  const d = draftFor(currentStep);
  return '<div class="field"><label for="f-' + h(name) + '">' + h(label) + '</label><textarea id="f-' + h(name) + '" data-field="' + h(name) + '" placeholder="' + h(placeholder || 'Можно оставить пустым') + '">' + h(d.fields[name] || '') + '</textarea></div>';
}
const optionLabels = {
  supports:'Возможные опоры',inventoryTopic:'Тема инвентаризации',boundaries:'Границы разговора',readiness:'Готовность к переменам',
  requestWords:'Язык просьбы',amendsRoute:'Маршрут исправления',checkinTime:'Время чек-ина',mood:'Самочувствие',
  practiceType:'Вид практики',practiceDuration:'Длительность практики',serviceScene:'Ситуация поддержки',serviceChoice:'Вариант поддержки',
  consequences:'Повторяющиеся последствия',practiceMode:'Формат практики'
};
function options(group, values, multiple = false) {
  const chosen = draftFor(currentStep).selections[group];
  return '<div class="option-row" role="group" aria-label="' + h(optionLabels[group] || group) + '">' + values.map(value => {
    const active = multiple ? Array.isArray(chosen) && chosen.includes(value) : chosen === value;
    return '<button type="button" class="option-chip' + (active ? ' selected' : '') + '" data-option="' + h(group) + '" data-value="' + h(value) + '" data-multiple="' + Number(multiple) + '" aria-pressed="' + active + '">' + h(value) + '</button>';
  }).join('') + '</div>';
}
const exercise = createExerciseRenderer({ draftFor, field, options, esc: h });
function stepCard(s) {
  const d = state.drafts[s.id];
  const status = !d?.opened ? 'Не открывал' : (state.visitCount[s.id] || 0) > 1 ? 'Возвращаюсь' : 'Знакомлюсь';
  return '<a class="step-card" href="#step/' + s.id + '" aria-label="Шаг ' + s.id + '. ' + h(s.name) + '"><span class="step-status ' + (d?.opened ? 'touched' : '') + '">' + status + '</span><span class="step-num">' + String(s.id).padStart(2,'0') + '</span><strong>' + h(s.name) + '</strong><small>' + h(s.short) + '</small>' + (state.bookmarks[s.id] ? '<span class="tiny">В закладках</span>' : '') + '</a>';
}
function home() {
  const next = state.lastStep || 1, s = stepBy(next);
  return '<div class="page"><section class="hero"><div class="hero-copy"><div class="eyebrow">12 шагов · личный темп</div><h1 tabindex="-1">С того места,<br>где вы сейчас.</h1><p>Немного чтения, одно упражнение, время для себя. Можно остановиться в любой момент.</p>' +
    link(state.lastStep ? 'Продолжить · шаг ' + next : 'Начать знакомство · 5 минут', '#step/' + next, 'button button-primary') + '<p class="tiny">Сейчас: ' + h(s.activityTitle) + '</p></div>' +
    '<div class="hero-art" aria-hidden="true"><span class="orbit orbit-one"></span><span class="orbit orbit-two"></span><span class="orbit orbit-three"></span><i class="orbit-dot a"></i><i class="orbit-dot b"></i><i class="orbit-dot c"></i></div></section>' +
    '<article class="soft-card game-card"><span class="micro-icon" aria-hidden="true">◐</span><h3>Истории одного двора</h3><p>Сюжетная игра: короткая сцена, выбор и страница дневника. Первый эпизод — 3–5 минут.</p>' + link('Играть →','./game/','text-link') + '</article>' +
    '<div class="section-heading"><h2>Карта шагов</h2><span class="muted">Открывайте любой</span></div><div class="step-grid">' + steps.map(stepCard).join('') + '</div>' +
    '<div class="home-foot-grid"><article class="soft-card"><span class="micro-icon" aria-hidden="true">✳</span><h3>На сегодня</h3><p>Какая поддержка доступна мне сейчас?</p>' + link('Собрать компас надежды →','#step/2','text-link') + '</article>' +
    '<article class="soft-card"><span class="micro-icon" aria-hidden="true">▤</span><h3>Личное пространство</h3><p>' + (store.hasPin() ? 'Записи защищены вашим PIN.' : 'Черновики сохраняются в этом браузере. PIN можно настроить в любое время.') + '</p>' + link('Мои заметки →','#notes','text-link') + '</article></div></div>';
}
function questionBlock(question, index) {
  const d = draftFor(currentStep), skipped = !!d.skipped[index];
  return '<div class="question' + (skipped ? ' skipped' : '') + '"><div class="question-head"><label for="q-' + index + '">' + h(question) + '</label><button class="skip-button" data-skip="' + index + '" aria-pressed="' + skipped + '">' + (skipped ? 'Вернуться к вопросу' : 'Пропустить') + '</button></div><textarea id="q-' + index + '" data-answer="' + index + '" placeholder="Только если хочется записать" ' + (skipped ? 'disabled' : '') + '>' + h(d.answers[index] || '') + '</textarea></div>';
}
function citation(item) {
  const source = sources.find(s => s.id === item.sourceId);
  return h(source?.title || source?.filename || item.sourceId || item.file || 'Источник') +
    (source?.edition ? ' · ' + h(source.edition) : '') +
    (item.page ? ' · PDF стр. ' + h(item.page) : '') +
    (item.lineStart ? ' · строки ' + h(item.lineStart) + (item.lineEnd && item.lineEnd !== item.lineStart ? '–' + h(item.lineEnd) : '') : '');
}
function sourceQuote(id) {
  const item = content.steps.find(s => s.id === id);
  const source = sources.find(s => s.id === item?.sourceId);
  if (!item) return '<p class="notice">Сведения об источнике пока недоступны. Упражнение можно пройти без них.</p>';
  const meta = '<div class="source-meta">' + citation(item) + '<br><span class="source-pill">' + h(sourceStatusLabel(source)) + '</span></div>';
  if (!canReadSource(source, prefs.privatePreview) || !canReadSource({...source,...item},prefs.privatePreview)) {
    return '<p class="notice">Статус публикации этой копии ещё не подтверждён. Для личного изучения можно включить просмотр непроверенных копий. Черновые и внутренние тексты остаются закрыты.</p>' + meta + link('Управление источниками →','#settings','text-link');
  }
  return '<blockquote class="source-quote">' + h(item.quote) + '</blockquote>' + meta + '<p class="tiny">Дословный текст источника. Введение, истории и вопросы ниже написаны для приложения.</p>';
}
function summaryPage(id) {
  const summary = content.summaries.find(s => s.step === id);
  if (!summary) return '<div class="reader-page"><div class="reader-toolbar">' + link('← К шагу ' + id,'#step/' + id,'button button-quiet') + '</div>' + heading('Конспект недоступен','Вернитесь к шагу и попробуйте позже.') + '</div>';
  const rendered = renderEditorialSummary(summary.text);
  return '<div class="reader-page"><div class="reader-toolbar">' + link('← К шагу ' + id,'#step/' + id,'button button-quiet') +
    '<div class="reader-toolbar-actions"><span class="reader-location">Шаг ' + id + ' / Конспект</span>' + action('⛶ На весь экран','reader-fullscreen','button button-quiet button-small') + '</div></div>' +
    '<header class="reader-hero"><div class="reader-hero-main"><div class="eyebrow">Авторский конспект · шаг ' + String(id).padStart(2,'0') + '</div><h1 tabindex="-1">' + h(summary.title) +
    '</h1><p>Структурированный просмотр исходного файла. Можно перейти к нужному разделу или читать подряд.</p>' +
    '<div class="reader-source"><strong>Статус: редакторский материал</strong><span>Источник: ' + h(summary.file) + '. Не утверждённый текст литературы.</span></div></div>' +
    '<div class="reader-hero-card" aria-hidden="true"><span>В этом конспекте</span><strong>' + rendered.outline.length + ' разделов</strong><p>Выберите тему в оглавлении или читайте подряд.</p></div></header>' +
    '<div class="reader-layout"><nav class="reader-toc" aria-label="Разделы конспекта"><h2>Содержание</h2><div class="reader-toc-list">' +
    rendered.outline.map((item,index) => '<button type="button" data-reader-section="' + item.id + '"><span>' + String(index+1).padStart(2,'0') + '</span>' + h(item.label) + '</button>').join('') +
    '</div></nav><article class="reader-article" aria-label="Текст конспекта">' + rendered.html + '</article></div></div>';
}
function calendar() {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth(), days = new Date(y,m+1,0).getDate();
  const start = (new Date(y,m,1).getDay()+6)%7;
  let grid = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(day => '<span class="calendar-day">' + day + '</span>').join('') + '<span class="calendar-day"></span>'.repeat(start);
  for (let d=1;d<=days;d++) {
    const date = y + '-' + String(m+1).padStart(2,'0') + '-' + String(d).padStart(2,'0'), exists = !!state.daily[date];
    grid += '<button class="calendar-day' + (exists ? ' recorded' : '') + '" data-daily="' + date + '" aria-label="' + date + (exists ? ', есть запись' : ', записи нет') + '" ' + (exists ? '' : 'disabled') + '>' + d + (exists ? '<span class="status-dot" aria-hidden="true">●</span>' : '') + '</button>';
  }
  return '<section class="content-card"><h2>Календарь записей · ' + h(now.toLocaleDateString('ru-RU',{month:'long',year:'numeric'})) + '</h2><p class="tiny">Только факт сохранения. Пропуски не создают долга.</p><div class="calendar-grid">' + grid + '</div></section>';
}
function stepPage(id) {
  const s = stepBy(id), d = draftFor(id);
  return '<div class="page step-layout"><div class="step-main"><div class="step-title-row"><div><div class="eyebrow">Шаг ' + id + ' · ' + h(s.verb) + '</div><h1 tabindex="-1">' + h(s.name) + '</h1><p class="step-kicker">' + h(s.short) + '</p></div><span class="step-number-big" aria-hidden="true">' + String(id).padStart(2,'0') + '</span></div>' +
    '<nav class="section-nav" aria-label="Разделы шага"><button data-section="intro"><span class="section-nav-index">01</span><span>Знакомство</span></button><button data-section="exercise"><span class="section-nav-index">02</span><span>Практика</span></button><button data-section="reflection"><span class="section-nav-index">03</span><span>Размышление</span></button><button data-section="source"><span class="section-nav-index">04</span><span>Источники</span></button></nav>' +
    '<section class="content-card" id="intro"><div class="eyebrow">01 / Знакомство</div><div class="intro-grid"><div><h2>Смысл шага</h2><p class="intro-copy">' + h(s.intro) + '</p></div><div class="story-box"><h3>Небольшая ситуация</h3><p>' + h(s.story) + '</p><span class="tiny">Вымышленный пример для размышления</span></div></div>' +
    '<div class="reading-controls">' + action('▶ Слушать введение','speak','button button-quiet button-small') + action('Пауза / продолжить','speech-pause','button button-quiet button-small') + action('Остановить','speech-stop','button button-quiet button-small') + '</div><p class="tiny" id="audio-status" aria-live="polite">Читается только введение локальным голосом браузера.</p></section>' +
    '<section class="activity-card" id="exercise"><div class="eyebrow">02 / Практика · 3–5 минут</div><h2>' + h(s.activityTitle) + '</h2><p class="activity-intro">' + h(s.activityIntro) + '</p>' +
    (id===7 ? '<p class="field-label">Формат практики</p>' + options('practiceMode',['Написать','Тихая практика']) : '') +
    '<div class="activity-area">' + exercise(id) + '</div>' +
    (id===1 ? '<p class="field-label">Что повторялось? Можно выбрать несколько наблюдений.</p>' + options('consequences',['Менял(а) обещания','Уставал(а)','Терял(а) выбор','Просил(а) поддержки'],true) : '') +
    '<p class="tiny">Можно использовать вымышленную ситуацию и оставить личные поля пустыми.</p></section>' +
    '<section class="content-card" id="reflection"><div class="eyebrow">03 / Размышление</div><h2>Вопросы для себя</h2><p class="tiny">Вопросы приложения; это не дословный опросник из литературы.</p><div class="question-list">' + s.questions.map(questionBlock).join('') + '</div></section>' +
    '<section class="content-card"><h2>Взять на разговор</h2>' + field('О чём я хочу поговорить со спонсором или доверенным человеком?', 'discussion', 'Этот черновик не отправляется') + '</section>' +
    '<section class="content-card" id="source"><div class="eyebrow">04 / Источники</div><h2>Текст и происхождение</h2>' + sourceQuote(id) + (id<=3 ? '<p>' + action('Читать авторский конспект на весь экран →','summary','button button-quiet', 'data-id="' + id + '"') + '</p>' : '') + '</section>' +
    (id===10 ? calendar() : '') +
    '<div class="step-actions">' + action(id===10 ? 'Сохранить чек-ин за сегодня' : 'Сохранить черновик','save','button button-primary') + action('Пауза и выйти','pause','button button-quiet') + action('Удалить записи шага','delete-step','button button-quiet') + '</div>' +
    '<p class="draft-status" role="status">Сохранено на устройстве</p></div><aside class="step-aside"><div class="aside-card"><h3>Ваш темп</h3><p>Можно пропустить вопрос и вернуться позже. Здесь нет оценок и обязательных ответов.</p>' + action(state.bookmarks[id] ? 'Убрать закладку' : 'В закладки','bookmark','button button-quiet button-small','aria-pressed="' + !!state.bookmarks[id] + '"') + '</div>' +
    '<div class="aside-card"><h3>Поддержка рядом</h3><p>Сложные темы можно обсудить с человеком, которому вы доверяете.</p>' + action('Мои контакты поддержки','support','text-link') + '</div><div class="aside-card">' + link(id===12 ? 'К карте шагов →' : 'Следующий шаг →',id===12 ? '#steps' : '#step/' + (id+1),'text-link') + '</div></aside></div>';
}
function hasContent(d) {
  return !!d && (d.savedAt || Object.values(d.fields || {}).some(Boolean) || Object.values(d.answers || {}).some(Boolean) || d.entries?.length || Object.keys(d.selections || {}).length);
}
function notesPage() {
  const q = noteSearch.toLocaleLowerCase('ru');
  const list = steps.filter(s => hasContent(state.drafts[s.id]) && (!q || (JSON.stringify(state.drafts[s.id]) + s.name).toLocaleLowerCase('ru').includes(q)));
  return '<div class="page">' + heading('Мои заметки','Приватные черновики в этом браузере. Экспорт создаёт личную копию.','Личное пространство') +
    '<div class="notes-toolbar"><input type="search" class="search-input" id="note-search" value="' + h(noteSearch) + '" placeholder="Найти в моих записях" aria-label="Поиск по заметкам">' + action('Экспорт JSON','export') + '<label class="button button-quiet">Импорт копии<input class="sr-only" type="file" id="import-file" accept=".json,application/json"></label></div>' +
    '<div class="privacy-banner">' + (store.hasPin() ? 'Записи зашифрованы. При уходе приложения в фон оно блокируется.' : 'Записи локальные. Включите PIN, если хотите зашифровать их в браузере.') + ' Очищение данных браузера удалит их; сохраните копию при необходимости.</div>' +
    '<div class="note-list">' + (list.length ? list.map(s => {
      const d = state.drafts[s.id];
      return '<article class="note-item"><div><h3>Шаг ' + s.id + ' · ' + h(s.name) + '</h3><p>' + h(d.savedAt ? new Date(d.savedAt).toLocaleString('ru-RU') : 'Автосохранённый черновик') + '</p></div><div class="note-actions">' + link('Открыть','#step/'+s.id,'button button-quiet button-small') + action('Удалить','delete-note','button button-danger button-small','data-id="' + s.id + '"') + '</div></article>';
    }).join('') : '<div class="empty-state"><strong>Заметок пока нет</strong>Можно пройти любой шаг без записей.</div>') + '</div>' + calendar() + '</div>';
}
function libraryPage() {
  return '<div class="page">' + heading('Библиотека','Источники, конспекты и поиск. Редакции хранятся отдельно.','Читать и исследовать') +
    '<div class="notice">' + (prefs.privatePreview ? 'Включён личный просмотр непроверенных копий. Их статус не изменён. Черновики закрыты.' : 'Показ непроверенных копий выключен. Доступны конспекты и сведения об источниках.') + ' ' + link('Настроить →','#settings','text-link') + '</div>' +
    (!contentAvailable ? '<p class="notice">Не удалось загрузить библиотеку. Перезагрузите приложение при доступной сети.</p>' : '') +
    '<form class="search-form" id="source-search"><input class="search-input" type="search" name="q" value="' + h(sourceSearch) + '" placeholder="Найти слово или фразу" aria-label="Поиск по материалам"><select name="source" aria-label="Фильтр источника"><option value="">Все доступные источники</option><option value="editorial-summary">Только редакторские конспекты</option>' + sources.filter(s => canReadSource(s,prefs.privatePreview)).map(s => '<option value="' + h(s.id) + '">' + h(s.title) + '</option>').join('') + '</select><button class="button button-primary">Искать</button></form><div id="search-status" role="status"></div><div class="search-results" id="search-results"></div>' +
    '<div class="section-heading"><h2>Конспекты первых трёх шагов</h2></div><p class="muted">Авторские выжимки из ваших Markdown-файлов. Они не являются утверждённым текстом литературы.</p><div class="book-grid">' +
    content.summaries.map(s => '<article class="book-card"><span class="source-pill">Редакторский конспект</span><h3>' + h(s.title) + '</h3>' + action('Читать','summary','button button-quiet','data-id="' + s.step + '"') + '</article>').join('') + '</div>' +
    '<div class="section-heading"><h2>Каталог источников</h2></div><div class="book-grid">' + sources.map(s => '<article class="book-card"><span class="source-pill">' + h(sourceStatusLabel(s)) + '</span><h3>' + h(s.title) + '</h3><p>' + h(s.edition || s.filename || s.file || '') + '</p><p class="tiny">' + (canReadSource(s,prefs.privatePreview) ? 'Доступно в личном поиске' : 'Текст закрыт в приложении') + '</p><details><summary>Сведения об источнике</summary><p class="tiny">' + h(s.file || s.filename || s.path || '') + '</p><p class="tiny">Язык: ' + h(s.language || 'ru') + '. Статус: ' + h(s.status) + '</p></details></article>').join('') + '</div></div>';
}
function settingsPage() {
  return '<div class="page">' + heading('Настройки','Чтение, приватность и поддержка.','Ваши предпочтения') +
    '<div class="settings-grid"><section class="setting"><h3>Размер текста</h3><label for="font-scale">Масштаб: <output id="font-value">' + prefs.font + '%</output></label><input type="range" id="font-scale" min="100" max="160" step="5" value="' + prefs.font + '" data-pref="font"></section>' +
    '<section class="setting"><h3>Контраст</h3><label><input type="checkbox" data-pref="contrast" ' + (prefs.contrast ? 'checked' : '') + '> Высокий контраст</label></section>' +
    '<section class="setting"><h3>Чтение вслух</h3><p>Только локальные голоса устройства. Текст введения показан на экране; личные записи не озвучиваются.</p><label for="speech-rate">Скорость</label><select id="speech-rate" data-pref="speechRate"><option value="0.8" ' + (prefs.speechRate===0.8?'selected':'') + '>Медленнее · 0,8</option><option value="1" ' + (prefs.speechRate===1?'selected':'') + '>Обычно · 1</option><option value="1.2" ' + (prefs.speechRate===1.2?'selected':'') + '>Быстрее · 1,2</option></select></section>' +
    '<section class="setting"><h3>Защита заметок</h3><p>' + (store.hasPin() ? 'PIN включён. При сворачивании приложения записи закрываются. Если забыть PIN, восстановить их получится только из ранее сохранённой копии.' : 'Можно зашифровать заметки PIN-кодом. Без PIN они хранятся локально открытым текстом в профиле браузера.') + '</p>' + action(store.hasPin()?'Снять PIN-защиту':'Настроить PIN',store.hasPin()?'remove-pin':'set-pin') + (store.hasPin() ? action('Заблокировать сейчас','lock','button button-quiet') : '') + '</section>' +
    '<section class="setting"><h3>Источники</h3><label><input type="checkbox" data-pref="privatePreview" ' + (prefs.privatePreview?'checked':'') + '> Личное чтение непроверенных копий</label><p>Открывает экземпляры без явной пометки «черновик». Это не подтверждает статус публикации. Черновые и внутренние материалы остаются закрыты.</p></section>' +
    '<section class="setting"><h3>Напоминание по желанию</h3><p>Скачайте нейтральное событие и добавьте в свой календарь. Приложение само не отправляет уведомления.</p>' + action('Создать событие календаря','reminder') + '</section>' +
    '<section class="setting"><h3>Моя поддержка</h3><p>Сохраните контакт спонсора, близкого человека или группы. Приложение ничего не отправляет им.</p>' + action('Контакты и поддержка','support') + '</section>' +
    '<section class="setting"><h3>Управление данными</h3><p>Нет облачной синхронизации, аналитики, рекламы или передачи заметок. Выгруженная копия JSON не зашифрована.</p>' + action('Экспортировать копию','export') + action('Удалить все личные данные','delete-all','button button-danger') + '</section></div></div>';
}
function render({focus=false, restore=false}={}) {
  if (!state || store.isLocked()) { renderLock(); return; }
  const route = location.hash.slice(1).split('/');
  currentStep = route[0]==='step' && stepBy(route[1]) ? Number(route[1]) : 0;
  const summaryId = route[0]==='summary' && [1,2,3].includes(Number(route[1])) ? Number(route[1]) : 0;
  let view = currentStep ? 'step' : summaryId ? 'summary' : ['home','steps','notes','library','settings'].includes(route[0]) ? route[0] : 'home';
  document.body.classList.toggle('reader-mode', view==='summary');
  $('#breadcrumb').textContent = currentStep ? 'Мой путь / Шаг ' + currentStep : view==='summary' ? 'Шаг ' + summaryId + ' / Конспект' : ({home:'Мой путь / Сегодня',steps:'Все шаги',notes:'Мои заметки',library:'Библиотека',settings:'Настройки'})[view];
  document.querySelectorAll('[data-nav]').forEach(el => {
    const active = el.dataset.nav === view || currentStep && el.dataset.nav==='steps' || summaryId && el.dataset.nav==='library';
    el.classList.toggle('active',!!active);
    if (active) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current');
  });
  $('#lock-button').hidden = !store.hasPin();
  document.body.classList.remove('vault-locked');
  app.innerHTML = view==='home' ? home() : view==='steps' ? '<div class="page">' + heading('Все двенадцать шагов','Свободный маршрут. Выберите то, с чем хотите познакомиться сейчас.') + '<div class="step-grid">' + steps.map(stepCard).join('') + '</div></div>' : view==='step' ? stepPage(currentStep) : view==='summary' ? summaryPage(summaryId) : view==='notes' ? notesPage() : view==='library' ? libraryPage() : settingsPage();
  document.title = currentStep ? 'Шаг ' + currentStep + ' — Свой путь' : view==='summary' ? 'Конспект шага ' + summaryId + ' — Свой путь' : 'Свой путь — 12 шагов';
  applyPrefs();
  if (focus) app.querySelector('h1')?.focus({preventScroll:true});
  if (restore && currentStep) window.scrollTo({top: Number(draftFor(currentStep).readPosition)||0});
  else if (focus) window.scrollTo(0,0);
}
function rerender(target) {
  const top = window.scrollY;
  let selector;
  if (target?.dataset.option) selector = '[data-option="' + CSS.escape(target.dataset.option) + '"][data-value="' + CSS.escape(target.dataset.value) + '"]';
  else if (target?.dataset.skip !== undefined) selector = '[data-skip="' + target.dataset.skip + '"]';
  else if (target?.dataset.move !== undefined) selector = '[data-move="' + target.dataset.move + '"][data-lane="' + target.dataset.lane + '"]';
  else if (target?.dataset.zoneCard !== undefined) selector = '[data-zone-card="' + target.dataset.zoneCard + '"][data-zone="' + target.dataset.zone + '"]';
  render(); if (selector) document.querySelector(selector)?.focus({preventScroll:true}); window.scrollTo(0,top);
}
async function routeChanged() {
  if (!state || store.isLocked()) return;
  clearTimeout(scrollTimer);
  stopSpeech(); stopTimer(); await flush();
  const id = Number(location.hash.split('/')[1]);
  if (location.hash.startsWith('#step/') && stepBy(id)) {
    const d = draftFor(id);
    state.lastStep=id; state.visitCount[id]=(state.visitCount[id]||0)+1; d.opened ||= new Date().toISOString();
    await flush();
  }
  render({focus:true,restore:true});
}
function openDialog(title, body) {
  modal.innerHTML = '<div class="view-head"><h2 id="modal-title">' + h(title) + '</h2>' + action('Закрыть','close-modal','button button-quiet button-small') + '</div>' + body;
  if (!modal.open) modal.showModal();
}
function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text],{type}));
  const a=document.createElement('a'); a.href=url;a.download=filename; a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function support() {
  openDialog('Мне нужна поддержка','<p>Можно сделать паузу, отойти от упражнения и обратиться к человеку, которому вы доверяете.</p>' +
    '<div class="entry-list">' + state.contacts.map((c,i)=>'<div class="entry-row"><span><strong>' + h(c.name) + '</strong><br>' + h(c.detail) + '</span>' + action('Удалить','remove-contact','button button-quiet button-small','data-id="'+i+'"') + '</div>').join('') + '</div>' +
    '<form id="contact-form"><div class="field"><label for="contact-name">Как назвать контакт</label><input id="contact-name" name="name" maxlength="80" placeholder="Спонсор, друг, группа"></div><div class="field"><label for="contact-detail">Телефон или способ связи</label><input id="contact-detail" name="detail" maxlength="160" placeholder="Личная подсказка, без отправки"></div><button class="button button-primary">Сохранить контакт</button></form><p class="tiny">Свяжитесь с человеком самостоятельно, когда захотите. Записи и контакты не отправляются из приложения.</p>');
}
function pinDialog(remove=false) {
  openDialog(remove?'Снять PIN-защиту':'Защитить записи','<form id="' + (remove?'remove-pin-form':'pin-form') + '"><p>' + (remove?'Для снятия шифрования введите действующий PIN.':'Выберите 4–12 цифр. Забытый PIN нельзя восстановить; перед включением можно экспортировать копию.') + '</p><div class="field"><label for="new-pin">PIN</label><input id="new-pin" type="password" inputmode="numeric" autocomplete="new-password" name="pin" pattern="[0-9]{4,12}" required minlength="4" maxlength="12"></div>' + (remove?'':'<div class="field"><label for="confirm-pin">Повторите PIN</label><input id="confirm-pin" type="password" inputmode="numeric" autocomplete="new-password" name="confirm" required minlength="4" maxlength="12"></div>') + '<p id="pin-error" role="alert"></p><button class="button button-primary">' + (remove?'Снять защиту':'Включить защиту') + '</button></form>');
}
async function lock() {
  if (lockPromise) return lockPromise;
  if (!store.hasPin()) return;
  maintenance=true;
  clearTimeout(saveTimer);clearTimeout(scrollTimer);
  const snapshot=state;
  state=null;sourceSearch='';noteSearch='';currentStep=0;
  stopSpeech();stopTimer();
  if(modal.open)modal.close();modal.innerHTML='';
  $('#toast').textContent='';renderLock();
  lockPromise=(async()=>{
    try{
      if(snapshot) await store.save(snapshot);
      else await pendingSave.catch(()=>{});
    }catch{unsavedWarning=true;}
    finally{
      await store.lock();state=null;maintenance=false;lockPromise=null;renderLock();
    }
  })();
  return lockPromise;
}
async function clearPersonalData() {
  if(maintenance)return;
  maintenance=true;clearTimeout(saveTimer);clearTimeout(scrollTimer);
  const previous=state;state=null;stopSpeech();stopTimer();
  if(modal.open)modal.close();modal.innerHTML='';
  app.innerHTML=heading('Удаляем личные данные','Подождите немного.');
  try{
    await pendingSave.catch(()=>{});
    await store.clear();
    state=freshState();sourceSearch='';noteSearch='';
    location.hash='#home';
  }catch(error){state=previous;throw error;}
  finally{maintenance=false;render();}
}
function renderLock() {
  document.body.classList.remove('reader-mode');document.body.classList.add('vault-locked');
  app.innerHTML='<div class="page lock-screen">' + heading('Личное пространство закрыто','Введите PIN на этом устройстве, чтобы продолжить.') + '<form id="unlock-form"><div class="field"><label for="unlock-pin">PIN</label><input type="password" id="unlock-pin" name="pin" inputmode="numeric" autocomplete="current-password" minlength="4" maxlength="12" required></div><p role="alert" id="unlock-error"></p><button class="button button-primary" ' + (maintenance?'disabled':'') + '>Открыть записи</button></form><p class="tiny">PIN не передаётся на сервер. Если он забыт, записи можно только удалить и начать заново.</p>' + action('Удалить данные и начать заново','reset-locked','button button-quiet',maintenance?'disabled':'') + '</div>';
  $('#lock-button').hidden=true; document.title='Свой путь — заблокировано';
}
function stopSpeech(){ window.speechSynthesis?.cancel(); }
function speak() {
  if (!window.speechSynthesis) {toast('Браузер не поддерживает чтение вслух.');return;}
  const voice=window.speechSynthesis.getVoices().find(v=>v.localService && v.lang.startsWith('ru'));
  if(!voice){toast('На устройстве не найден локальный русский голос. Текст доступен для чтения.');return;}
  stopSpeech(); const s=stepBy(currentStep), utterance=new SpeechSynthesisUtterance(s.name + ' шаг. ' + s.intro);
  utterance.voice=voice;utterance.lang='ru-RU';utterance.rate=Number(prefs.speechRate)||1;
  utterance.onend=()=>{const el=$('#audio-status');if(el)el.textContent='Чтение завершено.';};
  window.speechSynthesis.speak(utterance);$('#audio-status').textContent='Читаю введение. Можно поставить на паузу или остановить.';
}
function stopTimer(){clearInterval(timerInterval);timerInterval=null;timerEnd=0;}
function startTimer() {
  stopTimer();
  const value=draftFor(11).selections.practiceDuration, minutes=parseInt(value)||0;
  if(!minutes){toast('Практика без таймера. Можно закончить, когда захотите.');return;}
  timerEnd=Date.now()+minutes*60000;
  const update=()=>{
    const seconds=Math.max(0,Math.ceil((timerEnd-Date.now())/1000)), el=$('#timer-display');
    if(el) el.textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
    if(!seconds){stopTimer();if($('#timer-label'))$('#timer-label').textContent='Пауза завершена. Можно просто отметить, что вы заметили.';}
  };
  update();timerInterval=setInterval(update,500);
}
function reminderDialog() {
  openDialog('Напоминание в календаре','<form id="reminder-form"><div class="field"><label for="reminder-date">Дата</label><input id="reminder-date" type="date" name="date" value="' + today() + '" required></div><div class="field"><label for="reminder-time">Время на вашем устройстве</label><input id="reminder-time" type="time" name="time" value="19:00" required></div><div class="field"><label for="reminder-repeat">Повторять</label><select id="reminder-repeat" name="repeat"><option value="once">Один раз</option><option value="daily">Каждый день</option><option value="weekly">Раз в неделю</option></select></div><p>Название события — «Время для себя». Текст заметок не попадёт в календарь. Удалить или изменить напоминание можно в вашем календаре.</p><button class="button button-primary">Скачать событие .ics</button></form>');
}
function runSearch(form) {
  const values=new FormData(form), q=String(values.get('q')||'').trim();sourceSearch=q;
  const results=findPassages(content,sources,q,{privatePreview:!!prefs.privatePreview,sourceId:String(values.get('source')||''),limit:40});
  $('#search-status').textContent=q ? (results.length ? 'Найдено: '+results.length+(results.length===40?' · первые совпадения':'') : 'Совпадений в доступных материалах нет.') : 'Введите слово или фразу.';
  $('#search-results').innerHTML=results.map(item=>'<article class="search-result"><span class="source-pill">' + h(item.kind==='editorial-summary'?'Редакторский конспект':item.statusLabel||'Непроверенная копия') + '</span><p class="snippet">' + h(item.text) + '</p><div class="citation">' + (item.kind==='editorial-summary'?h(item.file):citation(item)) + '</div></article>').join('');
}

document.addEventListener('click', async event => {
  const target=event.target.closest('button,[data-action]'); if(!target)return;
  try {
    if(target.dataset.action==='close-modal'){modal.close();modal.innerHTML='';return;}
    if(target.dataset.action==='reader-fullscreen'||target.dataset.action==='fullscreen'){
      if(document.fullscreenElement)await document.exitFullscreen();
      else if(document.fullscreenEnabled && document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();
      else toast('Браузер ограничил полноэкранный режим. Нажмите F11 для разворота окна.');
      return;
    }
    if(target.dataset.readerSection){document.getElementById(target.dataset.readerSection)?.scrollIntoView({behavior:'smooth'});return;}
    if(maintenance)return;
    if(target.dataset.action==='reset-locked'){
      if(confirm('Окончательно удалить защищённые личные данные на этом устройстве?')){await clearPersonalData();}
      return;
    }
    if(!state || store.isLocked()) return;
    const d=currentStep?draftFor(currentStep):null;
    if(target.dataset.option){
      const key=target.dataset.option,value=target.dataset.value,chosen=d.selections[key];
      d.selections[key]=target.dataset.multiple==='1' ? (Array.isArray(chosen)&&chosen.includes(value)?chosen.filter(x=>x!==value):[...(Array.isArray(chosen)?chosen:[]),value]) : value;
      scheduleSave();rerender(target);return;
    }
    if(target.dataset.move!==undefined){d.cardLanes[target.dataset.move]=target.dataset.lane;scheduleSave();rerender(target);return;}
    if(target.dataset.zoneCard!==undefined){d.zoneCards[target.dataset.zoneCard]=target.dataset.zone;scheduleSave();rerender(target);return;}
    if(target.dataset.skip!==undefined){d.skipped[target.dataset.skip]=!d.skipped[target.dataset.skip];scheduleSave();rerender(target);return;}
    if(target.dataset.section){document.getElementById(target.dataset.section)?.scrollIntoView({behavior:'smooth'});return;}
    if(target.dataset.addEntry!==undefined){
      if(!d.fields.amendsWho&&!d.fields.amendsWhat&&!d.fields.amendsUnderstand){toast('Можно добавить короткий пункт или вернуться позже.');return;}
      d.entries.push({id:crypto.randomUUID(),who:d.fields.amendsWho||'',what:d.fields.amendsWhat||'',understand:d.fields.amendsUnderstand||''});
      d.fields.amendsWho='';d.fields.amendsWhat='';d.fields.amendsUnderstand='';scheduleSave();rerender();return;
    }
    if(target.dataset.removeEntry!==undefined){if(confirm('Удалить этот пункт личного списка?')){d.entries.splice(Number(target.dataset.removeEntry),1);scheduleSave();rerender();}return;}
    if(target.dataset.timerStart!==undefined){startTimer();return;}
    if(target.dataset.timerStop!==undefined){stopTimer();if($('#timer-display'))$('#timer-display').textContent='00:00';if($('#timer-label'))$('#timer-label').textContent='Практика остановлена. Можно вернуться позже.';return;}
    if(target.dataset.daily){const entry=state.daily[target.dataset.daily];if(entry)openDialog('Запись за ' + target.dataset.daily,'<div class="source-text">' + Object.entries(entry.fields||{}).filter(([,v])=>v).map(([k,v])=>'<p><strong>'+h(({dayImportant:'Важное',dayRepair:'Что исправить',dayGratitude:'Благодарность',dayNext:'Следующий шаг'})[k]||'Наблюдение')+'</strong><br>'+h(v)+'</p>').join('')+'</div>'+action('Удалить эту запись','delete-daily','button button-danger','data-date="'+target.dataset.daily+'"'));return;}
    switch(target.dataset.action){
      case 'save':
        d.savedAt=new Date().toISOString();
        if(currentStep===10){state.daily[today()]=JSON.parse(JSON.stringify(d));d.checkinDates=[...new Set([...(d.checkinDates||[]),today()])];}
        await flush();toast('Сохранено на этом устройстве.');if(currentStep===10)rerender();break;
      case 'pause':await flush();stopSpeech();stopTimer();location.hash='#home';break;
      case 'bookmark':state.bookmarks[currentStep]=!state.bookmarks[currentStep];await flush();rerender();break;
      case 'delete-step':
      case 'delete-note':{
        const id=Number(target.dataset.id)||currentStep;
        if(confirm('Окончательно удалить черновик шага ' + id + '?')){delete state.drafts[id];await flush();render();toast('Черновик удалён.');}
        break;
      }
      case 'delete-daily':if(confirm('Окончательно удалить эту запись чек-ина?')){delete state.daily[target.dataset.date];await flush();modal.close();render();}break;
      case 'delete-all':if(confirm('Окончательно удалить все личные заметки, контакты и прогресс на этом устройстве?')){await clearPersonalData();toast('Личные данные удалены.');}break;
      case 'summary':{
        const summary=content.summaries.find(s=>s.step===Number(target.dataset.id));
        if(summary)location.hash='#summary/'+summary.step;
        break;
      }
      case 'export':await flush();download('мои-заметки-12-шагов.json',JSON.stringify({format:'12shagov-backup',version:2,exportedAt:new Date().toISOString(),data:state},null,2),'application/json');toast('Копия содержит личный текст без шифрования.');break;
      case 'support':support();break;
      case 'remove-contact':if(confirm('Удалить этот контакт?')){state.contacts.splice(Number(target.dataset.id),1);await flush();support();}break;
      case 'set-pin':await flush();pinDialog();break;
      case 'remove-pin':pinDialog(true);break;
      case 'lock':await lock();break;
      case 'speak':speak();break;
      case 'speech-pause':if(window.speechSynthesis?.paused)window.speechSynthesis.resume();else window.speechSynthesis?.pause();break;
      case 'speech-stop':stopSpeech();if($('#audio-status'))$('#audio-status').textContent='Чтение остановлено.';break;
      case 'reminder':reminderDialog();break;
    }
  } catch(error){toast(error.message || 'Не удалось выполнить действие.');}
});
document.addEventListener('input',event=>{
  const el=event.target;if(!state||store.isLocked()||maintenance)return;
  if(el.dataset.field!==undefined){draftFor(currentStep).fields[el.dataset.field]=el.value;scheduleSave();}
  if(el.dataset.answer!==undefined){draftFor(currentStep).answers[el.dataset.answer]=el.value;scheduleSave();}
  if(el.dataset.pref==='font'){prefs.font=Number(el.value);applyPrefs();savePreferences(prefs);$('#font-value').textContent=prefs.font+'%';}
  if(el.id==='note-search'){
    noteSearch=el.value;const start=el.selectionStart;render();const input=$('#note-search');input.focus();input.setSelectionRange(start,start);
  }
});
document.addEventListener('change',async event=>{
  const el=event.target;try{
    if(!state||store.isLocked()||maintenance)return;
    if(el.dataset.pref){prefs[el.dataset.pref]=el.type==='checkbox'?el.checked:Number(el.value);savePreferences(prefs);applyPrefs();}
    if(el.dataset.selectField){draftFor(currentStep).fields[el.dataset.selectField]=el.value;scheduleSave();}
    if(el.id==='import-file'&&el.files[0]){
      const file=el.files[0];if(file.size>10*1024*1024)throw new Error('Копия слишком большая. Максимум 10 МБ.');
      const backup=JSON.parse(await file.text());
      if(backup.format!=='12shagov-backup'||backup.version!==2||!backup.data?.drafts)throw new Error('Это не поддерживаемая копия заметок.');
      if(confirm('Заменить текущие личные данные содержимым выбранной копии?')){state=normalize(backup.data);await flush();render();toast('Копия восстановлена.');}
    }
  }catch(error){toast(error.message);}
});
document.addEventListener('submit',async event=>{
  event.preventDefault();const form=event.target, values=new FormData(form), submit=form.querySelector('[type="submit"],button:not([type="button"])');
  try{
    if(maintenance)return;
    if(form.id==='unlock-form'){
      if(submit)submit.disabled=true;
      const opened=normalize(await store.unlock(String(values.get('pin'))));
      state=opened;
      if(document.hidden){await lock();return;}
      render({focus:true});
      if(unsavedWarning){toast('Не удалось сохранить последние изменения перед блокировкой. Открыта предыдущая сохранённая копия.');unsavedWarning=false;}
      return;
    }
    if(!state||store.isLocked())return;
    if(form.id==='source-search'){runSearch(form);return;}
    if(form.id==='pin-form'){
      if(values.get('pin')!==values.get('confirm'))throw new Error('PIN-коды не совпадают.');
      await flush();await store.setPin(String(values.get('pin')));
      if(document.hidden){await lock();return;}
      modal.close();modal.innerHTML='';render();toast('Записи зашифрованы.');return;
    }
    if(form.id==='remove-pin-form'){await flush();await store.removePin(String(values.get('pin')));modal.close();modal.innerHTML='';render();toast('PIN-защита снята. Записи сохранены локально.');return;}
    if(form.id==='contact-form'){
      const name=String(values.get('name')||'').trim(),detail=String(values.get('detail')||'').trim();
      if(!name&&!detail){toast('Можно сохранить название или способ связи.');return;}
      state.contacts.push({name:name||'Моя поддержка',detail});await flush();support();return;
    }
    if(form.id==='reminder-form'){
      const stamp=String(values.get('date')).replaceAll('-','')+'T'+String(values.get('time')).replace(':','')+'00',repeat=values.get('repeat');
      if(!/^\d{8}T\d{6}$/.test(stamp))throw new Error('Проверьте дату и время.');
      const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//12SHAGOV//RU','BEGIN:VEVENT','UID:'+crypto.randomUUID()+'@12shagov.local','DTSTAMP:'+new Date().toISOString().replace(/[-:]|\.\d{3}/g,''),'DTSTART:'+stamp,'DURATION:PT5M','SUMMARY:Время для себя','DESCRIPTION:Короткая пауза по желанию.'];
      if(repeat==='daily'||repeat==='weekly')lines.push('RRULE:FREQ='+repeat.toUpperCase());
      lines.push('BEGIN:VALARM','TRIGGER:PT0M','ACTION:DISPLAY','DESCRIPTION:Время для себя','END:VALARM','END:VEVENT','END:VCALENDAR');
      download('время-для-себя.ics',lines.join('\r\n'),'text/calendar');modal.close();toast('Добавьте событие в календарь по своему желанию.');return;
    }
  }catch(error){
    const output=form.querySelector('#pin-error,#unlock-error');if(output)output.textContent=error.message;else toast(error.message);
  }finally{if(submit)submit.disabled=false;}
});
let scrollTimer;
window.addEventListener('scroll',()=>{
  if(!currentStep||!state||store.isLocked()||maintenance)return;clearTimeout(scrollTimer);
  scrollTimer=setTimeout(()=>{if(currentStep&&state&&!store.isLocked()&&!maintenance){draftFor(currentStep).readPosition=window.scrollY;scheduleSave();}},400);
},{passive:true});
window.addEventListener('hashchange',()=>routeChanged().catch(error=>toast(error.message)));
document.addEventListener('fullscreenchange',()=>{
  document.querySelectorAll('[data-action="reader-fullscreen"],[data-action="fullscreen"]').forEach(button=>{
    button.textContent=document.fullscreenElement?'Выйти из полного экрана':'⛶ На весь экран';
  });
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&store?.hasPin()&&!maintenance)lock().catch(()=>{});else if(document.hidden&&state)flush().catch(()=>{});});
window.addEventListener('storage',async event=>{
  if(event.key!=='12shagov-v2'&&event.key!==null)return;
  maintenance=true;clearTimeout(saveTimer);clearTimeout(scrollTimer);state=null;
  stopSpeech();stopTimer();if(modal.open)modal.close();modal.innerHTML='';
  app.innerHTML=heading('Данные обновлены в другой вкладке','Открываем актуальную копию.');
  try{
    await pendingSave.catch(()=>{});await store.lock();
    store=createStore();
    if(store.isLocked()){maintenance=false;renderLock();}
    else{state=normalize(await store.load());maintenance=false;render();}
  }catch(error){maintenance=false;renderLock();toast(error.message);}
});
async function boot(){
  try{
    prefs=cleanPreferences(loadPreferences());applyPrefs();store=createStore();
    const data=await Promise.all([fetch('./data/content.json').then(r=>{if(!r.ok)throw new Error();return r.json();}),fetch('./data/sources.json').then(r=>{if(!r.ok)throw new Error();return r.json();})]).catch(()=>null);
    if(data){content=data[0];sources=Array.isArray(data[1])?data[1]:data[1].sources||[];contentAvailable=true;}
    if(store.isLocked()){state=null;renderLock();}else{
      const loaded=await store.load();state=normalize(loaded);
      if(loaded?.prefs){prefs=cleanPreferences({...prefs,...loaded.prefs});savePreferences(prefs);}
      await routeChanged();
    }
    if('serviceWorker' in navigator){
      const previous=await navigator.serviceWorker.getRegistration();
      await navigator.serviceWorker.register('./sw.js').catch(error=>{if(!previous)throw error;});
      await navigator.serviceWorker.ready;
      $('#offline-status').textContent='Готово к работе офлайн';
    }else $('#offline-status').textContent='Офлайн-режим браузером не поддерживается';
  }catch(error){
    if(store){toast(error.message);$('#offline-status').textContent='Офлайн-режим пока недоступен';}
    else app.innerHTML=heading('Не удалось открыть локальные данные',error.message)+'<p>Существующие данные не изменены. Проверьте доступ браузера к хранилищу.</p>';
  }
}
boot();
