"""Synthetic browser behavior only; never evidence of official image availability."""
from pathlib import Path
import json
import os
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE'),headless=True,args=['--no-sandbox'])
    for width,height in [(360,640),(393,852),(412,915)]:
        context=browser.new_context(viewport={'width':width,'height':height},is_mobile=True,has_touch=True)
        page=context.new_page();page.set_default_timeout(10000)
        failures=[];image_ok=False
        page.on('pageerror',lambda e:failures.append(str(e)))
        def route(r):
            if r.request.url.startswith('https://www.pokemon-card.com/'):
                if image_ok:r.fulfill(content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="63" height="88"><rect width="63" height="88" fill="green"/></svg>')
                else:r.abort()
                return
            relative=r.request.url.split('http://pokeca.test/',1)[-1].split('?')[0] or 'index.html'
            file=(ROOT/relative).resolve()
            if file.is_relative_to(ROOT) and file.is_file():r.fulfill(path=str(file))
            else:r.abort()
        page.route('**/*',route)
        page.goto('http://pokeca.test/')
        page.wait_for_function('window.PokecaMobile && PokecaImageRegistryStatus.state==="ready"')
        # Registry loading and session restoration are independent async operations.
        page.wait_for_function('document.getElementById("save-status").textContent==="自動保存済"')
        # Late dynamic registry is connected to the real mobile render path.
        snapshot=page.evaluate('PokecaMobile.port.getSnapshot()')
        page.locator('#menu-open').click();page.get_by_text('固定2デッキ（各60枚）を確認',exact=True).click()
        page.wait_for_function('document.querySelectorAll(".deck-manifest-list > div").length===56')
        assert page.locator('.deck-manifest-list > div').count()==56
        page.wait_for_function(r'''() => {const t=document.querySelector('#deck-image-check').textContent;const m=t.match(/検査済 (\d+)\/(\d+)/);return m && m[1]===m[2];}''')
        assert '仮画像' in page.locator('#sheet-content').inner_text()
        assert page.evaluate('PokecaMobile.port.getSnapshot()')==snapshot
        assert page.locator('.deck-manifest-list img').first.evaluate('(img)=>getComputedStyle(img).objectFit')=='contain'
        before=page.evaluate('Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage[k]]))')
        page.reload()
        page.wait_for_function('window.PokecaMobile && PokecaImageRegistryStatus.state==="ready"')
        # Registry loading and session restoration are independent async operations.
        page.wait_for_function('document.getElementById("save-status").textContent==="自動保存済"')
        assert page.evaluate('PokecaMobile.port.getSnapshot()')==snapshot
        # An invalid/failed refresh cannot clear the prior resolver batch.
        page.evaluate("window.fetch=async()=>({ok:false,status:503})")
        result=page.evaluate("async()=>{const n=PokecaImageResolver.count();try{await PokecaImageResolver.loadRegistry('/fail');}catch{}return n===PokecaImageResolver.count();}")
        assert result
        assert not failures,failures
        print(f'PASS {width}x{height}: 56 rows/120 copies; error fallback, contain, reload, snapshot, failed registry refresh')
        context.close()
    browser.close()
