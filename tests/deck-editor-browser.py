"""Exercise the existing deck pages at a mobile Chromium viewport."""
import os
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from test_fixed_deck_browser_images import session_ca_args
from playwright.sync_api import expect, sync_playwright


def run(base):
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=os.environ.get("CHROMIUM_EXECUTABLE"), args=session_ca_args())
        page = browser.new_page(
            viewport={"width": 320, "height": 700}, is_mobile=True, has_touch=True
        )
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(base + "/")
        page.get_by_role("link", name="新規デッキ").click()
        name = page.locator("#deck-name")
        name.fill("モバイル検証")
        def open_search():
            page.get_by_role("link", name="カードを追加").click()
            expect(page.get_by_role("heading", name="カード検索・追加")).to_be_visible()
            expect(page.locator("#deck-overview")).to_be_hidden()
        def back_to_editor():
            page.locator("#builder-back").click()
            expect(page.locator("#deck-overview")).to_be_visible()
            expect(page.locator("#cards")).to_be_hidden()
        open_search()
        page.locator("#query").fill("47832")
        add = page.get_by_role("button", name="ケーシィを追加")
        expect(add).to_be_visible()
        expect(page.locator("#cards img")).to_have_attribute("src", "https://www.pokemon-card.com/assets/images/card_images/large/M1S/047832_P_KESHII.jpg")
        for _ in range(5):
            add.click()
        expect(page.locator("#total")).to_have_text("4 / 60枚")
        expect(page.locator("#in-deck-47832")).to_have_text("デッキ内 4枚")
        expect(page.locator("#message")).to_contain_text("同名4枚制限")
        page.reload()
        expect(page.locator("#total")).to_have_text("4 / 60枚")
        expect(page.locator("#header-name")).to_have_text("モバイル検証")
        back_to_editor()
        expect(page.locator(".overview-count")).to_have_text("×4")
        page.get_by_role("button", name="ケーシィ ×4の編集へ").click()
        expect(page.locator("#editing-card-47832")).to_be_focused()
        page.get_by_role("button", name="ケーシィを1枚減らす").click()
        expect(page.locator(".overview-count")).to_have_text("×3")
        expect(page.get_by_role("heading", name="ポケモン 3枚")).to_be_visible()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.locator("#save").click()
        page.reload()
        tile = page.locator(".deck-home-card").filter(has_text="モバイル検証")
        tile.get_by_role("link", name="編集する").click()
        expect(name).to_have_value("モバイル検証")
        page.get_by_text("その他の操作").click()
        page.get_by_role("button", name="複製").click()
        page.locator("#save").click()
        expect(page.locator(".deck-home-card")).to_have_count(2)

        page.get_by_role("link", name="公式コード取り込み").click()
        code = "ABC123-DEF456-GHI789"
        page.locator("#code").fill(code)
        # File injection does not wait for the input to become enabled.
        expect(page.locator("#html-file")).to_be_enabled()
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
        expect(name).to_have_value("取り込んだデッキ")
        page.get_by_role("button", name="カードID 999999999を1枚減らす").click()
        open_search()
        page.locator("#query").fill("44962")
        page.get_by_role("button", name="基本超エネルギーを追加").click()
        back_to_editor()
        expect(page.locator("#total")).to_have_text("60 / 60枚")
        page.locator("#save").click()
        page.locator(".deck-home-card").filter(has_text="取り込んだデッキ").get_by_role("link", name="編集する").click()
        expect(page.locator("#total")).to_have_text("60 / 60枚")
        expect(page.locator("#message")).not_to_contain_text("BLOCKED")
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.goto(base + "/")
        expect(page.get_by_role("heading", name="デッキ", exact=True)).to_be_visible()
        expect(page.locator("#app")).to_be_hidden()
        assert page.locator("#deck-home").evaluate("node=>getComputedStyle(node).backgroundColor") == "rgb(255, 255, 255)"
        assert page.locator("#deck-home-grid").evaluate("node=>getComputedStyle(node).gridTemplateColumns.split(' ').length") == 2

        invalid = page.locator(".deck-home-card").filter(has=page.get_by_role("heading", name="モバイル検証", exact=True))
        invalid.get_by_role("button",name="対戦する").click()
        expect(page.locator("#deck-home-status")).to_contain_text("60枚")
        expect(page.locator("#app")).to_be_hidden()
        page.get_by_role("link", name="新規デッキ").click()
        page.locator("#deck-name").fill("選択デッキ")
        open_search()
        for card_id, card_name, count in (
            ("45152", "シェイミ", 4), ("49463", "基本超エネルギー", 56)
        ):
            page.locator("#query").fill(card_id)
            button = page.get_by_role("button",name=card_name + "を追加",exact=True)
            for _ in range(count):
                button.click()
        back_to_editor()
        page.get_by_text("その他の操作").click()
        page.locator("#deck-cover").select_option("45152")
        page.locator("#save").click()
        tile = page.locator(".deck-home-card").filter(has_text="選択デッキ")
        expect(tile.locator("img")).to_have_attribute("alt", "シェイミ")
        expect(tile.locator("img")).to_have_count(1)
        tile.get_by_role("button",name="選択デッキの内容を見る").click()
        expect(page.locator("#deck-detail-cards")).to_contain_text("シェイミ ×4")
        page.locator("#deck-home-details").get_by_role("button",name="閉じる").click()
        page.locator("#deck-home-search").fill("シェイミ")
        expect(page.locator(".deck-home-card")).to_have_count(1)
        tile.get_by_role("button",name="対戦する").click()
        expect(page.locator("#deck-home-selection")).to_contain_text("選択デッキ（60枚）")
        page.get_by_role("button",name="対戦準備へ").click()
        page.locator("[data-opening-active]:enabled").first.click()
        page.locator("#opening-start").click()
        expect(page.locator("#save-status")).to_have_text("自動保存済")
        assert page.evaluate("""() => {
            const game = PokecaMobile.port.getResumeSnapshot().game;
            const selected = JSON.parse(localStorage.getItem('pokeca.deck-builder.v1')).decks
                .find(deck => deck.name === '選択デッキ');
            const player = game.players.find(player => player.id === 'you');
            const cards = [player.active,...player.bench,...player.deck,...player.hand,...player.prizeCards];
            return game.referenceEffectValidation.sourceDeckIds[0] === selected.id &&
                cards.length === 60 &&
                cards.filter(card => card.validationReference.officialCardId === '45152').length === 4 &&
                cards.filter(card => card.validationReference.officialCardId === '49463').length === 56;
        }""")
        expect(page.locator("#self-active").get_by_role("button",name="シェイミ・HP 70")).to_be_visible()
        assert page.evaluate("""() => {
            const hand = document.querySelector('.hand-panel').getBoundingClientRect();
            return hand.top >= 0 && hand.bottom <= visualViewport.height + 1;
        }""")
        match_id = page.evaluate("PokecaMobile.port.getSessionId()")
        page.get_by_role("link", name="デッキ一覧").click()
        expect(tile).to_be_visible()
        page.reload()
        page.get_by_role("link", name="対戦・再開").click()
        expect(page.locator("#save-status")).to_have_text("自動保存済")
        assert page.evaluate("PokecaMobile.port.getSessionId()") == match_id
        expect(page.locator("#self-active").get_by_role("button",name="シェイミ・HP 70")).to_be_visible()
        assert page.evaluate("""() => {
            const game = PokecaMobile.port.getResumeSnapshot().game;
            game.status = 'finished';
            game.winner = 'you';
            return PokecaMobile.port.loadGame(game).ok;
        }""")
        expect(page.locator("#turn-label")).to_contain_text("対戦終了")
        page.get_by_role("link", name="デッキ一覧").click()
        expect(tile).to_be_visible()
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
