"""Courtyard acceptance on real short phones; fictional v1 saves only.

Only Step One is seeded for map journeys; every Step Two action uses the UI.
GAME_WEB_ROOT supports dist, CHROMIUM_PATH overrides Chromium, GAME_REVIEW_DIR
selects screenshots. This test starts and stops its own isolated HTTP server.
"""
import asyncio
import json
import os
import pathlib
import re
import socket
import subprocess
import urllib.request

from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
WEB_ROOT = pathlib.Path(os.environ.get('GAME_WEB_ROOT', str(ROOT / 'public')))
OUT = pathlib.Path(os.environ.get('GAME_REVIEW_DIR', str(ROOT.parent / 'scratch/game-map-review')))
KEY = '12shagov-game-v1'
VIEWPORTS = [(390, 664), (320, 568)]
MAP = '.g-courtyard'
NODE = '.g-map-node'
ART = '.g-map-art'
TOGGLE = '[data-act="map-view"]'
NEW_ART = ['map-yard', 'scene-morning-phone', 'scene-stairs-locked', 'scene-rain-stop', 'scene-night-notebook']


async def ready(page):
    await page.wait_for_function("() => !!document.querySelector('#game')?.dataset.view")
    assert not await page.get_by_text('Игра не открылась', exact=True).count()


async def stored(page):
    return await page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', KEY)


def place(page, item):
    return page.locator('.g-section-map button[data-id="' + item['id'] + '"]')


async def seed_step_one(page, trial=True):
    await page.goto('/icon.svg')
    return await page.evaluate("""async trial => {
      const E = await import('/game/engine.js');
      const index = await (await fetch('/game/data/episodes.json')).json();
      const game = E.freshGame(); game.variant = 'drugs';
      for (const item of index.chapters.filter(c => c.step === 1)) {
        if (item.type === 'fight') { E.recordFight(game, item.id, true); continue; }
        if (item.type === 'trial') { if (trial) E.markDone(game, item.id); continue; }
        const c = await (await fetch('/game/data/' + item.file)).json();
        const p = E.progressOf(game, c);
        for (let guard = 0; guard < 500; guard++) {
          const stage = E.stage(p, c, game);
          if (stage === 'ending') break;
          if (stage === 'choice') E.choose(p, c, c.scenes[p.scene].choice.options[0].id, game);
          else if (stage === 'journal') E.leaveJournal(p, c, game);
          else E.advance(p, c, game);
        }
        if (!p.done) throw Error('Fixture did not finish ' + item.id);
        if (item.id === 'step01-only-once') {
          E.setDraft(game, c.questions[0].id, 'Вымышленная старая запись: оставить без изменений.', c.id);
          E.saveEntry(game, c.questions[0].id, c.id, new Date('2026-11-01T00:00:00Z'));
        }
      }
      E.saveGame(game); return game;
    }""", trial)


async def view(page, mode, keyboard=False):
    button = page.locator(TOGGLE + '[data-id="' + mode + '"]')
    if keyboard:
        await button.focus()
        await page.keyboard.press('Enter')
        assert await page.locator(TOGGLE + '[data-id="' + mode + '"]').evaluate('(n) => n === document.activeElement')
    else:
        await button.click()
    assert await page.locator(TOGGLE + '[data-id="' + mode + '"]').get_attribute('aria-pressed') == 'true'
    assert await page.locator(NODE).count() == (5 if mode == 'map' else 0)
    assert await page.locator('.g-map .g-tile').count() == (5 if mode == 'tiles' else 0)


async def map_layout(page):
    await page.locator(MAP).scroll_into_view_if_needed()
    await page.wait_for_function("selector => {const i=document.querySelector(selector);return i?.complete && i.naturalWidth>0;}", arg=ART)
    result = await page.locator(MAP).evaluate("""(map, selector) => {
      const rect = n => {const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};
      const nodes=[...map.querySelectorAll(selector)];
      return {overflow:document.documentElement.scrollWidth-innerWidth,
        buttons:nodes.map(n=>({...rect(n),id:n.dataset.id,label:n.getAttribute('aria-label')||n.textContent,
          hit:[[.2,.2],[.8,.2],[.2,.8],[.8,.8],[.5,.5]].every(([x,y])=>{const r=n.getBoundingClientRect();const h=document.elementFromPoint(r.x+r.width*x,r.y+r.height*y);return h===n||n.contains(h);})})),
        labels:nodes.map(n=>rect(n.querySelector('strong')||n))};
    }""", NODE)
    assert result['overflow'] <= 1, result
    assert len(result['buttons']) == 5, result
    assert all(n['w'] >= 44 and n['h'] >= 44 and n['hit'] and n['label'].strip() for n in result['buttons']), result
    for index, a in enumerate(result['labels']):
        for b in result['labels'][index+1:]:
            assert min(a['right'], b['right']) <= max(a['x'], b['x']) or min(a['bottom'], b['bottom']) <= max(a['y'], b['y']), result


