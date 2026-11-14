"""New effect families via public DOM, persistent game state and offline restart."""
import asyncio,json,os,subprocess,traceback
from pathlib import Path
from playwright.async_api import async_playwright
from test_fixed_deck_browser_images import session_ca_args
from browser_opening import finish_opening
ROOT=Path(__file__).resolve().parents[1]
PREPARE="""const fs=require('fs'),vm=require('vm'),c={window:{},console,performance,Math,setTimeout};vm.runInNewContext(fs.readFileSync('ui/engine.bundle.js','utf8'),c);const F=require('./tests/fixtures/control-009-scenarios.cjs')(c.window.Pokeca);console.log(JSON.stringify(F.records.map(r=>{const t=F.create(r.officialCardId);return {record:r,frame:t.frame,game:t.port.getSnapshot()};})));"""
async def main():
 fixtures=json.loads(subprocess.check_output(['node','-e',PREPARE],cwd=ROOT));cases=[];errors=[]
 async with async_playwright() as pw:
  b=await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE'),args=session_ca_args());device=dict(pw.devices['Pixel 5']);device.pop('default_browser_type',None);c=await b.new_context(**device,service_workers='allow');page=await c.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto(os.environ.get('POKECA_TEST_URL','http://127.0.0.1:8765/'),wait_until='domcontentloaded')
  async def ready():await page.wait_for_function('window.PokecaUpdateStatus?.state==="ready"&&window.PokecaImageRegistryStatus?.state==="ready"&&document.getElementById("save-status").textContent==="自動保存済"',timeout=60000)
  async def snap():return await page.evaluate('PokecaMobile.port.getSnapshot()')
  await ready()
  for f in fixtures:
   r=f['record'];ident=f['frame']['sourceId'];m=r['mainPlan']['mechanic'];print('START',r['officialCardId'],m,flush=True)
   await page.evaluate('g=>{const r=PokecaMobile.port.loadGame(g);if(!r.ok)throw Error(JSON.stringify(r));}',f['game'])
   await page.locator('#menu-open').tap();toggle=page.get_by_role('button',name='AI自動応答：オン（タップでオフ）',exact=True)
   if await toggle.count():await toggle.tap()
   else:await page.locator('#sheet-close').tap()
   before=await snap();option=await page.evaluate('id=>PokecaMobile.port.getHandOptions("you",id).find(o=>o.ok)',ident);assert option
   ai=await page.evaluate('Pokeca.getLegalActions(PokecaMobile.port.getSnapshot(),"you").actions');assert option['action'] in ai
   if r['category']=='stadium':
    await page.locator('#stadium').tap();await page.get_by_role('button',name=r['name']+'を置く',exact=True).tap()
   else:await page.locator(f'#self-hand [data-card-id="{ident}"]').tap()
   if r['category']=='tool':await page.locator(f'#self-active [data-card-id="{option["action"]["targetInstanceId"]}"]').tap()
   elif r['category']!='stadium':
    await page.locator(f'#hand-actions [data-action-type="{option["action"]["type"]}"]').tap()
    for req in option.get('requests',[]):
     for target in option['action'].get('selections',{}).get(req['key'],[]):await page.locator(f'[data-selection-id="{target}"]').tap()
     await page.locator('#selection-confirm').tap()
   await page.wait_for_function('!document.getElementById("sheet").open');await page.wait_for_function('id=>!PokecaMobile.port.getSnapshot().players[0].hand.some(c=>c.id===id)',arg=ident);after=await snap();p=after['players'][0];old=before['players'][0]
   if m=='DISCARD_HAND_DRAW':assert len(p['hand'])==7 and len(p['deck'])==len(old['deck'])-7 and all(any(d['id']==c0['id'] for d in p['discard']) for c0 in old['hand'])
   if m=='RECOVER_BASIC_ENERGY':assert all(any(c0['id']==i for c0 in p['hand']) for i in option['action']['selections']['cards']) and not p['normalEnergyAttached']
   if m=='CONDITIONAL_MAX_HP':assert p['active']['hp']==old['active']['hp']+50 and p['active']['damage']==old['active']['damage']
   if m=='SUPPRESS_RULE_ABILITIES':
    assert after['stadium']['id']==ident
    await page.locator(f'#self-active [data-card-id="{p["active"]["id"]}"]').tap();buttons=page.locator('#pokemon-actions [data-action-kind="ability"]');assert await buttons.count()>0
    for i in range(await buttons.count()):assert await buttons.nth(i).is_disabled()
    await page.locator('#sheet-close').tap();assert await snap()==after
   await page.wait_for_function('document.getElementById("save-status").textContent==="自動保存済"');await c.set_offline(True);await page.reload();await ready();assert await snap()==after;await c.set_offline(False)
   cases.append({'print':r['officialCardId'],'category':r['category'],'pattern':m,'commands':r['mainPlan']['commands'],'domExecuted':True,'aiParity':True,'offlineRestoreExact':True})
  # Start the expanded decks through the real import/manual-opening UI, then use
  # the same canonical AI port for both players through victory, not fixture damage.
  await page.locator('#menu-open').tap();await page.get_by_role('button',name='公式証跡つき参照デッキJSONを開く',exact=True).tap();await page.locator('#reference-deck-import').set_input_files(str(ROOT/'data/effect-extensions/control-009-example-decks.json'))
  await page.locator('#reference-import-choices button').first.wait_for();await page.evaluate('Math.random=()=>2/4294967296');await page.locator('#reference-import-choices button').first.tap();await page.locator('#confirm-ok').tap();await finish_opening(page)
  await page.wait_for_function('!document.getElementById("sheet").open||document.getElementById("reference-choice")')
  for _ in range(10):
   pending=(await snap()).get('pendingReferenceChoice')
   if not pending:break
   if pending['playerId']=='you':await page.locator('#reference-choice button').first.tap()
   else:await page.wait_for_function('PokecaMobile.port.getSnapshot().pendingReferenceChoice?.playerId!=="ai"')
  await page.locator('#menu-open').tap();toggle=page.get_by_role('button',name='AI自動応答：オン（タップでオフ）',exact=True)
  if await toggle.count():await toggle.tap()
  else:await page.locator('#sheet-close').tap()
  for turn in range(120):
   state=await snap()
   if state['status']=='finished':break
   actor=(state.get('pendingPrizeSelection') or state.get('pendingReferenceChoice') or {}).get('playerId',state['turnPlayer'])
   result=await page.evaluate('async actor=>{const r=await Pokeca.runAITurn(PokecaMobile.port,actor,{maxActions:80});return {ok:r.ok,actions:r.actions,stage:r.stage};}',actor);assert result['ok'],result
   await page.wait_for_function('document.getElementById("save-status").textContent==="自動保存済"');print('EXPANDED MATCH',turn,actor,result,flush=True)
  final=await snap();assert final['status']=='finished';new_ids={f['record']['officialCardId'] for f in fixtures};used=sorted({e.get('details',{}).get('sourceOfficialCardId') for e in final.get('history',[]) if e.get('details',{}).get('sourceOfficialCardId') in new_ids});assert used;match={'seed':2,'winner':final['winner'],'turn':final['turnNumber'],'finished':True,'executedNewPrints':used}
  await c.set_offline(True);await page.reload();await ready();assert await snap()==final;await c.set_offline(False)
  assert not errors,errors
  report={'url':page.url,'expandedAIMatch':match,'newPrints':len(fixtures),'newPatterns':len(set(f['record']['mainPlan']['mechanic'] for f in fixtures)),'cases':cases,'javascriptErrors':errors,'physicalAndroidVerified':False};(ROOT/'artifacts').mkdir(exist_ok=True);(ROOT/'artifacts/control-009-browser.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False));await b.close()
if __name__=='__main__':
 try:asyncio.run(main())
 except Exception:
  (ROOT/'artifacts').mkdir(exist_ok=True);(ROOT/'artifacts/control-009-browser-failure.json').write_text(json.dumps({'traceback':traceback.format_exc()},ensure_ascii=False));raise
