/* 12 шагов — офлайн-приложение. Без фреймворков и сборки. */
(function () {
  'use strict';

  var C = window.CONTENT;
  var KEY = 'twelve-steps:v1';
  var cap = window.Capacitor;
  var isNative = !!(cap && cap.isNativePlatform && cap.isNativePlatform());

  var STATUS = { todo: 'Не начат', doing: 'В работе', done: 'Пройден' };

  /* ================= хранение ================= */

  function blank() {
    return { version: 1, steps: {}, reviews: {}, amends: {}, clean: null, check: {} };
  }

  var storageOk = true;
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return blank();
      return normalize(JSON.parse(raw));
    } catch (e) {
      storageOk = false;
      return blank();
    }
  }

  function normalize(s) {
    var b = blank();
    if (!s || typeof s !== 'object') return b;
    ['steps', 'reviews', 'amends', 'check'].forEach(function (k) {
      if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k])) b[k] = s[k];
    });
    if (s.clean && typeof s.clean === 'object' && s.clean.start) b.clean = s.clean;
    return b;
  }

  var state = load();
  var saveTimer = null;
  var savedEl = document.getElementById('saved');

  function saveNow() {
    clearTimeout(saveTimer);
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      storageOk = true;
      flash('Сохранено', false);
    } catch (e) {
      storageOk = false;
      flash('Не сохранено!', true);
    }
  }
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 350);
  }
  var flashTimer = null;
  function flash(text, err) {
    savedEl.textContent = text;
    savedEl.classList.toggle('err', !!err);
    savedEl.style.opacity = 1;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { savedEl.style.opacity = 0; }, 1600);
  }
  window.addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && saveTimer) saveNow();
  });

  function stepData(n) {
    var s = state.steps[n];
    if (!s) s = state.steps[n] = {};
    if (!s.status) s.status = 'todo';
    if (!s.answers) s.answers = {};
    if (typeof s.notes !== 'string') s.notes = '';
    if (!Array.isArray(s.list)) s.list = [];
    return s;
  }
  function statusOf(n) {
    var s = state.steps[n];
    return (s && s.status) || 'todo';
  }

  /* ================= утилиты ================= */

  function h(tag, props) {
    var el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v == null || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'value') el.value = v;
        else if (k === 'checked') el.checked = !!v;
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, kid) {
    if (kid == null || kid === false) return;
    if (Array.isArray(kid)) { kid.forEach(function (k) { append(el, k); }); return; }
    el.appendChild(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* Текст с ссылками на источники вида [Н4] */
  function rich(text, tag, cls) {
    var html = esc(text).replace(/\[([ОНМФ]\d+)\]/g, function (_, code) {
      return '<a class="ref" href="#/sources/' + encodeURIComponent(code) + '">' + code + '</a>';
    });
    return h(tag || 'p', { html: html, class: cls || null });
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return dateStr(new Date()); }
  function parseDate(s) {
    var p = String(s).split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }
  function humanDate(s) {
    var d = parseDate(s);
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear();
  }
  var WEEK = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  function daysBetween(a, b) {
    return Math.round((parseDate(b) - parseDate(a)) / 86400000);
  }
  function plural(n, forms) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return forms[0];
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return forms[1];
    return forms[2];
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function textarea(value, oninput, extra) {
    var t = h('textarea', Object.assign({ value: value || '', rows: 3 }, extra || {}));
    t.addEventListener('input', function () { oninput(t.value); save(); });
    return t;
  }
  function field(label, control) {
    return h('label', { class: 'field' }, h('span', null, label), control);
  }

  /* ================= диалог ================= */

  var dlg = document.getElementById('dialog');
  function ask(opts) {
    return new Promise(function (resolve) {
      document.getElementById('dialogTitle').textContent = opts.title || '';
      var body = document.getElementById('dialogBody');
      body.innerHTML = '';
      if (typeof opts.body === 'string') append(body, rich(opts.body));
      else append(body, opts.body);
      document.getElementById('dialogOk').textContent = opts.ok || 'Да';
      var cancel = document.getElementById('dialogCancel');
      cancel.textContent = opts.cancel || 'Отмена';
      cancel.classList.toggle('hidden', opts.cancel === null);
      document.getElementById('dialogOk').className = 'btn ' + (opts.danger ? 'danger' : 'primary');
      dlg.returnValue = '';
      dlg.onclose = function () { resolve(dlg.returnValue === 'ok'); };
      if (dlg.showModal) dlg.showModal();
      else resolve(window.confirm((opts.title || '') + '\n' + (typeof opts.body === 'string' ? opts.body : '')));
    });
  }
  function tell(title, body) { return ask({ title: title, body: body, ok: 'Понятно', cancel: null }); }

  /* ================= навигация ================= */

  var view = document.getElementById('view');
  var titleEl = document.getElementById('title');
  var backBtn = document.getElementById('backBtn');
  var cleanup = null;
  var navigatedInside = false;
  var currentBack = null;

  backBtn.addEventListener('click', function () {
    if (navigatedInside && history.length > 1) history.back();
    else location.hash = currentBack || '#/';
  });

  function parseHash() {
    var raw = location.hash.replace(/^#\/?/, '');
    var parts = raw.split('/').filter(Boolean).map(function (p) {
      try { return decodeURIComponent(p); } catch (e) { return p; }
    });
    return parts;
  }

  var routes = {
    '': function () { return { tab: 'home', title: '12 шагов', render: viewHome }; },
    steps: function () { return { tab: 'steps', title: 'Шаги', render: viewSteps }; },
    step: function (p) {
      var n = parseInt(p[1], 10);
      if (!(n >= 1 && n <= 12)) return null;
      return { tab: 'steps', title: 'Шаг ' + n, back: '#/steps', render: function () { return n === 1 && window.StepEngine ? StepEngine.render("step01", p) : viewStep(n); } };
    },
    journal: function () { return { tab: 'journal', title: 'Дневник', render: viewJournal }; },
    more: function () { return { tab: 'more', title: 'Ещё', render: viewMore }; },
    check: function () { return { tab: 'more', title: 'Поддержка или давление?', back: '#/more', render: viewCheck }; },
    pause: function () { return { tab: 'more', title: 'Пауза', back: '#/more', render: viewPause }; },
    info: function (p) {
      var item = C.info.filter(function (i) { return i.id === p[1]; })[0];
      if (!item) return null;
      return { tab: 'more', title: item.title, back: '#/more', render: function () { return viewInfo(item); } };
    },
    sources: function (p) { return { tab: 'more', title: 'Источники', back: '#/more', render: function () { return viewSources(p[1]); } }; },
    data: function () { return { tab: 'more', title: 'Мои данные', back: '#/more', render: viewData }; },
    about: function () { return { tab: 'more', title: 'О приложении', back: '#/more', render: viewAbout }; }
  };

  function route() {
    if (cleanup) { cleanup(); cleanup = null; }
    var parts = parseHash();
    var make = routes[parts[0] || ''];
    var r = make && make(parts);
    if (!r) { location.replace('#/'); return; }
    titleEl.textContent = r.title;
    document.title = r.title === '12 шагов' ? '12 шагов' : r.title + ' — 12 шагов';
    currentBack = r.back || null;
    backBtn.hidden = !r.back;
    document.querySelectorAll('.tabbar a').forEach(function (a) {
      var on = a.getAttribute('data-tab') === r.tab;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    view.innerHTML = '';
    var node = r.render();
    append(view, node);
    if (!r.keepScroll) window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', function () { navigatedInside = true; route(); });

  /* ================= Главная ================= */

  function currentStep() {
    var doing = C.steps.filter(function (s) { return statusOf(s.n) === 'doing'; })[0];
    if (doing) return doing;
    return C.steps.filter(function (s) { return statusOf(s.n) !== 'done'; })[0] || null;
  }

  function viewHome() {
    var done = C.steps.filter(function (s) { return statusOf(s.n) === 'done'; }).length;
    var cur = currentStep();

    var progress = h('section', { class: 'card stack' },
      h('div', { class: 'row between' },
        h('div', null, h('div', { class: 'eyebrow' }, 'Ваш путь'), h('h2', null, 'Пройдено ' + done + ' из 12')),
        h('a', { class: 'btn sm ghost', href: '#/steps' }, 'Все шаги')
      ),
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 12, 'aria-valuenow': done },
        h('span', { style: 'width:' + (done / 12 * 100) + '%' })),
      h('div', { class: 'dots' }, C.steps.map(function (s) {
        return h('a', { href: '#/step/' + s.n, class: statusOf(s.n), 'aria-label': 'Шаг ' + s.n + ': ' + STATUS[statusOf(s.n)] }, s.n);
      })),
      cur
        ? h('a', { class: 'btn primary block', href: '#/step/' + cur.n },
            (statusOf(cur.n) === 'doing' ? 'Продолжить: ' : (done ? 'Дальше: ' : 'Начать: ')) + 'шаг ' + cur.n + ' — ' + cur.title)
        : h('p', null, 'Все двенадцать шагов отмечены. Работа по шагам 10–12 обычно продолжается и дальше — в ежедневном обзоре и в жизни вне собраний.')
    );

    var quick = h('section', { class: 'stack' },
      h('ul', { class: 'menu' },
        h('li', null, h('a', { href: '#/journal' }, 'Вечерний обзор', h('span', { class: 's' }, reviewTodayHint()))),
        h('li', null, h('a', { href: '#/pause' }, 'Пауза', h('span', { class: 's' }, 'Таймер тишины, молитвы или размышления'))),
        h('li', null, h('a', { href: '#/check' }, 'Поддержка или давление?', h('span', { class: 's' }, '10 критериев из исследования')))
      )
    );

    var important = h('section', { class: 'card soft' },
      h('div', { class: 'eyebrow' }, 'Важно'),
      rich(C.disclaimer),
      h('p', null, h('a', { href: '#/about' }, 'О приложении и исследовании'))
    );

    return [progress, cleanCard(), quick, important, sosLink()];
  }

  function reviewTodayHint() {
    var r = state.reviews[today()];
    return r ? 'Сегодняшняя запись есть — можно дополнить' : 'Короткий самоанализ за день (шаг 10)';
  }

  function sosLink() {
    return h('a', { class: 'sos', href: 'tel:112' },
      h('strong', null, '112'),
      h('span', null, 'При угрозе жизни, передозировке или если вы в опасности — звоните в экстренную службу.'));
  }

  function cleanCard() {
    var c = state.clean;
    var card = h('section', { class: 'card stack' });
    if (!c || !c.start) {
      var inp = h('input', { type: 'date', value: today(), max: today(), 'aria-label': 'Дата начала' });
      append(card, [
        h('div', { class: 'eyebrow' }, 'Счётчик дней'),
        h('p', { class: 'muted small' }, 'По желанию. Отсчёт — символ, а не мерило ценности человека.'),
        h('div', { class: 'row' }, h('div', { class: 'grow' }, inp),
          h('button', { class: 'btn', type: 'button', onclick: function () {
            if (!inp.value) return;
            state.clean = { start: inp.value > today() ? today() : inp.value, history: [] };
            saveNow(); route();
          } }, 'Начать'))
      ]);
      return card;
    }
    var days = Math.max(0, daysBetween(c.start, today()));
    var hist = Array.isArray(c.history) ? c.history : [];
    append(card, [
      h('div', { class: 'eyebrow' }, 'Счётчик дней'),
      h('div', { class: 'row' },
        h('span', { class: 'big-number' }, days),
        h('span', { class: 'muted' }, plural(days, ['день', 'дня', 'дней']) + ' с ' + humanDate(c.start))),
      hist.length ? h('p', { class: 'small muted' }, 'Предыдущих периодов: ' + hist.length +
        '. Самый долгий: ' + Math.max.apply(null, hist.map(function (x) { return x.days || 0; })) + ' дн.') : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn sm', type: 'button', onclick: restartCount }, 'Новый отсчёт'),
        h('button', { class: 'btn sm ghost', type: 'button', onclick: changeStart }, 'Изменить дату'),
        h('button', { class: 'btn sm ghost', type: 'button', onclick: hideCount }, 'Убрать'))
    ]);
    return card;
  }

  function restartCount() {
    var body = h('div', null,
      h('p', null, 'Новый отсчёт не означает исчезновения приобретённых знаний, связей и навыков.'),
      h('p', null, 'Срыв — повод обсудить причины и следующую помощь, а не нравственный приговор.'),
      h('p', { class: 'small muted' }, 'После перерыва толерантность снижается — прежняя доза может быть опасной. При угрозе жизни — 112.'));
    ask({ title: 'Начать новый отсчёт?', body: body, ok: 'Начать с сегодня' }).then(function (ok) {
      if (!ok) return;
      var c = state.clean;
      if (!Array.isArray(c.history)) c.history = [];
      c.history.push({ start: c.start, end: today(), days: Math.max(0, daysBetween(c.start, today())) });
      c.start = today();
      saveNow(); route();
    });
  }
  function changeStart() {
    var inp = h('input', { type: 'date', value: state.clean.start, max: today() });
    ask({ title: 'Дата начала отсчёта', body: h('div', null, inp), ok: 'Сохранить' }).then(function (ok) {
      if (!ok || !inp.value) return;
      state.clean.start = inp.value > today() ? today() : inp.value;
      saveNow(); route();
    });
  }
  function hideCount() {
    ask({ title: 'Убрать счётчик?', body: 'Дата начала и история периодов будут удалены.', ok: 'Убрать', danger: true }).then(function (ok) {
      if (!ok) return;
      state.clean = null;
      saveNow(); route();
    });
  }

  /* ================= Список шагов ================= */

  function viewSteps() {
    return [
      h('p', { class: 'muted small' }, 'Описания — краткий пересказ, не официальный текст. Порядок можно соблюдать, но темп выбираете вы.'),
      h('ul', { class: 'step-list' }, C.steps.map(function (s) {
        var st = statusOf(s.n);
        return h('li', null, h('a', { class: 'step-item ' + st, href: '#/step/' + s.n },
          h('span', { class: 'step-num' }, s.n),
          h('span', { class: 'grow' }, h('span', { class: 't' }, s.title), h('br'), h('span', { class: 's' }, s.theme)),
          st !== 'todo' ? h('span', { class: 'badge ' + st }, STATUS[st]) : null));
      }))
    ];
  }

  /* ================= Страница шага ================= */

  function fold(title, tone, body, open) {
    return h('details', { class: 'fold', open: !!open },
      h('summary', null, h('span', { class: 'dot ' + tone }), title),
      h('div', { class: 'fold-body' }, body));
  }

  function viewStep(n) {
    var s = C.steps[n - 1];
    var data = stepData(n);

    var seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Статус шага' });
    function paintSeg() {
      Array.prototype.forEach.call(seg.children, function (b) {
        b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === data.status));
      });
    }
    Object.keys(STATUS).forEach(function (k) {
      append(seg, h('button', { type: 'button', 'data-v': k, onclick: function () {
        data.status = k;
        if (k === 'done') data.doneAt = today();
        paintSeg(); saveNow();
      } }, STATUS[k]));
    });
    paintSeg();

    function touched() {
      if (data.status === 'todo') { data.status = 'doing'; paintSeg(); }
    }

    var hero = h('section', { class: 'card stack step-hero' },
      h('div', { class: 'eyebrow' }, 'Шаг ' + n + ' из 12'),
      h('h2', null, s.title),
      h('p', { class: 'step-meaning' }, s.meaning),
      rich('Пересказ, не официальный текст. Официальная формулировка — в литературе АН [О2].', 'p', 'small muted'),
      seg);

    var parts = [hero,
      fold('Что может помочь', 'plus', rich(s.good)),
      fold('Чем может обернуться', 'minus', rich(s.bad)),
      fold('Здоровое прочтение', 'plus', rich(s.healthy), true),
      fold('Опыт участников', 'mixed', [
        s.voices.map(function (v) {
          return h('div', { class: 'voice ' + v.tone }, rich(v.text + ' [' + v.ref + ']'));
        }),
        h('p', { class: 'small muted', style: 'margin-top:12px' }, 'Личные истории показывают, что такие переживания бывают, но не то, как часто.')
      ])
    ];

    if (s.flags.length) {
      parts.push(fold('Тревожные сигналы', 'minus', [
        h('ul', { class: 'flags' }, s.flags.map(function (f) { return h('li', null, f); })),
        h('p', { style: 'margin-top:10px' }, h('a', { href: '#/check' }, 'Проверить: поддержка или давление?'))
      ]));
    }
    if (s.tip) parts.push(h('section', { class: 'card note' }, rich(s.tip)));

    if (s.questions.length) {
      parts.push(h('section', { class: 'card stack' },
        h('h3', null, 'Вопросы для размышления'),
        h('p', { class: 'small muted' }, 'Отвечайте своими словами и в своём темпе. Пропускать вопросы можно.'),
        s.questions.map(function (q, i) {
          return field(q, textarea(data.answers[i], function (v) { data.answers[i] = v; touched(); }));
        })));
    }

    var tool = s.tool && TOOLS[s.tool];
    if (tool) parts.push(tool(n, data, touched));

    parts.push(h('section', { class: 'card' },
      field('Свободные заметки', textarea(data.notes, function (v) { data.notes = v; touched(); }, { rows: 4 }))));

    parts.push(h('nav', { class: 'nav-steps', 'aria-label': 'Соседние шаги' },
      n > 1 ? h('a', { class: 'btn', href: '#/step/' + (n - 1) }, '← Шаг ' + (n - 1)) : h('span'),
      n < 12 ? h('a', { class: 'btn', href: '#/step/' + (n + 1) }, 'Шаг ' + (n + 1) + ' →') : h('a', { class: 'btn', href: '#/journal' }, 'Дневник →')));

    return parts;
  }

  /* ---------- инструменты шагов ---------- */

  function listTool(n, data, touched, cfg) {
    var wrap = h('section', { class: 'card stack' });
    function draw() {
      wrap.innerHTML = '';
      append(wrap, [h('h3', null, cfg.title), h('p', { class: 'small muted' }, cfg.hint)]);
      data.list.forEach(function (e, i) {
        var card = h('div', { class: 'entry' },
          h('div', { class: 'entry-head' },
            h('strong', null, cfg.label + ' ' + (i + 1)),
            h('button', { class: 'btn sm ghost', type: 'button', onclick: function () {
              ask({ title: 'Удалить запись?', body: 'Восстановить её будет нельзя.', ok: 'Удалить', danger: true }).then(function (ok) {
                if (!ok) return;
                data.list.splice(data.list.indexOf(e), 1);
                if (state.amends[e.id]) delete state.amends[e.id];
                saveNow(); draw();
              });
            } }, 'Удалить')),
          h('div', { class: 'stack' }, cfg.fields.map(function (f) {
            return field(f[1], textarea(e[f[0]], function (v) { e[f[0]] = v; touched(); }, { rows: 2 }));
          }), cfg.checkbox ? h('label', { class: 'check-line' },
            h('input', { type: 'checkbox', checked: !!e[cfg.checkbox[0]], onchange: function (ev) { e[cfg.checkbox[0]] = ev.target.checked; touched(); saveNow(); } }),
            h('span', { class: 'small' }, cfg.checkbox[1])) : null));
        append(wrap, card);
      });
      append(wrap, h('button', { class: 'btn block', type: 'button', onclick: function () {
        data.list.push({ id: uid(), created: today() });
        touched(); saveNow(); draw();
        var areas = wrap.querySelectorAll('.entry');
        var last = areas[areas.length - 1];
        if (last) { last.scrollIntoView({ block: 'center' }); last.querySelector('textarea').focus(); }
      } }, cfg.add));
    }
    draw();
    return wrap;
  }

  var TOOLS = {
    inventory: function (n, data, touched) {
      return listTool(n, data, touched, {
        title: 'Записи самоанализа',
        hint: 'Контекст, свои действия и то, что можно делать иначе — так самоанализ становится предметным, а не общим «со мной что-то не так».',
        label: 'Ситуация',
        add: '+ Добавить ситуацию',
        fields: [['situation', 'Что произошло'], ['context', 'Контекст: что происходило вокруг'], ['actions', 'Мои действия'], ['result', 'Последствия'], ['differently', 'Что можно делать иначе']]
      });
    },
    harmList: function (n, data, touched) {
      return listTool(n, data, touched, {
        title: 'Список: кому и какой вред',
        hint: 'Конкретно: какой поступок, какой ущерб, кому. Готовность исправлять свои действия не требует брать на себя ответственность за чужое насилие.',
        label: 'Запись',
        add: '+ Добавить человека',
        fields: [['who', 'Кому'], ['act', 'Мой поступок'], ['harm', 'Какой ущерб']],
        checkbox: ['verified', 'Проверил(а) основание: это мой поступок, а не самозащита, разрыв отношений или отказ выполнять чужие требования']
      });
    },
    amends: function (n, data, touched) {
      var list = stepData(8).list;
      var wrap = h('section', { class: 'card stack' }, h('h3', null, 'План исправления'),
        h('p', { class: 'small muted' }, 'Человек вправе отказаться от встречи, не простить и не восстанавливать отношения. Исправление делом не всегда требует контакта.'));
      if (!list.length) {
        append(wrap, h('p', null, 'Сначала составьте список на ', h('a', { href: '#/step/8' }, 'шаге 8'), '.'));
        return wrap;
      }
      list.forEach(function (e) {
        var a = state.amends[e.id] || (state.amends[e.id] = {});
        function sel(key, opts) {
          var s = h('select', { onchange: function () { a[key] = s.value; touched(); saveNow(); } },
            opts.map(function (o) { return h('option', { value: o[0] }, o[1]); }));
          s.value = a[key] || '';
          return s;
        }
        append(wrap, h('div', { class: 'entry' },
          h('div', { class: 'entry-head' }, h('strong', null, (e.who || 'Без имени') + (e.act ? ' — ' + e.act : ''))),
          h('div', { class: 'stack' },
            field('Как исправить делом', textarea(a.plan, function (v) { a.plan = v; touched(); }, { rows: 2 })),
            field('Может ли контакт навредить адресату или другим?', sel('safety', [
              ['', '— не оценено —'],
              ['ok', 'Нет: контакт, скорее всего, уместен'],
              ['indirect', 'Да: исправляю иначе, без контакта'],
              ['unsure', 'Не уверен(а): обсудить с тем, кому доверяю']
            ])),
            field('Статус', sel('status', [
              ['', 'Планирую'],
              ['done', 'Сделано'],
              ['wait', 'Отложено'],
              ['none', 'Решил(а) не вступать в контакт']
            ])),
            e.verified ? null : h('p', { class: 'small muted' }, 'На шаге 8 основание этой записи ещё не проверено.'))));
      });
      return wrap;
    },
    review: function () {
      return h('section', { class: 'card stack' },
        h('h3', null, 'Вечерний обзор'),
        h('p', { class: 'small muted' }, 'Короткие ежедневные записи ведутся в разделе «Дневник». Это ваш самоанализ, а не обязательный отчёт кому-либо.'),
        h('a', { class: 'btn primary block', href: '#/journal' }, 'Открыть сегодняшний обзор'));
    },
    pause: function () {
      return h('section', { class: 'card stack' },
        h('h3', null, 'Пауза'),
        h('p', { class: 'small muted' }, 'Таймер для молитвы, тишины или размышления — как подходит вам.'),
        h('a', { class: 'btn primary block', href: '#/pause' }, 'Открыть таймер'));
    }
  };

  /* ================= Дневник ================= */

  var journalDate = null;

  function reviewForm(date) {
    var r = state.reviews[date] || {};
    function commit() {
      var empty = !r.good && !r.hard && !r.fix && !r.note && r.craving == null;
      if (empty) delete state.reviews[date];
      else state.reviews[date] = r;
    }
    function ta(key, label) {
      return field(label, textarea(r[key], function (v) { r[key] = v; commit(); }, { rows: 2 }));
    }
    var out = h('output', null, r.craving == null ? '—' : r.craving);
    var range = h('input', { type: 'range', min: 0, max: 10, step: 1, value: r.craving == null ? 0 : r.craving,
      oninput: function () { r.craving = Number(range.value); out.textContent = range.value; commit(); save(); } });
    return h('div', { class: 'stack' },
      ta('good', 'Что сегодня получилось хорошо?'),
      ta('hard', 'Где была резкость, избегание или невыполненное обещание?'),
      ta('fix', 'Что и как можно исправить?'),
      h('label', { class: 'field' }, h('span', null, 'Тяга сегодня (0–10): ', out), range),
      ta('note', 'Что ещё хочется отметить?'));
  }

  function viewJournal() {
    var date = journalDate || today();
    var dateInp = h('input', { type: 'date', value: date, max: today(), onchange: function () {
      if (!dateInp.value) return;
      journalDate = dateInp.value; route();
    } });
    var d = parseDate(date);

    var current = h('section', { class: 'card stack' },
      h('div', { class: 'row between' },
        h('div', null, h('div', { class: 'eyebrow' }, 'Вечерний обзор · шаг 10'),
          h('h2', null, date === today() ? 'Сегодня' : humanDate(date) + ', ' + WEEK[d.getDay()])),
        h('div', { style: 'width:11rem' }, dateInp)),
      h('p', { class: 'small muted' }, 'Отмечайте не только ошибки, но и то, что получилось. Это ваш дневник, а не обязательный отчёт наставнику.'),
      reviewForm(date));

    var dates = Object.keys(state.reviews).filter(function (k) { return k !== date; }).sort().reverse();
    var past = h('section', { class: 'stack' }, h('h3', null, 'Прошлые записи'),
      dates.length ? h('ul', { class: 'menu' }, dates.map(function (k) {
        var r = state.reviews[k];
        var snippet = r.good || r.hard || r.fix || r.note || '';
        return h('li', null, h('a', { href: '#/journal', onclick: function (ev) {
          ev.preventDefault(); journalDate = k; route();
        } }, humanDate(k) + ', ' + WEEK[parseDate(k).getDay()] + (r.craving != null ? ' · тяга ' + r.craving : ''),
          h('span', { class: 's' }, snippet.slice(0, 90) || '—')));
      })) : h('p', { class: 'muted small' }, 'Пока нет других записей.'));

    var stepsWithNotes = C.steps.map(function (s) {
      var dt = state.steps[s.n];
      if (!dt) return null;
      var answers = Object.keys(dt.answers || {}).filter(function (k) { return (dt.answers[k] || '').trim(); }).length;
      var entries = (dt.list || []).length;
      var notes = (dt.notes || '').trim() ? 1 : 0;
      if (!answers && !entries && !notes) return null;
      var bits = [];
      if (answers) bits.push(answers + ' ' + plural(answers, ['ответ', 'ответа', 'ответов']));
      if (entries) bits.push(entries + ' ' + plural(entries, ['запись', 'записи', 'записей']));
      if (notes) bits.push('заметки');
      return h('li', null, h('a', { href: '#/step/' + s.n }, 'Шаг ' + s.n + ' — ' + s.title, h('span', { class: 's' }, bits.join(', '))));
    }).filter(Boolean);

    var stepNotes = h('section', { class: 'stack' }, h('h3', null, 'Записи по шагам'),
      stepsWithNotes.length ? h('ul', { class: 'menu' }, stepsWithNotes)
        : h('p', { class: 'muted small' }, 'Ответы на вопросы и заметки из шагов появятся здесь.'));

    return [current, past, stepNotes];
  }

  /* ================= Поддержка или давление ================= */

  function viewCheck() {
    var summary = h('section', { class: 'card soft' });
    function paintSummary() {
      var vals = C.check.map(function (c) { return state.check[c.area]; });
      var p = vals.filter(function (v) { return v === 'pressure'; }).length;
      var s = vals.filter(function (v) { return v === 'support'; }).length;
      var answered = vals.filter(Boolean).length;
      summary.innerHTML = '';
      summary.className = 'card ' + (p ? 'warn' : 'soft');
      if (!answered) {
        append(summary, rich('Таблица из исследования — практические критерии, а не диагностика группы или юридическое заключение. Отметьте, на что больше похож ваш опыт.'));
        return;
      }
      append(summary, h('h3', null, 'Поддержка: ' + s + ' · давление: ' + p + ' · не знаю: ' + (answered - s - p)));
      if (p) {
        append(summary, rich('Отдельный конфликт не доказывает системного злоупотребления, но о нём стоит поговорить — с человеком, которому доверяете, с другим участником или со специалистом. Вы вправе сменить спонсора или группу [О3].'));
      } else {
        append(summary, h('p', null, 'По вашим отметкам признаков давления нет. Пересматривайте их, если что-то изменится.'));
      }
      append(summary, h('p', { class: 'small muted' }, 'Хорошие намерения и благодарность части участников не отменяют конкретного вреда другим.'));
    }

    var items = C.check.map(function (c, i) {
      var name = 'chk' + i;
      var group = h('div', { class: 'choice' });
      function opt(v, text) {
        var lab = h('label', { class: state.check[c.area] === v ? 'sel-' + v : '' },
          h('input', { type: 'radio', name: name, value: v, checked: state.check[c.area] === v, onchange: function () {
            state.check[c.area] = v; saveNow();
            Array.prototype.forEach.call(group.children, function (l) { l.className = ''; });
            lab.className = 'sel-' + v;
            paintSummary();
          } }),
          h('span', null, text));
        return lab;
      }
      append(group, [opt('support', c.support), opt('pressure', c.pressure), opt('unsure', 'Не знаю / не сталкивался(-ась)')]);
      return h('section', { class: 'card check-item' }, h('h3', null, c.area), group);
    });

    paintSummary();
    return [summary].concat(items, [
      h('button', { class: 'btn ghost block', type: 'button', onclick: function () {
        state.check = {}; saveNow(); route();
      } }, 'Сбросить отметки'),
      h('a', { class: 'btn block', href: '#/info/alternatives' }, 'Если формат не подходит')
    ]);
  }

  /* ================= Пауза ================= */

  function viewPause() {
    var options = [1, 3, 5, 10, 15];
    var total = 3 * 60, left = total, endAt = 0, iv = null;
    var R = 92, L = 2 * Math.PI * R;

    var bar = svgEl('circle', { class: 'bar', cx: 105, cy: 105, r: R, 'stroke-dasharray': L, 'stroke-dashoffset': 0 });
    var ring = svgEl('svg', { viewBox: '0 0 210 210', 'aria-hidden': 'true' },
      svgEl('circle', { class: 'track', cx: 105, cy: 105, r: R }), bar);
    var time = h('div', { class: 'timer-time', role: 'timer', 'aria-live': 'off' });
    var msg = h('p', { class: 'muted', style: 'text-align:center' }, 'Остановитесь. Можно просто дышать и замечать, что происходит.');
    var startBtn = h('button', { class: 'btn primary', type: 'button', onclick: toggle }, 'Начать');
    var resetBtn = h('button', { class: 'btn ghost', type: 'button', onclick: reset }, 'Сбросить');
    var chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Длительность' }, options.map(function (m) {
      return h('button', { class: 'chip', type: 'button', 'aria-pressed': String(m * 60 === total), onclick: function () {
        stop(); total = left = m * 60; paint();
        Array.prototype.forEach.call(chips.children, function (b) { b.setAttribute('aria-pressed', String(b === this)); }, this);
      } }, m + ' мин');
    }));

    function paint() {
      var secs = Math.ceil(left);
      time.textContent = Math.floor(secs / 60) + ':' + pad(secs % 60);
      bar.setAttribute('stroke-dashoffset', String(L * (1 - left / total)));
    }
    function tick() {
      left = Math.max(0, (endAt - Date.now()) / 1000);
      paint();
      if (left <= 0) finish();
    }
    function toggle() {
      if (iv) { stop(); left = Math.max(0, (endAt - Date.now()) / 1000); paint(); startBtn.textContent = 'Продолжить'; return; }
      if (left <= 0) left = total;
      endAt = Date.now() + left * 1000;
      iv = setInterval(tick, 250);
      startBtn.textContent = 'Пауза';
      msg.textContent = 'Остановитесь. Можно просто дышать и замечать, что происходит.';
      primeAudio();
    }
    function stop() { if (iv) { clearInterval(iv); iv = null; } }
    function reset() { stop(); left = total; startBtn.textContent = 'Начать'; paint(); }
    function finish() {
      stop(); startBtn.textContent = 'Ещё раз';
      msg.textContent = 'Время вышло. Что вы заметили?';
      chime();
    }
    cleanup = stop;
    paint();

    return [
      h('section', { class: 'card' }, h('div', { class: 'timer' },
        h('div', { class: 'timer-ring' }, ring, time), chips, h('div', { class: 'row' }, startBtn, resetBtn), msg)),
      h('section', { class: 'card soft' },
        rich('Для одних это молитва, для других — тишина и размышление. Практика добровольна; отсутствие «духовного переживания» не значит, что вы недостаточно стараетесь.'),
        h('p', null, h('a', { href: '#/step/11' }, 'Шаг 11: вопросы и заметки')))
    ];
  }

  function svgEl(tag, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    for (var i = 2; i < arguments.length; i++) el.appendChild(arguments[i]);
    return el;
  }

  var audioCtx = null;
  function primeAudio() {
    try {
      var A = window.AudioContext || window.webkitAudioContext;
      if (A && !audioCtx) audioCtx = new A();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { audioCtx = null; }
  }
  function chime() {
    if (!audioCtx) return;
    try {
      [0, 0.9].forEach(function (delay) {
        var t = audioCtx.currentTime + delay;
        var o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sine'; o.frequency.value = 528;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.25, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(t); o.stop(t + 1.7);
      });
    } catch (e) { /* звук необязателен */ }
  }

  /* ================= Ещё и справка ================= */

  function viewMore() {
    return [
      h('ul', { class: 'menu' },
        h('li', null, h('a', { href: '#/check' }, 'Поддержка или давление?', h('span', { class: 's' }, 'Самопроверка по 10 критериям'))),
        h('li', null, h('a', { href: '#/pause' }, 'Пауза', h('span', { class: 's' }, 'Таймер для шага 11')))),
      h('h3', { style: 'margin-top:20px' }, 'Важно знать'),
      h('ul', { class: 'menu' }, C.info.map(function (i) {
        return h('li', null, h('a', { href: '#/info/' + i.id }, i.title, h('span', { class: 's' }, i.lead)));
      })),
      h('h3', { style: 'margin-top:20px' }, 'Приложение'),
      h('ul', { class: 'menu' },
        h('li', null, h('a', { href: 'research.html' }, 'Полный текст исследования', h('span', { class: 's' }, 'Работает без интернета'))),
        h('li', null, h('a', { href: '#/sources' }, 'Источники', h('span', { class: 's' }, C.sources.length + ' ссылок: документы, исследования, пресса, форумы'))),
        h('li', null, h('a', { href: '#/data' }, 'Мои данные', h('span', { class: 's' }, 'Резервная копия, восстановление, удаление'))),
        h('li', null, h('a', { href: '#/about' }, 'О приложении'))),
      introCard(),
      sosLink()
    ];
  }

  function introCard() {
    if (!window.Intro) return null;
    var cfg = window.Intro.settings();
    function toggle(key, label) {
      return h('label', { class: 'check-line' },
        h('input', { type: 'checkbox', checked: cfg[key], onchange: function (ev) { window.Intro.set(key, ev.target.checked); } }),
        h('span', null, label));
    }
    return h('section', { class: 'card stack', style: 'margin-top:20px' },
      h('h3', null, 'Вступление'),
      h('button', { class: 'btn block', type: 'button', onclick: function () { window.Intro.play(); } }, 'Посмотреть вступление'),
      toggle('auto', 'Показывать при запуске приложения'),
      toggle('sound', 'Со звуком'));
  }

  function viewInfo(item) {
    return [
      h('section', { class: 'card soft' }, h('p', null, h('strong', null, item.lead))),
      item.body.map(function (b) {
        return h('section', { class: 'card' }, h('h3', null, b[0]), rich(b[1]));
      })
    ];
  }

  function viewSources(code) {
    var groups = { 'О': 'Официальные документы', 'Н': 'Научные работы и медицинские руководства', 'М': 'Пресса и публицистика', 'Ф': 'Форумы и личные истории' };
    var out = [h('p', { class: 'small muted' }, 'Ссылки открываются в браузере и требуют интернета. Проверены 31.10.2026. Сообщения форумов — личный опыт, а не измерение частоты.')];
    Object.keys(groups).forEach(function (g) {
      out.push(h('h3', { style: 'margin-top:16px' }, groups[g]));
      out.push(h('ul', { class: 'sources' }, C.sources.filter(function (s) { return s[0].charAt(0) === g; }).map(function (s) {
        return h('li', { id: 'src-' + s[0], class: s[0] === code ? 'hl' : null },
          h('code', null, s[0]), s[1], h('br'),
          h('a', { href: s[2], target: '_blank', rel: 'noopener noreferrer', class: 'small' }, s[2].replace(/^https?:\/\/(www\.)?/, '').slice(0, 60) + '…'));
      })));
    });
    if (code) {
      setTimeout(function () {
        var el = document.getElementById('src-' + code);
        if (el) el.scrollIntoView({ block: 'center' });
      }, 0);
    }
    return out;
  }

  function viewData() {
    var reviews = Object.keys(state.reviews).length;
    var started = C.steps.filter(function (s) { return statusOf(s.n) !== 'todo'; }).length;
    var fileInp = h('input', { type: 'file', accept: 'application/json,.json', class: 'hidden', onchange: function () {
      var f = fileInp.files && fileInp.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () { importText(String(rd.result)); fileInp.value = ''; };
      rd.readAsText(f);
    } });

    return [
      storageOk ? null : h('section', { class: 'card warn' }, h('p', null, 'Хранилище недоступно: записи не сохраняются. Возможно, включён приватный режим браузера.')),
      h('section', { class: 'card stack' },
        h('h3', null, 'Где хранятся записи'),
        h('p', null, 'Только на этом устройстве, в памяти приложения. Ничего не отправляется в интернет, приложение работает без сети.'),
        h('p', { class: 'small muted' }, 'Шагов в работе или пройдено: ' + started + ' · записей вечернего обзора: ' + reviews + '.'),
        h('p', { class: 'small muted' }, 'Если удалить приложение или очистить его данные, записи пропадут. Делайте резервные копии.')),
      h('section', { class: 'card stack' },
        h('h3', null, 'Резервная копия'),
        h('p', { class: 'small' }, 'Файл содержит ваши записи в открытом виде. Храните его там, куда нет доступа посторонним.'),
        h('button', { class: 'btn primary block', type: 'button', onclick: exportBackup }, 'Сохранить резервную копию'),
        h('button', { class: 'btn block', type: 'button', onclick: copyBackup }, 'Скопировать как текст'),
        h('button', { class: 'btn block', type: 'button', onclick: function () { fileInp.click(); } }, 'Восстановить из файла'),
        h('button', { class: 'btn ghost block', type: 'button', onclick: pasteBackup }, 'Восстановить из текста'),
        fileInp),
      h('section', { class: 'card stack' },
        h('h3', null, 'Удаление'),
        h('button', { class: 'btn danger block', type: 'button', onclick: wipe }, 'Удалить все записи'))
    ];
  }

  function backupJson() {
    saveNow();
    return JSON.stringify({ app: '12-shagov', exportedAt: new Date().toISOString(), data: state }, null, 2);
  }

  function exportBackup() {
    var json = backupJson();
    var name = '12-shagov-' + today() + '.json';
    var P = cap && cap.Plugins;
    if (isNative && P && P.Filesystem && P.Share) {
      P.Filesystem.writeFile({ path: name, data: json, directory: 'CACHE', encoding: 'utf8' })
        .then(function (res) {
          return P.Share.share({ title: 'Резервная копия «12 шагов»', files: [res.uri], dialogTitle: 'Сохранить или отправить копию' });
        })
        .catch(function (e) {
          if (/cancel/i.test(String(e && e.message))) return;
          tell('Не получилось', 'Попробуйте «Скопировать как текст». Ошибка: ' + (e && e.message ? e.message : e));
        });
      return;
    }
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = h('a', { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function copyBackup() {
    var json = backupJson();
    function fallback() {
      var t = h('textarea', { value: json, rows: 8, readonly: true });
      tell('Скопируйте текст', h('div', null, h('p', { class: 'small' }, 'Выделите текст и скопируйте вручную.'), t));
      setTimeout(function () { t.focus(); t.select(); }, 50);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json).then(function () {
        tell('Скопировано', 'Резервная копия в буфере обмена. Вставьте её туда, где она будет в безопасности.');
      }, fallback);
    } else fallback();
  }

  function pasteBackup() {
    var t = h('textarea', { rows: 8, placeholder: 'Вставьте сюда текст резервной копии' });
    ask({ title: 'Восстановить из текста', body: h('div', null, t), ok: 'Восстановить' }).then(function (ok) {
      if (ok && t.value.trim()) importText(t.value);
    });
  }

  function importText(text) {
    var parsed;
    try { parsed = JSON.parse(text); } catch (e) { tell('Не получилось', 'Это не похоже на файл резервной копии.'); return; }
    var data = parsed && parsed.data ? parsed.data : parsed;
    if (!data || typeof data !== 'object' || typeof data.steps !== 'object') {
      tell('Не получилось', 'В файле нет записей приложения «12 шагов».');
      return;
    }
    ask({ title: 'Заменить текущие записи?', body: 'Все записи на этом устройстве будут заменены данными из копии.', ok: 'Заменить', danger: true }).then(function (ok) {
      if (!ok) return;
      state = normalize(data);
      saveNow();
      tell('Готово', 'Записи восстановлены.').then(function () { location.hash = '#/'; route(); });
    });
  }

  function wipe() {
    ask({ title: 'Удалить все записи?', body: 'Ответы, списки, дневник, счётчик и отметки будут удалены с этого устройства. Отменить это нельзя.', ok: 'Удалить всё', danger: true }).then(function (ok) {
      if (!ok) return;
      state = blank();
      try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
      journalDate = null;
      tell('Удалено', 'Все записи удалены.').then(function () { location.hash = '#/'; route(); });
    });
  }

  function viewAbout() {
    return [
      h('section', { class: 'card stack' },
        h('h3', null, 'Что это'),
        h('p', null, 'Личный офлайн-дневник для работы по 12 шагам. К каждому шагу — краткий пересказ, возможная польза и риски, «здоровое прочтение», опыт участников и вопросы для размышления.'),
        rich('Материалы взяты из обзора «12 шагов „Анонимных Наркоманов“: польза, критика и опыт участников» (31.10.2026): официальные документы АН, научные работы, пресса и форумы [Н1][Н4][О3].')),
      h('section', { class: 'card stack' },
        h('h3', null, 'Чем приложение не является'),
        h('p', null, 'Это не официальное приложение АН и не официальный текст шагов. Это не лечение и не замена врачу, психотерапевту или юристу.'),
        h('p', null, 'Оценки «что может помочь» и «чем может обернуться» — анализ возможностей, а не измеренный эффект отдельного шага.')),
      h('section', { class: 'card stack' },
        h('h3', null, 'Главный критерий'),
        h('p', null, 'Помощь должна расширять возможность жить, поддерживать отношения и получать подходящее лечение. Принадлежность к группе и точность её словаря сами по себе не исчерпывают восстановление.')),
      h('p', { class: 'small muted' }, 'Версия 1.0 · данные хранятся только на устройстве')
    ];
  }

  /* ================= старт ================= */

  if ('serviceWorker' in navigator && !isNative && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(function () { /* офлайн-режим необязателен */ });
  }

  route();
  if (window.Intro && window.Intro.settings().auto) window.Intro.play();
})();
