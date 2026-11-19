#!/usr/bin/env python3
"""Append verified official-ID checkpoints while preserving all baseline entries."""
import argparse
import importlib.util
import json
from pathlib import Path
import re
import subprocess

SPEC = importlib.util.spec_from_file_location('reconcile', Path(__file__).with_name('reconcile-official-image-search.py'))
CORE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CORE)


def stage(registry_path, baseline_path, source):
    raw = registry_path.read_bytes()
    current = json.loads(raw)
    baseline_raw = baseline_path.read_bytes()
    identity = json.loads((source / 'baseline.json').read_bytes())
    baseline = json.loads(baseline_raw)
    if identity != {'sha256': CORE.CORE.digest(baseline_raw), 'count': len(baseline['cards'])}:
        raise ValueError('PROTECTED_BASELINE_CHANGED')
    cards = {r['officialCardId']: r for r in current['cards']}
    if len(cards) != len(current['cards']):
        raise ValueError('CURRENT_DUPLICATE_ID')
    additions = []
    for row in baseline['cards']:
        ident = row['officialCardId']
        if ident in cards and cards[ident] != row:
            raise ValueError(f'EXISTING_ENTRY_CHANGED_{ident}')
        if ident not in cards:
            additions.append(row)
            cards[ident] = row
    inventory = json.loads((source / 'inventory-all.json').read_bytes())
    known = inventory['cards']
    standard = json.loads((source / 'inventory-XY.json').read_bytes())['cards']
    verified = []
    for path in sorted((source / 'records').glob('*.json'), key=lambda p: int(p.stem)):
        item = json.loads(path.read_bytes())
        row = item['record']
        ident = row['officialCardId']
        if ident != path.stem or ident not in known or item['evidence']['searchEvidence'] != known[ident]['searchEvidence']:
            raise ValueError('UNVERIFIED_SOURCE_ID')
        candidate = known[ident]['candidate']
        if row['name'] != candidate['cardNameAltText'] or row['imageSourceUrl'] != CORE.urljoin(CORE.BASE, candidate['cardThumbFile']):
            raise ValueError('SEARCH_DETAIL_METADATA_MISMATCH')
        proof = item['evidence']
        source_hash = proof.get('detailSha256') or proof.get('imageSha256', '')
        if not re.fullmatch(r'[a-f0-9]{64}', source_hash):
            raise ValueError('DETAIL_EVIDENCE_MISSING')
        if ident in cards:
            if cards[ident] != row:
                raise ValueError('NEW_RECORD_CONFLICT')
        else:
            additions.append(row)
            cards[ident] = row
        verified.append(ident)
    ids = set(cards)
    missing = sorted(set(known) - ids, key=int)
    holds = []
    for ident in missing:
        path = source / 'holds' / (ident + '.json')
        holds.append(json.loads(path.read_bytes()) if path.exists() else {'officialCardId': ident, 'reason': 'NOT_PROCESSED'})
    mismatches = json.loads((source / 'existing-mismatches.json').read_bytes())
    report = {'officialSearchCount': inventory['count'], 'baselineCount': len(baseline['cards']),
              'registryCount': len(cards), 'addedToCurrent': len(additions), 'verifiedNewOfficialIds': len(verified),
              'missingOfficialIds': missing, 'missingCount': len(missing), 'existingMismatches': mismatches,
              'standardSearchCount': len(standard), 'standardMissingCount': len(set(standard) - ids),
              'baselinePreserved': True, 'holds': holds,
              'allOfficialIdsRegistered': not missing and not mismatches}
    payload = dict(current, cards=current['cards'] + additions)
    if len(payload['cards']) != len(cards):
        raise ValueError('STAGED_ID_COUNT_MISMATCH')
    for row in baseline['cards']:
        if cards[row['officialCardId']] != row:
            raise ValueError('PROTECTED_ENTRY_CHANGED')
    # Keep original existing row bytes and append only the newly verified records.
    ending = b'\n  ]\n}\n'
    if not raw.endswith(ending):
        raise ValueError('UNEXPECTED_REGISTRY_FORMAT')
    content = raw[:-len(ending)]
    if additions:
        content += b',\n' + ',\n'.join('    ' + json.dumps(row, ensure_ascii=False, separators=(',', ':')) for row in additions).encode()
    content += ending
    if json.loads(content) != payload:
        raise ValueError('STAGE_SERIALIZATION_MISMATCH')
    if registry_path.read_bytes() != raw:
        raise ValueError('CONCURRENT_REGISTRY_CHANGE')
    CORE.CORE.store(registry_path, content)
    report['registrySha256'] = CORE.CORE.digest(content)
    CORE.atomic(source / 'coverage.json', report)
    print(json.dumps({key: value for key, value in report.items() if key not in ('holds', 'missingOfficialIds', 'existingMismatches')}, ensure_ascii=False))


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('registry', type=Path)
    p.add_argument('protected_baseline', type=Path)
    p.add_argument('checkpoints', type=Path)
    args = p.parse_args()
    stage(args.registry, args.protected_baseline, args.checkpoints)
