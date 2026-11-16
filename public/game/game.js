import {
  advance, answerLater, choose, deleteEntry, fill, freshGame, GAME_KEY, isLocked, itemsOf, leaveJournal, linesOf, loadGame, markDone, picked,
  progressOf, restartChapter, saveEntry, saveGame, setDraft, stage, validateChapter, validateVocab,
  levelOf, recordFight,
} from './engine.js';
import { canUse, playTurn, skillsOf, startBattle, validateFight } from './battle.js';

const root = document.querySelector('#game');
const h = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = async path => {
  const response = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!response.ok) throw new Error('Не удалось загрузить ' + path);
  return response.json();
};

let game = loadGame(), index = { chapters: [] }, vocab = { variants: [] }, chapters = new Map(), fights = new Map(), trials = new Map(), skills = [], items = [];
let battle = null;
let view = { name: 'menu' }, journalIndex = null, draftTimer, storageOk = true;

function persist() { storageOk = saveGame(game); }
function chapterOf(id) { return chapters.get(id); }
function questionOf(id) {
  for (const chapter of chapters.values()) {
    const question = chapter.questions.find(q => q.id === id);
    if (question) return { question, chapter };
  }
  return null;
}
const say = template => h(fill(template, vocab, game.variant));
const date = iso => { try { return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }); } catch { return ''; } };

function go(next) {
  flushDraft();
  view = next; journalIndex = null;
  render();
  window.scrollTo(0, 0);
  root.querySelector('h1, h2')?.focus({ preventScroll: true });
}

/* ---------- Экраны ---------- */

function episodeCard(item) {
  const chapter = chapterOf(item.id), saved = game.chapters[item.id], tag = 'Шаг ' + h(item.step);
  if (!chapter) return '<div class="g-card g-card-off"><span class="g-step">' + tag + '</span><strong>' + h(item.title) + '</strong><small>Глава не загрузилась. Проверьте файл ' + h(item.file) + '.</small></div>';
  if (isLocked(item, game)) return '<div class="g-card g-card-off"><span class="g-step">' + tag + ' · закрыто</span><strong>' + h(item.title) + '</strong><small>' + h(lockedText(item)) + '</small></div>';
  const started = saved && (saved.scene !== chapter.start || saved.line > 0) && chapter.scenes[saved.scene]?.type !== 'ending';
  return '<article class="g-card' + (item.final ? ' g-card-final' : '') + '"><span class="g-step">' + h(item.minutes) + (saved?.done ? ' · пройдено' : '') + '</span><strong>' + h(item.title) + '</strong><small>' + h(item.teaser) + '</small>' +
    '<div class="g-row"><button class="g-btn ' + (saved?.done && !started ? 'g-secondary' : 'g-primary') + '" data-act="' + (!started && saved?.done ? 'restart' : 'play') + '" data-id="' + h(item.id) + '">' + (started ? 'Продолжить' : saved?.done ? 'Пройти ещё раз' : 'Начать') + '</button>' +
    (started ? '<button class="g-btn g-quiet" data-act="restart" data-id="' + h(item.id) + '">Сначала</button>' : '') + '</div></article>';
}

function trialCard(item) {
  const trial = trials.get(item.id), done = game.chapters[item.id]?.done;
  if (!trial) return '<div class="g-card g-card-off"><span class="g-step">Испытание</span><strong>' + h(item.title) + '</strong><small>Испытание не загрузилось. Проверьте файл ' + h(item.file) + '.</small></div>';
  if (isLocked(item, game)) return '<div class="g-card g-card-off"><span class="g-step">Испытание · закрыто</span><strong>' + h(item.title) + '</strong><small>' + h(lockedText(item)) + '</small></div>';
  return '<article class="g-card g-card-final"><span class="g-step">Испытание · ' + h(item.minutes) + (done ? ' · пройдено' : '') + '</span><strong>' + h(item.title) + '</strong><small>' + h(item.teaser) + '</small>' +
    '<div class="g-row"><button class="g-btn ' + (done ? 'g-secondary' : 'g-primary') + '" data-act="trial" data-id="' + h(item.id) + '">' + (done ? 'Пройти ещё раз' : 'Начать') + '</button></div></article>';
}

