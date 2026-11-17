import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import {
  advance, answerLater, choose, fill, freshGame, isLocked, leaveJournal, linesOf, normalizeGame, progressOf,
  saveEntry, setDraft, stage, validateChapter, validateVocab,
  itemsOf, levelOf, markDone, recordFight, assignSteering, leaveSteering, restartChapter,
  depthOf, scaledSkills,
} from '../public/game/engine.js';
import { canUse, playTurn, restoreBattle, skillsOf, startBattle, validateFight } from '../public/game/battle.js';

const data = new URL('../public/game/data/', import.meta.url);
const load = async file => JSON.parse(await readFile(new URL(file, data), 'utf8'));
const index = await load('episodes.json'), vocab = await load('vocab.json');
const episodes = index.chapters.filter(item => !item.type), bouts = index.chapters.filter(item => item.type === 'fight');
const chapters = await Promise.all(episodes.map(item => load(item.file)));
const fights = await Promise.all(bouts.map(item => load(item.file)));
const { skills } = await load('skills.json');
const { items } = await load('items.json');
const trialItems = index.chapters.filter(item => item.type === 'trial');
const trials = await Promise.all(trialItems.map(item => load(item.file)));

test('словарь и все главы игры проходят проверку', () => {
  assert.deepEqual(validateVocab(vocab), []);
  assert.equal(new Set(index.chapters.map(c => c.id)).size, index.chapters.length);
  chapters.forEach((chapter, i) => {
    assert.equal(chapter.id, episodes[i].id);
    assert.deepEqual(validateChapter(chapter, vocab), []);
  });
});

test('у каждого героя есть название, описание и картинка', async () => {
  assert.deepEqual(vocab.variants.filter(v => !v.locked).map(v => v.id), ['drugs']);
  for (const variant of vocab.variants) {
    for (const key of ['label', 'epithet', 'quote', 'lore', 'art']) assert.ok(variant[key], variant.id + ': нет ' + key);
    await access(new URL('../' + variant.art, data));
  }
});

