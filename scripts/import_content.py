#!/usr/bin/env python3
"""Preserve supplied sources and build a source-separated, publication-gated index.

Requires Python 3.10+ and Poppler pdftotext/pdfinfo. No network access.
The source PDFs remain in docs/libNarco and are never rewritten.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

SOURCE_SPECS = [
    ('bt5', 'russian-basic-text.pdf', 'Базовый текст, 5-е издание', '5-е издание; Russian Basic Text 5th Edition', False),
    ('bt6', 'БТ6__спец_тираж_.pdf', 'Базовый текст, 6-е издание, специальный тираж', '6-е издание, специальный тираж', False),
    ('white-booklet', 'Белый буклет АН.pdf', 'Белый буклет АН', 'Предоставленный PDF; редакция не подтверждена', False),
    ('step-guide-old', 'rukovodstvo.pdf', 'Руководство к работе по шагам — старый перевод', 'Отдельный перевод из rukovodstvo.pdf', False),
    ('living-clean', 'ЖИТЬ-ЧИСТЫМИ.txt', 'Жить чистыми', 'Предоставленный TXT; редакция не подтверждена', False),
    ('how-why-draft', 'eto-rabotaet_-kak-i-pochemu-chernovik.pdf', 'Это работает: как и почему — черновик перевода', 'Черновой перевод, отдельная редакция', True),
    ('step-guide-2021-draft', 'РУКОВОДСТВО_К_РАБОТЕ_ПО_ШАГАМ_В_АН__черновик_2021_.pdf', 'Руководство к работе по шагам — черновик 2021', 'Черновик перевода 2021, отдельная редакция', True),
    ('traditions-draft', 'Книга_о_Традициях.pdf', 'Путеводные принципы: дух наших Традиций — черновик', 'Черновик перевода, отдельная редакция', True),
]
STEP_NAMES = ['Первый', 'Второй', 'Третий', 'Четвёртый', 'Пятый', 'Шестой', 'Седьмой', 'Восьмой', 'Девятый', 'Десятый', 'Одиннадцатый', 'Двенадцатый']
HEADINGS = [name.upper() + ' ШАГ' for name in STEP_NAMES]
DRAFT_RE = re.compile(r'черновик[.\s,]*(?:перевода|только\s+для|не\s+для\s+продажи)|только\s+для\s+внутреннего\s+использования|не\s+для\s+продажи', re.I)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def copy_tree_files(source: Path, destination: Path) -> None:
    if not source.is_dir():
        raise FileNotFoundError(source)
    for path in sorted(source.rglob('*')):
        if path.is_file() and path.suffix.lower() in {'.pdf', '.txt', '.md'}:
            target = destination / path.relative_to(source)
            target.parent.mkdir(parents=True, exist_ok=True)
            if path.resolve() != target.resolve():
                shutil.copy2(path, target)
            if digest(path) != digest(target):
                raise ValueError(f'Copy differs: {path}')


def pdf_pages(path: Path) -> list[str]:
    # Form feed is Poppler's page boundary. Do not use -nopgbrk here.
    result = subprocess.run(['pdftotext', '-enc', 'UTF-8', str(path), '-'], capture_output=True, check=True)
    pages = result.stdout.decode('utf-8').split('\f')
    if pages and not pages[-1].strip():
        pages.pop()
    return pages


def extract_step_quotes(pages: list[str], updated: str) -> list[dict]:
    quotes = []
    for step_id, heading in enumerate(HEADINGS, 1):
        matches = []
        for page_number, text in enumerate(pages, 1):
            match = re.search(r'^' + re.escape(heading) + r'\s*\n(?P<quote>«[^»]+»[.\u2026]?)', text, re.M)
            if not match:
                continue
            quote = match.group('quote')
            line_start = text[:match.start('quote')].count('\n') + 1
            line_end = line_start + quote.count('\n')
            matches.append({
                'id': step_id, 'name': STEP_NAMES[step_id - 1], 'sourceId': 'bt5',
                'quote': quote, 'page': page_number, 'lineStart': line_start, 'lineEnd': line_end,
                'language': 'ru', 'status': 'unverified', 'publicationVerified': False,
                'published': False, 'updatedAt': updated,
                'locatorConvention': 'PDF page number; lines from pdftotext UTF-8 default extraction',
            })
        if len(matches) != 1:
            raise ValueError(f'Expected one heading and exact quote for step {step_id}, found {len(matches)}')
        quotes.append(matches[0])
    return quotes


def combine_steps(materials: Path, target: Path) -> None:
    parts = []
    for number, name in enumerate(STEP_NAMES, 1):
        path = materials / f'Шаг_{number:02d}_{name}.txt'
        if number > 1:
            parts.append(f'\n\n════════════════════════════════════════\nШАГ {number} — {name.upper()}\n════════════════════════════════════════\n\n'.encode('utf-8'))
        parts.append(path.read_bytes())
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(b''.join(parts))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project-root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--documents-dir', type=Path, help='Optional original docs folder; copies its files byte-for-byte into docs/')
    parser.add_argument('--materials-dir', type=Path, help='Optional original 12 step files and technical briefs folder')
    parser.add_argument('--full-text', type=Path, help='Optional existing combined text file; copied byte-for-byte to outputs/')
    args = parser.parse_args()
    root = args.project_root.resolve()
    docs = root / 'docs'
    materials = docs / 'materials'
    if args.documents_dir:
        copy_tree_files(args.documents_dir.resolve(), docs)
    if args.materials_dir:
        copy_tree_files(args.materials_dir.resolve(), materials)
    combined = root / 'outputs' / 'Все_12_шагов_полный_текст.txt'
    if args.full_text:
        combined.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(args.full_text.resolve(), combined)
        if digest(args.full_text.resolve()) != digest(combined):
            raise ValueError('Combined file copy differs')
    elif materials.is_dir():
        combine_steps(materials, combined)
    generated = datetime.now(timezone.utc).isoformat(timespec='seconds')
    sources = []
    passages = []
    all_pages = {}
    for source_id, filename, title, edition, declared_draft in SOURCE_SPECS:
        path = docs / 'libNarco' / filename
        if not path.is_file():
            raise FileNotFoundError(path)
        pages = pdf_pages(path) if path.suffix == '.pdf' else None
        text = '\n'.join(pages) if pages is not None else path.read_text(encoding='utf-8')
        evidence = DRAFT_RE.search(text)
        draft = declared_draft or bool(evidence)
        status = 'draft' if draft else 'unverified'
        source = {
            'id': source_id, 'title': title, 'file': 'docs/libNarco/' + filename,
            'filename': filename, 'edition': edition, 'language': 'ru',
            'kind': 'pdf' if pages is not None else 'text',
            'sha256': digest(path), 'bytes': path.stat().st_size,
            'pageCount': len(pages) if pages is not None else None,
            'lineCount': len(text.splitlines()) if pages is None else None,
            'status': status,
            'statusLabel': 'Черновик / внутренний материал — не опубликован' if draft else 'Статус публикации и право воспроизведения не подтверждены',
            'publicationVerified': False, 'published': False,
            'updatedAt': generated, 'privatePreviewEligible': not draft,
            'publicationEvidence': None,
            'statusEvidence': evidence.group(0) if evidence else ('Черновой статус указан в имени файла или в предоставленных step*.md' if declared_draft else 'Нет редакторского подтверждения статуса и права публикации'),
        }
        sources.append(source)
        all_pages[source_id] = pages
        # Explicit drafts/internal source content is never exported into the runtime index.
        if draft:
            continue
        if pages is not None:
            for number, page in enumerate(pages, 1):
                if not page.strip():
                    continue
                passages.append({
                    'id': f'{source_id}-p{number}', 'sourceId': source_id, 'page': number,
                    'lineStart': 1, 'lineEnd': len(page.splitlines()), 'text': page.rstrip('\n'),
                    'status': status, 'published': False, 'language': 'ru',
                })
        else:
            lines = text.splitlines()
            start = 0
            for offset, line in enumerate(lines + [''], 1):
                # A paragraph or 32 lines, whichever arrives first, keeps TXT locators precise.
                if (not line.strip() or offset - start >= 32) and offset > start:
                    chunk = lines[start:offset]
                    if any(x.strip() for x in chunk):
                        passages.append({
                            'id': f'{source_id}-l{start+1}', 'sourceId': source_id,
                            'lineStart': start + 1, 'lineEnd': min(offset, len(lines)),
                            'text': '\n'.join(chunk), 'status': status, 'published': False, 'language': 'ru',
                        })
                    start = offset
    bt5 = next(source for source in sources if source['id'] == 'bt5')
    if bt5['status'] == 'draft':
        raise ValueError('Chosen quotation source unexpectedly carries a draft marker')
    quotes = extract_step_quotes(all_pages['bt5'], generated)
    for quote in quotes:
        quote['sourceSha256'] = bt5['sha256']
    # Step number on a passage means chapter scope only; personal stories stay unassigned.
    chapter_bounds = [(quote['page'], quotes[i+1]['page'] if i+1 < len(quotes) else 83, quote['id']) for i, quote in enumerate(quotes)]
    for passage in passages:
        if passage['sourceId'] != 'bt5':
            continue
        for start, end, step in chapter_bounds:
            if start <= passage['page'] <= end:
                passage['step'] = step
                break
    summaries = []
    for step in range(1, 4):
        file = docs / f'step{step:02d}.md'
        text = file.read_text(encoding='utf-8')
        summaries.append({
            'step': step, 'title': text.splitlines()[0].removeprefix('# '),
            'file': f'docs/step{step:02d}.md', 'text': text,
            'kind': 'editorial-summary', 'status': 'editorial-unverified',
            'statusLabel': 'Авторский рабочий пересказ, не дословная и не утверждённая литература',
            'language': 'ru', 'sha256': digest(file), 'updatedAt': generated,
        })
    content = {
        'version': 1, 'generatedAt': generated,
        'defaultPublicationPolicy': 'approved-only',
        'privatePreviewPolicy': {
            'explicitOptInRequired': True, 'eligibleStatuses': ['unverified'],
            'blockedStatuses': ['draft', 'internal', 'withdrawn'],
            'notice': 'Локальная редакторская проверка неподтверждённых материалов. Выбор не меняет статус публикации и не разрешает публичное распространение.',
        },
        'steps': quotes, 'summaries': summaries, 'passages': passages,
    }
    write_json(root / 'public/data/sources.json', sources)
    write_json(root / 'public/data/content.json', content)
    manifest_files = sorted([*(docs / f'step{step:02d}.md' for step in range(1, 4)), *(docs / 'libNarco' / spec[1] for spec in SOURCE_SPECS), *(p for p in materials.rglob('*') if p.is_file())])
    write_json(docs / 'source-manifest.json', {
        'generatedAt': generated, 'policy': 'Original files preserved byte-for-byte. No edition is merged with another.',
        'files': [{'file': str(p.relative_to(root)), 'sha256': digest(p), 'bytes': p.stat().st_size} for p in manifest_files if p.name != 'source-manifest.json'],
        'combined': {'file': str(combined.relative_to(root)), 'sha256': digest(combined), 'bytes': combined.stat().st_size} if combined.exists() else None,
    })
    print(f'Preserved {len(manifest_files)} original files; indexed {len(sources)} sources, {len(quotes)} exact step quotations, {len(summaries)} editorial summaries, {len(passages)} gated passages.')
    print('All sources remain unpublished and unverified unless explicitly marked draft. Explicit draft content is excluded from public/data.')


if __name__ == '__main__':
    main()