// Плитка места на карте второго шага.
function placeTile(item) {
  const chapter = chapterOf(item.id), saved = game.chapters[item.id], support = items.find(i => i.when === item.id);
  if (!chapter) return '<div class="g-tile is-off"><strong>' + h(item.title) + '</strong><small>Не загрузилось</small></div>';
  const started = saved && (saved.scene !== chapter.start || saved.line > 0) && chapter.scenes[saved.scene]?.type !== 'ending';
  return '<button class="g-tile' + (saved?.done ? ' is-done' : '') + '" data-act="' + (!started && saved?.done ? 'restart' : 'play') + '" data-id="' + h(item.id) + '"><span class="g-tile-mark" aria-hidden="true">' + (saved?.done ? '✦' : '○') + '</span><strong>' + h(item.title) + '</strong>' +
    '<small>' + h(saved?.done && support ? 'Опора: ' + support.name : started ? 'Продолжить' : item.teaser) + '</small></button>';
}

function stepSection(step) {
  const list = index.chapters.filter(item => item.step === step.id), done = list.filter(item => picked(game).has(item.id)).length;
  const head = '<div class="g-section-head"><div><span class="g-step">' + h(step.title) + '</span><h2>' + h(step.name) + '</h2></div><span class="g-count">' + done + ' / ' + list.length + '</span></div>';
  if (step.after && !picked(game).has(step.after)) {
    return '<section class="g-section is-locked">' + head + '<div class="g-card g-card-off"><strong>Закрыто</strong><small>Откроется, когда первый шаг будет пройден целиком — вместе с боссом и последним испытанием.</small></div></section>';
  }
  // Пройденный шаг сворачивается, когда открыт следующий, чтобы не листать его каждый раз.
  const folded = done === list.length && (index.steps || []).some(next => next.id > step.id && next.after && picked(game).has(next.after));
  const fresh = step.after && !done ? '<p class="g-unlocked">Открыт новый шаг</p>' : '';
  if (step.layout !== 'map') return '<section class="g-section">' + head + (folded ? '<details class="g-fold"><summary>Шаг пройден. Показать эпизоды и бои</summary>' : '<p class="g-lead g-section-lead">' + h(step.lead || '') + '</p>') + '<div class="g-list">' + list.map(item => item.type === 'fight' ? fightCard(item) : item.type === 'trial' ? trialCard(item) : episodeCard(item)).join('') + '</div>' + (folded ? '</details>' : '') + '</section>';
  const supports = itemsOf(items, game).filter(i => i.kind === 'support' && i.step === step.id), places = list.filter(item => !item.final), finals = list.filter(item => item.final);
  return '<section class="g-section g-section-map">' + head + fresh + '<p class="g-lead g-section-lead">' + h(step.lead || '') + '</p>' +
    '<div class="g-supports" role="img" aria-label="Опор найдено: ' + supports.filter(i => i.found).length + ' из ' + supports.length + '">' + supports.map(i => '<i' + (i.found ? ' class="is-on"' : '') + '></i>').join('') + '<span>Опоры: ' + supports.filter(i => i.found).length + ' из ' + supports.length + '</span></div>' +
    '<div class="g-map">' + places.map(placeTile).join('') + '</div><div class="g-list">' + finals.map(item => {
      if (!isLocked(item, game)) return episodeCard(item);
      const have = item.needs ? item.needs.of.filter(id => picked(game).has(id)).length : 0;
      return '<div class="g-card g-card-off"><span class="g-step">Закрыто</span><strong>' + h(item.title) + '</strong><small>' + (item.needs ? 'Нужно опор: ' + item.needs.count + '. Найдено: ' + have + '.' : h(lockedText(item))) + '</small></div>';
    }).join('') + '</div></section>';
}

function menu() {
  const later = Object.values(game.journal).filter(e => e.later && !e.text).length;
  const saved = Object.values(game.journal).filter(e => e.text).length;
  const variant = vocab.variants.find(v => v.id === game.variant), found = itemsOf(items, game).filter(i => i.found).length;
  const steps = index.steps || [{ id: 1, title: 'Шаг первый', name: '', layout: 'path' }];
  return '<header class="g-top"><a class="g-back" href="../">← Свой путь</a></header>' +
    '<main class="g-main g-menu"><div class="g-eyebrow">Сюжетная игра · 12 шагов</div><h1 tabindex="-1">Истории<br>одного двора</h1>' +
    '<p class="g-lead">Сцены, где решаешь ты. У каждого шага свои правила. В конце сцены — страница личного дневника, которую можно оставить пустой.</p>' +
    levelBar() + '<div class="g-row g-wrap g-tools"><button class="g-btn g-secondary" data-act="bag">Рюкзак · ' + found + ' из ' + items.length + '</button>' +
    '<button class="g-btn g-secondary" data-act="diary">Дневник' + (saved || later ? ' · ' + [saved ? saved + ' зап.' : '', later ? later + ' отл.' : ''].filter(Boolean).join(', ') : '') + '</button></div>' +
    steps.map(stepSection).join('') +
    '<div class="g-card g-card-off g-next-step"><span class="g-step">Дальше</span><strong>Шаг третий</strong><small>В работе.</small></div>' +
    '<div class="g-row g-wrap"><button class="g-btn g-quiet" data-act="variant">Герой: ' + h(variant ? variant.label : 'выбрать') + '</button></div>' +
    (storageOk ? '' : '<p class="g-warn" role="alert">Браузер не разрешает сохранять данные. Прогресс и записи пропадут после закрытия вкладки.</p>') +
    '<p class="g-note">Игра — способ подумать, а не лечение. Если сейчас тяжело, свяжитесь с человеком, которому доверяете, с группой или со специалистом. <a href="../#home">Раздел поддержки — в приложении.</a></p></main>';
}

