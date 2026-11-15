"""Check the delivered APK, so a source preview cannot mask stale packaged assets."""
import hashlib
import pathlib
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
FILES = (
    'index.html', 'js/intro.js', 'css/intro.css', 'js/app.js',
    'images/intro-entity-closed.png', 'images/intro-entity-open.png',
)


def check(apk):
    with zipfile.ZipFile(apk) as archive:
        for name in FILES:
            actual = archive.read('assets/public/' + name)
            expected = (ROOT / 'www' / name).read_bytes()
            if hashlib.sha256(actual).digest() != hashlib.sha256(expected).digest():
                raise ValueError('Stale or different APK asset: ' + name)
        intro = archive.read('assets/public/js/intro.js').decode('utf-8')
        html = archive.read('assets/public/index.html').decode('utf-8')
        assert 'cinematic-entity-v1' in intro, 'Cinematic intro marker missing'
        for legacy in ('var FIGURE', 'ix-figure', 'var FRONT'):
            assert legacy not in intro, 'Legacy illustrated intro remains: ' + legacy
        for name in ('intro-entity-closed.png', 'intro-entity-open.png'):
            assert name in intro, 'Portrait not used by startup: ' + name
        assert 'js/intro.js' in html and 'css/intro.css' in html
    print('APK verified: cinematic startup code and both portraits match source SHA-256; old SVG figure absent.')


if __name__ == '__main__':
    check(sys.argv[1])
