"""Controlled fixed-120 reference abilities through public DOM, not test dispatch."""
import asyncio,json,os,traceback
from pathlib import Path
from playwright.async_api import async_playwright
from test_fixed_deck_browser_images import session_ca_args
ROOT=Path(__file__).resolve().parents[1]
SCENARIOS=(ROOT/'tests/fixtures/control-005-scenarios.js').read_text()
async def main():
 results=[];errors=[]
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE'),args=session_ca_args());device=dict(p.devices['Pixel 5']);device.pop('default_browser_type',None)
  context=await browser.new_context(**device,service_workers='allow');page=await context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto(os.environ.get('POKECA_TEST_URL','http://127.0.0.1:8765/'),wait_until='domcontentloaded')
  async def ready():await page.wait_for_function('window.PokecaUpdateStatus?.state==="ready"&&window.PokecaImageRegistryStatus?.state==="ready"&&document.getElementById("save-status").textContent==="自動保存済"',timeout=60000)
  await ready();await page.reload();await ready()
  async def install():await page.evaluate('window.Control006='+SCENARIOS)
  await install()
  rows=await page.evaluate("async()=>Control006.inventory(Pokeca,await(await fetch('data/fixed-test-decks.json')).json())")
  async def snapshot():return await page.evaluate('PokecaMobile.port.getSnapshot()')
  async def restore(expected,offline=False):
   await page.wait_for_function('document.getElementById("save-status").textContent==="自動保存済"');
   if offline:await context.set_offline(True)
   await page.reload();await ready();assert await snapshot()==expected
   if offline:await context.set_offline(False)
   await install()
  async def fixture(row):
   frame=await page.evaluate('''async row=>{const f=Control006.create(Pokeca,await(await fetch('data/fixed-test-decks.json')).json(),row);const r=PokecaMobile.port.loadGame(f.game);if(!r.ok)throw Error(JSON.stringify(r));window.controlFrame=f;return f;}''',row)
   await page.locator('#menu-open').tap();switch=page.get_by_role('button',name='AI自動応答：オン（タップでオフ）',exact=True)
   if await switch.count():await switch.tap()
   else:await page.locator('#sheet-close').tap()
   return frame
  async def choose(option,action=None):
   action=action or option['action']
   for req in option.get('requests',[]):
    if req['kind']=='COUNTERS':
     for _ in range(6):await page.locator('#reference-counter-choices button').nth(1).tap()
     await page.get_by_role('button',name='この配分で決定',exact=True).tap();continue
    await page.locator('#selection-cards').wait_for()
    if req['kind']=='COUNT':
     assert await page.locator('[data-selection-id="0"]').count()==0
     ids=[str(action['selections'][req['key']])]
    elif req['kind']=='POKEMON':ids=action['targetIds']
    else:ids=action.get('selections',{}).get(req['key'],[])
    for ident in ids:await page.locator(f'#selection-cards [data-selection-id="{ident}"]').tap()
    await page.locator('#selection-confirm').tap()
   if option.get('kind') in ('ability','attack'):await page.locator('#confirm-ok').wait_for(state='visible');await page.locator('#confirm-ok').tap()
   await page.wait_for_function('!document.getElementById("confirm-dialog").open&&(!document.getElementById("sheet").open||document.getElementById("reference-choice"))')
   if (await snapshot()).get('pendingReferenceChoice',{}).get('playerId')=='you':
    await page.locator('#reference-choice button').first.tap();await page.wait_for_function('!document.getElementById("sheet").open')
  for row in [r for r in rows if r['kind']=='ability']:
   print('START ability',row['cardName'],flush=True);frame=await fixture(row);m=row['plan']['mechanic'];ident=frame['sourceId']
   if m=='MEOWTH_ENTRY':
    await page.locator(f'#self-hand [data-card-id="{ident}"]').tap();await page.locator('#self-bench .bench-slot.empty').first.tap();await page.wait_for_function('id=>PokecaMobile.port.getSnapshot().players[0].bench.some(c=>c.id===id)',arg=ident)
   option=await page.evaluate('Control006.option(Pokeca,PokecaMobile.port,controlFrame)');before=await snapshot();assert option.get('ok',option.get('enabled'))
   if m in ('SKYLINE','FAIRY_ZONE'):
    await page.locator(f'#self-hand [data-card-id="{ident}"]').tap();await page.locator('#self-bench .bench-slot.empty').first.tap()
   else:
    await page.locator('#ability-button').tap();await page.locator('#quick-actions').get_by_role('button',name=('['+('手札' if m=='EXCITE_DIVE' else ('ベンチ'+str(next(i for i,c in enumerate(before['players'][0]['bench']) if c['id']==ident)+1) if m=='MEOWTH_ENTRY' else 'バトル場'))+'] ')+row['cardName']+' · '+option['label'],exact=True).tap();await choose(option)
   await page.wait_for_function('()=>PokecaMobile.port.getSnapshot().history.length>0');after=await snapshot()
   checks=await page.evaluate('([before,action])=>Control006.verify(Pokeca,controlFrame,before,PokecaMobile.port.getSnapshot(),action)',[before,option['action']])
   if m in ('SKYLINE','FAIRY_ZONE'):
    await page.locator(f'#self-bench [data-card-id="{ident}"]').tap();assert '現在有効' in await page.locator('#sheet-content').inner_text();await page.locator('#sheet-close').tap()
   assert await page.locator(f'[data-card-id="{ident}"] [data-legal-mark="特性"]').count()==0
   await restore(after,offline=m in ('EXCITE_DIVE','RECON'));results.append({'offlineAfterAbility':m in ('EXCITE_DIVE','RECON'),'effectId':row['effectId'],'name':row['cardName'],'referencePrint':row['officialCardId'],'status':'PASS','domQuickAbility':m not in ('SKYLINE','FAIRY_ZONE'),'passiveDetails':m in ('SKYLINE','FAIRY_ZONE'),'checks':checks,'saveReloadExact':True})
  for mechanic in ('ENERGY_SWITCH','AKAMATSU','PHANTOM'):
   row=next(r for r in rows if r['plan']['mechanic']==mechanic);print('START shared choice',mechanic,flush=True);frame=await fixture(row);option=await page.evaluate('Control006.option(Pokeca,PokecaMobile.port,controlFrame)');before=await snapshot();ident=frame['sourceId']
   if mechanic=='PHANTOM':await page.locator('#attack-button').tap();await page.locator('#quick-actions').get_by_role('button',name=row['cardName']+' · '+option['label'],exact=True).tap()
   else:await page.locator(f'#self-hand [data-card-id="{ident}"]').tap();await page.locator('#hand-actions button:enabled').first.tap()
   if mechanic=='ENERGY_SWITCH':
    req=option['requests'][0];await page.locator(f'[data-selection-id="{option["action"]["selections"]["energy"][0]}"]').tap();await page.locator('#selection-confirm').tap();await page.locator('#selection-cards').wait_for();assert await page.locator(f'[data-selection-id="{frame["activeId"]}"]').count()==0
    target=option['action']['selections']['attachTo'][0];await page.locator(f'[data-selection-id="{target}"]').tap();await page.locator('#selection-confirm').tap();await page.wait_for_function('!document.getElementById("sheet").open')
   else:await choose(option)
   await page.wait_for_function('()=>PokecaMobile.port.getSnapshot().history.length>0');after=await snapshot();checks=await page.evaluate('([before,action])=>Control006.verify(Pokeca,controlFrame,before,PokecaMobile.port.getSnapshot(),action)',[before,option['action']]);
   if mechanic!='PHANTOM':await restore(after)
   results.append({'effectId':row['effectId'],'name':row['cardName'],'status':'PASS','domTargets':True,'checks':checks,'saveReloadExact':mechanic!='PHANTOM'})
  for count in (0,1):
   row=next(r for r in rows if r['plan']['mechanic']=='AKAMATSU');frame=await fixture(row);before=await snapshot();option=await page.evaluate('Control006.option(Pokeca,PokecaMobile.port,controlFrame)');ident=frame['sourceId'];chosen=option['action']['selections']['cards'][:count]
   await page.locator(f'#self-hand [data-card-id="{ident}"]').tap();await page.locator('#hand-actions button:enabled').first.tap()
   for cid in chosen:await page.locator(f'[data-selection-id="{cid}"]').tap()
   await page.locator('#selection-confirm').tap()
   if count:await page.locator(f'[data-selection-id="{chosen[0]}"]').tap();await page.locator('#selection-confirm').tap()
   await page.wait_for_function('id=>PokecaMobile.port.getSnapshot().players[0].discard.some(c=>c.id===id)',arg=ident);after=await snapshot();p=after['players'][0];bp=before['players'][0]
   assert len(p['hand'])==len(bp['hand'])-1+count;assert len(p['deck'])==len(bp['deck'])-count;assert p['active']['energyCards']==bp['active']['energyCards'];assert p['turnLimits']['supporterUsed']
   assert await page.evaluate('Control006.identities(PokecaMobile.port.getSnapshot()).length')==120
   await restore(after);results.append({'effectId':row['effectId'],'status':'PASS','optionalSearchCount':count,'zeroCardinalityStepsSkipped':True,'saveReloadExact':True})
  assert not errors,errors
  report={'scope':'controlled-reference-effects-not-adopted-prints','url':page.url,'physicalAndroidVerified':False,'cases':results,'javascriptErrors':errors};(ROOT/'artifacts/control-006-browser-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False),flush=True);await browser.close()
if __name__=='__main__':
 (ROOT/'artifacts').mkdir(exist_ok=True)
 try:asyncio.run(main())
 except Exception:
  (ROOT/'artifacts/control-006-browser-failure.json').write_text(json.dumps({'status':'FAILED','traceback':traceback.format_exc()},indent=2)+'\n');raise
