"""Scene backgrounds: inheritance, fallback, phone readability, offline assets.
Run with npm run dev on 4173 and Python Playwright installed.
"""
import asyncio
import json
import os
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get('GAME_TEST_URL', 'http://127.0.0.1:4173')
CHAPTER = json.loads((ROOT / 'public/game/data/chapters/step01-only-once.json').read_text())

async def open_scene(page, chapter, scene='s2-yard', line=0):
    await page.goto('about:blank')
    await page.goto(BASE + '/icon.svg')
    await page.evaluate('''async ([scene,line]) => {
      const E = await import('/game/engine.js'); const g = E.freshGame(); g.variant='drugs';
      g.chapters['step01-only-once']={scene,line,choices:{},done:false};
      localStorage.setItem(E.GAME_KEY,JSON.stringify(g));
    }''', [scene, line])
    await page.unroute('**/game/data/chapters/step01-only-once.json')
    await page.route('**/game/data/chapters/step01-only-once.json', lambda route: route.fulfill(json=chapter))
    await page.goto(BASE + '/game/', wait_until='networkidle')
    await page.locator('.g-log').wait_for()

async def main():
    async with async_playwright() as p:
        browser_path = os.environ.get('CHROMIUM_PATH')
        try:
            browser = await p.chromium.launch(**({'executable_path': browser_path} if browser_path else {}), args=['--no-sandbox'])
        except Exception:
            if browser_path: raise
            browser = await p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        for width,height in [(390,664),(320,568)]:
            context = await browser.new_context(viewport={'width':width,'height':height}, service_workers='block', reduced_motion='reduce')
            page = await context.new_page()
            chapter = json.loads(json.dumps(CHAPTER))
            chapter['background']='art/scene-kitchen.webp'
            chapter['scenes']['s2-yard']['background']='art/scene-yard.webp'
            await open_scene(page, chapter)
            assert await page.locator('.g-scene-art').get_attribute('src') == 'art/scene-yard.webp'
            del chapter['scenes']['s2-yard']['background']
            await open_scene(page, chapter)
            assert await page.locator('.g-scene-art').get_attribute('src') == 'art/scene-kitchen.webp'
            chapter['scenes']['s2-yard']['background']=''
            await open_scene(page, chapter)
            assert await page.locator('.g-scene-art').count() == 0
            assert await page.locator('.game > main.g-log').count() == 1
            del chapter['background']; del chapter['scenes']['s2-yard']['background']
            await open_scene(page, chapter)
            assert await page.locator('.g-scene-art').count() == 0
            # All three dialogue roles and the choice footer must remain usable.
            chapter['scenes']['s2-yard']['background']='art/scene-yard.webp'
            await open_scene(page, chapter, line=7)
            ratios = await page.locator('.g-line p').evaluate_all('''nodes => {
              const rgba = s => (s.match(/[\\d.]+/g)||[]).map(Number);
              const lum = rgb => rgb.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
              return nodes.map(node=>{
                let parents=[], el=node; while(el){parents.push(el);el=el.parentElement;}
                // White is the worst possible background under our light text.
                let bg=[255,255,255];
                parents.reverse().forEach(el=>{const c=rgba(getComputedStyle(el).backgroundColor),a=c[3]??1;if(c.length>=3)bg=bg.map((v,i)=>c[i]*a+v*(1-a));});
                const fg=rgba(getComputedStyle(node).color),a=lum(fg),b=lum(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
              });
            }''')
            assert ratios and min(ratios)>=4.5, (width,ratios)
            for button in await page.locator('.g-foot button').all():
                box=await button.bounding_box()
                assert box['height']>=44 and box['x']>=0 and box['x']+box['width']<=width+1
                assert box['y']>=0 and box['y']+box['height']<=height+1, (width,box)
            assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            assert await page.evaluate('document.documentElement.scrollHeight <= innerHeight+1')
            await page.locator('.g-foot button').first.click()
            assert await page.locator('.g-scene-art').count() == 1
            await page.locator('[data-act=menu]').click()
            assert await page.locator('.g-scene-art').count() == 0
            await context.close()
        context=await browser.new_context()
        page=await context.new_page()
        await page.goto(BASE+'/game/',wait_until='networkidle')
        await page.evaluate('''async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}));}''')
        await context.set_offline(True)
        for name in ['yard','kitchen','porch','group','river']:
            assert await page.evaluate('''async name=>{const r=await fetch('/game/art/scene-'+name+'.webp');return r.ok&&(await r.blob()).size>0;}''',name)
        await browser.close()
    print(json.dumps({'passed':True,'viewports':['390x664','320x568'],'checks':['scene override','chapter inheritance','empty disables','absent fallback','contrast >=4.5','choices','menu cleanup','five backgrounds offline']}))

if __name__=='__main__': asyncio.run(main())