async def chapter(page, item, branch, already_open=False):
    if not already_open:
        await page.locator('button[data-id="' + item['id'] + '"]').click()
    transcript = []
    for _ in range(300):
        assert await page.evaluate('() => document.documentElement.scrollWidth <= innerWidth + 1')
        transcript.append(await page.locator('#game').inner_text())
        if await page.locator('.g-ending').count():
            assert (await stored(page))['chapters'][item['id']]['done']
            await page.locator('[data-act="menu"]').first.click()
            return '\n'.join(transcript)
        if await page.locator('#g-answer').count():
            await page.locator('[data-act="journal-later"]').click()
        elif await page.locator('[data-act="choose"]').count():
            assert await page.locator('[data-act="choose"]').count() == 2
            await page.locator('[data-act="choose"]').nth(branch).click()
        else:
            await page.locator('button[data-act="next"]').click()
    raise AssertionError('Chapter did not finish: ' + item['id'])


async def state_parity(page, item, completed=False):
    snapshots = []
    for mode in ['map', 'tiles']:
        await view(page, mode)
        button = place(page, item)
        snapshots.append((await button.get_attribute('data-act'), 'is-done' in (await button.get_attribute('class')), await button.inner_text()))
        assert await button.is_enabled()
    assert snapshots[0][:2] == snapshots[1][:2], snapshots
    assert snapshots[0][0] == ('restart' if completed else 'play'), snapshots
    if completed:
        assert snapshots[0][1], snapshots
    elif not snapshots[0][1]:
        assert all('Продолжить' in s[2] for s in snapshots), snapshots
    await view(page, 'map')