function bagScreen() {
  const all = itemsOf(items, game), steps = index.steps || [];
  return '<header class="g-top"><button class="g-back" data-act="menu">← Главы</button><span class="g-scene">Рюкзак</span></header>' +
    '<main class="g-main g-bag"><h1 tabindex="-1">Рюкзак</h1><p class="g-lead">То, что герой унёс из сцен. Часть находок зависит от твоих решений — все за одно прохождение не собрать.</p>' +
    steps.map(step => { const list = all.filter(i => i.step === step.id); return list.length ? '<h2>' + h(step.title) + '</h2><div class="g-finds">' + list.map(i => i.found
      ? '<div class="g-find' + (i.kind === 'support' ? ' is-support' : '') + '"><strong>' + h(i.name) + '</strong><small>' + h(i.text) + '</small></div>'
      : '<div class="g-find is-unknown"><strong>???</strong><small>Ещё не найдено</small></div>').join('') + '</div>' : ''; }).join('') + '</main>';
}

function trialScreen() {
  const trial = trials.get(view.id), top = '<header class="g-top"><button class="g-back" data-act="menu">← Главы</button><span class="g-scene">Испытание</span></header>';
  if (view.card == null) return top + '<main class="g-main g-ending"><div class="g-trap" aria-hidden="true"><i></i><i></i></div><h2 tabindex="-1">' + h(trial.title) + '</h2>' + trial.intro.map(t => '<p>' + h(t) + '</p>').join('') + '</main>' +
    '<footer class="g-foot"><button class="g-btn g-primary" data-act="trial-next">Начать</button></footer>';
  if (view.card >= trial.cards.length) return top + '<main class="g-main g-ending"><div class="g-trap is-open" aria-hidden="true"><i></i><i></i></div><h2 tabindex="-1">Капкан разжат</h2>' + trial.outro.map(t => '<p>' + h(t) + '</p>').join('') + '</main>' +
    '<footer class="g-foot"><button class="g-btn g-primary" data-act="menu">Дальше</button></footer>';
  const card = trial.cards[view.card], answered = view.answer != null, right = answered && view.answer === card.trap;
  return top + '<main class="g-main g-trial"><span class="g-step">Фраза ' + (view.card + 1) + ' из ' + trial.cards.length + '</span>' +
    '<blockquote class="g-phrase" tabindex="-1">«' + h(card.text) + '»</blockquote>' +
    (answered ? '<div class="g-why" role="status"><strong>' + (card.trap ? h(trial.trapLabel) : h(trial.truthLabel)) + (right ? '. Ты это услышал.' : '. Легко перепутать.') + '</strong><p>' + h(card.why) + '</p></div>' : '') + '</main>' +
    '<footer class="g-foot' + (answered ? '' : ' g-foot-two') + '">' + (answered ? '<button class="g-btn g-primary" data-act="trial-next">Дальше</button>'
      : '<button class="g-btn g-choice g-trap-btn" data-act="trial-answer" data-id="trap">' + h(trial.trapLabel) + '</button><button class="g-btn g-choice g-truth-btn" data-act="trial-answer" data-id="truth">' + h(trial.truthLabel) + '</button>') + '</footer>';
}

const lockedText = item => { const prev = index.chapters.find(c => c.id === item.after); return 'Откроется после: ' + (prev?.title || ''); };

function levelBar() {
  const all = index.chapters.filter(item => item.type === 'fight'), level = levelOf(game), max = all.length + 1;
  const last = all.filter(item => game.fights[item.id]?.won).map(item => fights.get(item.id)?.reward?.title).filter(Boolean).at(-1);
  return '<div class="g-level" role="img" aria-label="Уровень ' + level + ' из ' + max + '"><div class="g-level-top"><strong>Уровень ' + level + '</strong><span>' + h(last || 'В круге') + '</span></div>' +
    '<div class="g-pips">' + Array.from({ length: max }, (_, i) => '<i' + (i < level ? ' class="is-on"' : '') + '></i>').join('') + '</div></div>';
}

