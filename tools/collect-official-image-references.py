#!/usr/bin/env python3
"""Collect image references from the official search and matching detail pages."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
from html.parser import HTMLParser
import importlib.util
import json
import os
from pathlib import Path
import re
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen

BASE = 'https://www.pokemon-card.com'
SEARCH = BASE + '/card-search/resultAPI.php?keyword=&regulation_sidebar_form=all&page='
SPEC = importlib.util.spec_from_file_location('official_detail', Path(__file__).with_name('parse-official-image.py'))
DETAIL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DETAIL)


class CollectionStopped(Exception):
    pass


class DetailIdentity(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        fields = dict(attrs)
        if tag == 'meta' and fields.get('property') == 'og:url':
            self.urls.append(fields.get('content'))


def digest(data):
    return hashlib.sha256(data).hexdigest()


def store(path, data):
    temporary = path.with_suffix('.tmp')
    with temporary.open('wb') as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())
    temporary.replace(path)
    if path.read_bytes() != data:
        raise RuntimeError(f'READBACK_FAILED {path}')


def save_json(path, record):
    store(path, (json.dumps(record, ensure_ascii=False, separators=(',', ':')) + '\n').encode())


def print_key(record):
    return record.get('set'), re.sub(r'\s+', '', record.get('cardNumber') or '')


def collect(args):
    raw_registry = args.registry.read_bytes()
    existing = json.loads(raw_registry)['cards']
    known = {row['officialCardId'] for row in existing}
    reserved = set(args.hold_id)
    if len(known) != len(existing):
        raise ValueError('BASELINE_DUPLICATE_ID')
    need = args.target - len(existing)
    if need < 1:
        raise ValueError('BASELINE_ALREADY_AT_TARGET')
    occupied = {print_key(row): row['officialCardId'] for row in existing if all(print_key(row))}
    urls = {row['imageSourceUrl']: row['officialCardId'] for row in existing}
    for folder in ('search', 'records', 'holds'):
        (args.output / folder).mkdir(parents=True, exist_ok=True)
    run_path = args.output / 'baseline.json'
    identity = {'sha256': digest(raw_registry), 'count': len(existing), 'reservedIds': sorted(reserved)}
    if run_path.exists() and json.loads(run_path.read_bytes()) != identity:
        raise ValueError('BASELINE_CHANGED')
    save_json(run_path, identity)
    accepted = {}
    for path in sorted((args.output / 'records').glob('*.json')):
        item = json.loads(path.read_bytes())
        row = item['record']
        ident = row['officialCardId']
        if ident in known or ident in reserved or ident in accepted or print_key(row) in occupied or row['imageSourceUrl'] in urls:
            raise ValueError(f'SAVED_REFERENCE_CONFLICT {ident}')
        accepted[ident] = item
        occupied[print_key(row)] = ident
        urls[row['imageSourceUrl']] = ident

    encountered = set(known) | reserved | set(accepted)
    stopped = threading.Event()
    rate_lock = threading.Lock()
    next_request = 0.0

    def fetch(url, mime):
        nonlocal next_request
        with rate_lock:
            time.sleep(max(0, next_request - time.monotonic()))
            if stopped.is_set():
                raise CollectionStopped
            next_request = time.monotonic() + 1 / args.requests_per_second
        request = Request(url, headers={'User-Agent': 'PokecaPlayTable/1.0 (official image reference verification)', 'Accept': mime})
        try:
            with urlopen(request, timeout=25) as response:
                if response.geturl() != url or response.headers.get_content_type() != mime:
                    raise RuntimeError('UNEXPECTED_OFFICIAL_RESPONSE')
                data = response.read(1_500_001)
                if len(data) > 1_500_000:
                    raise RuntimeError('OFFICIAL_RESPONSE_TOO_LARGE')
                return data
        except HTTPError as exc:
            if exc.code in (403, 429, 503):
                stopped.set()
            raise

    def verify(job):
        candidate, source = job
        ident = candidate['cardID']
        url = BASE + '/card-search/details.php/card/' + ident + '/regu/XY'
        try:
            body = fetch(url, 'text/html')
            html = body.decode('utf-8')
            evidence = DetailIdentity()
            evidence.feed(html)
            if evidence.urls != [url]:
                return {'reason': 'DETAIL_OFFICIAL_ID_MISMATCH', 'detailUrl': url}
            result = DETAIL.parse(html, ident, candidate['cardNameAltText'])
            if result['status'] != 'CANDIDATE':
                return {'reason': result['reason'], 'detailUrl': url}
            if result['imageSourceUrl'] != urljoin(BASE, candidate['cardThumbFile']):
                return {'reason': 'SEARCH_DETAIL_IMAGE_MISMATCH', 'detailUrl': url}
            if not re.fullmatch(r'[0-9]+/[A-Za-z0-9-]+', result['cardNumber']):
                return {'reason': 'UNSUPPORTED_NUMBER', 'detailUrl': url}
            fields = DETAIL.Detail()
            fields.feed(html)
            result.pop('status')
            result.update(officialPageUrl=url, cardNumberRaw=fields.numbers[0].strip(),
                          verified=True, deckPrintAdopted=False, namePreviewEligible=False)
            return {'record': result, 'evidence': {
                'searchUrl': source[0], 'searchSha256': source[1],
                'candidate': candidate, 'detailSha256': digest(body),
                'verifiedAt': datetime.now(timezone.utc).isoformat(),
            }}
        except CollectionStopped:
            return None
        except HTTPError as exc:
            return {'reason': f'HTTP_{exc.code}', 'detailUrl': url}
        except (URLError, TimeoutError, UnicodeError, RuntimeError) as exc:
            return {'reason': type(exc).__name__, 'message': str(exc), 'detailUrl': url}

    def search(page):
        search_url = SEARCH + str(page)
        search_path = args.output / 'search' / f'{page}.json'
        raw = search_path.read_bytes() if search_path.exists() else fetch(search_url, 'application/json')
        response = json.loads(raw)
        if (response.get('result') != 1 or int(response['thisPage']) != page
                or response.get('regulation') != 'all' or not response.get('cardList')):
            raise ValueError(f'SEARCH_PAGE_UNVERIFIED {page}')
        if not search_path.exists():
            store(search_path, raw)
        return response, (search_url, digest(raw))

    def save_result(job, item):
        if item is None:
            return
        candidate, source = job
        ident = candidate['cardID']
        row = item.get('record')
        if row is not None:
            collision = occupied.get(print_key(row)) or urls.get(row['imageSourceUrl'])
            if collision is None:
                save_json(args.output / 'records' / f'{ident}.json', item)
                accepted[ident] = item
                occupied[print_key(row)] = ident
                urls[row['imageSourceUrl']] = ident
                return
            item = {'reason': 'PRINT_OR_IMAGE_COLLISION', 'conflictingId': collision,
                    'candidateRecord': row, 'evidence': item['evidence']}
        item.update(officialCardId=ident, candidate=candidate, searchUrl=source[0], searchSha256=source[1])
        save_json(args.output / 'holds' / f'{ident}.json', item)

    pages = 8
    last_page = args.max_pages
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for first_page in range(1, args.max_pages + 1, pages):
            if len(accepted) >= need or stopped.is_set() or first_page > last_page:
                break
            jobs = []
            for response, source in pool.map(search, range(first_page, min(first_page + pages - 1, last_page) + 1)):
                last_page = min(last_page, int(response['maxPage']))
                for candidate in response['cardList']:
                    ident = candidate.get('cardID')
                    if not isinstance(ident, str) or not re.fullmatch(r'[1-9][0-9]*', ident):
                        raise ValueError(f'SEARCH_INVALID_ID {source[0]}')
                    if ident in encountered or (args.output / 'holds' / f'{ident}.json').exists():
                        continue
                    encountered.add(ident)
                    jobs.append((candidate, source))
            offset = 0
            while offset < len(jobs) and len(accepted) < need and not stopped.is_set():
                batch = jobs[offset:offset + need - len(accepted)]
                for job, item in zip(batch, pool.map(verify, batch)):
                    save_result(job, item)
                offset += len(batch)
            print(json.dumps({'throughPage': min(first_page + pages - 1, last_page),
                              'additions': len(accepted), 'total': len(existing) + len(accepted),
                              'holds': len(list((args.output / 'holds').glob('*.json')))}, ensure_ascii=False), flush=True)
    return 1 if stopped.is_set() else 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('registry', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--target', type=int, default=5000)
    parser.add_argument('--max-pages', type=int, default=180)
    parser.add_argument('--hold-id', action='append', default=[])
    parser.add_argument('--workers', type=int, default=24)
    parser.add_argument('--requests-per-second', type=float, default=6)
    args = parser.parse_args()
    if args.workers < 1 or args.requests_per_second <= 0:
        parser.error('positive worker and rate limits are required')
    raise SystemExit(collect(args))
