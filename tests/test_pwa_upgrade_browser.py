"""Real SW upgrade over a local secure-context origin, preserving actual IndexedDB.
A deliberately mixed v240 cache uses the genuine f040d35 UI with the v240 label.
It reproduces why labels cannot establish which UI/module bytes were loaded.
"""
import asyncio,hashlib,json,os,subprocess,threading
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit,unquote
from playwright.async_api import async_playwright
from test_fixed_deck_browser_images import session_ca_args
ROOT=Path(__file__).resolve().parents[1]
BASE=os.environ.get('POKECA_UPGRADE_BASE','f040d35')
phase={'value':'old'};old={};requests=[]
def prior(path):
 if path not in old:old[path]=subprocess.check_output(['git','show',BASE+':'+path],cwd=ROOT)
 return old[path]
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  path=unquote(urlsplit(self.path).path).lstrip('/') or 'index.html'
  try:
   if '..' in Path(path).parts:raise FileNotFoundError()
   if phase['value']=='old':
    body=prior(path)
    if path in ('index.html','sw.js'):body=body.replace(b'238',b'240')
    if path=='index.html':body=body.replace(b'location.protocol==="https:"',b'isSecureContext')
   else:
    body=(ROOT/path).read_bytes()
    if phase['value']=='mixed' and path=='ui/mobile.js':body=prior(path)
   requests.append({'phase':phase['value'],'url':self.path,'sha256':hashlib.sha256(body).hexdigest()})
   self.send_response(200);self.send_header('Content-Type','text/javascript' if path.endswith('.js') else 'text/html' if path.endswith('.html') else 'application/json' if path.endswith('.json') else 'text/css' if path.endswith('.css') else 'image/svg+xml');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body)
  except (FileNotFoundError,subprocess.CalledProcessError):self.send_error(404)
async def main():
 server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}/'
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE'),args=session_ca_args());device=dict(p.devices['Pixel 5']);device.pop('default_browser_type',None)
  context=await browser.new_context(**device);page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto(base);await page.wait_for_function('navigator.serviceWorker.controller&&window.PokecaMobile&&document.getElementById("save-status").textContent==="自動保存済"')
  assert await page.locator('#demo-open').inner_text()==('AI試験対戦' if BASE=='f040d35' else '固定デッキ対戦')
  assert 'v240' in await page.locator('#build-revision').inner_text()
  if BASE!='f040d35':
   await page.locator('#demo-open').tap();await page.locator('#reference-match-choices button').first.tap();await page.locator('#confirm-ok').tap()
   await page.wait_for_function('PokecaMobile.port.getSnapshot().referenceEffectValidation&&document.getElementById("save-status").textContent==="自動保存済"')
  saved=await page.evaluate('PokecaMobile.port.getSnapshot()');session=await page.evaluate('PokecaMobile.port.getResumeSnapshot().matchId')
  await page.evaluate("async()=>{localStorage.setItem('upgrade-preserve','yes');const c=await caches.open('other-app');await c.put('./sentinel',new Response('keep'));}")
  # Mismatched CDN bytes must never activate the new worker or discard the old cache.
  phase['value']='mixed'
  await page.evaluate('async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();}')
  await page.wait_for_function('async()=>{const r=await navigator.serviceWorker.getRegistration();return !r.installing}')
  assert await page.locator('#demo-open').inner_text()==('AI試験対戦' if BASE=='f040d35' else '固定デッキ対戦')
  assert 'pokeca-first-playable-v240' in await page.evaluate('caches.keys()')
  phase['value']='new'
  await page.evaluate('async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();}')
  await page.wait_for_function('window.PokecaUpdateStatus?.state==="ready"&&document.getElementById("save-status").textContent==="自動保存済"',timeout=60000)
  assert await page.locator('#demo-open').inner_text()=='固定デッキ対戦'
  assert await page.evaluate('PokecaMobile.port.getSnapshot()')==saved
  assert await page.evaluate('localStorage.getItem("upgrade-preserve")')=='yes'
  assert await page.evaluate("async()=>(await (await caches.open('other-app')).match('./sentinel')).text()")=='keep'
  status=await page.evaluate('PokecaUpdateStatus');assert {status[k] for k in ('htmlBuild','mobileBuild','controllerBuild')}=={'243'}
  # Compare the actual verified responses in the worker's cache, not DOM labels.
  cache_hashes=await page.evaluate("""async()=>{const c=await caches.open(PokecaUpdateStatus.cacheName);const out={};for(const url of ['./index.html','./ui/mobile.js?build=243','./ui/app-update.js?build=243']){const r=await c.match(new URL(url,location.href));out[url]=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await r.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');}return out;}""")
  for url,digest in cache_hashes.items():assert digest==hashlib.sha256((ROOT/url.split('?')[0]).read_bytes()).hexdigest()
  await page.locator('#demo-open').tap();await page.locator('#reference-match-choices button').first.tap();await page.locator('#confirm-ok').tap()
  await page.wait_for_function('PokecaMobile.port.getSnapshot().referenceEffectValidation&&document.getElementById("save-status").textContent==="自動保存済"')
  initial=await page.evaluate('PokecaMobile.port.getSnapshot()');assert initial['referenceEffectValidation']['sourceDeckIds']==['kangaskhan-meowth-fixed','dragapult-fixed']
  images=await page.locator('#self-hand img:not([hidden]),#self-active img:not([hidden]),#self-bench img:not([hidden])').evaluate_all('async els=>{for(const e of els)await e.decode();return els.map(e=>({url:e.currentSrc,ok:e.naturalWidth>0}));}')
  assert images and all(i['ok'] and i['url'].startswith('https://www.pokemon-card.com/') for i in images)
  await context.set_offline(True);await page.reload();await page.wait_for_function('window.PokecaUpdateStatus?.state==="ready"&&document.getElementById("save-status").textContent==="自動保存済"')
  assert await page.evaluate('PokecaMobile.port.getSnapshot()')==initial
  assert await page.locator('#demo-open').inner_text()=='固定デッキ対戦'
  assert not errors,errors
  report={'origin':base,'physicalAndroidVerified':False,'oldLabel':'v240','oldActualUI':'AI試験対戦' if BASE=='f040d35' else '固定デッキ対戦','baseCommit':BASE,'existingFixedDeckSessionPreserved':bool(saved.get('referenceEffectValidation')),'mixedReleaseRejected':True,'existingSessionPreserved':session,'loadedRelease':status,'cacheHashes':cache_hashes,'fixedDeckStarted':True,'previewImages':len(images),'offlineRestoreExact':True,'javascriptErrors':errors,'requests':requests}
  (ROOT/'artifacts/pwa-upgrade-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k not in ('loadedRelease','requests')},ensure_ascii=False),flush=True)
  await browser.close()
 server.shutdown()
if __name__=='__main__':asyncio.run(main())
