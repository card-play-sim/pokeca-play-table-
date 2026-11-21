"""New effect families via public DOM, persistent game state and offline restart."""
import asyncio,hashlib,json,os,subprocess,traceback
from pathlib import Path
from playwright.async_api import async_playwright
from test_fixed_deck_browser_images import session_ca_args
from browser_opening import finish_opening
ROOT=Path(__file__).resolve().parents[1]
PREFIX=ROOT/os.environ.get('POKECA_INTAKE_PREFIX','reports/official-effect-continuation')
async def select_effect_targets(page, option):
 action=option['action']
 selections=action.get('selections',{})
 for request in option.get('requests',[]):
  key=request['key']
  kind=request['kind']
  if request['min']==request['max']==0 and not (request.get('inspection') or {}).get('cards'):
   continue
  if kind=='COUNTERS':
   allocation=selections[key]
   for index,candidate in enumerate(request['candidates']):
    ident=candidate.get('id') or candidate.get('instanceId')
    row=page.locator('#reference-counter-choices .counter-target').nth(index)
    for _ in range(allocation.get(ident,0)):
     await row.get_by_role('button',name='＋',exact=True).tap()
   await page.get_by_role('button',name='この配分で決定',exact=True).tap()
   continue
  if kind=='COUNT':
   ids=[str(selections[key])]
  elif kind=='POKEMON':
   ids=action.get('targetIds',[])
  else:
   ids=selections.get(key,[])
  for ident in ids:
   await page.locator(f'#selection-cards [data-selection-id="{ident}"]').tap(timeout=12000)
  await page.locator('#selection-confirm').tap()

