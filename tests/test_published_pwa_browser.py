"""Normal service-worker-enabled Android-sized browser: saved state survives offline reload."""
import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
from test_fixed_deck_browser_images import session_ca_args
ROOT=Path(__file__).resolve().parents[1]
async def main():
 errors=[]
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE'),args=session_ca_args())
  device=dict(p.devices['Pixel 5']);device.pop('default_browser_type',None)
  context=await browser.new_context(**device);page=await context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto(os.environ.get('POKECA_TEST_URL','https://card-play-sim.github.io/pokeca-play-table-/'),wait_until='domcontentloaded')
  await page.wait_for_function('navigator.serviceWorker.controller&&window.PokecaMobile&&PokecaImageRegistryStatus.state==="ready"&&document.getElementById("save-status").textContent==="自動保存済"')
  await page.wait_for_timeout(500)
  await page.locator('#menu-open').tap();await page.get_by_text('固定2デッキで操作練習（公式効果未接続）',exact=True).tap()
  await page.locator('#fixed-practice-choices button').first.tap();await page.locator('#confirm-ok').tap()
  await page.wait_for_function('PokecaMobile.port.getSnapshot().fixedDeckPractice&&document.getElementById("save-status").textContent==="自動保存済"')
  snapshot=await page.evaluate('PokecaMobile.port.getSnapshot()')
  controller=await page.evaluate('navigator.serviceWorker.controller.scriptURL')
  await context.set_offline(True);await page.reload(wait_until='domcontentloaded')
  await page.wait_for_function('window.PokecaMobile&&PokecaImageRegistryStatus.state==="ready"&&document.getElementById("save-status").textContent==="自動保存済"')
  assert await page.evaluate('PokecaMobile.port.getSnapshot()')==snapshot
  await context.set_offline(False);await page.reload(wait_until='domcontentloaded')
  await page.wait_for_function('window.PokecaMobile&&PokecaImageRegistryStatus.state==="ready"')
  assert await page.evaluate('PokecaMobile.port.getSnapshot()')==snapshot
  report={'url':page.url,'serviceWorkerController':controller,'serviceWorkersBlocked':False,'offlineSessionReloadPass':True,'onlineRestorePass':True,'offlineOfficialImagesVerified':False,'physicalAndroidVerified':False,'officialMatchPass':False,'javascriptErrors':errors}
  (ROOT/'artifacts/published-pwa-result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');assert not errors;print(json.dumps(report,ensure_ascii=False))
  await browser.close()
if __name__=='__main__':asyncio.run(main())
