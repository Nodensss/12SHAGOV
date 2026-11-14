/* Local-only extraction; no CDN, remote workers, OCR, scripts or book markup. */
(function(){'use strict';
var MAX=25*1024*1024,core=window.StepImportCore;
function local(path){return new URL(path,document.baseURI).href;}
async function pdf(file,range,progress){
 if(!Promise.withResolvers)Promise.withResolvers=function(){var resolve,reject,promise=new Promise(function(a,b){resolve=a;reject=b;});return {promise:promise,resolve:resolve,reject:reject};};
 var module=await import(local('vendor/pdfjs/pdf.mjs'));module.GlobalWorkerOptions.workerSrc=local('vendor/pdfjs/pdf.worker.mjs');
 var task=module.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,disableFontFace:true,useSystemFonts:false,enableXfa:false});
 task.onPassword=function(){task.destroy();};
 var doc;
 try{
  doc=await task.promise;var first=Number(range.from)||1,last=range.to?Number(range.to):doc.numPages;
  if(!Number.isInteger(first)||!Number.isInteger(last)||first<1||last<first||last>doc.numPages)throw Error('Укажи страницы от 1 до '+doc.numPages);if(last-first>599)throw Error('Выбери не больше 600 страниц за раз');
  var chunks=[],length=0;
  for(var n=first;n<=last;n++){
   progress('Читаю PDF: страница '+n+' из '+last);var page=await doc.getPage(n),data=await page.getTextContent();var lines=[],line='';
   var previous=null;data.items.forEach(function(item){
    if(typeof item.str!=='string')return;
    if(previous&&line&&!/\s$/.test(line)&&item.str&&!/^\s|^[,.;:!?)}\]]/.test(item.str)){
     var gap=item.transform[4]-(previous.transform[4]+previous.width),font=Math.max(item.height||0,1);
     if(gap>font*0.12)line+=' ';
    }
    line+=item.str;previous=item;
    if(item.hasEOL){lines.push(line.replace(/[ \t]+/g,' ').trimEnd());line='';previous=null;}
   });if(line)lines.push(line.trimEnd());var value=lines.join('\n');length+=value.length;
   if(length>core.limit)throw Error('Слишком много текста. Выбери меньший диапазон страниц');
   chunks.push('## PDF-страница '+n+'\n\n'+value);page.cleanup();
  }
  var text=chunks.join('\n\n');if(!chunks.some(function(c){return c.replace(/^## PDF-страница \d+\s*/,'').trim().length>10;}))throw Error('В PDF нет текстового слоя. Для скана сначала нужен распознанный TXT или Markdown.');
  return {text:text,pages:{from:first,to:last,total:doc.numPages},notice:'Извлечён текст PDF. Проверь переносы и порядок строк в предпросмотре.'};
 }finally{await task.destroy();}
}
function safePath(base,href){if(/^[a-z][a-z0-9+.-]*:/i.test(href)||href.startsWith('/')||href.includes('\\'))throw Error('В EPUB есть неподдерживаемая внешняя ссылка');var parts=base.split('/').filter(Boolean);parts.pop();decodeURIComponent(href.split('#')[0]).split('/').forEach(function(p){if(!p||p==='.')return;if(p==='..'){if(!parts.length)throw Error('Некорректный путь EPUB');parts.pop();}else parts.push(p);});return parts.join('/');}
async function epub(file,progress){
 if(!window.fflate)throw Error('Не загружен локальный модуль EPUB');progress('Открываю EPUB…');var count=0,total=0;
 var entries=fflate.unzipSync(new Uint8Array(await file.arrayBuffer()),{filter:function(entry){count++;if(count>3000)throw Error('В EPUB слишком много файлов');if(!/\.(?:xml|opf|xhtml|html|htm)$/i.test(entry.name))return false;total+=entry.originalSize;if(entry.originalSize>core.limit*2||total>30*1024*1024)throw Error('Распакованный EPUB слишком большой');return true;}});
 function xml(name){if(!entries[name])throw Error('EPUB: не найден '+name);var value=new DOMParser().parseFromString(new TextDecoder().decode(entries[name]),'application/xml');if(value.querySelector('parsererror'))throw Error('Повреждён файл EPUB: '+name);return value;}
 var container=xml('META-INF/container.xml'),rootfile=container.getElementsByTagNameNS('*','rootfile')[0];if(!rootfile)throw Error('В EPUB нет оглавления пакета');var opf=safePath('index',rootfile.getAttribute('full-path')),pkg=xml(opf),items={};
 Array.from(pkg.getElementsByTagNameNS('*','item')).forEach(function(i){items[i.getAttribute('id')]=i.getAttribute('href');});var spine=Array.from(pkg.getElementsByTagNameNS('*','itemref'));if(!spine.length)throw Error('В EPUB нет порядка чтения');
 var pieces=[],length=0;
 spine.forEach(function(ref,i){var href=items[ref.getAttribute('idref')];if(!href)throw Error('Неполный EPUB');var path=safePath(opf,href);if(!entries[path])throw Error('В EPUB отсутствует глава');var doc=new DOMParser().parseFromString(new TextDecoder().decode(entries[path]),'application/xhtml+xml');if(doc.querySelector('parsererror'))throw Error('Не удалось разобрать главу EPUB. Добавь её отдельным TXT или Markdown.');doc.querySelectorAll('script,style,noscript,svg').forEach(function(n){n.remove();});
  var body=doc.getElementsByTagNameNS('*','body')[0]||doc.documentElement;var nodes=Array.from(body.querySelectorAll('h1,h2,h3,h4,p,li')).filter(function(n){return !n.querySelector('h1,h2,h3,h4,p,li');});var text=nodes.length?nodes.map(function(n){return n.textContent;}).join('\n\n'):body.textContent;
  length+=text.length;if(length>core.limit)throw Error('Слишком много текста в EPUB. Добавь нужную главу отдельным TXT');if(text.trim())pieces.push('## EPUB — часть '+(i+1)+'\n\n'+text);
 });return {text:core.text(pieces.join('\n\n')),notice:'Текст EPUB извлечён по порядку глав. Номер части EPUB не является номером страницы PDF.'};
}
async function read(file,range,progress){progress=progress||function(){};if(!file||file.size>MAX)throw Error('Выбери файл не больше 25 МБ');var ext=file.name.split('.').pop().toLowerCase(),result;
 if(ext==='pdf')result=await pdf(file,range||{},progress);else if(ext==='epub')result=await epub(file,progress);else if(ext==='txt'||ext==='md')result={text:core.text(await file.text()),notice:'Текст прочитан без исправлений.'};else throw Error('Поддерживаются PDF, EPUB, TXT и Markdown');
 result.text=core.text(result.text);result.filename=file.name;result.format=ext;return result;
}
window.StepFileReader={read:read};
})();
