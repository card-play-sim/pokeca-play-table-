"""Exercise the existing deck pages at a mobile Chromium viewport."""
import os
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from playwright.sync_api import expect, sync_playwright


def run(base):
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(
            viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True
        )
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(base + "/deck-builder.html")
        page.locator("#query").fill("47832")
        add = page.get_by_role("button", name="ケーシィを追加")
        expect(add).to_be_visible()
        expect(page.locator("#cards img")).to_have_attribute("src", "https://www.pokemon-card.com/assets/images/card_images/large/M1S/047832_P_KESHII.jpg")
        page.locator("#deck-name").fill("モバイル検証")
        for _ in range(5):
            add.click()
        expect(page.locator("#total")).to_have_text("4 / 60枚")
        expect(page.locator("#message")).to_contain_text("同名4枚制限")
        page.get_by_role("button", name="ケーシィを1枚減らす").click()
        page.locator("#save").click()
        page.reload()
        page.get_by_role("button", name="モバイル検証 · 3枚").click()
        expect(page.locator("#deck-name")).to_have_value("モバイル検証")
        expect(page.locator("#saved img")).to_have_count(1)
        page.get_by_text("その他の操作").click()
        page.get_by_role("button", name="複製").click()
        page.locator("#save").click()
        expect(page.locator("#saved button")).to_have_count(2)

        page.get_by_role("link", name="公式コード取り込み").click()
        code = "ABC123-DEF456-GHI789"
        page.locator("#code").fill(code)
        values = dict(saveDeckID=code, deck_pke="47832_4_1-999999999_1_1",
                      deck_gds="", deck_tool="", deck_tech="", deck_sup="",
                      deck_sta="", deck_ene="44962_55_1")
        recipe = "".join(f'<input type="hidden" name="{key}" value="{value}">'
                         for key, value in values.items())
        page.locator("#html-file").set_input_files({
            "name": "official-deck.html", "mimeType": "text/html", "buffer": recipe.encode()
        })
        expect(page.locator("#status")).to_contain_text("60枚を解析")
        page.locator("#edit").click()
        expect(page.locator("#total")).to_have_text("60 / 60枚")
        expect(page.locator("#message")).to_contain_text("BLOCKED")
        page.get_by_role("button", name="カードID 999999999をすべて削除").click()
        page.locator("#query").fill("44962")
        page.get_by_role("button", name="基本超エネルギーを追加").click()
        expect(page.locator("#total")).to_have_text("60 / 60枚")
        page.locator("#save").click()
        page.reload()
        expect(page.locator("#total")).to_have_text("60 / 60枚")
        expect(page.locator("#message")).to_have_text("60枚・同名枚数の基本チェック完了")
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        assert not errors, errors
        browser.close()
        print("Mobile Chromium deck search, limits, save/reload, duplication and import editing PASS")


if __name__ == "__main__":
    public_url = os.environ.get("POKECA_TEST_URL")
    if public_url:
        run(public_url.rstrip("/"))
        raise SystemExit(0)
    server = ThreadingHTTPServer(("127.0.0.1", 0), SimpleHTTPRequestHandler)
    with server:
        threading.Thread(target=server.serve_forever, daemon=True).start()
        run(f"http://127.0.0.1:{server.server_port}")
        server.shutdown()
