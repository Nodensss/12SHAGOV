"""Рисует иконки приложения (лестница + точка) для PWA и Android.

Запуск из корня репозитория:  python3 scripts/make_icons.py
Нужен Pillow (pip install pillow).
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
BG = (47, 111, 98)        # #2f6f62
FG = (255, 255, 255)
SS = 4                    # суперсэмплинг для гладких краёв


def glyph(draw, box, color):
    """Лестница из четырёх ступеней и точка над ней в квадрате box."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    pts = [(0, 1), (0, .75), (.25, .75), (.25, .5), (.5, .5), (.5, .25),
           (.75, .25), (.75, 0), (1, 0), (1, 1)]
    draw.polygon([(x0 + px * w, y0 + py * h) for px, py in pts], fill=color)
    r = .11 * w
    cx, cy = x0 + .16 * w, y0 + .2 * h
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)


def render(size, shape, glyph_frac, transparent=False):
    S = size * SS
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if not transparent:
        if shape == 'round':
            d.ellipse([0, 0, S - 1, S - 1], fill=BG)
        elif shape == 'rounded':
            d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * .22), fill=BG)
        else:
            d.rectangle([0, 0, S, S], fill=BG)
    g = S * glyph_frac
    off = (S - g) / 2
    glyph(d, (off, off + g * .02, off + g, off + g * 1.02), FG)
    return img.resize((size, size), Image.LANCZOS)


def splash(w, h):
    img = Image.new('RGB', (w, h), (246, 244, 239))
    s = int(min(w, h) * .28)
    icon = render(s, 'rounded', .56)
    img.paste(icon, ((w - s) // 2, (h - s) // 2), icon)
    return img


def main():
    web = ROOT / 'www' / 'icons'
    web.mkdir(parents=True, exist_ok=True)
    render(192, 'rounded', .56).save(web / 'icon-192.png')
    render(512, 'rounded', .56).save(web / 'icon-512.png')
    render(512, 'square', .42).save(web / 'icon-maskable-512.png')

    res = ROOT / 'android' / 'app' / 'src' / 'main' / 'res'
    if not res.exists():
        print('android/ не найден — сгенерированы только веб-иконки')
        return
    dens = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
    for name, k in dens.items():
        out = res / f'mipmap-{name}'
        render(int(48 * k), 'rounded', .56).save(out / 'ic_launcher.png')
        render(int(48 * k), 'round', .5).save(out / 'ic_launcher_round.png')
        # адаптивная иконка: 108dp, видимая зона ~66dp в центре
        render(int(108 * k), 'square', .36, transparent=True).save(out / 'ic_launcher_foreground.png')
    sizes = {'mdpi': (320, 480), 'hdpi': (480, 800), 'xhdpi': (720, 1280),
             'xxhdpi': (960, 1600), 'xxxhdpi': (1280, 1920)}
    for name, (w, h) in sizes.items():
        splash(w, h).save(res / f'drawable-port-{name}' / 'splash.png')
        splash(h, w).save(res / f'drawable-land-{name}' / 'splash.png')
    splash(480, 800).save(res / 'drawable' / 'splash.png')
    (res / 'values' / 'ic_launcher_background.xml').write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
        '    <color name="ic_launcher_background">#2F6F62</color>\n</resources>\n', encoding='utf-8')
    print('Иконки и заставки обновлены')


if __name__ == '__main__':
    main()
