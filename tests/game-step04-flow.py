"""Step Four acceptance: fictional legacy v1 fixture, then real UI actions only.

GAME_WEB_ROOT can target dist; CHROMIUM_PATH overrides the browser executable.
"""
import asyncio
import json
import os
import pathlib
import socket
import subprocess
import urllib.request

from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
WEB_ROOT = pathlib.Path(os.environ.get('GAME_WEB_ROOT', str(ROOT / 'public')))
OUT = pathlib.Path(os.environ.get('GAME_REVIEW_DIR', str(ROOT.parent / 'scratch/game-step04-review')))
KEY = '12shagov-game-v1'
VIEWPORTS = [(390, 664), (320, 568)]


async def stored(page):
    return await page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', KEY)


async def ready(page):
    await page.wait_for_function("() => !!document.querySelector('#game')?.dataset.view")
    assert not await page.get_by_text('Игра не открылась', exact=True).count()


async def seed(page):
    # Navigate away first so pagehide cannot overwrite the fictional fixture.
    await page.goto('/icon.svg')
    return await page.evaluate("""async () => {
      const E = await import('/game/engine.js');
      const index = await (await fetch('/game/data/episodes.json')).json();
      const game = E.freshGame(); game.variant = 'drugs';
      for (const item of index.chapters.filter(c => c.step < 4)) {
        if (item.type === 'fight') { E.recordFight(game, item.id, true); continue; }
        if (item.type === 'trial') { E.markDone(game, item.id); continue; }
        const c = await (await fetch('/game/data/' + item.file)).json();
        const p = E.progressOf(game, c);
        for (let guard = 0; guard < 500; guard++) {
          const stage = E.stage(p, c, game);
          if (stage === 'ending') break;
          if (stage === 'choice') E.choose(p, c, c.scenes[p.scene].choice.options[0].id, game);
          else if (stage === 'steering') {
            for (const part of c.scenes[p.scene].parts) E.assignSteering(p, c, part.id, 'act');
            E.leaveSteering(p, c, game);
          } else if (stage === 'journal') E.leaveJournal(p, c, game);
          else E.advance(p, c, game);
        }
        if (!p.done) throw Error('Fixture did not complete ' + item.id);
        if (item.id === 'step01-only-once') {
          E.setDraft(game, c.questions[0].id, 'Вымышленная прежняя запись.', c.id);
          E.saveEntry(game, c.questions[0].id, c.id, new Date('2026-11-01T00:00:00Z'));
        }
      }
      E.saveGame(game); return game;
    }""")


async def normal_layout(page):
    assert await page.evaluate('() => document.documentElement.scrollWidth <= innerWidth + 1')
    buttons = await page.locator('#game button:visible').evaluate_all(
        'nodes => nodes.map(n => ({id:n.dataset.id, height:n.getBoundingClientRect().height}))')
    assert all(b['height'] >= 43.9 for b in buttons), buttons


async def combat_layout(page):
    await page.wait_for_function('() => [...document.images].every(i => i.complete && i.naturalWidth > 0)')
    result = await page.evaluate("""() => {
      const rect = n => {const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom,r:r.right};};
      const skills = [...document.querySelectorAll('.g-skill')];
      return {width:innerWidth,height:innerHeight,scrollY,
        overflowX:document.documentElement.scrollWidth-innerWidth,
        overflowY:document.documentElement.scrollHeight-innerHeight,
        nodes:[...document.querySelectorAll('.g-bar,.g-foe-small,.g-battle-log,.g-skill')].map(rect),
        skills:skills.map(n=>{const r=n.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {...rect(n),hit:n===hit||n.contains(hit)};}),
        bars:document.querySelectorAll('.g-bar').length,
        foe:rect(document.querySelector('.g-foe-small'))};
    }""")
    assert result['overflowX'] <= 1 and result['overflowY'] <= 1 and result['scrollY'] <= 1, result
    assert result['bars'] == 2 and len(result['skills']) == 6, result
    assert all(n['x'] >= -1 and n['y'] >= -1 and n['r'] <= result['width']+1 and n['b'] <= result['height']+1 for n in result['nodes']), result
    assert all(n['h'] >= 60.9 and n['hit'] for n in result['skills']), result
    minimum = 150 if result['width'] == 390 else 96
    assert min(result['foe']['w'], result['foe']['h']) >= minimum, result


