"""Browser check for game sound. Run the dev server on 4173 first; saves are fictional.

Sound is synthesized with WebAudio, so the check works on two levels: the events the game
emits while a fictional player taps through scenes and a fight, and the measured level of
every effect and ambience rendered offline in the browser.
"""
import asyncio
import json
import os
import pathlib

from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
BASE = os.environ.get('GAME_TEST_URL', 'http://127.0.0.1:4173')
KEY, SOUND_KEY = '12shagov-game-v1', '12shagov-game-sound'
# Measured full-scale levels: quiet enough not to startle, loud enough for a phone speaker.
EFFECT_PEAK = (0.08, 0.45)
AMBIENCE_RMS = (0.008, 0.05)
AMBIENCE_PEAK = 0.3

MEASURE = '''async () => {
  const sound = await import('/game/sound.js'), result = { effects: {}, ambiences: {} };
  const measure = data => {
    let peak = 0, last = 0, sum = 0;
    for (let i = 0; i < data.length; i++) { const v = Math.abs(data[i]); if (v > peak) peak = v; if (v > 0.002) last = i; sum += v * v; }
    return { peak, rms: Math.sqrt(sum / data.length), seconds: last / 44100 };
  };
  for (const [name, make] of Object.entries(sound.EFFECTS)) {
    const ctx = new OfflineAudioContext(1, 44100 * 4, 44100);
    make(ctx, ctx.destination, 0.02);
    result.effects[name] = measure((await ctx.startRendering()).getChannelData(0));
  }
  for (const [name, make] of Object.entries(sound.AMBIENCES)) {
    const ctx = new OfflineAudioContext(1, 44100 * 8, 44100);
    make(ctx, ctx.destination);
    result.ambiences[name] = measure((await ctx.startRendering()).getChannelData(0));
  }
  return result;
}'''


async def launch_chromium(playwright):
    """CHROMIUM_PATH wins; otherwise Playwright's own browser, then the system Chromium."""
    path = os.environ.get('CHROMIUM_PATH')
    if path:
        return await playwright.chromium.launch(executable_path=path, args=['--no-sandbox'])
    try:
        return await playwright.chromium.launch(args=['--no-sandbox'])
    except Exception:
        return await playwright.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])


def finished_save(until_step):
    index = json.loads((ROOT / 'public/game/data/episodes.json').read_text(encoding='utf-8'))
    save = {'version': 1, 'variant': 'drugs', 'chapters': {}, 'journal': {}, 'fights': {}}
    for item in index['chapters']:
        if item['step'] >= until_step:
            continue
        if item.get('type') == 'fight':
            save['fights'][item['id']] = {'won': True, 'tries': 1}
        else:
            save['chapters'][item['id']] = {'scene': None, 'line': 0, 'choices': {}, 'done': True}
    return json.dumps(save)


async def open_game(page, save, sound=None):
    await page.goto(f'{BASE}/icon.svg')
    await page.evaluate('([key, save, soundKey, sound]) => { localStorage.setItem(key, save); if (sound) localStorage.setItem(soundKey, sound); else localStorage.removeItem(soundKey); }',
                        [KEY, save, SOUND_KEY, sound])
    await page.goto(f'{BASE}/game/', wait_until='networkidle')
    await page.evaluate('''() => { window.__sound = []; document.addEventListener('game-sound', event => window.__sound.push(event.detail.type + ':' + event.detail.name)); }''')


async def events(page, clear=True):
    return await page.evaluate('clear => { const list = window.__sound.slice(); if (clear) window.__sound.length = 0; return list; }', clear)


async def wait_ambience(page, name):
    await page.wait_for_function('name => document.documentElement.dataset.gameAmbience === name', arg=name, timeout=5000)


