// Пошаговый бой с тягой. Чистая логика без DOM и без случайностей: враг бьёт по кругу из списка attacks.
// Все числа и тексты лежат в data/skills.json и data/fights/*.json.

export function startBattle(fight) {
  return { hp: fight.playerHp, maxHp: fight.playerHp, foe: fight.hp, foeMax: fight.hp, turn: 0, guard: false, open: !fight.armor, cooldowns: {}, log: [], over: null };
}

// Возвращает сохранённый бой, если он подходит к этому бою: тот же id и те же запасы тяги и стойкости.
// Если баланс боя с тех пор поменяли, сохранение не подходит и бой начинается заново.
export function restoreBattle(saved, fight) {
  const state = saved?.state;
  if (!fight || !state || saved.fight !== fight.id || state.over) return null;
  if (state.maxHp !== fight.playerHp || state.foeMax !== fight.hp) return null;
  return { ...state, cooldowns: { ...state.cooldowns }, log: state.log.map(line => ({ ...line })) };
}

export function skillsOf(fight, skills) {
  return fight.skills.map(id => skills.find(s => s.id === id)).filter(Boolean);
}

export function canUse(state, skill) {
  return !state.over && !(state.cooldowns[skill.id] > 0);
}

// Один ход: приём игрока, затем ответ врага. Возвращает новое состояние; log — что произошло за ход.
export function playTurn(state, fight, skill) {
  if (!canUse(state, skill)) return state;
  const next = { ...state, cooldowns: { ...state.cooldowns }, log: [], guard: false };
  const say = (who, text, extra = {}) => next.log.push({ who, text, ...extra });
  const armor = fight.armor, blocked = armor && !next.open && skill.id !== armor.opener;

  say('you', skill.say);
  let dealt = 0;
  if (blocked) {
    dealt = Math.floor((skill.dmg || 0) * (armor.factor ?? 0));
    say('note', armor.say);
  } else {
    if (armor && skill.id === armor.opener && !next.open) { next.open = true; say('note', armor.broken); }
    dealt = Math.round((skill.dmg || 0) * (fight.weak?.[skill.id] ?? 1));
  }
  next.foe = Math.max(0, next.foe - dealt);
  if (dealt) say('note', '−' + dealt + ' тяге', { hit: 'foe' });
  if (skill.cost) { next.hp = Math.max(0, next.hp - skill.cost); say('note', '−' + skill.cost + ' стойкости: держаться на зубах выматывает', { hit: 'you' }); }
  if (skill.heal) { const before = next.hp; next.hp = Math.min(next.maxHp, next.hp + skill.heal); if (next.hp > before) say('note', '+' + (next.hp - before) + ' стойкости'); }
  if (skill.guard) next.guard = true;
  for (const id of Object.keys(next.cooldowns)) if (next.cooldowns[id] > 0) next.cooldowns[id] -= 1;
  if (skill.cooldown) next.cooldowns[skill.id] = skill.cooldown;

  if (next.foe <= 0) { next.over = 'win'; return next; }
  if (next.hp <= 0) { next.over = 'lose'; return next; }

  const attack = fight.attacks[next.turn % fight.attacks.length];
  let dmg = attack.dmg;
  if (armor && next.open && armor.calm) dmg = Math.ceil(dmg * armor.calm);
  if (next.guard) dmg = Math.ceil(dmg / 2);
  next.hp = Math.max(0, next.hp - dmg);
  say('foe', attack.say);
  say('note', '−' + dmg + ' стойкости' + (next.guard ? ' (пауза смягчила удар)' : ''), { hit: 'you' });
  if (fight.regen && next.foe < next.foeMax) { next.foe = Math.min(next.foeMax, next.foe + fight.regen); say('note', 'Тяга набирает силу: +' + fight.regen); }
  next.turn += 1;
  if (next.hp <= 0) next.over = 'lose';
  return next;
}

export function validateFight(fight, skills) {
  const errors = [], ids = new Set(skills.map(s => s.id));
  for (const key of ['id', 'name', 'tier', 'art']) if (!fight?.[key]) errors.push('бой без ' + key);
  if (!(fight?.hp > 0) || !(fight?.playerHp > 0)) errors.push('hp и playerHp должны быть больше нуля');
  if (!fight?.attacks?.length) errors.push('нет атак');
  for (const attack of fight?.attacks || []) if (!attack.say || !(attack.dmg >= 0)) errors.push('атака без say или dmg');
  for (const id of fight?.skills || []) if (!ids.has(id)) errors.push('нет приёма ' + id);
  if (!fight?.skills?.length) errors.push('нет приёмов');
  if (fight?.armor && !fight.skills.includes(fight.armor.opener)) errors.push('приём, снимающий броню, не выдан игроку');
  for (const key of ['intro', 'win', 'lose']) if (!fight?.[key]?.length) errors.push('нет текста ' + key);
  return errors;
}
