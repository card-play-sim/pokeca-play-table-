#!/usr/bin/env python3
"""Reconcile complete official search snapshots by ID, with resumable evidence."""
import argparse
from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED
from datetime import datetime, timezone
import fcntl
import hashlib
import io
from html import unescape
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import threading
import time
from urllib.error import HTTPError
from urllib.parse import urljoin
from urllib.request import Request, urlopen
from PIL import Image

SPEC = importlib.util.spec_from_file_location('collector', Path(__file__).with_name('collect-official-image-references.py'))
CORE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CORE)
BASE = CORE.BASE


def atomic(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    CORE.save_json(path, value)


class Network:
    def __init__(self, rate):
        self.rate = rate
        self.next = 0
        self.lock = threading.Lock()

    def fetch(self, url, mime):
        with self.lock:
            time.sleep(max(0, self.next - time.monotonic()))
            self.next = time.monotonic() + 1 / self.rate
        req = Request(url, headers={'User-Agent': 'PokecaPlayTableImageAudit/1.0', 'Accept': mime})
        with urlopen(req, timeout=25) as response:
            if response.geturl() != url or response.headers.get_content_type() != mime:
                raise ValueError('UNEXPECTED_OFFICIAL_RESPONSE')
            body = response.read(8_000_001)
            if len(body) > 8_000_000:
                raise ValueError('OFFICIAL_RESPONSE_TOO_LARGE')
            return body


def snapshot(network, output, regulation, workers):
    directory = output / 'search' / regulation
    directory.mkdir(parents=True, exist_ok=True)

    def page(number):
        path = directory / f'{number}.json'
        url = f'{BASE}/card-search/resultAPI.php?keyword=&regulation_sidebar_form={regulation}&page={number}'
        raw = path.read_bytes() if path.exists() else network.fetch(url, 'application/json')
        data = json.loads(raw)
        if data.get('result') != 1 or int(data['thisPage']) != number or data['regulation'] != regulation:
            raise ValueError(f'UNVERIFIED_SEARCH_PAGE_{number}')
        if not path.exists():
            CORE.store(path, raw)
        return data, {'page': number, 'url': url, 'sha256': CORE.digest(raw)}

    first, first_proof = page(1)
    expected = int(first['hitCnt'])
    page_count = int(first['maxPage'])
    cards = {}
    proofs = []
    results = [(first, first_proof)]
    with ThreadPoolExecutor(max_workers=workers) as pool:
        results.extend(pool.map(page, range(2, page_count + 1)))
    for data, proof in results:
        if int(data['hitCnt']) != expected or int(data['maxPage']) != page_count:
            raise ValueError('SEARCH_CHANGED_DURING_SNAPSHOT')
        proofs.append(proof)
        for card in data['cardList']:
            ident = card.get('cardID')
            if not isinstance(ident, str) or not re.fullmatch(r'[1-9][0-9]*', ident) or ident in cards:
                raise ValueError('SEARCH_DUPLICATE_OR_INVALID_ID')
            cards[ident] = {'candidate': card, 'searchEvidence': proof}
    if len(cards) != expected:
        raise ValueError('SEARCH_COUNT_MISMATCH')
    atomic(output / f'inventory-{regulation}.json', {'count': expected, 'pages': proofs, 'cards': cards})
    return cards


def verify_detail(candidate, network):
    ident = candidate['candidate']['cardID']
    name = candidate['candidate']['cardNameAltText']
    url = f'{BASE}/card-search/details.php/card/{ident}/regu/XY'
    raw = network.fetch(url, 'text/html')
    html = raw.decode('utf-8')
    identity = CORE.DetailIdentity()
    identity.feed(html)
    if identity.urls != [url]:
        raise ValueError('OFFICIAL_DETAIL_ID_MISMATCH')
    fields = CORE.DETAIL.Detail()
    fields.feed(html)
    if fields.names != [name] or len(fields.images) != 1:
        raise ValueError('OFFICIAL_DETAIL_NAME_OR_IMAGE_AMBIGUOUS')
    image = urljoin(BASE, fields.images[0])
    if image != urljoin(BASE, candidate['candidate']['cardThumbFile']):
        raise ValueError('SEARCH_DETAIL_IMAGE_MISMATCH')
    if not re.fullmatch(r'https://www\.pokemon-card\.com/assets/images/card_images/large/[A-Za-z0-9_-]*/0*' + ident + r'_[A-Za-z0-9_.-]+\.(?:jpg|png|jpeg|webp)', image, re.I):
        raise ValueError('OFFICIAL_IMAGE_PATH_OR_ID_INVALID')
    sets = set(fields.sets)
    if len(sets) > 1 or not fields.numbers:
        raise ValueError('OFFICIAL_PRINT_METADATA_AMBIGUOUS')
    set_code = next(iter(sets), None)
    if set_code and image.split('/')[-2] and set_code != image.split('/')[-2]:
        raise ValueError('OFFICIAL_SET_IMAGE_MISMATCH')
    labels = [re.sub(r'\s+', '', text) for text in fields.numbers]
    record = {'officialCardId': ident, 'name': name, 'imageSourceUrl': image,
              'officialPageUrl': url, 'verified': True, 'deckPrintAdopted': False, 'namePreviewEligible': False}
    if set_code:
        record['set'] = set_code
    numbers = re.findall(r'(?<![A-Za-z0-9])\d+\s*/\s*(?:\d+|[A-Za-z]+(?:-[A-Za-z]+)?)(?![A-Za-z0-9])', ' '.join(fields.numbers))
    numbers = sorted(set(re.sub(r'\s+', '', n) for n in numbers))
    if len(numbers) == 1:
        record['cardNumber'] = numbers[0]
    elif len(numbers) > 1:
        record['printedCardNumbers'] = numbers
    evidence = {'detailSha256': CORE.digest(raw), 'officialNumberLabels': labels,
                'searchEvidence': candidate['searchEvidence'], 'verifiedAt': datetime.now(timezone.utc).isoformat()}
    return {'record': record, 'evidence': evidence}


def verify(candidate, network):
    # The official search provides the ID/name/image relationship. Print numbers
    # and expansion codes stay absent unless a verified detail checkpoint has them.
    item = candidate['candidate']
    ident = item['cardID']
    name = item['cardNameAltText']
    image = urljoin(BASE, item['cardThumbFile'])
    if not re.fullmatch(r'https://www\.pokemon-card\.com/assets/images/card_images/large/[A-Za-z0-9_-]*/0*' + ident + r'_[A-Za-z0-9_.-]+\.(?:jpg|png|jpeg|webp)', image, re.I):
        raise ValueError('OFFICIAL_IMAGE_PATH_OR_ID_INVALID')
    mime = {'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'webp': 'image/webp'}[image.rsplit('.', 1)[1].lower()]
    body = network.fetch(image, mime)
    with Image.open(io.BytesIO(body)) as decoded:
        decoded.load()
        dimensions = list(decoded.size)
        if min(dimensions) < 50:
            raise ValueError('OFFICIAL_IMAGE_TOO_SMALL')
    record = {'officialCardId': ident, 'name': name, 'imageSourceUrl': image,
              'officialPageUrl': f'{BASE}/card-search/details.php/card/{ident}/regu/XY',
              'verified': True, 'deckPrintAdopted': False, 'namePreviewEligible': False}
    return {'record': record, 'evidence': {'kind': 'OFFICIAL_SEARCH_AND_DECODED_IMAGE',
            'imageSha256': CORE.digest(body), 'imageDimensions': dimensions, 'imageBytes': len(body),
            'searchEvidence': candidate['searchEvidence'], 'verifiedAt': datetime.now(timezone.utc).isoformat()}}


def collect(args):
    args.output.mkdir(parents=True, exist_ok=True)
    with (args.output / 'writer.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        raw = args.registry.read_bytes()
        registry = json.loads(raw)
        cards = registry['cards']
        known = {card['officialCardId']: card for card in cards}
        if len(known) != len(cards):
            raise ValueError('BASELINE_DUPLICATE_ID')
        baseline = {'sha256': CORE.digest(raw), 'count': len(cards)}
        saved = args.output / 'baseline.json'
        if saved.exists() and json.loads(saved.read_bytes()) != baseline:
            raise ValueError('BASELINE_CHANGED')
        atomic(saved, baseline)
        net = Network(args.rate)
        standard = snapshot(net, args.output, 'XY', args.workers)
        print(json.dumps({'stage': 'standard-inventory', 'count': len(standard)}), flush=True)
        all_cards = snapshot(net, args.output, 'all', args.workers)
        if not set(standard) <= set(all_cards):
            raise ValueError('STANDARD_NOT_IN_ALL')
        mismatches = []
        for ident, item in all_cards.items():
            if ident in known:
                prior, observed = known[ident], item['candidate']
                if prior['name'] != observed['cardNameAltText'] or prior['imageSourceUrl'] != urljoin(BASE, observed['cardThumbFile']):
                    mismatches.append({'officialCardId': ident, 'reason': 'EXISTING_SEARCH_MISMATCH', 'existing': prior, 'observed': observed})
        atomic(args.output / 'existing-mismatches.json', mismatches)
        missing = [row for ident, row in all_cards.items() if ident not in known]
        missing.sort(key=lambda row: (row['candidate']['cardID'] not in standard, -int(row['candidate']['cardID'])))
        print(json.dumps({'stage': 'inventory-complete', 'official': len(all_cards), 'missing': len(missing), 'existingMismatches': len(mismatches)}), flush=True)
        if args.checkpoint_every:
            checkpoint(args)
        if args.inventory_only:
            return
        records = args.output / 'records'
        holds = args.output / 'holds'
        records.mkdir(exist_ok=True)
        holds.mkdir(exist_ok=True)
        pending = [r for r in missing if not (records / (r['candidate']['cardID'] + '.json')).exists()]
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            jobs = iter(pending)
            futures = {}
            def schedule():
                row = next(jobs, None)
                if row is not None:
                    futures[pool.submit(verify, row, net)] = row
            for _ in range(args.workers):
                schedule()
            index = 0
            while futures:
                done, _ = wait(futures, return_when=FIRST_COMPLETED)
                for future in done:
                    row = futures.pop(future)
                    ident = row['candidate']['cardID']
                    try:
                        item = future.result()
                        atomic(records / (ident + '.json'), item)
                    except (OSError, ValueError, KeyError) as error:
                        atomic(holds / (ident + '.json'), {'officialCardId': ident, 'reason': str(error), 'candidate': row})
                    index += 1
                    if index % 100 == 0 or index == len(pending):
                        accepted = len(list(records.glob('*.json')))
                        atomic(args.output / 'progress.json', {'official': len(all_cards), 'baseline': len(known), 'missingBefore': len(missing),
                               'registeredCandidates': accepted, 'remaining': len(missing) - accepted, 'holds': len(list(holds.glob('*.json')))})
                        print((args.output / 'progress.json').read_text().strip(), flush=True)
                    if args.checkpoint_every and index % args.checkpoint_every == 0:
                        checkpoint(args)
                    schedule()
        if args.checkpoint_every:
            checkpoint(args)


def checkpoint(args):
    # Fast-forward push only. A changed branch head rejects publication.
    root = Path(__file__).resolve().parents[1]
    relative = args.output.resolve().relative_to(root)
    subprocess.run(['git', 'add', '--', str(relative)], cwd=root, check=True)
    if subprocess.run(['git', 'diff', '--cached', '--quiet'], cwd=root).returncode == 0:
        return
    subprocess.run(['git', 'commit', '-m', 'Save official image discovery and per-ID verification checkpoints'], cwd=root, check=True)
    subprocess.run(['git', 'push', 'origin', 'HEAD:refs/heads/' + args.branch], cwd=root, check=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('registry', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--workers', type=int, default=24)
    parser.add_argument('--rate', type=float, default=12)
    parser.add_argument('--inventory-only', action='store_true')
    parser.add_argument('--checkpoint-every', type=int, default=0)
    parser.add_argument('--branch', default='')
    args = parser.parse_args()
    if args.workers < 1 or args.rate <= 0 or args.checkpoint_every < 0 or (args.checkpoint_every and not args.branch):
        parser.error('positive workers/rate and checkpoint branch are required')
    collect(args)