function fightCard(item) {
  const fight = fights.get(item.id), won = game.fights[item.id]?.won;
  if (!fight) return '<div class="g-card g-card-off"><span class="g-step">Бой</span><strong>' + h(item.title) + '</strong><small>Бой не загрузился. Проверьте файл ' + h(item.file) + '.</small></div>';
  if (isLocked(item, game)) return '<div class="g-card g-card-off"><span class="g-step">Бой · закрыто</span><strong>' + h(item.title) + '</strong><small>' + h(lockedText(item)) + '</small></div>';
  return '<article class="g-card g-card-fight"><img class="g-foe-thumb" src="' + h(fight.art) + '" alt="" width="64" height="64"><span class="g-step">' + h(fight.tier) + (won ? ' · побеждено' : '') + '</span><strong>' + h(item.title) + '</strong><small>' + h(item.teaser) + '</small>' +
    '<div class="g-row"><button class="g-btn ' + (won ? 'g-secondary' : 'g-primary g-fight-btn') + '" data-act="fight" data-id="' + h(item.id) + '">' + (won ? 'Сразиться ещё раз' : 'В бой') + '</button></div></article>';
}

const bar = (label, value, max, cls) => '<div class="g-bar ' + cls + '"><span>' + label + '</span><b>' + value + ' / ' + max + '</b><div><i style="width:' + Math.round(100 * value / max) + '%"></i></div></div>';

function fightScreen() {
  const fight = fights.get(view.id), top = '<header class="g-top"><button class="g-back" data-act="menu">← Главы</button><span class="g-scene">' + h(fight.tier) + '</span></header>';
  if (!battle) {
    return top + '<main class="g-main g-fight-intro"><div class="g-foe"><img src="' + h(fight.art) + '" alt="" width="240" height="240"></div><span class="g-step">' + h(fight.tier) + '</span><h2 tabindex="-1">' + h(fight.name) + '</h2>' +
      fight.intro.map(t => '<p>' + h(t) + '</p>').join('') + '<p class="g-note">Твои приёмы: ' + skillsOf(fight, skills).map(s => h(s.name)).join(' · ') + '</p></main>' +
      '<footer class="g-foot"><button class="g-btn g-primary g-fight-btn" data-act="fight-start">Начать бой</button></footer>';
  }
  if (battle.over) {
    const won = battle.over === 'win', reward = fight.reward;
    return top + '<main class="g-main g-ending"><div class="g-foe' + (won ? ' is-down' : '') + '"><img src="' + h(fight.art) + '" alt="" width="240" height="240"></div><h2 tabindex="-1">' + (won ? 'Тяга отступила' : 'Срыв') + '</h2>' +
      (won ? fight.win : fight.lose).map(t => '<p>' + h(t) + '</p>').join('') +
      (won && view.levelUp && reward ? '<p class="g-levelup">Уровень ' + h(reward.level) + ' · ' + h(reward.title) + '</p>' : '') + '</main>' +
      '<footer class="g-foot">' + (won ? '<button class="g-btn g-primary" data-act="menu">Дальше</button>' : '<button class="g-btn g-primary g-fight-btn" data-act="fight-start">Попробовать иначе</button><button class="g-btn g-quiet" data-act="menu">К главам</button>') + '</footer>';
  }
  const hitFoe = battle.log.some(l => l.hit === 'foe'), hitYou = battle.log.some(l => l.hit === 'you');
  return top + '<main class="g-main g-battle">' + bar(h(fight.name), battle.foe, battle.foeMax, 'g-bar-foe') +
    '<div class="g-foe g-foe-small' + (hitFoe ? ' is-hit' : '') + (fight.armor && !battle.open ? ' is-armored' : '') + '"><img src="' + h(fight.art) + '" alt="" width="240" height="240"></div>' +
    '<div class="g-battle-log' + (hitYou ? ' is-hit' : '') + '" aria-live="polite">' + (battle.log.length ? battle.log.map(l => '<p class="g-log-' + l.who + '">' + (l.who === 'you' ? '<b>Ты:</b> ' : l.who === 'foe' ? '<b>' + h(fight.name) + ':</b> ' : '') + h(l.text) + '</p>').join('') : '<p class="g-log-note">Твой ход. Выбери приём.</p>') + '</div>' +
    bar('Твоя стойкость', battle.hp, battle.maxHp, 'g-bar-you') + '</main>' +
    '<footer class="g-foot g-skills">' + skillsOf(fight, skills).map(s => { const wait = battle.cooldowns[s.id] > 0; return '<button class="g-skill" data-act="skill" data-id="' + h(s.id) + '"' + (canUse(battle, s) ? '' : ' disabled') + '><strong>' + h(s.name) + '</strong><small>' + (wait ? (battle.cooldowns[s.id] > 9 ? 'Уже сказано' : 'Через ' + battle.cooldowns[s.id] + ' ход' + (battle.cooldowns[s.id] > 1 ? 'а' : '')) : h(s.hint)) + '</small></button>'; }).join('') + '</footer>';
}

