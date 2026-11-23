"""Pixel 5: old same-build worker -> exact-release recovery -> 42945 60-card engine match."""
import asyncio,json,threading,os,re
from pathlib import Path
from urllib.parse import urlsplit
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.async_api import async_playwright
from test_fixed_deck_browser_images import session_ca_args

ROOT=Path(__file__).resolve().parents[1]
LIVE_WORKER=(ROOT/'sw.js').read_bytes()
VERSION=re.search(rb'const BUILD="(\d+)";',LIVE_WORKER).group(1).decode()
EXPECTED=re.search(rb"const CACHE='([^']+)';",LIVE_WORKER).group(1).decode()
OLD='pokeca-first-playable-v'+VERSION+'-0000000000000000'
assert OLD!=EXPECTED
OLD_WORKER=LIVE_WORKER.replace(
 ("const CACHE='"+EXPECTED+"';").encode(),
 ("const CACHE='"+OLD+"';").encode())
assert OLD_WORKER!=LIVE_WORKER
phase={'name':'old'}
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):
  super().__init__(*args,directory=str(ROOT),**kwargs)
 def do_GET(self):
  if urlsplit(self.path).path!='/sw.js':
   return super().do_GET()
  content=OLD_WORKER if phase['name']=='old' else LIVE_WORKER
  self.send_response(200)
  self.send_header('Content-Type','application/javascript')
  self.send_header('Cache-Control','no-store')
  self.send_header('Content-Length',str(len(content)))
  self.end_headers()
  self.wfile.write(content)
 def log_message(self,*args):pass

INFO="""async()=>{
 const worker=navigator.serviceWorker.controller;
 if(!worker)return null;
 return await new Promise(resolve=>{
  const channel=new MessageChannel();
  channel.port1.onmessage=event=>{channel.port1.close();resolve(event.data)};
  worker.postMessage({type:'RELEASE_INFO'},[channel.port2]);
 });
}"""
MATCH="""async ()=>{
 const {cards,plans}=await PokecaSavedDecks.loadCatalog();
 const energy=cards.get('42945'),plan=plans.get('42945');
 if(!energy||!plan||plan.mainPlan?.mechanic!=='BASIC_ENERGY')
  throw Error('42945 official BASIC_ENERGY is not current');
 const pokemon=[],names=new Set();
 for(const record of plans.values()){
  if(record.category!=='pokemon'||record.facts?.basic!==true||
     !cards.has(record.officialCardId)||names.has(record.name))continue;
  pokemon.push(record);names.add(record.name);
  if(pokemon.length===15)break;
 }
 if(pokemon.length!==15)throw Error('insufficient independently verified Basic Pokemon');
 const counts=Object.fromEntries(pokemon.map((p,i)=>[p.officialCardId,i===14?3:4]));
 counts['42945']=1;
 const deck={id:'browser-42945',name:'公式基本エネ実対戦検証',cards:counts,blocked:[]};
 const diagnosis=PokecaSavedDecks.diagnoseDeck(deck,cards,plans);
 if(!diagnosis.deckReady)throw Error(JSON.stringify(diagnosis));
 const entries=PokecaSavedDecks.matchEntries(deck,cards,plans);
 const fixed=await (await fetch('./data/fixed-test-decks.json')).json();
 let seed=2;
 const battle=Pokeca.createReferenceValidationMatch(
  {decks:[{id:deck.id,name:deck.name,cards:entries},fixed.decks[1]]},
  {rng:()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}});
 if(!battle.ok)throw Error('BATTLE_OPENING_FAILED:'+JSON.stringify(battle));
 const player=battle.game.players[0];
 const physical=[player.active,...player.bench,...player.hand,...player.deck,...player.prizeCards,...player.discard].filter(Boolean);
 const attached=physical.filter(c=>c.validationReference?.officialCardId==='42945');
 if(attached.length!==1||!attached[0].validationReference.imageSourceUrl.includes('/S12a/042945_'))
  throw Error('PHYSICAL_PRINT_OR_OFFICIAL_ART_NOT_RETAINED');
 return {deckReady:diagnosis.deckReady,total:entries.reduce((n,r)=>n+r.count,0),
  officialId:'42945',actualMechanic:plan.mainPlan.mechanic,
  actualPrintCount:attached.length,battleOk:true};
}"""

async def main():
 server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
 threading.Thread(target=server.serve_forever,daemon=True).start()
 base='http://127.0.0.1:'+str(server.server_port)+'/'
 try:
  async with async_playwright() as playwright:
   browser=await playwright.chromium.launch(
    executable_path=os.environ.get('CHROMIUM_EXECUTABLE'),args=session_ca_args())
   device=dict(playwright.devices['Pixel 5'])
   device.pop('default_browser_type',None)
   ctx=await browser.new_context(**device,service_workers='allow')
   page=await ctx.new_page()
   errors=[]
   page.on('pageerror',lambda error:errors.append(str(error)))
   await page.goto(base+'#battle',wait_until='domcontentloaded')
   await page.wait_for_function('navigator.serviceWorker.controller&&window.PokecaMobile',timeout=120000)
   before=await page.evaluate(INFO)
   assert before['build']==VERSION and before['cacheName']==OLD,before
   await page.evaluate("localStorage.setItem('user-preserve-test','saved')")
   phase['name']='new'
   await page.goto(base+'update.html?cache-repair=20261123',wait_until='domcontentloaded')
   await page.wait_for_function("location.search.includes('updated=')&&location.hash==='#battle'",timeout=120000)
   await page.wait_for_function('window.PokecaSavedDecks&&navigator.serviceWorker.controller',timeout=120000)
   after=await page.evaluate(INFO)
   assert after['build']==VERSION and after['cacheName']==EXPECTED,(before,after)
   assert await page.evaluate("localStorage.getItem('user-preserve-test')")=='saved'
   match=await page.evaluate(MATCH)
   assert not errors,errors
   report={**match,'fromOldSameBuildCache':OLD,'activatedExactRelease':EXPECTED,
    'savedLocalStoragePreserved':True,'javascriptErrors':errors,'physicalAndroidVerified':False}
   (ROOT/'artifacts').mkdir(exist_ok=True)
   (ROOT/'artifacts/basic-energy-42945-recovery-browser.json').write_text(
    json.dumps(report,ensure_ascii=False,indent=2)+'\n')
   print(json.dumps(report,ensure_ascii=False),flush=True)
   await ctx.close()
   await browser.close()
 finally:
  server.shutdown()

if __name__=='__main__':asyncio.run(main())