async def skill(page, name):
    button = page.locator('[data-act="skill"][data-id="' + name + '"]')
    assert await button.is_enabled()
    before = (await stored(page))['battle']['state']['turn']
    box = await button.bounding_box()
    await page.mouse.click(box['x'] + box['width']/2, box['y'] + box['height']/2)
    data = await stored(page)
    assert 'battle' not in data or data['battle']['state']['turn'] > before, name


async def battle_probe(page, depth, width, height):
    await page.set_viewport_size({'width': width, 'height': height})
    await page.locator('[data-act="fight"][data-id="fight05-shame"]').click()
    await page.locator('[data-act="fight-start"]').click()
    await combat_layout(page)
    hint = await page.locator('[data-id="name-resentment"] small').inner_text()
    assert str(6*depth) + ' урона' in hint and 'слой ' + str(depth) in hint, hint
    # Two genuine damaging turns leave enough missing HP to observe full healing.
    for _ in range(2):
        await skill(page, 'will')
        await combat_layout(page)
    await skill(page, 'worth')
    state = (await stored(page))['battle']['state']
    assert state['open']
    assert any(line.get('heal') and line['text'].startswith('+' + str(3*depth) + ' ') for line in state['log']), state
    assert await page.locator('[data-id="worth"]').is_disabled()
    await combat_layout(page)
    before = state['foe']
    await skill(page, 'name-resentment')
    state = (await stored(page))['battle']['state']
    assert before-state['foe'] == 6*depth, state
    await combat_layout(page)
    await page.screenshot(path=str(OUT / f'combat-depth{depth}-{width}.png'))
    snapshot = await stored(page)
    await page.reload(wait_until='networkidle')
    await ready(page)
    assert (await stored(page))['battle'] == snapshot['battle']
    await combat_layout(page)
    await page.locator('[data-act="menu"]').first.click()


async def chapter(page, item, branch, reload_checks=False):
    await page.locator('[data-act="play"][data-id="' + item['id'] + '"]').click()
    transcript, journals = set(), 0
    for turn in range(300):
        await normal_layout(page)
        transcript.add(await page.locator('#game').inner_text())
        if await page.locator('.g-ending').count():
            assert (await stored(page))['chapters'][item['id']]['done']
            assert journals == 1, (item['id'], journals)
            await page.locator('[data-act="menu"]').first.click()
            return '\n'.join(transcript)
        area = page.locator('#g-answer')
        if await area.count():
            journals += 1
            question = await area.get_attribute('data-question')
            draft = 'Вымышленный черновик четвёртого шага.'
            if reload_checks:
                await area.fill(draft)
                await page.wait_for_function('(a) => JSON.parse(localStorage.getItem(a.key)).journal[a.id]?.draft === a.text', arg={'key':KEY,'id':question,'text':draft})
                await page.reload(wait_until='networkidle')
                await ready(page)
                assert await area.input_value() == draft
                assert await area.get_attribute('data-question') == question
            await page.locator('[data-act="journal-later"]').click()
            entry = (await stored(page))['journal'][question]
            assert entry['later'] and not entry['text']
            if reload_checks:
                assert entry['draft'] == draft
            continue
        choices = page.locator('[data-act="choose"]')
        if await choices.count():
            assert await choices.count() == 2
            await choices.nth(branch).click()
        else:
            await page.locator('button[data-act="next"]').click()
            if reload_checks and turn == 0:
                state = (await stored(page))['chapters'][item['id']]
                await page.reload(wait_until='networkidle')
                await ready(page)
                assert (await stored(page))['chapters'][item['id']] == state
    raise AssertionError('Chapter did not end: ' + item['id'])


