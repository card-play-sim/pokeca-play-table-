"""New effect families via public DOM, persistent game state and offline restart."""
import asyncio,json,os,re,subprocess,traceback
from pathlib import Path
from playwright.async_api import async_playwright
from test_fixed_deck_browser_images import session_ca_args
from browser_opening import finish_opening
ROOT=Path(__file__).resolve().parents[1]
PREFIX=ROOT/os.environ.get('POKECA_INTAKE_PREFIX','reports/official-effect-continuation')
async def main():
 subprocess.check_call(['node','scripts/build-intake-verification-fixtures.cjs'],cwd=ROOT);fixtures=json.loads((PREFIX/'browser-fixtures.json').read_text());cases=[];errors=[]
 async with async_playwright() as pw:
  b=await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE'),args=session_ca_args());device=dict(pw.devices['Pixel 5']);device.pop('default_browser_type',None);c=await b.new_context(**device,service_workers='allow');page=await c.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto(os.environ.get('POKECA_TEST_URL','http://127.0.0.1:8765/'),wait_until='domcontentloaded')
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
    await page.locator(f'#self-active [data-card-id="{ident}"]').tap();await page.get_by_role('button',name=re.compile(('^ワザ · ' if f['kind']=='attack' else '^特性 · ')+re.escape(f['e']['name'])+r'(?:\s|$)')).first.tap()
   elif r['category']=='stadium':
    await page.locator('#stadium').tap();await page.get_by_role('button',name=r['name']+'を置く',exact=True).tap()
   else:await page.locator(f'#self-hand [data-card-id="{ident}"]').tap()
   if r['category']=='energy':await page.locator(f'#self-active [data-card-id="{before["players"][0]["active"]["id"]}"]').tap()
   elif r['category']=='tool':await page.locator(f'#self-active [data-card-id="{option["action"]["targetInstanceId"]}"]').tap()
   elif r['category']!='stadium' and f['kind'] not in ('attack','ability'):
    await page.locator(f'#hand-actions [data-action-type="{option["action"]["type"]}"]').tap()
    for req in option.get('requests',[]):
     for target in option['action'].get('selections',{}).get(req['key'],[]):await page.locator(f'[data-selection-id="{target}"]').tap()
     await page.locator('#selection-confirm').tap()
   if f['kind'] in ('attack','ability'):
    for req in option.get('requests',[]):
     for target in option['action'].get('selections',{}).get(req['key'],option['action'].get('targetIds',[])):await page.locator(f'[data-selection-id="{target}"]').tap()
     await page.locator('#selection-confirm').tap()
   if f['kind'] in ('attack','ability'):await page.locator('#confirm-ok').tap()
   elif await page.locator('#confirm-ok').is_visible():await page.locator('#confirm-ok').tap()
   await page.wait_for_function('n=>PokecaMobile.port.getSnapshot().history.length>n',arg=len(before.get('history',[])))
   after=await snap();assert after!=before
   if r['category']=='energy':
    assert any(c0['id']==ident for c0 in after['players'][0]['active']['energyCards'])
    if m=='CONDITIONAL_EVOLVED_ENERGY':assert len(after['players'][0]['active']['energies'])==f['e']['plan']['bonusUnits']
   if m=='ABILITY_ATTACH_SELF_DRAW':assert len(after['players'][0]['active']['energyCards'])==len(before['players'][0]['active']['energyCards'])+1 and after['players'][0]['normalEnergyAttached']==before['players'][0]['normalEnergyAttached']
   if m=='ATTACK_BENCH_BASICS':assert all(any(c0['id']==id0 for c0 in after['players'][0]['bench']) for id0 in option['action']['selections']['cards'])
   if m=='ATTACK_DISCARD_DECK_TOP':assert all(any(c0['id']==d['id'] for c0 in after['players'][1]['discard']) for d in before['players'][1]['deck'][:f['e']['plan']['amount']])
   if m=='RECOIL_DAMAGE':assert after['players'][0]['active']['damage']==before['players'][0]['active']['damage']+f['e']['plan']['amount']
   if m=='HEAL_SELF_ATTACK':assert after['players'][0]['active']['damage']==max(0,before['players'][0]['active']['damage']-f['e']['plan']['amount'])
   if m=='RECOVER_TYPED_DISCARD':assert all(any(c0['id']==i for c0 in after['players'][0]['hand']) for i in option['action']['selections']['cards'])
   if m=='FIXED_COIN_HITS':assert len([e for e in after['history'][len(before.get('history',[])):] if e.get('details',{}).get('command')=='COIN_FLIP' and isinstance(e.get('details',{}).get('heads'),bool)])==f['e']['plan']['flips']
   for _ in range(20):
    after=await snap()
    if after['status']=='finished':break
    choice=after.get('pendingReferenceChoice');prizes=after.get('pendingPrizeSelection')
    if prizes and prizes['playerId']=='you':
     player=after['players'][0];slots=[i for i,v in enumerate(player['prizeSlots']) if v][:prizes['count']]
     for slot in slots:await page.get_by_role('button',name='サイド '+str(slot+1),exact=True).tap()
     await page.get_by_role('button',name='選んだサイドを手札に加える',exact=True).tap();continue
    if choice and choice['playerId']=='you':await page.locator('#reference-choice button').first.tap();continue
    if not choice and not prizes and after['turnPlayer']=='you':break
    result=await page.evaluate('async()=>{const r=await Pokeca.runAITurn(PokecaMobile.port,"ai",{maxActions:80});return {ok:r.ok,stage:r.stage};}');assert result['ok'],result
   after=await snap()
   await page.wait_for_function('document.getElementById("save-status").textContent==="自動保存済"');await c.set_offline(True);await page.reload();await ready();restored=await snap()
   if restored!=after:
    (ROOT/'artifacts').mkdir(exist_ok=True);(ROOT/'artifacts/restore-diff.json').write_text(json.dumps({'print':r['officialCardId'],'before':after,'restored':restored},ensure_ascii=False))
   assert restored==after;await c.set_offline(False)
   cases.append({'print':r['officialCardId'],'category':r['category'],'pattern':m,'commands':f['e']['plan']['commands'],'domExecuted':True,'aiParity':True,'offlineRestoreExact':True})
  # Start the expanded decks through the real import/manual-opening UI, then use
  # the same canonical AI port for both players through victory, not fixture damage.
  await page.locator('#menu-open').tap();await page.get_by_role('button',name='公式証跡つき参照デッキJSONを開く',exact=True).tap();await page.locator('#reference-deck-import').set_input_files(str(PREFIX/'example-decks.json'))
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
  final=await snap();assert final['status']=='finished';new_ids={f['r']['officialCardId'] for f in fixtures};used=sorted({e.get('details',{}).get('sourceOfficialCardId') for e in final.get('history',[]) if e.get('details',{}).get('sourceOfficialCardId') in new_ids});assert used;match={'seed':2,'winner':final['winner'],'turn':final['turnNumber'],'finished':True,'executedNewPrints':used}
  await c.set_offline(True);await page.reload();await ready();assert await snap()==final;await c.set_offline(False)
  assert not errors,errors
  report={'url':page.url,'expandedAIMatch':match,'newPrints':len({f['r']['officialCardId'] for f in fixtures}),'newPatterns':len(set(f['e']['plan']['mechanic'] for f in fixtures)),'cases':cases,'javascriptErrors':errors,'physicalAndroidVerified':False};(ROOT/'artifacts').mkdir(exist_ok=True);(ROOT/('artifacts/'+os.environ.get('POKECA_INTAKE_ARTIFACT','control-013')+'-browser.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False));await b.close()
if __name__=='__main__':
 try:asyncio.run(main())
 except Exception:
  (ROOT/'artifacts').mkdir(exist_ok=True);(ROOT/'artifacts/control-013-browser-failure.json').write_text(json.dumps({'traceback':traceback.format_exc()},ensure_ascii=False));raise
