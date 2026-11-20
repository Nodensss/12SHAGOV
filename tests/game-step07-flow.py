"""Real mobile flow: five encounters, pauses, ordered phrase, old saves and offline."""
import asyncio, importlib.util, json, os, socket, subprocess, urllib.request
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1];WEB=Path(os.environ.get('GAME_WEB_ROOT',ROOT/'public'));OUT=Path(os.environ.get('GAME_REVIEW_DIR',ROOT.parent/'exports/game-step07'));KEY='12shagov-game-v1'
INDEX=json.loads((WEB/'game/data/episodes.json').read_text());STEP=next(s for s in INDEX['steps'] if s['id']==7);CHAPTERS={x['id']:json.loads((WEB/'game/data'/x['file']).read_text()) for x in INDEX['chapters'] if x['step']==7}
async def state(p):return await p.evaluate('(k)=>JSON.parse(localStorage.getItem(k))',KEY)
async def ready(p):await p.wait_for_function('!!document.querySelector("#game")?.dataset.view')
async def bounds(p):
 assert await p.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
 assert await p.locator('button:visible').evaluate_all('ns=>ns.every(n=>n.getBoundingClientRect().height>=43.9)')
async def composer(p,c,scene,profile,final=False):
 assert await p.locator('.g-own-words').count()==1
 assert await p.locator('[data-act="word-next"]').is_disabled()
 async def click(a,i=''):await p.locator(f'[data-act="word-change"][data-action="{a}"][data-id="{i}"]').click()
 if profile=='silence':await click('silent')
 else:
  available=await p.locator('[data-action="add"]').evaluate_all('ns=>ns.map(n=>n.dataset.id)')
  assert available
  chosen=available[1:4] if final and profile=='watch' else available[:3 if final else 1]
  for wid in chosen:await click('add',wid)
  if final:
   await click('up',chosen[1]);saved=await state(p);d=saved['ownWords']['drafts']['s7-own-request'];assert d['parts'][0]==chosen[1]
   await click('remove',chosen[0]);await click('add',chosen[0])
   saved=await state(p);await p.reload(wait_until='networkidle');await ready(p);assert (await state(p))==saved
   await p.screenshot(path=str(OUT/f'composer-{profile}.png'))
 if final:await click('format',{'try':'aloud','watch':'quiet','hold':'written','silence':'quiet'}[profile])
 if final:await click('feeling','nothing' if profile=='silence' else 'awkward')
 await bounds(p);assert not await p.locator('[data-act="word-next"]').is_disabled()
 if final:await p.screenshot(path=str(OUT/f'composer-bottom-{profile}.png'))
 await p.locator('[data-act="word-next"]').click()
async def play(p,cid,profile,pause=True):
 c=CHAPTERS[cid];seen=set();callback=[]
 for _ in range(230):
  g=await state(p);progress=g['chapters'].get(cid,{'scene':c['start'],'line':0});scene=c['scenes'][progress['scene']]
  if scene['type']=='ending':
   await p.locator('[data-act="menu"]').first.click();return callback
  if scene['type']=='journal':await p.locator('[data-act="journal-later"]').click();continue
  if scene['type']=='own-words':await composer(p,c,scene,profile,scene['final']);continue
  if scene['title']=='Петля' and progress['scene'] not in seen:
   mark='hold' if profile=='silence' else profile
   expected=next(l for l in scene['lines'] if l['id'].endswith('.callback.'+mark))['text'];callback.append(expected)
  seen.add(progress['scene'])
  choices=p.locator('[data-act="choose"]')
  if await choices.count():
   if scene.get('choice',{}).get('id','').endswith('.loop'):
    text=await p.locator('.g-log').inner_text();assert callback[-1] in text
    await choices.nth(0 if pause else 1).click()
   else:await choices.nth(1 if profile=='watch' else 0).click()
  else:await p.locator('button[data-act="next"]').click()
 raise AssertionError('Did not finish '+cid)
