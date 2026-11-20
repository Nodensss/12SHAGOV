"""Step Six: all four fictional habit loops through the real mobile UI.

Only Steps One–Five are seeded with pure engine helpers. GAME_WEB_ROOT can
target dist, CHROMIUM_PATH selects a browser, and GAME_REVIEW_DIR holds evidence.
"""
import asyncio
import json
import os
from pathlib import Path
import socket
import subprocess
import urllib.request

from playwright.async_api import async_playwright


ROOT = Path(__file__).resolve().parents[1]
WEB = Path(os.environ.get('GAME_WEB_ROOT', str(ROOT / 'public')))
OUT = Path(os.environ.get('GAME_REVIEW_DIR', os.environ.get('REVIEW_DIR', str(ROOT.parent / 'scratch/game-step06-review'))))
KEY = '12shagov-game-v1'
INDEX = None
STEP = None
CHAPTERS = {}
LOOPS = ['lie', 'strike', 'control', 'leave']
VIEWPORTS = [(390, 664), (320, 568)]


async def ready(page):
    await page.wait_for_function('() => !!document.querySelector("#game")?.dataset.view')
    assert not await page.get_by_text('Игра не открылась', exact=True).count()


async def stored(page):
    return await page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', KEY)


def picked(game):
    flags = {cid for cid, progress in game['chapters'].items() if progress['done']}
    flags.update(value for progress in game['chapters'].values() for value in progress['choices'].values())
    flags.update(fid for fid, fight in game['fights'].items() if fight['won'])
    return flags


def passes(line, game):
    flags = picked(game)
    if line.get('if') and line['if'] not in flags:
        return False
    if line.get('ifNot') and line['ifNot'] in flags:
        return False
    if line.get('ifAny') and not any(flag in flags for flag in line['ifAny']):
        return False
    if line.get('ifNone') and any(flag in flags for flag in line['ifNone']):
        return False
    if line.get('depth'):
        depth = line['depth']
        count = sum(flag in flags for flag in depth['of'])
        if not depth['min'] <= count <= depth['max']:
            return False
    return True


async def seed(page, depth, modes):
    # Leaving the running game first prevents pagehide overwriting the fixture.
    await page.goto('/icon.svg')
    return await page.evaluate('''async ({depth, modes}) => {
      const E = await import('/game/engine.js');
      const index = await (await fetch('/game/data/episodes.json')).json();
      const g = E.freshGame(); g.variant = 'drugs';
      for (const item of index.chapters.filter(c => c.step < 6)) {
        if (item.step === 4 && item.page && item.depth > depth) continue;
        if (item.type === 'fight') E.recordFight(g, item.id, true);
        else E.markDone(g, item.id);
      }
      const talk = index.steps.find(s => s.id === 5);
      for (const p of talk.pages) {
        const mode = modes[p.id] || 'read';
        g.chapters[p.chapter].choices[p.choice] = mode === 'reread' ? p.soften : p[mode];
        if (mode === 'reread') g.chapters[p.chapter].choices[p.revisitChoice] = p.reread;
      }
      g.chapters['step04-notebook'].choices['s4-fin.choice'] = 's4-fin.choice.read';
      E.setDraft(g, 'q.step01.repeat', 'Вымышленная прежняя запись.', 'step01-only-once');
      E.saveEntry(g, 'q.step01.repeat', 'step01-only-once', new Date('2026-11-01T00:00:00Z'));
      E.setDraft(g, 'q.step01.plan', 'Вымышленный прежний черновик.', 'step01-only-once');
      g.journal['q.step01.plan'].later = true;
      E.saveGame(g); return g;
    }''', {'depth': depth, 'modes': modes})


async def layout(page, choices=False):
    assert await page.evaluate('() => document.documentElement.scrollWidth <= innerWidth + 1')
    buttons = await page.locator('#game button:visible').evaluate_all('''nodes => nodes.map(n => ({
      text: n.textContent, height: n.getBoundingClientRect().height
    }))''')
    assert all(button['height'] >= 43.9 for button in buttons), buttons
    if choices:
        boxes = await page.locator('[data-act="choose"]').evaluate_all('''nodes => nodes.map(n => {
          const r = n.getBoundingClientRect();
          const hit = document.elementFromPoint(r.x+r.width/2, r.y+r.height/2);
          return {x:r.x, y:r.y, right:r.right, bottom:r.bottom,
            hit:hit===n || n.contains(hit), width:innerWidth, height:innerHeight};
        })''')
        assert boxes and all(b['x'] >= -1 and b['y'] >= -1 and b['right'] <= b['width']+1
                                 and b['bottom'] <= b['height']+1 and b['hit'] for b in boxes), boxes


