(function(){'use strict';
function el(tag,text,cls){var n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function link(text,url){var a=el('a',text,'btn');a.href=url;return a;}
function renderImporter(root,ctx){
 var box=el('section',undefined,'bundle-loader card'),status=el('p');status.setAttribute('role','status');
 box.append(el('small','ОДИН ФАЙЛ · ВЕСЬ ШАГ'),el('h3','Загрузить готовый пакет'),el('p','Формулировка, книги и вопросы займут свои места автоматически. Выбери файл «Первый-шаг.step.json».'));
 var input=el('input');input.type='file';input.accept='.json,application/json';input.setAttribute('aria-label','Пакет шага одним файлом');var preview=el('div'),submit=el('button','Установить материалы шага','btn primary');submit.type='button';submit.hidden=true;
 var bundle=null,generation=0;
 input.onchange=async function(){var token=++generation;bundle=null;preview.replaceChildren();submit.hidden=true;status.textContent='';try{var file=input.files[0];if(!file)return;if(file.size>10000000)throw Error('Пакет должен быть не больше 10 МБ');var parsed=StepBundleCore.parse(await file.text(),ctx.id);if(token!==generation||!root.isConnected)return;bundle=parsed;
  preview.append(el('h4',parsed.meta.title+' · '+parsed.meta.subtitle),el('p',parsed.sources.length+' источника · '+parsed.questions.length+' вопросов · '+ctx.pack.step.topics.length+' тем'));
  var books=el('ul');parsed.sources.forEach(function(s){var li=el('li');li.append(el('strong',s.title),el('span',s.section));books.append(li);});preview.append(books,el('p','Ответы Тетради и отдельно добавленные книги сохранятся. Формулировка, вопросы и источники прежнего пакета будут заменены.'));submit.hidden=false;
 }catch(e){status.textContent=e.message;}};
 submit.onclick=async function(){if(!bundle)return;submit.disabled=true;input.disabled=true;status.textContent='Сохраняю пакет на устройстве…';try{await ctx.install(bundle);if(root.isConnected){location.hash=ctx.path(ctx.id,'');window.dispatchEvent(new Event('hashchange'));window.scrollTo(0,0);}}catch(e){if(root.isConnected){status.textContent=e.message;submit.disabled=false;input.disabled=false;}}};
 box.append(input,preview,status,submit);root.append(box);
}
function renderOverview(root,ctx){
 var pack=ctx.pack,loaded=!!pack.ownerBundle,b=pack.ownerBundle||{subtitle:'Точка отсчёта'};
 var hero=el('section',undefined,'bundle-hero cinematic-hero'+(loaded?'':' cinematic-empty'));
 ['cinematic-scene','cinematic-mist','cinematic-grain'].forEach(function(cls){var layer=el('div',undefined,cls);layer.setAttribute('aria-hidden','true');hero.append(layer);});
 var emblem=el('span','I','cinematic-emblem');emblem.setAttribute('aria-hidden','true');hero.append(emblem);
 var heading=el('div',undefined,'cinematic-heading');heading.append(el('div','ГЛАВА I · ПЕРВЫЙ ШАГ','bundle-kicker'),el('h2',b.subtitle));hero.append(heading);
 hero.append(el('p','Увидеть, где ты сейчас.\nНачать с одной честной страницы.','bundle-lead'));
 if(loaded){var facts=el('div',undefined,'bundle-facts');[[pack.sources.length,'источника'],[b.questionCount,'вопросов'],[pack.step.topics.length,'тем']].forEach(function(pair){var fact=el('span');fact.append(el('strong',String(pair[0])),el('small',pair[1]));facts.append(fact);});hero.append(facts);}
 var actions=el('div',undefined,'bundle-actions');
 var primary=link(loaded?'Открыть оригиналы':'Открыть тетрадь',ctx.path(ctx.id,loaded?'sources':'journal'));
 var arrow=el('span',undefined,'cinematic-arrow');arrow.setAttribute('aria-hidden','true');arrow.innerHTML='<svg viewBox="0 0 24 24" fill="none"><path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" stroke-width="1.3"/></svg>';primary.append(arrow);
 actions.append(primary,link(loaded?'Перейти к вопросам':'Загрузить материалы',ctx.path(ctx.id,loaded?'journal':'materials')));hero.append(actions);root.append(hero);
}
function renderLibrary(root,ctx){
 var pack=ctx.pack,b=pack.ownerBundle;if(!b)return;
 if(b.introduction&&b.introduction.length){var intro=el('section',undefined,'bundle-introduction');intro.append(el('small','ПУТЕВОДИТЕЛЬ ПО МАТЕРИАЛАМ · ТЕКСТ ПРИЛОЖЕНИЯ'));b.introduction.forEach(function(t){intro.append(el('p',t));});root.append(intro);}
 var shelf=el('section',undefined,'bundle-shelf');shelf.append(el('h3','Твоя библиотека Первого шага'));pack.sources.forEach(function(source,i){var a=link('',ctx.path(ctx.id,'sources',source.id));a.className='bundle-book-card';a.append(el('span',String(i+1).padStart(2,'0'),'bundle-book-index'),el('strong',source.title),el('small',source.section));if(source.editionStatus==='draft')a.append(el('span','Черновой источник','bundle-edition'));shelf.append(a);});root.append(shelf);
 var topics=el('section',undefined,'bundle-topics');topics.append(el('h3','Семь тем для твоих записей'));pack.step.topics.forEach(function(t,i){var a=link('',ctx.path(ctx.id,'journal',t.id));a.append(el('small','0'+(i+1)),el('strong',t.title));if(b.topicNotes&&b.topicNotes[t.id])a.append(el('span',b.topicNotes[t.id]));topics.append(a);});root.append(topics);
}

window.StepBundle={renderImporter:renderImporter,renderOverview:renderOverview,renderLibrary:renderLibrary};
})();
