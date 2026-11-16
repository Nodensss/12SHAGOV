// Логика сюжетной игры без DOM: проверка глав, подстановка слов, прогресс и дневник.
// Весь текст игры лежит в data/*.json; этот файл не знает ни одной реплики.

export const GAME_KEY = '12shagov-game-v1';
const MAX_ENTRY = 20000;

export function freshGame() {
  return { version: 1, variant: null, chapters: {}, journal: {} };
}

const text = (value, max = MAX_ENTRY) => typeof value === 'string' ? value.slice(0, max) : '';
const plain = value => value && typeof value === 'object' && !Array.isArray(value);

export function normalizeGame(raw) {
  const game = freshGame();
  if (!plain(raw)) return game;
  if (typeof raw.variant === 'string') game.variant = raw.variant.slice(0, 80);
  if (plain(raw.chapters)) for (const [id, value] of Object.entries(raw.chapters)) {
    if (!plain(value)) continue;
    game.chapters[id] = {
      scene: typeof value.scene === 'string' ? value.scene : null,
      line: Number.isInteger(value.line) && value.line >= 0 ? value.line : 0,
      choices: plain(value.choices) ? Object.fromEntries(Object.entries(value.choices).filter(([, v]) => typeof v === 'string')) : {},
      done: value.done === true,
    };
  }
  if (plain(raw.journal)) for (const [id, value] of Object.entries(raw.journal)) {
    if (!plain(value)) continue;
    game.journal[id] = {
      draft: text(value.draft), text: text(value.text),
      savedAt: typeof value.savedAt === 'string' ? value.savedAt : null,
      later: value.later === true,
      chapter: typeof value.chapter === 'string' ? value.chapter : null,
    };
  }
  return game;
}

export function loadGame(storage = globalThis.localStorage) {
  try { return normalizeGame(JSON.parse(storage.getItem(GAME_KEY))); }
  catch { return freshGame(); }
}

export function saveGame(game, storage = globalThis.localStorage) {
  try { storage.setItem(GAME_KEY, JSON.stringify(game)); return true; }
  catch { return false; }
}

// Подставляет слова выбранной зависимости вместо {once}, {after} и т. п.
export function fill(template, vocab, variantId) {
  const variants = vocab?.variants || [];
  const fallback = variants.find(v => v.id === vocab?.default) || variants[0];
  const chosen = variants.find(v => v.id === variantId) || fallback;
  return String(template).replace(/\{(\w+)\}/g, (match, key) => chosen?.words?.[key] ?? fallback?.words?.[key] ?? match);
}

export function validateVocab(vocab) {
  const errors = [], keys = Object.keys(vocab?.tokens || {}), seen = new Set();
  if (!Array.isArray(vocab?.variants) || !vocab.variants.length) return ['vocab: нет вариантов'];
  for (const variant of vocab.variants) {
    if (!variant.id || seen.has(variant.id)) errors.push('vocab: повтор или пустой id ' + variant.id);
    seen.add(variant.id);
    if (!variant.label) errors.push('vocab: ' + variant.id + ' без label');
    if (variant.locked) continue;
    for (const key of keys) if (!variant.words?.[key]) errors.push('vocab: ' + variant.id + ' без слова ' + key);
  }
  if (!seen.has(vocab.default) || vocab.variants.find(v => v.id === vocab.default).locked) errors.push('vocab: default должен быть открытым героем');
  return errors;
}

// Возвращает список ошибок главы; пустой список — глава готова к игре.
export function validateChapter(chapter, vocab) {
  const errors = [], ids = new Set();
  const unique = (id, where) => {
    if (!id || typeof id !== 'string') errors.push(where + ': нет id');
    else if (ids.has(id)) errors.push(where + ': повтор id ' + id);
    else ids.add(id);
  };
  if (!chapter?.id) errors.push('глава без id');
  const scenes = chapter?.scenes || {}, questions = new Map((chapter?.questions || []).map(q => [q.id, q]));
  for (const q of chapter?.questions || []) { unique(q.id, 'вопрос'); if (!q.text) errors.push('вопрос ' + q.id + ' без текста'); }
  if (!scenes[chapter?.start]) errors.push('start указывает на несуществующую сцену');
  const tokens = new Set(Object.keys(vocab?.tokens || {}));
  const routes = next => Array.isArray(next) ? next.map(route => route.to) : [next];
  const target = (next, where) => {
    if (Array.isArray(next) && (!next.length || next.at(-1).if || next.at(-1).ifNot)) errors.push(where + ': последний маршрут next должен быть без условия');
    for (const id of routes(next)) if (!scenes[id]) errors.push(where + ': нет сцены ' + id);
  };
  for (const [sceneId, scene] of Object.entries(scenes)) {
    unique(sceneId, 'сцена');
    if (!['story', 'journal', 'ending'].includes(scene.type)) errors.push(sceneId + ': неизвестный type');
    for (const line of scene.lines || []) {
      unique(line.id, sceneId + ' реплика');
      if (!chapter.speakers?.[line.speaker]) errors.push(line.id + ': неизвестный speaker');
      if (!line.text) errors.push(line.id + ': пустой текст');
      for (const [, key] of String(line.text).matchAll(/\{(\w+)\}/g)) if (vocab && !tokens.has(key)) errors.push(line.id + ': неизвестное слово {' + key + '}');
    }
    if (scene.type === 'story') {
      if (!scene.lines?.length) errors.push(sceneId + ': нет реплик');
      if (scene.choice) {
        unique(scene.choice.id, sceneId + ' выбор');
        if ((scene.choice.options || []).length < 2) errors.push(sceneId + ': в выборе меньше двух вариантов');
        for (const option of scene.choice.options || []) { unique(option.id, sceneId + ' вариант'); target(option.next, option.id); }
      } else target(scene.next, sceneId);
    }
    if (scene.type === 'journal') {
      if (!scene.questionIds?.length) errors.push(sceneId + ': нет вопросов');
      for (const id of scene.questionIds || []) if (!questions.has(id)) errors.push(sceneId + ': нет вопроса ' + id);
      target(scene.next, sceneId);
    }
  }
  // Каждая ветка должна приводить к концовке.
  if (!errors.length) {
    const reaches = (id, seen = new Set()) => {
      if (seen.has(id)) return false;
      const scene = scenes[id], next = new Set(seen).add(id);
      if (scene.type === 'ending') return true;
      return scene.choice ? scene.choice.options.every(o => routes(o.next).every(id => reaches(id, next))) : routes(scene.next).every(id => reaches(id, next));
    };
    if (!reaches(chapter.start)) errors.push('не все ветки доходят до концовки');
  }
  return errors;
}

