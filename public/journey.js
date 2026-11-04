/* Original editorial prompts for the app, not quotations from NA literature. */
export const sessionPhases = ['intro', 'exercise', 'reflection', 'takeaway'];

export const journeyStages = [
  { id: 'beginning', title: 'Найти опору', subtitle: 'Замечать, надеяться и выбирать', steps: [1, 2, 3] },
  { id: 'exploration', title: 'Узнать себя', subtitle: 'Исследовать, говорить и пробовать иначе', steps: [4, 5, 6, 7, 8, 9] },
  { id: 'everyday', title: 'Взять в жизнь', subtitle: 'Возвращаться к себе и делиться поддержкой', steps: [10, 11, 12] },
];

const journeys = [
  {
    symbol: '◉', place: 'Точка отсчёта',
    invitation: 'Разложите одну ситуацию на «до», «во время» и «после». Можно начать с вымышленного примера.',
    takeaway: 'Какое повторение я заметил(а) и что хочу помнить о нём?',
    nextHint: 'Замечать повторения бывает непросто. В следующем шаге можно поискать то, на что получится опереться.',
  },
  {
    symbol: '✦', place: 'Маяк надежды',
    invitation: 'Соберите свой компас из людей, мест и занятий, которые могут стать опорой.',
    takeaway: 'Какая одна опора кажется мне доступной сейчас?',
    nextHint: 'Когда видны опоры, можно выбрать небольшое действие. Следующий шаг поможет отделить свой выбор от чужих решений.',
  },
  {
    symbol: '⑂', place: 'Своя развилка',
    invitation: 'Переместите карточки в зоны: что зависит от вас, где нужна помощь и что нельзя решить за других.',
    takeaway: 'Какое посильное действие зависит от меня, даже если итог пока неизвестен?',
    nextHint: 'От собственного выбора можно перейти к исследованию своей истории. В следующем шаге достаточно одной небольшой темы.',
  },
  {
    symbol: '◈', place: 'Карта своей истории',
    invitation: 'Выберите одну тему для исследования. Пишите только то, с чем вам комфортно оставаться сейчас.',
    takeaway: 'Какое наблюдение о себе я хочу сохранить без оценки и приговора?',
    nextHint: 'Личное наблюдение можно оставить при себе или подготовить для разговора. Следующий шаг — о словах, доверии и границах.',
  },
  {
    symbol: '◎', place: 'Место для разговора',
    invitation: 'Попробуйте начало разговора и выберите договорённости, которые помогут сохранить ваши границы.',
    takeaway: 'Какая граница поможет мне чувствовать себя безопаснее в разговоре?',
    nextHint: 'Иногда, подбирая слова, легче заметить привычные реакции. Дальше можно исследовать одну из них без ярлыков.',
  },
  {
    symbol: '↻', place: 'Поворот привычки',
    invitation: 'Проследите одну привычную реакцию: что её запускает, что она даёт и что хотелось бы попробовать иначе.',
    takeaway: 'Что я узнал(а) о своей реакции и к какому маленькому эксперименту готов(а)?',
    nextHint: 'Для перемен не обязательно справляться в одиночку. Следующий шаг предлагает найти собственные слова просьбы о помощи.',
  },
  {
    symbol: '✧', place: 'Свои слова',
    invitation: 'Составьте короткую просьбу на своём языке или побудьте с ней мысленно, без записи.',
    takeaway: 'О какой поддержке мне хотелось бы попросить своими словами?',
    nextHint: 'С поддержкой можно бережно посмотреть на отношения. Дальше — личный список для размышления, без обязательства связываться с людьми.',
  },
  {
    symbol: '⋈', place: 'Нити отношений',
    invitation: 'Добавьте один пункт в личный список. Псевдонима достаточно; решения о контакте здесь не нужны.',
    takeaway: 'Что мне важно понять или обсудить до любых действий?',
    nextHint: 'Список не требует немедленного действия. В следующем шаге можно рассмотреть разные варианты, включая паузу.',
  },
  {
    symbol: '↗', place: 'Бережный маршрут',
    invitation: 'Сравните прямой, косвенный и отложенный варианты. Сохранить паузу — тоже допустимый выбор.',
    takeaway: 'Какую границу или возможный риск мне важно учесть прежде, чем решать?',
    nextHint: 'Большие решения можно чередовать с коротким вниманием к обычному дню. Дальше — небольшой личный чек-ин.',
  },
  {
    symbol: '☼', place: 'Один обычный день',
    invitation: 'Остановитесь на пару минут: что было важным, что хочется признать и что может поддержать завтра?',
    takeaway: 'Что из сегодняшнего дня я хочу взять с собой в завтрашний?',
    nextHint: 'После обзора дня можно оставить немного места для тишины. Следующий шаг поможет выбрать подходящую вам паузу.',
  },
  {
    symbol: '≈', place: 'Тихая пристань',
    invitation: 'Выберите тишину, прогулку или другой подходящий формат. Можно закончить практику раньше таймера.',
    takeaway: 'Что я заметил(а) в этой паузе, даже если это всего одно слово?',
    nextHint: 'Из внимания к себе может вырасти посильная поддержка другим. Дальше можно исследовать её без навязанных советов.',
  },
  {
    symbol: '✺', place: 'Круг поддержки',
    invitation: 'Исследуйте обычную ситуацию поддержки: как предложить помощь и оставить человеку право выбора?',
    takeaway: 'Какое добровольное действие учитывает и мои границы, и согласие другого человека?',
    nextHint: 'У этого пути нет последней обязательной точки. Можно вернуться к любому шагу или просто взять время для жизни.',
  },
];

