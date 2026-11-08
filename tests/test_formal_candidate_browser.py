"""Real rendering of formal reference candidates through the existing app resolver.
This is a technical candidate inspection, not deck-print adoption or permission approval.
"""
import asyncio,json,os,sys
from pathlib import Path
from playwright.async_api import async_playwright
from test_fixed_deck_browser_images import session_ca_args
ROOT=Path(__file__).resolve().parents[1]
async def main():
 evidence=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'data/formal-1945-reconciliation/candidate-evidence.json'
 candidates=json.loads(evidence.read_text())['cards']
 responses={};errors=[]
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE'),args=session_ca_args())
  device=dict(p.devices['Pixel 5']);device.pop('default_browser_type',None)
  page=await browser.new_page(**device)
  page.on('pageerror',lambda error:errors.append(str(error)))
  page.on('response',lambda r:responses.update({r.url:{'status':r.status,'type':r.headers.get('content-type','')}}))
  await page.goto('http://127.0.0.1:8765/',wait_until='domcontentloaded')
  await page.wait_for_function('window.PokecaMobile && PokecaImageRegistryStatus.state==="ready" && document.getElementById("save-status").textContent==="自動保存済"')
  before=await page.evaluate('PokecaMobile.port.getSnapshot()')
  await page.locator('#menu-open').click();await page.get_by_text('固定2デッキ（各60枚）を確認',exact=True).click()
  await page.locator('.deck-manifest-list').first.wait_for()
  resolved=await page.evaluate('''cards=>{
   const section=document.createElement('section');section.id='formal-reference-preview';
   const title=document.createElement('h3');title.textContent='正式原本の候補画像（採用版未選択・技術検査）';section.append(title);
   const result=[];
   for(const card of cards){const url=PokecaImageResolver.resolve(card);result.push({id:card.officialCardId,url});
    const row=document.createElement('div');row.dataset.officialCardId=card.officialCardId;row.style.cssText='display:flex;gap:8px;align-items:center;min-height:145px';
    const img=document.createElement('img');img.src=url;img.alt=card.name;img.loading='eager';img.style.cssText='width:98px;height:137px;object-fit:contain';
    const label=document.createElement('span');label.textContent=card.name+' '+card.set+' '+card.cardNumber+' / 候補・未採用';row.append(img,label);section.append(row);
   }
   document.getElementById('sheet-content').append(section);return result;
  }''',candidates)
  assert all(r['url']==c['imageSourceUrl'] for r,c in zip(resolved,candidates)),'resolver did not return exact candidate URL'
  rows=page.locator('#formal-reference-preview > div');results=[]
  await page.wait_for_function('Array.from(document.querySelectorAll("#formal-reference-preview img")).every(i=>i.complete)',timeout=90000)
  for i,card in enumerate(candidates):
   row=rows.nth(i);await row.scroll_into_view_if_needed()
   observation=await row.evaluate('''async row=>{const img=row.querySelector('img');let decoded=false;try{await img.decode();decoded=img.naturalWidth>0;}catch{}
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const r=img.getBoundingClientRect(),s=getComputedStyle(img),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return {sourceUrl:img.currentSrc||img.src,decoded,width:img.naturalWidth,height:img.naturalHeight,visible:!img.hidden&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>0&&hit===img,objectFit:s.objectFit};}''')
   http=responses.get(observation['sourceUrl']);passed=bool(observation['decoded'] and observation['visible'] and observation['objectFit']=='contain' and http and http['status']==200 and http['type'].startswith('image/') and observation['sourceUrl']==card['imageSourceUrl'])
   results.append({k:card[k] for k in ['officialCardId','name','set','cardNumber']}|{'passed':passed,'observation':observation,'http':http,'sourceRenderAllowed':card.get('formalSource',{}).get('sourceSimulator',{}).get('renderAllowed')})
  assert await page.evaluate('PokecaMobile.port.getSnapshot()')==before
  report={'candidatePrints':len(results),'actualCandidateImagesDisplayed':sum(r['passed'] for r in results),'failures':[r['officialCardId'] for r in results if not r['passed']],'technicalCandidateDisplayPass':all(r['passed'] for r in results) and not errors,'deckPrintsAdopted':0,'productionPass':False,'physicalAndroidVerified':False,'imageFilesSaved':False,'javascriptErrors':errors,'results':results}
  Path('artifacts').mkdir(exist_ok=True);Path('artifacts/'+('additional-candidate-display.json' if len(sys.argv)>1 else 'formal-1945-candidate-display.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
  print(json.dumps({k:v for k,v in report.items() if k!='results'},ensure_ascii=False));await browser.close();return 0 if report['technicalCandidateDisplayPass'] else 2
if __name__=='__main__':sys.exit(asyncio.run(main()))
