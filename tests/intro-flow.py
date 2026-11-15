"""Cold-start checks for the actual bundled intro (no intro-disabling fixture)."""
import asyncio
import json
import os
import pathlib
import socket
import subprocess
import urllib.request

from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
WEB_ROOT = pathlib.Path(os.environ.get('INTRO_WEB_ROOT', str(ROOT / 'www')))
CHROMIUM = os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium')
OUT = pathlib.Path(os.environ.get('INTRO_REVIEW_DIR', str(ROOT.parent / 'scratch' / 'intro-review')))
OUT.mkdir(parents=True, exist_ok=True)


async def main():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    base = 'http://127.0.0.1:' + str(port) + '/'
    server = subprocess.Popen(
        ['python3', '-m', 'http.server', str(port), '--bind', '127.0.0.1', '--directory', str(WEB_ROOT)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    errors, failed_assets = [], []
    report = {'screenshots': str(OUT), 'checks': []}

    async def checked_page(context):
        page = await context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('response', lambda response: failed_assets.append(response.url)
                if response.status >= 400 and response.url.startswith(base) else None)
        return page

    async def wait_intro(page):
        intro = page.locator('.intro.ci-intro[data-intro-version="cinematic-entity-v1"]')
        await intro.wait_for()
        await page.wait_for_function("""() => {
          const images = [...document.querySelectorAll('.ci-intro img')];
          return images.length >= 2 && images.every(i => i.complete && i.naturalWidth >= 1024);
        }""")
        await page.locator('.ci-start').wait_for(state='visible')
        await page.wait_for_function("!document.querySelector('.ci-start').disabled")
        assert await page.locator('.ix-figure').count() == 0
        assert await page.locator('img[src$="intro-entity-closed.png"]').count() >= 1
        assert await page.locator('img[src$="intro-entity-open.png"]').count() >= 1
        return intro

    async def closed(page):
        await page.locator('.ci-intro').wait_for(state='detached')
        assert await page.evaluate('location.hash') == '#/step/1'
        assert await page.evaluate("document.body.style.overflow !== 'hidden'")
        assert not await page.evaluate("[...document.body.children].some(el => el.inert)")
        await page.locator('.step-engine').wait_for()

    try:
        for _ in range(50):
            try:
                urllib.request.urlopen(base, timeout=1).close()
                break
            except OSError:
                await asyncio.sleep(.1)
        else:
            raise AssertionError('Test HTTP server did not start')

        async with async_playwright() as p:
            browser = await p.chromium.launch(executable_path=CHROMIUM, args=['--no-sandbox'])
            context = await browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1)
            page = await checked_page(context)

            # The first navigation uses defaults and the real launch route.
            await page.goto(base, wait_until='networkidle')
            intro = await wait_intro(page)
            assert await page.evaluate('Intro.settings()') == {'auto': True, 'sound': False}
            assert await page.evaluate('location.hash') == '#/step/1'
            assert await intro.get_attribute('data-scene') == 'waiting'
            assert await page.locator('.ci-sound').get_attribute('aria-pressed') == 'false'
            await page.evaluate('document.fonts.ready')
            await page.screenshot(path=str(OUT / 'startup-390.png'))

            # Controls and keyboard focus must stay usable on short and wide screens.
            for width, height in [(320, 568), (390, 844), (844, 390)]:
                await page.set_viewport_size({'width': width, 'height': height})
                assert not await page.evaluate('document.documentElement.scrollWidth > innerWidth')
                for selector in ['.ci-sound', '.ci-skip', '.ci-start']:
                    box = await page.locator(selector).bounding_box()
                    assert box and box['x'] >= 0 and box['y'] >= 0, (selector, width, height, box)
                    assert box['x'] + box['width'] <= width + 1, (selector, width, height, box)
                    assert box['y'] + box['height'] <= height + 1, (selector, width, height, box)
                for _ in range(8):
                    await page.keyboard.press('Tab')
                    assert await page.evaluate("document.querySelector('.ci-intro').contains(document.activeElement)")
                await page.screenshot(path=str(OUT / ('startup-' + str(width) + 'x' + str(height) + '.png')))
            await page.set_viewport_size({'width': 390, 'height': 844})
            await page.locator('.ci-skip').click()
            await closed(page)
            report['checks'].append('default cold start, bundled images, focus trap, layouts, skip, scroll restore')

            # A full real-time run proves that opening/falling reaches the final action.
            await page.evaluate('Intro.play()')
            await wait_intro(page)
            await page.evaluate('Intro.play()')
            assert await page.locator('.ci-intro').count() == 1
            await page.locator('.ci-start').click()
            await page.wait_for_timeout(4600)
            assert await intro.get_attribute('data-scene') == 'opening'
            await page.screenshot(path=str(OUT / 'opening-book.png'))
            await page.wait_for_function("document.querySelector('.ci-intro').dataset.scene === 'falling'", timeout=7000)
            await page.screenshot(path=str(OUT / 'entering-book.png'))
            await page.wait_for_function("document.querySelector('.ci-intro').dataset.scene === 'ready'", timeout=32000)
            await page.locator('.ci-enter').wait_for(state='visible')
            await page.wait_for_function("Number(getComputedStyle(document.querySelector('.ci-final')).opacity) > .95")
            await page.screenshot(path=str(OUT / 'intro-final.png'))
            await page.locator('.ci-enter').click()
            await closed(page)
            report['checks'].append('complete opening, camera dive, prologue, final entry, idempotent replay')

            # Escape works before playback and leaves no inert or locked document.
            await page.evaluate('Intro.play()')
            await wait_intro(page)
            await page.keyboard.press('Escape')
            await closed(page)
            report['checks'].append('Escape cleanup')

            # Both scene images must be available during an offline cold start.
            await page.evaluate('navigator.serviceWorker.ready')
            await page.wait_for_function('!!navigator.serviceWorker.controller')
            await context.set_offline(True)
            await page.reload(wait_until='networkidle')
            await wait_intro(page)
            await page.locator('.ci-skip').click()
            await closed(page)
            await context.set_offline(False)
            report['checks'].append('offline cold start with both scene images')
            await context.close()

            reduced = await browser.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce')
            page = await checked_page(reduced)
            await page.goto(base, wait_until='networkidle')
            await wait_intro(page)
            assert await page.evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches")
            await page.locator('.ci-start').click()
            await page.wait_for_timeout(4000)
            # Reduced motion must never scale the camera into a moving tunnel.
            transform = await page.locator('.ci-camera').evaluate('(el) => getComputedStyle(el).transform')
            assert transform in ['none', 'matrix(1, 0, 0, 1, 0, 0)'], transform
            await page.keyboard.press('Escape')
            await closed(page)
            report['checks'].append('system reduced-motion avoids camera movement')
            await reduced.close()

            saved = await browser.new_context(viewport={'width': 390, 'height': 844})
            await saved.add_init_script("localStorage.setItem('twelve-steps:intro', JSON.stringify({auto:false,sound:true}))")
            page = await checked_page(saved)
            await page.goto(base + '#/about', wait_until='networkidle')
            assert await page.locator('.ci-intro').count() == 0
            assert await page.evaluate('location.hash') == '#/about'
            assert await page.evaluate('Intro.settings()') == {'auto': False, 'sound': True}
            report['checks'].append('saved settings and explicit deep link preserved')
            await saved.close()
            await browser.close()

        assert not errors, errors
        assert not failed_assets, failed_assets
        report.update({'passed': True, 'js_errors': errors, 'failed_assets': failed_assets})
        (OUT / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
        print(json.dumps(report, ensure_ascii=False))
    finally:
        server.terminate()
        server.wait()


asyncio.run(main())
