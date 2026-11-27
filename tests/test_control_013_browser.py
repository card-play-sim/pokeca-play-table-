"""New effect families via public DOM, persistent game state and offline restart."""
import asyncio,hashlib,json,os,subprocess,traceback
from pathlib import Path
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError
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
  # The live engine resolves each dependency against earlier picks. A zero
  # target step is skipped by the UI and must also be skipped by the test.
  resolved=dict(request)
  for dependency in request.get('dependencies',[]):
   prior=selections.get(dependency['key'],[])
   if dependency['kind']=='countWhenSelected':
    resolved['min']=resolved['max']=dependency['count'] if dependency['value'] in prior else 0
   elif dependency['kind']=='requiresSelection' and dependency['value'] not in prior:
    resolved['min']=resolved['max']=0
    resolved.pop('inspection',None)
   elif dependency['kind']=='countFromSelection':
    resolved['min']=resolved['max']=dependency['count'] if len(prior)>=dependency['threshold'] else 0
  if resolved['min']==resolved['max']==0 and not (resolved.get('inspection') or {}).get('cards'):
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
 if os.environ.get('POKECA_INTAKE_LOCAL_CANDIDATE')=='1':
  assert os.environ.get('POKECA_TEST_URL')=='http://127.0.0.1:8765/' and release_base
  release_base=None
 subprocess.check_call(['node','scripts/build-intake-verification-fixtures.cjs'],cwd=ROOT);fixtures=json.loads((PREFIX/'browser-fixtures.json').read_text());cases=[];errors=[]
 shard_count=int(os.environ.get('POKECA_BROWSER_SHARD_COUNT','1'))
 shard_index=int(os.environ.get('POKECA_BROWSER_SHARD_INDEX','0'))
 assert 1<=shard_count<=16 and 0<=shard_index<shard_count,'INVALID_BROWSER_SHARD'
 total_fixtures=len(fixtures)
 all_official_ids={f['r']['officialCardId'] for f in fixtures}
 fixtures=[case for index,case in enumerate(fixtures) if index%shard_count==shard_index]
 print(json.dumps({'browserShard':shard_index,'shardCount':shard_count,
                   'totalFixtures':total_fixtures,'selectedFixtures':len(fixtures)}),flush=True)
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
  async def ready():
   try:
    await page.wait_for_function('window.PokecaUpdateStatus?.state==="ready"&&window.PokecaImageRegistryStatus?.state==="ready"&&document.getElementById("save-status").textContent==="自動保存済"',timeout=60000)
   except PlaywrightTimeoutError:
    print("BROWSER_READY_DIAGNOSTIC",json.dumps(await page.evaluate("""()=>({url:location.href,update:window.PokecaUpdateStatus,images:window.PokecaImageRegistryStatus,save:document.getElementById('save-status')?.textContent,saveError:document.getElementById('save-status')?.title,online:navigator.onLine,secure:isSecureContext,worker:navigator.serviceWorker?.controller?.scriptURL})"""),ensure_ascii=False,default=str),flush=True)
    print("BROWSER_PAGE_ERRORS",json.dumps(errors[-15:]),flush=True)
    raise
  async def snap():return await page.evaluate('PokecaMobile.port.getSnapshot()')
  await ready()
  for f in fixtures:
   r=f['r'];ident=f['sourceId'];m=f['e']['plan']['mechanic'];print('START',r['officialCardId'],m,flush=True)
   trigger=f.get('trigger')
   kind='attack' if trigger else f['kind']
   option=f['option']
   attack_selector=(f'#attack-actions [data-action-kind="attack"][data-attack-index="{option["action"]["attackIndex"]}"]'
                    if kind=='attack' else None)
   async def load_game(game):
    await page.evaluate('g=>{const r=PokecaMobile.port.loadGame(g);if(!r.ok)throw Error(JSON.stringify(r));}',game)
   await load_game(f['game'])
   await page.locator('#menu-open').tap();toggle=page.get_by_role('button',name='AI自動応答：オン（タップでオフ）',exact=True)
   if await toggle.count():await toggle.tap()
   else:await page.locator('#sheet-close').tap()
   if m=='PASSIVE_ROCKET_TEAM_ATTACK_GATE':
    short=await snap()
    own=short['players'][0]
    teammate=own['bench'].pop()
    own['deck'].extend(teammate['energyCards'])
    teammate.update(energyCards=[],energies=[])
    own['deck'].append(teammate)
    await load_game(short)
    await page.locator(f'#self-active [data-card-id="{ident}"]').tap()
    await page.locator('#pokemon-actions').get_by_role('button',name='ワザを使う',exact=True).tap()
    assert await page.locator(attack_selector).is_disabled()
    await page.locator('#sheet-close').tap()
    await load_game(f['game'])
   if m=='ACTIVE_OPPONENT_ABILITY_SUPPRESSION':
    result=await page.evaluate("""g=>{
      const own=g.players[0],other=g.players[1],ability=Pokeca.getReferenceEffectRecord(other.active).abilities.find(a=>a.plan?.mechanic==='DASH');
      if(!ability||!own.bench.length)throw Error('SUPPRESSION_FIXTURE_MISSING');
      g.turnPlayer='ai';let current=g;
      const port=Pokeca.createUIPort({getGame:()=>current,setGame:x=>current=x});
      if(!port.loadGame(g).ok)throw Error('SUPPRESSION_LOAD');
      const action={type:'use_ability',sourceInstanceId:other.active.id,abilityId:ability.effectId};
      const before=JSON.stringify(port.getSnapshot()),blocked=!port.dispatch('ai',action).ok&&JSON.stringify(port.getSnapshot())===before;
      [own.active,own.bench[0]]=[own.bench[0],own.active];
      if(!port.loadGame(g).ok)throw Error('SUPPRESSION_BENCH_LOAD');
      const legal=Pokeca.getLegalActions(port.getSnapshot(),'ai').actions.find(a=>a.type===action.type&&a.abilityId===action.abilityId&&a.sourceInstanceId===action.sourceInstanceId);
      return blocked&&Boolean(legal)&&port.dispatch('ai',legal).ok;
    }""",await snap())
    assert result,'ACTIVE_SUPPRESSION_MUST_END_ON_BENCH'
   before=await snap()
   ai=await page.evaluate('Pokeca.getLegalActions(PokecaMobile.port.getSnapshot(),"you").actions');assert option['action'] in ai
   hand_ability=(kind=='ability' and
                 any(card['id']==ident for card in before['players'][0]['hand']))
   if hand_ability:
    await page.locator(f'#self-hand [data-card-id="{ident}"]').tap()
    await page.locator('#hand-actions [data-action-type="use_ability"]').filter(has_text=option['label']).tap()
   elif kind in ('attack','ability'):
    container='#self-active' if before['players'][0]['active']['id']==ident else '#self-bench'
    await page.locator(container+f' [data-card-id="{ident}"]').tap()
    if kind=='attack':await page.locator("#pokemon-actions").get_by_role("button",name="ワザを使う",exact=True).tap();await page.locator(attack_selector).tap()
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
   elif r['category']!='stadium' and kind not in ('attack','ability'):
    await page.locator(f'#hand-actions [data-action-type="{option["action"]["type"]}"]').tap()
    await select_effect_targets(page,option)
   if kind in ('attack','ability'):
    await select_effect_targets(page,option)
   if kind in ('attack','ability'):
    # The selection sheet closes asynchronously. Wait for the next
    # confirmation or a committed action before deciding what to tap.
    history_before=len(before.get('history',[]))
    await page.wait_for_function(
     "n=>document.querySelector('#confirm-dialog').open||PokecaMobile.port.getSnapshot().history.length>n",
     arg=history_before,timeout=12000)
    confirm=page.locator('#confirm-ok')
    if await confirm.is_visible():
     try:
      await confirm.tap(timeout=8000)
     except PlaywrightTimeoutError:
      current=await snap()
      assert len(current['history'])>history_before, (
       'ATTACK_CONFIRM_DISAPPEARED_WITHOUT_EXECUTION',r['officialCardId'],m)
   elif await page.locator('#confirm-ok').is_visible():await page.locator('#confirm-ok').tap()
   await page.wait_for_function('n=>PokecaMobile.port.getSnapshot().history.length>n',arg=len(before.get('history',[])))
   after=await snap();assert after!=before
   if m=='COIN_SEARCH_POKEMON':
    choice=after['pendingReferenceChoice']
    assert choice['kind']=='DECK_POKEMON_SEARCH'
    picked=choice['options'][0]
    await page.wait_for_function('document.getElementById("save-status").textContent==="自動保存済"')
    await c.set_offline(True)
    await page.reload()
    await ready()
    assert await snap()==after
    await c.set_offline(False)
    await page.locator(f'#reference-choice [data-selection-id="{picked}"]').tap()
    await page.wait_for_function('!PokecaMobile.port.getSnapshot().pendingReferenceChoice')
    after=await snap()
    assert any(card['id']==picked for card in after['players'][0]['hand'])
    assert any(ev.get('details',{}).get('command')=='REVEAL' and picked in ev['details']['cardIds']
               for ev in after['history'])
    assert any(ev.get('details',{}).get('command')=='SHUFFLE_DECK' for ev in after['history'])
   events=after['history'][len(before.get('history',[])):]
   if f.get('sharedAttackEvents') is not None:
    assert f['sharedAttackEvents'] and all(event in events for event in f['sharedAttackEvents'])
   if m=='ATTACK_DISABLE_SELECTED_MOVE':
    previous=before['players'][1]['active']
    enemy=after['players'][1]
    target=next((card for card in [enemy['active'],*enemy['bench']] if card and card['id']==previous['id']),None)
    if target:
     assert target['referenceNamedAttackLock']['turn']==before['turnNumber']+1
   if kind=='attack':
    attack_print=await page.evaluate("c=>Pokeca.getReferenceEffectRecord(c)?.officialCardId",before['players'][0]['active'])
    assert any(event['type']=='attack' and event.get('details',{}).get('effectId')==(trigger or f['e'])['effectId']
               and event['details'].get('referenceOfficialCardId')==attack_print for event in events)
    if m=='PASSIVE_TEAM_ATTACK_BOOST':
     proof=trigger['proofTeamBoost'];plan=f['e']['plan']
     own=before['players'][0];other=before['players'][1]
     assert attack_print==proof['attackerChain'][-1]
     defender_print=await page.evaluate("card=>Pokeca.getReferenceEffectRecord(card)?.officialCardId",other['active'])
     assert defender_print==proof['defenderChain'][-1]
     holders=await page.evaluate("cards=>cards.map(c=>Pokeca.getReferenceEffectRecord(c)?.officialCardId)",own['bench'])
     assert holders.count(r['officialCardId'])==(2 if plan.get('nonStack') else 1)
     assert proof['holderPrint']==r['officialCardId']
     if plan.get('evolvedSource'):assert own['active']['evolutionCards']
     if plan.get('evolvedTarget'):assert other['active']['evolutionCards']
     assert any(ev.get('details',{}).get('command')=='DAMAGE' and ev['details'].get('targetInstanceId')==other['active']['id'] and ev['details'].get('amount')==int(trigger['damage'])+plan['amount'] for ev in events)
     assert f['printedDamageEvents'] and all(ev in events for ev in f['printedDamageEvents'])
    elif not trigger or m in ('PASSIVE_ROCKET_TEAM_ATTACK_GATE','PASSIVE_NAMED_PRIZE_DISCOUNT','ACTIVE_OPPONENT_ABILITY_SUPPRESSION','PASSIVE_IGNORE_ACTIVE_DEFENSE','PASSIVE_CONTEXT_COST_DISCOUNT'):
     assert attack_print==r['officialCardId']
     if m=='PASSIVE_CONTEXT_COST_DISCOUNT':
      assert f['printedDamageEvents'] and all(ev in events for ev in f['printedDamageEvents'])
    else:
     # An evolved in-play instance keeps its base identity; resolve the current print through the engine.
     defender_print=await page.evaluate("card=>Pokeca.getReferenceEffectRecord(card)?.officialCardId",before['players'][1]['active'])
     assert defender_print==r['officialCardId'],('DEFENDER_CURRENT_PRINT_MISMATCH',defender_print,r['officialCardId'])
     if m=='PASSIVE_FULL_HP_SURVIVAL' and not r['facts']['basic']:
      assert before['players'][1]['active']['evolutionCards'], 'LEGAL_EVOLUTION_STACK_REQUIRED'
   if m in ('VANILLA_DAMAGE','ATTACK_UNDAMAGED_BONUS','ATTACK_ATTACHED_TOOL_COUNT','BENCH_COUNT_DAMAGE','FULL_BENCH_REQUIRED_DAMAGE','SELF_COUNTER_DAMAGE','COIN_BONUS_DAMAGE',
            'ACTIVE_AND_BENCH_DAMAGE','ATTACK_SPLASH_DAMAGE','ATTACK_DISCARD_OPPONENT_DECK_TOP','ATTACK_DISCARD_HAND_DRAW','ATTACK_IGNORE_DAMAGE_RULES',
            'PASSIVE_INCOMING_ATTACK_DAMAGE_REDUCTION','PASSIVE_ROCKET_TEAM_ATTACK_GATE','ATTACK_DISCARD_BENCH_ENERGY_BONUS',
            'CONDITIONAL_ATTACK_BONUS','SCALED_ATTACK_DAMAGE','ANY_DAMAGE','FIXED_COIN_HITS'):
    assert f['printedDamageEvents']
    assert all(event in events for event in f['printedDamageEvents'])
   if m=='MASS_BOARD_BONUS' and f['e']['plan'].get('discardStadium'):
    stadium_id=before['stadium']['id']
    owner=next(side for side in after['players'] if side['id']==before['stadiumOwner'])
    assert after['stadium'] is None and any(card['id']==stadium_id for card in owner['discard'])
    assert any(event.get('details',{}).get('fromZone')=='stadium' and stadium_id in event['details'].get('cardIds',[]) for event in events)
   if m=='ATTACK_OPTIONAL_RECOIL_BONUS':
    assert option['action']['selections']['recoilBonus']==['accept-recoil']
    assert any(event.get('details',{}).get('command')=='DAMAGE'
               and event['details'].get('targetInstanceId')==before['players'][0]['active']['id']
               and event['details'].get('amount')==f['e']['plan']['recoil'] for event in events)
   if m=='ATTACK_SPREAD_DAMAGE' and (f['e']['plan'].get('requiresDamage') or f['e']['plan'].get('prizeUnit')):
    plan=f['e']['plan'];other=before['players'][1]
    expected={mon['id']:(6-other['prizes'])*plan['prizeUnit'] for mon in other['bench']} if plan.get('prizeUnit') else {
     mon['id']:plan['amount'] for mon in other['bench'] if mon['id'] in option['action']['targetIds'] and mon['damage']>0}
    actual={event['details']['targetInstanceId']:event['details']['amount'] for event in events
            if event.get('details',{}).get('command')=='DAMAGE'
            and event['details'].get('targetInstanceId') in {mon['id'] for mon in other['bench']}}
    assert expected and expected==actual
   if m=='ATTACK_GUARDED_DAMAGE':
    assert f['printedDamageEvents'] and all(event in events for event in f['printedDamageEvents'])
    assert not any(event.get('details',{}).get('command')=='ATTACK_FAILED' for event in events)
    if f['e']['plan'].get('discardStadium'):
     stadium_id=before['stadium']['id']
     discard=next(i for i,event in enumerate(events) if event.get('details',{}).get('fromZone')=='stadium'
                  and stadium_id in event['details'].get('cardIds',[]))
     assert any(event in events[discard+1:] for event in f['printedDamageEvents'])
   if m=='ATTACK_MOVE_BENCH_COUNTERS':
    plan=f['e']['plan'];moves=option['action'];own=before['players'][0];other=before['players'][1]
    source=next(card for card in own['bench'] if card['id']==moves['selections']['counterSource'][0])
    target=other['active']['id'] if plan['targetActive'] else moves['targetIds'][0]
    assert source['damage']>0
    assert next(card for card in after['players'][0]['bench'] if card['id']==source['id'])['damage']==0
    assert any(event.get('details',{}).get('command')=='MOVE_DAMAGE_COUNTERS'
               and event['details'].get('sourceInstanceId')==source['id']
               and event['details'].get('targetInstanceId')==target
               and event['details'].get('counterCount')==source['damage']//10 for event in events)
   if m=='ATTACK_SPREAD_DAMAGE' and f['e']['plan'].get('counterUnit'):
    target=option['action']['targetIds'][0]
    expected=[event for event in f['printedDamageEvents'] if event['details'].get('targetInstanceId')==target]
    assert len(expected)==1 and expected[0] in events
   if m=='ATTACK_RECYCLE_BASIC_ENERGY':
    plan=f['e']['plan'];own=before['players'][0]
    ids=[card['id'] for card in own['discard'] if card['kind']=='energy' and not card.get('isSpecial') and card['energyType']==plan['type']]
    actual=[event.get('details',{}) for event in events]
    reveal=next(i for i,event in enumerate(actual) if event.get('command')=='REVEAL' and event.get('cardIds')==ids)
    returned=next(i for i,event in enumerate(actual) if event.get('command')=='RETURN_TO_DECK' and event.get('cardIds')==ids)
    assert reveal<returned and any(event.get('command')=='SHUFFLE_DECK' and not event.get('reference') for event in actual[returned+1:])
    assert set(ids)<={card['id'] for card in after['players'][0]['deck']}
    if plan['counters']:
     assert any(event.get('command')=='PLACE_DAMAGE_COUNTERS' and event.get('targetInstanceId')==option['action']['targetIds'][0]
                and event.get('counterCount')==len(ids)*plan['unit'] for event in actual[reveal+1:returned])
   if m=='ATTACK_DISCARD_OPPONENT_ATTACHMENTS':
    plan=f['e']['plan'];other=before['players'][1]
    expected={card['id'] for mon in [other['active'],*other['bench']] for card in
              [*(card for card in mon['energyCards'] if card.get('isSpecial')),*(mon['tools'] if plan['tools'] else [])]}
    actual={ident for event in events if event.get('details',{}).get('command')=='DISCARD' and event['details'].get('fromZone')=='attached'
            for ident in event['details']['cardIds']}
    assert expected and expected==actual and actual<={card['id'] for card in after['players'][1]['discard']}
   if m=='ATTACK_OPTIONAL_ENERGY_BONUS':
    plan=f['e']['plan'];own=before['players'][0];resolved=after['players'][0];sel=option['action']['selections']
    picked=([c['id'] for c in own['active']['energyCards']] if sel['mode']==['bonus'] else []) if plan['all'] else sel['energy']
    assert set(picked)<={c['id'] for c in resolved[plan['destination']]}
    assert [c['id'] for c in resolved['active']['energyCards']]==[c['id'] for c in own['active']['energyCards'] if c['id'] not in picked]
    assert sum(ev.get('details',{}).get('command')=='SHUFFLE_DECK' and not ev.get('details',{}).get('reference') for ev in events)==int(bool(picked) and plan['destination']=='deck')
   if m=='INSPECTED_OPPONENT_HAND_TRANSFER':
    plan=f['e']['plan'];other=before['players'][1];resolved=after['players'][1]
    picked=option['action']['selections']['opponentCards']
    assert picked and set(picked)<={c['id'] for c in other['hand']}
    draw_count=1 if after['turnNumber']>before['turnNumber'] and after['turnPlayer']=='ai' and other['deck'] else 0
    assert [c['id'] for c in resolved['hand']]==[c['id'] for c in other['hand'] if c['id'] not in picked]+[c['id'] for c in other['deck'][:draw_count]]
    assert any(ev.get('details',{}).get('command')=='REVEAL' and ev['details'].get('privateTo')=='you' and ev['details'].get('cardIds')==[c['id'] for c in other['hand']] for ev in events)
    if plan['destination']=='discard': assert set(picked)<={c['id'] for c in resolved['discard']}
    else: assert [c['id'] for c in resolved['deck']]==[c['id'] for c in other['deck'][draw_count:]]+picked
   if m=='ATTACK_BASIC_ENERGY_MOVE':
    own=before['players'][0];resolved=after['players'][0]
    energy=option['action']['selections']['energy'][0];target=option['action']['selections']['attachTo'][0]
    assert any(c['id']==energy and not c.get('isSpecial') for c in own['active']['energyCards'])
    assert not any(c['id']==energy for c in resolved['active']['energyCards'])
    assert any(c['id']==energy for mon in resolved['bench'] if mon['id']==target for c in mon['energyCards'])
   if m=='SCALED_ATTACK_DAMAGE' and f['e']['plan'].get('metric')=='opponentHandTrainerCount':
    assert any(ev.get('details',{}).get('command')=='REVEAL' and ev['details'].get('privateTo')=='you' and ev['details'].get('cardIds')==[c['id'] for c in before['players'][1]['hand']] for ev in events)
   if m in ('ABILITY_TYPED_COST_DRAW_LIMIT','SUPPORTER_NON_RULE_DISCARD_DRAW'):
    plan=f['e']['plan'];own=before['players'][0];resolved=after['players'][0]
    picked=set(option['action']['selections']['discard'])
    assert picked and picked<={c['id'] for c in resolved['discard']}
    remaining=len(own['hand'])-(len(picked)+1 if m=='SUPPORTER_NON_RULE_DISCARD_DRAW' else (1 if plan['zone']=='hand' else 0))
    amount=len(picked)*plan['unit'] if m=='SUPPORTER_NON_RULE_DISCARD_DRAW' else (plan.get('amount') or max(0,plan['limit']-remaining))
    assert len(resolved['hand'])==remaining+min(amount,len(own['deck']))
    assert [c['id'] for c in resolved['deck']]==[c['id'] for c in own['deck'][amount:]]
   if m=='ATTACK_RESET_HAND':
    own=before['players'][0]
    assert len(after['players'][0]['hand'])==min(f['e']['plan']['amount'],len(own['hand'])+len(own['deck']))
    assert any(ev.get('details',{}).get('command')=='SHUFFLE_DECK' for ev in events)
   if m=='MASS_MILL_COUNT_DAMAGE':
    plan=f['e']['plan']
    for i in ([0,1] if plan['scope']=='both' else [0]):
     side=before['players'][i]
     discarded=[c['id'] for c in side['deck'][:plan['limit']]]
     assert set(discarded)<={c['id'] for c in after['players'][i]['discard']}
     assert any(ev.get('details',{}).get('command')=='DISCARD' and ev['details'].get('fromZone')=='deck' and ev['details'].get('playerId')==side['id'] and ev['details'].get('cardIds')==discarded for ev in events)
    assert f['printedDamageEvents']
    assert all(event in events for event in f['printedDamageEvents'])
   if m=='ATTACK_DISCARD_OWN_DECK_TOP':
    own=before['players'][0]
    discarded=[card['id'] for card in own['deck'][:f['e']['plan']['amount']]]
    assert set(discarded)<={card['id'] for card in after['players'][0]['discard']}
    assert any(ev.get('details',{}).get('command')=='DISCARD' and ev['details'].get('fromZone')=='deck'
               and ev['details'].get('cardIds')==discarded for ev in events)
   if m in ('ATTACK_DISABLE_DEFENDER','ATTACK_WEAKEN_DEFENDER'):
    previous=before['players'][1]['active']
    opponent=after['players'][1]
    targets=[card for card in [opponent['active'],*opponent['bench']] if card and card['id']==previous['id']]
    if targets and m=='ATTACK_DISABLE_DEFENDER':
     assert targets[0]['referenceCannotAttackTurn']==before['turnNumber']+1
    elif targets:
     assert targets[0]['referenceOutgoingDamagePenalty']=={'turn':before['turnNumber']+1,'amount':f['e']['plan']['amount']}
    else:
     assert previous['id'] in [card['id'] for card in opponent['discard']]
   if (trigger or f['e'])['plan']['mechanic']=='ATTACK_DISCARD_BENCH_ENERGY_BONUS':
    picked=set(option['action']['selections']['energy'])
    assert len(picked)==(trigger or f['e'])['plan']['maxDiscard']
    own_before,own_after=before['players'][0],after['players'][0]
    before_attached={energy['id'] for card in own_before['bench'] for energy in card['energyCards']}
    after_attached={energy['id'] for card in own_after['bench'] for energy in card['energyCards']}
    assert picked<=before_attached and after_attached==before_attached-picked
    assert picked<={card['id'] for card in own_after['discard']}
   if m=='ATTACK_DISCARD_STADIUM':
    assert before['stadium'] and after['stadium'] is None
    owner=next(side for side in after['players'] if side['id']==before['stadiumOwner'])
    assert before['stadium']['id'] in {card['id'] for card in owner['discard']}
   if m=='EXCITE_DIVE':
    assert hand_ability
    before_source=next(card for card in before['players'][0]['hand'] if card['id']==ident)
    entered=next(card for card in after['players'][0]['bench'] if card['id']==ident)
    assert entered['validationReference']['officialCardId']==r['officialCardId']
    assert entered['stage']==before_source['stage']
    assert all(card['id']!=ident for card in after['players'][0]['hand'])
   if m=='COIN_UNTIL_TAILS_MILL':
    flips=[ev['details']['heads'] for ev in events if ev.get('details',{}).get('command')=='COIN_FLIP' and isinstance(ev['details'].get('heads'),bool)]
    assert flips and flips[-1] is False and all(flips[:-1])
    enemy=before['players'][1]
    expected=[card['id'] for card in enemy['deck'][:len(flips)-1]]
    discarded=[ident for ev in events if ev.get('details',{}).get('command')=='DISCARD' and ev['details'].get('fromZone')=='deck' and ev['details'].get('owner')==enemy['id'] for ident in ev['details']['cardIds']]
    assert discarded==expected
    assert all(any(card['id']==ident for card in after['players'][1]['discard']) for ident in expected)
   if m=='COIN_UNTIL_TAILS_DAMAGE':
    flips=[ev['details']['heads'] for ev in events if ev.get('details',{}).get('command')=='COIN_FLIP' and 'heads' in ev['details']]
    assert flips and flips[-1] is False and all(flips[:-1])
    assert any(ev.get('details',{}).get('command')=='DAMAGE' and 'targetInstanceId' in ev['details'] for ev in events)
   if m=='COIN_PARALYZE_ATTACK':
    # An actual RNG result and its immutable reference-command audit are separate
    # COIN_FLIP history entries; count only resolved results as real coin tosses.
    flip_entries=[ev.get('details',{}) for ev in events if ev.get('details',{}).get('command')=='COIN_FLIP']
    flips=[entry for entry in flip_entries if isinstance(entry.get('heads'),bool)]
    audit=[entry for entry in flip_entries if entry.get('reference') is True and entry.get('sourceOfficialCardId')==r['officialCardId'] and entry.get('effectId')==f['e']['effectId']]
    assert len(flips)==1 and len(audit)==1, {'print':r['officialCardId'],'flipEntries':flip_entries,'events':events}
    assert (after['players'][1]['active'].get('statusCondition')=='PARALYZED')==flips[0]['heads']
   if m=='ATTACK_NAMED_DISCARD_BENCH':
    selected=option['action']['selections']['cards'];own=before['players'][0]
    assert 0<len(selected)<=min(f['e']['plan']['limit'],5-len(own['bench']))
    assert all(any(c['id']==ident and c['name']==f['e']['plan']['name'] for c in own['discard']) for ident in selected)
    assert set(selected)<={c['id'] for c in after['players'][0]['bench']}
    assert not set(selected)&{c['id'] for c in after['players'][0]['discard']}
    assert all(any(ev.get('details',{}).get('command')=='BENCH_FROM_ZONE' and ident in ev['details'].get('cardIds',[]) for ev in events) for ident in selected)
   if m=='SEARCH_BASIC_TO_BENCH_ATTACK':
    selected=option['action']['selections']['cards']
    assert 0<len(selected)<=f['e']['plan']['limit']
    bench_ids={card['id'] for card in after['players'][0]['bench']}
    deck_ids={card['id'] for card in after['players'][0]['deck']}
    assert set(selected)<=bench_ids and set(selected).isdisjoint(deck_ids)
    assert any(ev.get('details',{}).get('command')=='SHUFFLE_DECK' for ev in events)
   if m=='BASIC_ENERGY':
    own=after['players'][0]
    target=option['action']['target']
    pokemon=own['active'] if target=='active' else own['bench'][target]
    assert any(card['id']==ident and card['validationReference']['officialCardId']==r['officialCardId']
               for card in pokemon['energyCards'])
    assert all(card['id']!=ident for card in own['hand'])
   if m=='DISCARD_TO_SEARCH_DISTINCT_CATEGORIES':
    own=after['players'][0]
    selections=option['action']['selections']
    assert len(selections['discard'])==f['e']['plan']['cost']
    assert {ident,*selections['discard']}<={card['id'] for card in own['discard']}
    assert set(selections['cards'])<={card['id'] for card in own['hand']}
    assert any(ev.get('details',{}).get('command')=='REVEAL' and ev['details'].get('cardIds')==selections['cards'] for ev in events)
    assert any(ev.get('details',{}).get('command')=='SHUFFLE_DECK' for ev in events)
   if m=='ACTIVE_TOP_SUPPORTER_SEARCH':
    chosen=option['action']['selections']['cards']
    assert len(chosen)==1 and len(option['requests'][0]['inspection']['cards'])==6
    assert any(card['id']==chosen[0] and card['cardType']=='SUPPORTER' for card in before['players'][0]['deck'][:6])
    assert any(card['id']==chosen[0] for card in after['players'][0]['hand'])
    assert any(ev.get('details',{}).get('command')=='REVEAL' and ev['details'].get('cardIds')==chosen for ev in events)
    assert any(ev.get('details',{}).get('command')=='SHUFFLE_DECK' for ev in events)
   if m=='SEARCH_REVEAL_TO_HAND_ATTACK':
    selected=option['action']['selections']['cards']
    assert 0<len(selected)<=f['e']['plan']['limit']
    assert set(selected)<={card['id'] for card in after['players'][0]['hand']}
    assert set(selected).isdisjoint(card['id'] for card in after['players'][0]['deck'])
    revealed=any(ev.get('details',{}).get('command')=='REVEAL' and ev['details'].get('cardIds')==selected for ev in events)
    assert revealed==f['e']['plan'].get('reveal',True)
    assert any(ev.get('details',{}).get('command')=='SHUFFLE_DECK' for ev in events)
   if m=='ATTACK_ACCELERATE_BASIC_ENERGY':
    plan=f['e']['plan']
    choices=option['action']['selections']
    selected=choices['energy']
    target_id=before['players'][0]['active']['id'] if plan['target']=='self' else choices['attachTo'][0]
    old=before['players'][0]
    new=after['players'][0]
    target=next(c for c in [new['active'],*new['bench']] if c and c['id']==target_id)
    assert 0<len(selected)<=plan['limit']
    assert set(selected)<={c['id'] for c in old[plan['zone']]}
    assert set(selected).isdisjoint(c['id'] for c in new[plan['zone']])
    assert set(selected)<={c['id'] for c in target['energyCards']}
    for ident in selected:
     assert any(ev.get('details',{}).get('command')=='ATTACH_ENERGY' and ev['details'].get('energyId')==ident and ev['details'].get('targetInstanceId')==target_id and ev['details'].get('fromZone')==plan['zone'] for ev in events)
    assert any(ev.get('details',{}).get('command')=='SHUFFLE_DECK' for ev in events)==(plan['zone']=='deck')
   if m=='DISCARD_ALL_SELF_ENERGY_ATTACK':
    before_ids={card['id'] for card in before['players'][0]['active'].get('energyCards',[])}
    assert before_ids
    assert not after['players'][0]['active'].get('energyCards',[])
    assert before_ids.issubset({card['id'] for card in after['players'][0]['discard']})
   if m=='DISCARD_ONE_SELF_ENERGY_ATTACK':
    chosen=option['action']['selections']['energy']
    assert len(chosen)==1
    own=before['players'][0]['active']
    assert chosen[0] in {card['id'] for card in own['energyCards']}
    discards=[ev['details']['cardIds'] for ev in events if ev.get('details',{}).get('command')=='DISCARD'
              and ev['details'].get('sourceInstanceId')==own['id'] and 'cardIds' in ev['details']]
    assert discards==[chosen]
    assert chosen[0] in {card['id'] for card in after['players'][0]['discard']}
   if m=='RETREAT_LOCK_ATTACK':
    defender=after['players'][1]['active']
    assert defender['id']==before['players'][1]['active']['id']
    assert defender['referenceCannotRetreatTurn']==before['turnNumber']+1
    assert await page.evaluate("!Pokeca.getLegalActions(PokecaMobile.port.getSnapshot(),'ai').actions.some(a=>a.type==='retreat')")
   if m=='ATTACK_DAMAGE_REDUCTION':
    state=after['players'][0]['active']['referenceDamageReduction']
    assert state=={'turn':before['turnNumber']+1,'amount':f['e']['plan']['amount']}
   if m=='RECOIL_DAMAGE':assert after['players'][0]['active']['damage']==before['players'][0]['active']['damage']+f['e']['plan']['amount']
   if m=='HEAL_SELF_ATTACK':assert after['players'][0]['active']['damage']==max(0,before['players'][0]['active']['damage']-f['e']['plan']['amount'])
   if m in ('ABILITY_DISCARD_DRAW','ABILITY_ATTACH_SELF_DRAW'):
    plan=f['e']['plan']
    own,resolved=before['players'][0],after['players'][0]
    key='discard' if m=='ABILITY_DISCARD_DRAW' else 'energy'
    selected=option['action']['selections'][key]
    assert len(selected)==(plan['cost'] if key=='discard' else 1)
    assert set(selected)<={card['id'] for card in own['hand']}
    assert not set(selected)&{card['id'] for card in resolved['hand']}
    drawn=[card['id'] for card in own['deck'][:plan['amount']]]
    assert set(drawn)<={card['id'] for card in resolved['hand']}
    if key=='discard':
     assert set(selected)<={card['id'] for card in resolved['discard']}
    else:
     source=next(card for card in [resolved['active'],*resolved['bench']] if card and card['id']==ident)
     assert selected[0] in {card['id'] for card in source['energyCards']}
     assert own['normalEnergyAttached']==resolved['normalEnergyAttached']
   if m=='TRAINER_TOP_SELECT_DISCARD':
    plan=f['e']['plan'];own=before['players'][0];resolved=after['players'][0]
    top=own['deck'][:plan['limit']];picked=set(option['action']['selections']['cards'])
    assert len(picked)==min(plan['amount'],len(top))
    assert picked<={c['id'] for c in top}
    assert picked<={c['id'] for c in resolved['hand']}
    assert ({c['id'] for c in top}-picked)<={c['id'] for c in resolved['discard']}
    assert [c['id'] for c in resolved['deck']]==[c['id'] for c in own['deck'][len(top):]]
    assert not any(ev.get('details',{}).get('command') in ('REVEAL','SHUFFLE_DECK') and not ev.get('details',{}).get('reference') for ev in events)
   if m in ('TRAINER_TOP_TYPED_SEARCH','TRAINER_TOP_POKEMON_TRAINER'):
    plan=f['e']['plan']
    picked=set(option['action']['selections']['cards'])
    assert picked<={card['id'] for card in before['players'][0]['deck'][:plan['limit']]}
    assert picked<={card['id'] for card in after['players'][0]['hand']}
    assert {card['id'] for card in after['players'][0]['deck']}=={card['id'] for card in before['players'][0]['deck']}-picked
    assert any(ev.get('details',{}).get('command')=='SHUFFLE_DECK' for ev in events)
   if m=='ATTACK_DISCARD_TOOL_BEFORE_DAMAGE':
    tools={card['id'] for card in before['players'][1]['active']['tools']}
    assert tools and tools<={card['id'] for card in after['players'][1]['discard']}
    discard_index=next(i for i,ev in enumerate(events) if ev.get('details',{}).get('command')=='DISCARD' and tools<=set(ev['details'].get('cardIds',[])))
    damage_index=next(i for i,ev in enumerate(events) if ev.get('details',{}).get('command')=='DAMAGE' and ev['details'].get('targetInstanceId')==before['players'][1]['active']['id'])
    assert discard_index<damage_index
   if m=='RECOVER_NON_RULE_AND_ENERGY':
    picked=set(option['action']['selections']['cards'])
    assert picked<={card['id'] for card in after['players'][0]['hand']}
    assert not picked&{card['id'] for card in after['players'][0]['discard']}
   if m=='HEAL_LOW_HP_FULL':
    picked=option['action']['selections']['cards'][0]
    mon=next(c for c in [after['players'][0]['active'],*after['players'][0]['bench']] if c and c['id']==picked)
    assert mon['damage']==0
   if m in ('ATTACK_EVOLUTION_BONUS_DISCARD','ATTACK_PRIZE_BONUS_DISCARD'):
    chosen=option['action'].get('selections',{}).get('energy',[]) if m=='ATTACK_PRIZE_BONUS_DISCARD' else [card['id'] for card in before['players'][0]['active']['energyCards']] if before['players'][1]['active']['stage']>0 else []
    assert set(chosen)<={card['id'] for card in after['players'][0]['discard']}
    assert not set(chosen)&{card['id'] for card in after['players'][0]['active']['energyCards']}
   if m=='TRAINER_DISCARD_SPECIAL_ENERGY':
    picked=option['action']['selections']['energy']
    assert len(picked)==1
    assert any(card['id']==picked[0] and card['isSpecial'] for mon in [before['players'][1]['active'],*before['players'][1]['bench']] for card in mon['energyCards'])
    assert picked[0] in {card['id'] for card in after['players'][1]['discard']}
   if m=='ATTACK_BASIC_DAMAGE_PROTECTION':
    assert after['players'][0]['active']['referenceBasicDamageProtection']=={'turn':before['turnNumber']+1,'exceptType':f['e']['plan']['exceptType']}
   if m=='TOOL_LOW_HP_RETREAT_DISCOUNT':
    target=option['action']['targetInstanceId']
    old=next(c for c in [before['players'][0]['active'],*before['players'][0]['bench']] if c['id']==target)
    mon=next(c for c in [after['players'][0]['active'],*after['players'][0]['bench']] if c['id']==target)
    plan=f['e']['plan']
    assert mon['retreatCost']==(0 if old['hp']-old['damage']<=plan['threshold'] else max(0,old['retreatCost']-plan['amount']))
   if m=='PASSIVE_IGNORE_ACTIVE_DEFENSE':
    defender=before['players'][1]['active']
    assert defender['referenceProtection']['opponentTurn']==before['turnNumber']
    assert any(ev.get('details',{}).get('command')=='DAMAGE' and ev['details'].get('targetInstanceId')==defender['id'] and ev['details'].get('amount',0)>0 for ev in events)
   if m=='SUPPORTER_ROCKET_SWITCH_BOTH':
    assert before['players'][0]['active']['name'].startswith('ロケット団の')
    assert after['players'][0]['active']['name'].startswith('ロケット団の')
    assert before['players'][0]['active']['id']!=after['players'][0]['active']['id']
    if before['players'][1]['bench']:
     assert before['players'][1]['active']['id']!=after['players'][1]['active']['id']
   if m=='SUPPORTER_BASIC_SWITCH_CONFUSE':
    assert before['players'][1]['active']['id']!=after['players'][1]['active']['id']
    assert after['players'][1]['active']['basic'] and after['players'][1]['active']['statusCondition']=='CONFUSED'
   if m=='SUPPORTER_SWITCH_EX_HEAL':
    old=before['players'][0]['active'];new=next(c for c in after['players'][0]['bench'] if c['id']==old['id'])
    assert old['name'].endswith('ex') and new['damage']==max(0,old['damage']-f['e']['plan']['amount'])
   if m=='PASSIVE_ACTIVE_HIT_RETALIATION':
    defender=before['players'][1]['active'];attacker=before['players'][0]['active'];plan=f['e']['plan']
    assert any(ev.get('details',{}).get('command')=='DAMAGE' and ev['details'].get('targetInstanceId')==defender['id'] and ev['details'].get('amount',0)>0 for ev in events)
    reactions=[ev['details'] for ev in events if ev.get('details',{}).get('mechanic')=='PASSIVE_ACTIVE_HIT_RETALIATION' and ev['details'].get('effectId')==f['e']['effectId']]
    assert len(reactions)==1 and reactions[0]['targetInstanceId']==attacker['id']
    if plan.get('status'):
     assert reactions[0]['status']==plan['status']
    else:
     assert reactions[0]['counterCount']==plan['counterCount']
     assert any(ev.get('details',{}).get('command')=='PLACE_DAMAGE_COUNTERS' and ev['details'].get('targetInstanceId')==attacker['id'] and ev['details'].get('counterCount')==plan['counterCount'] for ev in events)
   if m=='PASSIVE_FULL_HP_SURVIVAL':
    defender=before['players'][1]['active'];survivor=after['players'][1]['active']
    assert defender['damage']==0 and survivor['id']==defender['id']
    assert survivor['hp']-survivor['damage']==10
    assert any(ev.get('details',{}).get('command')=='DAMAGE' and ev['details'].get('targetInstanceId')==defender['id'] and ev['details'].get('amount',0)>=defender['hp'] for ev in events)
    assert any(ev.get('details',{}).get('mechanic')=='PASSIVE_FULL_HP_SURVIVAL' and ev['details'].get('effectId')==f['e']['effectId'] for ev in events)
    assert before['players'][0]['prizes']==after['players'][0]['prizes']
   if m=='PASSIVE_TYPED_ATTACK_IMMUNITY':
    assert any(ev.get('details',{}).get('command')=='DAMAGE' and ev['details'].get('targetInstanceId')==before['players'][1]['active']['id'] and ev['details'].get('amount')==0 for ev in events)
    assert before['players'][1]['active']['damage']==after['players'][1]['active']['damage']
   if m=='TRAINER_SWITCH_OR_EX_V_BOOST':
    assert after['players'][0]['referenceExVDamageBoost']=={'turn':before['turnNumber'],'amount':f['e']['plan']['amount']}
   if m=='MASS_COIN_OUTCOME':
    plan=f['e']['plan']
    flips=[ev['details']['heads'] for ev in events if ev.get('details',{}).get('command')=='COIN_FLIP' and isinstance(ev['details'].get('heads'),bool)]
    assert len(flips)==plan['flips']
    heads=sum(flips)
    met=heads==plan['flips'] if plan['when']=='all' else heads==0 if plan['when']=='none' else heads>=plan['threshold']
    if plan.get('status'):
     assert any(ev.get('details',{}).get('command')=='STATUS_CONDITION' and ev['details'].get('status')==plan['status'] for ev in events)==met
    if plan.get('mill'):
     assert {c['id'] for c in before['players'][1]['deck'][:heads]}<={c['id'] for c in after['players'][1]['discard']}
   if m=='MASS_EFFECT_SEQUENCE':
    own,other=before['players'];resolved=after['players'][0]
    steps=f['e']['plan']['steps'];cursors=[0,0];hand_count=len(own['hand'])-(1 if any(s['op']=='drawIfHand' for s in steps) else 0)
    for step in steps:
     if step['op']=='discardOwnHand':
      chosen=option['action'].get('selections',{}).get('sequenceDiscard',[])
      assert len(chosen)==min(step['amount'],len(own['hand']))
      assert set(chosen)<={c['id'] for c in own['hand']} and set(chosen)<={c['id'] for c in resolved['discard']}
      assert not set(chosen)&{c['id'] for c in resolved['hand']}
      hand_count-=len(chosen)
     if step['op']=='blindDiscardOpponent':
      req=next(rq for rq in option['requests'] if rq['key']=='sequenceBlind')
      assert all(c['id'].startswith('hand-slot-') and not c.get('validationReference') for c in req['candidates'])
      moved={c['id'] for c in other['hand']}-{c['id'] for c in after['players'][1]['hand']}
      assert len(moved)==min(step['amount'],len(other['hand'])) and moved<={c['id'] for c in after['players'][1]['discard']}
     if step['op']=='draw' or (step['op']=='drawIfHand' and hand_count>=step['threshold']):
      picked=own['deck'][cursors[0]:cursors[0]+step['amount']]
      assert {c['id'] for c in picked}<={c['id'] for c in resolved['hand']}
      cursors[0]+=len(picked);hand_count+=len(picked)
     if step['op']=='revealHand' or step['op']=='peekTop':
      zone='hand' if step['op']=='revealHand' else 'deck'
      picked=other['hand'] if zone=='hand' else other['deck'][cursors[1]:cursors[1]+step['amount']]
      assert any(ev.get('details',{}).get('command')=='REVEAL' and ev['details'].get('fromZone')==zone and ev['details'].get('privateTo')=='you' and ev['details'].get('cardIds')==[c['id'] for c in picked] for ev in events)
     if step['op']=='mill':
      index=1 if step['side']=='opponent' else 0
      picked=before['players'][index]['deck'][cursors[index]:cursors[index]+step['amount']]
      assert {c['id'] for c in picked}<={c['id'] for c in after['players'][index]['discard']}
      cursors[index]+=len(picked)
     if step['op']=='status':
      assert any(ev.get('details',{}).get('command')=='STATUS_CONDITION' and ev['details'].get('status')==step['status'] for ev in events)
   if m=='MASS_ATTACHED_ENERGY_MOVE':
    plan=f['e']['plan'];selection=option['action']['selections'];chosen=selection['energy']
    side=1 if plan['source'].startswith('opponent') else 0
    old=before['players'][side];new=after['players'][side]
    assert chosen
    for i,ident in enumerate(chosen):
     source=next(c for c in [old['active'],*old['bench']] if ident in {e['id'] for e in c['energyCards']})
     target=ident
     if plan['target']=='self':target=option['action']['sourceInstanceId']
     elif plan['target']=='ownActive':target=old['active']['id']
     else:target=selection['moveTo'+str(i if plan['multi'] else 0)][0]
     assert source['id']!=target
     move=next(i for i,ev in enumerate(events) if ev.get('details',{}).get('command')=='MOVE_ENERGY'
               and ev['details'].get('energyId')==ident and ev['details'].get('sourceInstanceId')==source['id']
               and ev['details'].get('targetInstanceId')==target)
     attached=any(c and c['id']==target and ident in {e['id'] for e in c['energyCards']} for c in [new['active'],*new['bench']])
     if not attached:
      energy=next(c for c in source['energyCards'] if c['id']==ident)
      assert await page.evaluate("c=>Pokeca.getReferenceEffectRecord(c)?.mainPlan.mechanic",energy)=='IGNITION'
      assert after['turnNumber']>before['turnNumber'] and any(c['id']==ident for c in new['discard'])
      assert any(ev.get('details',{}).get('command')=='DISCARD' and ident in ev['details'].get('cardIds',[]) for ev in events[move+1:])
    assert old['normalEnergyAttached']==new['normalEnergyAttached']
   if m=='MASS_ENERGY_ROUTE':
    plan=f['e']['plan'];selection=option['action']['selections'];picked=selection['energy']
    assert picked
    for i,ident in enumerate(picked):
     assert any(c['id']==ident and c['kind']=='energy' and not c.get('isSpecial') for c in before['players'][0][plan['zone']])
     target=f['sourceId'] if plan['target']=='self' else selection['attachTo'+str(i if plan['multi'] else 0)][0]
     mon=next(c for c in [after['players'][0]['active'],*after['players'][0]['bench']] if c['id']==target)
     assert ident in {c['id'] for c in mon['energyCards']}
    assert before['players'][0]['normalEnergyAttached']==after['players'][0]['normalEnergyAttached']
    if plan.get('origin')=='bench':
     source=next(c for c in before['players'][0]['bench'] if c['id']==option['action']['sourceInstanceId'])
     assert source['entryWindow']==before['referenceActionSequence']
     assert await page.evaluate("c=>Pokeca.getReferenceEffectRecord(c)?.officialCardId",source)==r['officialCardId']
    if plan.get('origin')=='evolve':
     source=next(c for c in [before['players'][0]['active'],*before['players'][0]['bench']] if c['id']==option['action']['sourceInstanceId'])
     assert source['evolutionCards'] and source['referenceEvolutionWindow']==before['referenceActionSequence']
     assert await page.evaluate("c=>Pokeca.getReferenceEffectRecord(c)?.officialCardId",source)==r['officialCardId']
    if plan.get('oneEach'):
     targets=[selection['attachTo'+str(i)][0] for i in range(len(picked))]
     assert len(set(targets))==len(picked)
    if plan.get('poisonActive'):
     assigned=plan['target']=='self' or any(selection['attachTo'+str(i)][0]==before['players'][0]['active']['id'] for i in range(len(picked)))
     assert any(ev.get('details',{}).get('command')=='STATUS_CONDITION' and ev['details'].get('status')=='POISONED' and ev['details'].get('targetInstanceId')==before['players'][0]['active']['id'] for ev in events)==assigned
   if m=='SUPPORTER_MEGA_HEAL_RETURN_ENERGY':
    ident=option['action']['selections']['cards'][0]
    old=next(c for c in [before['players'][0]['active'],*before['players'][0]['bench']] if c['id']==ident)
    new=next(c for c in [after['players'][0]['active'],*after['players'][0]['bench']] if c['id']==ident)
    assert old['damage']>0 and new['damage']==0 and not new['energyCards']
    assert {c['id'] for c in old['energyCards']}<={c['id'] for c in after['players'][0]['hand']}
   if m=='MASS_ZONE_TRANSFER':
    plan=f['e']['plan'];picked=set(option['action']['selections']['cards'])
    if plan.get('requiresTera'):
     assert before['players'][0]['active']['referenceEvolutionWindow']==before['referenceActionSequence']
     own=before['players'][0]
     assert await page.evaluate("cards=>cards.some(c=>Pokeca.getReferenceEffectRecord(c)?.facts.teraBenchProtection===true)",[own['active'],*own['bench']]), 'ACTUAL_TERA_REQUIRED'
     assert own['active']['evolutionCards'], 'LEGAL_EVOLUTION_STACK_REQUIRED'
     assert await page.evaluate("c=>Pokeca.getReferenceEffectRecord(c)?.officialCardId",own['active'])==r['officialCardId']
     assert all(c['id'] not in picked or c['kind'] in ('trainer','tool','stadium') for c in before['players'][0]['deck'])
    assert picked and picked<={card['id'] for card in before['players'][0][plan['zone']]}
    if plan.get('nameContains'):
     assert await page.evaluate("(args)=>args.cards.every(c=>{const r=Pokeca.getReferenceEffectRecord(c);return r.category===args.category&&r.name.includes(args.name);})",{'cards':[c for c in before['players'][0][plan['zone']] if c['id'] in picked],'name':plan['nameContains'],'category':plan['category']})
    if plan['category']=='pokemonOrBasicEnergy':
     assert await page.evaluate("(args)=>args.cards.every(c=>{const r=Pokeca.getReferenceEffectRecord(c),p=args.plan;return c.kind==='energy'?!c.isSpecial&&(!p.energyType||c.energyType===p.energyType):r.category==='pokemon'&&(!p.type||r.facts.types.includes(p.type))&&(p.stage===null||r.facts.stage===p.stage)&&(!p.team||r.name.startsWith(p.team+'の'));})",{'cards':[c for c in before['players'][0][plan['zone']] if c['id'] in picked],'plan':plan})
    if plan.get('nameExact') or plan.get('retreatCost') is not None or plan.get('resistanceType') or plan.get('team'):
     assert await page.evaluate("(args)=>args.cards.every(c=>{const r=Pokeca.getReferenceEffectRecord(c),p=args.plan;return (!p.nameExact||r.name===p.nameExact)&&(p.retreatCost===undefined||r.facts.retreatCost===p.retreatCost)&&(!p.resistanceType||r.facts.resistance?.types?.includes(p.resistanceType))&&(!p.team||r.name.startsWith(p.team+'の'));})",{'cards':[c for c in before['players'][0][plan['zone']] if c['id'] in picked and (plan['category']!='pokemonOrBasicEnergy' or c['kind']=='pokemon')],'plan':plan})
    if plan.get('categories') or plan.get('distinctBy'):
     selected_cards=[c for c in before['players'][0][plan['zone']] if c['id'] in picked]
     assert await page.evaluate("(args)=>{const p=args.plan,cs=args.cards,rec=c=>Pokeca.getReferenceEffectRecord(c);const group=c=>p.distinctBy==='energyType'?c.energyType:rec(c).category;return cs.every(c=>(!p.categories||p.categories.includes(rec(c).category))&&(!p.energyTypes||!c.isSpecial&&p.energyTypes.includes(c.energyType)))&&(!p.distinctBy||new Set(cs.map(group)).size===cs.length);}",{'cards':selected_cards,'plan':plan})
    assert picked<={card['id'] for card in after['players'][0][plan['destination']]}
    assert not picked&{card['id'] for card in after['players'][0][plan['zone']]}
   if m=='MASS_ENERGY_COUNT_DISCARD':
    plan=f['e']['plan']
    chosen=option['action'].get('selections',{}).get('energy',[])
    if not plan['all']:
     assert chosen
     assert set(chosen)<={c['id'] for c in after['players'][0]['discard']}
     assert all(any(ev.get('details',{}).get('command')=='DISCARD' and ident in ev['details'].get('cardIds',[]) for ev in events) for ident in chosen)
    assert f['printedDamageEvents'] and all(ev in events for ev in f['printedDamageEvents'])
   if m=='MASS_HEAL_SCOPE':
    plan=f['e']['plan']
    chosen=option['action'].get('selections',{}).get('cards',[])
    healed=[ev['details'] for ev in events if ev.get('details',{}).get('command')=='HEAL' and ev['details'].get('amount',0)>0]
    assert healed
    if plan['choice']:assert {ev['targetInstanceId'] for ev in healed}==set(chosen)
   if m=='MASS_HAND_FLOW':
    plan=f['e']['plan'];mode=plan['mode']
    if mode.startswith('reset'):
     assert any(ev.get('details',{}).get('command')=='RETURN_TO_DECK' and not ev['details'].get('reference') for ev in events)
    if mode=='resetBothCoin':
     assert len([ev for ev in events if ev.get('details',{}).get('command')=='COIN_FLIP' and isinstance(ev['details'].get('heads'),bool)])==2
    if mode=='revealCount':
     assert any(ev.get('details',{}).get('command')=='REVEAL' and ev['details'].get('privateTo')=='you' for ev in events)
    if mode=='rocketLimit':
     own=before['players'][0]
     assert all(c['name'].startswith('ロケット団の') for c in [own['active'],*own['bench']])
     count=min(len(own['deck']),max(0,plan['bonus']-(len(own['hand'])-1)))
     assert len(after['players'][0]['hand'])==len(own['hand'])-1+count
     assert {c['id'] for c in own['deck'][:count]}<={c['id'] for c in after['players'][0]['hand']}
   if m=='MASS_HEAL_OWN':
    plan=f['e']['plan'];chosen=option['action'].get('selections',{}).get('cards',[])
    old=[before['players'][0]['active'],*before['players'][0]['bench']]
    new={c['id']:c for c in [after['players'][0]['active'],*after['players'][0]['bench']]}
    assert any(c['damage']>new[c['id']]['damage'] for c in old if c['id'] in new and (not chosen or c['id'] in chosen))
    if plan['amount']=='all':
     targets=chosen if plan['target']=='choice' else ([old[0]['id']] if plan['target']=='active' else [c['id'] for c in old])
     assert targets and all(new[ident]['damage']==0 for ident in targets)
    if plan.get('origin')=='evolve':
     source=next(c for c in old if c['id']==option['action']['sourceInstanceId'])
     assert source['evolutionCards'] and source['referenceEvolutionWindow']==before['referenceActionSequence']
   if m=='ABILITY_EVOLVE_MULTI_COUNTERS':
    source=before['players'][0]['active'];plan=f['e']['plan'];targets=option['action']['selections']['target']
    assert source['evolutionCards'] and source['referenceEvolutionWindow']==before['referenceActionSequence']
    assert len(targets)==min(plan['count'],1+len(before['players'][1]['bench']))
    assert all(any(ev.get('details',{}).get('command')=='PLACE_DAMAGE_COUNTERS' and ev['details'].get('targetInstanceId')==ident and ev['details'].get('counterCount')==plan['amount'] for ev in events) for ident in targets)
   if m=='ATTACK_OPTIONAL_RETURN_POKEMON':
    source=before['players'][0]['active'];side=after['players'][0]
    assert source['evolutionCards']
    if option['action']['selections']['mode']==['return']:
     assert {source['id'],*(c['id'] for c in source['evolutionCards'])}<={c['id'] for c in side['hand']}
     assert {c['id'] for c in source['energyCards']}<={c['id'] for c in side['discard']}
    else:assert side['active']['id']==source['id']
   if m=='MASS_HAND_ACQUISITION':
    plan=f['e']['plan'];own=before['players'][0];resolved=after['players'][0];selection=option['action'].get('selections',{})
    count=min(plan['amount'],len(own['deck']))
    picked=([x['id'] for x in own['deck'][-count:][::-1]] if plan['mode']=='bottom' else [x['id'] for x in own['deck'][:count]] if plan['mode']=='draw' else selection['cards'])
    assert picked and set(picked)<={x['id'] for x in resolved['hand']}
    assert len(resolved['hand'])==len(own['hand'])+len(picked)
    if plan['mode']=='bottom':assert [x['id'] for x in resolved['deck']]==[x['id'] for x in own['deck'][:-count]]
    if plan['mode']=='search':
     assert any(ev.get('details',{}).get('command')=='SHUFFLE_DECK' and not ev['details'].get('reference') for ev in events)
     assert not any(ev.get('details',{}).get('command')=='REVEAL' and not ev['details'].get('reference') for ev in events)
   if m=='MASS_COUNTER_GRAMMAR':
    plan=f['e']['plan'];other=before['players'][1];own=before['players'][0];sel=option['action'].get('selections',{})
    pool=[other['active'],*other['bench']]
    targets=[other['active']] if plan['scope']=='active' else other['bench'] if plan['scope']=='bench' else [c for c in pool if c['id'] in sel['target']] if plan['scope']=='choice' else pool
    total=0
    for target_card in targets:
     hit=sum(ev['details']['amount'] for ev in events if ev.get('details',{}).get('command')=='DAMAGE' and ev['details'].get('targetInstanceId')==target_card['id'] and not ev['details'].get('reference'))
     amount=max(0,(target_card['hp']-target_card['damage']-hit-plan['remaining'])//10) if plan['mode']=='remaining' else sel['allocation'].get(target_card['id'],0) if plan['mode']=='allocation' else len(own['hand'])*plan['unit'] if plan['mode']=='hand' else (target_card['damage']+hit)//10*plan['unit'] if plan['mode']=='multiply' else plan['amount']
     assert sum(ev['details']['counterCount'] for ev in events if ev.get('details',{}).get('command')=='PLACE_DAMAGE_COUNTERS' and ev['details'].get('targetInstanceId')==target_card['id'] and not ev['details'].get('reference'))==amount
     total+=amount
    assert total>0
   if m=='MASS_PLACE_COUNTERS':
    plan=f['e']['plan']
    own=before['players'][0];other=before['players'][1];targets=[other['active'],*other['bench']]
    if plan['target']=='all': ids=[c['id'] for c in targets]
    elif plan['target']=='active': ids=[other['active']['id']]
    elif plan['target']=='damagedOpponent': ids=[c['id'] for c in targets if c['damage']>0]
    elif plan['target']=='bothAbility': ids=await page.evaluate("cs=>cs.filter(c=>Pokeca.getReferenceEffectRecord(c).abilities.length>0).map(c=>c.id)",[own['active'],*own['bench'],*targets])
    else: ids=option['action']['selections']['target']
    if plan['target']=='benchChoice': assert set(ids)<={c['id'] for c in other['bench']}
    assert all(any(ev.get('details',{}).get('command')=='PLACE_DAMAGE_COUNTERS' and ev['details'].get('targetInstanceId')==ident and ev['details'].get('counterCount')==plan['amount'] for ev in events) for ident in ids)
   if m=='ABILITY_TYPED_COST_COUNTER':
    plan=f['e']['plan'];energy=option['action']['selections']['discard'][0];target=option['action']['selections']['target'][0]
    assert any(c['id']==energy and not c.get('isSpecial') and c.get('energyType')==plan['type'] for c in before['players'][0]['hand'])
    assert energy in {c['id'] for c in after['players'][0]['discard']}
    assert any(ev.get('details',{}).get('command')=='PLACE_DAMAGE_COUNTERS' and ev['details'].get('targetInstanceId')==target and ev['details'].get('counterCount')==plan['amount'] for ev in events)
   if m=='MASS_PRIZE_DRAW':
    plan=f['e']['plan'];n=min(len(before['players'][0]['deck']),plan['amount']+(plan['extra'] if before['players'][1]['prizes']<=plan['threshold'] else 0))
    assert {c['id'] for c in before['players'][0]['deck'][:n]}<={c['id'] for c in after['players'][0]['hand']}
   if m=='ABILITY_SWITCH_OWN':
    assert after['players'][0]['active']['id']==option['action']['selections']['ownBench'][0]
    assert before['players'][0]['active']['id'] in {card['id'] for card in after['players'][0]['bench']}
   if m in ('ABILITY_SEARCH_TYPED_EVOLUTION','TRAINER_SEARCH_TERA'):
    picked=set(option['action']['selections']['cards'])
    assert picked and picked<={card['id'] for card in after['players'][0]['hand']}
    assert {card['id'] for card in after['players'][0]['deck']}=={card['id'] for card in before['players'][0]['deck']}-picked
   if m=='TRAINER_TEAM_DAMAGE_REDUCTION':
    plan=f['e']['plan']
    assert {'turn':before['turnNumber']+1,'type':plan['type'],'amount':plan['amount']} in after['players'][0]['referenceTeamDamageReductions']
   if m=='TRAINER_TYPED_DAMAGE_BOOST':
    plan=f['e']['plan']
    assert {'turn':before['turnNumber'],'type':plan['type'],'amount':plan['amount']} in after['players'][0]['referenceTypedDamageBoosts']
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
  # Each partition checks its own physical exact-print actions and save-resume.
  # Only partition zero runs the unchanged whole-deck AI match, which may use
  # any official print from the complete source fixture, not only this shard.
  if os.environ.get('POKECA_BROWSER_SLOTS_ONLY')=='1' or (shard_count>1 and shard_index!=0):
   assert not errors,errors
   report={'url':page.url,'browserShard':shard_index,'totalFixtures':total_fixtures,
           'newPrints':len({f['r']['officialCardId'] for f in fixtures}),
           'cases':cases,'javascriptErrors':errors,'physicalAndroidVerified':False}
   (ROOT/'artifacts').mkdir(exist_ok=True)
   (ROOT/('artifacts/'+os.environ.get('POKECA_INTAKE_ARTIFACT','control-013')+'-browser.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2))
   print(json.dumps(report,ensure_ascii=False))
   await c.close();await b.close()
   return
  # Independent imported-deck games must finish AND execute a new print.
  # One legal random opening can finish without ever drawing a candidate.
  # Repeat deterministic openings; do not count a match without new effects.
  await c.close()
  match=None
  attempted_matches=[]
  for seed in (2, 17, 101, 257, 1009, 8191, 65537, 104729):
   c=await b.new_context(**device,service_workers='allow');page=await c.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
   await page.goto(os.environ.get('POKECA_TEST_URL','http://127.0.0.1:8765/')+'#battle',wait_until='domcontentloaded')
   await ready()
   await page.locator('#menu-open').tap()
   await page.get_by_role('button',name='公式証跡つき参照デッキJSONを開く',exact=True).tap()
   # The menu opens a second sheet; it does not open the OS file chooser.
   file_input=page.locator('#reference-deck-import')
   await file_input.wait_for(state='visible',timeout=15000)
   async with page.expect_file_chooser(timeout=15000) as chooser:
    await file_input.tap()
   await (await chooser.value).set_files(str(PREFIX/'example-decks.json'))
   try:
    await page.locator('#reference-import-choices button').first.wait_for(timeout=15000)
   except Exception:
    raise AssertionError(f"Reference deck import failed: status={await page.locator('#reference-import-status').inner_text()} sheet={await page.locator('#sheet-content').inner_text()} errors={errors}")
   await page.evaluate('seed=>{Math.random=()=>seed/4294967296}',seed);await page.locator('#reference-import-choices button').first.tap();await page.locator('#confirm-ok').tap();await finish_opening(page)
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
    result=await page.evaluate('async actor=>{const r=await Pokeca.runAITurn(PokecaMobile.port,actor,{maxActions:80});return r;}',actor)
    if not result['ok']:
     failure={'turn':turn,'actor':actor,'result':result,'before':state,'after':await snap()}
     (ROOT/'artifacts').mkdir(exist_ok=True)
     (ROOT/'artifacts/control-013-ai-policy-failure.json').write_text(json.dumps(failure,ensure_ascii=False,indent=2))
     print('AI_POLICY_FAILURE',json.dumps({'turn':turn,'actor':actor,'result':result,'pending':state.get('pendingReferenceChoice'),'prize':state.get('pendingPrizeSelection')},ensure_ascii=False),flush=True)
    assert result['ok'],result
    await page.wait_for_function('document.getElementById("save-status").textContent==="自動保存済"');print('EXPANDED MATCH',seed,turn,actor,{'ok':result['ok'],'actions':result.get('actions')},flush=True)
   final=await snap();assert final['status']=='finished';new_ids=all_official_ids;used=sorted({e.get('details',{}).get('sourceOfficialCardId') for e in final.get('history',[]) if e.get('details',{}).get('sourceOfficialCardId') in new_ids});match={'seed':seed,'winner':final['winner'],'turn':final['turnNumber'],'finished':True,'executedNewPrints':used}
   await c.set_offline(True);await page.reload();await ready();assert await snap()==final;await c.set_offline(False)
   attempted_matches.append(match)
   print('EXPANDED_MATCH_COVERAGE',json.dumps(match,ensure_ascii=False),flush=True)
   if used:break
   await c.close()
  assert match and match['executedNewPrints'],f'NO_NEW_PRINT_EXECUTED_IN_COMPLETED_MATCHES:{attempted_matches}'
  match={**match,'attemptedMatches':attempted_matches}
  assert not errors,errors
  report={'url':page.url,'expandedAIMatch':match,'newPrints':len({f['r']['officialCardId'] for f in fixtures}),'newPatterns':len(set(f['e']['plan']['mechanic'] for f in fixtures)),'cases':cases,'javascriptErrors':errors,'physicalAndroidVerified':False};(ROOT/'artifacts').mkdir(exist_ok=True);(ROOT/('artifacts/'+os.environ.get('POKECA_INTAKE_ARTIFACT','control-013')+'-browser.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False));await b.close()
if __name__=='__main__':
 try:asyncio.run(main())
 except Exception:
  (ROOT/'artifacts').mkdir(exist_ok=True);(ROOT/'artifacts/control-013-browser-failure.json').write_text(json.dumps({'traceback':traceback.format_exc()},ensure_ascii=False));raise
