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
 var pack=ctx.pack,b=pack.ownerBundle;if(!b)return;
 var hero=el('section',undefined,'bundle-hero');hero.append(el('div','I / ТОЧКА ОТСЧЁТА','bundle-kicker'));
 var art=el('div',undefined,'bundle-book-art');art.setAttribute('aria-hidden','true');art.innerHTML='<svg viewBox="0 0 180 140" fill="none"><path d="M90 115C70 98 43 101 20 105V26C46 20 69 25 90 42c21-17 44-22 70-16v79c-23-4-50-7-70 10Z" stroke="currentColor" stroke-width="1.4"/><path d="M90 43v71M29 114c23-5 42-2 61 10 19-12 38-15 61-10M34 45c15-1 30 3 42 11M34 58c15-1 30 3 42 11M34 71c15-1 30 3 42 11M104 56c12-8 27-12 42-11M104 69c12-8 27-12 42-11M104 82c12-8 27-12 42-11" stroke="currentColor" opacity=".45"/><circle cx="90" cy="15" r="2" fill="currentColor"/><path d="M90 20v13" stroke="currentColor" opacity=".4"/></svg>';
 hero.append(art,el('h2',b.subtitle),el('p','Посмотреть на свой опыт. Найти опору. Начать писать.','bundle-lead'));
 var stats=el('div',undefined,'bundle-facts');[[pack.sources.length,'источника'],[b.questionCount,'вопросов'],[pack.step.topics.length,'тем']].forEach(function(pair){var fact=el('span');fact.append(el('strong',String(pair[0])),el('small',pair[1]));stats.append(fact);});hero.append(stats);
 var actions=el('div',undefined,'bundle-actions');actions.append(link('Открыть оригиналы',ctx.path(ctx.id,'sources')),link('Перейти к вопросам',ctx.path(ctx.id,'journal')));hero.append(actions);root.append(hero);
 if(b.introduction&&b.introduction.length){var intro=el('section',undefined,'bundle-introduction');intro.append(el('small','ПУТЕВОДИТЕЛЬ ПО МАТЕРИАЛАМ · ТЕКСТ ПРИЛОЖЕНИЯ'));b.introduction.forEach(function(t){intro.append(el('p',t));});root.append(intro);}
 var shelf=el('section',undefined,'bundle-shelf');shelf.append(el('h3','Твоя библиотека Первого шага'));pack.sources.forEach(function(source,i){var a=link('',ctx.path(ctx.id,'sources',source.id));a.className='bundle-book-card';a.append(el('span',String(i+1).padStart(2,'0'),'bundle-book-index'),el('strong',source.title),el('small',source.section));if(source.editionStatus==='draft')a.append(el('span','Черновой источник','bundle-edition'));shelf.append(a);});root.append(shelf);
 var topics=el('section',undefined,'bundle-topics');topics.append(el('h3','Семь тем для твоих записей'));pack.step.topics.forEach(function(t,i){var a=link('',ctx.path(ctx.id,'journal',t.id));a.append(el('small','0'+(i+1)),el('strong',t.title));if(b.topicNotes&&b.topicNotes[t.id])a.append(el('span',b.topicNotes[t.id]));topics.append(a);});root.append(topics);
}
window.StepBundle={renderImporter:renderImporter,renderOverview:renderOverview};
})();
