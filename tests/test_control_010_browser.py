"""Official Pokemon and special energy through real DOM and an expanded AI match."""
import asyncio,json,os,subprocess,traceback
from pathlib import Path
from playwright.async_api import async_playwright
from test_fixed_deck_browser_images import session_ca_args
from browser_opening import finish_opening
ROOT=Path(__file__).resolve().parents[1]
PREPARE="""const fs=require('fs'),vm=require('vm'),c={window:{},console,performance,Math,setTimeout};vm.runInNewContext(fs.readFileSync('ui/engine.bundle.js','utf8'),c);const F=require('./tests/fixtures/control-010-scenarios.cjs')(c.window.Pokeca),cases=[];for(const r of F.records){if(r.category==='energy'){cases.push({r,kind:'energy',...F.energyBattle(r.officialCardId)});continue;}for(const [i,e]of r.attacks.entries()){const t=F.create(r.officialCardId,'attack',i);cases.push({r,e,kind:'attack',frame:t.frame,game:t.port.getSnapshot()});}for(const [i,e]of r.abilities.entries()){if(e.plan.mechanic==='BENCH_DAMAGE_PROTECTION')cases.push({r,e,kind:'protection',...F.protection(r.officialCardId)});else{const t=F.create(r.officialCardId,'ability',i);cases.push({r,e,kind:'ability',frame:t.frame,game:t.port.getSnapshot()});}}}console.log(JSON.stringify(cases));"""
async def main():
 fixtures=json.loads(subprocess.check_output(['node','-e',PREPARE],cwd=ROOT));cases=[];errors=[]
 async with async_playwright() as pw:
  b=await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE'),args=session_ca_args());device=dict(pw.devices['Pixel 5']);device.pop('default_browser_type',None);c=await b.new_context(**device,service_workers='allow');page=await c.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto(os.environ.get('POKECA_TEST_URL','http://127.0.0.1:8765/'),wait_until='domcontentloaded')
  async def ready():await page.wait_for_function('window.PokecaUpdateStatus?.state==="ready"&&window.PokecaImageRegistryStatus?.state==="ready"&&document.getElementById("save-status").textContent==="自動保存済"',timeout=60000)
  async def snap():return await page.evaluate('PokecaMobile.port.getSnapshot()')
  async def off():
   await page.locator('#menu-open').tap();toggle=page.get_by_role('button',name='AI自動応答：オン（タップでオフ）',exact=True)
   if await toggle.count():await toggle.tap()
   else:await page.locator('#sheet-close').tap()
  async def act(source,kind,target=None):
   opts=await page.evaluate('([id,kind])=>PokecaMobile.port.getPokemonActions("you",id).filter(o=>o.kind===kind)',[source,kind]);option=opts[0];assert option['enabled']
   await page.locator(f'#self-active [data-card-id="{source}"]').tap();await page.locator(f'#pokemon-actions [data-action-kind="{kind}"]').first.tap()
   for req in option.get('requests',[]):
    ids=[target] if target and req['kind']=='POKEMON' else option['action'].get('selections',{}).get(req['key'],option['action'].get('targetIds',[]))
    for ident in ids:await page.locator(f'[data-selection-id="{ident}"]').tap()
    await page.locator('#selection-confirm').tap()
   old=await snap();await page.locator('#confirm-ok').tap();await page.wait_for_function('n=>PokecaMobile.port.getSnapshot().history.length>n',arg=len(old.get('history',[])))
  await ready()
  for f in fixtures:
   r=f['r'];ident=f['frame']['sourceId'];kind=f['kind'];print('START',r['officialCardId'],kind,flush=True)
   await page.evaluate('g=>{const r=PokecaMobile.port.loadGame(g);if(!r.ok)throw Error(JSON.stringify(r));}',f['game']);await off();before=await snap()
   if kind=='energy':
    await page.locator(f'#self-hand [data-card-id="{ident}"]').tap();await page.locator(f'#self-active [data-card-id="{f["attackerId"]}"]').tap();await page.wait_for_function('id=>!PokecaMobile.port.getSnapshot().players[0].hand.some(c=>c.id===id)',arg=ident)
    attached=await snap();assert len(attached['players'][0]['active']['energyCards'])==len(before['players'][0]['active']['energyCards'])+1;assert len(attached['players'][0]['active']['energies'])==3
    await act(f['attackerId'],'attack');after=await snap();assert after['players'][1]['active']['damage']==80
   else:
    await act(ident,'attack' if kind in ('attack','protection') else 'ability',f.get('targetId'));after=await snap()
    if kind=='protection':assert next(m for m in after['players'][1]['bench'] if m['id']==f['targetId'])['damage']==0
    elif f['e']['plan']['mechanic']=='HAND_LIMIT_DRAW_ATTACK':assert len(after['players'][0]['hand'])==7
    elif kind=='ability':assert len(after['players'][0]['hand'])==5
    else:assert after['players'][1]['active']['damage']==int(f['e']['damage'])
   # The app deliberately resumes an unfinished AI turn on restart. Complete
   # that real turn before taking the exact browser checkpoint; Node also
   # verifies immediate post-command restore without advancing a turn.
   for _ in range(20):
    after=await snap()
    if after['status']=='finished':break
    choice=after.get('pendingReferenceChoice');prizes=after.get('pendingPrizeSelection')
    if choice and choice['playerId']=='you':await page.locator('#reference-choice button').first.tap();continue
    if prizes and prizes['playerId']=='you':
     player=next(p for p in after['players'] if p['id']=='you');slots=[i for i,v in enumerate(player['prizeSlots']) if v][:prizes['count']]
     for slot in slots:await page.get_by_role('button',name='サイド '+str(slot+1),exact=True).tap()
     await page.get_by_role('button',name='選んだサイドを手札に加える',exact=True).tap();continue
    if after['turnPlayer']=='you':break
    result=await page.evaluate('async()=>{const r=await Pokeca.runAITurn(PokecaMobile.port,"ai",{maxActions:80});return {ok:r.ok,stage:r.stage};}');assert result['ok'],result
   after=await snap();assert after['status']=='finished' or after['turnPlayer']=='you'
   await page.wait_for_function('document.getElementById("save-status").textContent==="自動保存済"');await c.set_offline(True);await page.reload();await ready();assert await snap()==after;await c.set_offline(False)
   cases.append({'print':r['officialCardId'],'kind':kind,'domExecuted':True,'offlineRestoreExact':True})
  await page.locator('#menu-open').tap();await page.get_by_role('button',name='公式証跡つき参照デッキJSONを開く',exact=True).tap();await page.locator('#reference-deck-import').set_input_files(str(ROOT/'data/effect-extensions/control-010-example-decks.json'));await page.locator('#reference-import-choices button').first.wait_for();await page.evaluate('Math.random=()=>2/4294967296');await page.locator('#reference-import-choices button').first.tap();await page.locator('#confirm-ok').tap();await finish_opening(page)
  await page.wait_for_function('!document.getElementById("sheet").open||document.getElementById("reference-choice")')
  for _ in range(10):
   pending=(await snap()).get('pendingReferenceChoice')
   if not pending:break
   if pending['playerId']=='you':await page.locator('#reference-choice button').first.tap()
   else:await page.wait_for_function('PokecaMobile.port.getSnapshot().pendingReferenceChoice?.playerId!=="ai"')
  await off()
  for turn in range(120):
   state=await snap()
   if state['status']=='finished':break
   actor=(state.get('pendingPrizeSelection') or state.get('pendingReferenceChoice') or {}).get('playerId',state['turnPlayer']);result=await page.evaluate('async actor=>{const r=await Pokeca.runAITurn(PokecaMobile.port,actor,{maxActions:80});return {ok:r.ok,stage:r.stage,actions:r.actions};}',actor);assert result['ok'],result
   await page.wait_for_function('document.getElementById("save-status").textContent==="自動保存済"');print('MATCH',turn,actor,result,flush=True)
  final=await snap();assert final['status']=='finished';match={'seed':2,'winner':final['winner'],'turn':final['turnNumber'],'finished':True};await c.set_offline(True);await page.reload();await ready();assert await snap()==final;await c.set_offline(False);assert not errors,errors
  report={'url':page.url,'additionalPrints':8,'executionPlans':5,'sharedFamilies':4,'cases':cases,'naturalAIMatch':match,'javascriptErrors':errors,'physicalAndroidVerified':False};(ROOT/'artifacts').mkdir(exist_ok=True);(ROOT/'artifacts/control-010-browser.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False));await b.close()
if __name__=='__main__':
 try:asyncio.run(main())
 except Exception:
  (ROOT/'artifacts').mkdir(exist_ok=True);(ROOT/'artifacts/control-010-failure.json').write_text(json.dumps({'traceback':traceback.format_exc()},ensure_ascii=False));raise