async def reload_same(page, cid):
    state = (await stored(page))['chapters'][cid]
    await page.reload(wait_until='networkidle')
    await ready(page)
    assert (await stored(page))['chapters'][cid] == state, cid


async def one_assignment(page, cid, cell, option, keyboard=None):
    selector = ('[data-act="habit-assign"][data-id="' + cell['id']
                + '"][data-option="' + option['id'] + '"]')
    button = page.locator(selector)
    before = await stored(page)
    # Each toggle must save one ordinary choices update, not a second state tree.
    await page.evaluate('''key => {
      if (!window.__habitOriginalSetItem) {
        window.__habitOriginalSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function(k, v) {
          if (k === key) window.__habitWrites++;
          return window.__habitOriginalSetItem.call(this, k, v);
        };
      }
      window.__habitWrites = 0;
    }''', KEY)
    if keyboard:
        await button.focus()
        await button.press(keyboard)
    else:
        await button.click()
    after = await stored(page)
    assert await page.evaluate('() => window.__habitWrites') == 1
    assert after['chapters'][cid]['choices'][cell['id']] == option['id']
    expected = json.loads(json.dumps(before))
    expected['chapters'][cid]['choices'][cell['id']] = option['id']
    assert after == expected, (cid, cell['id'])
    assert await button.get_attribute('aria-pressed') == 'true'
    assert await button.evaluate('n => n === document.activeElement')
    peers = page.locator('.g-habit-cell[data-cell="' + cell['id'] + '"] [aria-pressed="true"]')
    assert await peers.count() == 1


async def habit_map(page, cid, scene, alternate, evidence=False, reload_checks=False):
    assert await page.locator('.g-habit-map').count() == 1
    assert await page.locator('.g-habit-map h2').evaluate('n => n === document.activeElement')
    assert await page.locator('.g-habit-cell').count() == 4
    assert await page.locator('[data-act="habit-assign"]').count() == 8
    next_button = page.locator('[data-act="habit-next"]')
    assert await next_button.is_disabled()
    for i, cell in enumerate(scene['cells']):
        group = page.locator('.g-habit-cell[data-cell="' + cell['id'] + '"]')
        assert await group.locator('legend').inner_text() == cell['title']
        assert await group.locator('[data-act="habit-assign"]').all_inner_texts() == [o['text'] for o in cell['options']]
        # Both statements describe an aspect of the same fictional loop.
        first, second = cell['options'][alternate], cell['options'][1-alternate]
        await one_assignment(page, cid, cell, first, 'Enter' if i == 0 else 'Space' if i == 1 else None)
        if evidence:
            await one_assignment(page, cid, cell, second, 'Space')
            await one_assignment(page, cid, cell, first, 'Enter')
        assert await next_button.is_disabled() == (i < 3)
        if reload_checks and i == 1:
            snapshot = (await stored(page))['chapters'][cid]['choices']
            await reload_same(page, cid)
            assert await page.locator('[data-act="habit-assign"][aria-pressed="true"]').count() == 2
            assert (await stored(page))['chapters'][cid]['choices'] == snapshot
            assert await next_button.is_disabled()
    await layout(page)
    assert await page.locator('[data-act="habit-assign"][aria-pressed="true"]').count() == 4
    if evidence:
        await page.screenshot(path=str(OUT / (cid + '-map.png')), full_page=True)
    await next_button.click()
    assert not await page.locator('.g-habit-map').count()
    assert await page.locator('.g-next, .g-choice, h2').first.evaluate('n => n === document.activeElement')


async def journal(page, cid, drafts=False):
    area = page.locator('#g-answer')
    if drafts:
        first = await area.get_attribute('data-question')
        await area.fill('Вымышленная пауза шестого шага.')
        await page.locator('[data-act="other-question"]').click()
        second = await area.get_attribute('data-question')
        assert first != second
        assert await area.evaluate('n => n === document.activeElement')
        await area.fill('Вымышленная граница шестого шага.')
        await page.wait_for_function('''a => JSON.parse(localStorage.getItem(a.key)).journal[a.id]?.draft === a.text''',
                                     arg={'key': KEY, 'id': second, 'text': 'Вымышленная граница шестого шага.'})
        await reload_same(page, cid)
        assert await area.get_attribute('data-question') == second
        assert await area.input_value() == 'Вымышленная граница шестого шага.'
        data = await stored(page)
        assert data['chapters'][cid]['question'] == second
        assert data['journal'][first]['draft'] == 'Вымышленная пауза шестого шага.'
        await page.locator('[data-act="other-question"]').click()
        assert await area.get_attribute('data-question') == first
        assert await area.input_value() == 'Вымышленная пауза шестого шага.'
    question = await area.get_attribute('data-question')
    await page.locator('[data-act="journal-later"]').click()
    entry = (await stored(page))['journal'][question]
    assert entry['later'] and not entry['text']


