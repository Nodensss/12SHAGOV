export function createExerciseRenderer({ draftFor, field, options, esc }) {
  const serviceStories = {
    'На группе': 'После встречи нужно убрать стулья. Один участник выглядит уставшим. Как предложить помощь, оставляя ему выбор?',
    'С близким человеком': 'Близкий человек делится переживаниями. Как выяснить, хочет ли он совета или сейчас достаточно выслушать?',
    'С новичком': 'Новичок стоит в стороне после встречи. Как познакомиться, не спрашивая подробностей его истории?',
    'В повседневной жизни': 'Коллега перегружен делами. Как предложить посильную помощь и сохранить собственные границы?'
  };
  const serviceReflections = {
    'Сначала спросить, нужна ли помощь': 'Вопрос оставляет человеку право согласиться или отказаться. Можно принять любой ответ.',
    'Выслушать, если человек согласен': 'Проверьте, удобно ли говорить сейчас, и не раскрывайте чужую историю другим.',
    'Поделиться опытом, если спросят': 'Личный опыт можно предложить без обещаний, что чужой путь будет таким же.',
    'Помочь группе по договорённости': 'Договорённость помогает уточнить задачу и собственные возможности.',
    'Дать человеку пространство': 'Уважение к паузе и отказу тоже может быть поддержкой.'
  };
  const controlCards = ['Заранее пообещал(а) ограничить', 'Поменял(а) план в последний момент', 'Старался(ась) скрыть последствия', 'Искал(а) способ всё исправить сразу'];
  const laneNames = ['До', 'Во время', 'После'], laneKeys = ['до', 'во время', 'после'];
  const responsibilityCards = ['Мой следующий поступок', 'Попросить совет', 'Решение другого человека', 'Итог ситуации'];
  const responsibilityZones = ['Могу сделать сам(а)', 'Попросить поддержки', 'Не в моей власти'];
  function activityMarkup(id) {
    const d = draftFor(id), f = d.fields, sel = d.selections;
    if (id === 1) return '<div class="move-list">' + controlCards.map(function (text, idx) {
      const lane = d.cardLanes[idx] || '';
      return '<div class="move-item"><span>' + esc(text) + '</span><div class="move-controls" aria-label="Когда происходило: ' + esc(text) + '">' + laneKeys.map(function (key, n) {
        return '<button type="button" class="' + (lane === key ? 'active' : '') + '" aria-pressed="' + (lane === key) + '" data-move="' + idx + '" data-lane="' + key + '">' + laneNames[n] + '</button>';
      }).join('') + '</div></div>';
    }).join('') + '</div><div class="lane-board">' + laneKeys.map(function (key, i) {
      const cards = controlCards.filter(function (_, idx) { return d.cardLanes[idx] === key; });
      return '<div class="lane"><strong>' + laneNames[i] + '</strong>' + (cards.length ? cards.map(function (t) { return '<span>· ' + esc(t) + '</span>'; }).join('') : '<span class="tiny">Пока пусто</span>') + '</div>';
    }).join('') + '</div>';
    if (id === 3) return '<div class="story-box"><strong>Ситуация:</strong> планы срываются, и внутри растёт напряжение. Разделите возможные ответы на три зоны. Все карточки можно перемещать.</div>' +
      '<div class="move-list">' + responsibilityCards.map(function (text, idx) {
        const zone = d.zoneCards && d.zoneCards[idx] ? d.zoneCards[idx] : '';
        return '<div class="move-item"><span>' + esc(text) + '</span><div class="move-controls" aria-label="Зона: ' + esc(text) + '">' +
          responsibilityZones.map(function (name, n) { return '<button type="button" class="' + (zone === String(n) ? 'active' : '') + '" aria-pressed="' + (zone === String(n)) + '" data-zone-card="' + idx + '" data-zone="' + n + '">' + esc(name) + '</button>'; }).join('') +
          '</div></div>';
      }).join('') + '</div><div class="lane-board">' + responsibilityZones.map(function (name, n) {
        const cards = responsibilityCards.filter(function (_, idx) { return d.zoneCards && d.zoneCards[idx] === String(n); });
        return '<div class="lane"><strong>' + esc(name) + '</strong>' + (cards.length ? cards.map(function (t) { return '<span>· ' + esc(t) + '</span>'; }).join('') : '<span class="tiny">Пока пусто</span>') + '</div>';
      }).join('') + '</div>' + field('Одно действие в направлении выбранной ценности', 'valueAction', 'Например: остановиться на минуту, уточнить план или попросить о помощи');
    if (id === 2) return '<p class="field-label">Какие опоры можно исследовать?</p>' + options('supports', ['Люди рядом', 'Группа или сообщество', 'Распорядок', 'Природа', 'Духовная практика', 'Медицинская помощь', 'Другая поддержка'], true) +
      field('Одна безопасная опора на ближайшие сутки', 'safeSupport', 'Например: написать знакомому, сходить на встречу, записаться на консультацию');
    if (id === 4) return '<div class="safety-box">Чувствительная тема: можно выбрать нейтральный пример, пропустить вопросы, остановиться или продолжить позже. Не нужно описывать травматичный опыт.</div>' +
      '<p class="field-label">Выберите один раздел</p>' + options('inventoryTopic', ['Отношения', 'Страхи', 'Обиды', 'Ценности', 'Поступки', 'Чувства'], false) +
      (sel.inventoryTopic ? field('Одна мысль по теме «' + sel.inventoryTopic + '»', 'inventoryNote_' + sel.inventoryTopic, 'Коротко и настолько подробно, насколько вам комфортно') : '<p class="tiny">Поля пока закрыты. Вы можете сначала просто выбрать тему — или выйти.</p>');
    if (id === 5) return '<div class="safety-box">Разговор — только по вашему решению. Здесь нет списка контактов и кнопки отправки.</div>' +
      '<p class="field-label">Что поможет вам чувствовать себя безопаснее?</p>' + options('boundaries', ['Сначала договориться о времени', 'Можно делать паузы', 'Обсуждать только выбранные темы', 'Не торопиться с ответами'], true) +
      '<div class="field-grid">' + field('С чего я мог(ла) бы начать', 'talkStart', 'Например: «Я хочу поделиться одной частью своей истории»') + field('Что пока трудно произнести', 'talkHard', 'Можно оставить пустым') + '</div>' +
      field('Какие границы или договорённости мне важны?', 'talkBoundary', 'Только для вашего черновика');
    if (id === 6) return '<div class="field-grid">' + field('Ситуация или вымышленный пример', 'habitSituation', 'Что обычно происходит перед реакцией?') + field('Моя привычная реакция', 'habitResponse', 'Что я обычно делаю или думаю?') +
      field('Краткосрочная польза', 'habitBenefit', 'Что это даёт в моменте?') + field('Цена для меня или других', 'habitCost', 'Можно описать одним словом') + '</div>' +
      '<p class="field-label">Что я готов(а) попробовать?</p>' + options('readiness', ['Готов(а) попробовать', 'Хочу понаблюдать', 'Пока не готов(а)'], false) +
      field('Какое качество или ресурс мне пригодится?', 'habitResource', 'Например: терпение, поддержка, отдых');
    if (id === 7) return '<p class="field-label">Какой язык вам подходит?</p>' + options('requestWords', ['Мои собственные слова', 'Светский язык', 'Религиозный язык', 'Пока без слов'], false) +
      field('Короткая просьба или мысль', 'requestText', 'Например: «Помоги мне заметить, где я могу попросить о поддержке»') + field('Что я чувствую или замечаю?', 'requestFeeling', 'Можно записать одно слово');
    if (id === 8) return '<div class="safety-box">Если тема причинённого вреда вызывает напряжение, остановитесь и вернитесь позже. Не добавляйте личные данные, если псевдонима достаточно.</div>' +
      '<div class="field-grid">' + field('Человек или группа (можно псевдоним)', 'amendsWho', 'Например: «бывший коллега»') + field('Что произошло? (по желанию)', 'amendsWhat', 'Коротко, без подробностей') + '</div>' +
      field('Что мне нужно понять до любых действий?', 'amendsUnderstand', 'Можно указать вопросы для обсуждения') + '<button class="button button-secondary button-small" data-add-entry>Добавить в личный список</button>' +
      '<div class="entry-list">' + (d.entries.length ? d.entries.map(function (entry, index) {
        return '<div class="entry-row"><span><strong>' + esc(entry.who || 'Без имени') + '</strong> · ' + esc(entry.what || 'без описания') + '</span><button type="button" data-remove-entry="' + index + '">Удалить</button></div>';
      }).join('') : '<p class="tiny">Список пока пуст. Запись остаётся в этом браузере.</p>') + '</div>';
    if (id === 9) {
      const entries = draftFor(8).entries || [];
      return '<div class="safety-box">Перед любым действием обсудите план с доверенным человеком. Если контакт может навредить кому-либо, можно выбрать «пока не действовать».</div>' +
      '<p class="field-label">Пункт личного списка (необязательно)</p><div class="field"><select aria-label="Пункт личного списка" data-select-field="repairEntry"><option value="">Пока без связи с человеком</option>' +
        entries.map(function (e, i) { return '<option value="' + i + '" ' + (f.repairEntry === String(i) ? 'selected' : '') + '>' + esc(e.who || 'Без имени') + ' · пункт ' + (i + 1) + '</option>'; }).join('') + '</select></div>' +
        '<p class="field-label">Вариант, который исследую</p>' + options('amendsRoute', ['Прямое действие', 'Косвенное исправление', 'Пока не действовать'], false) +
        '<div class="field-grid">' + field('Что можно исправить?', 'repairWhat', 'Набросок идеи') + field('Кого это затронет?', 'repairWho', 'Включая меня и других людей') + '</div>' +
        field('Какой риск или возможный вред я вижу?', 'repairRisk', 'Учтите безопасность и границы') + field('Что обсудить с доверенным человеком до решения?', 'repairDiscuss', 'План сам по себе не одобряется приложением') + field('После действия — если захочется', 'repairAfter', 'Необязательное наблюдение о результате');
    }
    if (id === 10) return '<p class="field-label">Когда удобнее сделать чек-ин?</p>' + options('checkinTime', ['Утро', 'Вечер'], false) +
      '<p class="field-label">Как я себя чувствую?</p>' + options('mood', ['Спокойно', 'Напряжённо', 'Устал(а)', 'Не знаю', 'Не хочу отмечать'], false) +
      '<div class="field-grid">' + field('Что сегодня было важным?', 'dayImportant', 'Одной фразы достаточно') + field('Что я хочу признать или исправить?', 'dayRepair', 'Можно пропустить') +
      field('За что я благодарен(на)?', 'dayGratitude', 'Любой ответ или пропуск') + field('Одно небольшое действие на завтра', 'dayNext', 'Без обязательств') + '</div>' +
      '<p class="field-label" style="margin-top:12px">Факты сохранённых чек-инов</p><div class="option-row">' +
      ((d.checkinDates || []).slice(-8).map(function (date) { return '<span class="option-chip selected">' + esc(new Date(date + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })) + '</span>'; }).join('') || '<span class="tiny">Пока нет отметок. Здесь будут только даты — без текста записей и серий.</span>') + '</div>';
    if (id === 11) return '<p class="field-label">Какой формат вы выбираете?</p>' + options('practiceType', ['Тишина', 'Молитва', 'Медитация', 'Прогулка', 'Дыхание', 'Размышление'], false) +
      '<p class="field-label">Длительность</p>' + options('practiceDuration', ['1 минута', '2 минуты', '5 минут', 'Без таймера'], false) +
      '<div class="timer-box"><div class="timer-number" id="timer-display">00:00</div><div><div class="timer-copy" id="timer-label">Без сигнала и без оценки. Можно остановить раньше.</div><button class="button button-secondary button-small" data-timer-start>Начать паузу</button> <button class="button button-quiet button-small" data-timer-stop>Остановить</button></div></div>' +
      field('Что я заметил(а)?', 'practiceNotice', 'Одно наблюдение по желанию');
    if (id === 12) return '<p class="field-label">Где возникла ситуация?</p>' + options('serviceScene', ['На группе', 'С близким человеком', 'С новичком', 'В повседневной жизни'], false) +
      '<div class="story-box"><strong>Ситуация:</strong> ' + esc(serviceStories[sel.serviceScene || 'На группе']) + '</div>' +
      '<p class="field-label" style="margin-top:15px">Какой ответ учитывает границы?</p>' + options('serviceChoice', ['Сначала спросить, нужна ли помощь', 'Выслушать, если человек согласен', 'Поделиться опытом, если спросят', 'Помочь группе по договорённости', 'Дать человеку пространство'], false) +
      (sel.serviceChoice ? '<p class="notice">' + esc(serviceReflections[sel.serviceChoice]) + '</p>' : '') + field('Маленькое добровольное действие', 'serviceAction', 'Можно выбрать действие вне АН');
    return '';
  }
return activityMarkup;
}
