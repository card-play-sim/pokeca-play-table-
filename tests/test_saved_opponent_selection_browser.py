"""Android-sized DOM regression: explicit opponent selection, no silent fixed AI deck."""
import asyncio, json, os
from pathlib import Path
from collections import Counter
from playwright.async_api import async_playwright
from browser_opening import finish_opening
from test_fixed_deck_browser_images import session_ca_args

ROOT=Path(__file__).resolve().parents[1]

SETUP=r"""async()=>{
  const {cards,plans}=await PokecaSavedDecks.loadCatalog();
  const picks=[],names=new Set();
  for(const r of plans.values()){
    if(r.category!=='pokemon'||r.facts?.basic!==true||names.has(r.name))continue;
    const card=cards.get(String(r.officialCardId));
    if(!card||PokecaSavedDecks.connectionError(String(r.officialCardId),card,r))continue;
    picks.push({id:String(r.officialCardId),name:r.name});names.add(r.name);
    if(picks.length===30)break;
  }
  if(picks.length!==30)throw Error('INSUFFICIENT_REAL_VERIFIED_BASIC_PRINTS:'+picks.length);
  const make=(id,name,parts)=>({
    id,name,cards:Object.fromEntries(parts.map(x=>[x.id,4])),blocked:[]
  });
  const you=make('opponent-selection-A','自分の60枚デッキ',picks.slice(0,15));
  const ai=make('opponent-selection-B','相手の60枚デッキ',picks.slice(15));
  const bad={id:'opponent-selection-invalid',name:'たねポケモンなし',cards:{'42945':60},blocked:[]};
  localStorage.setItem(PokecaSavedDecks.key,JSON.stringify({decks:[you,ai,bad]}));
  return {you:{id:you.id,counts:you.cards},ai:{id:ai.id,counts:ai.cards},badId:bad.id};
}"""

async def main():
 async with async_playwright() as playwright:
  browser=await playwright.chromium.launch(
   executable_path=os.environ.get('CHROMIUM_EXECUTABLE'),args=session_ca_args())
  device=dict(playwright.devices['Pixel 5'])
  device.pop('default_browser_type',None)
  context=await browser.new_context(**device,service_workers='allow')
  page=await context.new_page()
  errors=[]
  page.on('pageerror',lambda err:errors.append(str(err)))
  await page.goto(os.environ.get('POKECA_TEST_URL','http://127.0.0.1:8765/'),
                  wait_until='domcontentloaded')
  await page.wait_for_function('window.PokecaSavedDecks&&window.PokecaMobile&&window.PokecaImageRegistryStatus?.state==="ready"',timeout=90000)
  fixture=await page.evaluate(SETUP)
  await page.reload(wait_until='domcontentloaded')
  await page.wait_for_function('window.PokecaSavedDecks&&document.querySelectorAll("#deck-home-grid .deck-home-card").length===3',timeout=90000)
  await page.get_by_role('button',name='対戦する',exact=True).first.tap()
  modal=page.locator('#deck-home-confirm')
  await modal.wait_for(state='visible')
  picker=page.locator('#deck-home-opponent')
  start=page.locator('#deck-home-start')
  assert await picker.input_value()==''
  assert await start.is_disabled(), 'Must not silently default to fixed deck'
  names=await picker.locator('option').all_text_contents()
  assert '相手の60枚デッキ（60/60枚）' in names,names
  assert '自分の60枚デッキ（60/60枚）' in names,names
  await picker.select_option('saved:'+fixture['badId'])
  assert await start.is_disabled(),'Unplayable opposing saved deck must block match'
  assert 'たねポケモン' in await page.locator('#deck-home-match-status').inner_text()
  await picker.select_option('saved:'+fixture['you']['id'])
  assert await start.is_enabled(),'Mirror match must be allowed'
  await picker.select_option('saved:'+fixture['ai']['id'])
  assert await start.is_enabled()
  assert '相手の60枚デッキ' in await page.locator('#deck-home-match-status').inner_text()
  await start.tap()
  await page.locator('#opening-choices').wait_for(timeout=30000)
  await finish_opening(page,bench=False)
  await page.wait_for_function('PokecaMobile.port.getSnapshot().referenceEffectValidation&&document.getElementById("save-status").textContent==="自動保存済"',timeout=90000)
  game=await page.evaluate('PokecaMobile.port.getSnapshot()')
  assert game['referenceEffectValidation']['sourceDeckIds']==[fixture['you']['id'],fixture['ai']['id']]
  for player,deck in zip(game['players'],(fixture['you'],fixture['ai'])):
   actual=[c for c in [player['active'],*player['bench'],*player['hand'],*player['deck'],*player['prizeCards'],*player['discard']] if c]
   assert len(actual)==60,len(actual)
   ids=Counter(str(c['validationReference']['officialCardId']) for c in actual)
   assert dict(ids)==deck['counts'],(ids,deck)
  original=await page.evaluate("localStorage.getItem(PokecaSavedDecks.key)")
  await page.reload(wait_until='domcontentloaded')
  await page.wait_for_function('window.PokecaMobile&&document.getElementById("save-status").textContent==="自動保存済"',timeout=90000)
  restored=await page.evaluate('PokecaMobile.port.getSnapshot()')
  assert restored==game,'Opponent decks or the game state changed across reload'
  assert await page.evaluate('localStorage.getItem(PokecaSavedDecks.key)')==original
  assert not errors,errors
  report={'savedDeckOptions':3,'explicitChoiceRequired':True,
          'unplayableOpponentRejected':True,'mirrorMatchSelectable':True,
          'humanDeck':fixture['you']['id'],'opponentDeck':fixture['ai']['id'],
          'bothDecks60VerifiedOfficialPrints':True,'opponentNotFixedDeck':True,
          'openedRealMatch':True,'savedSessionExactAfterReload':True,
          'savedDecksUnchanged':True,'javascriptErrors':errors,
          'physicalAndroidVerified':False}
  (ROOT/'artifacts').mkdir(exist_ok=True)
  (ROOT/'artifacts/saved-opponent-selection-browser.json').write_text(
   json.dumps(report,ensure_ascii=False,indent=2)+'\n')
  print(json.dumps(report,ensure_ascii=False),flush=True)
  await context.close()
  await browser.close()

if __name__=='__main__':asyncio.run(main())
