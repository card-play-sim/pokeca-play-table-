import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 393, "height": 852}, device_scale_factor=2)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error) + " STACK: " + (error.stack or "")))
        await page.goto("http://127.0.0.1:8765/", wait_until="domcontentloaded")
        await page.locator("#menu-open").click()
        await page.get_by_text("固定2デッキ（各60枚）を確認").click()
        await page.locator("#deck-image-check").wait_for()
        await page.wait_for_function("""() => {
          const el=document.getElementById('deck-image-check');
          const txt=el?.textContent||'';
          const match=txt.match(/検査済 (\\d+)\\/(\\d+)/);
          return match && Number(match[1])===Number(match[2]);
        }""", timeout=30000)
        entries = page.locator(".deck-manifest-list > div")
        entry_count = await entries.count()
        print(f"Deck card types displayed: {entry_count}")
        assert entry_count == 56, f"Expected 56 deck entries (30 + 26), got {entry_count}"
        candidate_summary = await page.locator("#sheet details summary").all_inner_texts()
        assert any("11/16種類・55印刷版（未採用）" in item for item in candidate_summary), f"Candidate audit not shown: {candidate_summary}"
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

asyncio.run(main())
