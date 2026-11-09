"""Real fixed120 reference mode in Android Chrome emulation, not adopted editions."""
import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
from test_fixed_deck_browser_images import session_ca_args
ROOT=Path(__file__).resolve().parents[1]
async def main():
 reports=[]
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE'),args=session_ca_args())
  for seed in (2,7):
   device=dict(p.devices['Pixel 5']);device.pop('default_browser_type',None)
   context=await browser.new_context(**device,service_workers='block');page=await context.new_page();errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   await page.goto(os.environ.get('POKECA_TEST_URL','http://127.0.0.1:8765/'),wait_until='domcontentloaded')
   await page.wait_for_function('window.PokecaMobile&&PokecaImageRegistryStatus.state==="ready"')
   await page.evaluate('seed=>{let n=seed;Math.random=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}',seed)
   await page.locator('#menu-open').tap();await page.get_by_text('公式効果の検証対戦（参照版・未接続効果で停止）',exact=True).tap()
   await page.locator('#reference-match-choices button').nth(seed%2).tap();await page.locator('#confirm-ok').tap()
   await page.wait_for_function('PokecaMobile.port.getSnapshot().referenceEffectValidation')
   # Opponent uses normal automatic UI scheduling; only the human seat is automated here.
   choices=0;human_turns=0
   for step in range(160):
    await page.wait_for_timeout(100)
    s=await page.evaluate('PokecaMobile.port.getSnapshot()')
    assert not await page.evaluate('!!window.PokecaReferenceValidationStop')
    if s['status']=='finished':break
    pending=s.get('pendingPrizeSelection');choice=s.get('pendingReferenceChoice')
    actor=(pending or choice or {}).get('playerId',s['turnPlayer'])
    if actor=='ai':
     await page.wait_for_function('(()=>{const s=PokecaMobile.port.getSnapshot();return s.status==="finished"||(s.pendingPrizeSelection?.playerId||s.pendingReferenceChoice?.playerId||s.turnPlayer)==="you"})()',timeout=120000)
     continue
    if pending:
     await page.locator('#prize-picks').wait_for()
     for i in range(pending['count']):await page.locator('#prize-picks button:enabled').nth(i).tap()
     await page.get_by_text('選んだサイドを手札に加える',exact=True).tap();choices+=1;continue
    if choice:
     await page.locator('#reference-choice button').first.tap();choices+=1;continue
    # Same real port/actions as the human UI, no state injection or synthetic effects.
    result=await page.evaluate('''async()=>{const port=PokecaMobile.port;let count=0;for(;count<80;count++){const s=port.getSnapshot();if(s.status!=='active'||(s.pendingPrizeSelection?.playerId||s.pendingReferenceChoice?.playerId||s.turnPlayer)!=='you'||s.pendingPrizeSelection||s.pendingReferenceChoice)break;const legal=Pokeca.getLegalActions(s,'you').actions;const a=Pokeca.chooseBaseline({legalActions:legal,observation:s});if(!a)return {ok:false,reason:'no legal human action'};const r=PokecaMobile.dispatch('you',a);if(!r.ok)return r;}return {ok:true,actions:count};}''')
    assert result['ok'],result;human_turns+=1
   final=await page.evaluate('PokecaMobile.port.getSnapshot()');assert final['status']=='finished',final['turnNumber']
   images=await page.locator('#app img:not([hidden])').evaluate_all('''async els=>{const out=[];for(const el of els){try{await el.decode();}catch{}out.push({ok:el.naturalWidth>0,url:el.currentSrc});}return out;}''')
   assert images and all(i['ok'] for i in images),images
   await page.wait_for_function('document.getElementById("save-status").textContent==="自動保存済"')
   await page.reload(wait_until='domcontentloaded');await page.wait_for_function('window.PokecaMobile&&PokecaImageRegistryStatus.state==="ready"&&document.getElementById("save-status").textContent==="自動保存済"')
   restored=await page.evaluate('PokecaMobile.port.getSnapshot()')
   assert restored==final,{'changedKeys':[k for k in set(final)|set(restored) if final.get(k)!=restored.get(k)]}
   assert not errors,errors
   report={'seed':seed,'finished':True,'winner':final['winner'],'turn':final['turnNumber'],'humanTurns':human_turns,'choiceDialogs':choices,'visibleImagesDecoded':len(images),'saveReloadExact':True,'adoptedPrints':0,'physicalAndroidVerified':False,'errors':errors}
   reports.append(report);print(json.dumps(report),flush=True);await context.close()
  await browser.close()
 (ROOT/'artifacts/reference-browser-results.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2)+'\n')
if __name__=='__main__':asyncio.run(main())
