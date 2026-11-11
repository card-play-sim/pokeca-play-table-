#!/usr/bin/env python3
"""Build a release registry from individually verified official image checkpoints."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
from tempfile import TemporaryDirectory
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / 'data/official-image-registry.json'
BASE = 'https://www.pokemon-card.com'
SEARCH = BASE + '/card-search/resultAPI.php?keyword=&regulation_sidebar_form=all&page='


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def read_checkpoints(source, baseline):
    identity = json.loads((source / 'baseline.json').read_bytes())
    old = json.loads(baseline)
    if identity['sha256'] != sha256(baseline) or identity['count'] != len(old['cards']):
        raise ValueError('BASELINE_CHANGED')
    known = {row['officialCardId'] for row in old['cards']} | set(identity['reservedIds'])
    urls = {row['imageSourceUrl'] for row in old['cards']}
    prints = {(row['set'], re.sub(r'\s+', '', row['cardNumber'])) for row in old['cards']
              if row.get('set') and row.get('cardNumber')}
    search_pages = {}
    rows = []
    for path in sorted((source / 'records').glob('*.json'), key=lambda item: int(item.stem)):
        raw = path.read_bytes()
        item = json.loads(raw)
        row, proof = item['record'], item['evidence']
        ident = row['officialCardId']
        print_key = row['set'], row['cardNumber']
        url = row['imageSourceUrl']
        if path.stem != ident or ident in known or print_key in prints or url in urls:
            raise ValueError(f'NEW_IDENTITY_CONFLICT {ident}')
        if not re.fullmatch(r'[0-9]+/[A-Za-z0-9-]+', print_key[1]) or re.sub(r'\s+', '', row['cardNumberRaw']) != print_key[1]:
            raise ValueError(f'NUMBER_MISMATCH {ident}')
        if (not re.fullmatch(r'[0-9a-f]{64}', proof['detailSha256']) or row['verified'] is not True
                or row['namePreviewEligible'] is not False or row['deckPrintAdopted'] is not False):
            raise ValueError(f'DETAIL_EVIDENCE_INVALID {ident}')
        if not proof['searchUrl'].startswith(SEARCH):
            raise ValueError(f'SEARCH_SOURCE_INVALID {ident}')
        page = proof['searchUrl'][len(SEARCH):]
        if not re.fullmatch(r'[1-9][0-9]*', page):
            raise ValueError(f'SEARCH_PAGE_INVALID {ident}')
        if page not in search_pages:
            response = (source / 'search' / f'{page}.json').read_bytes()
            search_pages[page] = (sha256(response), json.loads(response)['cardList'])
        page_hash, candidates = search_pages[page]
        candidate = proof['candidate']
        if (page_hash != proof['searchSha256'] or candidate not in candidates
                or candidate['cardID'] != ident or candidate['cardNameAltText'] != row['name']
                or urljoin(BASE, candidate['cardThumbFile']) != url):
            raise ValueError(f'SEARCH_EVIDENCE_MISMATCH {ident}')
        rows.append((row, proof, sha256(raw)))
        known.add(ident)
        prints.add(print_key)
        urls.add(url)
    return old, identity, rows


def stage(source, minimum):
    baseline = REGISTRY.read_bytes()
    old, identity, rows = read_checkpoints(source, baseline)
    if not rows or len(old['cards']) + len(rows) < minimum:
        raise ValueError('INSUFFICIENT_VERIFIED_REFERENCES')
    with TemporaryDirectory() as temp:
        tmp = Path(temp)
        input_path = tmp / 'input.json'
        input_path.write_text(compact([row for row, _, _ in rows]), encoding='utf-8')
        imported = tmp / 'imported'
        subprocess.run(['node', str(ROOT / 'tools/import-image-registry.mjs'), str(input_path), str(imported)], check=True)
        verified = json.loads((imported / 'official-image-registry.json').read_bytes())['cards']
        if verified != [row for row, _, _ in rows]:
            raise ValueError('IMPORT_READBACK_MISMATCH')
        report = json.loads((imported / 'import-report.json').read_bytes())
        if report['stored'] != len(rows) or report['added'] != len(rows) or not report['success']:
            raise ValueError('IMPORT_REPORT_MISMATCH')

        cards = old['cards'] + verified
        header = {key: value for key, value in old.items() if key != 'cards'}
        payload = json.dumps(header, ensure_ascii=False, indent=2)[:-2] + ',\n  "cards": [\n'
        payload += ',\n'.join('    ' + compact(row) for row in cards) + '\n  ]\n}\n'
        if json.loads(payload) != {**old, 'cards': cards}:
            raise ValueError('REGISTRY_SERIALIZATION_MISMATCH')
        expansion = f'{len(old["cards"])}-to-{len(cards)}'
        proof_dir = ROOT / 'data/image-automation/official-search-expansion' / expansion
        proof_dir.mkdir(parents=True, exist_ok=False)
        parts = []
        for offset in range(0, len(rows), 500):
            records = []
            for row, proof, checkpoint_hash in rows[offset:offset + 500]:
                ident = row['officialCardId']
                records.append({
                    'officialCardId': ident,
                    'searchPage': int(proof['searchUrl'].rsplit('=', 1)[1]),
                    'searchSha256': proof['searchSha256'],
                    'detailSha256': proof['detailSha256'],
                    'verifiedAt': proof['verifiedAt'],
                    'checkpointSha256': checkpoint_hash,
                    'importedRecordSha256': sha256((imported / 'records' / f'{ident}.json').read_bytes()),
                })
            path = proof_dir / f'part-{offset // 500 + 1:02}.json'
            content = '[\n' + ',\n'.join('  ' + compact(row) for row in records) + '\n]\n'
            path.write_text(content, encoding='utf-8')
            parts.append({'path': path.name, 'count': len(records), 'sha256': sha256(path.read_bytes())})
        holds = []
        for path in sorted((source / 'holds').glob('*.json'), key=lambda item: int(item.stem)):
            item = json.loads(path.read_bytes())
            holds.append({key: item[key] for key in ('officialCardId', 'reason', 'searchUrl', 'conflictingId') if key in item})
        hold_path = proof_dir / 'holds.json'
        hold_path.write_text('[\n' + ',\n'.join('  ' + compact(row) for row in holds) + '\n]\n', encoding='utf-8')
        evidence = {
            'baseline': identity,
            'officialSearchUrlPrefix': SEARCH,
            'added': len(rows),
            'total': len(cards),
            'held': len(holds),
            'holdsSha256': sha256(hold_path.read_bytes()),
            'registrySha256': sha256(payload.encode()),
            'parts': parts,
        }
        (proof_dir / 'manifest.json').write_text(json.dumps(evidence, indent=2) + '\n', encoding='utf-8')
        if REGISTRY.read_bytes() != baseline:
            raise ValueError('BASELINE_CHANGED_DURING_STAGE')
        temp_registry = REGISTRY.with_suffix('.staging')
        temp_registry.write_text(payload, encoding='utf-8')
        if temp_registry.read_text(encoding='utf-8') != payload:
            raise ValueError('REGISTRY_READBACK_MISMATCH')
        temp_registry.replace(REGISTRY)
        if sha256(REGISTRY.read_bytes()) != evidence['registrySha256']:
            raise ValueError('FINAL_REGISTRY_HASH_MISMATCH')
        print(compact(evidence))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('checkpoints', type=Path)
    parser.add_argument('--minimum-total', type=int, default=5000)
    args = parser.parse_args()
    stage(args.checkpoints, args.minimum_total)