async def play(page, cid, mark=None, repeat='new', alternate=0, checks=False, evidence=None, last_loop=False):
    chapter = CHAPTERS[cid]
    seen = {}
    visited = set()
    choices = []
    story_reloaded = False
    choice_reloads = set()
    journals = maps = 0
    for _ in range(400):
        await layout(page)
        data = await stored(page)
        # Opening a new story renders its first line before the first save.
        # The first Next action persists progress; no fixture touches Step Six.
        progress = data['chapters'].get(cid, {'scene': chapter['start'], 'line': 0, 'choices': {}, 'done': False})
        sid = progress['scene']
        scene = chapter['scenes'][sid]
        visited.add(sid)
        visible = [line for line in scene.get('lines', []) if passes(line, data)]
        if scene['type'] == 'story':
            actual = await page.locator('.g-line p').all_inner_texts()
            expected = [line['text'] for line in visible[:progress['line']+1]]
            assert actual == expected, (cid, sid, actual, expected)
            seen.setdefault(sid, set()).update(actual)
        elif scene['type'] == 'ending':
            actual = await page.locator('.g-ending p').all_inner_texts()
            for line in scene.get('lines', []):
                assert (line['text'] in actual) == passes(line, data), (cid, sid, line['id'])
            seen.setdefault(sid, set()).update(actual)
            assert progress['done']
            assert maps == (1 if mark else 0), (cid, maps)
            assert journals == (1 if any(s['type'] == 'journal' for s in chapter['scenes'].values()) else 0)
            if mark:
                loop = cid.removeprefix('step06-')
                assert progress['choices']['s6-' + loop + '.ready'] == 's6-' + loop + '.ready.' + mark
                assert ('s6-' + loop + '-' + mark) in visited
                if mark == 'try':
                    assert len(choices) == 2
                    assert progress['choices']['s6-' + loop + '.second'] == 's6-' + loop + '.second.' + repeat
                    assert 's6-' + loop + '-' + repeat in visited
                    assert 's6-' + loop + '-' + ('old' if repeat == 'new' else 'new') not in visited
                else:
                    assert len(choices) == 1
                    assert 's6-' + loop + '-try' not in visited
                    assert 's6-' + loop + '.second' not in progress['choices']
            if evidence:
                await page.screenshot(path=str(OUT / (evidence + '-ending.png')), full_page=True)
            await page.locator('[data-act="menu"]').first.click()
            heading = page.locator('.g-section-loops h2')
            assert await heading.evaluate('n => n === document.activeElement')
            assert 45 <= (await heading.bounding_box())['y'] < 200
            return {'text': seen, 'visited': visited, 'save': data}
        elif scene['type'] == 'habit-map':
            maps += 1
            await habit_map(page, cid, scene, alternate, evidence=bool(evidence), reload_checks=checks)
            continue
        elif scene['type'] == 'journal':
            journals += 1
            await journal(page, cid, drafts=checks)
            continue
        options = page.locator('[data-act="choose"]')
        if await options.count():
            await layout(page, choices=True)
            count = await options.count()
            assert count in [2, 3]
            if count == 3:
                assert await options.all_inner_texts() == [STEP['labels'][key] for key in ['try', 'watch', 'hold']]
                suffix = mark
            else:
                assert mark == 'try'
                suffix = repeat
            if checks and count not in choice_reloads:
                await reload_same(page, cid)
                await layout(page, choices=True)
                choice_reloads.add(count)
            if evidence:
                await page.screenshot(path=str(OUT / (evidence + f'-choice{count}.png')))
            button = page.locator('[data-act="choose"][data-id$=".' + suffix + '"]')
            choices.append(await button.get_attribute('data-id'))
            await button.click()
            if checks:
                await reload_same(page, cid)
            if last_loop and count == 3:
                # Four readiness marks alone do not complete four stories.
                state = (await stored(page))['chapters'][cid]
                assert not state['done']
                await page.locator('[data-act="menu"]').first.click()
                assert not await page.locator('[data-act="play"][data-id="step06-ask"]').count()
                await page.locator('.g-loop-node[data-id="' + cid + '"]').click()
                assert (await stored(page))['chapters'][cid] == state
        else:
            await page.locator('button[data-act="next"]').click()
            if checks and not story_reloaded and progress['line'] == 0:
                await reload_same(page, cid)
                story_reloaded = True
    raise AssertionError('Chapter did not finish: ' + cid)