test('портреты из данных существуют, укладываются в лимит и доступны офлайн', async () => {
  const sw = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/game/game.css', import.meta.url), 'utf8');
  const textures = [...css.matchAll(/url\(['"]?\.\/(art\/[\w.-]+)/g)].map(match => match[1]);
  const backgrounds = chapters.flatMap(chapter => [chapter.background, ...Object.values(chapter.scenes).map(scene => scene.background)]).filter(Boolean);
  const mapArt = (index.steps || []).map(step => step.map?.art).filter(Boolean);
  const assetPaths = new Set([...vocab.variants, ...fights].map(item => item.art).concat(textures, skills.map(item => item.icon), items.map(item => item.icon), backgrounds, mapArt));
  for (const art of assetPaths) {
    assert.match(art, /^art\/(?:icons\/)?[\w-]+\.(svg|webp)$/);
    const info = await stat(new URL('../' + art, data));
    assert.ok(info.isFile(), art + ': должен быть файлом');
    assert.ok(info.size > 0 && info.size < 150_000, art + ': лимит 150 КБ');
    assert.ok(sw.includes("'./game/" + art + "'"), art + ': отсутствует в офлайн-кэше');
  }
  async function directoryBytes(directory) {
    let bytes = 0;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
      bytes += entry.isDirectory() ? await directoryBytes(url) : (await stat(url)).size;
    }
    return bytes;
  }
  const total = await directoryBytes(new URL('../public/game/art/', import.meta.url));
  assert.ok(total <= 3_000_000, 'вся графика игры, включая прежние SVG, — до 3 МБ');
});

test('карта ссылается на все места шага и задаёт координаты в пределах изображения', () => {
  const step = index.steps.find(step => step.id === 2);
  assert.equal(step.layout, 'map');
  assert.match(step.map.art, /^art\/[a-z0-9-]+\.webp$/);
  assert.ok(typeof step.map.alt === 'string' && step.map.alt.trim());
  const places = index.chapters.filter(item => item.step === step.id && !item.final).map(item => item.id).sort();
  assert.deepEqual(step.map.places.map(place => place.id).sort(), places);
  for (const place of step.map.places) {
    assert.ok(Number.isFinite(place.x) && place.x >= 22 && place.x <= 78, place.id);
    assert.ok(Number.isFinite(place.y) && place.y >= 10 && place.y <= 90, place.id);
  }
});

test('графика четвёртого шага использует собственные иконки и портрет Стыда', () => {
  const shame = fights.find(fight => fight.id === 'fight05-shame');
  assert.equal(shame.art, 'art/foe-shame.webp');
  const pageSkills = skills.filter(skill => skill.page);
  const fourthItems = items.filter(item => item.step === 4);
  assert.equal(pageSkills.length, 5);
  assert.equal(fourthItems.length, 6);
  assert.equal(new Set(pageSkills.map(skill => skill.icon)).size, 5);
  assert.equal(new Set(fourthItems.map(item => item.icon)).size, 6);
  const previousIcons = new Set(skills.filter(skill => !skill.page).map(skill => skill.icon));
  assert.ok(pageSkills.every(skill => !previousIcons.has(skill.icon)));
  assert.ok(fourthItems.every(item => item.icon !== 'art/icons/item-blank-page.webp'));
});

test('подстановка слов работает для каждого варианта', () => {
  for (const variant of vocab.variants) for (const chapter of chapters) for (const scene of Object.values(chapter.scenes)) {
    for (const line of scene.lines || []) assert.doesNotMatch(fill(line.text, vocab, variant.id), /[{}]/);
  }
  assert.equal(fill('только {once}', vocab, 'нет-такого'), fill('только {once}', vocab, vocab.default));
});

function playThrough(game, chapter, pick, placements = []) {
  delete game.chapters[chapter.id];
  const progress = progressOf(game, chapter), visited = [];
  for (let guard = 0; guard < 500; guard += 1) {
    const now = stage(progress, chapter, game);
    const seen = progress.scene + ':' + linesOf(chapter.scenes[progress.scene], game).map(l => l.id).join(',');
    if (visited.at(-1) !== seen) visited.push(seen);
    if (now === 'ending') return { progress, visited };
    if (now === 'choice') choose(progress, chapter, chapter.scenes[progress.scene].choice.options[pick].id, game);
    else if (now === 'journal') {
      const id = chapter.scenes[progress.scene].questionIds[0];
      if (pick === 0) { setDraft(game, id, '  вымышленная запись  ', chapter.id); assert.equal(saveEntry(game, id, chapter.id), true); }
      else { setDraft(game, id, 'черновик', chapter.id); answerLater(game, id, chapter.id); }
      leaveJournal(progress, chapter, game);
    } else if (now === 'steering') {
      const scene = chapter.scenes[progress.scene];
      scene.parts.forEach((part, index) => assignSteering(progress, chapter, part.id, placements[index] || scene.zones[pick].id));
      leaveSteering(progress, chapter, game);
    } else advance(progress, chapter, game);
  }
  assert.fail('глава не закончилась');
}

test('обе ветки каждого эпизода доходят до концовки разными сценами', () => {
  for (const chapter of chapters) {
    const first = freshGame(), second = freshGame();
    const a = playThrough(first, chapter, 0), b = playThrough(second, chapter, 1);
    assert.notDeepEqual(a.visited, b.visited, chapter.id);
    assert.equal(a.progress.done && b.progress.done, true);
    const saved = Object.values(first.journal)[0], later = Object.values(second.journal)[0];
    assert.equal(saved.text, 'вымышленная запись');
    assert.deepEqual([later.text, later.draft, later.later], ['', 'черновик', true]);
  }
});

test('эпизоды открываются по порядку, а условия ссылаются на существующие варианты', () => {
  const options = [];
  for (const chapter of chapters) for (const scene of Object.values(chapter.scenes)) {
    for (const o of scene.choice?.options || []) options.push(o.id);
    for (const part of scene.parts || []) for (const option of part.options || []) options.push(option.id);
  }
  assert.equal(new Set(options).size, options.length, 'id вариантов выбора уникальны во всей игре');
  options.push(...index.chapters.map(item => item.id));
  assert.equal(new Set(options).size, options.length, 'id эпизодов не совпадают с id вариантов');
  for (const item of items) assert.ok(options.includes(item.when), item.id + ': ' + item.when);
  for (const chapter of chapters) for (const scene of Object.values(chapter.scenes)) {
    const conditional = [...(scene.lines || []), ...(Array.isArray(scene.next) ? scene.next : []),
      ...(scene.choice?.options || []).flatMap(option => Array.isArray(option.next) ? option.next : [])];
    for (const item of conditional) for (const key of ['if', 'ifNot']) if (item[key]) assert.ok(options.includes(item[key]), chapter.id + ': ' + item[key]);
  }
  const game = freshGame();
  index.chapters.forEach((item, i) => {
    if (item.after) assert.ok(index.chapters.slice(0, i).some(c => c.id === item.after), item.id);
    assert.equal(isLocked(item, freshGame()), i > 0);
    assert.equal(isLocked(item, game), false);
    if (item.type === 'fight') recordFight(game, item.id, true);
    else if (item.type === 'trial') markDone(game, item.id);
    else playThrough(game, chapters[episodes.indexOf(item)], i % 2);
  });
  assert.equal(levelOf(game), bouts.length + 1);
  for (const item of index.chapters.filter(c => c.needs)) for (const id of item.needs.of) assert.ok(index.chapters.some(c => c.id === id), id);
  for (const step of index.steps) assert.ok(index.chapters.some(c => c.step === step.id), 'шаг ' + step.id);
});

test('реплики зависят от решений из прошлых эпизодов', () => {
  const [first, second] = chapters, scene = second.scenes[second.start];
  const honest = freshGame(), joke = freshGame();
  playThrough(honest, first, 0); playThrough(joke, first, 1);
  const a = linesOf(scene, honest).map(l => l.id), b = linesOf(scene, joke).map(l => l.id);
  assert.equal(a.length, b.length);
  assert.notDeepEqual(a, b);
  assert.ok(linesOf(scene, freshGame()).length < scene.lines.length);
});

test('пустой ответ не сохраняется, а повреждённые данные не ломают игру', () => {
  const game = freshGame();
  setDraft(game, 'q', '   ');
  assert.equal(saveEntry(game, 'q'), false);
  const restored = normalizeGame({ variant: 5, chapters: { x: { scene: 's', line: -3, choices: [] } }, journal: { q: { draft: 'д', later: 'да' } , bad: 1 } });
  assert.deepEqual(restored.chapters.x, { scene: 's', line: 0, choices: {}, done: false });
  assert.deepEqual(restored.journal, { q: { draft: 'д', text: '', savedAt: null, later: false, chapter: null } });
  assert.equal(progressOf(restored, { id: 'x', start: 'a', scenes: { a: { type: 'story', lines: [{}] } } }).scene, 'a');
});

function fightWith(fight, choose) {
  let state = startBattle(fight);
  for (let turn = 0; turn < 40 && !state.over; turn += 1) state = playTurn(state, fight, choose(state, skillsOf(fight, skills).filter(s => canUse(state, s))));
  return state;
}

test('бои: данные верны, сложность растёт, награды идут по порядку', () => {
  fights.forEach((fight, i) => {
    assert.equal(fight.id, bouts[i].id);
    assert.deepEqual(validateFight(fight, skills), []);
    assert.equal(fight.reward.level, i + 2);
    if (i) assert.ok(fight.hp > fights[i - 1].hp, fight.id);
  });
});

test('одной силой воли бой не выиграть, а приёмами из сюжета — можно', () => {
  for (const fight of fights) {
    const will = fightWith(fight, (state, usable) => usable.find(s => s.id === 'will'));
    assert.equal(will.over, 'lose', fight.id + ': сила воли не должна побеждать');
    const smart = fightWith(fight, (state, usable) => {
      const opener = fight.armor && !state.open && usable.find(s => s.id === fight.armor.opener);
      return opener || usable.filter(s => s.id !== 'will' && s.id !== 'admit').sort((a, b) => b.dmg - a.dmg)[0] || usable[0];
    });
    assert.equal(smart.over, 'win', fight.id + ': должен быть путь к победе');
    assert.ok(smart.hp >= 3, fight.id + ': победа не должна висеть на волоске, осталось ' + smart.hp);
  }
});

test('броня босса снимается только признанием', () => {
  const boss = fights.find(fight => fight.id === 'fight04-craving'), by = id => skills.find(s => s.id === id);
  let state = playTurn(startBattle(boss), boss, by('group'));
  assert.equal(state.foe, boss.hp);
  state = playTurn(state, boss, by('admit'));
  assert.equal(state.open, true);
  const before = state.foe;
  state = playTurn(state, boss, by('truth'));
  assert.ok(state.foe < before);
  assert.equal(canUse(state, by('truth')), false);
});

test('финал второго шага открывается после трёх мест из пяти в любом порядке', () => {
  const night = index.chapters.find(item => item.needs), game = freshGame();
  markDone(game, night.after);
  const order = [...night.needs.of].reverse();
  order.slice(0, night.needs.count).forEach((id, i) => {
    assert.equal(isLocked(night, game), true, 'после ' + i + ' мест');
    assert.equal(isLocked(index.chapters.find(c => c.id === id), game), false);
    markDone(game, id);
  });
  assert.equal(isLocked(night, game), false);
  const chapter = chapters[episodes.indexOf(night)], supports = Object.values(chapter.scenes).find(sc => (sc.lines || []).filter(l => night.needs.of.includes(l.if)).length === night.needs.of.length);
  assert.equal(linesOf(supports, game).filter(l => night.needs.of.includes(l.if)).length, night.needs.count);
});

test('рюкзак: находки зависят от решений, опор столько же, сколько мест', () => {
  assert.equal(new Set(items.map(i => i.id)).size, items.length);
  assert.equal(itemsOf(items, freshGame()).filter(i => i.found).length, 0);
  const honest = freshGame(), joke = freshGame();
  playThrough(honest, chapters[0], 0); playThrough(joke, chapters[0], 1);
  const a = itemsOf(items, honest).filter(i => i.found).map(i => i.id), b = itemsOf(items, joke).filter(i => i.found).map(i => i.id);
  assert.equal(a.length, 1);
  assert.notDeepEqual(a, b);
  const night = index.chapters.find(item => item.needs);
  assert.deepEqual(items.filter(i => i.kind === 'support').map(i => i.when).sort(), [...night.needs.of].sort());
});

test('испытания: в каждом есть и ловушки, и правда, у каждой фразы есть объяснение', () => {
  trials.forEach((trial, i) => {
    assert.equal(trial.id, trialItems[i].id);
    assert.ok(trial.cards.some(c => c.trap) && trial.cards.some(c => !c.trap));
    assert.equal(new Set(trial.cards.map(c => c.id)).size, trial.cards.length);
    for (const card of trial.cards) assert.ok(card.text && card.why && typeof card.trap === 'boolean', card.id);
    assert.ok(trial.intro.length && trial.outro.length);
  });
});

const thirdItems = index.chapters.filter(item => item.step === 3);
const thirdChapters = thirdItems.map(item => chapters.find(chapter => chapter.id === item.id));

test('третий шаг открывается после Ночи, содержит пять ситуаций с Рулём и финал', () => {
  const step = index.steps.find(step => step.id === 3);
  assert.equal(step?.after, 'step02-night');
  assert.equal(step.layout, 'wheel');
  assert.ok(thirdItems.length >= 5 && thirdItems.length <= 7);
  assert.equal(thirdItems.filter(item => item.final).length, 1);
  assert.equal(thirdItems.at(-1).final, true);
  assert.equal(thirdItems[0].after, 'step02-night');
  const game = freshGame();
  assert.equal(isLocked(thirdItems[0], game), true);
  markDone(game, 'trial01-trap');
  assert.equal(isLocked(thirdItems[0], game), true);
  markDone(game, 'step02-night');
  assert.equal(isLocked(thirdItems[0], game), false);
  assert.equal(index.nextStep.title, 'Шаг пятый');
  for (const chapter of thirdChapters) {
    assert.ok(chapter.disclaimer && chapter.basedOn.some(source => source.includes('docs/step03.md')), chapter.id);
    assert.ok(chapter.questions.length >= 2 && chapter.questions.length <= 3, chapter.id);
    assert.ok(Object.values(chapter.scenes).some(scene => scene.type === 'journal'), chapter.id);
    const choices = Object.values(chapter.scenes).filter(scene => scene.choice);
    assert.ok(choices.length, chapter.id);
    assert.ok(choices.every(scene => scene.choice.options.length === 2), chapter.id);
    if (!thirdItems.find(item => item.id === chapter.id).final) {
      const wheel = Object.values(chapter.scenes).filter(scene => scene.type === 'steering');
      assert.equal(wheel.length, 1, chapter.id);
      assert.deepEqual(wheel[0].zones.map(zone => zone.id), ['act', 'help', 'release']);
    }
  }
});

test('все раскладки Руля и обе ветки пяти ситуаций доходят до конца', () => {
  const zones = ['act', 'help', 'release'];
  for (const chapter of thirdChapters.filter(chapter => Object.values(chapter.scenes).some(scene => scene.type === 'steering'))) {
    for (const a of zones) for (const b of zones) for (const c of zones) for (const action of [0, 1]) {
      const game = freshGame(), { progress } = playThrough(game, chapter, action, [a, b, c]);
      assert.equal(progress.done, true, chapter.id + ' ' + [a, b, c, action].join('/'));
    }
    const sameAction = zones.map(zone => playThrough(freshGame(), chapter, 0, [zone, zone, zone]).visited);
    assert.notDeepEqual(sameAction[0], sameAction[1], chapter.id + ': раскладка должна менять сюжет');
  }
});

test('финал третьего шага помнит решения, старый дневник и прогресс сохраняются', () => {
  const previous = {
    version: 1, variant: 'drugs',
    chapters: { 'step02-night': { scene: 'legacy-ending', line: 0, choices: { old: 'n2.choice.maybe' }, done: true } },
    fights: { 'fight01-whisper': { won: true, tries: 2 } },
    journal: { 'old-question': { draft: 'Сохранённый черновик', text: 'Сохранённая запись', savedAt: '2026-11-01T09:00:00.000Z', later: false, chapter: 'step01-only-once' } },
  };
  const a = normalizeGame(previous), b = normalizeGame(previous), final = thirdChapters.at(-1);
  for (const chapter of thirdChapters.slice(0, -1)) {
    playThrough(a, chapter, 0, ['act', 'help', 'release']);
    playThrough(b, chapter, 1, ['release', 'act', 'help']);
  }
  const endA = playThrough(a, final, 0).progress, endB = playThrough(b, final, 0).progress;
  assert.notDeepEqual(linesOf(final.scenes[endA.scene], a).map(line => line.id), linesOf(final.scenes[endB.scene], b).map(line => line.id));
  assert.deepEqual(a.journal['old-question'], previous.journal['old-question']);
  assert.deepEqual(a.chapters['step02-night'], previous.chapters['step02-night']);
  assert.deepEqual(a.fights, previous.fights);
  const restored = normalizeGame(JSON.parse(JSON.stringify(a)));
  assert.deepEqual(restored, a);
  restartChapter(restored, thirdChapters[0]);
  assert.deepEqual(restored.journal['old-question'], previous.journal['old-question']);
  assert.equal(restored.chapters['step02-night'].done, true);
});

test('новый сюжет связан с прошлыми шагами, все условия и офлайн-файлы существуют', async () => {
  const ids = new Set(index.chapters.map(item => item.id));
  for (const chapter of chapters) for (const scene of Object.values(chapter.scenes)) {
    for (const option of scene.choice?.options || []) ids.add(option.id);
    for (const part of scene.parts || []) for (const option of part.options || []) ids.add(option.id);
  }
  const references = [];
  function inspect(value, owner) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (['if', 'ifNot', 'when'].includes(key)) { assert.ok(ids.has(child), owner + ': неизвестное условие ' + child); references.push({ owner, id: child }); }
      else inspect(child, owner);
    }
  }
  for (const chapter of chapters) inspect(chapter, chapter.id);
  inspect(items, 'items');
  const previousIds = new Set(index.chapters.filter(item => item.step < 3).map(item => item.id));
  for (const chapter of chapters.filter(chapter => chapter.step < 3)) for (const scene of Object.values(chapter.scenes)) for (const option of scene.choice?.options || []) previousIds.add(option.id);
  assert.ok(new Set(references.filter(ref => thirdChapters.some(chapter => chapter.id === ref.owner) && previousIds.has(ref.id)).map(ref => ref.id)).size >= 3);
  assert.ok(items.filter(item => item.step === 3).length >= 2);
  const sw = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  for (const item of index.chapters) assert.ok(sw.includes('./game/data/' + item.file), 'нет офлайн-файла ' + item.file);
});


test('все приёмы и находки имеют прозрачные оригинальные иконки', async () => {
  for (const item of [...skills, ...items]) {
    assert.match(item.icon, /^art\/icons\/[\w-]+\.webp$/, item.id);
    const bytes = await readFile(new URL('../' + item.icon, data));
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    let alpha = false;
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const tag = bytes.toString('ascii', offset, offset + 4), size = bytes.readUInt32LE(offset + 4);
      if (tag === 'VP8X') alpha ||= !!(bytes[offset + 8] & 0x10);
      if (tag === 'VP8L') alpha ||= !!(bytes[offset + 12] & 0x10);
      if (tag === 'ALPH') alpha = true;
      offset += 8 + size + (size % 2);
    }
    assert.ok(alpha, item.id + ': требуется альфа-прозрачность');
  }
});

