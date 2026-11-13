"""Assert mobile card/zone hit targets are not covered by the actionbar."""
import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
from test_fixed_deck_browser_images import session_ca_args
from browser_opening import finish_opening
ROOT=Path(__file__).resolve().parents[1]
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE'),args=session_ca_args())
  device=dict(p.devices['Pixel 5']);device.pop('default_browser_type',None)
  context=await browser.new_context(**device,service_workers='block')
  page=await context.new_page()
  try:
   await page.goto(os.environ.get('POKECA_TEST_URL','http://127.0.0.1:8765/'),wait_until='domcontentloaded')
   await page.wait_for_function('window.PokecaMobile&&PokecaImageRegistryStatus.state==="ready"')
   await page.get_by_role('button',name='固定デッキで検証用AI対戦を開始',exact=True).tap()
   await page.locator('#reference-match-choices button').first.tap()
   await page.locator('#confirm-ok').tap();await finish_opening(page)
   await page.wait_for_function('PokecaMobile.port.getSnapshot().referenceEffectValidation')
   # Opening mulligan choices legitimately cover the board. Resolve through the UI
   # before measuring board targets rather than treating the modal as an overlap bug.
   for _ in range(10):
    state=await page.evaluate('PokecaMobile.port.getSnapshot()')
    choice=state.get('pendingReferenceChoice')
    if not choice:break
    assert choice['kind']=='MULLIGAN',choice
    if choice['playerId']=='you':
     await page.locator('#reference-choice button').first.tap()
    else:
     await page.wait_for_function('PokecaMobile.port.getSnapshot().pendingReferenceChoice?.playerId!=="ai"')
   assert not (await page.evaluate('PokecaMobile.port.getSnapshot()')).get('pendingReferenceChoice')
   await page.wait_for_function('!document.querySelector("#sheet").open')
   selectors=['[data-zone-owner="you"][data-zone="discard"]',
              '[data-zone-owner="you"][data-zone="deck"]',
              '[data-zone-owner="you"][data-zone="prize"]']
   selectors+=['#self-bench .bench-slot.empty']
   result=await page.evaluate("""selectors=>selectors.map(selector=>{
     const el=document.querySelector(selector);if(!el)return {selector,missing:true};
     const r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
     const top=document.elementFromPoint(x,y);
     return {selector,x,y,width:r.width,height:r.height,top:top?.outerHTML?.slice(0,140),
       hittable:!!top&&(el===top||el.contains(top))};
   })""",selectors)
   geometry=await page.evaluate("""()=>Object.fromEntries(['.app','.table','.table .opponent','.table .self','.table .self .active-row','#self-right','#self-bench','.actionbar'].map(selector=>{const el=document.querySelector(selector),r=el.getBoundingClientRect(),s=getComputedStyle(el);return [selector,{x:r.x,y:r.y,width:r.width,height:r.height,gridTemplateRows:s.gridTemplateRows,overflow:s.overflow}]}))""")
   (ROOT/'artifacts').mkdir(exist_ok=True)
   (ROOT/'artifacts/mobile-layout-geometry.json').write_text(json.dumps(geometry,ensure_ascii=False,indent=2)+'\\n')
   children=await page.evaluate("""()=>[...document.querySelector('.app').children].map(e=>({tag:e.tagName,id:e.id,className:e.className,rect:{y:e.getBoundingClientRect().y,height:e.getBoundingClientRect().height},position:getComputedStyle(e).position,display:getComputedStyle(e).display}))""")
   print(json.dumps({'layoutGeometry':geometry,'appChildren':children},ensure_ascii=False))
   (ROOT/'artifacts/mobile-hit-targets.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
   await page.screenshot(path=str(ROOT/'artifacts/mobile-hit-targets.png'),full_page=True)
   assert len(children)==6,'gameplay grid gained a seventh child: '+repr(children)
   assert geometry['.table']['height']>=150,'gameplay board collapsed: '+repr(geometry)
   assert all(x.get('hittable') for x in result),result
   print(json.dumps({'mobileHitTargetsPass':True,'physicalAndroidVerified':False,'targets':result},ensure_ascii=False))
  finally:
   await browser.close()
if __name__=='__main__':asyncio.run(main())
