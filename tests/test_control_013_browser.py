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
  async def ready():await page.wait_for_function('window.PokecaUpdateStatus?.state==="ready"&&window.PokecaImageRegistryStatus?.state==="ready"&&document.getElementById("save-status").textContent==="自動保存済"',timeout=60000)
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
   before=await snap()
   ai=await page.evaluate('Pokeca.getLegalActions(PokecaMobile.port.getSnapshot(),"you").actions');assert option['action'] in ai
   hand_ability=(kind=='ability' and
                 any(card['id']==ident for card in before['players'][0]['hand']))
   if hand_ability:
    await page.locator(f'#self-hand [data-card-id="{ident}"]').tap()
    await page.locator('#hand-actions [data-action-type="use_ability"]').filter(has_text=option['label']).tap()
   elif kind in ('attack','ability'):
    await page.locator(f'#self-active [data-card-id="{ident}"]').tap()
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
    attack_print=before['players'][0]['active']['validationReference']['officialCardId']
    assert any(event['type']=='attack' and event.get('details',{}).get('effectId')==(trigger or f['e'])['effectId']
               and event['details'].get('referenceOfficialCardId')==attack_print for event in events)
    if not trigger or m=='PASSIVE_ROCKET_TEAM_ATTACK_GATE':
     assert attack_print==r['officialCardId']
    else:
     assert before['players'][1]['active']['validationReference']['officialCardId']==r['officialCardId']
   if m in ('VANILLA_DAMAGE','ATTACK_UNDAMAGED_BONUS','ATTACK_ATTACHED_TOOL_COUNT','BENCH_COUNT_DAMAGE','FULL_BENCH_REQUIRED_DAMAGE','SELF_COUNTER_DAMAGE','COIN_BONUS_DAMAGE',
            'ACTIVE_AND_BENCH_DAMAGE','ATTACK_SPLASH_DAMAGE','ATTACK_DISCARD_OPPONENT_DECK_TOP','ATTACK_DISCARD_HAND_DRAW','ATTACK_IGNORE_DAMAGE_RULES',
            'PASSIVE_INCOMING_ATTACK_DAMAGE_REDUCTION','PASSIVE_ROCKET_TEAM_ATTACK_GATE','ATTACK_DISCARD_BENCH_ENERGY_BONUS',
            'CONDITIONAL_ATTACK_BONUS','SCALED_ATTACK_DAMAGE','ANY_DAMAGE','FIXED_COIN_HITS'):
    assert f['printedDamageEvents']
    assert all(event in events for event in f['printedDamageEvents'])
   if m=='ATTACK_RESET_HAND':
    own=before['players'][0]
    assert len(after['players'][0]['hand'])==min(f['e']['plan']['amount'],len(own['hand'])+len(own['deck']))
    assert any(ev.get('details',{}).get('command')=='SHUFFLE_DECK' for ev in events)
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
   if m=='PASSIVE_TYPED_ATTACK_IMMUNITY':
    assert any(ev.get('details',{}).get('command')=='DAMAGE' and ev['details'].get('targetInstanceId')==before['players'][1]['active']['id'] and ev['details'].get('amount')==0 for ev in events)
    assert before['players'][1]['active']['damage']==after['players'][1]['active']['damage']
   if m=='TRAINER_SWITCH_OR_EX_V_BOOST':
    assert after['players'][0]['referenceExVDamageBoost']=={'turn':before['turnNumber'],'amount':f['e']['plan']['amount']}
   if m=='MASS_ENERGY_ROUTE':
    plan=f['e']['plan'];selection=option['action']['selections'];picked=selection['energy']
    assert picked
    for i,ident in enumerate(picked):
     assert any(c['id']==ident and c['kind']=='energy' and not c.get('isSpecial') for c in before['players'][0][plan['zone']])
     target=before['players'][0]['active']['id'] if plan['target']=='self' else selection['attachTo'+str(i if plan['multi'] else 0)][0]
     mon=next(c for c in [after['players'][0]['active'],*after['players'][0]['bench']] if c['id']==target)
     assert ident in {c['id'] for c in mon['energyCards']}
    assert before['players'][0]['normalEnergyAttached']==after['players'][0]['normalEnergyAttached']
   if m=='MASS_ZONE_TRANSFER':
    plan=f['e']['plan'];picked=set(option['action']['selections']['cards'])
    assert picked and picked<={card['id'] for card in before['players'][0][plan['zone']]}
    assert picked<={card['id'] for card in after['players'][0][plan['destination']]}
    assert not picked&{card['id'] for card in after['players'][0][plan['zone']]}
   if m=='MASS_HEAL_OWN':
    plan=f['e']['plan'];chosen=option['action'].get('selections',{}).get('cards',[])
    old=[before['players'][0]['active'],*before['players'][0]['bench']]
    new={c['id']:c for c in [after['players'][0]['active'],*after['players'][0]['bench']]}
    assert any(c['damage']>new[c['id']]['damage'] for c in old if c['id'] in new and (not chosen or c['id'] in chosen))
   if m=='MASS_PLACE_COUNTERS':
    plan=f['e']['plan']
    ids=[c['id'] for c in [before['players'][1]['active'],*before['players'][1]['bench']]] if plan['target']=='all' else option['action']['selections']['target']
    assert all(any(ev.get('details',{}).get('command')=='PLACE_DAMAGE_COUNTERS' and ev['details'].get('targetInstanceId')==ident and ev['details'].get('counterCount')==plan['amount'] for ev in events) for ident in ids)
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
  final=await snap();assert final['status']=='finished';new_ids=all_official_ids;used=sorted({e.get('details',{}).get('sourceOfficialCardId') for e in final.get('history',[]) if e.get('details',{}).get('sourceOfficialCardId') in new_ids});assert used;match={'seed':2,'winner':final['winner'],'turn':final['turnNumber'],'finished':True,'executedNewPrints':used}
  await c.set_offline(True);await page.reload();await ready();assert await snap()==final;await c.set_offline(False)
  assert not errors,errors
  report={'url':page.url,'expandedAIMatch':match,'newPrints':len({f['r']['officialCardId'] for f in fixtures}),'newPatterns':len(set(f['e']['plan']['mechanic'] for f in fixtures)),'cases':cases,'javascriptErrors':errors,'physicalAndroidVerified':False};(ROOT/'artifacts').mkdir(exist_ok=True);(ROOT/('artifacts/'+os.environ.get('POKECA_INTAKE_ARTIFACT','control-013')+'-browser.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False));await b.close()
if __name__=='__main__':
 try:asyncio.run(main())
 except Exception:
  (ROOT/'artifacts').mkdir(exist_ok=True);(ROOT/'artifacts/control-013-browser-failure.json').write_text(json.dumps({'traceback':traceback.format_exc()},ensure_ascii=False));raise
