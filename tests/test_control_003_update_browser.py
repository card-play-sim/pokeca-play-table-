"""Real v246 -> current PWA upgrade with persistent Chromium, cold starts and saves.
Historical sources are served only inside an isolated test origin; no checkout is
rolled back. Old build=246 URLs deliberately stay stale, reproducing shared-cache
failure. After publishing, optional public source mode serves actual Pages bytes.
"""
import asyncio,hashlib,json,os,re,subprocess,tempfile,threading
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import unquote,urlsplit
from playwright.async_api import async_playwright
from test_fixed_deck_browser_images import session_ca_args
ROOT=Path(__file__).resolve().parents[1]
OLD='87b5b668';PREVIOUS='13b43222'
BUILD=re.search(r'name="pokeca-build" content="(\d+)"',(ROOT/'index.html').read_text()).group(1)
def assert_release_markers():
 html=(ROOT/'index.html').read_text()
 mobile=(ROOT/'ui/mobile.js').read_text()
 revision=re.search(r'id="build-revision">v(\d+)<',html)
 runtime=re.search(r"""window\.PokecaMobileBuild=['"](\d+)['"]""",mobile)
 assert revision and revision.group(1)==BUILD, f'PWA_VISIBLE_BUILD_MISMATCH: expected {BUILD}, found {revision.group(1) if revision else "missing"}'
 assert runtime and runtime.group(1)==BUILD, f'PWA_MOBILE_BUILD_MISMATCH: expected {BUILD}, found {runtime.group(1) if runtime else "missing"}'
assert_release_markers()
phase={'value':'old'};cached={};requests=[]
def source(ref,path):
 key=(ref,path)
 if key not in cached:
  if ref=='new':
   if PUBLIC:cached[key]=subprocess.check_output(['curl','-fsS','--max-time','30',PUBLIC.rstrip('/')+'/'+path+('?build='+BUILD if path.startswith('ui/') else '?control003='+BUILD)])
   else:cached[key]=(ROOT/path).read_bytes()
  else:cached[key]=subprocess.check_output(['git','show',ref+':'+path],cwd=ROOT)
 return cached[key]
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  split=urlsplit(self.path);path=unquote(split.path).lstrip('/') or 'index.html'
  try:
   if '..' in Path(path).parts:raise FileNotFoundError()
   ref=OLD if phase['value']=='old' or 'build=246' in split.query else PREVIOUS if phase['value']=='stale246' else 'new'
   body=source(ref,path)
   requests.append({'phase':phase['value'],'url':self.path,'source':ref,'sha256':hashlib.sha256(body).hexdigest()})
   self.send_response(200);self.send_header('Content-Type','text/javascript' if path.endswith('.js') else 'text/html' if path.endswith('.html') else 'text/css' if path.endswith('.css') else 'image/svg+xml' if path.endswith('.svg') else 'application/json')
   self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body)
  except (FileNotFoundError,subprocess.CalledProcessError):self.send_error(404)
