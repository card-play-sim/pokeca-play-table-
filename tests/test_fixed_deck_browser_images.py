import asyncio
import os
import sys
import json
from pathlib import Path
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE'))
        page = await browser.new_page(viewport={"width": 393, "height": 852}, device_scale_factor=2)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error) + " STACK: " + (error.stack or "")))
        await page.goto("http://127.0.0.1:8765/", wait_until="domcontentloaded")
        await page.locator("#self-hand").wait_for()
        await page.wait_for_function("() => document.querySelectorAll('#self-hand .card, #self-active .card, #self-bench .card').length > 0",timeout=15000)
        board = await page.evaluate("""() => {
          const cards=[...document.querySelectorAll('#self-hand .card, #self-active .card, #self-bench .card')];
          return {total:cards.length,withImage:cards.filter(c=>!!c.querySelector('img')).length,
            withoutImage:cards.filter(c=>!c.querySelector('img')).map(c=>c.getAttribute('aria-label'))};
        }""")
        print("Gameplay board image nodes: "+json.dumps(board,ensure_ascii=False))
        assert board["withImage"] == board["total"], "Some gameplay cards have no image element"
        await page.locator("#menu-open").click()
        await page.get_by_text("固定2デッキ（各60枚）を確認").click()
        await page.locator("#deck-image-check").wait_for()
        await page.wait_for_function("""() => {
          const el=document.getElementById('deck-image-check');
          const txt=el?.textContent||'';
          const match=txt.match(/検査済 (\\d+)\\/(\\d+)/);
          return match && Number(match[1])===Number(match[2]);
        }""", timeout=60000)
        entries = page.locator(".deck-manifest-list > div")
        entry_count = await entries.count()
        print(f"Deck card types displayed: {entry_count}")
        assert entry_count == 56, f"Expected 56 deck entries (30 + 26), got {entry_count}"
        candidate_summary = await page.locator("#sheet details summary").all_inner_texts()
        source=json.loads((Path(__file__).resolve().parents[1]/'data/fixed-deck-formal-1945-pokemon-candidates.json').read_text())['candidates']
        names=sum(bool(c['officialCardIds']) for c in source)
        prints=sum(len(c['officialCardIds']) for c in source)
        expected=f"{names}/{len(source)}種類・{prints}印刷版（未採用）"
        assert any(expected in item for item in candidate_summary), f"Candidate audit not shown: {candidate_summary}"
        images = await page.locator(".deck-manifest-list img").count()
        loaded = await page.locator(".deck-manifest-list img").evaluate_all(
            "(els) => els.filter(x => x.complete && x.naturalWidth > 0).length"
        )
        coverage = await page.evaluate("""() => {
          const rows=[...document.querySelectorAll('.deck-manifest-list > div')];
          return rows.map(row=>{
            const name=row.querySelector('span b')?.parentElement?.textContent?.replace(/^\\s*\\d+枚\\s*/, '').trim() || '';
            const img=row.querySelector('img');
            return {name, hasImage:!!img, decoded:!!img && img.complete && img.naturalWidth>0,
              source:img?.currentSrc||img?.src||null,
              fallbackVisible:!!row.querySelector('span:not([hidden])') && !img};
          });
        }""")
        missing = sorted(set(row["name"] for row in coverage if not row["decoded"]))
        unique_names = set(row["name"] for row in coverage)
        assert len(unique_names) == 45, f"Expected 45 unique names, got {len(unique_names)}"
        deck_counts = await page.evaluate("""async () => {
          const res=await fetch('./data/fixed-test-decks.json',{cache:'no-store'});
          const data=await res.json();
          return data.decks.map(deck=>({name:deck.name,total:deck.cards.reduce((sum,c)=>sum+c.count,0),
            cards:deck.cards.map(c=>({name:c.name,count:c.count}))}));
        }""")
        assert len(deck_counts)==2 and all(deck["total"]==60 for deck in deck_counts), "Fixed deck 60+60 mismatch"
        by_name = {row["name"]:row["decoded"] for row in coverage}
        expanded = [
          {"name":c["name"],"count":c["count"],"decoded":by_name.get(c["name"],False)}
          for deck in deck_counts for c in deck["cards"]
        ]
        expanded_success=sum(row["count"] for row in expanded if row["decoded"])
        assert sum(row["count"] for row in expanded)==120, "Fixed deck 120 copies mismatch"
        # Decoding original placeholders or name previews is NOT official print success.
        official_rows = {row['name']: row for row in coverage if row['decoded'] and (row['source'] or '').startswith('https://www.pokemon-card.com/assets/images/card_images/')}
        manifest = json.loads((Path(__file__).resolve().parents[1]/'data/fixed-test-decks.json').read_text())
        registry=json.loads((Path(__file__).resolve().parents[1]/'data/official-image-registry.json').read_text())['cards']
        by_id={str(c['officialCardId']):c for c in registry}
        def exact(c):
            r=by_id.get(str(c.get('officialCardId')), {})
            return c.get('identityStatus')=='CONFIRMED' and r.get('name')==c['name'] and official_rows.get(c['name'],{}).get('source')==r.get('imageSourceUrl') and (not c.get('cardNumber') or c['cardNumber']==r.get('cardNumber')) and (not c.get('set') or c['set']==r.get('set'))
        exact_copies = sum(c['count'] for d in manifest['decks'] for c in d['cards'] if exact(c))
        Path('artifacts').mkdir(exist_ok=True)
        Path('artifacts/official-fixed-120-result.json').write_text(json.dumps(dict(physicalCards=120,uniqueNames=len(unique_names),decodedTemplateCopies=expanded_success,decodedOfficialPreviewNames=len(official_rows),verifiedDeckPrintCopies=exact_copies,productionPass=exact_copies==120,androidPhysicalDeviceVerified=False),ensure_ascii=False,indent=2))
        print(f"Fixed 120 card copies covered by decoded image template: {expanded_success}/120")
        Path("artifacts").mkdir(exist_ok=True)
        Path("artifacts/fixed-deck-45-image-coverage.json").write_text(
            json.dumps({"uniqueNames":len(unique_names),"totalEntries":len(coverage),
              "decodedEntries":sum(row["decoded"] for row in coverage),
              "missingUniqueNames":missing,"entries":coverage},
              ensure_ascii=False,indent=2),encoding="utf-8")
        print(f"Actual fixed deck coverage: {len(unique_names)-len(missing)}/45 unique names; missing {len(missing)}")
        print("MISSING_IMAGE_NAMES_JSON=" + json.dumps(missing, ensure_ascii=False))
        print("MISSING_IMAGE_COUNTS=" + json.dumps({
          row["name"]:sum(1 for r in coverage if r["name"]==row["name"])
          for row in coverage if row["name"] in missing
        }, ensure_ascii=False))
        diagnostic = await page.locator("#deck-image-check").inner_text()
        Path("artifacts").mkdir(exist_ok=True)
        await page.locator("#sheet").screenshot(path="artifacts/fixed-deck-images-mobile.png")
        Path("artifacts/fixed-deck-image-result.txt").write_text(f"Images {loaded}/{images}; {diagnostic}\\nJavaScript errors: {errors}\\n", encoding="utf-8")
        print(f"Images {loaded}/{images}; {diagnostic}")
        print("JavaScript errors:", errors)
        assert not errors, "Browser runtime errors: " + str(errors)
        assert images > 0, "No card image elements"
        assert loaded > 0, "No image was actually decoded by Chromium"
        assert loaded == images, f"Image decode failures: {loaded}/{images}"
        await browser.close()
        if exact_copies!=120:
            print(f'BLOCKED: exact official deck print images {exact_copies}/120; previews/placeholders are not PASS')
            sys.exit(2)

asyncio.run(main())
