"""Actual mobile app/engine UI integration. No preview board, state injection or image mocks.
Official effects remain unimplemented; this exercises the app's manual-practice path.
"""
import asyncio,json,os
from collections import Counter
from pathlib import Path
from playwright.async_api import async_playwright
from test_fixed_deck_browser_images import session_ca_args
ROOT=Path(__file__).resolve().parents[1]
async def main():
 responses={};errors=[];observations=[];operations=[]
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE'),args=session_ca_args())
  device=dict(p.devices['Pixel 5']);device.pop('default_browser_type',None)
  context=await browser.new_context(**device,service_workers='block');page=await context.new_page()
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('response',lambda r:responses.update({r.url:{'status':r.status,'type':r.headers.get('content-type','')}}))
  async def snapshot():return await page.evaluate('PokecaMobile.port.getSnapshot()')
  async def inspect(locator,zone):
   await locator.scroll_into_view_if_needed()
   obs=await locator.evaluate('''async el=>{
    const img=el.querySelector('img:not([hidden])');let decoded=false;try{await img.decode();decoded=img.naturalWidth>0&&img.naturalHeight>0;}catch{}
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const box=img.getBoundingClientRect(),s=getComputedStyle(img),hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);
    return {id:el.dataset.cardId||el.dataset.galleryCardId||null,name:el.dataset.cardName||el.getAttribute('aria-label'),mode:img.dataset.imageMode||el.dataset.imageKind,
     referenceId:img.dataset.previewReferenceId,sourceUrl:img.currentSrc||img.src,decoded,width:img.naturalWidth,height:img.naturalHeight,
     painted:(hit===img||hit===img.parentElement)&&s.visibility==='visible'&&s.display!=='none'&&Number(s.opacity)>0};}''')
   http=responses.get(obs['sourceUrl']);passed=bool(obs['decoded'] and obs['painted'] and http and http['status']==200 and http['type'].startswith('image/'))
   observations.append({'zone':zone,'passed':passed,'observation':obs,'http':http})
   assert passed,observations[-1]
  async def saved():await page.wait_for_function('document.getElementById("save-status").textContent==="自動保存済"')
  async def card_tap(ident):
   loc=page.locator(f'#self-hand [data-card-id="{ident}"]');await loc.scroll_into_view_if_needed();await loc.tap()
  async def end_turn():
   old=(await snapshot())['turnPlayer'];await page.locator('#end-turn').tap();await page.locator('#confirm-ok').tap()
   await page.wait_for_function('old=>PokecaMobile.port.getSnapshot().turnPlayer!==old',arg=old);await page.wait_for_timeout(750)
  await page.goto(os.environ.get('POKECA_TEST_URL','http://127.0.0.1:8765/'),wait_until='domcontentloaded')
  await page.wait_for_function('window.PokecaMobile&&PokecaImageRegistryStatus.state==="ready"');await saved()
  await page.evaluate('''()=>{let seed=6;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}''')
  await page.locator('#menu-open').tap();await page.get_by_text('固定2デッキで操作練習（公式効果未接続）',exact=True).tap()
  await page.locator('#fixed-practice-choices button').nth(1).tap();await page.locator('#confirm-ok').tap()
  await page.wait_for_function('PokecaMobile.port.getSnapshot().fixedDeckPractice');await saved();await page.wait_for_timeout(750)
  assert await page.locator('#fixed-image-controls').count()==0,'must use actual app, not preview board'
  assert not await page.locator('#app').evaluate('e=>e.classList.contains("fixed-image-board")')
  initial=await snapshot();assert initial['mode']=='practice'
  def physical(state):
   result=[]
   for player in state['players']:
    for c in [player['active'],*player['bench'],*player['hand'],*player['deck'],*player['prizeCards'],*player['discard']]:
     if c:result.extend([c,*c.get('evolutionCards',[]),*c.get('energyCards',[]),*c.get('tools',[])])
   return result
  initial_ids=sorted(c['id'] for c in physical(initial));assert len(initial_ids)==len(set(initial_ids))==120
  assert all(not c.get('officialCardId') and not c.get('catalogCardId') for c in physical(initial))
  # Measure all120 anew within the app while the fixed practice session is authoritative.
  await page.locator('#menu-open').tap();await page.get_by_text('固定2デッキ（各60枚）を確認',exact=True).tap()
  rows=page.locator('.deck-manifest-list > div');await rows.last.wait_for()
  manifest=json.loads((ROOT/'data/fixed-test-decks.json').read_text());entries=[c for d in manifest['decks'] for c in d['cards']]
  assert Counter(c['name'] for c in physical(initial))==Counter({n:sum(c['count'] for c in entries if c['name']==n) for n in {c['name'] for c in entries}})
  displayed=0
  for i,c in enumerate(entries):await inspect(rows.nth(i),'deck-composition');displayed+=c['count']
  assert displayed==120;assert await snapshot()==initial
  await page.locator('#sheet-close').tap()
  for prefix in ('self','opponent'):await inspect(page.locator('#'+prefix+'-active [data-card-id]'),'active-opening')
  for index in range(await page.locator('#self-hand [data-card-id]').count()):await inspect(page.locator('#self-hand [data-card-id]').nth(index),'hand-opening')
  await page.locator('[data-zone-owner="you"][data-zone="deck"]').tap();await page.get_by_text('練習操作：山札一覧（公開）',exact=True).tap()
  cards=page.locator('#sheet-content [data-gallery-card-id]')
  for i in range(await cards.count()):await inspect(cards.nth(i),'live-draw-pile')
  await page.locator('#sheet-close').tap()
  print('PASS live app: authoritative120 identities and fresh120-image composition; inspecting real operations',flush=True)
  # Draw via actual touch controls, leaving cards for the next turn.
  def ready_hand(player):
   return {'ドラメシヤ','ドロンチ'}.issubset({c['name'] for c in player['hand']}) and any(c['kind']=='energy' and not c.get('isSpecial') for c in player['hand']) and sum(c['kind']=='trainer' for c in player['hand'])>=2
  while not ready_hand((await snapshot())['players'][0]):
   assert len((await snapshot())['players'][0]['deck'])>5
   await page.locator('#draw-button').tap()
  state=await snapshot();you=state['players'][0]
  base=next(c for c in you['hand'] if c['name']=='ドラメシヤ')
  await card_tap(base['id']);await page.locator('#self-bench .bench-slot.empty').first.tap()
  await page.wait_for_function('id=>PokecaMobile.port.getSnapshot().players[0].bench.some(c=>c.id===id)',arg=base['id']);operations.append('touch bench placement');print('PASS touch bench placement',flush=True)
  await inspect(page.locator(f'#self-bench [data-card-id="{base["id"]}"]'),'bench-after-placement')
  energy=next(c for c in (await snapshot())['players'][0]['hand'] if c['kind']=='energy' and not c.get('isSpecial'))
  # Real Chromium touch drag, through the existing pointer/gesture handlers.
  source=page.locator(f'#self-hand [data-card-id="{energy["id"]}"]');await source.scroll_into_view_if_needed()
  a=await source.bounding_box();target=page.locator(f'#self-bench [data-card-id="{base["id"]}"]');b=await target.bounding_box()
  cdp=await context.new_cdp_session(page)
  x,y=a['x']+a['width']/2,a['y']+a['height']/2;tx,ty=b['x']+b['width']/2,b['y']+b['height']/2
  await cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
  for step in range(1,9):
   await cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+(tx-x)*step/8,'y':y+(ty-y)*step/8}]});await page.wait_for_timeout(25)
  await cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
  await page.wait_for_function('({base,energy})=>PokecaMobile.port.getSnapshot().players[0].bench.find(c=>c.id===base).energyCards.some(c=>c.id===energy)',arg={'base':base['id'],'energy':energy['id']});operations.append('touch drag energy attachment');print('PASS touch drag energy attachment',flush=True)
  await inspect(target,'bench-after-energy');await page.wait_for_timeout(750)
  await end_turn();await end_turn();operations.append('both players turn updates')
  evolution=next(c for c in (await snapshot())['players'][0]['hand'] if c['name']=='ドロンチ')
  await card_tap(evolution['id']);await target.tap()
  await page.wait_for_function('id=>PokecaMobile.port.getSnapshot().players[0].bench.find(c=>c.id===id).name==="ドロンチ"',arg=base['id']);operations.append('touch evolution');print('PASS touch evolution',flush=True)
  await inspect(target,'bench-after-evolution')
  current=(await snapshot())['players'][0]['bench'][0];assert current['energyCards'][0]['id']==energy['id'];assert current['evolutionCards'][-1]['id']==evolution['id']
  await target.dispatch_event('contextmenu');await inspect(page.locator('.detail-art'),'evolved-detail')
  await inspect(page.locator('.attached-image-gallery [data-gallery-card-id]').first,'attached-energy-detail');await page.locator('#sheet-close').tap()
  trash=next(c for c in (await snapshot())['players'][0]['hand'] if c['kind']=='trainer')
  await card_tap(trash['id']);await page.get_by_text('練習操作：トラッシュへ',exact=True).tap()
  await page.locator('[data-zone-owner="you"][data-zone="discard"]').tap();await inspect(page.locator(f'[data-gallery-card-id="{trash["id"]}"]'),'live-discard');await page.locator('#sheet-close').tap();operations.append('hand to discard')
  returned=next(c for c in (await snapshot())['players'][0]['hand'] if c['kind']=='trainer')
  await card_tap(returned['id']);await page.get_by_text('練習操作：山札へ戻す',exact=True).tap()
  await page.locator('[data-zone-owner="you"][data-zone="deck"]').tap();await page.get_by_text('練習操作：山札一覧（公開）',exact=True).tap();await inspect(page.locator(f'[data-gallery-card-id="{returned["id"]}"]'),'returned-to-live-draw-pile');await page.locator('#sheet-close').tap();operations.append('hand to draw pile')
  await saved();final=await snapshot();assert sorted(c['id'] for c in physical(final))==initial_ids
  await page.reload(wait_until='domcontentloaded');await page.wait_for_function('window.PokecaMobile&&PokecaImageRegistryStatus.state==="ready"');await saved()
  assert await snapshot()==final;operations.append('persisted reload exact snapshot')
  await inspect(page.locator(f'#self-bench [data-card-id="{base["id"]}"]'),'evolved-after-reload')
  # Delay real registry loading on a saved session; refresh an already-open detail.
  gate=asyncio.Event()
  async def delayed_registry(route):
   await gate.wait();await route.continue_()
  await page.route('**/data/official-image-registry.json',delayed_registry)
  await page.reload(wait_until='domcontentloaded');await page.wait_for_function('window.PokecaMobile&&document.getElementById("save-status").textContent==="自動保存済"')
  pending=await page.evaluate('PokecaMobile.port.getSnapshot().players[0].hand.find(c=>!PokecaImageResolver.resolvePreview(c))')
  assert pending,'must test an image that was unresolved before registry loading'
  loc=page.locator(f'#self-hand [data-card-id="{pending["id"]}"]');await loc.scroll_into_view_if_needed()
  await loc.dispatch_event('contextmenu');await page.locator('.detail-art').wait_for()
  old_url=await page.locator('.detail-art > img').first.get_attribute('src')
  expected=next(b['preview']['imageSourceUrl'] for b in json.loads((ROOT/'data/fixed-deck-preview-bindings.json').read_text())['bindings'] if b['deckName']==pending['name'])
  assert old_url!=expected
  gate.set();await page.wait_for_function('PokecaImageRegistryStatus.state==="ready"')
  await page.wait_for_function('url=>document.querySelector(".detail-art > img")?.src===url',arg=expected)
  await inspect(page.locator('.detail-art'),'delayed-registry-detail-refresh')
  assert await snapshot()==final;await page.locator('#sheet-close').tap();await page.unroute('**/data/official-image-registry.json',delayed_registry)
  operations.append('late registry refresh of open card detail without state changes')
  # A genuine image request failure must preserve the original operable card button.
  async def abort_image(route):await route.abort('failed')
  await page.route(expected,abort_image);await page.reload(wait_until='domcontentloaded')
  await page.wait_for_function('window.PokecaMobile&&PokecaImageRegistryStatus.state==="ready"');await saved()
  failed=page.locator(f'#self-hand [data-card-id="{pending["id"]}"]')
  await page.wait_for_function('id=>document.querySelector(`#self-hand [data-card-id="${id}"] > img`)?.hidden===true',arg=pending['id'])
  assert await failed.locator('img.art-load-fallback:not([hidden])').count()==1
  await failed.scroll_into_view_if_needed();await failed.tap()
  assert await snapshot()==final
  assert await failed.count()==1
  operations.append('failed image retains touch target and fallback')
  await page.unroute(expected,abort_image)
  report={'schemaVersion':1,'device':'Chromium Pixel 5 Android emulation','physicalAndroidVerified':False,'previewBoardUsed':False,'url':page.url,'serviceWorkersBlocked':True,
   'fixedDeckPracticeLoaded':True,'livePhysicalCards':120,'compositionImagesDisplayed':displayed,'adoptedPrintCopies':0,
   'officialEffectsConnected':False,'operations':operations,'identityConservation':True,'saveReloadExact':True,
   'javascriptErrors':errors,'imageFilesSaved':False,'observations':observations,'imageAndBasicOperationPass':all(r['passed'] for r in observations) and not errors,
   'officialMatchPass':False,'limitation':'Manual practice in the app uses reference facts; official card effects and adopted editions are not connected.'}
  (ROOT/'artifacts').mkdir(exist_ok=True);(ROOT/'artifacts/fixed-deck-live-app-result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
  print(json.dumps({k:v for k,v in report.items() if k!='observations'},ensure_ascii=False));assert report['imageAndBasicOperationPass']
  await browser.close()
if __name__=='__main__':asyncio.run(main())
