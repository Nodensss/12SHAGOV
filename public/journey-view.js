import { journeyStages, journeyFor, sessionPhases, getJourney, journeySummary } from './journey.js';

const phaseLabels = { intro: 'Знакомство', exercise: 'Практика', reflection: 'Размышление', takeaway: 'С собой' };

// All personal text passes through esc. This module only renders; app.js owns saving.
export function createJourneyRenderer({ steps, getState, esc: h, link, action, draftFor, field, options, exercise, questionBlock, sourceQuote, calendar }) {
  function landscape() {
    return '<div class="journey-landscape" aria-hidden="true"><svg viewBox="0 0 440 310" fill="none"><circle cx="330" cy="65" r="30" fill="#dfc995"/>' +
      '<path d="M0 220Q90 70 210 190T440 120V310H0Z" fill="#456c59"/><path d="M0 250Q120 170 240 240T440 175V310H0Z" fill="#719077"/>' +
      '<path d="M0 280Q170 200 310 275T440 250V310H0Z" fill="#92a68a"/><path d="M60 304C15 235 220 272 185 218S310 181 280 143 335 110 330 65" stroke="#f1e9cf" stroke-width="3" stroke-linecap="round" stroke-dasharray="3 9"/>' +
      [[72,280],[120,251],[185,218],[224,187],[280,143],[330,65]].map(([x,y],i)=>'<circle cx="'+x+'" cy="'+y+'" r="'+(i===5?8:5)+'" fill="#f1e9cf"/>').join('') +
      '<path d="M60 190V159M44 178l16-29 16 29M365 195v-39m-18 26 18-36 18 36" stroke="#b9c6a6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div>';
  }
  function map() {
    const state = getState();
    return '<nav class="journey-chapters" aria-label="Части пути"><button type="button" class="chapter-filter" data-journey-stage="all" aria-pressed="true">Весь путь</button>' + journeyStages.map((stage,index)=>
      '<button type="button" class="chapter-filter" data-journey-stage="'+h(stage.id)+'" aria-pressed="false">'+String(index+1).padStart(2,'0')+' · '+h(stage.title)+'</button>').join('') + '</nav><div class="journey-map">' +
      journeyStages.map((stage,index)=>'<section class="journey-chapter" data-stage="'+h(stage.id)+'"><header><div class="eyebrow">Часть '+String(index+1).padStart(2,'0')+' · шаги '+stage.steps[0]+'–'+stage.steps.at(-1)+'</div><h3>'+h(stage.title)+'</h3><p>'+h(stage.subtitle)+'</p></header><ol class="journey-trail">' + stage.steps.map(id=>{
        const s=steps.find(step=>step.id===id), d=state.drafts[id], journey=getJourney(d), meta=journeyFor(id);
        const current=state.lastStep===id, completed=!!journey.completedAt;
        const status=completed?'Сессия отмечена':d?.opened?'Продолжить · '+phaseLabels[journey.phase]:'Можно начать';
        return '<li><a class="journey-stop'+(current?' is-current':'')+(completed?' is-complete':'')+(d?.opened?' is-visited':'')+'" href="#step/'+id+'"'+(current?' aria-current="location"':'')+'><span class="journey-marker">'+String(id).padStart(2,'0')+'</span><span class="journey-stop-copy"><strong>'+h(meta.place)+'</strong><small>'+h(s.activityTitle)+'</small><span class="tiny">'+(completed?'✓ ':'')+h(status)+'</span>'+(state.bookmarks[id]?'<span class="tiny">В закладках</span>':'')+'</span><span class="journey-stop-icon" aria-hidden="true">'+h(meta.symbol)+'</span></a></li>';
      }).join('')+'</ol></section>').join('')+'</div>';
  }
  function collection() {
    const state=getState();
    const insights=steps.map(s=>({s,j:getJourney(state.drafts[s.id])})).filter(({j})=>j.takeaway.trim());
    if(!insights.length)return '';
    return '<section class="journey-collection content-card"><div class="section-heading"><h2>Беру с собой</h2>'+link('Все заметки →','#notes','text-link')+'</div><p class="tiny">Ваши слова из коротких сессий. К ним можно возвращаться.</p>'+insights.slice(-3).map(({s,j})=>'<article class="insight-card"><span class="tiny">Шаг '+s.id+' · '+h(s.name)+'</span><blockquote>'+h(j.takeaway)+'</blockquote>'+link('Вернуться к шагу →','#step/'+s.id,'text-link')+'</article>').join('')+'</section>';
  }
  function home() {
    const state=getState(), summary=journeySummary(state.drafts);
    let next=state.lastStep||1;
    if(getJourney(state.drafts[next]).completedAt) next=steps.find(s=>s.id>next&&!getJourney(state.drafts[s.id]).completedAt)?.id || steps.find(s=>!getJourney(state.drafts[s.id]).completedAt)?.id || 10;
    const s=steps.find(s=>s.id===next), j=getJourney(state.drafts[next]);
    return '<div class="page journey-home"><section class="journey-hero"><div class="journey-hero-copy"><div class="eyebrow">Свой путь · двенадцать шагов</div><h1 tabindex="-1">Большие перемены.<br>Маленькими шагами.</h1><p>Исследуйте, пробуйте, замечайте своё. Впереди — двенадцать разных практик. Темп выбираете вы.</p><div class="button-row">'+link(state.drafts[next]?.opened?'Продолжить шаг '+next+' →':'Начать шаг '+next+' →','#step/'+next,'button button-primary')+link('Открыть карту →','#steps','button button-quiet')+'</div><p class="tiny">'+h(s.activityTitle)+' · '+h(phaseLabels[j.phase])+'</p></div>'+landscape()+'</section>' +
      '<div class="journey-stats" aria-label="Личные отметки"><span><strong>'+summary.visited+'<small> / 12</small></strong>шагов открыто</span><span><strong>'+summary.completed+'</strong>сессий отмечено</span><span><strong>'+summary.insights+'</strong>личных выводов</span></div>' +
      '<div class="section-heading"><h2>Ваша карта пути</h2><span class="tiny">Каждый шаг открыт</span></div>'+map()+collection() +
      '<div class="home-foot-grid"><article class="soft-card"><span class="micro-icon" aria-hidden="true">◷</span><h3>Есть только одна минута?</h3><p>Выберите тихую практику и побудьте с собой.</p>'+link('Сделать паузу →','#step/11','text-link')+'</article><article class="soft-card"><span class="micro-icon" aria-hidden="true">▤</span><h3>Ваше личное пространство</h3><p>Заметки и открытия сохраняются на этом устройстве. Защиту PIN можно включить в настройках.</p>'+link('Открыть мои заметки →','#notes','text-link')+'</article></div></div>';
  }
  function stepsPage(heading) {
    return '<div class="page journey-home">'+heading('Двенадцать шагов. Ваш маршрут.','Можно идти по порядку, возвращаться к знакомому или открыть то, что нужно сегодня.','Карта пути')+map()+'</div>';
  }
  function session(id) {
    const state=getState(), s=steps.find(s=>s.id===id), d=draftFor(id), j=getJourney(d), meta=journeyFor(id), index=sessionPhases.indexOf(j.phase);
    let body='';
    if(j.phase==='intro') body='<section class="content-card"><div class="eyebrow">Сначала — немного смысла</div><h2 id="session-heading" tabindex="-1">Смысл шага</h2><p class="intro-copy">'+h(s.intro)+'</p><div class="story-box"><h3>Представьте ситуацию</h3><p>'+h(s.story)+'</p><span class="tiny">Вымышленный пример для размышления</span></div><div class="reading-controls">'+action('▶ Слушать введение','speak','button button-quiet button-small')+action('Пауза / продолжить','speech-pause','button button-quiet button-small')+action('Остановить','speech-stop','button button-quiet button-small')+'</div><p class="tiny" id="audio-status" aria-live="polite">Введение можно послушать локальным голосом устройства.</p></section>';
    if(j.phase==='exercise') body='<section class="activity-card"><div class="eyebrow">Попробовать · 3–5 минут</div><h2 id="session-heading" tabindex="-1">'+h(s.activityTitle)+'</h2><p class="activity-intro">'+h(s.activityIntro)+'</p><p class="session-prompt">'+h(meta.invitation)+'</p>'+(id===7?'<p class="field-label">Формат практики</p>'+options('practiceMode',['Написать','Тихая практика']):'')+'<div class="activity-area">'+exercise(id)+'</div>'+(id===1?'<p class="field-label">Что повторялось?</p>'+options('consequences',['Менял(а) обещания','Уставал(а)','Терял(а) выбор','Просил(а) поддержки'],true):'')+'<p class="tiny">Можно взять вымышленный пример, оставить поля пустыми или перейти дальше.</p></section>';
    if(j.phase==='reflection') body='<section class="content-card"><div class="eyebrow">Замедлиться и заметить</div><h2 id="session-heading" tabindex="-1">Что откликается вам?</h2><p class="tiny">Ответьте на один вопрос, на несколько или просто подумайте. Пропуск тоже возможен.</p><div class="question-list">'+s.questions.map(questionBlock).join('')+'</div>'+field('Что хочется взять на разговор с доверенным человеком?','discussion','Личная заметка. Она никому не отправляется.')+'</section>';
    if(j.phase==='takeaway') body='<section class="content-card takeaway-card"><span class="takeaway-symbol" aria-hidden="true">'+h(meta.symbol)+'</span><div class="eyebrow">Маленькое открытие</div><h2 id="session-heading" tabindex="-1">Что вы берёте с собой?</h2><p>'+h(meta.takeaway)+'</p><div class="field"><label for="journey-takeaway">Мой вывод · по желанию</label><textarea id="journey-takeaway" data-journey-takeaway maxlength="10000" placeholder="Одной мысли достаточно. Можно ничего не записывать.">'+h(j.takeaway)+'</textarea></div>'+(j.completedAt?'<div class="completion-note" role="status" tabindex="-1"><strong>✓ Сессия отмечена</strong><p>Вы уделили себе время. К этому шагу можно возвращаться столько, сколько нужно.</p></div>':'')+action(j.completedAt?'Сохранить сессию ещё раз':'Завершить эту сессию','journey-complete','button button-primary')+'<div class="next-preview"><div class="eyebrow">'+(id===12?'Путь продолжается':'Когда будете готовы')+'</div><p>'+h(meta.nextHint)+'</p>'+link(id===12?'Вернуться к карте →':'Исследовать шаг '+(id+1)+' →',id===12?'#steps':'#step/'+(id+1),'button button-secondary')+'</div></section>';
    const phaseButton=(phase,text,cls='button button-secondary')=>'<button type="button" class="'+cls+'" data-phase="'+phase+'">'+h(text)+'</button>';
    return '<div class="page journey-session"><header class="journey-session-head"><div><div class="eyebrow">Шаг '+String(id).padStart(2,'0')+' · '+h(s.verb)+'</div><h1 tabindex="-1">'+h(meta.place)+'</h1><p>'+h(s.short)+'</p></div><span class="journey-emblem" aria-hidden="true">'+h(meta.symbol)+'</span></header>'+
      '<div class="session-toolbar"><div class="button-row">'+link('← Карта пути','#steps','text-link')+action('Весь шаг на одной странице','journey-full','text-link')+'</div>'+action(state.bookmarks[id]?'✓ В закладках':'В закладки','bookmark','button button-quiet button-small','aria-pressed="'+!!state.bookmarks[id]+'"')+'</div>'+
      '<nav class="session-track" aria-label="Этапы короткой сессии">'+sessionPhases.map((phase,i)=>'<button type="button" data-phase="'+phase+'"'+(phase===j.phase?' aria-current="step"':'')+' class="'+(j.visited.includes(phase)?'is-visited':'')+'"><span class="phase-index" aria-hidden="true">'+(j.visited.includes(phase)&&phase!==j.phase?'✓':String(i+1).padStart(2,'0'))+'</span><span>'+phaseLabels[phase]+'</span></button>').join('')+'</nav>'+
      '<div class="session-content">'+body+'</div><div class="session-footer"><div class="button-row">'+(index>0?phaseButton(sessionPhases[index-1],'← Назад','button button-quiet'):'')+(index<3?phaseButton(sessionPhases[index+1],['К практике →','К размышлению →','Взять с собой →'][index],'button button-primary'):'')+action('Сохранить и сделать паузу','pause','button button-quiet')+'</div><p class="draft-status" role="status">Сохранено на устройстве</p></div>'+
      '<details class="session-resources content-card"><summary>Источники и текст шага</summary><p class="tiny">Введение, ситуации, вопросы и приглашения написаны для приложения.</p>'+sourceQuote(id)+(id<=3?'<p>'+action('Читать авторский конспект →','summary','button button-quiet','data-id="'+id+'"')+'</p>':'')+'</details>'+(id===10?calendar():'')+'<div class="button-row">'+action('Мои контакты поддержки','support','text-link')+action('Удалить записи шага','delete-step','text-link')+'</div><p class="tiny">Это личная практика, а не оценка прохождения программы. Можно остановиться в любой момент.</p></div>';
  }
  return { home, map, stepsPage, session };
}
