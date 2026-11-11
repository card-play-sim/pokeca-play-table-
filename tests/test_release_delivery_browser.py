"""Inspect actual served and worker-delivered bytes, then start a fixed deck."""
import asyncio,hashlib,json,os
from pathlib import Path
from playwright.async_api import async_playwright
from test_fixed_deck_browser_images import session_ca_args
ROOT=Path(__file__).resolve().parents[1]
async def main():
 url=os.environ.get('POKECA_TEST_URL','http://127.0.0.1:8765/');report={};errors=[]
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE'),args=session_ca_args());device=dict(p.devices['Pixel 5']);device.pop('default_browser_type',None)
  c=await b.new_context(**device);page=await c.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto(url);await page.wait_for_function('window.PokecaUpdateStatus?.state==="ready"&&document.getElementById("save-status").textContent==="自動保存済"',timeout=60000)
  # A reload with an active controller proves that these runtime bytes come from its release.
  await page.reload();await page.wait_for_function('window.PokecaUpdateStatus?.state==="ready"&&document.getElementById("save-status").textContent==="自動保存済"')
  status=await page.evaluate('PokecaUpdateStatus');assert all(status[k]=='244' for k in ('htmlBuild','mobileBuild','controllerBuild'))
  assert await page.locator('#demo-open').inner_text()=='固定デッキ対戦'
  cached=await page.evaluate("""async()=>{const c=await caches.open(PokecaUpdateStatus.cacheName),out={};for(const path of Object.keys(PokecaUpdateStatus.releaseFiles)){const r=await c.match(new URL(path,location.href));out[path]=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await r.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');}return out;}""")
  assert cached==status['releaseFiles']
  served={}
  direct=await b.new_context(service_workers='block');raw_page=await direct.new_page()
  for path in ('index.html','ui/mobile.js?build=244','ui/app-update.js?build=244','sw.js'):
   r=await raw_page.goto(url+path,wait_until='domcontentloaded');assert r.status==200
   digest=hashlib.sha256(await r.body()).hexdigest();assert digest==hashlib.sha256((ROOT/path.split('?')[0]).read_bytes()).hexdigest(),path
   served[path]={'sha256':digest,'headers':r.headers}
  await direct.close()
  await page.locator('#demo-open').tap();await page.locator('#reference-match-choices button').first.tap();await page.locator('#confirm-ok').tap()
  await page.wait_for_function('PokecaMobile.port.getSnapshot().referenceEffectValidation&&document.getElementById("save-status").textContent==="自動保存済"')
  initial=await page.evaluate('PokecaMobile.port.getSnapshot()')
  images=await page.locator('#self-hand img:not([hidden]),#self-active img:not([hidden]),#self-bench img:not([hidden])').evaluate_all('async els=>{for(const e of els)await e.decode();return els.map(e=>({url:e.currentSrc,ok:e.naturalWidth>0}));}')
  assert images and all(i['ok'] and i['url'].startswith('https://www.pokemon-card.com/') for i in images)
  await c.set_offline(True);await page.reload();await page.wait_for_function('window.PokecaUpdateStatus?.state==="ready"&&document.getElementById("save-status").textContent==="自動保存済"')
  assert await page.evaluate('PokecaMobile.port.getSnapshot()')==initial
  assert not errors,errors
  report={'url':url,'release':status,'served':served,'cacheHashes':cached,'fixedDeckStarted':True,'imagesDecoded':len(images),'offlineRestoreExact':True,'physicalAndroidVerified':False,'errors':errors}
  (ROOT/'artifacts/release-delivery-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k not in ('release','served','cacheHashes')},ensure_ascii=False),flush=True)
  await b.close()
if __name__=='__main__':asyncio.run(main())
