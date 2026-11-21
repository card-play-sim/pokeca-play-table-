#!/usr/bin/env python3
"""Classify official IDs using complete official category-filtered search snapshots.
Detail HTML may be unavailable (403); no filenames or set codes determine category.
"""
import concurrent.futures, hashlib, json, re, threading, time, os, subprocess
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'data/deck-building';BASE='https://www.pokemon-card.com'
QUERIES={
 'pokemon':({'se_ta':'pokemon'},'カードの種別：ポケモン'),
 'goods':({'se_ta':'trainer','sc_tr_tr':1},'種類：グッズ'),
 'tool':({'se_ta':'trainer','sc_tr_goods':1},'種類：ポケモンのどうぐ'),
 'support':({'se_ta':'trainer','sc_tr_sp':1},'種類：サポート'),
 'stadium':({'se_ta':'trainer','sc_tr_st':1},'種類：スタジアム'),
 'energy':({'se_ta':'energy'},'カードの種別：エネルギー'),
 'basic':({'se_ta':'energy','sc_energy_basic':1},'エネルギーの種類：基本エネルギー'),
 'ace-trainer':({'se_ta':'trainer','sc_tr_acespec':1},'特別なトレーナーズ：ACE SPEC'),
 'ace-energy':({'se_ta':'energy','sc_en_acespec':1},'特別なエネルギー：ACE SPEC')}
LABELS={'pokemon':'ポケモン','goods':'グッズ','tool':'ポケモンのどうぐ','support':'サポート','stadium':'スタジアム','energy':'エネルギー'}
def sha(raw):return hashlib.sha256(raw).hexdigest()
def save(path,value):
 path.parent.mkdir(parents=True,exist_ok=True);raw=(json.dumps(value,ensure_ascii=False,separators=(',',':'))+'\n').encode();tmp=path.with_suffix('.tmp');tmp.write_bytes(raw);tmp.replace(path);assert path.read_bytes()==raw
lock=threading.Lock();next_request=[0.0]
def snapshot(key, folder_override=None):
 params,condition=({},'レギュレーション：スタンダード') if key=='standard' else QUERIES[key];reg='all' if key=='basic' else 'XY';folder=folder_override or OUT/'search'/key
 def page(n):
  url=BASE+'/card-search/resultAPI.php?'+urlencode({'keyword':'','regulation_sidebar_form':reg,**params,'page':n})
  path=folder/(str(n)+'.json')
  if path.exists():raw=path.read_bytes()
  else:
   for attempt in range(3):
    with lock:
     time.sleep(max(0,next_request[0]-time.monotonic()));next_request[0]=time.monotonic()+0.25
    try:
     with urlopen(Request(url,headers={'User-Agent':'PokecaDeckClassification/1.0','Accept':'application/json'}),timeout=25) as response:
      assert response.geturl()==url and response.headers.get_content_type()=='application/json','SEARCH_RESPONSE'
      raw=response.read(2_000_001);assert len(raw)<=2_000_000
     break
    except (URLError, TimeoutError) as error:
     if attempt==2 or isinstance(error,HTTPError) and error.code not in [429,500,502,503,504]:
      raise
     time.sleep(2**attempt)
   folder.mkdir(parents=True,exist_ok=True);path.write_bytes(raw)
  d=json.loads(raw)
  assert d.get('result')==1 and int(d['thisPage'])==n and d['regulation']==reg,'SEARCH_PAGE'
  assert condition in d['searchCondition'],'OFFICIAL_FILTER_NOT_APPLIED:'+key
  return d,{'url':url,'sha256':sha(raw),'path':str(path.relative_to(ROOT)),'searchCondition':d['searchCondition']}
 first,proof=page(1);results=[(first,proof)];pages=int(first['maxPage']);count=int(first['hitCnt'])
 with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:results+=list(pool.map(page,range(2,pages+1)))
 items={}
 for data,evidence in results:
  assert int(data['hitCnt'])==count and int(data['maxPage'])==pages,'SEARCH_CHANGED'
  for c in data['cardList']:
   ident=c['cardID'];assert ident not in items and re.fullmatch(r'[1-9][0-9]*',ident),'DUPLICATE_ID'
   items[ident]=(c,evidence)
 assert len(items)==count,'SEARCH_COUNT'
 print(json.dumps({'category':key,'count':count,'pages':pages}),flush=True)
 branch=os.environ.get('DECK_CLASSIFICATION_BRANCH')
 if branch:
  assert branch=='work/deck-work-002-hij'
  subprocess.run(['git','add',str(folder.relative_to(ROOT))],cwd=ROOT,check=True)
  if subprocess.run(['git','diff','--cached','--quiet'],cwd=ROOT).returncode:
   subprocess.run(['git','commit','-m','Checkpoint official category search: '+key],cwd=ROOT,check=True)
   subprocess.run(['git','push','origin','HEAD:refs/heads/'+branch],cwd=ROOT,check=True)
 return items