// Все варианты, которые игрок выбрал в любых главах: по ним ветвятся следующие эпизоды.
export function picked(game) {
  const set = new Set();
  for (const chapter of Object.values(game?.chapters || {})) for (const id of Object.values(chapter.choices || {})) set.add(id);
  return set;
}

const passes = (item, chosen) => (!item.if || chosen.has(item.if)) && (!item.ifNot || !chosen.has(item.ifNot));

// Реплики сцены с учётом условий if / ifNot (id варианта выбора из любой главы).
export function linesOf(scene, game) {
  const chosen = picked(game);
  return (scene.lines || []).filter(line => passes(line, chosen));
}

// next — id сцены или список маршрутов [{ if, ifNot, to }]; берётся первый подходящий.
export function resolveNext(next, game) {
  if (!Array.isArray(next)) return next;
  const chosen = picked(game);
  return (next.find(route => passes(route, chosen)) || next.at(-1)).to;
}

export function isLocked(item, game) {
  return !!item.after && game.chapters[item.after]?.done !== true;
}

export function progressOf(game, chapter) {
  const saved = game.chapters[chapter.id];
  if (saved && chapter.scenes[saved.scene]) {
    const max = Math.max(0, (linesOf(chapter.scenes[saved.scene], game).length || 1) - 1);
    saved.line = Math.min(saved.line, max);
    return saved;
  }
  return game.chapters[chapter.id] = { scene: chapter.start, line: 0, choices: saved?.choices || {}, done: saved?.done || false };
}

export function restartChapter(game, chapter) {
  const done = game.chapters[chapter.id]?.done || false;
  return game.chapters[chapter.id] = { scene: chapter.start, line: 0, choices: {}, done };
}

function enter(progress, chapter, sceneId) {
  progress.scene = sceneId; progress.line = 0;
  if (chapter.scenes[sceneId].type === 'ending') progress.done = true;
}

// Что сейчас ждёт игрока: следующая реплика, выбор, дневник или конец.
export function stage(progress, chapter, game) {
  const scene = chapter.scenes[progress.scene];
  if (scene.type === 'journal') return 'journal';
  if (scene.type === 'ending') return 'ending';
  if (progress.line < linesOf(scene, game).length - 1) return 'line';
  return scene.choice ? 'choice' : 'next';
}

export function advance(progress, chapter, game) {
  const now = stage(progress, chapter, game), scene = chapter.scenes[progress.scene];
  if (now === 'line') progress.line += 1;
  else if (now === 'next') enter(progress, chapter, resolveNext(scene.next, game));
  return progress;
}

export function choose(progress, chapter, optionId, game) {
  const scene = chapter.scenes[progress.scene];
  const option = scene.choice?.options.find(o => o.id === optionId);
  if (!option || stage(progress, chapter, game) !== 'choice') return progress;
  progress.choices[scene.choice.id] = option.id;
  enter(progress, chapter, option.next);
  return progress;
}

export function leaveJournal(progress, chapter, game) {
  const scene = chapter.scenes[progress.scene];
  if (scene.type === 'journal') enter(progress, chapter, resolveNext(scene.next, game));
  return progress;
}

function entry(game, questionId, chapterId) {
  const item = game.journal[questionId] ||= { draft: '', text: '', savedAt: null, later: false, chapter: chapterId || null };
  if (chapterId) item.chapter = chapterId;
  return item;
}

export function setDraft(game, questionId, value, chapterId) {
  entry(game, questionId, chapterId).draft = text(value);
}

export function saveEntry(game, questionId, chapterId, now = new Date()) {
  const item = entry(game, questionId, chapterId), value = item.draft.trim();
  if (!value) return false;
  item.text = value; item.draft = value; item.later = false; item.savedAt = now.toISOString();
  return true;
}

// «Ответить позже»: вопрос попадает в дневник как отложенный, черновик сохраняется.
export function answerLater(game, questionId, chapterId) {
  const item = entry(game, questionId, chapterId);
  if (!item.text) item.later = true;
}

export function deleteEntry(game, questionId) {
  delete game.journal[questionId];
}
