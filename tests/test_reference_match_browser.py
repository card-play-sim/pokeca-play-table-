"""Real fixed120 reference mode in Android Chrome emulation, not adopted editions."""
import asyncio,json,os
from pathlib import Path
from collections import Counter
from playwright.async_api import async_playwright
from test_fixed_deck_browser_images import session_ca_args
from browser_opening import finish_opening
ROOT=Path(__file__).resolve().parents[1]
async def main():
 reports=[]
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE'),args=session_ca_args())
  for seed,first_deck in ((2,0),(7,1)):
   device=dict(p.devices['Pixel 5']);device.pop('default_browser_type',None)
   context=await browser.new_context(**device,service_workers='block');page=await context.new_page();errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   await page.goto(os.environ.get('POKECA_TEST_URL','http://127.0.0.1:8765/'),wait_until='domcontentloaded')
   await page.wait_for_function('window.PokecaMobile&&PokecaImageRegistryStatus.state==="ready"')
   await page.evaluate('seed=>{let n=seed;Math.random=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}',seed)
   await page.get_by_role('button',name='固定デッキで検証用AI対戦を開始',exact=True).tap()
   await page.locator('#reference-match-choices button').first.wait_for()
   assert await page.locator('#reference-match-choices button').count()==2
   await page.locator('#reference-match-choices button').nth(first_deck).tap();await page.locator('#confirm-ok').tap();await finish_opening(page)
   await page.wait_for_function('PokecaMobile.port.getSnapshot().referenceEffectValidation')
   initial=await page.evaluate('PokecaMobile.port.getSnapshot()')
   manifest=json.loads((ROOT/'data/fixed-test-decks.json').read_text())
   for i,player in enumerate(initial['players']):
    cards=[c for c in [player['active'],*player['bench'],*player['hand'],*player['deck'],*player['prizeCards'],*player['discard']] if c]
    assert len(cards)==60
    assert Counter(c['name'] for c in cards)==Counter({c['name']:c['count'] for c in manifest['decks'][i if first_deck==0 else 1-i]['cards']})
    assert all(c.get('validationReference') and not c.get('officialCardId') for c in cards)
   assert not initial.get('demo')
   assert '採用未確定' in await page.locator('#game-note').inner_text()
   async def decode_images(locator):
    result=await locator.evaluate_all("""async els=>{const out=[];for(const e of els){try{await e.decode();}catch{}out.push({ok:e.naturalWidth>0&&e.naturalHeight>0,url:e.currentSrc,mode:e.dataset.imageMode});}return out;}""")
    assert result and all(r['ok'] and r['url'].startswith('https://www.pokemon-card.com/') for r in result),result
    return len(result)
   opening_images=await decode_images(page.locator('#self-hand img:not([hidden]),#self-active img:not([hidden]),#self-bench img:not([hidden])'))
   await page.locator('#menu-open').tap();await page.get_by_text('固定2デッキ（各60枚）を確認',exact=True).tap()
   rows=page.locator('.deck-manifest-list > div');await rows.last.wait_for()
   entries=[c for d in manifest['decks'] for c in d['cards']];assert await rows.count()==len(entries)
   for i in range(len(entries)):
    await rows.nth(i).scroll_into_view_if_needed();await decode_images(rows.nth(i).locator('img:not([hidden])'))
   assert sum(c['count'] for c in entries)==120
   await page.locator('#sheet-close').tap()
   assert await page.evaluate('PokecaMobile.port.getSnapshot()')==initial
   # Opponent uses normal automatic UI scheduling; only the human seat is automated here.
   choices=0;human_turns=0;touch_bench=0
   for step in range(160):
    await page.wait_for_timeout(100)
    s=await page.evaluate('PokecaMobile.port.getSnapshot()')
    assert not await page.evaluate('!!window.PokecaReferenceValidationStop')
    if s['status']=='finished':break
    pending=s.get('pendingPrizeSelection');choice=s.get('pendingReferenceChoice')
    actor=(pending or choice or {}).get('playerId',s['turnPlayer'])
    if actor=='ai':
     await page.wait_for_function('(()=>{const s=PokecaMobile.port.getSnapshot();return s.status==="finished"||(s.pendingPrizeSelection?.playerId||s.pendingReferenceChoice?.playerId||s.turnPlayer)==="you"})()',timeout=120000)
     continue
    if pending:
     await page.locator('#prize-picks').wait_for()
     for i in range(pending['count']):await page.locator('#prize-picks button:enabled').nth(i).tap()
     await page.get_by_text('選んだサイドを手札に加える',exact=True).tap();choices+=1;continue
    if choice:
     await page.locator('#reference-choice button').first.tap();choices+=1;continue
    # Same real port/actions as the human UI, no state injection or synthetic effects.
    result=await page.evaluate('''async()=>{const port=PokecaMobile.port;let count=0;for(;count<80;count++){const s=port.getSnapshot();if(s.status!=='active'||(s.pendingPrizeSelection?.playerId||s.pendingReferenceChoice?.playerId||s.turnPlayer)!=='you'||s.pendingPrizeSelection||s.pendingReferenceChoice)break;const legal=Pokeca.getLegalActions(s,'you').actions;const a=Pokeca.chooseBaseline({legalActions:legal,observation:s});if(!a)return {ok:false,reason:'no legal human action'};if(a.type==='bench_basic')return {ok:true,benchCardId:a.cardId};const r=PokecaMobile.dispatch('you',a);if(!r.ok)return r;}return {ok:true,actions:count};}''')
    assert result['ok'],result
    if result.get('benchCardId'):
     ident=result['benchCardId'];card=page.locator(f'#self-hand [data-card-id="{ident}"]');await card.scroll_into_view_if_needed();await card.tap();await page.locator('#self-bench .bench-slot.empty').first.tap()
     await page.wait_for_function('id=>PokecaMobile.port.getSnapshot().players[0].bench.some(c=>c.id===id)',arg=ident);touch_bench+=1
    human_turns+=1
   final=await page.evaluate('PokecaMobile.port.getSnapshot()');assert final['status']=='finished',final['turnNumber']
   images=await page.locator('#app img:not([hidden])').evaluate_all('''async els=>{const out=[];for(const el of els){try{await el.decode();}catch{}out.push({ok:el.naturalWidth>0,url:el.currentSrc});}return out;}''')
   assert images and all(i['ok'] for i in images),images
   trash_images=0
   if final['players'][0]['discard']:
    await page.locator('[data-zone-owner="you"][data-zone="discard"]').tap()
    trash_images=await decode_images(page.locator('#sheet-content [data-gallery-card-id] img:not([hidden])'))
    await page.locator('#sheet-close').tap()
   await page.wait_for_function('document.getElementById("save-status").textContent==="自動保存済"')
   await page.reload(wait_until='domcontentloaded');await page.wait_for_function('window.PokecaMobile&&PokecaImageRegistryStatus.state==="ready"&&document.getElementById("save-status").textContent==="自動保存済"')
   restored=await page.evaluate('PokecaMobile.port.getSnapshot()')
   assert restored==final,{'changedKeys':[k for k in set(final)|set(restored) if final.get(k)!=restored.get(k)]}
   assert not errors,errors
   report={'seed':seed,'primaryFixedDeckEntry':True,'youDeck':initial['referenceEffectValidation']['sourceDeckIds'][0],'aiDeck':initial['referenceEffectValidation']['sourceDeckIds'][1],'finished':True,'winner':final['winner'],'turn':final['turnNumber'],'humanTurns':human_turns,'touchBenchPlacements':touch_bench,'choiceDialogs':choices,'visibleImagesDecoded':len(images),'openingImagesDecoded':opening_images,'compositionPreviewCopies':120,'trashImagesDecoded':trash_images,'saveReloadExact':True,'adoptedPrints':0,'physicalAndroidVerified':False,'errors':errors}
   reports.append(report);print(json.dumps(report),flush=True);await context.close()
  await browser.close()
 (ROOT/'artifacts/reference-browser-results.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2)+'\n')
if __name__=='__main__':asyncio.run(main())
