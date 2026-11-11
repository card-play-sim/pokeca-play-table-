"""Stage URL references backed by a pinned, read-only formal snapshot."""
import argparse
from collections import Counter
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import zipfile


ROOT = Path(__file__).resolve().parents[1]
PREFIX = 'pokeca_card_catalog_HIJ/'
HOLD_IDS = {'45573', '45575', '49589'}
SPEC = importlib.util.spec_from_file_location('official_parser', ROOT / 'tools/parse-official-image.py')
PARSER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PARSER)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def unique_index(records, field):
    index = {str(record[field]): record for record in records}
    if len(index) != len(records):
        raise ValueError(f'Duplicate {field}')
    return index


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if json.loads(path.read_bytes()) != value:
        raise ValueError(f'Readback failed: {path}')


def stage(archive_path, expected_sha, output):
    if digest(archive_path.read_bytes()) != expected_sha:
        raise ValueError('Formal archive SHA-256 mismatch')
    existing = unique_index(json.loads((ROOT / 'data/official-image-registry.json').read_bytes())['cards'], 'officialCardId')
    staged, evidence, holds, overlap = [], [], [], []
    with zipfile.ZipFile(archive_path) as archive:
        if archive.testzip() is not None:
            raise ValueError('Formal archive ZIP integrity check failed')

        def read(relative):
            return json.loads(archive.read(PREFIX + relative))

        catalog = read('card_catalog.json')
        metadata = read('image_registry/reference_catalog.json')
        cards = unique_index(catalog['cards'] + metadata['cards'], 'officialCardId')
        images = unique_index(catalog['images'] + metadata['images'], 'imageId')
        registry = read('image_registry/image_registry.json')['cardsByOfficialId']
        role = json.loads(archive.read('CURRENT_ROLE_STATE.json'))
        if set(cards) != set(registry) or len(cards) != len(images) or len(cards) != role['formalCheckpointCount']:
            raise ValueError('Formal snapshot count or ID mismatch')
        number_counts = Counter((row['setCode'], row['cardNumber']) for row in registry.values())
        for oid, card in cards.items():
            row = registry[oid]
            image = images[card['imageId']]
            try:
                if oid in HOLD_IDS:
                    raise ValueError('IDENTITY_HOLD')
                for key in ('officialCardId', 'cardNumber', 'cardId', 'officialPageUrl'):
                    if not card[key] == image[key] == row[key]:
                        raise ValueError(f'FORMAL_IDENTITY_MISMATCH_{key}')
                if row['name'] != card['name'] or row['sourceUrl'] != image['sourceUrl']:
                    raise ValueError('FORMAL_NAME_OR_URL_MISMATCH')
                if row['sourceRecordSha256'] != digest(json.dumps(card, ensure_ascii=False, sort_keys=True).encode()):
                    raise ValueError('FORMAL_RECORD_HASH_MISMATCH')
                if number_counts[row['setCode'], row['cardNumber']] != 1:
                    raise ValueError('FORMAL_NUMBER_COLLISION')
                number = row['cardNumber'].removeprefix(row['setCode'] + ' ')
                reference = dict(officialCardId=oid, name=row['name'], set=row['setCode'], cardNumber=number,
                                 imageSourceUrl=row['sourceUrl'], officialPageUrl=row['officialPageUrl'])
                page_pattern = r'https://www\.pokemon-card\.com/card-search/details\.php/card/' + re.escape(oid) + r'(?:/regu/XY)?/?'
                if not re.fullmatch(page_pattern, reference['officialPageUrl']):
                    raise ValueError('FORMAL_DETAIL_URL_ID_MISMATCH')
                if oid in existing:
                    if any(existing[oid].get(key) not in (None, reference[key]) for key in ('name', 'set', 'cardNumber', 'imageSourceUrl')):
                        raise ValueError('EXISTING_REFERENCE_CONFLICT')
                    overlap.append(oid)
                    continue
                alternatives = (f'collection/evidence/{oid}.html', f'image_registry/candidate_intake/evidence/{oid}.html')
                member = next((p for p in alternatives if PREFIX + p in archive.NameToInfo), None)
                if member is None:
                    raise ValueError('OFFICIAL_HTML_MISSING')
                body = archive.read(PREFIX + member)
                result = PARSER.parse(body.decode('utf-8'), oid, reference['name'], reference)
                if result['status'] != 'CANDIDATE':
                    raise ValueError(result['reason'])
                if any(reference[key] != result[key] for key in ('officialCardId', 'name', 'set', 'cardNumber', 'imageSourceUrl')):
                    raise ValueError('OFFICIAL_HTML_REFERENCE_MISMATCH')
                detail_sha = digest(body)
                staged.append({**reference, 'verified': True, 'deckPrintAdopted': False, 'namePreviewEligible': False})
                evidence.append({'officialCardId': oid, 'htmlPath': PREFIX + member, 'detailSha256': detail_sha,
                                 'formalRecordSha256': row['sourceRecordSha256']})
            except (KeyError, UnicodeError, ValueError) as error:
                holds.append({'officialCardId': oid, 'reason': str(error)})
    if digest(archive_path.read_bytes()) != expected_sha:
        raise ValueError('Formal archive changed during staging')
    output.mkdir(parents=True, exist_ok=False)
    write_json(output / 'verified-input.json', {'cards': staged})
    report = {'formalArchiveSha256': expected_sha, 'formalRecords': len(cards), 'existingRegistryRecords': len(existing),
              'existingFormalMatches': len(overlap), 'verifiedNewReferences': len(staged), 'holds': holds,
              'evidence': evidence, 'imageFilesSaved': 0}
    write_json(output / 'formal-reference-evidence.json', report)
    return {key: value for key, value in report.items() if key != 'evidence'}


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('archive', type=Path)
    cli.add_argument('sha256')
    cli.add_argument('output', type=Path)
    args = cli.parse_args()
    print(json.dumps(stage(args.archive, args.sha256, args.output), ensure_ascii=False))
