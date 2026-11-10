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
return {topics:TOPICS,parseSource:parseSource,validateStep:validateStep};
});
