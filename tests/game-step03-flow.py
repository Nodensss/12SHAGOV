"""Browser acceptance for Step Three; uses fictional saves and real game controls.

Run with Playwright and Chromium installed. GAME_WEB_ROOT may point to dist/.
No application dependencies or personal records are used by this check.
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
OUT = pathlib.Path(os.environ.get('GAME_REVIEW_DIR', str(ROOT.parent / 'scratch' / 'game-step03-review')))
CHROMIUM = os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium')
OUT.mkdir(parents=True, exist_ok=True)
KEY = '12shagov-game-v1'


async def seed_old_save(page):
    """Finish the existing two steps with their engine, leaving a v1 save."""
    return await page.evaluate("""async () => {
      const E = await import('/game/engine.js');
      const index = await (await fetch('/game/data/episodes.json')).json();
      const game = E.freshGame();
      game.variant = 'drugs';
      let oldQuestion, oldChapter;
      for (const item of index.chapters.filter(item => item.step < 3)) {
        if (item.type === 'fight') { E.recordFight(game, item.id, true); continue; }
        if (item.type === 'trial') { E.markDone(game, item.id); continue; }
        const chapter = await (await fetch('/game/data/' + item.file)).json();
        oldQuestion ||= chapter.questions[0]?.id;
        oldChapter ||= chapter.id;
        const progress = E.progressOf(game, chapter);
        let finished = false;
        for (let guard = 0; guard < 500; guard++) {
          const stage = E.stage(progress, chapter, game);
          if (stage === 'ending') { finished = true; break; }
          if (stage === 'choice') E.choose(progress, chapter, chapter.scenes[progress.scene].choice.options[0].id, game);
          else if (stage === 'journal') E.leaveJournal(progress, chapter, game);
          else E.advance(progress, chapter, game);
        }
        if (!finished) throw Error('Existing chapter did not finish: ' + item.id);
      }
      E.setDraft(game, oldQuestion, 'Вымышленная старая запись для проверки сохранения.', oldChapter);
      E.saveEntry(game, oldQuestion, oldChapter, new Date('2026-11-01T09:00:00Z'));
      if (!E.saveGame(game)) throw Error('Unable to seed fictional save');
      return {chapters: JSON.parse(JSON.stringify(game.chapters)),
              fights: JSON.parse(JSON.stringify(game.fights)),
              question: oldQuestion, entry: JSON.parse(JSON.stringify(game.journal[oldQuestion]))};
    }""")


async def stored(page):
    return await page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', KEY)


async def layout(page):
    assert not await page.evaluate('document.documentElement.scrollWidth > innerWidth + 1'), 'Horizontal page overflow'
    sizes = await page.locator('#game button:visible').evaluate_all("""nodes => nodes.map(node => ({
      action: node.dataset.act, height: node.getBoundingClientRect().height
    }))""")
    assert all(button['height'] >= 44 - .1 for button in sizes), sizes


async def wait_game(page):
    await page.wait_for_function("document.querySelector('#game')?.dataset.view")
    assert await page.locator('text=Игра не открылась').count() == 0


async def play_step(page, context, chapters, branch, report):
    saved_first_question = None
    later_question = None
    final_text = None
    for number, item in enumerate(chapters):
        await page.locator('[data-act="play"][data-id="' + item['id'] + '"]').click()
        for guard in range(400):
            await layout(page)
            if await page.locator('.g-ending').count():
                assert (await stored(page))['chapters'][item['id']]['done']
                if item.get('final'):
                    final_text = await page.locator('.g-ending').inner_text()
                    await page.screenshot(path=str(OUT / ('final-branch-' + str(branch) + '.png')), full_page=True)
                await page.locator('[data-act="menu"]').first.click()
                break

            if await page.locator('.g-steering').count():
                assign = page.locator('[data-act="steering-assign"]')
                part_ids = await assign.evaluate_all("nodes => [...new Set(nodes.map(node => node.dataset.id))]")
                assert len(part_ids) == 3, (item['id'], part_ids)
                assert await page.locator('[data-act="steering-next"]').is_disabled()
                first_part = part_ids[0]
                if number == 0 and branch == 0:
                    assert await page.evaluate('scrollY < 2'), 'Entering steering kept the previous scene scroll'
                    await page.screenshot(path=str(OUT / 'steering-390.png'), full_page=True)
                    await page.screenshot(path=str(OUT / 'steering-390-phone.png'))
                    for width in [320, 390]:
                        await page.set_viewport_size({'width': width, 'height': 844})
                        await layout(page)
                    first = page.locator('[data-act="steering-assign"][data-id="' + first_part + '"][data-zone="act"]')
                    await first.focus()
                    scroll_before = await page.evaluate('scrollY')
                    await page.keyboard.press('Enter')
                    assert await first.get_attribute('aria-pressed') == 'true'
                    assert await first.evaluate('(node) => node === document.activeElement'), 'Selection lost keyboard focus'
                    assert abs(await page.evaluate('scrollY') - scroll_before) < 2, 'Choosing a zone jumped the page'
                    act_response = await page.locator('.g-steering-response').first.inner_text()
                    help_choice = page.locator('[data-act="steering-assign"][data-id="' + first_part + '"][data-zone="help"]')
                    await help_choice.click()
                    help_response = await page.locator('.g-steering-response').first.inner_text()
                    assert act_response != help_response, 'Steering zones have identical response text'
                    assert await page.locator('[data-act="steering-assign"][aria-pressed="true"]').count() == 1
                    await first.click()
                    await page.screenshot(path=str(OUT / 'steering-response.png'), full_page=True)
                    before = await stored(page)
                    before_chapter = before['chapters'][item['id']]
                    await page.evaluate('navigator.serviceWorker.ready')
                    await page.wait_for_function('!!navigator.serviceWorker.controller')
                    await context.set_offline(True)
                    await page.reload(wait_until='networkidle')
                    await wait_game(page)
                    assert await page.locator('.g-steering').count() == 1
                    assert (await stored(page))['chapters'][item['id']] == before_chapter
                    assert await first.get_attribute('aria-pressed') == 'true'
                    assert await page.locator('[data-act="steering-next"]').is_disabled()
                    report['checks'].append('partial steering choice and scene resume offline after reload; keyboard focus; all zone responses')
                zone = 'act' if branch == 0 else 'release'
                for part_id in part_ids:
                    await page.locator('[data-act="steering-assign"][data-id="' + part_id + '"][data-zone="' + zone + '"]').click()
                assert await page.locator('[data-act="steering-assign"][aria-pressed="true"]').count() == len(part_ids)
                assert await page.locator('[data-act="steering-next"]').is_enabled()
                await page.locator('[data-act="steering-next"]').click()
                await context.set_offline(False)
                continue

            if await page.locator('#g-answer').count():
                area = page.locator('#g-answer')
                question = await area.get_attribute('data-question')
                if number == 0 and branch == 0:
                    first_question = question
                    first_draft = 'Вымышленная первая мысль о третьем шаге.'
                    await area.fill(first_draft)
                    await page.locator('[data-act="other-question"]').click()
                    question = await area.get_attribute('data-question')
                    assert question != first_question, 'The second journal question did not open'
                    draft = 'Вымышленный черновик третьего шага: один посильный поступок.'
                    await area.fill(draft)
                    await page.wait_for_function("""({key, id, draft}) => JSON.parse(localStorage.getItem(key))?.journal[id]?.draft === draft""", arg={'key': KEY, 'id': question, 'draft': draft})
                    await page.reload(wait_until='networkidle')
                    await wait_game(page)
                    assert await area.input_value() == draft
                    assert await area.get_attribute('data-question') == question
                    assert (await stored(page))['journal'][first_question]['draft'] == first_draft
                    for _ in range(3):
                        await page.locator('[data-act="other-question"]').click()
                        if await area.get_attribute('data-question') == first_question:
                            break
                    assert await area.get_attribute('data-question') == first_question
                    assert await area.input_value() == first_draft
                    for _ in range(3):
                        await page.locator('[data-act="other-question"]').click()
                        if await area.get_attribute('data-question') == question:
                            break
                    assert await area.get_attribute('data-question') == question
                    assert await area.input_value() == draft
                    await page.locator('[data-act="journal-save"]').click()
                    saved_first_question = question
                    await page.screenshot(path=str(OUT / 'journal-saved.png'))
                    report['checks'].append('two journal drafts and selected second question survive reload; save entry')
                else:
                    if later_question is None:
                        await area.fill('Вымышленная мысль, к которой можно вернуться позже.')
                        later_question = question
                    await page.locator('[data-act="journal-later"]').click()
                continue

            choices = page.locator('[data-act="choose"]')
            if await choices.count():
                assert await choices.count() == 2
                await choices.nth(branch).click()
            else:
                next_button = page.locator('button[data-act="next"]')
                assert await next_button.count() == 1, (item['id'], await page.locator('#game').inner_text())
                await next_button.click()
        else:
            raise AssertionError('Step Three chapter did not finish: ' + item['id'])

    data = await stored(page)
    assert all(data['chapters'][item['id']]['done'] for item in chapters)
    if saved_first_question:
        assert data['journal'][saved_first_question]['text'].startswith('Вымышленный черновик третьего шага')
    if later_question:
        entry = data['journal'][later_question]
        assert entry['later'] and not entry['text']
        assert entry['draft'] == 'Вымышленная мысль, к которой можно вернуться позже.'
    await page.locator('[data-act="bag"]').click()
    assert await page.locator('.g-find:not(.is-unknown)').count() > 0
    await page.locator('[data-act="menu"]').first.click()
    return final_text


async def main():
    index = json.loads((WEB_ROOT / 'game/data/episodes.json').read_text())
    chapters = [item for item in index['chapters'] if item['step'] == 3]
    assert len(chapters) == 6, 'Expected five situations and a finale'
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    base = 'http://127.0.0.1:' + str(port)
    server = subprocess.Popen(['python3', '-m', 'http.server', str(port), '--bind', '127.0.0.1', '--directory', str(WEB_ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    errors, failed_assets, external = [], [], []
    report = {'screenshots': str(OUT), 'checks': []}
    page = None
    try:
        for _ in range(50):
            try:
                urllib.request.urlopen(base + '/game/', timeout=1).close()
                break
            except OSError:
                await asyncio.sleep(.1)
        else:
            raise AssertionError('Test HTTP server did not start')
        async with async_playwright() as p:
            browser = await p.chromium.launch(executable_path=CHROMIUM, args=['--no-sandbox'])
            endings = []
            for branch in [0, 1]:
                context = await browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1, has_touch=True, is_mobile=True, reduced_motion='reduce')
                page = await context.new_page()
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.on('response', lambda response: failed_assets.append(response.url) if response.status >= 400 and response.url.startswith(base) else None)
                page.on('request', lambda request: external.append(request.url) if not request.url.startswith(base) else None)
                await page.goto(base + '/game/', wait_until='networkidle')
                await wait_game(page)
                third = page.locator('.g-section').filter(has=page.get_by_role('heading', name='Решение', exact=True))
                assert 'is-locked' in (await third.get_attribute('class'))
                assert await third.locator('button[data-act="play"]').count() == 0
                # Leave the running game before seeding: its pagehide handler
                # correctly saves its own in-memory state on navigation.
                await page.goto(base + '/icon.svg', wait_until='load')
                checkpoint = await seed_old_save(page)
                await page.goto(base + '/game/', wait_until='networkidle')
                await wait_game(page)
                assert 'is-locked' not in (await third.get_attribute('class'))
                if branch == 0:
                    await page.screenshot(path=str(OUT / 'step03-menu.png'), full_page=True)
                    report['checks'].append('Step Three opens after old Step Two finale; legacy v1 save loads')
                endings.append(await play_step(page, context, chapters, branch, report))
                data = await stored(page)
                assert all(data['chapters'][key] == value for key, value in checkpoint['chapters'].items()), 'Previous chapter progress changed'
                assert data['fights'] == checkpoint['fights'], 'Previous fight results changed'
                assert data['journal'][checkpoint['question']] == checkpoint['entry'], 'Previous journal entry changed'
                await context.close()
            assert endings[0] != endings[1], 'Step Three finale does not react to decisions'
            report['checks'].append('all six chapters through both action branches; different finale; legacy notes/progress intact; later drafts retained; findings available')
            await browser.close()
        assert not errors, errors
        assert not failed_assets, failed_assets
        assert not external, external
        report.update({'passed': True, 'js_errors': errors, 'failed_assets': failed_assets, 'external_requests': external})
        (OUT / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
        print(json.dumps(report, ensure_ascii=False))
    except Exception:
        if page and not page.is_closed():
            try:
                await page.screenshot(path=str(OUT / 'failure.png'), full_page=True)
            except Exception:
                pass
        raise
    finally:
        server.terminate()
        server.wait()


asyncio.run(main())
