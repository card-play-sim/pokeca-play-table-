"""Exercise the existing deck pages at a mobile Chromium viewport."""
import os
import json
from pathlib import Path
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
        name.fill("モバイル検証・下書き")
        def open_search():
            page.get_by_role("link", name="カードを追加").click()
            expect(page.get_by_role("heading", name="カード検索・追加")).to_be_visible()
            expect(page.locator("#deck-overview")).to_be_visible()
            expect(page.locator("#search-screen")).to_be_visible()
        def back_to_editor():
            page.locator("#close-picker").click()
            expect(page.locator("#deck-overview")).to_be_visible()
            expect(page.locator("#cards")).to_be_hidden()
        open_search()
        classification = page.evaluate("async()=> (await (await fetch('data/deck-building/catalog.json')).json())")
        assert len(classification['records']) > 4357
        assert not classification['blocked']
        labels = {'pokemon':'ポケモン','goods':'グッズ','support':'サポート','tool':'ポケモンのどうぐ','stadium':'スタジアム','energy':'エネルギー'}
        image_checks=[]
        for mark in ('H','I','J'):
            page.locator('#regulation').select_option(mark)
            for category in labels:
                page.locator('#category').select_option(category)
                matching = [r for r in classification['records'] if r['regulationMark']==mark and r['category']==category]
                expected = len(matching)
                unique_names = len({r['source']['identityName'] for r in matching})
                expect(page.locator('#catalog-info')).to_have_text(f'{unique_names}種類（公式印刷版 {expected}件）')
                expect(page.locator('#cards .builder-card')).to_have_count(min(unique_names,48))
                if expected:
                    page.wait_for_function("document.querySelector('#cards img').naturalWidth>0",timeout=60000)
                    image_checks.append({'regulation':mark,'category':category,'imageUrl':page.locator('#cards img').first.get_attribute('src'),'success':True})
        page.locator('#regulation').select_option('')
        page.locator('#category').select_option('')
        # Search results must not repeat same-name prints on the main grid,
        # yet the chooser must keep each official printing selectable.
        page.locator('#query').fill('ラティアスex')
        # Partial matching also finds メガラティアスex; assert only the exact-name group.
        latias = page.locator('#cards .builder-card').filter(has=page.get_by_text('ラティアスex', exact=True))
        expect(latias).to_have_count(1)
        latias.locator('.print-chooser-open').click()
        expect(page.locator('#print-chooser')).to_be_visible()
        variant = page.locator('#chooser-cards .builder-card').filter(has_text='#48597')
        expect(variant).to_have_count(1)
        variant.get_by_role('button', name='ラティアスex #48597を選ぶ').click()
        expect(page.locator('#print-chooser')).not_to_be_visible()
        expect(latias.locator('small').first).to_contain_text('#48597')
        expect(latias.locator('img')).to_have_attribute('src', 'https://www.pokemon-card.com/assets/images/card_images/large/M2a/048597_P_RATEIASUEX.jpg')
        page.locator('#query').fill('48597')
        expect(page.locator('#cards .builder-card')).to_have_count(1)
        expect(page.locator('#cards .print-chooser-open')).to_have_count(0)
        page.locator('#query').fill('キチキギスex')
        kichi = page.locator('#cards .builder-card').filter(has=page.get_by_text('キチキギスex', exact=True))
        expect(kichi).to_have_count(1)
        expect(kichi.locator('.print-chooser-open')).to_have_count(1)
        page.locator('#query').fill('')
        aces = [r for r in classification['records'] if r['aceSpec']]
        for index, ace in enumerate(aces[:2]):
            page.locator('#query').fill(ace['officialCardId'])
            page.locator('#cards .add-card').click()
            expect(page.locator('#total')).to_have_text('1 / 60枚')
            if index: expect(page.locator('#message')).to_contain_text('ACE SPEC')
        back_to_editor()
        page.get_by_role('button',name='を1枚減らす',exact=False).click()
        open_search()
        page.locator("#query").fill("47832")
        add = page.get_by_role("button", name="ケーシィを追加")
        expect(add).to_be_visible()
        expect(page.locator("#cards img")).to_have_attribute("src", "https://www.pokemon-card.com/assets/images/card_images/large/M1S/047832_P_KESHII.jpg")
        image = page.locator('#cards img')
        expect(image).to_be_visible()
        page.wait_for_function("document.querySelector('#cards img').naturalWidth>0",timeout=60000)
        # The bottom-sheet picker scrolls independently of the page. Ensure
        # the thumbnail is inside the viewport before sending mouse events.
        image.scroll_into_view_if_needed()
        box = image.bounding_box()
        assert box and 0 <= box['y'] and box['y'] + box['height'] <= 700
        point_x,point_y=box['x']+box['width']/2,box['y']+box['height']/2
        hit=page.evaluate("([x,y])=>{let e=document.elementFromPoint(x,y);return {tag:e?.tagName,cls:e?.className,alt:e?.getAttribute('alt'),imageRect:document.querySelector('#cards img')?.getBoundingClientRect().toJSON()}}",[point_x,point_y])
        print('DECK_LONG_PRESS_HIT_TARGET',json.dumps(hit,ensure_ascii=False),flush=True)
        page.evaluate("""()=>{window.__pressLog=[];for(let t of ['pointerdown','pointermove','pointerleave','pointercancel','pointerup','click'])document.addEventListener(t,e=>window.__pressLog.push({type:t,tag:e.target.tagName,cls:e.target.className,pointerType:e.pointerType}),true)}""")
        page.mouse.move(point_x,point_y)
        page.mouse.down()
        page.wait_for_timeout(650)
        print('DECK_LONG_PRESS_EVENTS',json.dumps(page.evaluate("window.__pressLog"),ensure_ascii=False),flush=True)
        print('DECK_LONG_PRESS_STATE',json.dumps(page.evaluate("()=>({open:document.querySelector('#card-preview').open,element:document.elementFromPoint(innerWidth/2,innerHeight/2)?.tagName})"),ensure_ascii=False),flush=True)
        expect(page.locator('#card-preview')).to_be_visible()  # must open while held
        page.mouse.up()
        expect(page.locator('#card-preview')).to_be_visible()  # must survive release
        expect(page.locator('#preview-image')).to_have_attribute('src',image.get_attribute('src'))
        assert page.locator('#preview-image').evaluate("img=>getComputedStyle(img).objectFit") == 'contain'
        assert page.locator('#preview-image').evaluate("img=>img.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))") is False
        page.mouse.click(2,2)
        expect(page.locator('#card-preview')).not_to_be_visible()
        image.click()
        expect(page.locator('#card-preview')).not_to_be_visible()
        expect(page.locator('#total')).to_have_text('1 / 60枚')
        expect(page.locator('#in-deck-47832')).to_have_text('デッキ内 1枚')
        # Touch release can generate a click on the new backdrop when the
        # original thumbnail is near the bottom edge of the viewport.
        page.locator('#query').fill('')
        lower_card = page.locator('#cards img').nth(18)
        lower_card.scroll_into_view_if_needed()
        box = lower_card.bounding_box()
        assert box and 0 <= box['y'] and box['y']+box['height'] <= 700
        point = {'x':box['x']+box['width']/2,'y':box['y']+box['height']/2}
        print('DECK_TOUCH_HIT_TARGET',json.dumps(page.evaluate("([x,y])=>({tag:document.elementFromPoint(x,y)?.tagName,alt:document.elementFromPoint(x,y)?.getAttribute('alt')})",[point['x'],point['y']]),ensure_ascii=False),flush=True)
        cdp = page.context.new_cdp_session(page)
        cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[point]})
        page.wait_for_timeout(650)
        expect(page.locator('#card-preview')).to_be_visible()
        assert page.locator('#card-preview').evaluate("dialog=>dialog.open && dialog.getBoundingClientRect().width>0 && dialog.getBoundingClientRect().height>0")
        cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
        expect(page.locator('#card-preview')).to_be_visible()
        page.touchscreen.tap(2,2)
        expect(page.locator('#card-preview')).not_to_be_visible()
        expect(page.locator('#total')).to_have_text('1 / 60枚')
        page.locator('#query').fill('47832')
        for _ in range(5):
            add.click()
        expect(page.locator("#total")).to_have_text("4 / 60枚")
        expect(page.locator("#in-deck-47832")).to_have_text("デッキ内 4枚")
        expect(page.locator("#message")).to_contain_text("同名4枚制限")
        page.reload()
        expect(page.locator("#total")).to_have_text("4 / 60枚")
        expect(page.locator("#header-name")).to_have_text("モバイル検証・下書き")
        back_to_editor()
        name.fill("モバイル検証")
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
        page.goto(base + '/deck-code-import.html')
        page.locator('#code').fill('kbvV5V-TEZjLI-dVfVVk')
        page.locator('#html-file').set_input_files(str(Path(__file__).parent/'fixtures/deck-work-002/official-code.html'))
        expect(page.locator('#status')).to_contain_text('カードIDと公式画像を照合')
        page.locator('#edit').click()
        expect(page.locator('#total')).to_have_text('60 / 60枚')
        page.locator('#deck-name').fill('公式コード実測')
        page.locator('#save').click()
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
            ("49011", "マリル", 4), ("48251", "あなあけスコップ", 1), ("49463", "基本超エネルギー", 55)
        ):
            page.locator("#query").fill(card_id)
            button = page.get_by_role("button",name=card_name + "を追加",exact=True)
            for _ in range(count):
                button.click()
        button.click()
        expect(page.locator('#total')).to_have_text('60 / 60枚')
        expect(page.locator('#message')).to_contain_text('60枚')
        back_to_editor()
        page.get_by_text("その他の操作").click()
        page.locator("#deck-cover").select_option("49011")
        page.locator("#save").click()
        tile = page.locator(".deck-home-card").filter(has_text="選択デッキ")
        expect(tile.locator("img")).to_have_attribute("alt", "マリル")
        expect(tile.locator("img")).to_have_count(1)
        tile.get_by_role("button",name="選択デッキの内容を見る").click()
        expect(page.locator('#deck-name')).to_have_value('選択デッキ')
        expect(page.locator('#total')).to_have_text('60 / 60枚')
        expect(page.locator('.overview-count')).to_have_count(3)
        page.locator('#builder-back').click()
        page.locator("#deck-home-search").fill("マリル")
        expect(page.locator(".deck-home-card")).to_have_count(1)
        tile.get_by_role("button",name="対戦する").click()
        expect(page.locator("#deck-home-selection")).to_contain_text("選択デッキ（60枚）")
        page.get_by_role("button",name="対戦準備へ").click()
        page.locator("[data-opening-active]:enabled").first.click()
        page.locator("#opening-start").click()
        # Opponent mulligans can legitimately open a mandatory bonus-draw choice.
        # Resolve it through the same visible option a player uses before leaving.
        page.wait_for_function("""() => {
            const selected=JSON.parse(localStorage.getItem('pokeca.deck-builder.v1')).decks
                .find(deck=>deck.name==='選択デッキ');
            return PokecaMobile.port.getSnapshot().referenceEffectValidation?.sourceDeckIds?.[0]===selected.id;
        }""")
        mulligan_choices = 0
        while page.evaluate("""() => {
            const choice=PokecaMobile.port.getSnapshot().pendingReferenceChoice;
            return choice?.kind==='MULLIGAN' && choice.playerId==='you';
        }"""):
            assert mulligan_choices < 4
            page.get_by_role('button',name='引き直しにより追加で0枚引く',exact=True).click()
            mulligan_choices += 1
        expect(page.locator('#sheet')).not_to_be_visible()
        expect(page.locator("#save-status")).to_have_text("自動保存済")
        assert page.evaluate("""() => {
            const game = PokecaMobile.port.getResumeSnapshot().game;
            const selected = JSON.parse(localStorage.getItem('pokeca.deck-builder.v1')).decks
                .find(deck => deck.name === '選択デッキ');
            const player = game.players.find(player => player.id === 'you');
            const cards = [player.active,...player.bench,...player.deck,...player.hand,...player.prizeCards];
            return game.referenceEffectValidation.sourceDeckIds[0] === selected.id &&
                cards.length === 60 &&
                cards.filter(card => card.validationReference.officialCardId === '49011').length === 4 &&
                cards.filter(card => card.validationReference.officialCardId === '48251').length === 1 &&
                cards.filter(card => card.validationReference.officialCardId === '49463').length === 55;
        }""")
        expect(page.locator("#self-active").get_by_role("button",name="マリル・HP 70")).to_be_visible()
        assert page.evaluate("""() => {
            const hand = document.querySelector('.hand-panel').getBoundingClientRect();
            return hand.top >= 0 && hand.bottom <= visualViewport.height + 1;
        }""")
        Path('test-results').mkdir(exist_ok=True)
        page.screenshot(path='test-results/deck-work-002-battle.png',full_page=True)
        match_id = page.evaluate("PokecaMobile.port.getSessionId()")
        saved_game = page.evaluate("PokecaMobile.port.getResumeSnapshot().game")
        page.get_by_role("link", name="デッキ一覧").click()
        expect(tile).to_be_visible()
        page.reload()
        page.get_by_role("link", name="対戦・再開").click()
        expect(page.locator("#save-status")).to_have_text("自動保存済")
        assert page.evaluate("PokecaMobile.port.getSessionId()") == match_id
        assert page.evaluate("PokecaMobile.port.getResumeSnapshot().game") == saved_game
        expect(page.locator("#self-active").get_by_role("button",name="マリル・HP 70")).to_be_visible()
        # Put the exact saved I print into hand without changing its physical identity,
        # then play it through the same UI controls as a normal drawn card.
        scoop = page.evaluate("""() => {
            const game = PokecaMobile.port.getResumeSnapshot().game;
            const p = game.players[0];
            const isScoop = card => card.validationReference.officialCardId === '48251';
            const slot = p.deck.findIndex(isScoop);
            const prize = p.prizeCards.findIndex(isScoop);
            if (slot >= 0) p.hand.push(p.deck.splice(slot,1)[0]);
            if (prize >= 0) p.hand.push(p.prizeCards.splice(prize,1,p.deck.pop())[0]);
            const ids = p.deck.slice(0,2).map(card=>card.id);
            const card = p.hand.find(isScoop);
            if (!PokecaMobile.port.loadGame(game).ok) throw Error('I/J fixture could not load');
            return {id:card.id,ids};
        }""")
        page.locator(f'#self-hand [data-card-id="{scoop["id"]}"]').click()
        page.locator('#hand-actions button[data-action-type="play_item"]:enabled').click()
        page.wait_for_function("""fixture => {
            const discard = PokecaMobile.port.getSnapshot().players[0].discard.map(card=>card.id);
            return discard.includes(fixture.id) && fixture.ids.every(id=>discard.includes(id));
        }""",arg=scoop)
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
        Path('test-results').mkdir(exist_ok=True)
        page.screenshot(path='test-results/deck-work-002-home.png',full_page=True)
        report={'result':'PASS','viewport':{'width':320,'height':700},'classified':len(classification['records']),
                'classificationBlocked':len(classification['blocked']),'browserErrors':errors,'images':image_checks,
                'officialCode':'kbvV5V-TEZjLI-dVfVVk','officialCodeMethod':'actual official HTML import','mulliganChoicesResolved':mulligan_choices,
                'checks':['H/I/J x six categories','official image loaded','long press and backdrop close','ordinary tap',
                          'same-name four','ACE SPEC one','60-card maximum','save/reload/duplicate','official HTML code import and unknown ID blocked',
                          'I/J 60-card saved deck starts battle','official I print discards top two through battle UI','battle save/resume','narrow viewport']}
        Path('test-results/deck-work-002-browser.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
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
