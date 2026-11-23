"""Test the two Issue #164 printings in the published saved-deck flow."""
import asyncio
import json
import os
from pathlib import Path

from playwright.async_api import async_playwright

from browser_opening import finish_opening
from test_control_013_browser import select_effect_targets
from test_fixed_deck_browser_images import session_ca_args

DECK = {
    "id": "issue-164-regression",
    "name": "Issue 164 Chromium fixture",
    "cards": {
        "47847": 4, "49262": 4, "49263": 4, "49264": 3, "49573": 4, "47288": 3,
        "45786": 1, "48711": 2, "45783": 1, "42945": 18, "49460": 16,
    },
    "blocked": [],
}
ROOT = Path(__file__).resolve().parents[1]

async def main():
    assert sum(DECK["cards"].values()) == 60
    errors = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=session_ca_args())
        device = dict(pw.devices["Pixel 5"])
        device.pop("default_browser_type")
        context = await browser.new_context(**device)
        await context.add_init_script(
            "localStorage.setItem('pokeca.deck-builder.v1', "
            + json.dumps(json.dumps({"decks": [DECK]}, ensure_ascii=False)) + ")"
        )
        page = await context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        await page.goto(os.environ["POKECA_TEST_URL"], wait_until="domcontentloaded")
        await page.wait_for_function(
            """navigator.serviceWorker.controller && window.PokecaMobile
            && window.PokecaImageRegistryStatus?.state === 'ready'
            && document.getElementById('save-status').textContent === '自動保存済'""",
            timeout=60000,
        )
        seed = await page.evaluate("""async deck => {
            const {cards, plans} = await PokecaSavedDecks.loadCatalog();
            const fixed = await fetch('./data/fixed-test-decks.json').then(r=>r.json());
            const manifest={decks:[{id:deck.id,name:deck.name,
              cards:PokecaSavedDecks.matchEntries(deck,cards,plans)},fixed.decks[1]]};
            for(let index=1;index<=500;index++){
              const seed=Math.imul(index,2654435761)>>>0;
              let state=seed;
              const match=Pokeca.createReferenceValidationMatch(manifest,{
                firstDeck:0,startingBench:{you:[]},rng:()=>{
                  state=(Math.imul(state,1664525)+1013904223)>>>0;
                  return state/4294967296;
                }
              });
              if(!match.ok||match.game.pendingReferenceChoice) continue;
              const own=match.game.players[0];
              const hand=[own.active,...own.hand].map(c=>c.validationReference.officialCardId);
              if(['45783','42945'].every(id=>hand.includes(id)))return seed;
            }
            throw Error('No deterministic opening for both exact printings');
        }""", DECK)
        await page.evaluate("seed=>{ Math.random=()=>seed/4294967296; }", seed)
        await page.get_by_role("button", name="対戦する", exact=True).tap()
        await page.get_by_role("button", name="対戦準備へ", exact=True).tap()
        await page.locator("#opening-start").wait_for()
        assert await page.locator("#opening-choices [data-opening-card]").count() == 7
        await finish_opening(page)
        await page.wait_for_function("PokecaMobile.port.getSnapshot().referenceEffectValidation")
        before = await page.evaluate("PokecaMobile.port.getSnapshot()")
        assert before["turnPlayer"] == "you" and before["turnNumber"] == 1
        assert before["players"][0]["active"]["basic"]
        hand = {card["validationReference"]["officialCardId"]: card["id"] for card in before["players"][0]["hand"]}
        fire, box = hand["42945"], hand["45783"]
        await page.locator(f'#self-hand [data-card-id="{fire}"]').tap()
        await page.locator("#self-active [data-card-id]").tap()
        await page.wait_for_function(
            "id=>PokecaMobile.port.getSnapshot().players[0].active.energyCards.some(c=>c.id===id)", arg=fire
        )
        legal = await page.evaluate(
            """id=>PokecaMobile.port.getHandOptions('you',id)
                 .find(option=>option.ok&&option.action.type==='play_item')""",
            box,
        )
        assert legal and len(legal["action"]["selections"]["discard"]) == 3
        await page.locator(f'#self-hand [data-card-id="{box}"]').tap()
        await page.locator('#hand-actions [data-action-type="play_item"]').tap()
        await select_effect_targets(page, legal)
        await page.wait_for_function(
            "id=>PokecaMobile.port.getSnapshot().players[0].discard.some(c=>c.id===id)", arg=box
        )
        await page.wait_for_function("document.getElementById('save-status').textContent==='自動保存済'")
        saved = await page.evaluate("PokecaMobile.port.getSnapshot()")
        own = saved["players"][0]
        assert {box, *legal["action"]["selections"]["discard"]} <= {card["id"] for card in own["discard"]}
        assert set(legal["action"]["selections"]["cards"]) <= {card["id"] for card in own["hand"]}
        for offline in (True, False):
            await context.set_offline(offline)
            await page.reload(wait_until="domcontentloaded")
            await page.wait_for_function(
                """window.PokecaMobile && PokecaMobile.port.getSnapshot().referenceEffectValidation
                && document.getElementById('save-status').textContent === '自動保存済'""",
                timeout=60000,
            )
            assert await page.evaluate("PokecaMobile.port.getSnapshot()") == saved
        assert not errors, errors
        result = {"exactPrintIds": [45783, 42945], "openingSize": 7,
                  "playedViaSavedDeckUI": True, "attachedExactEnergy": True,
                  "resolvedBoxThroughDOM": True, "onlineAndOfflineRestoreExact": True,
                  "physicalAndroidVerified": False}
        (ROOT / "artifacts").mkdir(exist_ok=True)
        (ROOT / "artifacts" / "issue-164-public.json").write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps(result))
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