async def main():
 (ROOT/'artifacts').mkdir(exist_ok=True)
 server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}/'
 errors=[]
 try:
  async with async_playwright() as p:
   device=dict(p.devices['Pixel 5']);device.pop('default_browser_type',None)
   with tempfile.TemporaryDirectory(prefix='pokeca-control003-') as profile:
    async def launch(offline=False,recovery=False):
     context=await p.chromium.launch_persistent_context(profile,executable_path=os.environ.get('CHROMIUM_EXECUTABLE'),args=session_ca_args(),**device)
     await context.set_offline(offline);page=await context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
     await page.goto(base+('update.html?build='+BUILD if recovery else ''),wait_until='domcontentloaded');return context,page
    async def ready(page,build):
     try:
      await page.wait_for_function('build=>window.PokecaMobile&&PokecaUpdateStatus?.state==="ready"&&PokecaUpdateStatus.controllerBuild===build&&PokecaImageRegistryStatus.state==="ready"&&document.getElementById("save-status").textContent==="自動保存済"',arg=build,timeout=60000)
     except Exception:
      diagnostic=await page.evaluate('async()=>({status:window.PokecaUpdateStatus,save:document.getElementById("save-status")?.textContent,notice:document.getElementById("app-update-status")?.textContent,caches:await caches.keys(),reg:await(async()=>{const r=await navigator.serviceWorker.getRegistration();return {active:r?.active?.state,waiting:r?.waiting?.state,installing:r?.installing?.state,controller:navigator.serviceWorker.controller?.state};})(),cacheSizes:await Promise.all((await caches.keys()).map(async name=>({name,count:(await(await caches.open(name)).keys()).length}))),controller:await new Promise(resolve=>{const c=new MessageChannel();c.port1.onmessage=e=>resolve(e.data);navigator.serviceWorker.controller?.postMessage({type:"RELEASE_INFO"},[c.port2]);setTimeout(()=>resolve(null),1000);})})')
      diagnostic['requests']=requests;diagnostic['phase']=phase['value'];(ROOT/'artifacts/control-003-failure.json').write_text(json.dumps(diagnostic,ensure_ascii=False,indent=2)+'\n');print(json.dumps(diagnostic,ensure_ascii=False),flush=True);raise
    print('START genuine v246 install',flush=True)
    context,page=await launch();await ready(page,'246')
    assert 'v246' in await page.locator('#build-revision').inner_text()
    await page.evaluate('()=>{let n=2;Math.random=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;}}')
    await page.locator('#demo-open').tap();await page.locator('#reference-match-choices button').first.tap();await page.locator('#confirm-ok').tap()
    await page.wait_for_function('PokecaMobile.port.getSnapshot().referenceEffectValidation')
    for _ in range(10):
     choice=await page.evaluate('PokecaMobile.port.getSnapshot().pendingReferenceChoice')
     if not choice:break
     if choice['playerId']=='you':await page.locator('#reference-choice button').first.tap()
     else:await page.wait_for_function('PokecaMobile.port.getSnapshot().pendingReferenceChoice?.playerId!=="ai"')
    await page.wait_for_function('document.getElementById("save-status").textContent==="自動保存済"')
    saved=await page.evaluate('PokecaMobile.port.getSnapshot()');session=await page.evaluate('PokecaMobile.port.getSessionId()')
    assert saved['players'][0]['active'] and not await page.locator('#opening-start').count()
    await page.evaluate("async()=>{localStorage.setItem('control003-preserve','yes');const c=await caches.open('unrelated-control003');await c.put('./sentinel',new Response('keep'));}")
    # The pre-fix release kept the same URLs. One stale script prevents activation
    # while the old app still reports matching v246 labels as ready.
    print('START same-URL stale cache reproduction',flush=True)
    phase['value']='stale246'
    outcome=await page.evaluate('''async()=>{const reg=await navigator.serviceWorker.getRegistration();return await new Promise(async(resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('install not observed')),45000);reg.addEventListener('updatefound',()=>{const w=reg.installing;w.addEventListener('statechange',()=>{if(w.state==='redundant'||w.state==='activated'){clearTimeout(timeout);resolve(w.state);}});},{once:true});try{await reg.update();}catch(e){clearTimeout(timeout);reject(e);}})}''')
    assert outcome=='redundant',outcome
    assert await page.evaluate('PokecaUpdateStatus.state')=='ready'
    assert await page.evaluate('PokecaUpdateStatus.mobileBuild')=='246'
    assert await page.evaluate('PokecaMobile.port.getSnapshot()')==saved
    await context.close()
    # Cold offline restart must keep the old installed release and saved match.
    context,page=await launch(offline=True);await page.wait_for_function('window.PokecaMobile&&navigator.serviceWorker.controller&&PokecaImageRegistryStatus.state==="ready"&&document.getElementById("save-status").textContent==="自動保存済"');assert await page.evaluate('PokecaMobile.port.getSnapshot()')==saved;await context.close()
    print('START cold online upgrade to '+BUILD,flush=True)
    phase['value']='new'
    # A cold launch at the network recovery route bypasses the old cached shell.
    # The real recovery page updates/activates the worker and returns to the app.
    # No test-injected registration/update/storage-reset or restore call is used.
    context,page=await launch(recovery=True);await ready(page,BUILD)
    assert 'v'+BUILD in await page.locator('#build-revision').inner_text()
    assert int(BUILD)>246;assert await page.evaluate('PokecaMobile.port.getSnapshot()')==saved
    assert await page.evaluate('PokecaMobile.port.getSessionId()')==session
    assert await page.evaluate('localStorage.getItem("control003-preserve")')=='yes'
    assert await page.evaluate("async()=>(await(await caches.open('unrelated-control003')).match('./sentinel')).text()")=='keep'
    status=await page.evaluate('PokecaUpdateStatus');assert status['manualOpening'] and status['coherent']
    cache_hashes=await page.evaluate('''async()=>{const c=await caches.open(PokecaUpdateStatus.cacheName),out={};for(const url of Object.keys(PokecaUpdateStatus.releaseFiles)){const r=await c.match(new URL(url,location.href));out[url]=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await r.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');}return out;}''')
    assert cache_hashes==status['releaseFiles']
    await page.locator('#menu-open').tap();await page.get_by_text('最新版を確認・更新',exact=True).tap();await ready(page,BUILD)
    # Keep SW enabled while exercising real manual setup after upgrade.
    for deck in (0,1):
     await page.evaluate('seed=>{Math.random=()=>seed/4294967296}',64 if deck==0 else 9)
     before=await page.evaluate('PokecaMobile.port.getSnapshot()');previous_session=await page.evaluate('PokecaMobile.port.getSessionId()')
     await page.locator('#demo-open').tap();await page.locator('#reference-match-choices button').nth(deck).tap();await page.locator('#confirm-ok').tap();await page.locator('#opening-start').wait_for()
     assert await page.locator('[data-opening-card]').count()==7;assert await page.locator('#opening-start').is_disabled()
     active_ids=await page.locator('[data-opening-active]:enabled').evaluate_all('els=>els.map(e=>e.dataset.openingActive)')
     assert len(active_ids)>=2
     active=active_ids[0];await page.locator(f'[data-opening-active="{active}"]').tap()
     if len(active_ids)>1:
      bench=active_ids[1];await page.locator(f'[data-opening-bench="{bench}"]').tap();await page.locator(f'[data-opening-bench="{bench}"]').tap();await page.locator(f'[data-opening-active="{bench}"]').tap();active=bench
     assert await page.evaluate('PokecaMobile.port.getSnapshot()')==before
     await page.screenshot(path=str(ROOT/f'artifacts/control-003-opening-{deck}.png'),full_page=True)
     await page.locator('#opening-start').tap();await page.wait_for_function('id=>PokecaMobile.port.getSessionId()!==id',arg=previous_session)
     await page.wait_for_function('id=>PokecaMobile.port.getSnapshot().players[0].active.id===id',arg=active)
     state=await page.evaluate('PokecaMobile.port.getSnapshot()');assert len(state['players'][0]['bench'])==0
     # Resolve only opening choices through real UI so no AI turn remains in flight.
     for _ in range(10):
      choice=await page.evaluate('PokecaMobile.port.getSnapshot().pendingReferenceChoice')
      if not choice:break
      if choice['playerId']=='you':await page.locator('#reference-choice button').first.tap()
      else:await page.wait_for_function('PokecaMobile.port.getSnapshot().pendingReferenceChoice?.playerId!=="ai"')
    await page.wait_for_function('document.getElementById("save-status").textContent==="自動保存済"')
    final=await page.evaluate('PokecaMobile.port.getSnapshot()');await context.close()
    context,page=await launch(offline=True);await ready(page,BUILD)
    assert await page.evaluate('PokecaMobile.port.getSnapshot()')==final
    assert await page.evaluate('async id=>(await PokecaStorage.createIndexedMatchStore(localStorage).read(id)).game',session)==saved
    assert await page.evaluate('localStorage.getItem("control003-preserve")')=='yes';await context.close()
    assert not errors,errors
    report={'oldCommit':OLD,'oldBuild':'246','previousCommit':PREVIOUS,'oldSameURLUpdateRejected':outcome,'newBuild':BUILD,'publicSource':PUBLIC,'persistentProfile':True,'serviceWorkersBlocked':False,'onlineRecoveryColdStartUpdated':True,'oldOfflineRestartExact':True,'newOfflineRestartExact':True,'existingMatchPreserved':True,'otherStoragePreserved':True,'bothDecksManualOpening':True,'cacheHashesExact':True,'cacheName':status['cacheName'],'javascriptErrors':errors,'physicalAndroidVerified':False,'requests':requests}
    (ROOT/'artifacts/control-003-update-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k!='requests'},ensure_ascii=False),flush=True)
 finally:server.shutdown()
if __name__=='__main__':asyncio.run(main())
