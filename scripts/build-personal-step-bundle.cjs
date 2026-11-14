/* Builds only the owner's ignored pack, never commits literature. */
const fs=require('node:fs'),path=require('node:path');
const core=require('../www/js/step-core.js'),bundleCore=require('../www/js/step-bundle-core.js');
const base=path.join(__dirname,'../content-pack/step01');
const sources=fs.readdirSync(path.join(base,'sources')).filter(f=>f.endsWith('.md')).sort().map(file=>{
 const markdown=fs.readFileSync(path.join(base,'sources',file),'utf8');const parsed=core.parseSource(markdown,path.basename(file,'.md'));
 return {id:parsed.id,markdown,editionStatus:/черновик/i.test(parsed.title)?'draft':'owner-provided'};
});
const pack={format:'12shagov-step-pack',version:1,id:'step01-personal-library',stepId:'step01',title:'Первый шаг · личная библиотека',subtitle:'Точка отсчёта',introduction:[
 'Первый шаг — место, где можно спокойно посмотреть на собственный опыт. Здесь собраны оригинальные материалы и вопросы для письменной работы.',
 'Начни с небольшого фрагмента. Отмечай, что узнаёшь в своей жизни, и пиши о конкретных ситуациях. Можно остановиться и вернуться позже.',
 'Записи помогут подготовить разговор со спонсором или человеком, которому ты доверяешь. Приложение помогает собрать мысли; решение, чем делиться, остаётся за тобой.'
],topicNotes:{addiction:'Посмотри, какие повторения ты замечаешь в собственном опыте.',denial:'Запиши один случай, когда объяснение мешало увидеть последствия.',bottom:'Выбери то, о чём сейчас готов писать. Подробности необязательны.',powerlessness:'Вспомни попытку контроля и то, чем она закончилась.',unmanageability:'Отметь, что происходило с отношениями, делами и отношением к себе.',reservations:'Заметь условия, которыми ты оправдывал возможность вернуться.',surrender:'Подумай, какую поддержку ты готов принять сегодня.'},wording:fs.readFileSync(path.join(base,'step.md'),'utf8'),questions:fs.readFileSync(path.join(base,'questions.md'),'utf8'),sources};
const parsed=bundleCore.parse(pack,'step01');const output=path.join(base,'Первый-шаг.step.json');fs.writeFileSync(output,JSON.stringify(pack,null,2)+'\n');
console.log(JSON.stringify({file:output,sources:parsed.sources.length,questions:parsed.questions.length,bytes:fs.statSync(output).size},null,2));
