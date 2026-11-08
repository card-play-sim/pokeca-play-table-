"""Bounded official evidence for the 32 names absent from the attached formal snapshot.
Enumerates observed search results; samples one print per name for detail inspection.
Never selects a deck edition or guesses an ID/image path.
"""
import hashlib,json,time,urllib.parse,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data/formal-1945-reconciliation/additional-search';OUT.mkdir(exist_ok=True)
read=lambda p:json.loads(p.read_text())
report=read(ROOT/'data/formal-1945-reconciliation/reconciliation.json')
missing=[r['name'] for r in report['rows'] if not r['candidateCount']]
searches={r['name']:r for p in (ROOT/'data/fixed-deck-search-evidence').glob('*.json') for r in [read(p)]}
requests=0

def get(name,page):
 global requests
 query={'keyword':name,'regulation':'XY','sm_and_keyword':'true','page':page}
 url='https://www.pokemon-card.com/card-search/resultAPI.php?'+urllib.parse.urlencode(query)
 file=OUT/(hashlib.sha256((name+':'+str(page)).encode()).hexdigest()+'.json')
 if file.exists():return read(file)['response']
 if requests:time.sleep(3)
 requests+=1
 if requests>20:raise ValueError('BOUNDED_REQUEST_LIMIT')
 with urllib.request.urlopen(urllib.request.Request(url,headers={'Accept':'application/json'}),timeout=20) as response:
  raw=response.read(4000001)
  if len(raw)>4000000:raise ValueError('SIZE_LIMIT')
 data=json.loads(raw)
 if data.get('result')!=1 or not isinstance(data.get('cardList'),list):raise ValueError('OFFICIAL_SEARCH_SCHEMA')
 evidence={'name':name,'page':page,'officialSearchUrl':url,'sha256':hashlib.sha256(raw).hexdigest(),'response':data}
 file.write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n');assert read(file)==evidence
 return data

rows=[];detail_seeds=[]
for name in missing:
 first=searches[name]['response'];maximum=first['maxPage']
 if maximum>5:raise ValueError('PAGINATION_BOUND_EXCEEDED')
 pages=[first]+[get(name,page) for page in range(2,maximum+1)]
 candidates={c['cardID']:c for page in pages for c in page['cardList'] if c['cardNameAltText']==name}
 items=[{'officialCardId':i,'name':name,'imageSourceUrl':'https://www.pokemon-card.com'+c['cardThumbFile'],'officialDetailsUrl':'https://www.pokemon-card.com/card-search/details.php/card/'+i} for i,c in candidates.items()]
 rows.append({'name':name,'scope':'official search regulation XY','pagesInspected':len(pages) if maximum else 0,'candidateCount':len(items),'candidates':items,'deckPrintAdopted':False,'samplingRule':'First observed exact-name result for category/detail evidence only; not a chosen deck edition.'})
 if items:detail_seeds.append(items[0])
 print(name,len(items),'candidates',flush=True)
alternatives=[]
for original,query in [('たけしのスカウト','タケシのスカウト'),('ロケット団のエネルギー','ロケット団エネルギー')]:
 result=get(query,1);items=[c for c in result['cardList'] if c['cardNameAltText']==query]
 alternatives.append({'originalDeckName':original,'queriedOfficialName':query,'exactAlternativeMatches':items,'automaticRenameApplied':False,'requiresSourceCorrectionApproval':True})
(OUT.parent/'uncovered-class-investigation.json').write_text(json.dumps({'names':len(rows),'newSearchRequests':requests,'rows':rows,'nameReview':alternatives,'deckPrintsAdopted':0},ensure_ascii=False,indent=2)+'\n')
(OUT.parent/'additional-detail-seeds.json').write_text(json.dumps({'candidates':detail_seeds,'notDeckSelection':True},ensure_ascii=False,indent=2)+'\n')
