"""Step Five: real conversation choices, depths, boundaries and v1 reloads.

Only Steps One–Four use a fictional save fixture. All Step Five actions use UI.
"""
import asyncio
import json
import os
from pathlib import Path
import socket
import subprocess
import urllib.request
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
WEB=Path(os.environ.get('GAME_WEB_ROOT',str(ROOT/'public')))
OUT=Path(os.environ.get('GAME_REVIEW_DIR',str(ROOT.parent/'scratch/game-step05-review')))
KEY='12shagov-game-v1'
INDEX=json.loads((WEB/'game/data/episodes.json').read_text())
STEP=next(s for s in INDEX['steps'] if s['id']==5)
PAGES={p['id']:p for p in STEP['pages']}
CHAPTERS={c['id']:json.loads((WEB/'game/data'/c['file']).read_text()) for c in INDEX['chapters'] if c['step']==5}

async def ready(page):
 await page.wait_for_function('() => !!document.querySelector("#game")?.dataset.view')
 assert not await page.get_by_text('Игра не открылась',exact=True).count()

async def stored(page):return await page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',KEY)

async def seed(page,depth,marks,wait):
 await page.goto('/icon.svg')
 return await page.evaluate('''async ({depth,marks,wait})=>{
  const E=await import('/game/engine.js'),index=await(await fetch('/game/data/episodes.json')).json();
  const g=E.freshGame();g.variant='drugs';
  for(const item of index.chapters.filter(c=>c.step<5)){
   if(item.step===4&&item.page&&item.depth>depth)continue;
   if(item.type==='fight')E.recordFight(g,item.id,true);else E.markDone(g,item.id);
  }
  for(const p of index.steps.find(s=>s.id===5).pages)if(marks.includes(p.id)){
   const source=index.chapters.find(c=>c.page===p.id&&c.depth===1);
   const choice=p.bookmark.slice(0,p.bookmark.lastIndexOf('.'));
   g.chapters[source.id].choices[choice]=p.bookmark;
  }
  g.chapters['step04-notebook'].choices['s4-fin.choice']=wait?'s4-fin.choice.wait':'s4-fin.choice.read';
  E.setDraft(g,'q.step01.legacy','Вымышленная прежняя запись.','step01-only-once');
  E.saveEntry(g,'q.step01.legacy','step01-only-once',new Date('2026-11-01T00:00:00Z'));
  E.saveGame(g);return g;
 }''',{'depth':depth,'marks':marks,'wait':wait})

async def layout(page,choices=False):
 assert await page.evaluate('() => document.documentElement.scrollWidth <= innerWidth+1')
 for button in await page.locator('#game button:visible').all():
  box=await button.bounding_box();assert box['height']>=43.9,box
 if choices:
  geometry=await page.locator('[data-act=choose]').evaluate_all('''ns=>ns.map(n=>{
   const r=n.getBoundingClientRect(),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
   return {x:r.x,y:r.y,r:r.right,b:r.bottom,hit:h===n||n.contains(h),vw:innerWidth,vh:innerHeight};
  })''')
  assert all(b['x']>=-1 and b['y']>=-1 and b['r']<=b['vw']+1 and b['b']<=b['vh']+1 and b['hit'] for b in geometry),geometry