test('незаконченный бой переживает сохранение и продолжается с того же хода', () => {
  const boss = fights.find(fight => fight.id === 'fight04-craving'), by = id => skills.find(s => s.id === id);
  let live = playTurn(playTurn(startBattle(boss), boss, by('admit')), boss, by('group'));
  const game = freshGame();
  game.battle = { fight: boss.id, state: live };
  const reopened = normalizeGame(JSON.parse(JSON.stringify(game)));
  const restored = restoreBattle(reopened.battle, boss);
  assert.deepEqual({ ...restored, log: [] }, { ...live, log: [] });
  assert.equal(canUse(restored, by('group')), false, 'перерыв приёма сохраняется');
  assert.deepEqual(playTurn(restored, boss, by('truth')), playTurn(live, boss, by('truth')));
  assert.equal(restoreBattle(reopened.battle, fights[0]), null, 'чужой бой не подходит');
  assert.equal(restoreBattle(reopened.battle, { ...boss, hp: boss.hp + 1 }), null, 'после смены баланса бой начинается заново');
});

test('в сохранении нет боя, пока игрок не в бою, а повреждённый бой отбрасывается', () => {
  assert.equal('battle' in normalizeGame(freshGame()), false);
  const state = startBattle(fights[0]);
  const broken = [
    null, 'бой', { fight: fights[0].id }, { fight: 5, state },
    { fight: fights[0].id, state: { ...state, hp: -1 } },
    { fight: fights[0].id, state: { ...state, hp: state.maxHp + 5 } },
    { fight: fights[0].id, state: { ...state, foe: 0 } },
    { fight: fights[0].id, state: { ...state, over: 'win' } },
    { fight: fights[0].id, state: { ...state, turn: 1.5 } },
  ];
  for (const battle of broken) assert.equal('battle' in normalizeGame({ ...freshGame(), battle }), false, JSON.stringify(battle));
  const messy = normalizeGame({ ...freshGame(), battle: { fight: fights[0].id, extra: 1, state: { ...state, cooldowns: { call: 2, bad: 'x' }, log: [{ who: 'кто-то', text: 'строка', hit: 'нет', junk: 1 }, 'мусор'], junk: true } } });
  assert.deepEqual(messy.battle, { fight: fights[0].id, state: { ...state, cooldowns: { call: 2 }, log: [{ who: 'note', text: 'строка' }] } });
});

