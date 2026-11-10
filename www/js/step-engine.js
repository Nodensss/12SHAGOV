(function(){'use strict';
var C=window.StepCore,KEY='steps:reader:v1',prefs={};try{prefs=JSON.parse(localStorage.getItem(KEY))||{};}catch(e){}
function save(){try{localStorage.setItem(KEY,JSON.stringify(prefs));}catch(e){}}
function el(tag,text){var n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;}
function link(text,hash){var a=el('a',text);a.href=hash;a.className='btn';return a;}
function button(text,fn){var b=el('button',text);b.type='button';b.className='btn';b.onclick=fn;return b;}
function path(id,section,item){return '#/step/'+Number(id.slice(4))+'/'+section+(item?'/'+encodeURIComponent(item):'');}
function render(id,parts){
 var pack=window.STEP_PACKS&&window.STEP_PACKS[id],root=el('section');root.className='step-engine';
 if(!pack){root.append(el('p','Контент шага пока не установлен.'));return root;}C.validateStep(pack.step);
 var section=parts[2]||'',item=parts[3]||'',state=prefs[id]||(prefs[id]={visited:{},positions:{}});
 if(section){state.last=location.hash;state.visited[section]=true;save();}
 root.append(link('← Первый шаг','#/step/'+Number(id.slice(4))),el('h2',pack.step.title));
 var support=button('Мне сейчас тяжело',function(){var d=el('dialog');d.className='dialog';d.append(el('h2','Мне сейчас тяжело'),el('p','Тяга может меняться и ослабевать. Попробуй связаться с человеком, которому доверяешь, или дойти до своего собрания. Можно попросить кого-то побыть рядом.'),el('p','Свои контакты и собрания можно будет добавить на этапе настроек.'),button('Вернуться',function(){d.close();d.remove();}));root.append(d);d.addEventListener('cancel',function(){d.remove();});d.showModal();});support.className+=' step-support';root.append(support);
 if(!section){root.append(el('p',pack.wording||'Формулировка появится после добавления твоего контент-пака.'));if(state.last)root.append(link('Продолжить с того места',state.last));pack.step.sections.forEach(function(s){var card=el('article');card.className='card';card.append(el('h3',s.title),el('p',s.description),el('small',state.visited[s.id]?'Начато':'Можно открыть'),link('Открыть',path(id,s.id)));root.append(card);});return root;}
 if(section==='sources'){
  root.append(el('h3','Источники'));var imported=window.StepSourceSession||(window.StepSourceSession=[]),sources=pack.sources.concat(imported),source=sources.find(function(s){return s.id===item;});
  if(source){reader(root,source.paragraphs,source.title,state,source.id,pack.step);return root;}
  if(!sources.length)root.append(el('p','Пока нет добавленных источников. Остальной шаг работает без них.'),el('p','Добавь свой Markdown или TXT ниже. Для сборки владелец может положить файлы в content-pack/'+id+'/sources/ и выполнить npm run content:steps.'));
  var filter=el('select');filter.setAttribute('aria-label','Тема источников');filter.append(new Option('Все темы',''));pack.step.topics.forEach(function(t){filter.append(new Option(t.title,t.id));});root.append(filter);var list=el('div');root.append(list);
  function paint(){list.replaceChildren();sources.filter(function(s){return !filter.value||s.topics.includes(filter.value)||s.paragraphs.some(function(p){return p.topics.includes(filter.value);});}).forEach(function(s){list.append(link(s.title,path(id,'sources',s.id)),el('p',s.section));});}filter.onchange=paint;paint();
  var input=el('input');input.type='file';input.accept='.md,.txt,text/plain,text/markdown';input.setAttribute('aria-label','Добавить свой источник');var status=el('p');status.setAttribute('role','status');
  input.onchange=async function(){try{var f=input.files[0];if(!f)return;if(f.size>2000000)throw Error('Файл должен быть не больше 2 МБ');var parsed=C.parseSource(await f.text(),'import-'+Date.now());if(sources.some(function(s){return s.id===parsed.id;}))throw Error('Источник с таким id уже добавлен');imported.push(parsed);sources.push(parsed);paint();status.textContent='Текст доступен в этом сеансе. Постоянное зашифрованное хранение добавляется на этапе данных.';}catch(e){status.textContent=e.message;}};root.append(input,status);return root;
 }
 if(section==='explain'){
  root.append(el('p','Объяснение автора приложения, не литература АН'));var chapter=pack.chapters.find(function(c){return c.id===item;});
  if(chapter){reader(root,C.parseSource(chapter.text,chapter.id).paragraphs,chapter.text.split('\n')[0].replace(/^#+\s*/,''),state,chapter.id,pack.step);return root;}
  pack.chapters.forEach(function(c){root.append(link(c.text.split('\n')[0].replace(/^#+\s*/,''),path(id,'explain',c.id)));});root.append(el('p','Семь подробных глав будут добавлены при наполнении модуля.'));return root;
 }
 root.append(el('h3',section==='practice'?'Практика':'Тетрадь'),el('p','Раздел находится в разработке. Интерактивы и письменная работа добавляются следующими этапами.'));return root;
}
function reader(root,paragraphs,title,state,id,step){
 root.append(el('h3',title));var controls=el('div');controls.className='reader-settings';var size=el('input');size.type='range';size.min=17;size.max=30;size.value=prefs.font||20;size.setAttribute('aria-label','Размер шрифта');var spacing=el('input');spacing.type='range';spacing.min=1.4;spacing.max=2.3;spacing.step=.1;spacing.value=prefs.line||1.8;spacing.setAttribute('aria-label','Межстрочный интервал');controls.append(el('label','Размер текста'),size,el('label','Межстрочный интервал'),spacing);root.append(controls);var article=el('article');article.className='step-reader';root.append(article);
 function style(){article.style.fontSize=size.value+'px';article.style.lineHeight=spacing.value;prefs.font=Number(size.value);prefs.line=Number(spacing.value);save();}size.oninput=style;spacing.oninput=style;style();
 paragraphs.forEach(function(p){var block=el('section');block.id=p.id;var content=p.text,heading=content.match(/^#{1,3}\s+(.+)$/);var text=el(heading?'h3':'p'),cursor=0,re=/\[\[(practice|journal):([a-z0-9-]+)\]\]/g,m;if(heading)content=heading[1];while((m=re.exec(content))){text.append(document.createTextNode(content.slice(cursor,m.index)),link(m[1]==='practice'?'К практике':'К вопросам',path(step.id,m[1],m[2])));cursor=m.index+m[0].length;}text.append(document.createTextNode(content.slice(cursor)));block.append(text,link('Написать об этом',path(step.id,'journal','paragraph-'+p.id)));article.append(block);});
 var position=state.positions[id];if(position)requestAnimationFrame(function(){var n=document.getElementById(position);if(n)n.scrollIntoView();});
 var observer=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(entry.isIntersecting){state.positions[id]=entry.target.id;save();}});},{rootMargin:'-15% 0px -65% 0px'});Array.from(article.children).forEach(function(n){observer.observe(n);});var stop=new MutationObserver(function(){if(!root.isConnected){observer.disconnect();stop.disconnect();}});stop.observe(document.getElementById('view'),{childList:true});
}
window.StepEngine={render:render};
})();
