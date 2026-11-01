#!/usr/bin/env python3
"""Verify preserved originals, source locators and draft publication gates."""
from pathlib import Path
import hashlib
import json
import subprocess

ROOT = Path(__file__).resolve().parents[1]
load = lambda path: json.loads((ROOT / path).read_text(encoding='utf-8'))
hash_file = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
manifest = load('docs/source-manifest.json')
for item in manifest['files']:
    file = ROOT / item['file']
    assert file.is_file(), f'Missing original {file}'
    assert hash_file(file) == item['sha256'], f'Original changed: {file}'
combined = manifest.get('combined')
if combined:
    assert hash_file(ROOT / combined['file']) == combined['sha256'], 'Combined file differs from manifest'
content = load('public/data/content.json')
sources = load('public/data/sources.json')
by_id = {source['id']: source for source in sources}
assert len(sources) == 8, 'Expected 8 separately identified sources'
assert len(content['steps']) == 12, 'Expected 12 source quotations'
assert len(content['summaries']) == 3, 'Expected 3 supplied editorial summaries'
assert content['defaultPublicationPolicy'] == 'approved-only'
assert all(source['published'] is False for source in sources)
assert all(source['publicationVerified'] is False for source in sources)
assert {s['id'] for s in sources if s['status'] == 'draft'} == {'how-why-draft', 'step-guide-2021-draft', 'traditions-draft'}
for passage in content['passages']:
    source = by_id[passage['sourceId']]
    assert source['status'] not in {'draft', 'internal'}, 'Draft source text leaked into runtime data'
    assert passage['status'] == source['status'] and passage['published'] is False
pages_by_id = {}
for source in sources:
    path = ROOT / source['file']
    assert hash_file(path) == source['sha256'], f'Source hash mismatch: {path}'
    if source['kind'] == 'pdf':
        pages = subprocess.check_output(['pdftotext', '-enc', 'UTF-8', str(path), '-']).decode('utf-8').split('\f')
        if pages and not pages[-1].strip():
            pages.pop()
        assert len(pages) == source['pageCount']
        pages_by_id[source['id']] = pages
for expected_id, quote in enumerate(content['steps'], 1):
    assert quote['id'] == expected_id and quote['sourceId'] == 'bt5'
    assert quote['sourceSha256'] == by_id['bt5']['sha256']
    page = pages_by_id['bt5'][quote['page'] - 1]
    assert quote['quote'] in page, f'Quote {expected_id} is not verbatim'
    lines = page.splitlines()
    assert '\n'.join(lines[quote['lineStart'] - 1:quote['lineEnd']]) == quote['quote'], f'Quote {expected_id} line locator differs'
for summary in content['summaries']:
    path = ROOT / summary['file']
    assert hash_file(path) == summary['sha256'] and path.read_text() == summary['text']
# The combined file contains exact source blocks and nothing except the stated dividers.
names = ['Первый', 'Второй', 'Третий', 'Четвёртый', 'Пятый', 'Шестой', 'Седьмой', 'Восьмой', 'Девятый', 'Десятый', 'Одиннадцатый', 'Двенадцатый']
parts = []
for step, name in enumerate(names, 1):
    if step > 1:
        parts.append(f'\n\n════════════════════════════════════════\nШАГ {step} — {name.upper()}\n════════════════════════════════════════\n\n'.encode('utf-8'))
    parts.append((ROOT / 'docs/materials' / f'Шаг_{step:02d}_{name}.txt').read_bytes())
assert (ROOT / 'outputs/Все_12_шагов_полный_текст.txt').read_bytes() == b''.join(parts)
print(f'Content verified: {len(manifest["files"])} unchanged originals, 12 exact quotes with valid page/line locators, {len(content["passages"])} gated passages; explicit drafts excluded.')
