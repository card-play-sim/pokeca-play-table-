"""Exercise existing synthetic AI matches in the real UI port. Never fixed-deck acceptance."""
import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
from test_fixed_deck_browser_images import session_ca_args
ROOT=Path(__file__).resolve().parents[1]
async def main():
 reports=[]
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE'),args=session_ca_args())
  for trial in (1,2):
   device=dict(p.devices['Pixel 5']);device.pop('default_browser_type',None)
   context=await browser.new_context(**device,service_workers='block');page=await context.new_page();errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   await page.add_init_script(f'let aiTestSeed={trial};Math.random=()=>{{aiTestSeed=(Math.imul(aiTestSeed,1664525)+1013904223)>>>0;return aiTestSeed/4294967296;}};')
   await page.goto(os.environ.get('POKECA_TEST_URL','http://127.0.0.1:8765/'),wait_until='domcontentloaded')
   await page.wait_for_function('window.PokecaMobile&&PokecaImageRegistryStatus.state==="ready"&&document.getElementById("save-status").textContent==="自動保存済"')
   await page.locator('#menu-open').tap();await page.get_by_text('AI自動応答：オン（タップでオフ）',exact=True).tap()
   await page.evaluate('seed=>{let first=true,state=20261108;Math.random=()=>{if(first){first=false;return seed/4294967296;}state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};}',123+trial-1)
   await page.locator('#demo-open').tap();await page.locator('#confirm-ok').tap();await page.wait_for_timeout(750)
   await page.locator('#opening-choices button').first.tap()
   for index in range(1,min(6,await page.locator('#opening-choices button').count())):await page.locator('#opening-choices button').nth(index).tap()
   await page.locator('#opening-start').tap()
   await page.wait_for_function('PokecaMobile.port.getSnapshot().demo===true')
   turns=[]
   for step in range(80):
    state=await page.evaluate('PokecaMobile.port.getSnapshot()')
    if state['status']=='finished':break
    pending=state.get('pendingPrizeSelection')
    if pending and pending['playerId']=='you':
     await page.locator('#prize-picks').wait_for()
     for index in range(pending['count']):await page.locator('#prize-picks button:enabled').nth(index).tap()
     await page.get_by_text('選んだサイドを手札に加える',exact=True).tap();continue
    actor=pending['playerId'] if pending else state['turnPlayer']
    result=await page.evaluate('''async actor=>{const r=await Pokeca.runAITurn(PokecaMobile.port,actor,{maxActions:30});return {ok:r.ok,actions:r.actions,errors:r.errors||[]};}''',actor)
    assert result['ok'],result;assert result['actions']>0;turns.append({'actor':actor,**result})
   final=await page.evaluate('PokecaMobile.port.getSnapshot()');assert final['status']=='finished',final['turnNumber']
   print('Browser AI summary',trial,final['winner'],final['turnNumber'],{k:sum(e['type']==k for e in final['history']) for k in {e['type'] for e in final['history']}},flush=True)
   assert final['winner'] in ('you','ai');assert any(e['type']=='attack' for e in final['history'])
   await page.wait_for_function('document.getElementById("save-status").textContent==="自動保存済"')
   await page.reload(wait_until='domcontentloaded');await page.wait_for_function('window.PokecaMobile&&PokecaImageRegistryStatus.state==="ready"&&document.getElementById("save-status").textContent==="自動保存済"')
   restored=await page.evaluate('PokecaMobile.port.getSnapshot()')
   if restored!=final:print('Restore mismatch',{'expectedTurn':final['turnNumber'],'actualTurn':restored['turnNumber'],'expectedHistory':len(final['history']),'actualHistory':len(restored['history'])},flush=True)
   assert restored==final
   reports.append({'trial':trial,'url':page.url,'syntheticCardsOnly':True,'fixedOfficialMatchPass':False,'finished':True,'winner':final['winner'],'turnNumber':final['turnNumber'],'attackCount':sum(e['type']=='attack' for e in final['history']),'aiTurns':turns,'saveReloadExact':True,'javascriptErrors':errors})
   assert not errors;print('PASS synthetic browser AI match',trial,final['winner'],final['turnNumber'],flush=True)
   await context.close()
  await browser.close()
 (ROOT/'artifacts/published-ai-browser.json').write_text(json.dumps({'physicalAndroidVerified':False,'matches':reports,'fixedOfficialMatchPass':False},ensure_ascii=False,indent=2)+'\n')
if __name__=='__main__':asyncio.run(main())
