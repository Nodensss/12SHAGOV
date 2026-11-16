"""Run the existing dev server on 4173; use fictional, temporary browser saves."""
import asyncio
import json
import os
import pathlib

from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
BASE = os.environ.get('GAME_TEST_URL', 'http://127.0.0.1:4173')
VIEWPORTS = [(390, 844), (390, 664), (320, 568), (844, 390)]
SHORT_PORTRAIT = {(390, 664), (320, 568)}


async def check_layout(page, label, selectors, *, strict, above_footer=()):
    """Check real geometry and hit targets without scrolling elements into view."""
    result = await page.evaluate('''({selectors, aboveFooter, strict}) => {
      const issues = [], footer = document.querySelector('.g-foot');
      const footerTop = footer?.getBoundingClientRect().top ?? innerHeight;
      const root = document.documentElement;
      const log = document.querySelector('.g-battle-log');
      if (strict && log && log.scrollHeight > log.clientHeight + 1)
        issues.push(`log content height ${log.scrollHeight} > visible ${log.clientHeight}`);
      if (root.scrollWidth > innerWidth + 1) issues.push(`page width ${root.scrollWidth} > ${innerWidth}`);
      if (strict && root.scrollHeight > innerHeight + 1) issues.push(`page height ${root.scrollHeight} > ${innerHeight}`);
      if (strict && (scrollX !== 0 || scrollY !== 0)) issues.push(`page scrolled ${scrollX},${scrollY}`);
      function inspect(node, name, beforeFooter, button) {
        const r = node.getBoundingClientRect();
        if (button && node.classList.contains('g-skill') && r.height < 61) issues.push(`${name}: skill button shrunk below original 61px minimum`);
        if (button && r.height < 44) issues.push(`${name}: touch height ${r.height} < 44`);
        if (!strict) return;
        if (r.width <= 0 || r.height <= 0 || r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1)
          issues.push(`${name}: bounds ${JSON.stringify(r.toJSON())}, viewport ${innerWidth}x${innerHeight}`);
        if (beforeFooter && r.bottom > footerTop + 1)
          issues.push(`${name}: bottom ${r.bottom} covered by footer starting ${footerTop}`);
        // Corners as well as centre catch partially covered bottom-row controls.
        const hitRects = getComputedStyle(node).display === 'inline' ? [...node.getClientRects()] : [r];
        for (const rect of hitRects) {
          const dx = Math.min(12, rect.width / 4), dy = Math.min(12, rect.height / 4);
          const points = [
            [rect.left + dx, rect.top + dy], [rect.right - dx, rect.top + dy],
            [rect.left + dx, rect.bottom - dy], [rect.right - dx, rect.bottom - dy],
            [rect.left + rect.width / 2, rect.top + rect.height / 2]
          ];
          for (const [x, y] of points) {
            const hit = document.elementFromPoint(x, y);
            if (!hit || !(hit === node || node.contains(hit))) {
              issues.push(`${name}: point ${Math.round(x)},${Math.round(y)} covered by ${hit?.className ?? 'outside viewport'}`);
              break;
            }
          }
        }
      }
      for (const selector of selectors) {
        const nodes = [...document.querySelectorAll(selector)];
        if (!nodes.length) issues.push(`missing ${selector}`);
        for (const node of nodes) inspect(node, selector, aboveFooter.includes(selector), false);
      }
      for (const node of document.querySelectorAll('button')) {
        if (getComputedStyle(node).display !== 'none' && node.getClientRects().length)
          inspect(node, `button ${node.dataset.id || node.dataset.act}`, false, true);
      }
      return issues;
    }''', {'selectors': selectors, 'aboveFooter': list(above_footer), 'strict': strict})
    return [f'{label}: {issue}' for issue in result]


async def prepare_save(page):
    return await page.evaluate('''async () => {
      const E = await import('/game/engine.js');
      const index = await (await fetch('/game/data/episodes.json')).json();
      const game = E.freshGame();
      game.variant = 'drugs';
      for (const chapter of index.chapters) {
        if (chapter.type === 'fight') E.recordFight(game, chapter.id, true);
        else E.markDone(game, chapter.id);
      }
      return JSON.stringify(game);
    }''')


async def start_boss(page, save):
    await page.goto(f'{BASE}/icon.svg')
    await page.evaluate('(save) => localStorage.setItem("12shagov-game-v1", save)', save)
    await page.goto(f'{BASE}/game/', wait_until='networkidle')
    await page.locator('details.g-fold').evaluate_all('nodes => nodes.forEach(node => node.open = true)')
    await page.locator('[data-act=fight][data-id=fight04-craving]').click()
    await page.locator('[data-act=fight-start]').click()
    await page.evaluate('scrollTo(0, 0)')