def discover(output):
 # Keep discovery evidence outside the protected classification and image
 # registry. Standard search membership does not prove the printed mark.
 items=snapshot('standard',ROOT/'work/official-standard-search')
 registry={row['officialCardId']:row for row in json.loads((ROOT/'data/official-image-registry.json').read_bytes())['cards']}
 classified={row['officialCardId'] for row in json.loads((OUT/'catalog.json').read_bytes())['records']}
 records=[]
 for ident,(candidate,proof) in sorted(items.items(),key=lambda row:int(row[0])):
  if ident in classified:
   continue
  name=candidate['cardNameAltText']
  image=urljoin(BASE,candidate['cardThumbFile'])
  assert name and image.startswith(BASE+'/assets/images/card_images/large/'),'INVALID_SEARCH_IDENTITY'
  known=registry.get(ident)
  if not known:
   reason='OFFICIAL_IMAGE_REGISTRY_ENTRY_REQUIRED'
  elif name!=known['name'] or image!=known['imageSourceUrl']:
   reason='OFFICIAL_SEARCH_IDENTITY_CONFLICT'
  else:
   reason='PRINTED_REGULATION_EVIDENCE_REQUIRED'
  records.append({'officialCardId':ident,'name':name,'imageSourceUrl':image,
                  'status':'BLOCKED','reason':reason,'source':proof})
 save(output,{'schemaVersion':1,'officialStandardPrints':len(items),'unclassified':records})
 print(json.dumps({'officialStandardPrints':len(items),'unclassified':len(records)}),flush=True)

def main():
 raw=(ROOT/'data/official-image-registry.json').read_bytes();registry={r['officialCardId']:r for r in json.loads(raw)['cards']};assert len(registry)==23525
 marks={}
 for p in sorted((ROOT/'data/image-automation/hij-v246').glob('confirmed-hij-*.json')):
  for r in json.loads(p.read_bytes()):marks[r['officialCardId']]={'mark':r['mark'],'imageSha256':r['imageSha256'],'evidencePath':str(p.relative_to(ROOT))}
 for r in json.loads((OUT/'supplemental-mark-evidence.json').read_bytes())['records']:
  marks[r['officialCardId']]={'mark':r['printedMark'],'imageSha256':r['officialImageSha256'],'evidencePath':'data/deck-building/supplemental-mark-evidence.json'}
 assert len(marks)==4357
 snapshots={k:snapshot(k) for k in QUERIES};aces=set(snapshots['ace-trainer'])|set(snapshots['ace-energy'])
 basics={i for i,(c,e) in snapshots['basic'].items() if re.fullmatch('基本[草炎水雷超闘悪鋼]エネルギー',c['cardNameAltText'])}
 records=[];blocked=[]
 for ident in sorted(set(marks)|basics,key=int):
  try:
   row=registry[ident];matches=[(k,v[ident]) for k,v in snapshots.items() if k in LABELS and ident in v]
   if ident in basics:
    category='energy';(candidate,evidence)=snapshots['basic'][ident];heading='基本エネルギー'
   else:
    assert len(matches)==1,'CATEGORY_NOT_UNIQUE_OR_MISSING'
    category,(candidate,evidence)=matches[0];heading=LABELS[category]
   assert row['name']==candidate['cardNameAltText'] and row['imageSourceUrl']==urljoin(BASE,candidate['cardThumbFile']),'SEARCH_IDENTITY_CONFLICT'
   detail=OUT/'checkpoint'/(ident+'.json');cached=json.loads(detail.read_bytes()) if detail.exists() else {}
   if cached:
    assert cached['source']['identityImageUrl']==row['imageSourceUrl'] and cached['source']['identityName']==row['name'],'DETAIL_CONFLICT'
    assert cached['category']==category,'DETAIL_CATEGORY_CONFLICT'
    assert cached['aceSpec']==(ident in aces),'DETAIL_ACE_CONFLICT'
   r={'officialCardId':ident,'category':category,'basicEnergy':ident in basics,'aceSpec':ident in aces,
      'pokemonStage':cached.get('pokemonStage'),'pack':cached.get('pack') or row.get('set'),'number':cached.get('number') or row.get('cardNumber'),
      'regulationMark':marks.get(ident,{}).get('mark'),'legality':'printed-hij' if ident in marks else 'official-basic-energy-exception',
      'source':{'kind':'official-filtered-search',**evidence,'heading':heading,'identityName':row['name'],'identityImageUrl':row['imageSourceUrl']}}
   if ident in marks:r['markEvidence']=marks[ident]
   records.append(r)
  except Exception as e:blocked.append({'officialCardId':ident,'blocked':str(e)})
 counts={}
 for r in records:
  m=r['regulationMark'] or 'basic';counts.setdefault(m,{});counts[m][r['category']]=counts[m].get(r['category'],0)+1
 save(OUT/'catalog.json',{'schemaVersion':1,'registryCount':len(registry),'registrySha256':sha(raw),'hijTarget':len(marks),'records':records,'blocked':blocked,'counts':counts,'basicEnergyRuleUrl':BASE+'/rules/regulation/'})
 assert (ROOT/'data/official-image-registry.json').read_bytes()==raw
 print(json.dumps({'classified':len(records),'blocked':blocked,'counts':counts},ensure_ascii=False),flush=True)
if __name__=='__main__':
 import argparse
 parser=argparse.ArgumentParser()
 parser.add_argument('--discover',action='store_true')
 options=parser.parse_args()
 if options.discover:
  discover(ROOT/'reports/official-effect-continuation/discovery.json')
 else:
  main()
