// Логика сюжетной игры без DOM: проверка глав, подстановка слов, прогресс и дневник.
// Весь текст игры лежит в data/*.json; этот файл не знает ни одной реплики.

export const GAME_KEY = '12shagov-game-v1';
const MAX_ENTRY = 20000;
const STEERING_ZONES = ['act', 'help', 'release'];

export function freshGame() {
  return { version: 1, variant: null, chapters: {}, journal: {}, fights: {} };
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
    // Необязательное поле сохраняет открытую страницу дневника; старые записи
    // остаются той же формы, если игрок ещё не переключал вопрос.
    if (typeof value.question === 'string' && value.question.trim()) game.chapters[id].question = value.question;
  }
  if (plain(raw.fights)) for (const [id, value] of Object.entries(raw.fights)) {
    if (plain(value)) game.fights[id] = { won: value.won === true, tries: Number.isInteger(value.tries) && value.tries > 0 ? value.tries : 0 };
  }
  // Необязательное поле: незаконченный бой. Его нет в сохранении, пока игрок не в бою,
  // поэтому старые записи остаются той же формы.
  const battle = normalizeBattle(raw.battle);
  if (battle) game.battle = battle;
  if (plain(raw.journal)) for (const [id, value] of Object.entries(raw.journal)) {
    if (!plain(value)) continue;
    game.journal[id] = {
      draft: text(value.draft), text: text(value.text),
      savedAt: typeof value.savedAt === 'string' ? value.savedAt : null,
      later: value.later === true,
      chapter: typeof value.chapter === 'string' ? value.chapter : null,
    };
  }
  if (plain(raw.ownWords)) {
    const drafts = {};
    for (const [id,d] of Object.entries(plain(raw.ownWords.drafts) ? raw.ownWords.drafts : {})) {
      if (!plain(d)) continue;
      drafts[id] = { parts: Array.isArray(d.parts) ? [...new Set(d.parts.filter(v=>typeof v==='string').map(v=>v.slice(0,80)))].slice(0,4) : [], silent:d.silent===true, format:text(d.format,80), feeling:text(d.feeling,80), complete:d.complete===true };
    }
    game.ownWords={drafts};
    if (typeof raw.ownWords.final === 'string' && drafts[raw.ownWords.final]?.complete) game.ownWords.final=raw.ownWords.final;
  }
  return game;
}