async def journey(browser, base, branch, index, errors):
    width,height = VIEWPORTS[branch]
    context = await browser.new_context(base_url=base, viewport={'width':width,'height':height}, is_mobile=True, has_touch=True, reduced_motion='reduce')
    page = await context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('response', lambda response: errors.append(f'HTTP {response.status}: {response.url}') if response.status >= 400 else None)
    try:
        await page.goto('/game/', wait_until='networkidle')
        await ready(page)
        second = page.locator('.g-section').filter(has=page.get_by_role('heading', name='Надежда', exact=True))
        assert 'is-locked' in (await second.get_attribute('class'))
        legacy = await seed_step_one(page, trial=False)
        await page.goto('/game/', wait_until='networkidle')
        await ready(page)
        assert 'is-locked' in (await second.get_attribute('class')), 'Boss alone must not unlock Step Two'
        assert not await page.locator(NODE).count()
        await page.locator('[data-act="trial"][data-id="trial01-trap"]').click()
        await page.locator('[data-act="trial-next"]').click()
        for _ in range(20):
            if (await stored(page))['chapters'].get('trial01-trap', {}).get('done'):
                break
            await page.locator('[data-act="trial-answer"]').first.click()
            await page.locator('[data-act="trial-next"]').click()
        assert (await stored(page))['chapters']['trial01-trap']['done']
        await page.locator('[data-act="menu"]').first.click()
        await map_layout(page)
        await page.screenshot(path=str(OUT / f'map-{width}.png'))
        for mode in ['tiles', 'map']:
            await view(page, mode, keyboard=True)
            await page.reload(wait_until='networkidle')
            await ready(page)
            assert await page.locator(TOGGLE + '[data-id="' + mode + '"]').get_attribute('aria-pressed') == 'true'
            assert await page.locator(NODE).count() == (5 if mode == 'map' else 0)
        places = [c for c in index['chapters'] if c['step'] == 2 and not c.get('final')]
        assert len(places) == 5
        # Two distinct triples: the finale cannot depend on a single fixed route.
        order = places if branch == 0 else list(reversed(places))
        final = next(c for c in index['chapters'] if c['id'] == 'step02-night')
        transcripts = {}
        for number,item in enumerate(order):
            if number < 3:
                assert not await page.locator('button[data-id="step02-night"]').count()
            if number == 0:
                await place(page, item).focus()
                await page.keyboard.press('Enter')
                await page.locator('button[data-act="next"]').click()
                progress = (await stored(page))['chapters'][item['id']]
                await page.locator('[data-act="menu"]').first.click()
                await state_parity(page, item)
                await place(page, item).click()
                assert (await stored(page))['chapters'][item['id']] == progress
                await page.reload(wait_until='networkidle')
                await ready(page)
                assert (await stored(page))['chapters'][item['id']] == progress
                transcripts[item['id']] = await chapter(page, item, branch, already_open=True)
            else:
                transcripts[item['id']] = await chapter(page, item, branch)
            await state_parity(page, item, completed=True)
            if number == 2:
                assert await page.locator('button[data-id="step02-night"]').is_enabled()
                transcripts[final['id']] = await chapter(page, final, branch)
                assert (await stored(page))['chapters'][final['id']]['done']
        # Restart from a finished map marker, then resume that replay from tiles.
        item = order[0]
        await place(page, item).click()
        assert not await page.locator('.g-ending').count()
        await page.locator('button[data-act="next"]').click()
        await page.locator('[data-act="menu"]').first.click()
        await state_parity(page, item)
        await view(page, 'tiles')
        await chapter(page, item, branch)
        await view(page, 'map')
        assert await page.locator(NODE + '.is-done').count() == 5
        data = await stored(page)
        assert all(data['chapters'][k] == v for k,v in legacy['chapters'].items())
        assert data['fights'] == legacy['fights']
        assert all(data['journal'][k] == v for k,v in legacy['journal'].items())
        await page.locator('[data-act="diary"]').click()
        assert 'Вымышленная старая запись: оставить без изменений.' in await page.locator('#game').inner_text()
        await page.locator('[data-act="menu"]').first.click()
        await map_layout(page)
        await page.screenshot(path=str(OUT / f'completed-{width}.png'))
        await page.evaluate('async () => { await navigator.serviceWorker.ready; }')
        await page.wait_for_function('() => !!navigator.serviceWorker.controller')
        await context.set_offline(True)
        for name in NEW_ART:
            assert await page.evaluate("""async name => {
              const r=await fetch('/game/art/'+name+'.webp');
              return r.ok && (await r.blob()).size > 0;
            }""", name), name
        await page.reload(wait_until='networkidle')
        await ready(page)
        await map_layout(page)
        assert (await stored(page)) == data
        return transcripts
    except Exception:
        await page.screenshot(path=str(OUT / f'failure-{width}.png'), full_page=True)
        raise
    finally:
        await context.close()


async def fallbacks(browser, base, index, errors):
    for mode in ['absent', 'broken']:
        context = await browser.new_context(base_url=base, viewport={'width':320,'height':568}, service_workers='block')
        page = await context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        await page.goto('/game/', wait_until='networkidle')
        await seed_step_one(page)
        if mode == 'absent':
            config = json.loads(json.dumps(index))
            del next(s for s in config['steps'] if s['id'] == 2)['map']
            await page.route('**/game/data/episodes.json', lambda route: route.fulfill(json=config))
        else:
            await page.route('**/game/art/map-yard.webp', lambda route: route.abort())
        await page.goto('/game/', wait_until='networkidle')
        await ready(page)
        await page.wait_for_function('() => document.querySelectorAll(".g-map .g-tile").length === 5')
        assert not await page.locator(NODE).count()
        assert await page.locator('.g-map .g-tile:enabled').count() == 5
        assert await page.evaluate('() => document.documentElement.scrollWidth <= innerWidth + 1')
        first = next(c for c in index['chapters'] if c['step'] == 2)
        await chapter(page, first, 0)
        assert 'is-done' in (await place(page, first).get_attribute('class'))
        await context.close()


