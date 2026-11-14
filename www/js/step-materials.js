/* Three encrypted content slots: book sources, step wording and workbook questions. */
(function(){'use strict';
var cache={},epoch=0,core=window.StepImportCore;
function el(tag,text){var node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;}
function button(label,action){var b=el('button',label);b.type='button';b.className='btn';b.onclick=action;return b;}
function link(label,href){var a=el('a',label);a.className='btn';a.href=href;return a;}
function field(label,input){var l=el('label');l.className='field';l.append(el('span',label),input);return l;}
function record(id){return cache[id]||core.record(null);}
async function load(vault,id){var version=epoch;var raw=await vault.get('materials:'+id);if(version===epoch&&vault.isOpen())cache[id]=core.record(raw);}
function forget(){epoch++;cache={};}
function questions(id,archive){var r=record(id);return archive?r.questions.concat(r.history.filter(function(q){return !r.questions.some(function(c){return c.id===q.id;});})):r.questions;}
function effective(id,pack){var r=record(id);var byId=new Map();pack.sources.concat(r.bundleSources||[]).forEach(function(s){byId.set(s.id,s);});return Object.assign({},pack,{wording:r.wording||pack.wording,sources:Array.from(byId.values()),ownerBundle:r.bundle?Object.assign({},r.bundle,{questionCount:r.questions.length}):null});}
function confirm(root,message){return new Promise(function(resolve){var d=el('dialog');d.className='dialog';d.append(el('p',message));function finish(v){d.close();d.remove();resolve(v);}d.append(button('Отмена',function(){finish(false);}),button('Удалить',function(){finish(true);}));d.addEventListener('cancel',function(e){e.preventDefault();finish(false);});root.append(d);d.showModal();});}
async function put(ctx,next){var version=epoch;if(!ctx.vault||!ctx.vault.isOpen())throw Error('Тетрадь закрыта. Открой её и повтори сохранение.');await ctx.vault.put('materials:'+ctx.id,next);if(version!==epoch||!ctx.vault.isOpen())throw Error('Тетрадь закрылась. Материалы будут видны после разблокировки.');cache[ctx.id]=next;}
function render(root,ctx){
 root.append(el('h3','Загрузить материалы в '+ctx.pack.step.title),el('p','Выбери, что добавляешь. Каждый текст попадёт в своё место: книга — в Источники, формулировка — на главный экран, вопросы — в Тетрадь. Всё остаётся на этом устройстве.'));
 if(!ctx.vault||!ctx.vault.isOpen()){
  root.append(el('p','Сначала создай или открой защищённую Тетрадь. После этого материалы будут сохраняться между запусками.'));
  if(window.StepJournal)StepJournal.render(root,Object.assign({},ctx,{item:''}));return;
 }
 if(window.StepBundle)StepBundle.renderImporter(root,Object.assign({},ctx,{install:async function(bundle){
  var r=record(ctx.id),next=Object.assign({},r),history=r.history.concat(r.questions);
  next.history=history.filter(function(q,i){return history.findIndex(function(v){return v.id===q.id;})===i;});if(next.history.length>10000)throw Error('История вопросов слишком велика');
  next.wording=bundle.wording;next.questionsText=bundle.questionsText;next.questions=bundle.questions;next.bundleSources=bundle.sources;next.bundle=bundle.meta;
  await put(ctx,next);
 }}));
 var status=el('p');status.setAttribute('role','status');root.append(status);
 var slots=[{id:'sources',name:'Оригиналы книг',place:'Источники',detail:'Добавь нужный раздел книги. Можно загрузить несколько источников.',save:'Сохранить книгу в Источниках'},{id:'wording',name:'Формулировка шага',place:'Главный экран шага',detail:'Один короткий фрагмент. Например, готовый файл step.md.',save:'Сохранить формулировку'},{id:'questions',name:'Вопросы из литературы',place:'Тетрадь',detail:'Нумерованный список. Для группировки добавь заголовки тем, например «# Отрицание».',save:'Сохранить вопросы в Тетради'}];
 var countLabels={};
 var editor=el('div');editor.className='material-editor';
 slots.forEach(function(slot,index){var card=el('section');card.className='card material-slot';var r=record(ctx.id),count=slot.id==='sources'?new Set(ctx.pack.sources.concat(ctx.imports).map(function(s){return s.id;})).size:slot.id==='wording'?(r.wording||ctx.pack.wording?1:0):questions(ctx.id,false).length;
  var countLabel=el('p',count?'Добавлено: '+count:'Пока пусто');countLabels[slot.id]=countLabel;
  card.append(el('small','0'+(index+1)+' · '+slot.place),el('h4',slot.name),el('p',slot.detail),countLabel,button('Добавить '+(slot.id==='sources'?'книгу':slot.id==='wording'?'формулировку':'вопросы'),function(){showEditor(slot);}));root.append(card);
 });
 root.append(editor);
 var list=el('section');list.className='material-list';function refreshList(){list.replaceChildren();list.append(el('h4','Добавленные книги'));
 Array.from(new Map(ctx.pack.sources.concat(ctx.imports).map(function(s){return [s.id,s];})).values()).forEach(function(s){var row=el('div');row.append(link(s.title,ctx.path(ctx.id,'sources',s.id)));if(s.persisted)row.append(button('Удалить книгу',async function(){if(!await confirm(root,'Удалить «'+s.title+'»? Записи Тетради не удаляются.'))return;try{await ctx.vault.remove('source:'+s.id);ctx.imports.splice(ctx.imports.indexOf(s),1);window.dispatchEvent(new Event('hashchange'));}catch(e){status.textContent=e.message;}}));list.append(row);});}refreshList();root.append(list);var destination=el('div');root.append(destination);
 function showEditor(slot){
  editor.replaceChildren();var version=epoch,job=0,busy=false,origin=null;
  var heading=el('h4',slot.name+' → '+slot.place),note=el('p',slot.detail),input=el('input');input.type='file';input.accept='.pdf,.epub,.md,.txt,application/pdf,application/epub+zip,text/plain,text/markdown';input.setAttribute('aria-label','Файл для '+slot.name);if(slot.id==='questions')input.accept='.md,.txt,text/plain,text/markdown';
  var title=el('input');title.type='text';title.maxLength=250;title.placeholder='Название книги и редакция';
  var topic=el('select');topic.append(new Option('Все темы шага',''));ctx.pack.step.topics.forEach(function(t){topic.append(new Option(t.title,t.id));});
  var from=el('input'),to=el('input');from.type=to.type='number';from.min=to.min='1';from.value='1';from.inputMode=to.inputMode='numeric';to.placeholder='До конца';
  var ranges=el('div');ranges.className='material-range';ranges.append(field('PDF: со страницы',from),field('PDF: по страницу',to),el('p','Это номера страниц файла PDF, включая обложку. Для TXT, MD и EPUB диапазон не используется.'));
  var area=el('textarea');area.rows=12;area.maxLength=core.limit;area.setAttribute('aria-label','Предпросмотр текста');area.placeholder=slot.id==='questions'?'# Отрицание\n\n1. Твой вопрос\n2. Следующий вопрос':'Вставь текст сюда или прочитай выбранный файл';
  var feedback=el('p');feedback.setAttribute('role','status');var read=button('Прочитать выбранный файл',async function(){
   var file=input.files[0];if(!file){feedback.textContent='Сначала выбери файл';return;}if(slot.id==='questions'&&!/\.(md|txt)$/i.test(file.name)){feedback.textContent='Для вопросов выбери Markdown или TXT с нумерованным списком. Книги PDF и EPUB загружай в Источники.';return;}var token=++job;busy=true;read.disabled=submit.disabled=true;feedback.textContent='Читаю файл на устройстве…';
   try{var result=await StepFileReader.read(file,{from:from.value,to:to.value},function(message){if(token===job&&root.isConnected)feedback.textContent=message;});if(token!==job||version!==epoch||!root.isConnected)return;origin={filename:result.filename,format:result.format,pages:result.pages||null};area.value=result.text;if(slot.id==='questions'){var qs=core.questions(result.text);feedback.textContent='Найдено вопросов: '+qs.length;}
    if(slot.id==='sources'){try{var parsed=StepCore.parseSource(result.text,'preview');title.value=parsed.title==='Мой источник'?file.name.replace(/\.[^.]+$/,''):parsed.title;}catch(e){title.value=file.name.replace(/\.[^.]+$/,'');}}
    feedback.textContent=result.notice+' Проверь текст и нажми «'+slot.save+'».';
   }catch(e){if(token===job&&root.isConnected)feedback.textContent=e.name==='PasswordException'?'PDF защищён паролем. Добавь доступный текстовый файл.':e.message;}finally{if(token===job){busy=false;read.disabled=submit.disabled=false;}}
  });
  input.onchange=function(){++job;busy=false;read.disabled=submit.disabled=false;area.value='';origin=null;feedback.textContent=input.files.length?'Файл выбран. Укажи страницы PDF при необходимости и нажми «Прочитать выбранный файл».':'';};
  var submit=button(slot.save,async function(){if(busy)return;if(version!==epoch||!ctx.vault.isOpen()){feedback.textContent='Сначала открой Тетрадь.';return;}busy=true;submit.disabled=true;
   try{
    var text=core.text(area.value),r=record(ctx.id),next=Object.assign({},r);
    if(slot.id==='sources'){
     var source=StepCore.parseSource(text,'import-'+Date.now()+'-'+core.fingerprint(text));source.title=title.value.trim()||source.title;source.section=source.section||(origin?origin.filename:'Добавлено вручную');if(topic.value){source.topics=[topic.value];source.paragraphs.forEach(function(p){p.topics=[topic.value];});}
     if(ctx.pack.sources.concat(ctx.imports).some(function(s){return s.id===source.id;}))throw Error('Книга с таким id уже добавлена. Прочитай её в Источниках или удали старую копию перед повторной загрузкой.');
     source.origin=origin;await ctx.vault.put('source:'+source.id,source);if(version!==epoch||!ctx.vault.isOpen())return;source.persisted=true;ctx.imports.push(source);
    }else if(slot.id==='wording'){
     if(text.length>4000)throw Error('Для формулировки нужен короткий фрагмент, не вся книга. Оставь не больше 4000 знаков.');next.wording=text;await put(ctx,next);
    }else{
     next.questions=core.questions(text);next.questionsText=text;var archived=r.history.concat(r.questions);next.history=archived.filter(function(q,i){return archived.findIndex(function(x){return x.id===q.id;})===i;});if(next.history.length>10000)throw Error('История вопросов слишком велика');await put(ctx,next);
    }
    if(version!==epoch||!root.isConnected)return;countLabels[slot.id].textContent='Добавлено: '+(slot.id==='sources'?new Set(ctx.pack.sources.concat(ctx.imports).map(function(s){return s.id;})).size:slot.id==='wording'?1:record(ctx.id).questions.length);status.textContent='Сохранено: '+slot.name+' → '+slot.place+'.';area.value='';input.value='';feedback.textContent='Материал добавлен. Он будет доступен после перезапуска и разблокировки Тетради.';refreshList();destination.replaceChildren(link('Открыть '+slot.place,ctx.path(ctx.id,slot.id==='wording'?'':slot.id==='questions'?'journal':'sources')));
   }catch(e){if(root.isConnected)feedback.textContent=e.message;}finally{busy=false;submit.disabled=false;}
  });
  editor.append(heading,note,field('Выбрать файл с телефона',input),ranges,read,el('p','Или вставь текст вручную. Сохранение начнётся только после нажатия кнопки ниже.'));
  if(slot.id==='sources')editor.append(field('Название источника',title),field('Тема',topic));
  editor.append(field('Предпросмотр текста',area),feedback,submit,button('Закрыть предпросмотр',function(){job++;editor.replaceChildren();}));
  if(slot.id!=='sources'&&(slot.id==='wording'?record(ctx.id).wording:record(ctx.id).questions.length))editor.append(button('Убрать добавленный материал',async function(){if(!await confirm(root,'Убрать добавленный материал? Ответы Тетради не удаляются.'))return;var next=Object.assign({},record(ctx.id));if(slot.id==='wording')next.wording='';else{next.history=next.history.concat(next.questions);next.questions=[];next.questionsText='';}try{await put(ctx,next);window.dispatchEvent(new Event('hashchange'));}catch(e){feedback.textContent=e.message;}}));
  heading.tabIndex=-1;heading.focus();editor.scrollIntoView({block:'start',behavior:'auto'});
 }
}
window.StepMaterials={load:load,forget:forget,effective:effective,questions:questions,render:render};
})();