async def main():
 release_base=os.environ.get("POKECA_INTAKE_RELEASE_BASE")
 subprocess.check_call(['node','scripts/build-intake-verification-fixtures.cjs'],cwd=ROOT);fixtures=json.loads((PREFIX/'browser-fixtures.json').read_text());cases=[];errors=[]
 if release_base:
  delivery=json.loads((ROOT/'test-results/published-pwa-verification.json').read_text())
  assert delivery['success'] and delivery['base']==os.environ['POKECA_TEST_URL']
  commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
  receipt={'commit':commit,'baseCommit':release_base,'release':delivery['release'],
           'publicUrl':delivery['base'],'results':cases,'success':False,'physicalAndroidVerified':False,
           'expectedSlots':[{'print':f['r']['officialCardId'],'effectKind':f['kind'],
                             'effectIndex':f['e'].get('effectIndex',0)} for f in fixtures]}
  receipt_path=ROOT/'artifacts/published-intake-battles.json'
  receipt_path.parent.mkdir(exist_ok=True)
  def save_receipt():
   temporary=receipt_path.with_suffix('.tmp')
   temporary.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
   temporary.replace(receipt_path)
  save_receipt()
  if not fixtures:
   receipt['success']=True
   save_receipt()
   return
 async with async_playwright() as pw:
  b=await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE'),args=session_ca_args());device=dict(pw.devices['Pixel 5']);device.pop('default_browser_type',None);c=await b.new_context(**device,service_workers='allow');page=await c.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  url=os.environ.get('POKECA_TEST_URL','http://127.0.0.1:8765/')+'#battle'
  if release_base:
   async with page.expect_response(lambda response: response.request.resource_type=='script'
                                   and '/ui/engine.bundle.js?' in response.url) as bundle:
    await page.goto(url,wait_until='domcontentloaded')
   response=await bundle.value
   asset=hashlib.sha256(await response.body()).hexdigest()
   assert response.ok and any(row['path'].split('?')[0].removeprefix('./')=='ui/engine.bundle.js'
                              and row['match'] and row['remoteSha256']==asset for row in delivery['results'])
  else:
   await page.goto(url,wait_until='domcontentloaded')
  async def ready():await page.wait_for_function('window.PokecaUpdateStatus?.state==="ready"&&window.PokecaImageRegistryStatus?.state==="ready"&&document.getElementById("save-status").textContent==="自動保存済"',timeout=60000)
  async def snap():return await page.evaluate('PokecaMobile.port.getSnapshot()')
  await ready()
  for f in fixtures:
   r=f['r'];ident=f['sourceId'];m=f['e']['plan']['mechanic'];print('START',r['officialCardId'],m,flush=True)
   await page.evaluate('g=>{const r=PokecaMobile.port.loadGame(g);if(!r.ok)throw Error(JSON.stringify(r));}',f['game'])
   await page.locator('#menu-open').tap();toggle=page.get_by_role('button',name='AI自動応答：オン（タップでオフ）',exact=True)
   if await toggle.count():await toggle.tap()
   else:await page.locator('#sheet-close').tap()
   before=await snap();option=f['option'];assert option
   ai=await page.evaluate('Pokeca.getLegalActions(PokecaMobile.port.getSnapshot(),"you").actions');assert option['action'] in ai
   if f['kind'] in ('attack','ability'):
    await page.locator(f'#self-active [data-card-id="{ident}"]').tap()
    if f["kind"]=="attack":await page.locator("#pokemon-actions").get_by_role("button",name="ワザを使う",exact=True).tap();await page.locator(f'#attack-actions [data-action-kind="attack"][data-attack-index="{option["action"]["attackIndex"]}"]').tap()
    else:await page.locator('#pokemon-actions [data-action-kind="ability"]').filter(has_text=option['label']).tap()
   elif r['category']=='stadium':
    await page.locator('#stadium').tap();await page.get_by_role('button',name=r['name']+'を置く',exact=True).tap()
   else:await page.locator(f'#self-hand [data-card-id="{ident}"]').tap()
   if r['category']=='tool':await page.locator(f'#self-active [data-card-id="{option["action"]["targetInstanceId"]}"]').tap()
   elif r['category']=='energy':
    to_active=option['action']['target']=='active'
    container='#self-active' if to_active else '#self-bench'
    index=0 if to_active else option['action']['target']
    await page.locator(container+' [data-card-id]').nth(index).tap()
   elif r['category']!='stadium' and f['kind'] not in ('attack','ability'):
    await page.locator(f'#hand-actions [data-action-type="{option["action"]["type"]}"]').tap()
    await select_effect_targets(page,option)
   if f['kind'] in ('attack','ability'):
    await select_effect_targets(page,option)
   if f['kind'] in ('attack','ability'):await page.locator('#confirm-ok').tap()
   elif await page.locator('#confirm-ok').is_visible():await page.locator('#confirm-ok').tap()
   await page.wait_for_function('n=>PokecaMobile.port.getSnapshot().history.length>n',arg=len(before.get('history',[])))
   after=await snap();assert after!=before
   events=after['history'][len(before.get('history',[])):]
   if f['kind']=='attack':
    assert any(event['type']=='attack' and event.get('details',{}).get('effectId')==f['e']['effectId']
               and event['details'].get('referenceOfficialCardId')==r['officialCardId'] for event in events)
   if m in ('VANILLA_DAMAGE','COIN_BONUS_DAMAGE'):
    assert f['printedDamageEvents']
    assert all(event in events for event in f['printedDamageEvents'])
   if m=='RECOIL_DAMAGE':assert after['players'][0]['active']['damage']==before['players'][0]['active']['damage']+f['e']['plan']['amount']
   if m=='HEAL_SELF_ATTACK':assert after['players'][0]['active']['damage']==max(0,before['players'][0]['active']['damage']-f['e']['plan']['amount'])
   if m=='RECOVER_TYPED_DISCARD':assert all(any(c0['id']==i for c0 in after['players'][0]['hand']) for i in option['action']['selections']['cards'])
   if m=='FIXED_COIN_HITS':assert len([e for e in after['history'][len(before.get('history',[])):] if e.get('details',{}).get('command')=='COIN_FLIP' and isinstance(e.get('details',{}).get('heads'),bool)])==f['e']['plan']['flips']
   for _ in range(20):
    after=await snap()
    pending=after.get('pendingPrizeSelection') or after.get('pendingReferenceChoice') or {}
    actor=pending.get('playerId',after['turnPlayer'])
    if after['status']=='finished' or actor=='you':break
    result=await page.evaluate('async()=>{const r=await Pokeca.runAITurn(PokecaMobile.port,"ai",{maxActions:80});return {ok:r.ok,stage:r.stage};}')
    assert result['ok'],result
   else:raise AssertionError('AI choices did not settle before checking restoration')
   after=await snap()
   await page.wait_for_function('document.getElementById("save-status").textContent==="自動保存済"');await c.set_offline(True);await page.reload();await ready();assert await snap()==after;await c.set_offline(False)
   cases.append({'print':r['officialCardId'],'effectKind':f['kind'],'effectIndex':f['e'].get('effectIndex',0),'category':r['category'],'pattern':m,'commands':f['e']['plan']['commands'],'domExecuted':True,'aiParity':True,'offlineRestoreExact':True})
   if release_base:
    assert not errors,errors
    save_receipt()
  if release_base:
   receipt['success']=True
   save_receipt()
   return
  # Run the imported-deck match independently of any pending fixture choices.
  await c.close()
  c=await b.new_context(**device,service_workers='allow');page=await c.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto(os.environ.get('POKECA_TEST_URL','http://127.0.0.1:8765/')+'#battle',wait_until='domcontentloaded')
  await ready()
  await page.locator('#menu-open').tap();await page.get_by_role('button',name='公式証跡つき参照デッキJSONを開く',exact=True).tap();await page.locator('#reference-deck-import').set_input_files(str(PREFIX/'example-decks.json'))
  try:
   await page.locator('#reference-import-choices button').first.wait_for(timeout=15000)
  except Exception:
   raise AssertionError(f"Reference deck import failed: status={await page.locator('#reference-import-status').inner_text()} sheet={await page.locator('#sheet-content').inner_text()} errors={errors}")
  await page.evaluate('Math.random=()=>2/4294967296');await page.locator('#reference-import-choices button').first.tap();await page.locator('#confirm-ok').tap();await finish_opening(page)
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
  final=await snap();assert final['status']=='finished';new_ids={f['r']['officialCardId'] for f in fixtures};used=sorted({e.get('details',{}).get('sourceOfficialCardId') for e in final.get('history',[]) if e.get('details',{}).get('sourceOfficialCardId') in new_ids});assert used;match={'seed':2,'winner':final['winner'],'turn':final['turnNumber'],'finished':True,'executedNewPrints':used}
  await c.set_offline(True);await page.reload();await ready();assert await snap()==final;await c.set_offline(False)
  assert not errors,errors
  report={'url':page.url,'expandedAIMatch':match,'newPrints':len({f['r']['officialCardId'] for f in fixtures}),'newPatterns':len(set(f['e']['plan']['mechanic'] for f in fixtures)),'cases':cases,'javascriptErrors':errors,'physicalAndroidVerified':False};(ROOT/'artifacts').mkdir(exist_ok=True);(ROOT/('artifacts/'+os.environ.get('POKECA_INTAKE_ARTIFACT','control-013')+'-browser.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False));await b.close()
if __name__=='__main__':
 try:asyncio.run(main())
 except Exception:
  (ROOT/'artifacts').mkdir(exist_ok=True);(ROOT/'artifacts/control-013-browser-failure.json').write_text(json.dumps({'traceback':traceback.format_exc()},ensure_ascii=False));raise