async def icons(browser, base, index, errors):
    # Separate fixture solely for render checks: progression is covered by real
    # UI journeys above and existing art/Step Four acceptance suites.
    context = await browser.new_context(base_url=base, reduced_motion='reduce')
    page = await context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    await page.goto('/icon.svg')
    await page.evaluate("""async () => {
      const E=await import('/game/engine.js');
      const index=await (await fetch('/game/data/episodes.json')).json();
      const game=E.freshGame();game.variant='drugs';
      for (const item of index.chapters) {
        if(item.type==='fight') E.recordFight(game,item.id,true);
        else E.markDone(game,item.id);
      }
      E.saveGame(game);
    }""")
    await page.goto('/game/', wait_until='networkidle')
    await ready(page)
    for width,height in VIEWPORTS:
        seen = set()
        await page.set_viewport_size({'width':width,'height':height})
        for fight in ['fight04-craving','fight05-shame']:
            await page.locator('details.g-fold').evaluate_all('nodes => nodes.forEach(n => n.open=true)')
            await page.locator('[data-act="fight"][data-id="'+fight+'"]').click()
            await page.locator('[data-act="fight-start"]').click()
            await page.wait_for_function('() => [...document.images].every(i => i.complete && i.naturalWidth > 0)')
            rendered = await page.locator('.g-skill-icon').evaluate_all("""nodes => nodes.map(n => {
              const r=n.getBoundingClientRect();return {id:n.closest('button').dataset.id,w:r.width,h:r.height,filter:getComputedStyle(n).filter};
            })""")
            assert len(rendered) == 6, rendered
            for icon in rendered:
                assert min(icon['w'], icon['h']) >= 28, (width, icon)
                brightness = re.search(r'brightness\(([\d.]+)\)', icon['filter'])
                assert brightness and float(brightness[1]) > 1, icon
                seen.add(icon['id'])
            # Retain full original combat constraints while enlarging icons.
            geometry = await page.evaluate("""() => {
              const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom,r:r.right};};
              return {x:document.documentElement.scrollWidth-innerWidth,y:document.documentElement.scrollHeight-innerHeight,scrollY,
                bars:document.querySelectorAll('.g-bar').length,foe:rect(document.querySelector('.g-foe-small')),
                nodes:[...document.querySelectorAll('.g-skill,.g-bar,.g-foe-small,.g-battle-log')].map(rect),
                skills:[...document.querySelectorAll('.g-skill')].map(n=>{const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {...rect(n),hit:n===hit||n.contains(hit)};}),
                logOverflow:getComputedStyle(document.querySelector('.g-battle-log')).overflowY};
            }""")
            assert geometry['x'] <= 1 and geometry['y'] <= 1 and geometry['scrollY'] <= 1, geometry
            assert geometry['bars'] == 2 and len(geometry['skills']) == 6, geometry
            assert all(n['x'] >= -1 and n['y'] >= -1 and n['r'] <= width+1 and n['b'] <= height+1 for n in geometry['nodes']), geometry
            assert all(n['h'] >= 61 and n['hit'] for n in geometry['skills']), geometry
            assert min(geometry['foe']['w'],geometry['foe']['h']) >= (150 if width == 390 else 96), geometry
            assert geometry['logOverflow'] in ['auto','scroll'], geometry
            await page.screenshot(path=str(OUT / f'{fight}-icons-{width}.png'))
            await page.locator('[data-act="menu"]').first.click()
        assert len(seen) == 11, seen
    await context.close()


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    index = json.loads((WEB_ROOT / 'game/data/episodes.json').read_text())
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0))
        port = sock.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    server = subprocess.Popen(['python3','-m','http.server',str(port),'--bind','127.0.0.1','--directory',str(WEB_ROOT)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    errors = []
    try:
        for _ in range(50):
            try:
                urllib.request.urlopen(base+'/game/',timeout=1).close()
                break
            except OSError:
                await asyncio.sleep(.1)
        else:
            raise AssertionError('HTTP server did not start')
        async with async_playwright() as p:
            path = os.environ.get('CHROMIUM_PATH')
            try:
                browser = await p.chromium.launch(**({'executable_path':path} if path else {}),args=['--no-sandbox'])
            except Exception:
                if path:
                    raise
                browser = await p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
            transcripts = [await journey(browser,base,b,index,errors) for b in [0,1]]
            for item in [c for c in index['chapters'] if c['step'] == 2]:
                assert transcripts[0][item['id']] != transcripts[1][item['id']], item['id']
            await fallbacks(browser,base,index,errors)
            await icons(browser,base,index,errors)
            await browser.close()
        assert not errors, errors
        report = {'passed':True,'viewports':VIEWPORTS,'branches':2,'checks':['trial gate','five 44px map targets and label separation','keyboard activation and view preference reload','real five-place journeys with different first triples; night at three','unfinished resume and completed replay match tiles','legacy v1 note and progress preserved','missing config and failed image auto fallback','map and four backgrounds offline','11 icons >=28px and brighter; original combat constraints'],'errors':errors}
        (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
        print(json.dumps(report,ensure_ascii=False))
    finally:
        server.terminate()
        server.wait()


if __name__ == '__main__':
    asyncio.run(main())