async def play(page,cid,mode='read',reread=False,draft=False,capture=None):
 # Caller opens the chapter from its real menu button.
 text=set();captured=False;tested_draft=False
 for turn in range(400):
  await layout(page)
  for s in await page.locator('.g-line p,.g-ending p').all_inner_texts():text.add(s)
  if await page.locator('.g-ending').count():
   assert (await stored(page))['chapters'][cid]['done']
   await page.locator('[data-act=menu]').first.click()
   header=await page.locator('.g-section-conversation h2').bounding_box()
   assert 45<=header['y']<200,header
   assert await page.locator('.g-section-conversation h2').evaluate('n=>n===document.activeElement')
   return '\n'.join(sorted(text))
  if await page.locator('#g-answer').count():
   if draft and not tested_draft:
    area=page.locator('#g-answer');first=await area.get_attribute('data-question');await area.fill('Вымышленная пауза.')
    await page.locator('[data-act=other-question]').click()
    second=await area.get_attribute('data-question');assert second!=first
    await area.fill('Вымышленная граница.')
    await page.wait_for_function('(a)=>JSON.parse(localStorage.getItem(a.key)).journal[a.id]?.draft===a.text',arg={'key':KEY,'id':second,'text':'Вымышленная граница.'})
    await page.reload(wait_until='networkidle');await ready(page)
    assert await area.get_attribute('data-question')==second
    assert await area.input_value()=='Вымышленная граница.'
    data=await stored(page);assert data['journal'][first]['draft']=='Вымышленная пауза.'
    tested_draft=True
   await page.locator('[data-act=journal-later]').click();continue
  if capture and turn==1:
   snapshot=(await stored(page))['chapters'][cid]
   await page.reload(wait_until='networkidle');await ready(page)
   assert (await stored(page))['chapters'][cid]==snapshot
  options=page.locator('[data-act=choose]')
  if await options.count():
   await layout(page,True)
   revisit=await options.count()==2
   if not revisit:
    assert await options.count()==3
    assert await options.all_inner_texts()==['Прочитать как есть','Смягчить','Об этом не сегодня']
    if capture and not captured:
     await page.screenshot(path=str(OUT/(capture+'-choice.png')));captured=True
     snapshot=(await stored(page))['chapters'][cid]
     await page.reload(wait_until='networkidle');await ready(page)
     assert (await stored(page))['chapters'][cid]==snapshot
   suffix=('read' if reread else 'keep') if revisit else mode
   await page.locator('[data-act=choose][data-id$=".'+suffix+'"]').click()
  else:
   await page.locator('button[data-act=next]').click()
 raise AssertionError('Chapter did not finish: '+cid)

