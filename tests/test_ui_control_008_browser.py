"""Presentation regression through Android-emulated DOM taps; rules unchanged."""
import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
from test_fixed_deck_browser_images import session_ca_args
ROOT=Path(__file__).resolve().parents[1]
FIXTURE=(ROOT/'tests/fixtures/g-base-008-browser.js').read_text()
async def main():
 reports=[];errors=[]
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE'),args=session_ca_args())
  device=dict(p.devices['Pixel 5']);device.pop('default_browser_type',None)
  c=await b.new_context(**device,service_workers='allow');page=await c.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto(os.environ.get('POKECA_TEST_URL','http://127.0.0.1:8765/'),wait_until='domcontentloaded');await page.wait_for_function('window.PokecaMobile&&PokecaImageRegistryStatus.state==="ready"')
  await page.wait_for_function('window.PokecaUpdateStatus?.state==="ready"&&document.getElementById("save-status").textContent==="自動保存済"',timeout=60000)
  await page.reload();await page.wait_for_function('window.PokecaUpdateStatus?.state==="ready"&&document.getElementById("save-status").textContent==="自動保存済"')
  async def snap():return await page.evaluate('PokecaMobile.port.getSnapshot()')
  async def saved():await page.wait_for_function('document.getElementById("save-status").textContent==="自動保存済"')
  async def zoom(selector):
   before=await snap();el=page.locator(selector);await el.scroll_into_view_if_needed();box=await el.bounding_box();cdp=await c.new_cdp_session(page)
   await cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':box['x']+box['width']/2,'y':box['y']+box['height']/2}]});await page.wait_for_timeout(600)
   await cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});await cdp.detach()
   await page.wait_for_function('document.getElementById("card-zoom").open');assert await snap()==before
   images=page.locator('#card-zoom-art img');assert await images.count()>0
   assert await images.first.evaluate('e=>getComputedStyle(e).objectFit')=='contain'
   await page.locator('#card-zoom-close').tap();assert await snap()==before;await page.wait_for_timeout(750)
  for width,height in [(320,568),(360,640),(393,851),(412,915)]:
   print('START portrait',width,height,flush=True);await page.set_viewport_size({'width':width,'height':height})
   s=await page.evaluate(FIXTURE,{'active':['メガガルーラex','ドラメシヤ'],'bench':{'0':['マシマシラ'],'1':['ドロンチ']},'hand':{'0':['基本悪エネルギー','エネルギーつけかえ','ポケモンいれかえ','アカマツ','ファイアローex','ヒーローマント','シェイミ']},'energy':{'0':{'active':['基本悪エネルギー','基本悪エネルギー','イグニッションエネルギー']}}})
   assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   geometry=await page.evaluate('''()=>Object.fromEntries(['.table','.hand-panel','.actionbar','#end-turn','#recent-actions'].map(s=>{const e=document.querySelector(s),r=e.getBoundingClientRect();return [s,{x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom}]}))''')
   assert geometry['.table']['h']>=150,geometry
   assert geometry['#recent-actions']['bottom']<=geometry['.table']['y'],geometry
   assert all(v['x']>=0 and v['x']+v['w']<=width+1 and v['bottom']<=height+1 for v in geometry.values()),geometry
   for owner in ('you','ai'):
    pl=next(x for x in s['players'] if x['id']==owner)
    for zone,count in [('deck',len(pl['deck'])),('prize',pl['prizes'])]:
     el=page.locator(f'[data-zone-owner="{owner}"][data-zone="{zone}"]');assert await el.locator('strong').inner_text()==str(count)
     assert await el.locator('img').count()==(count if zone=='prize' else 1)
     assert await el.locator('img').first.evaluate('e=>e.complete&&e.naturalWidth>0')
   # Independent expected labels are mapped from canonical legal actions, never card names.
   mismatch=await page.evaluate('''()=>{const g=PokecaMobile.port.getSnapshot(),labels={use_ability:'特性',play_item:'使う',play_supporter:'使う',play_stadium:'使う',bench_basic:'出す',play_active_basic:'出す',evolve:'進化',attach_energy:'つける',attach_tool:'つける'};return [...document.querySelectorAll('[data-card-id]')].flatMap(el=>{const own=el.dataset.owner==='you',hand=!!el.dataset.hand,opts=own?(hand?PokecaMobile.port.getHandOptions('you',el.dataset.cardId):PokecaMobile.port.getPokemonActions('you',el.dataset.cardId)):[],expected=[...new Set(opts.filter(o=>o.ok===true||o.enabled===true).map(o=>labels[o.action?.type]||(o.kind==='attack'?'ワザ':o.kind==='ability'?'特性':null)).filter(Boolean))].sort(),actual=[...el.querySelectorAll('[data-legal-mark]')].map(x=>x.dataset.legalMark).sort();return JSON.stringify(actual)===JSON.stringify(expected)?[]:[{id:el.dataset.cardId,actual,expected}];});}''')
   assert not mismatch,mismatch
   assert await page.locator('#self-active [data-energy-label="悪"]').get_attribute('data-energy-count')=='2'
   assert await page.locator('#self-active [data-energy-label="イグニッションエネルギー"]').get_attribute('data-energy-count')=='1'
   await zoom('#self-active .card');await zoom('#self-hand .card:first-child')
   await page.screenshot(path=str(ROOT/f'artifacts/ui-control-008-{width}.png'),full_page=True)
   reports.append({'viewport':[width,height],'withinViewport':True,'legalMarksMatchPort':True,'zoneBacksAndCounts':True,'longPressNoMutation':True,'specialEnergyName':True})
  cards={x['name']:x['id'] for x in s['players'][0]['hand']};active=s['players'][0]['active']['id'];bench=s['players'][0]['bench'][0]['id']
  # Short tap must select rather than zoom; physical basic attachment then shared move.
  await page.locator(f'#self-hand [data-card-id="{cards["基本悪エネルギー"]}"]').tap();assert not await page.locator('#card-zoom').evaluate('e=>e.open')
  await page.locator('#self-active .card').tap();assert await page.locator('#self-active [data-energy-label="悪"]').get_attribute('data-energy-count')=='3'
  await page.locator(f'#self-hand [data-card-id="{cards["エネルギーつけかえ"]}"]').tap();await page.locator('#hand-actions button:enabled').first.tap()
  await page.locator('#selection-cards button').first.tap();await page.locator('#selection-confirm').tap();await page.locator(f'[data-selection-id="{bench}"]').tap();await page.locator('#selection-confirm').tap()
  await page.wait_for_function('PokecaMobile.port.getSnapshot().players[0].bench[0].energyCards.length===1');assert await page.locator('#self-active [data-energy-label="悪"]').get_attribute('data-energy-count')=='2';assert await page.locator('#self-bench [data-energy-label="悪"]').get_attribute('data-energy-count')=='1'
  # Hand-use abilities use the same action menu as every hand action family.
  await page.locator(f'#self-hand [data-card-id="{cards["ファイアローex"]}"]').tap();await page.locator('#hand-actions button:enabled').first.tap()
  await page.locator('#confirm-ok').wait_for(state='visible');await page.locator('#confirm-ok').tap()
  await page.wait_for_function('id=>PokecaMobile.port.getSnapshot().players[0].bench.some(c=>c.id===id)',arg=cards['ファイアローex'])
  after=await snap();await saved();await page.reload();await page.wait_for_function('window.PokecaMobile&&document.getElementById("save-status").textContent==="自動保存済"');assert await snap()==after
  assert await page.locator('#self-bench [data-energy-label="悪"]').get_attribute('data-energy-count')=='1'
  # Shared discard selector updates opposing energy strips too (heads is seeded).
  s=await page.evaluate(FIXTURE,{'firstDeck':1,'active':['ドラメシヤ','ロケット団のニューラ'],'hand':{'0':['クラッシュハンマー']},'energy':{'1':{'active':['基本悪エネルギー']}}})
  await page.evaluate('()=>{const g=PokecaMobile.port.getSnapshot();g.referenceRngState=0;PokecaMobile.port.loadGame(g);}')
  assert await page.locator('#opponent-active [data-energy-label="悪"]').count()==1
  await page.locator('#self-hand .card').tap();await page.locator('#hand-actions button:enabled').first.tap();await page.locator('#selection-cards button').first.tap();await page.locator('#selection-confirm').tap()
  await page.wait_for_function('PokecaMobile.port.getSnapshot().players[1].active.energyCards.length===0');assert await page.locator('#opponent-active .attached-energy-chip').count()==0
  await page.locator('[data-zone="discard"][data-zone-owner="you"]').tap();await zoom('[data-gallery-card-id]');await page.locator('#sheet-close').tap()
  assert not errors,errors
  report={'url':page.url,'cases':reports,'physicalEnergyAttachMoveDiscard':True,'handAbilityDOM':True,'saveReloadExact':True,'galleryZoom':True,'javascriptErrors':errors,'physicalAndroidVerified':False}
  (ROOT/'artifacts/ui-control-008-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False),flush=True);await b.close()
if __name__=='__main__':
 try:asyncio.run(main())
 except Exception:
  import traceback
  (ROOT/'artifacts').mkdir(exist_ok=True)
  (ROOT/'artifacts/ui-control-008-failure.json').write_text(json.dumps({'status':'FAILED','traceback':traceback.format_exc(),'physicalAndroidVerified':False},ensure_ascii=False,indent=2)+'\n')
  raise
