/* One-file, versioned owner content pack. No scripts, styles or external URLs. */
(function(root,factory){if(typeof module==='object')module.exports=factory(require('./step-core.js'),require('./step-import-core.js'));else root.StepBundleCore=factory(root.StepCore,root.StepImportCore);})(typeof globalThis!=='undefined'?globalThis:this,function(C,I){
'use strict';
function short(v,max,fallback){if(v===undefined)return fallback||'';if(typeof v!=='string'||v.length>max)throw Error('Некорректное описание пакета');return v;}
function parse(value,stepId){
 var raw;if(typeof value==='string'){if(value.length>5000000)throw Error('Пакет слишком большой');try{raw=JSON.parse(value);}catch(e){throw Error('Не удалось прочитать пакет. Выбери файл .step.json, а не ZIP или PDF.');}}else raw=value;
 if(!raw||raw.format!=='12shagov-step-pack'||raw.version!==1)throw Error('Это не поддерживаемый пакет шага');
 if(raw.stepId!==stepId)throw Error('Этот пакет предназначен для другого шага');
 if(typeof raw.id!=='string'||!/^[-a-z0-9]{1,100}$/.test(raw.id))throw Error('Некорректный id пакета');
 var wording=I.text(raw.wording);if(wording.length>4000)throw Error('Формулировка слишком длинная');
 if(!Array.isArray(raw.sources)||!raw.sources.length||raw.sources.length>20)throw Error('В пакете должно быть от 1 до 20 источников');
 var length=wording.length,sources=raw.sources.map(function(s){if(!s||typeof s.id!=='string')throw Error('Некорректный источник');var md=I.text(s.markdown);length+=md.length;var source=C.parseSource(md,s.id);if(source.id!==s.id)throw Error('id источника не совпадает с метаданными');if(source.title.length>250||source.section.length>5000)throw Error('Слишком длинное название источника');source.editionStatus=short(s.editionStatus,40,'owner-provided');return source;});
 if(new Set(sources.map(function(s){return s.id;})).size!==sources.length)throw Error('В пакете повторяются источники');
 var qt=I.text(raw.questions);length+=qt.length;if(length>4000000)throw Error('В пакете слишком много текста');var questions=I.questions(qt);
 var notes={};if(raw.topicNotes)Object.keys(raw.topicNotes).forEach(function(id){if(!C.topics.includes(id))throw Error('Неизвестная тема пакета');notes[id]=short(raw.topicNotes[id],600);});
 var intro=raw.introduction||[];if(!Array.isArray(intro)||intro.length>5)throw Error('Некорректное введение');intro=intro.map(function(t){return short(t,2000);});
 return {meta:{id:raw.id,stepId:stepId,title:short(raw.title,120,'Первый шаг'),subtitle:short(raw.subtitle,180,'Точка отсчёта'),introduction:intro,topicNotes:notes,sourceCount:sources.length,questionCount:questions.length},sources:sources,wording:wording,questionsText:qt,questions:questions};
}
return {parse:parse};
});