async def profile(browser,base,depth,mode,wait,marks,width,height,errors):
 context=await browser.new_context(base_url=base,viewport={'width':width,'height':height},is_mobile=True,has_touch=True,reduced_motion='reduce')
 page=await context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('response',lambda r:errors.append('HTTP '+str(r.status)+' '+r.url) if r.status>=400 else None)
 await page.goto('/game/',wait_until='networkidle');await ready(page)
 assert not await page.locator('[data-act=play][data-id=step05-arrival]').count()
 old=await seed(page,depth,marks,wait)
 await page.goto('/game/',wait_until='networkidle');await ready(page)
 await page.locator('[data-act=play][data-id=step05-arrival]').click()
 arrival=await play(page,'step05-arrival')
 assert ('В пятницу' in arrival)==wait
 order=await page.locator('.g-talk-page').evaluate_all('nodes=>nodes.map(n=>n.dataset.page)')
 expected=[p['id'] for p in STEP['pages'] if p['id'] in marks]+[p['id'] for p in STEP['pages'] if p['id'] not in marks]
 assert order==expected,(order,expected)
 assert await page.locator('.g-secret').get_attribute('aria-label')=='Тайна: 5 / 5'
 await page.locator('.g-section-conversation').evaluate('n=>scrollTo(0,n.getBoundingClientRect().top+scrollY-64)')
 await page.screenshot(path=str(OUT/f'table-{depth}-{mode}-{width}.png'))
 results={};expected_modes={}
 # Deliberately ignore suggested order: player chooses the reverse order.
 for n,pid in enumerate(reversed(order)):
  p=PAGES[pid];reread=mode=='soften' and pid=='deeds';expected_modes[pid]='read' if reread else mode
  assert not await page.locator('[data-id=step05-after][data-act=play]').count()
  await page.locator('.g-talk-page[data-page="'+pid+'"] button').click()
  results[pid]=await play(page,p['chapter'],mode,reread,draft=n==0,capture=f'{pid}-{depth}-{mode}-{width}')
  assert await page.locator('.g-talk-page[data-page="'+pid+'"]').get_attribute('data-mode')==expected_modes[pid]
  secret=5-sum(m=='read' for m in expected_modes.values())
  assert await page.locator('.g-secret').get_attribute('aria-label')==f'Тайна: {secret} / 5'
  assert await page.locator('[data-id=step05-after][data-act=play]').count()==(1 if n==4 else 0)
 # All postponed still opens the ending, with five pages remaining secret.
 await page.locator('[data-id=step05-after][data-act=play]').click()
 final=await play(page,'step05-after')
 for pid,p in PAGES.items():
  candidates=[l for l in CHAPTERS['step05-after']['scenes']['s5-after-table']['lines'] if l.get('if') in [p['read'],p['reread'],p['soften'],p['later']]]
  for l in candidates:
   which='read' if l['if'] in [p['read'],p['reread']] else 'soften' if l['if']==p['soften'] else 'later'
   assert (l['text'] in final)==(which==expected_modes[pid]),(pid,l['id'])
 data=await stored(page)
 for key in ['fights','journal']:
  for ident,value in old[key].items():assert data[key][ident]==value
 for ident,value in old['chapters'].items():assert data['chapters'][ident]==value,ident
 await page.reload(wait_until='networkidle');await ready(page);assert await stored(page)==data
 await page.evaluate('''async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}));}''')
 await context.set_offline(True);await page.reload(wait_until='networkidle');await ready(page)
 assert await stored(page)==data
 for chapter in CHAPTERS:
  assert await page.evaluate('async id=>(await fetch("/game/data/chapters/"+id+".json")).ok',chapter)
 await page.locator('.g-talk-page[data-page=resentment] button').click();await ready(page)
 assert (await stored(page))['chapters']['step05-father']['scene']=='s5-father-offer'
 await page.locator('[data-act=menu]').first.click()
 assert not await page.locator('[data-act=play][data-id=step05-after]').count()
 await context.close();return results

async def main():
 OUT.mkdir(parents=True,exist_ok=True);errors=[]
 with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
 server=subprocess.Popen(['python3','-m','http.server',str(port),'--bind','127.0.0.1','--directory',str(WEB)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 try:
  for _ in range(50):
   try:urllib.request.urlopen(f'http://127.0.0.1:{port}/game/',timeout=1).close();break
   except OSError:await asyncio.sleep(.1)
  async with async_playwright() as p:
   path=os.environ.get('CHROMIUM_PATH')
   try:browser=await p.chromium.launch(**({'executable_path':path} if path else {}),args=['--no-sandbox'])
   except Exception:
    if path:raise
    browser=await p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
   base=f'http://127.0.0.1:{port}'
   shallow=await profile(browser,base,1,'read',False,['deeds','resentment'],390,664,errors)
   deep=await profile(browser,base,3,'read',True,['fear','worth'],320,568,errors)
   softened=await profile(browser,base,2,'soften',True,['bonds'],320,568,errors)
   await profile(browser,base,1,'later',False,[],390,664,errors)
   for pid in PAGES:assert len(deep[pid])>len(shallow[pid]),pid
   assert 'помогал искать' not in shallow['deeds'] and 'помогал искать' in softened['deeds']
   assert 'похороны' not in shallow['resentment'] and 'похороны' in deep['resentment']
   await browser.close()
  assert not errors,errors
  print(json.dumps({'passed':True,'profiles':4,'pages_per_profile':5,'viewports':['390x664','320x568'],'checks':['three choices on every page','depths one two three','bookmarks and free order','soften then reread','all postponed finale','choice and two journal drafts reload','finale matches current decisions','v1 records preserved','offline and replay'],'errors':errors}))
 finally:server.terminate();server.wait()

if __name__=='__main__':asyncio.run(main())