async def main():
    failures, errors = [], []
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        context = await browser.new_context(
            viewport={'width': 390, 'height': 844}, reduced_motion='reduce')
        page = await context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        await page.goto(f'{BASE}/game/', wait_until='networkidle')
        save = await prepare_save(page)
        await page.locator('[data-act=variant]').click()
        assert await page.locator('.g-hero').count() == 8
        assert await page.locator('.g-hero.is-locked').count() == 7
        for width, height in VIEWPORTS:
            await page.set_viewport_size({'width': width, 'height': height})
            strict = (width, height) in SHORT_PORTRAIT or (width, height) == (390, 844)
            for index in range(8):
                await page.locator('.g-carousel').evaluate(
                    '(node, index) => node.scrollTo({left:index * node.clientWidth, behavior:"instant"})', index)
                await page.wait_for_timeout(100)
                assert await page.locator('#g-pick').is_disabled() == (index != 0)
                hero = f'.g-hero:nth-child({index + 1})'
                selectors = [f'{hero} .g-step', f'{hero} h2', f'{hero} .g-quote', f'{hero} .g-lore', '.g-dots']
                failures += await check_layout(page, f'hero {index} {width}x{height}', selectors,
                                               strict=strict, above_footer=selectors)
        # Each size starts fresh: admit must be usable before any other attack.
        # A real coordinate click cannot silently scroll a hidden control into view.
        for width, height in VIEWPORTS:
            await page.set_viewport_size({'width': width, 'height': height})
            await start_boss(page, save)
            strict = (width, height) in SHORT_PORTRAIT or (width, height) == (390, 844)
            if (width, height) == (390, 844):
                assert (await page.locator('.g-foe').bounding_box())['width'] >= 230
            assert await page.locator('.g-skill').count() == 6
            assert await page.locator('.g-skill-icon').count() == 6
            assert await page.locator('.g-bar').count() == 2
            selectors = ['.g-bar-foe', '.g-foe', '.g-battle-log', '.g-bar-you', '.g-skill']
            for turn, skill in enumerate([None, 'admit', 'truth', 'group', 'call']):
                label = f'boss {width}x{height} turn {turn} {skill or "initial"}'
                if skill:
                    button = page.locator(f'[data-act=skill][data-id={skill}]')
                    assert await button.is_enabled(), label
                    rect = await button.bounding_box()
                    before = await page.locator('.g-battle-log').inner_text()
                    if strict:
                        await page.mouse.click(rect['x'] + rect['width'] / 2, rect['y'] + rect['height'] / 2)
                    else:
                        await button.click()
                    await page.wait_for_timeout(80)
                    if await page.locator('.g-battle-log').count() != 1:
                        failures.append(f'{label}: battle ended before layout sequence finished')
                        break
                    after = await page.locator('.g-battle-log').inner_text()
                    if before == after:
                        failures.append(f'{label}: coordinate click did not perform skill')
                        break
                    if skill == 'admit':
                        assert await page.locator('[data-act=skill][data-id=admit]').is_disabled(), label
                assert await page.locator('.g-bar').count() == 2, label
                assert await page.locator('.g-skill').count() == 6, label
                assert set(await page.locator('.g-skill').evaluate_all(
                    'nodes => nodes.map(node => node.dataset.id)')) == {
                        'will', 'pause', 'call', 'truth', 'admit', 'group'}, label
                failures += await check_layout(page, label, selectors, strict=strict,
                                               above_footer=['.g-bar-foe', '.g-foe', '.g-battle-log', '.g-bar-you'])
                # Every log paragraph must also fit; a clipped log container is insufficient.
                if strict:
                    failures += await check_layout(page, label + ' log text', ['.g-battle-log p'],
                                                   strict=True, above_footer=['.g-battle-log p'])
        # Armor responses differ: also test every available first move, including
        # the wordier blocked-will and blocked-pause turns, on both short phones.
        for width, height in sorted(SHORT_PORTRAIT):
            await page.set_viewport_size({'width': width, 'height': height})
            for first_skill in ['will', 'pause', 'call', 'truth', 'admit', 'group']:
                await page.goto('about:blank')
                await start_boss(page, save)
                rect = await page.locator(f'[data-act=skill][data-id={first_skill}]').bounding_box()
                await page.mouse.click(rect['x'] + rect['width'] / 2, rect['y'] + rect['height'] / 2)
                await page.wait_for_timeout(80)
                visible = ['.g-bar-foe', '.g-battle-log', '.g-battle-log p', '.g-bar-you', '.g-skill']
                failures += await check_layout(page, f'closed armor {width}x{height} {first_skill}',
                                               visible, strict=True,
                                               above_footer=visible[:-1])
        await page.locator('[data-act=menu]').first.click()
        await page.locator('[data-act=bag]').click()
        await page.wait_for_function('() => [...document.images].every(image => image.complete && image.naturalWidth)')
        assert await page.locator('.g-find-icon').count() == 19
        assert await page.locator('.g-find.is-unknown .g-find-icon').count() > 0
        assert await page.locator('.g-find.is-unknown .g-find-icon').first.evaluate(
            "node => getComputedStyle(node).filter.includes('brightness(0)')")
        await page.evaluate('navigator.serviceWorker.ready')
        await page.wait_for_function('!!navigator.serviceWorker.controller')
        await context.set_offline(True)
        assets = [variant['art'] for variant in json.loads(
            (ROOT / 'public/game/data/vocab.json').read_text())['variants']]
        assets += ['art/ui-frame.svg', 'art/ui-grain.svg']
        for filename, key in [('skills.json', 'skills'), ('items.json', 'items')]:
            assets += [item['icon'] for item in json.loads((ROOT / 'public/game/data' / filename).read_text())[key]]
        for asset in assets:
            assert await page.evaluate('async asset => (await fetch(asset)).ok', asset), asset
        await browser.close()
    assert not errors, errors
    assert not failures, '\n'.join(failures)
    print(json.dumps({'passed': True, 'locked_heroes': 7, 'touch44': True,
                      'viewports': [f'{w}x{h}' for w, h in VIEWPORTS],
                      'battle_buttons': 6, 'full_bounds_and_hit_testing': True,
                      'offline_assets': len(assets), 'errors': errors}))


asyncio.run(main())