async def offline(page, context):
    await page.evaluate('''async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, {once:true}));
      }
    }''')
    await context.set_offline(True)
    await page.reload(wait_until='networkidle')
    await ready(page)
    # The index and six chapters are the seven new/changed JSON assets.
    for path in ['episodes.json'] + [item['file'] for item in INDEX['chapters'] if item['step'] == 6]:
        assert await page.evaluate('async path => (await fetch("/game/data/" + path)).ok', path), path


async def profile(browser, base, name, depth, modes, mark, repeat, viewport, errors, whole_offline=False):
    context = await browser.new_context(base_url=base, viewport={'width': viewport[0], 'height': viewport[1]},
                                        is_mobile=True, has_touch=True, reduced_motion='reduce')
    page = await context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('response', lambda response: errors.append('HTTP ' + str(response.status) + ' ' + response.url)
            if response.status >= 400 else None)
    try:
        await page.goto('/game/', wait_until='networkidle')
        await ready(page)
        assert not await page.locator('[data-act="play"][data-id="step06-week"]').count()
        legacy = await seed(page, depth, modes)
        await page.goto('/game/', wait_until='networkidle')
        await ready(page)
        assert await page.locator('.g-loop-node').count() == 4
        assert await page.locator('.g-loop-node:disabled').count() == 4
        if whole_offline:
            await offline(page, context)
        await page.locator('[data-act="play"][data-id="step06-week"]').click()
        await play(page, 'step06-week')
        section = page.locator('.g-section-loops')
        assert await section.get_attribute('data-step-section') == '6'
        assert await page.locator('.g-loop-node').count() == 4
        order = await page.locator('.g-loop-node').evaluate_all('nodes => nodes.map(n => n.dataset.loop)')
        assert set(order) == set(LOOPS)
        await section.evaluate('n => scrollTo(0, n.getBoundingClientRect().top + scrollY - 64)')
        await page.screenshot(path=str(OUT / (name + '-loops.png')), full_page=True)
        results = {}
        # Different arbitrary orders demonstrate that no loop unlocks another.
        chosen_order = list(reversed(LOOPS)) if name in ['try-new', 'watch'] else ['control', 'lie', 'leave', 'strike']
        for n, loop in enumerate(chosen_order):
            cid = 'step06-' + loop
            assert not await page.locator('[data-act="play"][data-id="step06-ask"]').count()
            node = page.locator('.g-loop-node[data-loop="' + loop + '"]')
            assert await node.get_attribute('data-act') == 'play'
            await node.click()
            results[cid] = await play(page, cid, mark, repeat, alternate=int(name in ['try-old', 'hold']),
                                      checks=n == 0, evidence=name + '-' + loop if n == 0 else None,
                                      last_loop=n == 3)
            assert await page.locator('.g-loop-node').count() == 4
            assert await page.locator('.g-loop-node.is-complete').count() == n + 1
            assert await page.locator('.g-loop-node[data-loop="' + loop + '"]').get_attribute('data-mode') == mark
            assert await page.locator('[data-act="play"][data-id="step06-ask"]').count() == (1 if n == 3 else 0)
        await page.locator('[data-act="play"][data-id="step06-ask"]').click()
        results['step06-ask'] = await play(page, 'step06-ask', evidence=name + '-final')
        data = await stored(page)
        assert data['version'] == 1
        assert set(data) == set(legacy)
        for key in ['chapters', 'fights', 'journal']:
            for ident, value in legacy[key].items():
                assert data[key][ident] == value, (key, ident)
        await page.reload(wait_until='networkidle')
        await ready(page)
        assert await stored(page) == data
        if not whole_offline:
            await offline(page, context)
            assert await stored(page) == data
        # Offline replay uses the real completed-loop control and resets only that loop.
        await page.locator('.g-loop-node[data-loop="lie"]').click()
        assert (await stored(page))['chapters']['step06-lie']['scene'] == 's6-lie-first'
        assert not (await stored(page))['chapters']['step06-lie']['choices']
        await page.locator('[data-act="menu"]').first.click()
        assert await page.locator('.g-section-loops h2').evaluate('n => n === document.activeElement')
        return {'chapters': results, 'fixture': legacy}
    except Exception:
        await page.screenshot(path=str(OUT / ('failure-' + name + '.png')), full_page=True)
        raise
    finally:
        await context.close()


