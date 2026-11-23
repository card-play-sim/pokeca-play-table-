"""Regression: an official bench-targeting attack must execute from physical DOM taps."""
import asyncio,json,os,subprocess
from pathlib import Path
from playwright.async_api import async_playwright
from test_control_013_browser import select_effect_targets
from test_fixed_deck_browser_images import session_ca_args

ROOT=Path(__file__).resolve().parents[1]
GENERATOR=r'''
"use strict";
const fs=require("node:fs"),assert=require("node:assert/strict");
const W=require("./scripts/lib/shared-effect-engine-worker.cjs");
const records=JSON.parse(fs.readFileSync("data/effect-extensions/compiled.json","utf8")).records;
const print=records.find(row=>String(row.officialCardId)==="48564");
assert(print,"official print 48564 is missing");
const index=print.attacks.findIndex(attack=>attack.plan?.mechanic==="ACTIVE_AND_BENCH_DAMAGE");
assert(index>=0,"bench-damage effect missing");
const effect={...print.attacks[index],effectIndex:index};
const fixture=W.prepare(print,effect,"attack");
assert(fixture.port&&!fixture.blocked,"fixture preparation failed: "+fixture.blocked);
const option=fixture.port.getPokemonActions("you",fixture.sourceId)
 .find(o=>o.kind==="attack"&&o.action?.attackIndex===index);
assert(option&&option.enabled,"printed attack is not legal");
assert(Array.isArray(option.targets)&&option.targets.length>0,"no legal bench target candidates");
assert(Array.isArray(option.action.targetIds)&&option.action.targetIds.length===1,"no selected legal bench target");
assert(option.targets.includes(option.action.targetIds[0]),"selected target is not legal");
process.stdout.write(JSON.stringify({game:fixture.port.getSnapshot(),option,
 sourceId:fixture.sourceId,officialCardId:print.officialCardId,effectId:effect.effectId,
 attackIndex:index,selectedTarget:option.action.targetIds[0]}));
'''

async def main():
 fixture=json.loads(subprocess.check_output(['node','-e',GENERATOR],cwd=ROOT,text=True))
 errors=[]
 (ROOT/'artifacts').mkdir(exist_ok=True)
 async with async_playwright() as playwright:
  browser=await playwright.chromium.launch(
   executable_path=os.environ.get('CHROMIUM_EXECUTABLE'),args=session_ca_args())
  device=dict(playwright.devices['Pixel 5'])
  device.pop('default_browser_type',None)
  context=await browser.new_context(**device,service_workers='allow')
  page=await context.new_page()
  page.on('pageerror',lambda err:errors.append(str(err)))
  await page.goto(os.environ.get('POKECA_TEST_URL','http://127.0.0.1:8765/')+'#battle',
                  wait_until='domcontentloaded')
  await page.wait_for_function(
   'window.PokecaMobile&&window.PokecaImageRegistryStatus?.state==="ready"',timeout=60000)
  result=await page.evaluate('game=>PokecaMobile.port.loadGame(game)',fixture['game'])
  assert result['ok'],result
  await page.locator('#menu-open').tap()
  toggle=page.get_by_role('button',name='AI自動応答：オン（タップでオフ）',exact=True)
  if await toggle.count():await toggle.tap()
  else:await page.locator('#sheet-close').tap()
  before=await page.evaluate('PokecaMobile.port.getSnapshot()')
  assert before['turnPlayer']=='you'
  source=fixture['sourceId']
  await page.locator(f'#self-active [data-card-id="{source}"]').tap()
  await page.locator('#pokemon-actions').get_by_role(
   'button',name='ワザを使う',exact=True).tap()
  await page.locator(
   f'#attack-actions [data-action-kind="attack"][data-attack-index="{fixture["attackIndex"]}"]').tap()
  await select_effect_targets(page,fixture['option'])
  confirm=page.locator('#confirm-ok')
  await confirm.wait_for(state='visible',timeout=8000)
  await confirm.tap()
  await page.wait_for_function('count=>PokecaMobile.port.getSnapshot().history.length>count',
                               arg=len(before['history']))
  after=await page.evaluate('PokecaMobile.port.getSnapshot()')
  events=after['history'][len(before['history']):]
  assert any(e.get('type')=='attack' and e.get('details',{}).get('effectId')==fixture['effectId']
             and e['details'].get('referenceOfficialCardId')=='48564' for e in events),events
  bench=fixture['selectedTarget']
  damage=[e for e in events if e.get('details',{}).get('command')=='DAMAGE'
          and e['details'].get('targetInstanceId')==bench]
  assert damage and any(e['details'].get('amount')==20 for e in damage),events
  assert not errors,errors
  receipt={'officialCardId':'48564','mechanic':'ACTIVE_AND_BENCH_DAMAGE',
           'selectedTarget':bench,'effectId':fixture['effectId'],
           'domAttackExecuted':True,'benchDamage20':True,'errors':errors,
           'physicalAndroidVerified':False}
  (ROOT/'artifacts/published-bench-attack-smoke.json').write_text(
   json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
  print(json.dumps(receipt,ensure_ascii=False),flush=True)
  await context.close()
  await browser.close()

if __name__=='__main__':asyncio.run(main())
