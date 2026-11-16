"""Run npm run dev first; browser checks use fictional temporary saves only."""
import asyncio,json,pathlib
from playwright.async_api import async_playwright
R=pathlib.Path(__file__).resolve().parents[1]
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);c=await b.new_context(viewport={'width':390,'height':844},reduced_motion='reduce');page=await c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto('http://127.0.0.1:4173/game/',wait_until='networkidle')
  await page.locator('[data-act=variant]').click()
  for width,height in [(390,844),(320,568),(844,390)]:
   await page.set_viewport_size({'width':width,'height':height})
   assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
   for i in range(8):
    await page.locator('.g-carousel').evaluate('(n,i)=>n.scrollTo({left:i*n.clientWidth,behavior:"instant"})',i);await page.wait_for_timeout(80)
    assert await page.locator('#g-pick').is_disabled()==(i!=0)
   dims=await page.locator('button:visible').evaluate_all('ns=>ns.map(n=>n.getBoundingClientRect().height)');assert all(x>=44 for x in dims),dims
  await page.set_viewport_size({'width':390,'height':844})
  await page.locator('[data-act=menu]').click()
  data=await page.evaluate('''async()=>{const E=await import('/game/engine.js'),idx=await(await fetch('/game/data/episodes.json')).json(),g=E.freshGame();g.variant='drugs';for(const x of idx.chapters){if(x.type==='fight')E.recordFight(g,x.id,true);else E.markDone(g,x.id);}return JSON.stringify(g)}''')
  await page.goto('about:blank');await page.goto('http://127.0.0.1:4173/icon.svg');await page.evaluate('(s)=>localStorage.setItem("12shagov-game-v1",s)',data);await page.goto('http://127.0.0.1:4173/game/',wait_until='networkidle');await page.locator('details.g-fold').evaluate_all('ns=>ns.forEach(n=>n.open=true)');await page.locator('[data-act=fight][data-id=fight04-craving]').click();await page.locator('[data-act=fight-start]').click()
  assert (await page.locator('.g-foe').bounding_box())['width']>=230
  await page.locator('[data-act=skill][data-id=admit]').click();await page.locator('[data-act=skill][data-id=truth]').click()
  assert await page.locator('[data-act=skill][data-id=truth]').is_disabled()
  for w,h in [(390,844),(320,568),(844,390)]:
   await page.set_viewport_size({'width':w,'height':h});assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth+1');assert await page.locator('.g-skill').count()==6
   dims=await page.locator('button:visible').evaluate_all('ns=>ns.map(n=>n.getBoundingClientRect().height)');assert all(x>=44 for x in dims),dims
  await page.evaluate('navigator.serviceWorker.ready');await page.wait_for_function('!!navigator.serviceWorker.controller');await c.set_offline(True)
  assets=[v['art'] for v in json.loads((R/'public/game/data/vocab.json').read_text())['variants']]+['art/ui-frame.svg','art/ui-grain.svg']
  for asset in assets: assert await page.evaluate('async a=>(await fetch(a)).ok',asset),asset
  assert not errors,errors
  print(json.dumps({'passed':True,'locked_heroes':7,'touch44':True,'viewports':['390x844','320x568','844x390'],'battle_buttons':6,'offline_assets':len(assets),'errors':errors}))
  await b.close()
asyncio.run(main())
