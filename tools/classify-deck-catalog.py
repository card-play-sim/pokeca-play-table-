#!/usr/bin/env python3
"""Resume official heading classification without changing the image registry."""
import concurrent.futures as futures
import hashlib, json, re, time, threading, sys, os, subprocess
from pathlib import Path
from html import unescape
from urllib.request import Request, urlopen

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data/deck-building'
CACHE=ROOT/'data/deck-building/checkpoint'
BASE='https://www.pokemon-card.com'
CATEGORIES={'グッズ':'goods','サポート':'support','ポケモンのどうぐ':'tool','スタジアム':'stadium','基本エネルギー':'energy','特殊エネルギー':'energy'}
def text(value): return unescape(re.sub('<[^>]+>','',value)).strip()
def digest(b): return hashlib.sha256(b).hexdigest()
def save(path,value):
 path.parent.mkdir(parents=True,exist_ok=True)
 raw=(json.dumps(value,ensure_ascii=False,separators=(',',':'))+'\n').encode();temp=path.with_suffix('.tmp');temp.write_bytes(raw);temp.replace(path)
 assert path.read_bytes()==raw

def parse(raw,row):
 html=raw.decode('utf-8'); ident=row['officialCardId'];url=BASE+'/card-search/details.php/card/'+ident+'/regu/XY'
 assert re.findall(r'<meta property="og:url" content="([^"]+)"',html)==[url], 'DETAIL_ID_MISMATCH'
 assert [text(x) for x in re.findall(r'<h1[^>]*>(.*?)</h1>',html,re.S)]==[row['name']], 'DETAIL_NAME_MISMATCH'
 images=re.findall(r'<img class="fit" src="([^"]+)"',html)
 assert images==[row['imageSourceUrl'].removeprefix(BASE)], 'DETAIL_IMAGE_MISMATCH'
 right=html.split('<div class="RightBox-inner">',1)[1]
 headings=[text(x) for x in re.findall(r'<h2[^>]*>(.*?)</h2>',right,re.S)]
 stage=re.search(r'<span class="type">(.*?)</span>',right,re.S)
 stage_text=re.sub(r'\s+','',text(stage[1])) if stage else None
 if stage_text in ['たね','1進化','2進化','復元']:
  category='pokemon';heading=stage_text
 else:
  assert headings and headings[0] in CATEGORIES, 'UNKNOWN_OFFICIAL_HEADING:'+str(headings[:1])
  heading=headings[0];category=CATEGORIES[heading]
 ace='ACE SPEC' in text(right) and bool(re.search(r'デッキに[1１]枚',text(right)))
 label=re.search(r'<div class="subtext Text-fjalla">(.*?)</div>',html,re.S)
 number=re.search(r'(\d+)\s*/\s*([A-Za-z0-9-]+)',text(label[1])) if label else None
 setcode=re.findall(r'class="img-regulation" alt="([^"]+)"',html)
 return {'officialCardId':ident,'category':category,'basicEnergy':heading=='基本エネルギー','aceSpec':ace,'pokemonStage':heading if category=='pokemon' else None,
   'pack':setcode[0] if len(setcode)==1 else None,'number':number[1]+'/'+number[2] if number else None,
   'source':{'url':url,'sha256':digest(raw),'heading':heading,'identityName':row['name'],'identityImageUrl':row['imageSourceUrl'], 'aceSpecRule': 'ACE SPEC' if ace else None}}

def main():
 registry=ROOT/'data/official-image-registry.json'; raw=registry.read_bytes(); rows={r['officialCardId']:r for r in json.loads(raw)['cards']}
 marks={}
 for p in sorted((ROOT/'data/image-automation/hij-v246').glob('confirmed-hij-*.json')):
  for r in json.loads(p.read_bytes()): marks[r['officialCardId']]={'mark':r['mark'],'imageSha256':r['imageSha256'],'evidencePath':str(p.relative_to(ROOT))}
 for r in json.loads((OUT/'supplemental-mark-evidence.json').read_bytes())['records']:
  marks[r['officialCardId']]={'mark':r['printedMark'],'imageSha256':r['officialImageSha256'],'evidencePath':'data/deck-building/supplemental-mark-evidence.json'}
 assert len(marks)==4357
 # Names only nominate candidates; the official heading must confirm basic energy.
 basics={i for i,r in rows.items() if re.fullmatch('基本[草炎水雷超闘悪鋼]エネルギー',r['name'])}
 targets=set(marks)|basics
 lock=threading.Lock(); next_request=[0.0]
 def one(ident):
  path=CACHE/(ident+'.json')
  if path.exists():
   cached=json.loads(path.read_bytes())
   if cached.get('source',{}).get('identityImageUrl')==rows[ident]['imageSourceUrl']: return cached
  try:
   with lock:
    time.sleep(max(0,next_request[0]-time.monotonic()));next_request[0]=time.monotonic()+0.1
   url=BASE+'/card-search/details.php/card/'+ident+'/regu/XY'
   with urlopen(Request(url,headers={'User-Agent':'PokecaDeckClassification/1.0','Accept':'text/html'}),timeout=25) as response:
    assert response.geturl()==url and response.headers.get_content_type()=='text/html','RESPONSE_TYPE'
    body=response.read(1_000_001); assert len(body)<=1_000_000,'OVERSIZED_RESPONSE'
   result=parse(body,rows[ident]);save(path,result);return result
  except Exception as e:return {'officialCardId':ident,'blocked':str(e)}
 results=[]
 with futures.ThreadPoolExecutor(max_workers=16) as pool:
  for n,r in enumerate(pool.map(one,sorted(targets,key=int)),1):
   results.append(r)
   if n%500==0 and os.environ.get('DECK_CLASSIFICATION_BRANCH'):
    branch=os.environ['DECK_CLASSIFICATION_BRANCH'];assert branch=='work/deck-work-002-hij'
    subprocess.run(['git','add','data/deck-building/checkpoint'],cwd=ROOT,check=True)
    if subprocess.run(['git','diff','--cached','--quiet'],cwd=ROOT).returncode:
     subprocess.run(['git','commit','-m',f'Checkpoint official deck classification: {n}/{len(targets)}'],cwd=ROOT,check=True)
     subprocess.run(['git','push','origin','HEAD:refs/heads/'+branch],cwd=ROOT,check=True)
   if n%100==0: print(json.dumps({'completed':n,'target':len(targets),'blocked':sum('blocked' in x for x in results)}),flush=True)
 records=[]; blocked=[]
 for r in results:
  ident=r['officialCardId']
  if 'blocked' in r:blocked.append(r);continue
  if ident not in marks and not r['basicEnergy']: continue
  r['regulationMark']=marks.get(ident,{}).get('mark')
  r['legality']='printed-hij' if ident in marks else 'official-basic-energy-exception'
  if ident in marks:r['markEvidence']=marks[ident]
  records.append(r)
 report={'schemaVersion':1,'registryCount':len(rows),'registrySha256':digest(raw),'hijTarget':len(marks),'records':records,'blocked':blocked,'basicEnergyRuleUrl':BASE+'/rules/regulation/'}
 save(OUT/'catalog.json',report)
 assert registry.read_bytes()==raw
 print(json.dumps({'done':len(records),'blocked':len(blocked)}),flush=True)
if __name__=='__main__':main()