function variantScreen() {
  const current = Math.max(0, vocab.variants.findIndex(v => v.id === game.variant));
  return '<header class="g-top"><button class="g-back" data-act="menu">← Главы</button><span class="g-scene">Выбор героя</span></header>' +
    '<main class="g-main g-heroes"><h1 tabindex="-1">Выбери героя</h1>' +
    '<div class="g-carousel" data-start="' + current + '">' + vocab.variants.map((v, i) => '<article class="g-hero' + (v.locked ? ' is-locked' : '') + '" data-id="' + h(v.id) + '" aria-label="' + h(v.label) + (v.locked ? ', закрыт' : '') + '">' +
      '<div class="g-portrait">' + (v.art ? '<img src="' + h(v.art) + '" alt="" width="240" height="360"' + (Math.abs(i - current) > 1 ? ' loading="lazy"' : '') + '>' : '') + (v.locked ? '<span class="g-lock">Закрыт</span>' : '') + '</div>' +
      '<span class="g-step">' + h(v.epithet || '') + '</span><h2>' + h(v.label) + '</h2>' + (v.quote ? '<p class="g-quote">«' + h(v.quote) + '»</p>' : '') + '<p class="g-lore">' + h(v.lore || '') + '</p></article>').join('') + '</div>' +
    '<div class="g-dots" aria-hidden="true">' + vocab.variants.map((v, i) => '<i' + (i === current ? ' class="is-on"' : '') + '></i>').join('') + '</div></main>' +
    '<footer class="g-foot g-foot-hero"><button class="g-btn g-arrow" data-act="hero-prev" aria-label="Предыдущий герой">‹</button>' +
    '<button class="g-btn g-primary" data-act="set-variant" data-id="' + h(vocab.variants[current].id) + '" id="g-pick"' + (vocab.variants[current].locked ? ' disabled' : '') + '>' + h(pickLabel(vocab.variants[current])) + '</button>' +
    '<button class="g-btn g-arrow" data-act="hero-next" aria-label="Следующий герой">›</button></footer>';
}