test('четвёртый шаг: пять страниц по три слоя, бой открывается после первого слоя каждой страницы', () => {
  const step = index.steps.find(step => step.id === 4), layers = index.chapters.filter(item => item.step === 4 && item.page);
  assert.equal(step.layout, 'notebook');
  assert.equal(step.after, 'step03-decision');
  assert.equal(step.pages.length, 5);
  for (const page of step.pages) {
    const own = layers.filter(item => item.page === page.id);
    assert.deepEqual(own.map(item => item.depth), [1, 2, 3], page.id);
    assert.equal(own[0].after, step.after);
    assert.equal(own[1].after, own[0].id);
    assert.equal(own[2].after, own[1].id);
    assert.ok(skills.some(skill => skill.id === page.skill && skill.page === page.id), 'нет приёма страницы ' + page.id);
  }
  const shame = index.chapters.find(item => item.id === 'fight05-shame'), game = freshGame();
  markDone(game, step.after);
  assert.deepEqual([...shame.needs.of].sort(), layers.filter(item => item.depth === 1).map(item => item.id).sort());
  for (const id of shame.needs.of) { assert.equal(isLocked(shame, game), true); markDone(game, id); }
  assert.equal(isLocked(shame, game), false, 'достаточно заглянуть на каждую страницу');
  assert.equal(isLocked(index.chapters.find(item => item.id === 'step04-notebook'), game), true, 'финал — только после боя');
});

