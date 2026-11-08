"""Bounded first-page discovery for the existing 45 names; never adopts deck IDs or downloads images."""
import json,hashlib,time,urllib.request,urllib.parse
from pathlib import Path
root=Path(__file__).resolve().parents[1];dest=root/'data/fixed-deck-search-evidence';dest.mkdir(exist_ok=True)
manifest=json.loads((root/'data/fixed-test-decks.json').read_text());names=list(dict.fromkeys(c['name'] for d in manifest['decks'] for c in d['cards']))
assert len(names)==45 and sum(c['count'] for d in manifest['decks'] for c in d['cards'])==120
for i,name in enumerate(names):
 file=dest/(hashlib.sha256(name.encode()).hexdigest()+'.json')
 if file.exists():
  saved=json.loads(file.read_text());assert saved['name']==name and saved.get('storedResponseSha256')==hashlib.sha256(json.dumps(saved['response'],sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest();continue
 if i:time.sleep(3)
 url='https://www.pokemon-card.com/card-search/resultAPI.php?'+urllib.parse.urlencode({'keyword':name,'regulation':'XY','sm_and_keyword':'true','page':1})
 try:
  req=urllib.request.Request(url,headers={'Accept':'application/json','User-Agent':'PokecaFixedDeckEvidence/1.0'})
  with urllib.request.urlopen(req,timeout=20) as r:
   if r.status!=200:raise ValueError('HTTP_'+str(r.status))
   raw=r.read(4000001)
   if len(raw)>4000000:raise ValueError('SIZE_LIMIT')
   data=json.loads(raw)
   if data.get('result')!=1 or not isinstance(data.get('cardList'),list):raise ValueError('SEARCH_SCHEMA')
  evidence={'schemaVersion':1,'name':name,'officialSearchUrl':url,'responseSha256':hashlib.sha256(raw).hexdigest(),'response':data,'storedResponseSha256':hashlib.sha256(json.dumps(data,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest(),'purpose':'OFFICIAL_SEARCH_CANDIDATES_ONLY_NOT_DECK_PRINT_ADOPTION'}
  file.write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n')
  assert json.loads(file.read_text())==evidence
  matches=[x for x in data['cardList'] if x.get('cardNameAltText')==name]
  print(i+1,name,'exact candidates',len(matches),'pages',data.get('maxPage'),flush=True)
 except Exception as e:
  print('SAFE_STOP',name,str(e),flush=True);raise