async def profile(browser,base,kind,size):
 ctx=await browser.new_context(base_url=base,viewport={'width':size[0],'height':size[1]},is_mobile=True,has_touch=True,reduced_motion='reduce');p=await ctx.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
 try:
  await p.goto('/icon.svg');legacy=await p.evaluate('''async ({key,mode})=>{const E=await import('/game/engine.js');const index=await(await fetch('/game/data/episodes.json')).json();const g=E.freshGame();g.variant='drugs';for(const c of index.chapters.filter(c=>c.step<7)){if(c.type==='fight')E.recordFight(g,c.id,true);else E.markDone(g,c.id);}for(const loop of index.steps.find(s=>s.id===6).loops)g.chapters[loop.chapter].choices[loop.choice]=loop[mode];E.setDraft(g,'q.step01.repeat','Прежняя вымышленная запись.','step01-only-once');E.saveGame(g);return g;}''',{'key':KEY,'mode':'hold' if kind=='silence' else kind})
  await p.goto('/game/',wait_until='networkidle');await ready(p)
  assert await p.locator('[data-id="step07-own"][data-act="play"]').count()==0
  await p.locator('[data-id="step07-meeting"][data-act="play"]').click();await play(p,'step07-meeting',kind)
  section=p.locator('.g-section-words');await section.evaluate('n=>scrollTo(0,n.getBoundingClientRect().top+scrollY-64)');await p.screenshot(path=str(OUT/f'hub-{size[0]}x{size[1]}.png'))
  order=['neighbor','tim','stepan','lena','tamara'] if kind in ['watch','silence'] else ['stepan','tamara','lena','tim','neighbor'];callbacks=[]
  for i,key in enumerate(order):
   await p.locator(f'[data-id="step07-{key}"][data-act="play"]').click()
   callbacks+=await play(p,'step07-'+key,kind,kind!='watch')
   assert await section.locator('.g-word-chip').count()==i+1
   assert await p.locator('[data-id="step07-own"][data-act="play"]').count()==(1 if i==4 else 0)
  await p.locator('[data-id="step07-own"][data-act="play"]').click();await play(p,'step07-own',kind)
  g=await state(p);assert g['ownWords']['final']=='s7-own-request';assert g['ownWords']['drafts']['s7-own-request']['complete']
  assert g['ownWords']['drafts']['s7-own-request']['silent']==(kind=='silence')
  if kind=='watch':assert 'word.stepan' not in g['ownWords']['drafts']['s7-own-request']['parts']
  for key in ['chapters','journal','fights']:
   for ident,v in legacy[key].items():assert g[key][ident]==v
  await p.reload(wait_until='networkidle');await ready(p);assert (await state(p))==g
  await bounds(p)
  await p.evaluate('navigator.serviceWorker.ready');await ctx.set_offline(True);await p.reload(wait_until='networkidle');await ready(p);assert (await state(p))==g
  assert await p.locator('.g-section-words .g-word-bank').count()==2
  for c in CHAPTERS:assert await p.evaluate('async c=>(await fetch("/game/data/chapters/"+c+".json")).ok',c)
  assert not errors,errors
  return callbacks
 except Exception:
  await p.screenshot(path=str(OUT/f'failure-{kind}.png'),full_page=True);raise
 finally:await ctx.close()
async def main():
 OUT.mkdir(parents=True,exist_ok=True)
 with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
 base=f'http://127.0.0.1:{port}';server=subprocess.Popen(['python3','-m','http.server',str(port),'--bind','127.0.0.1','--directory',str(WEB)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 try:
  for _ in range(50):
   try:urllib.request.urlopen(base+'/game/',timeout=1).close();break
   except OSError:await asyncio.sleep(.1)
  async with async_playwright() as p:
   path=os.environ.get('CHROMIUM_PATH')
   try:b=await p.chromium.launch(**({'executable_path':path} if path else {}),args=['--no-sandbox'])
   except Exception:
    if path:raise
    b=await p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
   results=[]
   for kind,size in [('try',(390,664)),('watch',(320,568)),('hold',(320,568)),('silence',(390,664))]:results.append(await profile(b,base,kind,size))
   assert results[0]!=results[1] and results[1]!=results[2]
   await b.close()
  print(json.dumps({'passed':True,'profiles':4,'meetings':5,'viewports':[[390,664],[320,568]],'checks':['free order','pause and pass on every loop','all readiness callbacks','reorder remove and reload mid phrase','all three formats and full silence','old save preserved','offline seven chapters'],'errors':[]}))
 finally:server.terminate();server.wait()
if __name__=='__main__':asyncio.run(main())
