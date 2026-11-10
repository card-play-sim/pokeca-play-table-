"""Assert mobile card/zone hit targets are not covered by the actionbar."""
import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
from test_fixed_deck_browser_images import session_ca_args
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
   await page.locator('#confirm-ok').tap()
   await page.wait_for_function('PokecaMobile.port.getSnapshot().referenceEffectValidation')
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
   (ROOT/'artifacts').mkdir(exist_ok=True)
   (ROOT/'artifacts/mobile-hit-targets.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
   await page.screenshot(path=str(ROOT/'artifacts/mobile-hit-targets.png'),full_page=True)
   assert all(x.get('hittable') for x in result),result
   print(json.dumps({'mobileHitTargetsPass':True,'physicalAndroidVerified':False,'targets':result},ensure_ascii=False))
  finally:
   await browser.close()
if __name__=='__main__':asyncio.run(main())