// Оставляет от сохранённого боя только ожидаемые поля; законченный или повреждённый бой отбрасывается.
function normalizeBattle(raw) {
  if (!plain(raw) || typeof raw.fight !== 'string' || !raw.fight || !plain(raw.state)) return null;
  const s = raw.state, count = value => Number.isInteger(value) && value >= 0;
  if (![s.hp, s.maxHp, s.foe, s.foeMax, s.turn].every(count) || s.over) return null;
  if (s.hp < 1 || s.foe < 1 || s.hp > s.maxHp || s.foe > s.foeMax) return null;
  return {
    fight: raw.fight.slice(0, 80),
    state: {
      hp: s.hp, maxHp: s.maxHp, foe: s.foe, foeMax: s.foeMax, turn: s.turn,
      guard: s.guard === true, open: s.open === true,
      cooldowns: plain(s.cooldowns) ? Object.fromEntries(Object.entries(s.cooldowns).filter(([, value]) => count(value))) : {},
      log: Array.isArray(s.log) ? s.log.filter(plain).slice(0, 12).map(line => ({
        who: ['you', 'foe', 'note'].includes(line.who) ? line.who : 'note',
        text: text(line.text, 500),
        ...(line.hit === 'you' || line.hit === 'foe' ? { hit: line.hit } : {}),
        ...(line.heal === true ? { heal: true } : {}),
      })) : [],
      over: null,
    },
  };
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
    if (Array.isArray(next) && (!next.length || next.at(-1).if || next.at(-1).ifNot || next.at(-1).ifAny || next.at(-1).ifNone || next.at(-1).depth)) errors.push(where + ': последний маршрут next должен быть без условия');
    for (const id of routes(next)) if (!scenes[id]) errors.push(where + ': нет сцены ' + id);
  };
  for (const [sceneId, scene] of Object.entries(scenes)) {
    unique(sceneId, 'сцена');
    if (!['story', 'journal', 'steering', 'habit-map', 'own-words', 'ending'].includes(scene.type)) errors.push(sceneId + ': неизвестный type');
    for (const line of scene.lines || []) {
      unique(line.id, sceneId + ' реплика');
      if (!chapter.speakers?.[line.speaker]) errors.push(line.id + ': неизвестный speaker');
      if (!line.text) errors.push(line.id + ': пустой текст');
      for (const key of ['ifAny', 'ifNone']) if (line[key] !== undefined && (!Array.isArray(line[key]) || !line[key].length || line[key].some(id => typeof id !== 'string' || !id))) errors.push(line.id + ': неверное ' + key);
      if (line.depth !== undefined) {
        const d = line.depth;
        if (!d || !Array.isArray(d.of) || !d.of.length || new Set(d.of).size !== d.of.length || d.of.some(id => typeof id !== 'string' || !id) || !Number.isInteger(d.min) || !Number.isInteger(d.max) || d.min < 0 || d.max < d.min || d.max > d.of.length) errors.push(line.id + ': неверная глубина');
      }

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
    if (scene.type === 'steering') {
      const hasText = value => typeof value === 'string' && value.trim().length > 0;
      const zones = Array.isArray(scene.zones) ? scene.zones : [];
      if (zones.length !== STEERING_ZONES.length || new Set(zones.map(zone => zone?.id)).size !== STEERING_ZONES.length || zones.some(zone => !STEERING_ZONES.includes(zone?.id))) errors.push(sceneId + ': нужны три разные зоны act, help, release');
      for (const zone of zones) if (!hasText(zone?.title) || !hasText(zone?.hint)) errors.push(sceneId + ': зона без названия или пояснения');
      if (!hasText(scene.intro) || !hasText(scene.continueLabel)) errors.push(sceneId + ': нет введения или подписи продолжения');
      const parts = Array.isArray(scene.parts) ? scene.parts : [];
      if (parts.length < 2 || parts.length > 4) errors.push(sceneId + ': нужны от двух до четырёх частей ситуации');
      for (const part of parts) {
        unique(part?.id, sceneId + ' часть ситуации');
        if (!hasText(part?.text)) errors.push(sceneId + ': часть ситуации без текста');
        const options = Array.isArray(part?.options) ? part.options : [];
        if (options.length !== STEERING_ZONES.length || new Set(options.map(option => option?.zone)).size !== STEERING_ZONES.length || options.some(option => !STEERING_ZONES.includes(option?.zone))) errors.push((part?.id || sceneId) + ': нужен один вариант для каждой зоны');
        for (const option of options) {
          unique(option?.id, sceneId + ' решение');
          if (!hasText(option?.text)) errors.push((option?.id || sceneId) + ': нет отклика на решение');
        }
      }
      if (scene.choice) errors.push(sceneId + ': выбор действий должен быть отдельной сюжетной сценой');
      target(scene.next, sceneId);
    }
    if (scene.type === 'own-words') {
      if (!Number.isInteger(scene.minParts) || !Number.isInteger(scene.maxParts) || scene.minParts < 1 || scene.maxParts < scene.minParts || scene.maxParts > 4 || typeof scene.final !== 'boolean' || !scene.intro) errors.push(sceneId + ': неверная сборка просьбы');
      target(scene.next, sceneId);
    }
    if (scene.type === 'habit-map') {
      const hasText = value => typeof value === 'string' && value.trim().length > 0;
      if (!hasText(scene.intro) || !hasText(scene.continueLabel)) errors.push(sceneId + ': нет введения или подписи продолжения');
      const cells = Array.isArray(scene.cells) ? scene.cells : [];
      if (cells.length !== 4) errors.push(sceneId + ': нужны четыре клетки привычки');
      for (const cell of cells) {
        unique(cell?.id, sceneId + ' клетка привычки');
        if (!hasText(cell?.title)) errors.push(sceneId + ': клетка привычки без названия');
        const options = Array.isArray(cell?.options) ? cell.options : [];
        if (options.length !== 2) errors.push((cell?.id || sceneId) + ': нужны два аспекта ситуации');
        for (const option of options) {
          unique(option?.id, sceneId + ' аспект ситуации');
          if (!hasText(option?.text)) errors.push((option?.id || sceneId) + ': аспект ситуации без текста');
        }
      }
      if (scene.choice) errors.push(sceneId + ': выбор действий должен быть отдельной сюжетной сценой');
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

// Всё, что игрок уже сделал: выбранные варианты, пройденные эпизоды и выигранные бои.
// По этим id ветвятся реплики (if / ifNot), открываются эпизоды и находки.
export function picked(game) {
  const set = new Set();
  for (const [chapterId, chapter] of Object.entries(game?.chapters || {})) {
    if (chapter.done) set.add(chapterId);
    for (const id of Object.values(chapter.choices || {})) set.add(id);
  }
  for (const [fightId, fight] of Object.entries(game?.fights || {})) if (fight.won) set.add(fightId);
  return set;
}

const passes = (item, chosen) => (!item.if || chosen.has(item.if)) && (!item.ifNot || !chosen.has(item.ifNot))
  && (!item.ifAny || item.ifAny.some(id => chosen.has(id)))
  && (!item.ifNone || !item.ifNone.some(id => chosen.has(id)))
  && (!item.depth || (() => { const count = item.depth.of.filter(id => chosen.has(id)).length; return count >= item.depth.min && count <= item.depth.max; })());

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
  const have = picked(game);
  if (item.after && !have.has(item.after)) return true;
  if (item.allOfAny?.some(group => !group.some(id => have.has(id)))) return true;
  // needs: { count, of: [id, ...] } — открыть, когда пройдено хотя бы count из списка.
  return !!item.needs && item.needs.of.filter(id => have.has(id)).length < item.needs.count;
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
  if (scene.type === 'steering') return 'steering';
  if (scene.type === 'habit-map') return 'habit-map';
  if (scene.type === 'own-words') return 'own-words';
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
  enter(progress, chapter, resolveNext(option.next, game));
  return progress;
}

// Раскладка хранится теми же постоянными id, что обычные выборы. Старые сохранения
// не требуют миграции, а реплики и находки могут ссылаться на решение через if / when.
export function steeringOf(progress, chapter) {
  const scene = chapter?.scenes?.[progress?.scene];
  if (scene?.type !== 'steering' || !Array.isArray(scene.parts) || !Array.isArray(scene.zones)) return {};
  const selections = [];
  for (const part of scene.parts) {
    if (!part || !Array.isArray(part.options) || !Object.hasOwn(progress?.choices || {}, part.id)) continue;
    const chosen = part.options.find(option => option && option.id === progress.choices[part.id] && STEERING_ZONES.includes(option.zone) && scene.zones.some(zone => zone?.id === option.zone));
    if (chosen) selections.push([part.id, chosen]);
  }
  return Object.fromEntries(selections);
}

export function assignSteering(progress, chapter, partId, zoneId) {
  const scene = chapter?.scenes?.[progress?.scene];
  if (scene?.type !== 'steering' || !Array.isArray(scene.zones) || !Array.isArray(scene.parts) || !STEERING_ZONES.includes(zoneId) || !scene.zones.some(zone => zone?.id === zoneId)) return progress;
  const part = scene.parts.find(part => part?.id === partId), option = Array.isArray(part?.options) && part.options.find(option => option?.zone === zoneId);
  if (!option || typeof option.id !== 'string' || !option.id) return progress;
  if (!plain(progress.choices)) progress.choices = {};
  Object.defineProperty(progress.choices, part.id, { value: option.id, writable: true, enumerable: true, configurable: true });
  return progress;
}

export function canLeaveSteering(progress, chapter) {
  const scene = chapter?.scenes?.[progress?.scene];
  if (scene?.type !== 'steering' || !Array.isArray(scene.parts) || !scene.parts.length) return false;
  const selected = steeringOf(progress, chapter);
  return scene.parts.every(part => part && Object.hasOwn(selected, part.id));
}

export function leaveSteering(progress, chapter, game) {
  if (canLeaveSteering(progress, chapter)) enter(progress, chapter, resolveNext(chapter.scenes[progress.scene].next, game));
  return progress;
}

// В карте привычки игрок выделяет по одному аспекту каждого звена первого случая.
// Смена аспекта заменяет прежний обычный выбор; отдельного поля сохранения нет.
export function habitMapOf(progress, chapter) {
  const scene = chapter?.scenes?.[progress?.scene];
  if (scene?.type !== 'habit-map' || !Array.isArray(scene.cells)) return {};
  const selections = [];
  for (const cell of scene.cells) {
    if (!cell || typeof cell.id !== 'string' || !cell.id || !Array.isArray(cell.options) || !Object.hasOwn(progress?.choices || {}, cell.id)) continue;
    const chosen = cell.options.find(option => option && typeof option.id === 'string' && option.id && option.id === progress.choices[cell.id]);
    if (chosen) selections.push([cell.id, chosen]);
  }
  return Object.fromEntries(selections);
}

export function assignHabitCell(progress, chapter, cellId, optionId) {
  const scene = chapter?.scenes?.[progress?.scene];
  if (scene?.type !== 'habit-map' || !Array.isArray(scene.cells) || typeof cellId !== 'string' || !cellId) return progress;
  const cell = scene.cells.find(cell => cell?.id === cellId);
  const option = Array.isArray(cell?.options) && cell.options.find(option => option?.id === optionId);
  if (!option || typeof option.id !== 'string' || !option.id) return progress;
  if (!plain(progress.choices)) progress.choices = {};
  Object.defineProperty(progress.choices, cell.id, { value: option.id, writable: true, enumerable: true, configurable: true });
  return progress;
}

export function canLeaveHabitMap(progress, chapter) {
  const scene = chapter?.scenes?.[progress?.scene];
  if (scene?.type !== 'habit-map' || !Array.isArray(scene.cells) || scene.cells.length !== 4 || new Set(scene.cells.map(cell => cell?.id)).size !== 4) return false;
  const selected = habitMapOf(progress, chapter);
  return scene.cells.every(cell => cell && Array.isArray(cell.options) && cell.options.length === 2 && Object.hasOwn(selected, cell.id));
}

export function leaveHabitMap(progress, chapter, game) {
  if (canLeaveHabitMap(progress, chapter)) enter(progress, chapter, resolveNext(chapter.scenes[progress.scene].next, game));
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

// Уровень героя: 1 в начале, +1 за каждый выигранный бой.
export function levelOf(game) {
  return 1 + Object.values(game.fights || {}).filter(f => f.won).length;
}

export function recordFight(game, fightId, won) {
  const item = game.fights[fightId] ||= { won: false, tries: 0 };
  item.tries += 1;
  if (won) item.won = true;
}

// Отмечает пройденным элемент без сцен (испытание).
export function markDone(game, id) {
  game.chapters[id] = { scene: null, line: 0, choices: game.chapters[id]?.choices || {}, done: true };
}

// Находки в рюкзаке: предмет найден, если его when есть среди сделанного игроком.
export function itemsOf(items, game) {
  const have = picked(game);
  return items.map(item => ({ ...item, found: have.has(item.when) }));
}

// Глубина страницы тетради: сколько её слоёв (1–3) пройдено.
export function depthOf(pageId, index, game) {
  const have = picked(game);
  return index.chapters.filter(item => item.page === pageId && have.has(item.id)).length;
}

// Приёмы с полем page зависят от тетради: урон и лечение умножаются на глубину страницы,
// реплика берётся по глубине. Непройденная страница считается за один слой, чтобы данные боя оставались проверяемыми.
export function scaledSkills(skills, index, game) {
  return skills.map(skill => {
    if (!skill.page) return skill;
    const depth = Math.max(1, depthOf(skill.page, index, game));
    const scaled = { ...skill, depth, dmg: (skill.dmg || 0) * depth, say: skill.says?.[depth - 1] ?? skill.say };
    if (skill.heal) scaled.heal = skill.heal * depth;
    scaled.hint = (scaled.dmg ? scaled.dmg + ' урона' : skill.hint) + ' · слой ' + depth + ' из 3';
    return scaled;
  });
}

// Conversation uses the ordinary chapter choices, so v1 saves need no new fields.
export function conversationState(step, index, game) {
  const have = picked(game);
  const pages = (step.pages || []).map(page => {
    const progress = game.chapters[page.chapter], choices = progress?.choices || {};
    const selected = choices[page.choice];
    const mode = selected === page.read || (selected === page.soften && choices[page.revisitChoice] === page.reread) ? 'read'
      : selected === page.soften ? 'soften' : selected === page.later ? 'later' : null;
    return { ...page, mode, marked: have.has(page.bookmark), depth: depthOf(page.id, index, game) };
  });
  const read = pages.filter(page => page.mode === 'read').length;
  return { pages: [...pages.filter(page => page.marked), ...pages.filter(page => !page.marked)],
    read, soften: pages.filter(page => page.mode === 'soften').length,
    later: pages.filter(page => page.mode === 'later').length,
    decided: pages.filter(page => page.mode).length, secret: pages.length - read };
}

export function validateConversation(step, index) {
  const errors = [], pages = step?.pages;
  if (step?.layout !== 'conversation' || !Array.isArray(pages) || !pages.length) return ['разговор без страниц'];
  if (new Set(pages.map(page => page?.id)).size !== pages.length || new Set(pages.map(page => page?.chapter)).size !== pages.length) errors.push('повтор страницы разговора');
  const chapters = index.chapters.filter(item => item.step === step.id);
  if (!chapters.some(item => item.id === step.intro) || !chapters.some(item => item.id === step.finale)) errors.push('разговор без введения или финала');
  for (const page of pages) {
    for (const key of ['id', 'title', 'chapter', 'bookmark', 'choice', 'read', 'soften', 'later', 'revisitChoice', 'reread']) if (typeof page?.[key] !== 'string' || !page[key].trim()) errors.push('страница разговора без ' + key);
    if (!chapters.some(item => item.id === page?.chapter)) errors.push('нет главы страницы ' + page?.id);
    if (!index.chapters.some(item => item.page === page?.id)) errors.push('нет страницы тетради ' + page?.id);
    if (new Set([page?.read, page?.soften, page?.later, page?.reread]).size !== 4) errors.push('повтор решения страницы ' + page?.id);
  }
  for (const key of ['secret', 'secretHint', 'suggested', 'depth', 'open', 'resume', 'again', 'pending', 'read', 'soften', 'later', 'decision', 'introHint', 'finaleHint']) if (typeof step.labels?.[key] !== 'string' || !step.labels[key].trim()) errors.push('разговор без подписи ' + key);
  return errors;
}

// Петли остаются видимыми после завершения: решение описывает отметку, а done —
// пройденную историю. Готовность не складывается в баллы или процент.
export function loopsState(step, index, game) {
  const have = picked(game);
  const loops = (step.loops || []).map(loop => {
    const progress = game?.chapters?.[loop.chapter], selected = progress?.choices?.[loop.choice];
    const mode = ['try', 'watch', 'hold'].find(mode => selected === loop[mode]) || null;
    return { ...loop, mode, done: progress?.done === true, started: !!progress && !progress.done && !!(progress.scene || progress.line || Object.keys(progress.choices || {}).length) };
  });
  const completed = loops.filter(loop => loop.done).length, arrived = have.has(step.intro);
  return { loops, completed, arrived, finaleAvailable: arrived && loops.length > 0 && completed === loops.length };
}

export function validateLoops(step, index) {
  const errors = [], loops = step?.loops, hasText = value => typeof value === 'string' && value.trim().length > 0;
  if (step?.layout !== 'loops' || !Array.isArray(loops) || loops.length !== 4) return ['петли: нужны четыре истории'];
  const chapters = (index?.chapters || []).filter(item => item.step === step.id), ids = new Set();
  const unique = (id, where) => {
    if (!hasText(id)) errors.push('петли: нет ' + where);
    else if (ids.has(id)) errors.push('петли: повтор id ' + id);
    else ids.add(id);
  };
  if (!hasText(step.intro) || !hasText(step.finale) || step.intro === step.finale || !chapters.some(item => item.id === step.intro) || !chapters.some(item => item.id === step.finale)) errors.push('петли: нет введения или финала');
  const chapterIds = new Set([step.intro, step.finale]);
  for (const loop of loops) {
    for (const key of ['id', 'title', 'chapter', 'notebookPage', 'choice', 'try', 'watch', 'hold']) if (!hasText(loop?.[key])) errors.push('петля без ' + key);
    for (const key of ['id', 'choice', 'try', 'watch', 'hold']) unique(loop?.[key], key);
    if (chapterIds.has(loop?.chapter)) errors.push('петли: повтор главы ' + loop?.chapter);
    chapterIds.add(loop?.chapter);
    if (!chapters.some(item => item.id === loop?.chapter)) errors.push('нет главы петли ' + loop?.id);
    if (!(index?.chapters || []).some(item => item.page === loop?.notebookPage)) errors.push('нет страницы тетради ' + loop?.notebookPage);
  }
  for (const key of ['intro', 'finale', 'locked', 'inProgress', 'completed', 'chooseLoop', 'progress', 'try', 'watch', 'hold', 'open', 'unavailable', 'resume', 'again']) if (!hasText(step.labels?.[key])) errors.push('петли без подписи ' + key);
  return errors;
}

// Own words: optional save subtree, no migration or spirituality score.
export function wordsOf(game, step) {
  const have=picked(game);
  return (step?.words || []).filter(w=>w.whenAny.some(id=>have.has(id)));
}
export function requestDraft(game, sceneId) {
  return game.ownWords?.drafts?.[sceneId] || {parts:[],silent:false,format:'',feeling:'',complete:false};
}
export function changeRequest(game, step, scene, sceneId, action, id) {
  const draft={...requestDraft(game,sceneId),parts:[...requestDraft(game,sceneId).parts],complete:false};
  const available=wordsOf(game,step).map(w=>w.id);
  draft.parts=draft.parts.filter(id=>available.includes(id)).slice(0,scene.maxParts);
  if(action==='add' && available.includes(id) && !draft.parts.includes(id) && draft.parts.length<scene.maxParts) {draft.parts.push(id);draft.silent=false;}
  else if(action==='remove') draft.parts=draft.parts.filter(p=>p!==id);
  else if(action==='clear') {draft.parts=[];draft.silent=false;}
  else if(action==='silent') {draft.parts=[];draft.silent=true;draft.format=step.silenceFormat;}
  else if(action==='up'||action==='down') {const i=draft.parts.indexOf(id),j=i+(action==='up'?-1:1);if(i>=0&&j>=0&&j<draft.parts.length)[draft.parts[i],draft.parts[j]]=[draft.parts[j],draft.parts[i]];}
  else if(action==='format' && step.formats.some(f=>f.id===id)) draft.format=id;
  else if(action==='feeling' && step.feelings.some(f=>f.id===id)) draft.feeling=id;
  game.ownWords ||= {drafts:{}};game.ownWords.drafts[sceneId]=draft;
  if(game.ownWords.final===sceneId)delete game.ownWords.final;
  return draft;
}
export function canLeaveRequest(game,step,scene,sceneId) {
  const d=requestDraft(game,sceneId),available=wordsOf(game,step).map(w=>w.id);
  return (d.silent || (d.parts.length>=scene.minParts && d.parts.length<=scene.maxParts && new Set(d.parts).size===d.parts.length && d.parts.every(id=>available.includes(id)))) && (!scene.final || (step.formats.some(f=>f.id===d.format) && (!d.silent || d.format===step.silenceFormat) && step.feelings.some(f=>f.id===d.feeling)));
}
export function leaveRequest(progress,chapter,game,step) {
  const scene=chapter.scenes[progress.scene],sid=progress.scene;
  if(scene.type!=='own-words'||!canLeaveRequest(game,step,scene,sid))return progress;
  game.ownWords.drafts[sid].complete=true;
  if(scene.final)game.ownWords.final=sid;
  enter(progress,chapter,resolveNext(scene.next,game));return progress;
}
export function requestText(game,step,sceneId=game.ownWords?.final) {
  const d=requestDraft(game,sceneId);
  return d.silent?step.labels.silent:d.parts.map(id=>step.words.find(w=>w.id===id)?.text || '').filter(Boolean).join(' · ');
}

// Окна восьмого шага: отметка готовности хранится обычным выбором главы, поэтому
// новое поле сохранения не нужно. Отметки равноправны и не складываются в баллы.
export const WINDOW_MODES = ['ready', 'notyet', 'unsure'];
export function windowsState(step, index, game) {
  const have = picked(game);
  const windows = (step?.windows || []).map(win => {
    const progress = game?.chapters?.[win.chapter], selected = progress?.choices?.[win.choice];
    const mode = WINDOW_MODES.find(mode => selected === win[mode]) || null;
    return { ...win, mode, done: progress?.done === true, started: !!progress && !progress.done && !!(progress.scene || progress.line || Object.keys(progress.choices || {}).length) };
  });
  const finale = (index?.chapters || []).find(item => item.id === step?.finale);
  const arrived = have.has(step?.intro);
  return { windows, completed: windows.filter(win => win.done).length, arrived, finaleAvailable: arrived && !!finale && !isLocked(finale, game) };
}

export function validateWindows(step, index) {
  const errors = [], windows = step?.windows, hasText = value => typeof value === 'string' && value.trim().length > 0;
  if (step?.layout !== 'windows' || !Array.isArray(windows) || windows.length < 2) return ['окна: нужно хотя бы два окна'];
  const chapters = (index?.chapters || []).filter(item => item.step === step.id), ids = new Set();
  if (!hasText(step.intro) || !hasText(step.finale) || step.intro === step.finale || !chapters.some(item => item.id === step.intro) || !chapters.some(item => item.id === step.finale)) errors.push('окна: нет введения или финала');
  for (const win of windows) {
    for (const key of ['id', 'title', 'chapter', 'choice', ...WINDOW_MODES]) if (!hasText(win?.[key])) errors.push('окно без ' + key);
    for (const key of ['id', 'chapter', 'choice', ...WINDOW_MODES]) {
      if (ids.has(win?.[key])) errors.push('окна: повтор id ' + win?.[key]);
      ids.add(win?.[key]);
    }
    if (!chapters.some(item => item.id === win?.chapter)) errors.push('нет главы окна ' + win?.id);
  }
  for (const key of ['intro', 'finale', 'chooseWindow', 'progress', 'locked', 'unavailable', 'dark', 'inProgress', 'open', 'resume', 'again', 'privacy', ...WINDOW_MODES]) if (!hasText(step.labels?.[key])) errors.push('окна без подписи ' + key);
  return errors;
}
