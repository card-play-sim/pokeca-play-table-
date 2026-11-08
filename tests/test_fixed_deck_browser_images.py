import asyncio
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
        images = await page.locator(".deck-manifest-list img").count()
        loaded = await page.locator(".deck-manifest-list img").evaluate_all(
            "(els) => els.filter(x => x.complete && x.naturalWidth > 0).length"
        )
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