async def run_branch(browser, base, branch, index, errors):
    context = await browser.new_context(base_url=base, viewport={'width':390,'height':664}, has_touch=True, is_mobile=True, reduced_motion='reduce')
    page = await context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('response', lambda r: errors.append(f'HTTP {r.status}: {r.url}') if r.status >= 400 else None)
    await page.goto('/game/', wait_until='networkidle')
    await ready(page)
    assert not await page.locator('.g-page').count()
    legacy = await seed(page)
    await page.goto('/game/', wait_until='networkidle')
    await ready(page)
    layers = [c for c in index['chapters'] if c.get('page') and c['step'] == 4]
    assert len(layers) == 15
    try:
        for depth in [1,2,3]:
            for item in [c for c in layers if c['depth'] == depth]:
                assert await page.locator('.g-page').count() == 5
                assert await page.locator('.g-load-row i').first.evaluate(
                    "node => getComputedStyle(node).transitionDuration === '0s'")
                assert await page.locator('[data-act="play"][data-id="'+item['id']+'"]').count() == 1
                for later in [c for c in layers if c['page'] == item['page'] and c['depth'] > depth]:
                    assert not await page.locator('[data-act="play"][data-id="'+later['id']+'"]').count()
                if depth == 1:
                    assert not await page.locator('[data-act="fight"][data-id="fight05-shame"]').count()
                await chapter(page, item, branch, reload_checks=depth == 1 and item == layers[0])
            if depth in [1,3]:
                assert await page.locator('[data-act="fight"][data-id="fight05-shame"]').count() == 1
                for width,height in VIEWPORTS:
                    await normal_layout(page)
                    await battle_probe(page, depth, width, height)
        assert await page.locator('.g-page.is-full').count() == 5
        await page.locator('[data-act="fight"][data-id="fight05-shame"]').click()
        await page.locator('[data-act="fight-start"]').click()
        await skill(page, 'worth')
        for name in ['name-resentment','name-fear','name-deed']:
            await combat_layout(page)
            await skill(page, name)
        assert (await stored(page))['fights']['fight05-shame']['won']
        assert await page.locator('.g-ending').count() == 1
        assert await page.locator('.g-ending h2').inner_text() == 'Стыд отступил'
        await page.locator('[data-act="menu"]').first.click()
        final = next(c for c in index['chapters'] if c['id'] == 'step04-notebook')
        transcript = await chapter(page, final, branch)
        data = await stored(page)
        final_data = json.loads((WEB_ROOT / 'game/data' / final['file']).read_text())
        flags = {v for p in data['chapters'].values() for v in p['choices'].values()}
        bookmarks = [line for scene in final_data['scenes'].values() for line in scene.get('lines',[]) if line.get('if','').endswith('.mark')]
        assert len(bookmarks) == 5
        for line in bookmarks:
            assert (line['text'] in transcript) == (line['if'] in flags), line['id']
        assert all(data['chapters'][k] == v for k,v in legacy['chapters'].items())
        assert all(data['fights'][k] == v for k,v in legacy['fights'].items())
        assert all(data['journal'][k] == v for k,v in legacy['journal'].items())
        await page.reload(wait_until='networkidle')
        await ready(page)
        assert (await stored(page)) == data
        await page.screenshot(path=str(OUT / f'completed-branch{branch}.png'), full_page=True)
        return transcript
    except Exception:
        await page.screenshot(path=str(OUT / f'failure-branch{branch}.png'), full_page=True)
        raise
    finally:
        await context.close()


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    index = json.loads((WEB_ROOT / 'game/data/episodes.json').read_text())
    assert next(s for s in index['steps'] if s['id'] == 4)['layout'] == 'notebook'
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
        async with async_playwright() as p:
            path = os.environ.get('CHROMIUM_PATH')
            try:
                browser = await p.chromium.launch(**({'executable_path':path} if path else {}),args=['--no-sandbox'])
            except Exception:
                if path:
                    raise
                browser = await p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
            endings = [await run_branch(browser,base,branch,index,errors) for branch in [0,1]]
            assert endings[0] != endings[1]
            await browser.close()
        assert not errors, errors
        report = {'passed':True,'branches':2,'layers_per_branch':15,'viewports':VIEWPORTS,'checks':['sequential depths and five-page fight gate','real battle damage/healing/hints at depths one and three','full bounds and center hit tests; six 61px controls','scene, journal draft and battle reload','finale choice bookmarks and legacy save preservation'],'errors':errors}
        (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
        print(json.dumps(report,ensure_ascii=False))
    finally:
        server.terminate()
        server.wait()


if __name__ == '__main__':
    asyncio.run(main())
