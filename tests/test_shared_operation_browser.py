"""Verified source origins through hand/field DOM, with exact offline restoration."""
import asyncio,json,os,traceback
from pathlib import Path
from playwright.async_api import async_playwright
from test_fixed_deck_browser_images import session_ca_args
ROOT=Path(__file__).resolve().parents[1]
async def main():
 cases=[];errors=[]
 async with async_playwright() as pw:
  b=await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE'),args=session_ca_args());device=dict(pw.devices['Pixel 5']);device.pop('default_browser_type',None)
  c=await b.new_context(**device,service_workers='allow');page=await c.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto(os.environ.get('POKECA_TEST_URL','http://127.0.0.1:8765/'),wait_until='domcontentloaded')
  async def ready():await page.wait_for_function('window.PokecaUpdateStatus?.state==="ready"&&window.PokecaImageRegistryStatus?.state==="ready"&&document.getElementById("save-status").textContent==="自動保存済"',timeout=60000)
  await ready()
  async def snap():return await page.evaluate('PokecaMobile.port.getSnapshot()')
  for mechanic,position,variant in [('EXCITE_DIVE','hand','default'),('EXCITE_DIVE','hand','bench-mega'),('EXCITE_DIVE','hand','no-mega'),('EXCITE_DIVE','hand','full-bench'),('RECON','active','default'),('REVERSAL_DRAW','bench','alternate'),('DASH','active','alternate'),('DASH','bench','default')]:
   await page.evaluate('window.OperationScenarios='+ (ROOT/'tests/fixtures/control-005-scenarios.js').read_text())
   frame=await page.evaluate('''async ([mechanic,position,variant])=>{
    const S=OperationScenarios,manifest=await(await fetch('data/fixed-test-decks.json')).json();let row=S.inventory(Pokeca,manifest).find(r=>r.kind==='ability'&&r.plan?.mechanic===mechanic);
    if(variant==='alternate'){
     const r=Pokeca.getReferenceEffectCatalog().records.find(r=>r.deckName===row.cardName&&r.officialCardId!==row.officialCardId&&r.abilities.some(a=>a.plan?.mechanic===mechanic));if(!r)throw Error('ALTERNATE_SOURCE_REQUIRED');
     const a=r.abilities.find(a=>a.plan?.mechanic===mechanic);row={...row,officialCardId:r.officialCardId,effectId:a.effectId,plan:a.plan,text:a.text,effectName:a.name};for(const d of manifest.decks)for(const card of d.cards)if(card.name===r.deckName)card.referenceOfficialCardId=r.officialCardId;
    }
    const f=S.create(Pokeca,manifest,row),g=f.game,p=g.players[0];
    if(position==='bench'){const source=p.active;p.active=p.bench.shift();p.bench.push(source);}
    if(mechanic==='EXCITE_DIVE'&&variant==='bench-mega'){const source=p.active;p.active=p.bench.shift();p.bench.push(source);}
    if(variant==='no-mega')for(const mon of [p.active,...p.bench].filter(c=>Pokeca.getReferenceEffectRecord(c).facts.prizeCount===3)){if(p.active===mon)p.active=p.bench.shift();else p.bench.splice(p.bench.indexOf(mon),1);p.hand.push(mon);}
    if(variant==='full-bench')while(p.bench.length<5){const i=p.deck.findIndex(c=>c.kind==='pokemon'),mon=p.deck.splice(i,1)[0];Object.assign(mon,{cardId:mon.id,damage:0,enteredTurn:0,energies:[],energyCards:[],tools:[]});p.bench.push(mon);}
    const r=PokecaMobile.port.loadGame(g);if(!r.ok)throw Error(JSON.stringify(r));window.operationFrame=f;return f;
   }''',[mechanic,position,variant])
   await page.locator('#menu-open').tap();toggle=page.get_by_role('button',name='AI自動応答：オン（タップでオフ）',exact=True)
   if await toggle.count():await toggle.tap()
   else:await page.locator('#sheet-close').tap()
   before=await snap();ident=frame['sourceId'];option=await page.evaluate('OperationScenarios.option(Pokeca,PokecaMobile.port,operationFrame)')
   if position=='hand':
    await page.locator(f'#self-hand [data-card-id="{ident}"]').tap();target=page.locator('#hand-actions [data-action-type="use_ability"]')
   else:
    await page.locator(f'#self-{position} [data-card-id="{ident}"]').tap();target=page.locator('#pokemon-actions [data-action-kind="ability"]')
   if variant in ('no-mega','full-bench'):
    assert await target.is_disabled();assert ('無色タイプ' if variant=='no-mega' else '空きがありません') in await page.locator('#hand-actions').inner_text();assert await snap()==before;await page.locator('#sheet-close').tap();cases.append({'mechanic':mechanic,'condition':variant,'illegalDisabled':True,'reasonVisible':True,'stateUnchanged':True});continue
   if mechanic=='DASH' and position=='bench':
    assert await target.is_disabled();assert await snap()==before;await page.locator('#sheet-close').tap();cases.append({'mechanic':mechanic,'position':position,'illegalDisabled':True,'stateUnchanged':True});continue
   assert await target.is_enabled();await target.tap()
   for req in option.get('requests',[]):
    for ident2 in option['action'].get('selections',{}).get(req['key'],[]):await page.locator(f'[data-selection-id="{ident2}"]').tap()
    await page.locator('#selection-confirm').tap()
   await page.locator('#confirm-ok').tap();await page.wait_for_function('!document.getElementById("sheet").open&&!document.getElementById("confirm-dialog").open')
   after=await snap();assert after!=before
   checks=await page.evaluate('([before,action])=>OperationScenarios.verify(Pokeca,operationFrame,before,PokecaMobile.port.getSnapshot(),action)',[before,option['action']])
   assert await page.evaluate('OperationScenarios.identities(PokecaMobile.port.getSnapshot()).length')==120
   await page.wait_for_function('document.getElementById("save-status").textContent==="自動保存済"');await c.set_offline(True);await page.reload();await ready();assert await snap()==after;await c.set_offline(False)
   cases.append({'mechanic':mechanic,'position':position,'variant':variant,'sourcePrint':frame['row']['officialCardId'],'domExecuted':True,'offlineRestoreExact':True,'checks':checks})
  assert not errors,errors
  report={'url':page.url,'cases':cases,'javascriptErrors':errors,'physicalAndroidVerified':False};(ROOT/'artifacts').mkdir(exist_ok=True);(ROOT/'artifacts/shared-operation-browser.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False));await b.close()
if __name__=='__main__':
 try:asyncio.run(main())
 except Exception:
  (ROOT/'artifacts').mkdir(exist_ok=True);(ROOT/'artifacts/shared-operation-failure.json').write_text(json.dumps({'traceback':traceback.format_exc()},ensure_ascii=False));raise
