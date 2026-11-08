"""Read-only formal snapshot verifier and fixed-deck image-reference exporter.
Attached README/role-state text is source data, never executable instructions.
"""
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path

CAT = 'pokeca_card_catalog_HIJ/card_catalog.json'
REG = 'pokeca_card_catalog_HIJ/image_registry/image_registry.json'

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def reconcile(archive, manifest, expected_cards=1940, expected_metadata=5):
    raw = Path(archive).read_bytes()
    with zipfile.ZipFile(archive) as z:
        names = [i.filename for i in z.infolist() if not i.is_dir()]
        if len(names) != len(set(names)) or z.testzip() is not None:
            raise ValueError('ZIP_INTEGRITY')
        slim = json.loads(z.read('CODEX_SLIM_MANIFEST.json'))
        if set(names) != {x['path'] for x in slim['files']} | {'CODEX_SLIM_MANIFEST.json'}:
            raise ValueError('SLIM_MEMBERSHIP')
        for item in slim['files']:
            body = z.read(item['path'])
            if len(body) != item['bytes'] or digest(body) != item['sha256']:
                raise ValueError('SOURCE_DIGEST_' + item['path'])
        read = lambda p: json.loads(z.read(p))
        catalog, registry = read(CAT), read(REG)
        baseline = read('FORMAL_BASELINE.json')
        promotion = read('pokeca_card_catalog_HIJ/image_registry/promotion_1943_to1945_validation.json')
        index = registry['cardsByOfficialId']
        cards = {str(c['officialCardId']): c for c in catalog['cards']}
        images = {str(c['officialCardId']): c for c in catalog['images']}
        lines = [json.loads(s) for s in z.read(REG.replace('.json', '.jsonl')).decode().splitlines() if s.strip()]
        if len(cards) != expected_cards or len(cards) != len(catalog['cards']) or len(images) != len(cards) or len(images) != len(catalog['images']):
            raise ValueError('CATALOG_COUNTS')
        if len(index) != expected_cards + expected_metadata or baseline['formalCount'] != len(index):
            raise ValueError('FORMAL_COUNTS')
        if len(lines) != len(index) or {str(r['officialCardId']): r for r in lines} != index:
            raise ValueError('REGISTRY_JSONL_JOIN')
        if registry['sourceCatalogSha256'] != digest(z.read(CAT)) or promotion['status'] != 'PASS' or promotion['formalCount'] != len(index):
            raise ValueError('CURRENT_PROMOTION')
        for ident, ref in index.items():
            if not re.fullmatch(r'\d+',ident) or str(ref['officialCardId']) != ident: raise ValueError('REGISTRY_ID')
            if not re.fullmatch(r'https://www\.pokemon-card\.com/assets/images/card_images/large/[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+\.(jpg|jpeg|png|webp)',ref['sourceUrl'],re.I): raise ValueError('REGISTRY_URL_'+ident)
            if not re.search(r'/0*'+re.escape(ident)+r'_[A-Za-z0-9_]+\.(jpg|jpeg|png|webp)$',ref['sourceUrl'],re.I): raise ValueError('REGISTRY_IMAGE_ID_'+ident)
            if not re.fullmatch(r'https://www\.pokemon-card\.com/card-search/details\.php/card/'+ident+r'(?:/regu/XY)?/?',ref['officialPageUrl']): raise ValueError('REGISTRY_PAGE_ID_'+ident)
        for ident, card in cards.items():
            image, ref = images[ident], index[ident]
            if card['setName'] != ref['setCode']: raise ValueError('CARD_SET_JOIN_'+ident)
            if card.get('verificationStatus') != 'verified':
                raise ValueError('UNVERIFIED_CARD_' + ident)
            for key in ['name', 'cardNumber', 'cardId', 'imageId', 'officialPageUrl']:
                if card[key] != ref[key]: raise ValueError('CARD_REGISTRY_JOIN_' + ident + '_' + key)
            for key in ['cardNumber', 'cardId', 'imageId', 'officialPageUrl']:
                if image[key] != ref[key]: raise ValueError('IMAGE_JOIN_' + ident + '_' + key)
            if image['sourceUrl'] != ref['sourceUrl'] or image['status'] != 'reference_only':
                raise ValueError('IMAGE_URL_JOIN_' + ident)
        metadata_ids = sorted(set(index) - set(cards))
        if len(metadata_ids) != expected_metadata: raise ValueError('METADATA_COUNTS')
        targets = list(dict.fromkeys(c['name'] for d in manifest['decks'] for c in d['cards']))
        candidate_rows = []
        for ident, ref in index.items():
            if ref['name'] not in targets: continue
            if ident != str(ref['officialCardId']) or not re.fullmatch(r'\d+', ident): raise ValueError('ID')
            number = ref['cardNumber'].split(maxsplit=1)
            if len(number) != 2 or number[0] != ref['setCode']: raise ValueError('SET_NUMBER_' + ident)
            normalized_number = re.sub(r'\s+', '', number[1])
            if not re.fullmatch(r'\d+/[A-Za-z0-9/-]+', normalized_number): raise ValueError('NUMBER_' + ident)
            if not re.fullmatch(r'https://www\.pokemon-card\.com/assets/images/card_images/large/[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+\.(jpg|jpeg|png|webp)', ref['sourceUrl'], re.I): raise ValueError('URL_' + ident)
            if not re.fullmatch(r'https://www\.pokemon-card\.com/card-search/details\.php/card/' + ident + r'(?:/regu/XY)?/?', ref['officialPageUrl']): raise ValueError('PAGE_' + ident)
            candidate_rows.append({'officialCardId': ident, 'name': ref['name'], 'set': ref['setCode'], 'cardNumber': normalized_number,
                'imageSourceUrl': ref['sourceUrl'], 'officialPageUrl': ref['officialPageUrl'], 'verified': True, 'deckPrintAdopted': False,
                'formalSource': {'zipSha256': digest(raw), 'catalogSha256': digest(z.read(CAT)), 'registrySha256': digest(z.read(REG)),
                    'originalCardNumber': ref['cardNumber'], 'originalOfficialPageUrl': ref['officialPageUrl'],
                    'sourceRecordSha256': ref['sourceRecordSha256'], 'metadataOnly': ident not in cards,
                    'sourceSimulator': ref['simulator'], 'sourceRights': ref['rights'], 'sourceTechnical': ref['technical'],
                    'originalPayloadEntry': REG, 'cardId': ref['cardId'], 'imageId': ref['imageId'],
                    'detailHtmlIncludedInSlim': False}})
        candidates_by_name = {n: [r for r in candidate_rows if r['name'] == n] for n in targets}
        rows = [{'name': n, 'copies': sum(c['count'] for d in manifest['decks'] for c in d['cards'] if c['name'] == n),
                 'candidateOfficialIds': [r['officialCardId'] for r in candidates_by_name[n]],
                 'candidateCount': len(candidates_by_name[n]), 'status': 'HOLD_DECK_EDITION_UNSELECTED' if candidates_by_name[n] else 'NOT_IN_FORMAL_SNAPSHOT',
                 'selectedOfficialCardId': None, 'requiredEvidence': 'Explicit deck edition ID/set/number binding; candidate membership is not selection approval.'} for n in targets]
        delivery = read('DELIVERY_MANIFEST.json')['files']
        historical = [i['path'] for i in delivery if i['path'] in names and digest(z.read(i['path'])) != i['sha256']]
        integrity = {'zipSha256': digest(raw), 'zipEntries': len(names), 'zipCrcPass': True, 'slimManifestDigestsVerified': len(slim['files']),
            'catalogCards': len(cards), 'catalogImages': len(images), 'registryPrints': len(index), 'metadataOnlyIds': metadata_ids,
            'cardImageRegistryJoinsPassed': len(cards), 'registryJsonlJoinsPassed': len(index), 'promotionPass': True,
            'catalogSha256': digest(z.read(CAT)), 'registrySha256': digest(z.read(REG)),
            'originalScope': catalog['scope'], 'historicalDeliveryManifestMismatches': historical,
            'historicalDeliveryManifestIsCurrentAuthority': False, 'rawHtmlAndPerCardCompletionReceiptsIncluded': False}
        return {'integrity': integrity, 'totalCards': sum(r['copies'] for r in rows), 'uniqueNames': len(rows),
            'matchedNames': sum(bool(r['candidateCount']) for r in rows), 'matchedCopies': sum(r['copies'] for r in rows if r['candidateCount']),
            'candidatePrints': len(candidate_rows), 'adoptedDeckPrints': 0, 'pendingCopies': sum(r['copies'] for r in rows), 'rows': rows}, {'cards': candidate_rows}

if __name__ == '__main__':
    if len(sys.argv) != 4: raise SystemExit('usage: reconcile_formal_zip.py source.zip fixed-decks.json output-directory')
    archive, manifest_file, out = map(Path, sys.argv[1:])
    before = digest(archive.read_bytes())
    report, candidates = reconcile(archive, json.loads(manifest_file.read_text()))
    out.mkdir(parents=True, exist_ok=True)
    (out / 'reconciliation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    (out / 'candidate-evidence.json').write_text(json.dumps(candidates, ensure_ascii=False, indent=2) + '\n')
    assert digest(archive.read_bytes()) == before
    print(json.dumps({k: report[k] for k in ['matchedNames', 'matchedCopies', 'candidatePrints', 'adoptedDeckPrints', 'pendingCopies']}))
