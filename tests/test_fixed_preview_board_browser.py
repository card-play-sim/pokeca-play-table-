"""Real official-image painting on the existing board, in visual-only fixed-deck mode.
No engine/card identities are altered; no images or screenshots are saved.
"""
import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
from test_fixed_deck_browser_images import session_ca_args
ROOT=Path(__file__).resolve().parents[1]
async def main():
 responses={};errors=[];results=[]
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE'),args=session_ca_args())
  device=dict(p.devices['Pixel 5']);device.pop('default_browser_type',None)
  page=await browser.new_page(**device)
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('response',lambda r:responses.update({r.url:{'status':r.status,'type':r.headers.get('content-type','')}}))
  await page.goto('http://127.0.0.1:8765/',wait_until='domcontentloaded')
  await page.wait_for_function('window.PokecaMobile&&PokecaImageRegistryStatus.state==="ready"&&document.getElementById("save-status").textContent==="自動保存済"')
  before=await page.evaluate('PokecaMobile.port.getSnapshot()')
  async def inspect(locator,zone):
   await locator.scroll_into_view_if_needed()
   obs=await locator.evaluate('''async el=>{
    const img=el.querySelector('img:not([hidden])');let decoded=false;
    try{await img.decode();decoded=img.naturalWidth>0&&img.naturalHeight>0;}catch{}
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const rect=img.getBoundingClientRect(),s=getComputedStyle(img);
    const hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
    return {id:el.dataset.previewCard,sourceUrl:img.currentSrc||img.src,decoded,width:img.naturalWidth,height:img.naturalHeight,
     painted:(hit===img||hit===img.parentElement)&&s.visibility==='visible'&&s.display!=='none'&&Number(s.opacity)>0,mode:img.dataset.imageMode,referenceId:img.dataset.previewReferenceId};}''')
   http=responses.get(obs['sourceUrl']);passed=bool(obs['decoded'] and obs['painted'] and obs['mode']=='provisional-preview' and http and http['status']==200 and http['type'].startswith('image/'))
   results.append({'zone':zone,'passed':passed,'observation':obs,'http':http})
  await page.locator('#menu-open').click();await page.get_by_text('固定120枚の画像確認盤面',exact=True).click()
  await page.locator('#fixed-image-controls').wait_for()
  assert await page.locator('#attack-button').is_disabled()
  for offset in range(60):
   if offset%10==0:print("Inspecting offset",offset,flush=True)
   for prefix in ('self','opponent'):
    await inspect(page.locator('#'+prefix+'-active [data-preview-card]'),'active')
    await inspect(page.locator('#'+prefix+'-bench [data-preview-card]').first,'bench')
   await inspect(page.locator('#self-hand [data-preview-card]').first,'hand')
   if offset in (0,13):
    for owner in ('you','ai'):
     for zone in ('deck','discard'):
      if offset==13 and zone=='deck':continue
      await page.locator(f'[data-zone-owner="{owner}"][data-zone="{zone}"]').click()
      cards=page.locator('#sheet-content [data-preview-card]')
      for index in range(await cards.count()):await inspect(cards.nth(index),zone)
      await page.locator('#sheet-close').click()
   await page.get_by_text('次の配置で画像確認',exact=True).click()
  assert await page.evaluate('PokecaMobile.port.getSnapshot()')==before
  await page.get_by_text('試験対戦に戻る',exact=True).click()
  assert await page.evaluate('PokecaMobile.port.getSnapshot()')==before
  assert await page.locator('#fixed-image-controls').count()==0
  zones={zone:{'inspections':len([r for r in results if r['zone']==zone]),'displayedPhysicalCards':len({r['observation']['id'] for r in results if r['zone']==zone and r['passed']})} for zone in ('active','bench','hand','deck','discard')}
  report={'schemaVersion':1,'inspectedIn':'Chromium Pixel 5 Android emulation','physicalAndroidVerified':False,
   'A_displayedCopies':len({r['observation']['id'] for r in results if r['zone']=='active' and r['passed']}),
   'B_confirmedPrintCopies':0,'C_undisplayedCopies':120-len({r['observation']['id'] for r in results if r['zone']=='active' and r['passed']}),
   'zones':zones,'javascriptErrors':errors,'gameSnapshotUnchanged':True,'mode':'visual-only fixed-deck board; official effects remain unconnected',
   'imageFilesSaved':False,'observations':results,'pass':all(r['passed'] for r in results) and not errors}
  (ROOT/'artifacts').mkdir(exist_ok=True);(ROOT/'artifacts/fixed-preview-board-result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
  print(json.dumps({k:v for k,v in report.items() if k!='observations'},ensure_ascii=False))
  await browser.close()
  assert report['pass']
  assert zones['active']['displayedPhysicalCards']==zones['bench']['displayedPhysicalCards']==zones['deck']['displayedPhysicalCards']==zones['discard']['displayedPhysicalCards']==120
  assert zones['hand']['displayedPhysicalCards']==60 # Opponent's hand remains hidden.
if __name__=='__main__':asyncio.run(main())
