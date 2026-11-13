"""Real Android-sized Chromium inspection. No image mocks or image files are saved.

By default exit 2 means the adopted-print check is incomplete.
--require-preview separately gates successful official image loading.
The optional session CA pin trusts only the inherited proxy's public key.
"""
import asyncio
import base64
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]


def session_ca_args():
    cert = os.environ.get('NODE_EXTRA_CA_CERTS')
    if not cert:
        return []
    public = subprocess.check_output(['openssl', 'x509', '-in', cert, '-pubkey', '-noout'])
    der = subprocess.check_output(['openssl', 'pkey', '-pubin', '-outform', 'DER'], input=public)
    pin = base64.b64encode(hashlib.sha256(der).digest()).decode()
    return ['--ignore-certificate-errors-spki-list=' + pin]


async def main():
    manifest = json.loads((ROOT / 'data/fixed-test-decks.json').read_text())
    registry = json.loads((ROOT / 'data/official-image-registry.json').read_text())
    entries = [(deck['id'], index, card) for deck in manifest['decks'] for index, card in enumerate(deck['cards'])]
    assert len(entries) == 56 and sum(card['count'] for _, _, card in entries) == 120
    failures, responses, errors = [], {}, []
    async with async_playwright() as p:
        args = session_ca_args()
        browser = await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE'), args=args)
        device = dict(p.devices['Pixel 5'])
        device.pop('default_browser_type', None)
        # Image-only inspection must not race the first worker install/reload.
        # Dedicated published PWA tests keep workers enabled and verify offline saves.
        context = await browser.new_context(**device, service_workers='block')
        page = await context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('requestfailed', lambda request: failures.append({'url': request.url, 'reason': request.failure}))
        page.on('response', lambda response: responses.update({response.url: {'status': response.status, 'contentType': response.headers.get('content-type', '')}}))
        await page.goto(os.environ.get('POKECA_TEST_URL', 'http://127.0.0.1:8765/'), wait_until='domcontentloaded')
        await page.wait_for_function('window.PokecaMobile && PokecaImageRegistryStatus.state==="ready" && document.getElementById("save-status").textContent==="自動保存済"')
        before = await page.evaluate('PokecaMobile.port.getSnapshot()')
        await page.locator('#menu-open').click()
        await page.get_by_text('固定2デッキ（各60枚）を確認', exact=True).click()
        rows = page.locator('.deck-manifest-list > div')
        await rows.last.wait_for()
        assert await rows.count() == len(entries)
        await page.wait_for_function('Array.from(document.querySelectorAll(".deck-manifest-list [data-image-primary]")).every(img=>img.complete)', timeout=60000)
        observations = []
        for i, (deck_id, entry_index, card) in enumerate(entries):
            row = rows.nth(i)
            assert await row.get_attribute('data-deck-id') == deck_id
            assert int(await row.get_attribute('data-entry-index')) == entry_index
            assert await row.get_attribute('data-card-name') == card['name']
            await row.scroll_into_view_if_needed()
            observation = await row.evaluate('''async row => {
              const img=row.querySelector('[data-image-primary]');
              let decoded=false;try{await img.decode();decoded=img.naturalWidth>0&&img.naturalHeight>0;}catch{}
              await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
              const rect=img.getBoundingClientRect(),style=getComputedStyle(img);
              const x=Math.max(0,Math.min(innerWidth-1,rect.x+rect.width/2)),y=Math.max(0,Math.min(innerHeight-1,rect.y+rect.height/2));
              const paintedElement=document.elementFromPoint(x,y);
              return {sourceUrl:img.currentSrc||img.src,decoded,width:img.naturalWidth,height:img.naturalHeight,
                visible:!img.hidden&&style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)>0&&rect.width>0&&rect.height>0&&paintedElement===img,
                imageKind:row.dataset.imageKind,declaredOfficialCardId:row.dataset.officialCardId||null};
            }''')
            observation['http'] = responses.get(observation['sourceUrl'])
            if observation['sourceUrl'].startswith('https://www.pokemon-card.com/'):
                observation['officialHttpImage'] = bool(observation['http'] and observation['http']['status'] == 200 and observation['http']['contentType'].startswith('image/'))
                if not observation['officialHttpImage']:
                    observation['decoded'] = False
            if observation['sourceUrl'].startswith('data:'):
                observation['sourceUrl'] = 'ORIGINAL_PLACEHOLDER'
            observations.append(observation)
        report = await page.evaluate('''({manifest,registry,observations})=>{
          const lookup=new Map(registry.cards.map(r=>[String(r.officialCardId),r]));let i=0;
          const rows=manifest.decks.flatMap(deck=>deck.cards.map((card,index)=>{
            const observation=observations[i++];
            return {...PokecaFixedDeckImageAudit.entry(card,lookup.get(String(card.officialCardId)),observation),deckId:deck.id,entryIndex:index,observation};
          }));return PokecaFixedDeckImageAudit.summarize(rows);
        }''', {'manifest': manifest, 'registry': registry, 'observations': observations})
        report.update(schemaVersion=2, inspectedIn='Chromium Pixel 5 Android emulation', physicalAndroidVerified=False,
                      sessionProxyCaPinned=bool(args), serviceWorkersBlocked=True, imageFilesSaved=False, javascriptErrors=errors, requestFailures=failures,
                      verifiedDeckPrintCopies=report['officialDisplayedCopies'],
                      actualOfficialPreviewCopies=sum(card['count'] for (_, _, card), obs in zip(entries, observations) if obs['decoded'] and obs['visible'] and obs.get('officialHttpImage')))
        report['productionPass'] = report['productionPass'] and not errors
        report['previewDisplayPass'] = report['actualOfficialPreviewCopies'] == 120 and not errors
        assert await page.evaluate('PokecaMobile.port.getSnapshot()') == before, 'image inspection changed game state'
        Path('artifacts').mkdir(exist_ok=True)
        Path('artifacts/official-fixed-120-result.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps({key: report[key] for key in ['totalCards', 'officialDisplayedCopies', 'pendingCopies', 'actualOfficialPreviewCopies', 'previewDisplayPass', 'productionPass', 'javascriptErrors']}, ensure_ascii=False))
        await browser.close()
        if errors:
            return 1
        required_result = 'previewDisplayPass' if '--require-preview' in sys.argv[1:] else 'productionPass'
        return 0 if report[required_result] else 2

if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
