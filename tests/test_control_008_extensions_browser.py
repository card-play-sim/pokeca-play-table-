"""Additional official print intake -> manual opening -> shared effect DOM and AI match."""
import asyncio,json,os,traceback
from pathlib import Path
from playwright.async_api import async_playwright
from test_fixed_deck_browser_images import session_ca_args
from browser_opening import finish_opening
ROOT=Path(__file__).resolve().parents[1]
async def main():
 results=[];errors=[]
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE'),args=session_ca_args());d=dict(p.devices['Pixel 5']);d.pop('default_browser_type',None);c=await b.new_context(**d,service_workers='allow');page=await c.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto(os.environ.get('POKECA_TEST_URL','http://127.0.0.1:8765/'),wait_until='domcontentloaded')
  async def ready():await page.wait_for_function('window.PokecaUpdateStatus?.state==="ready"&&window.PokecaImageRegistryStatus?.state==="ready"&&document.getElementById("save-status").textContent==="自動保存済"',timeout=60000)
  await ready();await page.reload();await ready()
  # Reuse the exact Node fixture builder, without exposing an app-only debug mutation path.
  factory=(ROOT/'tests/fixtures/control-008-extension-manifest.cjs').read_text().replace("'use strict';",'').replace('module.exports=','').strip().rstrip(';')
  manifest=await page.evaluate('''async factory=>{const f=eval('('+factory+')');return f(await(await fetch('data/fixed-test-decks.json')).json());}''',factory)
  async def snap():return await page.evaluate('PokecaMobile.port.getSnapshot()')
  async def ai_off():
   await page.wait_for_function('!document.getElementById("sheet").open||document.getElementById("reference-choice")')
   for _ in range(10):
    pending=(await snap()).get('pendingReferenceChoice')
    if not pending:break
    if pending['playerId']=='you':await page.locator('#reference-choice button').first.tap()
    else:await page.wait_for_function('PokecaMobile.port.getSnapshot().pendingReferenceChoice?.playerId!=="ai"')
   await page.wait_for_function('!document.getElementById("sheet").open')
   await page.locator('#menu-open').tap();button=page.get_by_role('button',name='AI自動応答：オン（タップでオフ）',exact=True)
   if await button.count():await button.tap()
   else:await page.locator('#sheet-close').tap()
  async def importer(value):
   await page.locator('#menu-open').tap();await page.get_by_role('button',name='公式証跡つき参照デッキJSONを開く',exact=True).tap();await page.locator('#reference-deck-import').set_input_files({'name':'reference.json','mimeType':'application/json','buffer':json.dumps(value,ensure_ascii=False).encode()})
  before=await snap();invalid=json.loads(json.dumps(manifest));invalid['decks'][0]['cards'][-1]['referenceOfficialCardId']='44506';await importer(invalid);await page.wait_for_function('document.getElementById("reference-import-status").textContent.startsWith("開始できません")');assert await snap()==before;await page.locator('#sheet-close').tap()
  await importer(manifest);await page.locator('#reference-import-choices button').first.wait_for();await page.evaluate('Math.random=()=>2/4294967296');await page.locator('#reference-import-choices button').first.tap();await page.locator('#confirm-ok').tap();await finish_opening(page);await ai_off();opening=await snap();assert opening['referenceEffectValidation']['adoptedPrints']==0
  results.append({'case':'UI import and seven-card manual opening','unsupportedPrintRejected':True,'rejectionStateUnchanged':True,'formalAdoption':False})
  records=json.loads((ROOT/'data/effect-extensions/compiled.json').read_text())['records']
  for record in records:
   print('START extension',record['officialCardId'],record['name'],flush=True)
   frame=await page.evaluate('''([manifest,print])=>{let n=2;const firstDeck=manifest.decks.findIndex(d=>d.cards.some(c=>c.referenceOfficialCardId===print));let g=Pokeca.createReferenceValidationMatch(manifest,{firstDeck,rng:()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;}}).game;delete g.pendingReferenceChoice;g.turnNumber=8;g.turnPlayer='you';g.history=[];g.referenceRngState=0;const p=g.players[0],o=g.players[1],source=[...p.hand,...p.deck,...p.prizeCards].find(c=>c.validationReference.officialCardId===print);if(!p.hand.includes(source)){const zone=p.deck.includes(source)?p.deck:p.prizeCards;zone[zone.indexOf(source)]=p.hand[0];p.hand[0]=source;}if(!o.bench.length){const i=o.deck.findIndex(c=>c.kind==='pokemon'&&c.basic);o.bench.push({...o.deck.splice(i,1)[0],damage:0,energyCards:[],energies:[],tools:[],enteredTurn:0});}p.active.damage=50;p.turnLimits={supporterUsed:false,abilityUses:{}};const r=PokecaMobile.port.loadGame(g);if(!r.ok)throw Error(JSON.stringify(r));return {sourceId:source.id};}''',[manifest,record['officialCardId']])
   await ai_off();ident=frame['sourceId'];before=await snap();option=await page.evaluate('id=>PokecaMobile.port.getHandOptions("you",id).find(o=>o.ok)',ident);assert option
   await page.locator(f'#self-hand [data-card-id="{ident}"] img:not([hidden])').first.evaluate('e=>e.decode()')
   await page.locator(f'#self-hand [data-card-id="{ident}"]').tap();await page.locator('#hand-actions button:enabled').first.tap()
   for req in option.get('requests',[]):
    for cid in option['action']['selections'][req['key']]:await page.locator(f'#selection-cards [data-selection-id="{cid}"]').tap()
    await page.locator('#selection-confirm').tap()
   await page.wait_for_function('id=>PokecaMobile.port.getSnapshot().players[0].discard.some(c=>c.id===id)',arg=ident);after=await snap();p0=after['players'][0];m=record['mainPlan']['mechanic']
   if m=='DRAW_CARDS':assert len(p0['hand'])==len(before['players'][0]['hand'])+2 and p0['turnLimits']['supporterUsed']
   if m=='HEAL_DAMAGE':assert p0['active']['damage']==20
   if m=='COIN_FORCE_SWITCH':assert after['players'][1]['active']['id']==option['action']['selections']['bench'][0]
   await page.wait_for_function('document.getElementById("save-status").textContent==="自動保存済"');await c.set_offline(True);await page.reload();await ready();assert await snap()==after;await c.set_offline(False)
   results.append({'print':record['officialCardId'],'name':record['name'],'mechanic':m,'domEffect':True,'offlineReloadExact':True,'officialImageDecoded':True})
  # Complete a naturally shuffled match with the added cards via the canonical AI port.
  await importer(manifest);await page.locator('#reference-import-choices button').first.wait_for();await page.evaluate('Math.random=()=>2/4294967296');await page.locator('#reference-import-choices button').first.tap();await page.locator('#confirm-ok').tap();await finish_opening(page);await ai_off()
  for turn in range(120):
   state=await snap()
   if state['status']=='finished':break
   actor=(state.get('pendingPrizeSelection') or state.get('pendingReferenceChoice') or {}).get('playerId',state['turnPlayer'])
   result=await page.evaluate("async actor=>{const r=await Pokeca.runAITurn(PokecaMobile.port,actor,{maxActions:80});return {ok:r.ok,actions:r.actions,stage:r.stage};}",actor);assert result['ok'],result
   await page.wait_for_function('document.getElementById("save-status").textContent==="自動保存済"')
   print('MATCH',turn,actor,result,flush=True)
  state=await snap();assert state['status']=='finished',state['turnNumber'];match={'seed':2,'finished':True,'winner':state['winner'],'turn':state['turnNumber']};after=state
  await page.reload();await ready();assert await snap()==after
  assert not errors,errors
  report={'scope':'supplemental-official-references-not-deck-adoption','url':page.url,'additionalPrints':len(records),'cases':results,'naturalAIMatch':match,'saveRestoreExact':True,'physicalAndroidVerified':False,'javascriptErrors':errors};(ROOT/'artifacts/control-008-extensions-browser.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False),flush=True);await b.close()
if __name__=='__main__':
 (ROOT/'artifacts').mkdir(exist_ok=True)
 try:asyncio.run(main())
 except Exception:
  (ROOT/'artifacts/control-008-extensions-failure.json').write_text(json.dumps({'status':'FAILED','traceback':traceback.format_exc()},indent=2)+'\n');raise
