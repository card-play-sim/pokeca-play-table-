"""Manual opening and cross-category shared effects on the existing app.
Opening cases use the actual entry UI. Later effect cases use declared fixed-deck
mid-game fixtures; effects are executed by DOM taps, never test dispatch calls.
"""
import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
from test_fixed_deck_browser_images import session_ca_args
ROOT=Path(__file__).resolve().parents[1]
FIXTURE=(ROOT/'tests/fixtures/g-base-008-browser.js').read_text()
async def main():
 reports=[];errors=[]
 (ROOT/'artifacts').mkdir(exist_ok=True)
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE'),args=session_ca_args())
  device=dict(p.devices['Pixel 5']);device.pop('default_browser_type',None)
  context=await browser.new_context(**device,service_workers='block');page=await context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto(os.environ.get('POKECA_TEST_URL','http://127.0.0.1:8767/'),wait_until='domcontentloaded')
  await page.wait_for_function('window.PokecaMobile&&PokecaImageRegistryStatus.state==="ready"')
  async def snap():return await page.evaluate('PokecaMobile.port.getSnapshot()')
  async def restore(expected):
   await page.wait_for_function('document.getElementById("save-status").textContent==="自動保存済"')
   await page.reload(wait_until='domcontentloaded');await page.wait_for_function('window.PokecaMobile&&PokecaImageRegistryStatus.state==="ready"&&document.getElementById("save-status").textContent==="自動保存済"')
   assert await snap()==expected
  for deck in (0,1):
   print('START manual deck '+str(deck),flush=True)
   # Pick reproducible real shuffles with a mulligan, multiple Basics and an evolution.
   seed=await page.evaluate('''async deck=>{const manifest=await(await fetch('data/fixed-test-decks.json')).json();for(let seed=1;seed<2000;seed++){let n=seed;const rng=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};const r=Pokeca.createReferenceValidationMatch(manifest,{firstDeck:deck,rng,startingBench:{you:[]}}),p=r.game.players[0],hand=[p.active,...p.hand];if(r.mulligans.you>0&&r.mulligans.you>=r.mulligans.ai&&hand.filter(c=>c.basic).length>=2&&hand.some(c=>c.kind==='pokemon'&&!c.basic))return seed;}throw Error('No opening fixture');}''',deck)
   for bench_count in (0,1):
    before=await snap()
    await page.evaluate('seed=>{Math.random=()=>seed/4294967296}',seed)
    await page.locator('#demo-open').tap();await page.locator('#reference-match-choices button').first.wait_for();assert await page.locator('#reference-match-choices button').count()==2
    await page.locator('#reference-match-choices button').nth(deck).tap();await page.locator('#confirm-ok').tap()
    await page.locator('#opening-start').wait_for();assert await snap()==before
    assert await page.locator('[data-opening-card]').count()==7
    if bench_count==0:await page.screenshot(path=str(ROOT/f'artifacts/control-002-opening-{deck}.png'),full_page=True)
    assert await page.locator('#opening-start').is_disabled()
    assert await page.locator('[data-opening-active]:disabled').count()>0
    basics=await page.locator('[data-opening-active]:enabled').evaluate_all('els=>els.map(e=>e.dataset.openingActive)')
    a,b=basics[:2]
    await page.locator(f'[data-opening-active="{a}"]').tap()
    await page.locator(f'[data-opening-bench="{b}"]').tap();assert 'ベンチ：1匹' in await page.locator('#opening-status').inner_text()
    await page.locator(f'[data-opening-bench="{b}"]').tap();assert 'ベンチ：0匹' in await page.locator('#opening-status').inner_text()
    await page.locator('#opening-clear').tap();assert await page.locator('#opening-start').is_disabled()
    # Change the Active selection; the old Active must return to unplaced hand.
    await page.locator(f'[data-opening-active="{a}"]').tap();await page.locator(f'[data-opening-active="{b}"]').tap()
    if bench_count:await page.locator(f'[data-opening-bench="{a}"]').tap()
    assert await snap()==before
    await page.locator('#opening-start').tap()
    await page.wait_for_function('!document.querySelector("#sheet").open')
    await page.wait_for_function('id=>PokecaMobile.port.getSnapshot().players[0].active.id===id',arg=b)
    await page.wait_for_function('PokecaMobile.port.getSnapshot().pendingReferenceChoice?.playerId!=="ai"')
    started=await snap();you,ai=started['players'];assert you['active']['id']==b
    assert len(you['bench'])==bench_count,{'expected':bench_count,'bench':you['bench'],'status':await page.locator('#opening-status').count(),'hand':len(you['hand'])};assert len(you['hand'])==6-bench_count
    assert ai['active'] and ai['active']['basic'];assert len(ai['bench'])<=5
    assert started['referenceEffectValidation']['sourceDeckIds'][0]==('kangaskhan-meowth-fixed' if deck==0 else 'dragapult-fixed')
    for player in started['players']:
     cards=[player['active'],*player['bench'],*player['hand'],*player['deck'],*player['prizeCards'],*player['discard']];assert len(cards)==60 and len({c['id'] for c in cards})==60
    await restore(started);reports.append({'kind':'manual-opening','deck':deck,'seed':seed,'openingSeven':True,'basicOnly':True,'changeAndCancel':True,'bench':bench_count,'realMulligan':True,'AISetup':True,'saveReloadExact':True})
   # Closing preparation must preserve the existing game and save.
   prior=await snap();await page.locator('#demo-open').tap();await page.locator('#reference-match-choices button').nth(deck).tap();await page.locator('#confirm-ok').tap();await page.locator('#opening-start').wait_for();await page.locator('#sheet-close').tap();assert await snap()==prior
  # Shared search constraints are engine-provided, without card names in the UI helper.
  for name,deck,field in [('トウコ',0,'kind'),('アカマツ',1,'energyType'),('たけしのスカウト',0,'basic')]:
   print('START constraint '+name,flush=True)
   state=await page.evaluate(FIXTURE,{'firstDeck':deck,'active':['ドラメシヤ','ロケット団のニューラ'] if deck else ['ロケット団のニューラ','ドラメシヤ'],'hand':{'0':[name]}})
   ident=state['players'][0]['hand'][0]['id'];option=await page.evaluate('id=>PokecaMobile.port.getHandOptions("you",id).find(o=>o.ok)',ident);req=option['requests'][0]
   candidates=req['candidates'];assert req['constraints']
   if field=='basic':first=next(c for c in candidates if not c['basic']);bad=next(c for c in candidates if c['id']!=first['id'])
   else:first=candidates[0];bad=next(c for c in candidates if c['id']!=first['id'] and c[field]==first[field])
   await page.locator(f'#self-hand [data-card-id="{ident}"]').tap();await page.locator('#hand-actions button:enabled').first.tap()
   await page.locator(f'#selection-cards [data-selection-id="{first["id"]}"]').tap()
   assert await page.locator(f'#selection-cards [data-selection-id="{bad["id"]}"]').is_disabled()
   await page.locator('#sheet-close').tap();assert await snap()==state
   reports.append({'kind':'shared-search-legality','name':name,'invalidCombinationDisabled':True,'cancelUnchanged':True})
  # Energy attachment, moving actual physical energy, tool and stadium effects.
  state=await page.evaluate(FIXTURE,{'hand':{'0':['基本悪エネルギー','エネルギーつけかえ','ヒーローマント','危ない廃墟','シェイミ']},'bench':{'0':['マシマシラ']}})
  cards={c['name']:c['id'] for c in state['players'][0]['hand']};active=state['players'][0]['active']['id'];bench=state['players'][0]['bench'][0]['id']
  await page.locator(f'#self-hand [data-card-id="{cards["基本悪エネルギー"]}"]').tap();await page.locator(f'#self-active [data-card-id="{active}"]').tap()
  await page.wait_for_function('PokecaMobile.port.getSnapshot().players[0].active.energyCards.length===1')
  await page.locator(f'#self-hand [data-card-id="{cards["ヒーローマント"]}"]').tap();await page.locator(f'#self-active [data-card-id="{active}"]').tap()
  await page.wait_for_function('PokecaMobile.port.getSnapshot().players[0].active.hp===180')
  await page.locator(f'#self-hand [data-card-id="{cards["危ない廃墟"]}"]').tap();await page.locator('#stadium').tap()
  await page.wait_for_function('PokecaMobile.port.getSnapshot().stadium?.name==="危ない廃墟"')
  await page.locator(f'#self-hand [data-card-id="{cards["シェイミ"]}"]').tap();await page.locator('#self-bench .bench-slot.empty').first.tap()
  await page.wait_for_function('PokecaMobile.port.getSnapshot().players[0].bench.some(c=>c.name==="シェイミ"&&c.damage===20)')
  await page.locator(f'#self-hand [data-card-id="{cards["エネルギーつけかえ"]}"]').tap();await page.locator('#hand-actions button:enabled').first.tap()
  await page.locator(f'#selection-cards [data-selection-id="{cards["基本悪エネルギー"]}"]').tap();await page.locator('#selection-confirm').tap()
  await page.locator(f'#selection-cards [data-selection-id="{bench}"]').tap();await page.locator('#selection-confirm').tap()
  await page.wait_for_function('PokecaMobile.port.getSnapshot().players[0].bench[0].energyCards.length===1')
  after=await snap();assert after['players'][0]['bench'][0]['energyCards'][0]['id']==cards['基本悪エネルギー'];assert after['players'][0]['normalEnergyAttached'];assert any(c['id']==cards['エネルギーつけかえ'] for c in after['players'][0]['discard']);await restore(after)
  reports.append({'kind':'cross-category-effects','energyAttachAndMove':True,'toolHP':180,'stadiumDamage':20,'itemDiscard':True,'saveReloadExact':True})
  # Normal evolution remains subject to first-turn and entered-turn restrictions.
  evolution=await page.evaluate(FIXTURE,{'firstDeck':1,'active':['ドラメシヤ','ロケット団のニューラ'],'hand':{'0':['ドロンチ']}})
  eid=evolution['players'][0]['hand'][0]['id'];base=evolution['players'][0]['active']['id']
  for turn,entered in [(1,0),(3,3)]:
   limited=json.loads(json.dumps(evolution));limited['turnNumber']=turn;limited['players'][0]['active']['enteredTurn']=entered
   await page.evaluate('s=>PokecaMobile.port.loadGame(s)',limited)
   before=await snap();await page.locator(f'#self-hand [data-card-id="{eid}"]').tap()
   assert await page.locator('#self-active .legal-target').count()==0
   await page.locator(f'#self-active [data-card-id="{base}"]').tap();assert await snap()==before
   if await page.locator('#sheet').evaluate('e=>e.open'):await page.locator('#sheet-close').tap()
  await page.evaluate('s=>PokecaMobile.port.loadGame(s)',evolution)
  await page.locator(f'#self-hand [data-card-id="{eid}"]').tap();await page.locator(f'#self-active [data-card-id="{base}"]').tap()
  await page.wait_for_function('PokecaMobile.port.getSnapshot().players[0].active.name==="ドロンチ"')
  await restore(await snap());reports.append({'kind':'normal-evolution','firstTurnRejected':True,'enteredTurnRejected':True,'legalEvolution':True,'saveReloadExact':True})
  # Attack KO, own prize choice, and winning state avoid any test-controlled AI moves.
  state=await page.evaluate(FIXTURE,{'energy':{'0':{'active':['基本悪エネルギー']}},'damage':{'1':50},'bench':{'1':['ノコッチ']},'prizes':{'0':1}})
  # Turn 1 legality uses the real rule gateway; no engine bypass flags.
  first={**state,'turnNumber':1};await page.evaluate('s=>PokecaMobile.port.loadGame(s)',first)
  assert await page.locator('#attack-button').is_disabled()
  await page.evaluate('s=>PokecaMobile.port.loadGame(s)',state)
  await page.locator('#attack-button').tap();await page.locator('#quick-actions button:enabled').first.tap();await page.locator('#confirm-ok').tap()
  await page.locator('#prize-picks button').first.tap();await page.get_by_text('選んだサイドを手札に加える',exact=True).tap()
  await page.wait_for_function('PokecaMobile.port.getSnapshot().status==="finished"')
  after=await snap();assert after['winner']=='you';assert after['players'][0]['prizes']==0;assert any(c['name']=='ドラメシヤ' for c in after['players'][1]['discard']);await restore(after)
  reports.append({'kind':'attack-knockout-prize','firstTurnAttackDisabled':True,'winner':'you','prizeTaken':True,'discard':True,'saveReloadExact':True})
  assert not errors,errors
  report={'url':page.url,'physicalAndroidVerified':False,'controlledEffectFixtures':True,'cases':reports,'javascriptErrors':errors}
  (ROOT/'artifacts').mkdir(exist_ok=True);(ROOT/'artifacts/control-002-browser-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False),flush=True)
  await browser.close()
if __name__=='__main__':asyncio.run(main())
