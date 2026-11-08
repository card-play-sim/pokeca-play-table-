"""Extract reference facts for manual practice; no adopted identities or effect commands."""
import hashlib,importlib.util,json,re,sys
from html import unescape
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('preview',ROOT/'tools/build_fixed_preview.py');preview=importlib.util.module_from_spec(spec);spec.loader.exec_module(preview)
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def text(s):return re.sub(r'\s+','',unescape(re.sub('<[^>]*>','',s)))
def html_facts(path,ref):
 saved=json.loads(path.read_text());preview.checkpoint(str(path.relative_to(ROOT)),ref)
 html=saved['html']
 hp=re.findall(r'<span class="hp-num">(\d+)</span>',html)
 stage=re.findall(r'<span class="type">(.*?)</span>',html,re.S)
 escape=re.findall(r'<td class="escape">(.*?)</td>',html,re.S)
 assert len(hp)==len(stage)==len(escape)==1
 stage={'たね':0,'1進化':1,'2進化':2}[text(stage[0])]
 groups=re.findall(r'<div class="evolution ([^"]+)">(.*?)(?=<div class="evolution |\r?\n\s*</div>\r?\n\s*</div>)',html,re.S)
 # Direct predecessor is the next (lower-stage) group below ev_on in official evolution hierarchy.
 evolves=None
 if stage:
  on=next(i for i,(cls,_) in enumerate(groups) if 'ev_on' in cls.split() or 'class="in-box ev_on"' in _)
  assert ref['name'] in [unescape(n) for n in re.findall(r'<a [^>]+>([^<]+)</a>',groups[on][1])]
  lower=re.findall(r'<a [^>]+>([^<]+)</a>',groups[on+1][1]);assert len(lower)==1
  evolves=unescape(lower[0])
 retreat=len(re.findall(r'class="icon-none icon"',escape[0]))
 return {'hp':int(hp[0]),'basic':stage==0,'stage':stage,'evolvesFrom':evolves,'retreatCost':retreat}
def build(catalog_path):
 assert digest(catalog_path)=='6a6ba0837d3fc3392bfc41537d6666c19719ab554921d4e64fdb1bbbb615a790'
 catalog={str(c['officialCardId']):c for c in json.loads(catalog_path.read_text())['cards']}
 bindings=preview.build()['bindings'];manifest=preview.read('data/fixed-test-decks.json')
 categories={c['name']:c['category'] for d in manifest['decks'] for c in d['cards']}
 records=[]
 for binding in bindings:
  name=binding['deckName'];ref=binding['preview'];ident=ref['officialCardId'];category=categories[name]
  record={'name':name,'category':category,'referenceOfficialCardId':ident,'identityStatus':'UNCONFIRMED','effectStatus':'UNIMPLEMENTED','officialCardId':None,'catalogCardId':None}
  if category=='pokemon':
   if ident in catalog:
    c=catalog[ident];assert c['name']==name and c['verificationStatus']=='verified'
    stage={'たね':0,'1進化':1,'2進化':2}[c['pokemonStage']]
    facts={k:c[k] for k in ('hp','evolvesFrom','retreatCost')};facts.update(stage=stage,basic=stage==0)
    source={'kind':'formal1945-reference','sha256':digest(catalog_path),'path':'pokeca_card_catalog_HIJ/card_catalog.json'}
   else:
    path=ROOT/f'data/formal-1945-reconciliation/additional-details/{ident}.json'
    facts=html_facts(path,ref);source={'kind':'official-html-reference','sha256':digest(path),'path':str(path.relative_to(ROOT))}
   assert type(facts['hp']) is int and facts['hp']>0 and type(facts['retreatCost']) is int
   record.update(facts);record['source']=source
  elif category=='energy':
   match=re.fullmatch('基本([炎超悪])エネルギー',ref['name'])
   record.update(energyType=match[1] if match else None,isSpecial=not bool(match))
   record['source']=binding['evidence']
  else:record['source']=binding['evidence']
  records.append(record)
 return {'schemaVersion':1,'mode':'manual-practice-reference-facts','adoptedPrints':0,'officialEffectsConnected':False,'records':records}
if __name__=='__main__':
 source=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'work/slim1945/pokeca_card_catalog_HIJ/card_catalog.json'
 result=build(source)
 (ROOT/'data/fixed-deck-practice-facts.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 print('45 manual-practice reference fact records; no adopted IDs/effect commands')