def compare_dependencies(shallow, deep, unread, reread):
    depth_changes = read_changes = 0
    for loop in LOOPS:
        cid, sid = 'step06-' + loop, 's6-' + loop + '-first'
        lines = CHAPTERS[cid]['scenes'][sid]['lines']
        a = shallow['chapters'][cid]['text'][sid]
        b = deep['chapters'][cid]['text'][sid]
        c = unread['chapters'][cid]['text'][sid]
        d = reread['chapters'][cid]['text'][sid]
        assert a == d, ('Read and reread must both count as read', cid)
        for line in lines:
            if line.get('depth') and passes(line, shallow['fixture']) != passes(line, deep['fixture']):
                assert (line['text'] in a) != (line['text'] in b), line['id']
                depth_changes += 1
            if (line.get('ifAny') or line.get('ifNone')) and passes(line, deep['fixture']) != passes(line, unread['fixture']):
                assert (line['text'] in b) != (line['text'] in c), line['id']
                read_changes += 1
    assert depth_changes >= 4, depth_changes
    assert read_changes >= 8, read_changes
    return {'depth_callback_lines': depth_changes, 'step05_callback_lines': read_changes}


async def main():
    global INDEX, STEP, CHAPTERS
    OUT.mkdir(parents=True, exist_ok=True)
    INDEX = json.loads((WEB / 'game/data/episodes.json').read_text())
    STEP = next(step for step in INDEX['steps'] if step['id'] == 6)
    assert STEP['layout'] == 'loops' and STEP['after'] == 'step05-after'
    assert STEP['intro'] == 'step06-week' and STEP['finale'] == 'step06-ask'
    own = [item for item in INDEX['chapters'] if item['step'] == 6]
    assert len(own) == 6 and all('page' not in item for item in own)
    final = next(item for item in own if item['id'] == 'step06-ask')
    assert final['needs'] == {'count': 4, 'of': ['step06-' + loop for loop in LOOPS]}
    CHAPTERS = {item['id']: json.loads((WEB / 'game/data' / item['file']).read_text()) for item in own}
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    server = subprocess.Popen(['python3', '-m', 'http.server', str(port), '--bind', '127.0.0.1', '--directory', str(WEB)],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    errors = []
    try:
        for _ in range(50):
            try:
                urllib.request.urlopen(base + '/game/', timeout=1).close()
                break
            except OSError:
                await asyncio.sleep(.1)
        async with async_playwright() as playwright:
            path = os.environ.get('CHROMIUM_PATH')
            try:
                browser = await playwright.chromium.launch(**({'executable_path': path} if path else {}), args=['--no-sandbox'])
            except Exception:
                if path:
                    raise
                browser = await playwright.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
            read = {page['id']: 'read' for page in next(step for step in INDEX['steps'] if step['id'] == 5)['pages']}
            soft_later = {pid: 'soften' if i % 2 else 'later' for i, pid in enumerate(read)}
            reread = {pid: 'reread' for pid in read}
            shallow = await profile(browser, base, 'try-new', 1, read, 'try', 'new', VIEWPORTS[0], errors)
            deep = await profile(browser, base, 'try-old', 3, read, 'try', 'old', VIEWPORTS[1], errors)
            unread = await profile(browser, base, 'watch', 3, soft_later, 'watch', 'new', VIEWPORTS[1], errors)
            held = await profile(browser, base, 'hold', 1, reread, 'hold', 'new', VIEWPORTS[0], errors, whole_offline=True)
            dependencies = compare_dependencies(shallow, deep, unread, held)
            await browser.close()
        assert not errors, errors
        report = {'passed': True, 'profiles': 4, 'loops_per_profile': 4, 'viewports': VIEWPORTS,
                  'checks': ['all three readiness marks for every loop', 'both repeat choices for every loop',
                             'eight map toggles, reassignment, one save, keyboard and focus',
                             'all four completions gate finale; all held still finishes',
                             'real conditional text at depths one and three and four Step Five states',
                             'story, two map cells, readiness, repeat and two journal drafts reload',
                             'legacy v1 chapters, fights and journals preserved',
                             'full offline Step Six flow, seven JSON assets and replay'],
                  **dependencies, 'errors': errors}
        (OUT / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
        print(json.dumps(report, ensure_ascii=False))
    finally:
        server.terminate()
        server.wait()


if __name__ == '__main__':
    asyncio.run(main())
