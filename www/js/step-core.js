(function(root,factory){var api=factory();if(typeof module==='object')module.exports=api;else root.StepCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
var TOPICS=['addiction','denial','bottom','powerlessness','unmanageability','reservations','surrender'];
function parseSource(text,fallback){
 if(typeof text!=='string'||text.length>2000000)throw Error('Текст должен быть не больше 2 МБ');
 text=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
 var meta={id:fallback||'import',title:'Мой источник',section:'',order:0,topics:[]};
 if(text.startsWith('---\n')){
  var end=text.indexOf('\n---\n',4);if(end<0)throw Error('Не закрыт блок метаданных');
  text.slice(4,end).split('\n').forEach(function(line){
   if(!line.trim())return;var m=line.match(/^(id|title|section|order|topics):\s*(.*?)\s*$/);if(!m)throw Error('Неизвестное поле метаданных');
   var k=m[1],v=m[2];
   if(k==='topics'){if(!/^\[.*\]$/.test(v))throw Error('topics должен быть списком');meta.topics=v.slice(1,-1).split(',').map(function(s){return s.trim().replace(/^["']|["']$/g,'');}).filter(Boolean);}
   else if(k==='order'){meta.order=Number(v);if(!Number.isFinite(meta.order))throw Error('Некорректный order');}
   else meta[k]=v.replace(/^["']|["']$/g,'');
  });text=text.slice(end+5);
 }
 if(!/^[a-z0-9][a-z0-9-]{0,99}$/.test(meta.id))throw Error('Некорректный id источника');
 if(meta.topics.some(function(t){return !TOPICS.includes(t);}))throw Error('Неизвестная тема');
 var topic=null,index=0;
 meta.paragraphs=text.split(/\n\s*\n/).flatMap(function(block){
  var marker=block.match(/<!--\s*topic:\s*([a-z-]+)\s*-->/);if(marker){topic=marker[1];if(!TOPICS.includes(topic))throw Error('Неизвестная тема абзаца');}
  block=block.replace(/<!--\s*topic:\s*[a-z-]+\s*-->/g,'').trim();
  return block?[{id:meta.id+'-p'+(++index),text:block,topics:topic?[topic]:meta.topics.slice()}]:[];
 });return meta;
}
function validateStep(step){
 if(!step||!/^step\d{2}$/.test(step.id)||typeof step.title!=='string')throw Error('Некорректный шаг');
 if(!Array.isArray(step.topics)||step.topics.length!==7||new Set(step.topics.map(function(t){return t.id;})).size!==7)throw Error('Нужны семь уникальных тем');
 step.topics.forEach(function(t){if(!TOPICS.includes(t.id)||typeof t.title!=='string')throw Error('Некорректная тема');});
 if(!Array.isArray(step.sections)||step.sections.some(function(s){return !['sources','explain','practice','journal'].includes(s.id);})||new Set(step.sections.map(function(s){return s.id;})).size!==4)throw Error('Нужны четыре раздела');return step;
}
/* Модель тетради: записи привязаны к цели (тема, абзац, вопрос), у цели может быть несколько записей. */
var TARGET=/^[a-z0-9][a-z0-9-]{0,140}$/,MAX_ENTRY=100000,MAX_QUESTION=500;
function journalBlank(){return {v:1,seq:0,entries:[],questions:[]};}
function journalNormalize(raw){
 var data=journalBlank();if(!raw||typeof raw!=='object')return data;
 if(Array.isArray(raw.entries))raw.entries.forEach(function(e){if(e&&typeof e.id==='string'&&typeof e.text==='string'&&TARGET.test(e.target)&&e.text.trim()&&e.text.length<=MAX_ENTRY)data.entries.push({id:e.id,target:e.target,text:e.text,created:Number(e.created)||0,updated:Number(e.updated)||Number(e.created)||0});});
 if(Array.isArray(raw.questions))raw.questions.forEach(function(q){if(q&&/^q-\d+$/.test(q.id)&&typeof q.text==='string'&&q.text.trim()&&q.text.length<=MAX_QUESTION)data.questions.push({id:q.id,text:q.text,topic:TOPICS.includes(q.topic)?q.topic:'',created:Number(q.created)||0});});
 data.seq=Math.max(Number(raw.seq)||0,0);
 data.entries.concat(data.questions).forEach(function(x){var n=Number(String(x.id).replace(/^\D+/,''));if(n>data.seq)data.seq=n;});
 return data;
}
/* Пустой текст удаляет запись. Возвращает id записи или null. */
function journalSave(data,target,id,text,now){
 if(!TARGET.test(target))throw Error('Некорректная цель записи');
 if(typeof text!=='string'||text.length>MAX_ENTRY)throw Error('Запись слишком длинная');
 var entry=id?data.entries.find(function(e){return e.id===id;}):null;
 if(!text.trim()){if(entry)data.entries.splice(data.entries.indexOf(entry),1);return null;}
 if(entry){if(entry.text!==text){entry.text=text;entry.updated=now;}return entry.id;}
 entry={id:'e'+(++data.seq),target:target,text:text,created:now,updated:now};data.entries.push(entry);return entry.id;
}
function journalRemove(data,id){data.entries=data.entries.filter(function(e){return e.id!==id;});}
function journalEntries(data,target){return data.entries.filter(function(e){return e.target===target;}).sort(function(a,b){return b.created-a.created||(a.id<b.id?1:-1);});}
function journalCounts(data){var c={};data.entries.forEach(function(e){c[e.target]=(c[e.target]||0)+1;});return c;}
function journalAddQuestion(data,text,topic,now){
 text=typeof text==='string'?text.trim().replace(/\s+/g,' '):'';
 if(!text)throw Error('Напиши вопрос');if(text.length>MAX_QUESTION)throw Error('Вопрос должен быть не длиннее '+MAX_QUESTION+' знаков');
 var q={id:'q-'+(++data.seq),text:text,topic:TOPICS.includes(topic)?topic:'',created:now};data.questions.push(q);return q.id;
}
/* Удаляет вопрос вместе с ответами на него. */
function journalRemoveQuestion(data,id){data.questions=data.questions.filter(function(q){return q.id!==id;});data.entries=data.entries.filter(function(e){return e.target!==id;});}
var journal={blank:journalBlank,normalize:journalNormalize,save:journalSave,remove:journalRemove,entries:journalEntries,counts:journalCounts,addQuestion:journalAddQuestion,removeQuestion:journalRemoveQuestion};
return {topics:TOPICS,parseSource:parseSource,validateStep:validateStep,journal:journal};
});