export function journeyFor(id) {
  const number = Number(id);
  return Number.isInteger(number) && number >= 1 && number <= 12 ? journeys[number - 1] : null;
}

function plain(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function own(value, key) {
  if (!plain(value)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
}

function timestamp(value) {
  if (typeof value !== 'string' || value.length > 64) return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  const day = value.slice(0, 10), dayTime = Date.parse(day + 'T12:00:00Z');
  if (!Number.isFinite(dayTime) || new Date(dayTime).toISOString().slice(0, 10) !== day) return false;
  return Number(value.slice(11, 13)) < 24 && Number(value.slice(14, 16)) < 60 &&
    Number(value.slice(17, 19)) < 60 && Number.isFinite(Date.parse(value));
}

export function normalizeJourney(value) {
  const phase = own(value, 'phase'), visited = own(value, 'visited');
  const completedAt = own(value, 'completedAt'), takeaway = own(value, 'takeaway');
  // Use descriptors to avoid executing array accessors in direct callers.
  const visitedValues = Array.isArray(visited) ? Object.values(Object.getOwnPropertyDescriptors(visited))
    .filter(descriptor => Object.hasOwn(descriptor, 'value')).map(descriptor => descriptor.value) : [];
  return {
    phase: sessionPhases.includes(phase) ? phase : 'intro',
    visited: sessionPhases.filter(item => visitedValues.includes(item)),
    completedAt: timestamp(completedAt) ? completedAt : null,
    takeaway: typeof takeaway === 'string' ? takeaway.slice(0, 10000) : '',
  };
}

export function getJourney(draft = {}) {
  return normalizeJourney(own(draft, 'journey'));
}

export function journeySummary(drafts = {}) {
  const summary = { visited: 0, completed: 0, insights: 0 };
  for (let id = 1; id <= 12; id++) {
    const draft = own(drafts, String(id));
    if (!plain(draft)) continue;
    const journey = getJourney(draft);
    if (timestamp(own(draft, 'opened')) || journey.visited.length || journey.completedAt || journey.takeaway.trim()) summary.visited++;
    if (journey.completedAt) summary.completed++;
    if (journey.takeaway.trim()) summary.insights++;
  }
  return summary;
}