async def main():
    errors, failures = [], []

    def expect(condition, message):
        if not condition:
            failures.append(message)

    async with async_playwright() as playwright:
        browser = await launch_chromium(playwright)
        context = await browser.new_context(viewport={'width': 390, 'height': 664}, device_scale_factor=1,
                                            has_touch=True, is_mobile=True, reduced_motion='reduce')
        page = await context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('console', lambda message: errors.append(message.text) if message.type in ('error', 'warning') else None)

        # 1. Off by default: no effects, no ambience, nothing stored until the player decides.
        await open_game(page, finished_save(1))
        expect(await page.evaluate('document.documentElement.dataset.gameSound') == 'off', 'sound must be off by default')
        expect(await page.locator('.g-top .g-sound[aria-pressed=false]').count() == 1, 'header sound button missing or pressed')
        expect('выключен' in await page.locator('[data-sound-label]').inner_text(), 'menu label must say sound is off')
        await page.locator('.g-card .g-primary').first.click()
        for _ in range(8):
            await page.locator('.g-next').click()
        expect(await events(page) == [], 'no sound events while sound is off')
        expect(await page.evaluate('document.documentElement.dataset.gameAmbience') == '', 'no ambience while sound is off')
        expect(await page.evaluate('key => localStorage.getItem(key)', SOUND_KEY) is None, 'setting stored before the player chose')

        # 2. Turning sound on in a scene: stored, confirmed with a tone, ambience of the place starts.
        await page.locator('.g-top .g-sound').click()
        expect(await page.locator('.g-top .g-sound[aria-pressed=true]').count() == 1, 'button must show sound is on')
        expect(await page.evaluate('key => localStorage.getItem(key)', SOUND_KEY) == 'on', 'choice was not stored')
        got = await events(page)
        expect('toggle:on' in got and 'effect:choice' in got, f'toggle should confirm with a tone: {got}')
        await wait_ambience(page, 'yard')

        # 3. A choice and a scene change make their sounds; lines inside one scene stay silent.
        await events(page)
        await page.locator('.g-next').click()
        expect([event for event in await events(page) if event.startswith('effect:')] == [], 'a line inside a scene must be silent')
        while await page.locator('.g-next').count():
            await page.locator('.g-next').click()
        await events(page)
        await page.locator('.g-choice').first.click()
        expect('effect:choice' in await events(page), 'choice made no sound')
        while await page.evaluate('''() => JSON.parse(localStorage.getItem('12shagov-game-v1')).chapters['step01-only-once'].scene''') == 's3a-honest':
            await page.locator('.g-next').click()
        expect('effect:scene' in await events(page), 'scene change made no sound')
        await wait_ambience(page, 'kitchen')

        # 4. The setting survives a reload; the ambience returns after the first touch.
        await page.reload(wait_until='networkidle')
        await page.evaluate('''() => { window.__sound = []; document.addEventListener('game-sound', event => window.__sound.push(event.detail.type + ':' + event.detail.name)); }''')
        expect(await page.evaluate('document.documentElement.dataset.gameSound') == 'on', 'setting lost on reload')
        await page.locator('.g-next').click()
        await wait_ambience(page, 'kitchen')

        # 5. Turning it off anywhere silences everything at once.
        await page.locator('.g-top .g-sound').click()
        await wait_ambience(page, '')
        await events(page)
        await page.locator('[data-act=menu]').click()
        expect([event for event in await events(page) if event.startswith('effect:')] == [], 'effects after turning sound off')

        # 6. A fight: tension bed, blocked hit, release, real hit, and silence after the boss.
        await open_game(page, finished_save(2), sound='on')
        await page.locator('details.g-fold').evaluate_all('nodes => nodes.forEach(node => node.open = true)')
        await page.locator('[data-act=fight][data-id=fight04-craving]').click()
        await page.locator('[data-act=fight-start]').click()
        await wait_ambience(page, 'battle')
        await events(page)
        await page.locator('[data-act=skill][data-id=group]').click()
        got = await events(page)
        expect('effect:blocked' in got and 'effect:hitYou' in got and 'effect:hitFoe' not in got, f'armoured turn: {got}')
        await page.locator('[data-act=skill][data-id=admit]').click()
        expect('effect:release' in await events(page), 'admitting must sound like a release')
        await page.locator('[data-act=skill][data-id=call]').click()
        got = await events(page)
        expect(all(name in got for name in ['effect:skill', 'effect:hitFoe', 'effect:heal', 'effect:hitYou']), f'open turn: {got}')
        for _ in range(12):
            if await page.locator('.g-ending').count():
                break
            for skill in ['group', 'truth', 'call', 'pause']:
                button = page.locator(f'[data-act=skill][data-id={skill}]:not([disabled])')
                if await button.count():
                    await button.click()
                    break
        got = await events(page)
        expect(await page.locator('.g-ending').count() == 1, 'boss fight did not end')
        expect('effect:silence' in got and 'effect:win' not in got and 'effect:unlock' not in got, f'boss win must end in silence: {got}')
        await wait_ambience(page, '')

        # An ordinary win sounds different and announces the new level.
        await open_game(page, finished_save(1), sound='on')
        save = json.loads(finished_save(1))
        save['chapters']['step01-only-once'] = {'scene': None, 'line': 0, 'choices': {}, 'done': True}
        await open_game(page, json.dumps(save), sound='on')
        await page.locator('[data-act=fight][data-id=fight01-whisper]').click()
        await page.locator('[data-act=fight-start]').click()
        for _ in range(8):
            if await page.locator('.g-ending').count():
                break
            await page.locator('[data-act=skill][data-id=pause]').click()
        got = await events(page)
        expect('effect:win' in got and 'effect:unlock' in got, f'ordinary win: {got}')

        # 7. Every sound is audible and none is harsh.
        levels = await page.evaluate(MEASURE)
        for name, level in levels['effects'].items():
            expect(EFFECT_PEAK[0] <= level['peak'] <= EFFECT_PEAK[1], f'effect {name}: peak {level["peak"]:.3f} outside {EFFECT_PEAK}')
            expect(0.05 <= level['seconds'] <= 3.5, f'effect {name}: lasts {level["seconds"]:.2f}s')
        for name, level in levels['ambiences'].items():
            expect(AMBIENCE_RMS[0] <= level['rms'] <= AMBIENCE_RMS[1], f'ambience {name}: rms {level["rms"]:.4f} outside {AMBIENCE_RMS}')
            expect(level['peak'] <= AMBIENCE_PEAK, f'ambience {name}: peak {level["peak"]:.3f}')
        loudest_bed = max(level['rms'] for level in levels['ambiences'].values())
        quietest_hit = min(levels['effects'][name]['peak'] for name in ['hitFoe', 'hitYou'])
        expect(quietest_hit > loudest_bed * 4, 'battle hits must stand out above any ambience')

        # 8. The listening page offers every sound and does not touch the game setting.
        await page.evaluate('key => localStorage.removeItem(key)', SOUND_KEY)
        await page.goto(f'{BASE}/game/sounds.html', wait_until='networkidle')
        buttons = await page.locator('button[data-kind]').count()
        expect(buttons == len(levels['effects']) + len(levels['ambiences']) + 1, f'listening page has {buttons} buttons')
        await page.locator('button[data-kind=effect]').first.click()
        await page.locator('button[data-kind=ambience][data-name=river]').click()
        expect('набережная' in await page.locator('#now').inner_text(), 'listening page did not switch ambience')
        expect(await page.evaluate('key => localStorage.getItem(key)', SOUND_KEY) is None, 'listening page changed the game setting')
        await browser.close()

    print(json.dumps({'passed': not errors and not failures, 'effects': len(levels['effects']), 'ambiences': len(levels['ambiences']),
                      'errors': errors, 'failures': failures}, ensure_ascii=False))
    assert not errors, errors
    assert not failures, '\n'.join(failures)


asyncio.run(main())