// Карусель героев: следим, какая карточка в центре, и обновляем кнопку и точки.
const pickLabel = variant => variant.locked ? 'Герой пока закрыт' : 'Играть: ' + variant.label;
function heroIndex(carousel) { return Math.round(carousel.scrollLeft / carousel.clientWidth); }
function syncHero(carousel) {
  const i = Math.min(vocab.variants.length - 1, Math.max(0, heroIndex(carousel))), variant = vocab.variants[i], pick = root.querySelector('#g-pick');
  if (!pick || pick.dataset.id === variant.id) return;
  pick.dataset.id = variant.id; pick.textContent = pickLabel(variant); pick.disabled = !!variant.locked;
  root.querySelectorAll('.g-dots i').forEach((dot, n) => dot.classList.toggle('is-on', n === i));
}
function slideHero(step) {
  const carousel = root.querySelector('.g-carousel'), n = vocab.variants.length;
  const i = (heroIndex(carousel) + step + n) % n;
  carousel.scrollTo({ left: i * carousel.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function lineHtml(chapter, line, fresh) {
  const speaker = chapter.speakers[line.speaker] || { role: 'narrator', name: '' };
  const cls = 'g-line g-' + speaker.role + (fresh ? ' is-new' : '');
  return '<div class="' + cls + '">' + (speaker.name ? '<span class="g-name">' + h(speaker.name) + '</span>' : '') + '<p>' + say(line.text) + '</p></div>';
}

function play() {
  const chapter = chapterOf(view.id), progress = progressOf(game, chapter), scene = chapter.scenes[progress.scene], now = stage(progress, chapter, game);
  const top = '<header class="g-top"><button class="g-back" data-act="menu">← Главы</button><span class="g-scene">' + h(chapter.title) + ' · ' + h(scene.title || '') + '</span></header>';
  if (now === 'journal') return top + journal(chapter, scene);
  if (now === 'ending') {
    return top + '<main class="g-main g-ending"><div class="g-door" aria-hidden="true"><i></i></div><h2 tabindex="-1">' + h(scene.title) + '</h2>' +
      linesOf(scene, game).map(line => '<p>' + say(line.text) + '</p>').join('') + '<p class="g-note">' + h(chapter.disclaimer || '') + '</p></main>' +
      '<footer class="g-foot"><button class="g-btn g-primary" data-act="menu">К главам</button><button class="g-btn g-secondary" data-act="diary">Открыть дневник</button><button class="g-btn g-quiet" data-act="restart" data-id="' + h(chapter.id) + '">Пройти иначе</button></footer>';
  }
  const shown = linesOf(scene, game).slice(0, progress.line + 1);
  const log = '<main class="g-main g-log" data-act="' + (now === 'choice' ? '' : 'next') + '" aria-live="polite">' + shown.map((line, i) => lineHtml(chapter, line, i === shown.length - 1)).join('') + '</main>';
  const foot = now === 'choice'
    ? '<footer class="g-foot"><p class="g-prompt">' + h(scene.choice.prompt || 'Что дальше?') + '</p>' + scene.choice.options.map(o => '<button class="g-btn g-choice" data-act="choose" data-id="' + h(o.id) + '">' + say(o.label) + '</button>').join('') + '</footer>'
    : '<footer class="g-foot"><button class="g-btn g-primary g-next" data-act="next">Дальше</button></footer>';
  return top + log + foot;
}

function pickQuestion(scene) {
  if (journalIndex == null) {
    const withDraft = scene.questionIds.findIndex(id => { const e = game.journal[id]; return e && e.draft && e.draft !== e.text; });
    journalIndex = Math.max(0, withDraft);
  }
  return scene.questionIds[journalIndex % scene.questionIds.length];
}

function journal(chapter, scene) {
  const id = pickQuestion(scene), question = chapter.questions.find(q => q.id === id), entry = game.journal[id];
  return '<main class="g-main g-journal"><h2 tabindex="-1">Страница дневника</h2><p class="g-lead">' + h(scene.intro || '') + '</p>' +
    '<label class="g-question" for="g-answer">' + say(question.text) + '</label>' +
    '<textarea id="g-answer" data-question="' + h(id) + '" data-chapter="' + h(chapter.id) + '" rows="6" maxlength="20000" placeholder="Можно одно слово. Можно ничего.">' + h(entry?.draft || '') + '</textarea>' +
    '<div class="g-row g-between"><span class="g-status" id="g-status" role="status">' + (entry?.draft ? 'Черновик сохранён' : '') + '</span>' +
    (scene.questionIds.length > 1 ? '<button class="g-link" data-act="other-question">Другой вопрос</button>' : '') + '</div></main>' +
    '<footer class="g-foot"><button class="g-btn g-primary" data-act="journal-save">Сохранить в дневник</button><button class="g-btn g-secondary" data-act="journal-later">Ответить позже</button></footer>';
}

function diary() {
  const items = Object.entries(game.journal).map(([id, entry]) => ({ id, entry, found: questionOf(id) })).filter(item => item.found);
  const saved = items.filter(i => i.entry.text).sort((a, b) => String(b.entry.savedAt).localeCompare(String(a.entry.savedAt)));
  const later = items.filter(i => !i.entry.text && (i.entry.later || i.entry.draft));
  const editor = (item, label) => '<textarea data-question="' + h(item.id) + '" rows="4" maxlength="20000" aria-label="' + h(item.found.question.text) + '">' + h(item.entry.draft || '') + '</textarea>' +
    '<div class="g-row g-wrap"><button class="g-btn g-secondary g-small" data-act="diary-save" data-id="' + h(item.id) + '">' + label + '</button><button class="g-link" data-act="diary-delete" data-id="' + h(item.id) + '">Удалить</button></div>';
  return '<header class="g-top"><button class="g-back" data-act="menu">← Главы</button><span class="g-scene">Дневник</span></header>' +
    '<main class="g-main g-diary"><h1 tabindex="-1">Дневник</h1><p class="g-lead">Записи хранятся только в этом браузере и никуда не отправляются.</p>' +
    (later.length ? '<h2>Ответить позже</h2>' + later.map(item => '<article class="g-entry"><span class="g-step">' + h(item.found.chapter.title) + '</span><strong>' + say(item.found.question.text) + '</strong>' + editor(item, 'Сохранить') + '</article>').join('') : '') +
    (saved.length ? '<h2>Записи</h2>' + saved.map(item => '<article class="g-entry"><span class="g-step">' + h(item.found.chapter.title) + (item.entry.savedAt ? ' · ' + h(date(item.entry.savedAt)) : '') + '</span><strong>' + say(item.found.question.text) + '</strong>' +
      (view.edit === item.id ? editor(item, 'Сохранить изменения') : '<p class="g-text">' + h(item.entry.text) + '</p><div class="g-row g-wrap"><button class="g-link" data-act="diary-edit" data-id="' + h(item.id) + '">Изменить</button><button class="g-link" data-act="diary-delete" data-id="' + h(item.id) + '">Удалить</button></div>') + '</article>').join('') : '') +
    (!later.length && !saved.length ? '<p class="g-empty">Пока пусто. Страница дневника появляется в конце каждой главы.</p>' : '') +
    '<p class="g-note">Записи игры лежат в браузере открытым текстом: PIN основного приложения их не шифрует. Очистка данных браузера удалит их.</p>' +
    (items.length || Object.keys(game.chapters).length ? '<button class="g-link g-danger" data-act="wipe">Удалить все записи и прогресс игры</button>' : '') + '</main>';
}

function render() {
  root.innerHTML = view.name === 'fight' ? fightScreen() : view.name === 'trial' ? trialScreen() : view.name === 'bag' ? bagScreen() : view.name === 'play' ? play() : view.name === 'diary' ? diary() : view.name === 'variant' ? variantScreen() : menu();
  root.dataset.view = view.name;
  const carousel = root.querySelector('.g-carousel');
  if (carousel) {
    carousel.scrollLeft = Number(carousel.dataset.start) * carousel.clientWidth;
    carousel.addEventListener('scroll', () => syncHero(carousel), { passive: true });
  }
  const log = root.querySelector('.g-log');
  if (log) requestAnimationFrame(() => log.lastElementChild?.scrollIntoView({ block: 'end', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
}

/* ---------- Действия ---------- */

function flushDraft() {
  clearTimeout(draftTimer);
  for (const area of root.querySelectorAll('textarea[data-question]')) setDraft(game, area.dataset.question, area.value, area.dataset.chapter);
  persist();
}

function startChapter(id) {
  if (!game.variant) return go({ name: 'variant', then: id });
  go({ name: 'play', id });
}

const actions = {
  menu: () => { battle = null; go({ name: 'menu' }); },
  bag: () => go({ name: 'bag' }),
  trial: id => go({ name: 'trial', id, card: null, answer: null }),
  'trial-answer': id => { view.answer = id === 'trap'; render(); },
  'trial-next': () => {
    const trial = trials.get(view.id);
    view.card = view.card == null ? 0 : view.card + 1; view.answer = null;
    if (view.card >= trial.cards.length) { markDone(game, trial.id); persist(); }
    render(); window.scrollTo(0, 0);
  },
  fight: id => { battle = null; go({ name: 'fight', id }); },
  'fight-start': () => { battle = startBattle(fights.get(view.id)); view.levelUp = false; render(); window.scrollTo(0, 0); },
  skill: id => {
    const fight = fights.get(view.id), skill = skills.find(s => s.id === id);
    if (!battle || !skill || !canUse(battle, skill)) return;
    battle = playTurn(battle, fight, skill);
    if (battle.over) { view.levelUp = battle.over === 'win' && !game.fights[fight.id]?.won; recordFight(game, fight.id, battle.over === 'win'); persist(); }
    render();
    if (battle.over) window.scrollTo(0, 0);
  },
  diary: () => go({ name: 'diary' }),
  variant: () => go({ name: 'variant' }),
  'set-variant': id => { if (vocab.variants.find(v => v.id === id)?.locked) return; game.variant = id; persist(); view.then ? go({ name: 'play', id: view.then }) : go({ name: 'menu' }); },
  'hero-prev': () => slideHero(-1),
  'hero-next': () => slideHero(1),
  play: id => startChapter(id),
  restart: id => { restartChapter(game, chapterOf(id)); persist(); startChapter(id); },
  next: () => { const chapter = chapterOf(view.id); advance(progressOf(game, chapter), chapter, game); persist(); render(); },
  choose: id => { const chapter = chapterOf(view.id); choose(progressOf(game, chapter), chapter, id, game); persist(); render(); window.scrollTo(0, 0); },
  'other-question': () => { flushDraft(); journalIndex += 1; render(); root.querySelector('#g-answer')?.focus(); },
  'journal-save': () => {
    const area = root.querySelector('#g-answer'), chapter = chapterOf(view.id);
    setDraft(game, area.dataset.question, area.value, chapter.id);
    if (!saveEntry(game, area.dataset.question, chapter.id)) {
      root.querySelector('#g-status').textContent = 'Здесь пока пусто. Напишите пару слов или нажмите «Ответить позже».';
      return area.focus();
    }
    leaveJournal(progressOf(game, chapter), chapter, game); persist(); journalIndex = null; render(); window.scrollTo(0, 0);
  },
  'journal-later': () => {
    const area = root.querySelector('#g-answer'), chapter = chapterOf(view.id);
    setDraft(game, area.dataset.question, area.value, chapter.id);
    answerLater(game, area.dataset.question, chapter.id);
    leaveJournal(progressOf(game, chapter), chapter, game); persist(); journalIndex = null; render(); window.scrollTo(0, 0);
  },
  'diary-edit': id => { flushDraft(); view.edit = id; render(); root.querySelector('textarea[data-question="' + CSS.escape(id) + '"]')?.focus(); },
  'diary-save': id => {
    flushDraft();
    if (saveEntry(game, id)) { view.edit = null; persist(); render(); }
    else root.querySelector('textarea[data-question="' + CSS.escape(id) + '"]')?.focus();
  },
  'diary-delete': id => { if (confirm('Удалить эту запись? Вернуть её не получится.')) { deleteEntry(game, id); persist(); render(); } },
  wipe: () => {
    if (!confirm('Удалить все записи дневника и прогресс игры в этом браузере?')) return;
    try { localStorage.removeItem(GAME_KEY); } catch { /* хранилище недоступно */ }
    game = freshGame(); go({ name: 'menu' });
  },
};

root.addEventListener('click', event => {
  const target = event.target.closest('[data-act]');
  if (!target || !root.contains(target) || !target.dataset.act) return;
  if (target.matches('.g-log') && getSelection()?.toString()) return;
  actions[target.dataset.act]?.(target.dataset.id);
});
root.addEventListener('input', event => {
  const area = event.target.closest('textarea[data-question]');
  if (!area) return;
  const status = root.querySelector('#g-status');
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    setDraft(game, area.dataset.question, area.value, area.dataset.chapter); persist();
    if (status) status.textContent = storageOk ? 'Черновик сохранён' : 'Браузер не разрешил сохранить черновик';
  }, 250);
});
addEventListener('pagehide', flushDraft);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushDraft(); });

async function boot() {
  try {
    [index, vocab, { skills }, { items }] = await Promise.all([json('./data/episodes.json'), json('./data/vocab.json'), json('./data/skills.json'), json('./data/items.json')]);
    const problems = validateVocab(vocab);
    await Promise.all(index.chapters.map(async item => {
      try {
        if (item.type === 'trial') {
          const trial = await json('./data/' + item.file);
          if (trial.id !== item.id || !trial.cards?.length) problems.push(item.id + ': испытание без карточек или с чужим id'); else trials.set(item.id, trial);
          return;
        }
        if (item.type === 'fight') {
          const fight = await json('./data/' + item.file), errors = validateFight(fight, skills);
          if (fight.id !== item.id) errors.push('id в файле не совпадает с episodes.json');
          if (errors.length) problems.push(...errors.map(e => item.id + ': ' + e)); else fights.set(item.id, fight);
          return;
        }
        const chapter = await json('./data/' + item.file), errors = validateChapter(chapter, vocab);
        if (chapter.id !== item.id) errors.push('id в файле не совпадает с episodes.json');
        if (errors.length) problems.push(...errors.map(e => item.id + ': ' + e)); else chapters.set(item.id, chapter);
      } catch (error) { problems.push(item.id + ': ' + error.message); }
    }));
    if (problems.length) console.warn('Ошибки в данных игры:\n' + problems.join('\n'));
    if (game.variant && !vocab.variants.some(v => v.id === game.variant && !v.locked)) game.variant = null;
    // После перезагрузки возвращаем игрока в незавершённую главу.
    const open = index.chapters.find(item => {
      const chapter = chapterOf(item.id), saved = game.chapters[item.id];
      return chapter && !isLocked(item, game) && saved && chapter.scenes[saved.scene] && chapter.scenes[saved.scene].type !== 'ending' && (saved.scene !== chapter.start || saved.line > 0);
    });
    view = open && game.variant ? { name: 'play', id: open.id } : { name: 'menu' };
    render();
  } catch (error) {
    root.innerHTML = '<main class="g-main"><h1>Игра не открылась</h1><p class="g-lead">' + h(error.message) + '. Откройте игру через локальный сервер, как описано в README.</p></main>';
  }
}
boot();
