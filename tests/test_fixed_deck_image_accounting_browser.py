"""Synthetic UI regression only; not evidence of real official image display."""
from pathlib import Path
from urllib.parse import urlsplit
import copy
import json
import os
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / 'data/fixed-test-decks.json').read_text())
registry = json.loads((ROOT / 'data/official-image-registry.json').read_text())
reference = next(c for c in registry['cards'] if c['officialCardId'] == '47847')
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE'))
    for label, wrong_set, fail_image, expected in [('exact print', False, False, 4), ('wrong print', True, False, 0), ('load failure', False, True, 0)]:
        fixture = copy.deepcopy(manifest)
        fixture['decks'][0]['cards'][0].update(officialCardId=reference['officialCardId'], set='WRONG' if wrong_set else reference['set'], cardNumber=reference['cardNumber'], identityStatus='CONFIRMED')
        context = browser.new_context(viewport={'width': 393, 'height': 852}, is_mobile=True, has_touch=True)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        def route(request):
            url = request.request.url
            if url.startswith('https://www.pokemon-card.com/'):
                if fail_image:
                    request.abort()
                else:
                    request.fulfill(content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="63" height="88"><rect width="63" height="88" fill="green"/></svg>')
                return
            relative = urlsplit(url).path.lstrip('/') or 'index.html'
            if relative == 'data/fixed-test-decks.json':
                request.fulfill(content_type='application/json', body=json.dumps(fixture));return
            file = (ROOT / relative).resolve()
            if file.is_relative_to(ROOT) and file.is_file():request.fulfill(path=str(file))
            else:request.abort()
        page.route('**/*', route)
        page.goto('http://pokeca.test/')
        page.wait_for_function('window.PokecaMobile && PokecaImageRegistryStatus.state==="ready" && document.getElementById("save-status").textContent==="自動保存済"')
        before = page.evaluate('PokecaMobile.port.getSnapshot()')
        page.locator('#menu-open').click()
        page.get_by_text('固定2デッキ（各60枚）を確認', exact=True).click()
        page.wait_for_function('window.PokecaFixedDeckImageStatus && document.getElementById("deck-image-check").textContent.includes("検査済 56/56")')
        page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
        status = page.evaluate('PokecaFixedDeckImageStatus')
        assert status['officialDisplayedCopies'] == expected, (label, status)
        assert status['pendingCopies'] == 120 - expected
        assert not status['productionPass']
        first = page.locator('.deck-manifest-list > div').first
        assert first.get_attribute('data-official-card-id') == '47847'
        if fail_image:
            assert first.locator('img.art-load-fallback').is_visible()
            assert not first.locator('[data-image-primary]').is_visible()
        assert page.evaluate('PokecaMobile.port.getSnapshot()') == before
        assert not errors, errors
        print(f'PASS synthetic {label}: {expected}/120 counted; placeholders/candidates excluded; game snapshot unchanged')
        context.close()
    browser.close()
