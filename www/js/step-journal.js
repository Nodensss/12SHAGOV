/* Тетрадь шага: записи по темам, абзацам и вопросам. Всё хранится только в зашифрованном хранилище. */
(function () {
  'use strict';
  var C = window.StepCore, J = C.journal;
  var cache = {};          // stepId -> данные тетради, пока хранилище открыто
  var pending = new Set(); // отложенные автосохранения
  var chain = Promise.resolve();

  function el(tag, text, cls) {
    var n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }
  function button(text, fn, cls) {
    var b = el('button', text, 'btn' + (cls ? ' ' + cls : ''));
    b.type = 'button';
    b.onclick = fn;
    return b;
  }
  function link(text, hash) {
    var a = el('a', text, 'btn');
    a.href = hash;
    return a;
  }
  function field(label, input) {
    var l = el('label', undefined, 'field');
    l.append(el('span', label), input);
    return l;
  }
  function password(autocomplete) {
    var i = el('input');
    i.type = 'password';
    i.autocomplete = autocomplete;
    return i;
  }
  function snippet(text) {
    text = text.replace(/\s+/g, ' ').trim();
    return text.length > 90 ? text.slice(0, 90) + '…' : text;
  }
  function when(ms) {
    return ms ? new Date(ms).toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  }
  function confirmDialog(root, title, body, okLabel) {
    return new Promise(function (resolve) {
      var d = el('dialog', undefined, 'dialog'), actions = el('div', undefined, 'dialog-actions');
      function done(v) { d.close(); d.remove(); resolve(v); }
      actions.append(button('Отмена', function () { done(false); }, 'ghost'), button(okLabel, function () { done(true); }, 'danger'));
      d.append(el('h2', title), el('p', body), actions);
      d.addEventListener('cancel', function (e) { e.preventDefault(); done(false); });
      root.append(d);
      d.showModal();
    });
  }

  function persist(vault, stepId) {
    var data = cache[stepId];
    chain = chain.then(function () { return vault.put('journal:' + stepId, data); });
    var result = chain;
    chain = chain.catch(function () { /* ошибка показана у поля, очередь продолжает работать */ });
    return result;
  }
  async function load(vault, stepId) {
    if (!cache[stepId]) cache[stepId] = J.normalize(await vault.get('journal:' + stepId));
    return cache[stepId];
  }
  /* Дописывает отложенные изменения. Вызывается перед блокировкой и при уходе приложения в фон. */
  function flush() {
    Array.from(pending).forEach(function (job) { job.run(); });
    return chain;
  }
  function forget() {
    pending.forEach(function (job) { clearTimeout(job.timer); });
    pending.clear();
    cache = {};
  }

  /* Что означает цель записи: тема, абзац источника, вопрос из пака или свой вопрос. */
  function describe(target, ctx, data) {
    var topic = ctx.pack.step.topics.find(function (t) { return t.id === target; });
    if (topic) return { title: 'Тема: ' + topic.title };
    if (target.startsWith('paragraph-')) {
      var pid = target.slice(10), found = null;
      ctx.pack.sources.concat(ctx.imports).forEach(function (s) {
        var p = s.paragraphs.find(function (x) { return x.id === pid; });
        if (p) found = { title: 'К абзацу: ' + s.title, quote: p.text, from: ctx.path(ctx.id, 'sources', s.id) };
      });
      ctx.pack.chapters.forEach(function (c) {
        if (found) return;
        var p = C.parseSource(c.text, c.id).paragraphs.find(function (x) { return x.id === pid; });
        if (p) found = { title: 'К абзацу разбора', quote: p.text, from: ctx.path(ctx.id, 'explain', c.id) };
      });
      return found || { title: 'К абзацу', missing: 'Текст абзаца сейчас недоступен: источник удалён или не загружен.' };
    }
    if (target.startsWith('lit-')) {
      var lq = questions(ctx.pack, true).find(function (q) { return 'lit-' + q.id === target; });
      return lq ? { title: 'Вопрос из моего пака', quote: lq.text } : null;
    }
    var own = data.questions.find(function (q) { return q.id === target; });
    return own ? { title: 'Мой вопрос', quote: own.text } : null;
  }
  function questions(pack, archive) {
    var bundled=[];
    if(pack.literatureQuestions)try{bundled=C.parseSource(pack.literatureQuestions,'questions').paragraphs;}catch(e){}
    return bundled.concat(window.StepMaterials?StepMaterials.questions(pack.step.id,archive):[]);
  }

  function render(root, ctx) {
    var box = el('div', undefined, 'step-journal');
    root.append(el('h3', 'Тетрадь'), box);
    var vault = ctx.vault;
    if (!vault) { box.append(el('p', 'Зашифрованное хранилище недоступно, поэтому записи не сохраняются.')); return; }
    vault.state().then(function (state) {
      if (!root.isConnected) return;
      if (state === 'unsupported') box.append(el('p', 'В этом окружении нет шифрования (нужен защищённый контекст). Тетрадь не сохраняет записи без него.'));
      else if (state === 'none') viewCreate(box, vault);
      else if (state === 'locked') viewUnlock(box, root, vault);
      else return load(vault, ctx.id).then(function (data) { ctx.item ? viewTarget(box, root, ctx, data) : viewHome(box, root, ctx, data); });
    }).catch(function (e) { box.append(el('p', 'Не удалось открыть тетрадь: ' + e.message)); });
  }

  function viewCreate(box, vault) {
    var form = el('form', undefined, 'stack'), a = password('new-password'), b = password('new-password'), status = el('p');
    status.setAttribute('role', 'status');
    form.append(
      el('p', 'Записи тетради и добавленные источники шифруются на этом устройстве. Ключ получается из твоей фразы и нигде не сохраняется.'),
      el('p', 'Восстановить забытую фразу нельзя — можно только удалить тетрадь и начать заново. Чем длиннее фраза, тем надёжнее защита; короткий цифровой код подобрать легко.'),
      field('Фраза (не короче ' + window.StepVault.minPass + ' знаков)', a), field('Повтори фразу', b));
    var submit = el('button', 'Создать тетрадь', 'btn primary');
    form.append(submit, status);
    form.onsubmit = function (e) {
      e.preventDefault();
      if (a.value !== b.value) { status.textContent = 'Фразы не совпадают.'; return; }
      submit.disabled = true;
      status.textContent = 'Создаю ключ…';
      vault.create(a.value).catch(function (err) { submit.disabled = false; status.textContent = err.message; });
    };
    box.append(form);
  }

  function viewUnlock(box, root, vault) {
    var form = el('form', undefined, 'stack'), pass = password('current-password'), status = el('p');
    status.setAttribute('role', 'status');
    var submit = el('button', 'Открыть тетрадь', 'btn primary');
    form.append(el('p', 'Тетрадь закрыта. Введи свою фразу.'), field('Фраза', pass), submit, status);
    form.onsubmit = function (e) {
      e.preventDefault();
      submit.disabled = true;
      status.textContent = 'Проверяю…';
      vault.unlock(pass.value).then(function (ok) {
        if (ok) return;
        submit.disabled = false;
        status.textContent = 'Фраза не подошла.';
        pass.select();
      }).catch(function (err) { submit.disabled = false; status.textContent = err.message; });
    };
    box.append(form, button('Не помню фразу — удалить тетрадь', function () {
      confirmDialog(root, 'Удалить тетрадь?', 'Все записи тетради и сохранённые источники будут удалены с этого устройства. Отменить это нельзя.', 'Удалить всё').then(function (ok) { if (ok) vault.destroy(); });
    }, 'danger'));
  }

  function viewHome(box, root, ctx, data) {
    var counts = J.counts(data), journalPath = function (t) { return ctx.path(ctx.id, 'journal', t); };
    function item(text, target) {
      var n = counts[target];
      return link(text + (n ? ' · записей: ' + n : ''), journalPath(target));
    }
    function repaint() { box.replaceChildren(); viewHome(box, root, ctx, data); }

    var head = el('div', undefined, 'stack');
    head.append(el('p', 'Записи зашифрованы и хранятся только на этом устройстве. Тетрадь закроется сама через 5 минут без действий.'),
      button('Закрыть тетрадь', function () { flush().then(function () { ctx.vault.lock(); }); }));
    box.append(head);

    box.append(el('h4', 'По темам'));
    ctx.pack.step.topics.forEach(function (t) { box.append(item(t.title, t.id)); });

    var lit = questions(ctx.pack);
    if (lit.length) {
      box.append(el('h4', 'Вопросы из моего пака'));
      ctx.pack.step.topics.concat([{id:'',title:'Без темы'}]).forEach(function(topic){
        var group=lit.filter(function(q){return (q.topic||'')===topic.id;});
        if(group.length){box.append(el('h5',topic.title));group.forEach(function(q){box.append(item(snippet(q.text),'lit-'+q.id));});}
      });
    }

    var older=Object.keys(counts).filter(function(target){return target.startsWith('lit-')&&!lit.some(function(q){return target==='lit-'+q.id;});});
    if(older.length){box.append(el('h4','Ответы к прежним вопросам'));older.forEach(function(target){var info=describe(target,ctx,data);box.append(item(info?snippet(info.quote):'Сохранённый ответ',target));});}
    box.append(link('Загрузить вопросы из своего файла',ctx.path(ctx.id,'materials')));
    box.append(el('h4', 'Свои вопросы'));
    data.questions.forEach(function (q) {
      var row = el('div', undefined, 'journal-row');
      row.append(item(snippet(q.text), q.id), button('Удалить', function () {
        confirmDialog(root, 'Удалить вопрос?', 'Вопрос и ответы на него будут удалены.', 'Удалить').then(function (ok) {
          if (!ok) return;
          J.removeQuestion(data, q.id);
          persist(ctx.vault, ctx.id).then(repaint, function (e) { status.textContent = e.message; });
        });
      }, 'sm danger'));
      box.append(row);
    });
    var form = el('form', undefined, 'stack'), text = el('input'), topic = el('select'), status = el('p');
    text.type = 'text';
    text.maxLength = 500;
    status.setAttribute('role', 'status');
    topic.append(new Option('Без темы', ''));
    ctx.pack.step.topics.forEach(function (t) { topic.append(new Option(t.title, t.id)); });
    form.append(field('Новый вопрос', text), field('Тема', topic), el('button', 'Добавить вопрос', 'btn'), status);
    form.onsubmit = function (e) {
      e.preventDefault();
      try { J.addQuestion(data, text.value, topic.value, Date.now()); } catch (err) { status.textContent = err.message; return; }
      persist(ctx.vault, ctx.id).then(repaint, function (err) { status.textContent = err.message; });
    };
    box.append(form);

    var paragraphs = Object.keys(counts).filter(function (t) { return t.startsWith('paragraph-'); });
    if (paragraphs.length) {
      box.append(el('h4', 'Записи к абзацам'));
      paragraphs.forEach(function (t) {
        var d = describe(t, ctx, data);
        box.append(item(d.quote ? snippet(d.quote) : 'Абзац недоступен', t));
      });
    }
  }

  function viewTarget(box, root, ctx, data) {
    var target = ctx.item, info = /^[a-z0-9][a-z0-9-]{0,140}$/.test(target) ? describe(target, ctx, data) : null;
    box.append(link('← Тетрадь', ctx.path(ctx.id, 'journal')));
    if (!info) { box.append(el('p', 'Такой страницы в тетради нет.')); return; }
    box.append(el('h4', info.title));
    if (info.quote) box.append(el('blockquote', info.quote, 'journal-quote'));
    if (info.missing) box.append(el('p', info.missing));
    if (info.from) box.append(link('Открыть в тексте', info.from));

    var list = el('div', undefined, 'stack');
    function editor(entry) {
      var card = el('section', undefined, 'journal-entry'), area = el('textarea'), meta = el('small'), status = el('small');
      var id = entry ? entry.id : null;
      status.setAttribute('role', 'status');
      area.value = entry ? entry.text : '';
      area.maxLength = 100000;
      area.placeholder = 'Пиши здесь. Сохраняется само.';
      area.setAttribute('aria-label', entry ? 'Запись от ' + when(entry.created) : 'Новая запись');
      meta.textContent = entry ? when(entry.created) + (entry.updated > entry.created ? ' · изменено ' + when(entry.updated) : '') : 'Новая запись';
      var job = { timer: 0, run: function () {
        clearTimeout(job.timer);
        pending.delete(job);
        try { id = J.save(data, target, id, area.value, Date.now()); } catch (e) { status.textContent = e.message; return; }
        remove.hidden = !id;
        if (id && !entry && meta.textContent === 'Новая запись') meta.textContent = when(Date.now());
        persist(ctx.vault, ctx.id).then(function () { status.textContent = id ? 'Сохранено' : ''; }, function (e) { status.textContent = 'Не сохранено: ' + e.message; });
      } };
      area.oninput = function () {
        status.textContent = '';
        clearTimeout(job.timer);
        pending.add(job);
        job.timer = setTimeout(job.run, 500);
      };
      var remove = button('Удалить запись', function () {
        confirmDialog(root, 'Удалить запись?', 'Запись будет удалена. Отменить это нельзя.', 'Удалить').then(function (ok) {
          if (!ok) return;
          clearTimeout(job.timer);
          pending.delete(job);
          if (id) J.remove(data, id);
          persist(ctx.vault, ctx.id).then(function () { card.remove(); }, function (e) { status.textContent = 'Не удалено: ' + e.message; });
        });
      }, 'sm danger');
      remove.hidden = !id;
      var foot = el('div', undefined, 'journal-row');
      foot.append(status, remove);
      card.append(meta, area, foot);
      return card;
    }
    var entries = J.entries(data, target);
    box.append(button('Новая запись', function () {
      var card = editor(null);
      list.prepend(card);
      card.querySelector('textarea').focus();
    }), list);
    if (!entries.length) list.append(editor(null));
    entries.forEach(function (e) { list.append(editor(e)); });
  }

  window.StepJournal = { render: render, flush: flush, forget: forget };
})();
