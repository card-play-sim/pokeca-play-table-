"""DOM interaction coverage with controlled, conserved fixed-deck reference fixtures.
These fixtures are not claims of adopted print validation or physical Android tests.
"""
import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
from test_fixed_deck_browser_images import session_ca_args
ROOT=Path(__file__).resolve().parents[1]
FIXTURE=(ROOT/'tests/fixtures/g-base-008-browser.js').read_text()
async def main():
 reports=[]
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE'),args=session_ca_args())
  device=dict(p.devices['Pixel 5']);device.pop('default_browser_type',None)
  context=await browser.new_context(**device,service_workers='block');page=await context.new_page();errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto(os.environ.get('POKECA_TEST_URL','http://127.0.0.1:8765/')+'#battle',wait_until='domcontentloaded')
  await page.wait_for_function('window.PokecaMobile&&PokecaImageRegistryStatus.state==="ready"')
  async def snapshot():return await page.evaluate('PokecaMobile.port.getSnapshot()')
  def identities(s):
   result=[]
   for player in s['players']:
    for card in [player['active'],*player['bench'],*player['hand'],*player['deck'],*player['prizeCards'],*player['discard']]:
     if card:
      result.append(card['id']);result.extend(c['id'] for c in card.get('energyCards',[]))
   return sorted(result)
  async def resume(expected):
   await page.wait_for_function('document.getElementById("save-status").textContent==="自動保存済"')
   await page.reload(wait_until='domcontentloaded')
   await page.wait_for_function('window.PokecaMobile&&PokecaImageRegistryStatus.state==="ready"&&document.getElementById("save-status").textContent==="自動保存済"')
   assert await snapshot()==expected
  initial=await page.evaluate(FIXTURE,{'topSupporterSearch':True,'hand':{'0':['ポケギア3.0']}})
  gear=initial['players'][0]['hand'][0]['id']
  await page.locator(f'#self-hand [data-card-id="{gear}"]').tap()
  await page.locator('#hand-actions button:enabled').first.tap()
  picker=page.locator('#selection-cards')
  await picker.wait_for()
  top=[card['id'] for card in initial['players'][0]['deck'][:7]]
  assert await picker.locator('button').evaluate_all('nodes=>nodes.map(node=>node.dataset.selectionId)')==top
  assert await picker.locator('button:enabled').count()==1
  assert await picker.locator('button:disabled').count()==6
  await picker.locator('button:enabled').tap()
  await page.locator('#selection-confirm').tap()
  await page.wait_for_function('id=>PokecaMobile.port.getSnapshot().players[0].discard.some(card=>card.id===id)',arg=gear)
  after=await snapshot()
  assert any(card['id']==top[0] for card in after['players'][0]['hand'])
  assert identities(after)==identities(initial)
  await resume(after)
  assert await page.locator('#selection-cards:visible').count()==0
  # Cover all six fixed-deck search trainers (including the five requested families).
  for name,deck in [('ハイパーボール',0),('ポケパッド',1),('なかよしポフィン',1),('シアノ',0),('トウコ',0),('たけしのスカウト',0),('アカマツ',1)]:
   print('START search '+name,flush=True)
   opts={'firstDeck':deck,'active':['ドラメシヤ','ロケット団のニューラ'] if deck else ['ロケット団のニューラ','ドラメシヤ'],'hand':{'0':[name]+(['シアノ','トウコ'] if name=='ハイパーボール' else [])}}
   initial=await page.evaluate(FIXTURE,opts);card=initial['players'][0]['hand'][0];ident=card['id']
   option=await page.evaluate('id=>PokecaMobile.port.getHandOptions("you",id).find(o=>o.ok)',ident)
   assert option, name
   async def open_search():
    await page.locator(f'#self-hand [data-card-id="{ident}"]').tap()
    await page.locator('#hand-actions button:enabled').first.tap()
    await page.locator('#selection-cards').wait_for()
   await open_search()
   request=next(r for r in option['requests'] if r['key']=='cards')
   assert request['inspection']['privateTo']=='you'
   if name!='ハイパーボール':
    assert await page.locator('#selection-cards button').count()==len(initial['players'][0]['deck']),name
    assert await page.locator('#selection-cards button:enabled').count()==len(request['candidates']),name
   await page.locator('#sheet-close').tap()
   assert await snapshot()==initial,(name,'cancel mutated state')
   await open_search()
   selected=[]
   for req in option['requests']:
    await page.locator('#selection-cards').wait_for()
    buttons=page.locator('#selection-cards button')
    if req['key']=='discard':
     for candidate in req['candidates'][:2]:
      await page.locator(f'#selection-cards [data-selection-id="{candidate["id"]}"]').tap()
    elif req['key']=='cards':
     # Select two energy types for Akamatsu to exercise hand and attachment destinations.
     chosen=request['candidates'][:1]
     if name=='アカマツ':
      energies=initial['players'][0]['deck'];first=next(c for c in energies if c['id']==chosen[0]['id'])
      chosen.append(next(c for c in request['candidates'] if next(e for e in energies if e['id']==c['id'])['name']!=first['name']))
     for candidate in chosen:
      cid=candidate['id'];selected.append(cid);await page.locator(f'#selection-cards [data-selection-id="{cid}"]').tap()
    elif req['key']=='toHand':await buttons.first.tap()
    elif req['key']=='attachTo':await buttons.first.tap()
    else:raise AssertionError(req)
    await page.locator('#selection-confirm').tap()
   await page.wait_for_function('!document.querySelector("#sheet").open')
   await page.wait_for_function('id=>PokecaMobile.port.getSnapshot().players[0].discard.some(c=>c.id===id)',arg=ident)
   after=await snapshot();assert identities(after)==identities(initial),name
   you=after['players'][0]
   assert any(c['id']==ident for c in you['discard']),name
   assert all(not any(c['id']==cid for c in you['deck']) for cid in selected),name
   destination=you['bench'] if name=='なかよしポフィン' else you['hand']
   if name=='アカマツ':destination=you['hand']+you['active']['energyCards']
   assert all(any(c['id']==cid for c in destination) for cid in selected),name
   if card['cardType']=='SUPPORTER':assert you['turnLimits']['supporterUsed']
   await resume(after)
   reports.append({'name':name,'family':'search','domSelect':True,'cancelUnchanged':True,'conserved':True,'stateUpdated':True,'reloadExact':True})
  for name,owner in [('ポケモンいれかえ',0),('ボスの指令',1)]:
   initial=await page.evaluate(FIXTURE,{'hand':{'0':[name]},'bench':{'0':['マシマシラ'],'1':['ドロンチ']}})
   ident=initial['players'][0]['hand'][0]['id'];target=initial['players'][owner]['bench'][0]['id'];old=initial['players'][owner]['active']['id']
   await page.locator(f'#self-hand [data-card-id="{ident}"]').tap();await page.locator('#hand-actions button:enabled').first.tap()
   await page.locator(f'#selection-cards [data-selection-id="{target}"]').tap();await page.locator('#selection-confirm').tap()
   await page.wait_for_function('!document.querySelector("#sheet").open')
   await page.wait_for_function('([owner,id])=>PokecaMobile.port.getSnapshot().players[owner].active.id===id',arg=[owner,target])
   after=await snapshot();assert after['players'][owner]['active']['id']==target
   assert after['players'][owner]['bench'][0]['id']==old;assert identities(after)==identities(initial)
   await resume(after);reports.append({'name':name,'family':'switch','domSelect':True,'stateUpdated':True,'conserved':True,'reloadExact':True})
  initial=await page.evaluate(FIXTURE,{'active':['マシマシラ','ドラメシヤ'],'bench':{'1':['ドラパルトex']},'energy':{'0':{'active':['基本悪エネルギー']}},'damage':{'0':40}})
  source=initial['players'][0]['active']['id'];target=initial['players'][1]['bench'][0]['id']
  option=await page.evaluate('id=>PokecaMobile.port.getPokemonActions("you",id).find(o=>o.kind==="ability"&&o.enabled)',source)
  assert option
  await page.locator(f'#self-active [data-card-id="{source}"]').tap();await page.locator('#pokemon-actions [data-action-kind="ability"]').tap()
  for req in option['requests']:
   await page.locator('#selection-cards').wait_for()
   if req['key']=='source':ident=source
   elif req['key']=='target':ident=target
   elif req['kind']=='COUNT':ident='3'
   else:raise AssertionError(req)
   await page.locator(f'#selection-cards [data-selection-id="{ident}"]').tap();await page.locator('#selection-confirm').tap()
  await page.locator('#confirm-ok').tap();await page.wait_for_function('!document.querySelector("#sheet").open')
  await page.wait_for_function('PokecaMobile.port.getSnapshot().players[0].active.damage===10')
  after=await snapshot();assert after['players'][0]['active']['damage']==10
  assert after['players'][1]['bench'][0]['damage']==30;assert identities(after)==identities(initial)
  await resume(after);reports.append({'name':'マシマシラ','family':'ability-target','domSelect':True,'sourceDamage':10,'targetDamage':30,'conserved':True,'reloadExact':True})
  assert not errors,errors
  report={'controlledFixtures':True,'physicalAndroidVerified':False,'url':page.url,'cases':reports,'javascriptErrors':errors}
  (ROOT/'artifacts').mkdir(exist_ok=True);(ROOT/'artifacts/g-base-008-browser-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
  print(json.dumps(report,ensure_ascii=False),flush=True)
  await browser.close()
if __name__=='__main__':asyncio.run(main())
