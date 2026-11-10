const fs=require('node:fs'),path=require('node:path');
const core=require('../www/js/step-core.js');
const base=path.resolve(__dirname,'..'),assets=path.join(base,'www/assets/steps');
function readPrivate(file){if(fs.lstatSync(file).isSymbolicLink())throw Error('Ссылки в паке не поддерживаются');if(fs.statSync(file).size>2000000)throw Error('Файл больше 2 МБ');return fs.readFileSync(file,'utf8');}
function build(packRoot=path.join(base,'content-pack')){
 const catalog={};
 for(const dir of fs.readdirSync(assets).filter(s=>/^step\d{2}$/.test(s))){
  const step=core.validateStep(JSON.parse(fs.readFileSync(path.join(assets,dir,'step.json'),'utf8'))),explain=path.join(assets,dir,'explain'),pack=path.join(packRoot,dir),sourceDir=path.join(pack,'sources');
  const chapters=fs.readdirSync(explain).filter(s=>s.endsWith('.md')).sort().map(file=>({id:path.basename(file,'.md'),text:fs.readFileSync(path.join(explain,file),'utf8')}));
  const sources=fs.existsSync(sourceDir)?fs.readdirSync(sourceDir).filter(s=>/\.(md|txt)$/.test(s)).sort().map(file=>core.parseSource(readPrivate(path.join(sourceDir,file)),path.basename(file,path.extname(file)))):[];
  if(new Set(sources.map(s=>s.id)).size!==sources.length)throw Error('Повторяющийся id источника');
  catalog[dir]={step,chapters,sources:sources.sort((a,b)=>a.order-b.order),wording:fs.existsSync(path.join(pack,'step.md'))?readPrivate(path.join(pack,'step.md')):'',literatureQuestions:fs.existsSync(path.join(pack,'questions.md'))?readPrivate(path.join(pack,'questions.md')):''};
 }return catalog;
}
if(require.main===module){fs.writeFileSync(path.join(base,'www/js/step-content.js'),'window.STEP_PACKS='+JSON.stringify(build())+';\n');console.log('Локальный контент шага собран');}
module.exports={build};
