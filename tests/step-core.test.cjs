const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const core=require('../www/js/step-core.js'),{build}=require('../scripts/build-step-content.cjs');
test('frontmatter, topic markers and stable paragraph locators',()=>{const s=core.parseSource('---\nid: basic-text\ntitle: "Моя книга"\norder: 2\ntopics: [denial]\n---\n\nПервый.\n\n<!-- topic: powerlessness -->\n\nВторой.');assert.equal(s.title,'Моя книга');assert.deepEqual(s.paragraphs.map(p=>p.topics),[['denial'],['powerlessness']]);assert.equal(s.paragraphs[1].id,'basic-text-p2');});
test('invalid metadata fails closed',()=>{for(const s of ['---\nid: ../../escape\n---\na','---\ntopics: [missing]\n---\na','---\nunknown: true\n---\na','---\nid: x'])assert.throws(()=>core.parseSource(s));});
test('source HTML stays text',()=>{assert.equal(core.parseSource('<script>alert(1)</script>','safe').paragraphs[0].text,'<script>alert(1)</script>');});
test('empty pack leaves step usable',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'step-pack-'));try{const p=build(dir).step01;assert.equal(p.sources.length,0);assert.equal(p.wording,'');assert.equal(p.step.sections.length,4);}finally{fs.rmSync(dir,{recursive:true});}});
test('step contract rejects duplicate sections',()=>{const s=JSON.parse(fs.readFileSync(path.join(__dirname,'../www/assets/steps/step01/step.json')));assert.equal(core.validateStep(s),s);s.sections[0].id='journal';assert.throws(()=>core.validateStep(s));});
const vaultApi=require('../www/js/step-vault.js'),J=core.journal;
const newVault=backend=>vaultApi.create(backend,{iterations:1000});
test('vault encrypts records and reopens only with the passphrase',async()=>{
 const backend=vaultApi.memoryBackend(),v=newVault(backend);assert.equal(await v.state(),'none');
 await assert.rejects(v.create('12345'));await assert.rejects(v.put('a',1));
 await v.create('длинная фраза');await v.put('journal:step01',{text:'очень личное'});await v.put('source:x',{id:'x'});
 const stored=JSON.stringify(await Promise.all((await backend.keys()).map(k=>backend.get(k))));assert.ok(!stored.includes('личное')&&!stored.includes('фраза'));
 assert.deepEqual(await v.names('source:'),['source:x']);v.lock();assert.equal(await v.state(),'locked');await assert.rejects(v.get('journal:step01'));
 const again=newVault(backend);assert.equal(await again.unlock('другая фраза'),false);assert.equal(again.isOpen(),false);
 assert.equal(await again.unlock('длинная фраза'),true);assert.deepEqual(await again.get('journal:step01'),{text:'очень личное'});assert.equal(await again.get('missing'),null);
 await assert.rejects(again.create('ещё одна фраза'));await again.destroy();assert.equal(await again.state(),'none');
});
test('vault rejects tampered and swapped records',async()=>{
 const backend=vaultApi.memoryBackend(),v=newVault(backend);await v.create('длинная фраза');await v.put('a',{n:1});await v.put('b',{n:2});
 await backend.put('r:b',await backend.get('r:a'));await assert.rejects(v.get('b'));
 const rec=await backend.get('r:a');rec.data=rec.data.slice(0,-4)+(rec.data.slice(-4)==='AAAA'?'BBBB':'AAAA');await backend.put('r:a',rec);await assert.rejects(v.get('a'));
});
test('journal keeps answer history per target and own questions',()=>{
 const d=J.blank(),a=J.save(d,'denial',null,'первая',1),b=J.save(d,'denial',null,'вторая',2);assert.notEqual(a,b);
 assert.equal(J.save(d,'denial',a,'первая, дополнено',3),a);assert.deepEqual(J.entries(d,'denial').map(e=>e.text),['вторая','первая, дополнено']);assert.equal(J.entries(d,'denial')[1].updated,3);
 assert.equal(J.save(d,'denial',b,'   ',4),null);assert.deepEqual(J.counts(d),{denial:1});assert.throws(()=>J.save(d,'../x',null,'t',5));
 const q=J.addQuestion(d,'  Что  я скрываю? ','denial',6);assert.equal(d.questions[0].text,'Что я скрываю?');assert.throws(()=>J.addQuestion(d,' ','',7));
 J.save(d,q,null,'ответ',8);J.removeQuestion(d,q);assert.equal(d.questions.length,0);assert.deepEqual(J.counts(d),{denial:1});
 const n=J.normalize(JSON.parse(JSON.stringify(d)));assert.deepEqual(n,d);assert.notEqual(J.save(n,'denial',null,'новая',9),a);
 assert.deepEqual(J.normalize({entries:[{id:'e1',target:'<x>',text:'t'},null],questions:'x'}),J.blank());
});