test('четвёртый шаг: чем глубже страница, тем сильнее приём, а без тетради бой проходим впритык', () => {
  const shame = fights.find(fight => fight.id === 'fight05-shame'), step = index.steps.find(step => step.id === 4);
  const play = depth => {
    const game = freshGame();
    for (const item of index.chapters.filter(item => item.page && item.depth <= depth)) markDone(game, item.id);
    const scaled = scaledSkills(skills, index, game);
    for (const page of step.pages) assert.equal(depthOf(page.id, index, game), depth);
    let state = startBattle(shame);
    for (let turn = 0; turn < 40 && !state.over; turn += 1) {
      const usable = skillsOf(shame, scaled).filter(skill => canUse(state, skill));
      state = playTurn(state, shame, (!state.open && usable.find(skill => skill.id === shame.armor.opener)) || usable.filter(skill => skill.id !== 'will').sort((a, b) => b.dmg - a.dmg)[0]);
    }
    return { state, scaled };
  };
  const [one, two, three] = [1, 2, 3].map(play);
  for (const run of [one, two, three]) assert.equal(run.state.over, 'win');
  assert.ok(one.state.turn > two.state.turn && two.state.turn > three.state.turn, 'глубже — быстрее победа');
  assert.ok(three.state.hp > one.state.hp, 'глубже — больше стойкости остаётся');
  const by = (run, id) => run.scaled.find(skill => skill.id === id);
  assert.equal(by(three, 'name-deed').dmg, by(one, 'name-deed').dmg * 3);
  assert.notEqual(by(three, 'name-deed').say, by(one, 'name-deed').say);
  assert.equal(by(one, 'will').dmg, skills.find(skill => skill.id === 'will').dmg, 'обычные приёмы не меняются');
  for (const skill of skills.filter(skill => skill.page)) assert.equal(skill.says.length, 3, skill.id);
});

test('четвёртый шаг: финал видит глубину страниц и закладки', () => {
  const finale = chapters.find(chapter => chapter.id === 'step04-notebook'), scene = finale.scenes[finale.start];
  const shallow = freshGame(), deep = freshGame();
  for (const item of index.chapters.filter(item => item.page)) { if (item.depth === 1) markDone(shallow, item.id); markDone(deep, item.id); }
  deep.chapters['step04-deeds-1'].choices = { 's4-deed1.choice': 's4-deed1.choice.mark' };
  const a = linesOf(scene, shallow).map(line => line.id), b = linesOf(scene, deep).map(line => line.id);
  assert.notDeepEqual(a, b);
  assert.equal(b.length, a.length + 1, 'закладка добавляет строку');
  for (const item of items.filter(item => item.step === 4)) assert.ok(item.name && item.text && item.when);
});
