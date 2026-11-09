"""Derive print-specific text/facts; original DB and evidence are never modified."""
import hashlib,importlib.util,json,re
from html.parser import HTMLParser
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
COLORS={'grass':'草','fire':'炎','water':'水','lightning':'雷','psychic':'超','fighting':'闘','dark':'悪','metal':'鋼','dragon':'竜','none':'無色','void':'VOID'}
class N:
 def __init__(self,tag='',attrs=(),parent=None):self.tag=tag;self.attrs=dict(attrs);self.parent=parent;self.children=[]
 def all(self,tag=None,cls=None):
  out=[]
  for c in self.children:
   if isinstance(c,N):
    if (tag is None or c.tag==tag) and (cls is None or cls in c.attrs.get('class','').split()):out.append(c)
    out.extend(c.all(tag,cls))
  return out
 def text(self,icons=True):
  classes=self.attrs.get('class','').split()
  for key,value in COLORS.items():
   if 'icon-'+key in classes:return '['+value+']' if icons else ''
  return re.sub(r'\s+',' ',''.join(c.text(icons) if isinstance(c,N) else c for c in self.children)).strip()
 def energy(self):return [COLORS[k] for n in self.all() for k in COLORS if 'icon-'+k in n.attrs.get('class','').split()]
class DOM(HTMLParser):
 def __init__(self):super().__init__();self.root=N();self.current=self.root
 def handle_starttag(self,tag,attrs):
  n=N(tag,attrs,self.current);self.current.children.append(n)
  if tag not in ['br','hr','img','meta','link','input','source','wbr']:self.current=n
 def handle_endtag(self,tag):
  p=self.current
  while p.parent:
   if p.tag==tag:self.current=p.parent;break
   p=p.parent
 def handle_data(self,data):self.current.children.append(data)
def hash_file(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def read(path):return json.loads((ROOT/path).read_text())
def normalize(s):return re.sub(r'\s+','',s or '')
def html_card(path,ref,category):
 saved=read(path);assert hashlib.sha256(saved['html'].encode()).hexdigest()==saved['detailSha256']
 assert saved['candidate']['officialCardId']==ref['officialCardId']
 d=DOM();d.feed(saved['html']);assert [n.text(False) for n in d.root.all('h1','Heading1')]==[ref['name']]
 body=d.root.all(cls='RightBox-inner');assert len(body)==1;body=body[0]
 attacks=[];abilities=[];rules=[];main=[];section=None;current=None
 for n in body.children:
  if not isinstance(n,N):continue
  if n.tag=='h2':section=n.text(False);current=None
  elif n.tag=='h4' and section in ['ワザ','特性']:
   damage=n.all(cls='f_right');name=''.join(c.text(False) if isinstance(c,N) and 'f_right' not in c.attrs.get('class','') else c if isinstance(c,str) else '' for c in n.children).strip()
   current={'name':name,'text':''}
   if section=='ワザ':
    cost=n.energy();current.update(cost=[] if cost==['VOID'] else cost,damage=damage[0].text(False) if damage else None);attacks.append(current)
   else:abilities.append(current)
  elif n.tag=='p':
   t=n.text()
   if section=='特別なルール':rules.append(t)
   elif current is not None:current['text']+=t
   elif section in ['グッズ','サポート','ポケモンのどうぐ','スタジアム','特殊エネルギー','基本エネルギー']:main.append(t)
   elif t:rules.append(t)
 facts={}
 if category=='pokemon':
  spec=importlib.util.spec_from_file_location('facts',ROOT/'tools/build_fixed_practice_facts.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
  # Existing extractor expects replay paths; it verifies the same checkpoint again.
  facts=m.html_facts(ROOT/path,ref)
  top=body.all(cls='TopInfo')[0];facts['types']=[x for x in top.energy() if x!='VOID']
  table=body.all('table')[0];cells=table.all('td');assert len(cells)==3
  facts['weakness']={'types':cells[0].energy(),'value':cells[0].text(False)} if cells[0].energy() else None
  facts['resistance']={'types':cells[1].energy(),'value':cells[1].text(False)} if cells[1].energy() else None
 return {'attacks':attacks,'abilities':abilities,'rulesText':' '.join(dict.fromkeys(rules)),'text':' '.join(main),'facts':facts,'source':{'kind':'saved-official-html','path':path,'sha256':hash_file(ROOT/path),'htmlSha256':saved['detailSha256']}}
def build():
 rawpath=ROOT/'work/slim1945/pokeca_card_catalog_HIJ/card_catalog.json';assert hash_file(rawpath)=='6a6ba0837d3fc3392bfc41537d6666c19719ab554921d4e64fdb1bbbb615a790'
 formal={c['officialCardId']:c for c in json.loads(rawpath.read_text())['cards']}
 bindings=read('data/fixed-deck-preview-bindings.json')['bindings'];categories={c['name']:c['category'] for d in read('data/fixed-test-decks.json')['decks'] for c in d['cards']}
 refs={c['officialCardId']:c for file in ['data/formal-1945-reconciliation/candidate-evidence.json','data/formal-1945-reconciliation/additional-candidate-evidence.json'] for c in read(file)['cards']}
 for b in bindings:refs[b['preview']['officialCardId']]=b['preview']
 records=[]
 for ident,ref in sorted(refs.items(),key=lambda x:int(x[0])):
  deck_name=next((b['deckName'] for b in bindings if b['preview']['name']==ref['name']),ref['name']);category=categories[deck_name]
  if ident in formal and ident!='46662':
   c=formal[ident];assert c['name']==ref['name'];assert c['setName']==ref['set'];assert c['cardNumber']==ref['set']+' '+ref['cardNumber'];stage={'たね':0,'1進化':1,'2進化':2}[c['pokemonStage']]
   doc={'attacks':c['attacks'],'abilities':c['abilities'],'rulesText':c['rulesText'] or '', 'text':'','facts':{k:c[k] for k in ['hp','evolvesFrom','retreatCost','types','weakness','resistance']},'source':{'kind':'formal1945-readonly','path':'pokeca_card_catalog_HIJ/card_catalog.json','sha256':hash_file(rawpath),'recordSha256':hashlib.sha256(json.dumps(c,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()}}
   doc['facts'].update(stage=stage,basic=stage==0)
  else:
   paths=[f'data/reference-effects/evidence/{ident}.json',f'data/formal-1945-reconciliation/additional-details/{ident}.json',f'data/fixed-preview-evidence/details/{ident}.json',f'data/formal-1945-reconciliation/numbered-energy-details/{ident}.json']
   path=next(p for p in paths if (ROOT/p).exists());doc=html_card(path,ref,category)
  record={'officialCardId':ident,'name':ref['name'],'deckName':deck_name,'set':ref['set'],'cardNumber':ref.get('cardNumber'),'officialPageUrl':ref['officialPageUrl'],'imageSourceUrl':ref['imageSourceUrl'],'category':category,'deckPrintAdopted':False,**doc}
  rules=normalize(doc['rulesText']);record['facts']['prizeCount']=3 if 'メガシンカexがきぜつしたとき、相手はサイドを3枚とる。' in rules else 2 if 'ポケモンexがきぜつしたとき、相手はサイドを2枚とる。' in rules else 1
  record['facts']['rulePokemon']=bool(rules) if category=='pokemon' else False
  record['facts']['teraBenchProtection']='このポケモンは、ベンチにいるかぎり、ワザのダメージを受けない。' in rules
  records.append(record)
 return {'schemaVersion':1,'scope':'PRINT_SPECIFIC_EFFECT_REFERENCES_NOT_DECK_ADOPTION','adoptedDeckPrints':0,'defaultValidationReferences':{b['deckName']:b['preview']['officialCardId'] for b in bindings},'records':records}
if __name__=='__main__':
 out=build();(ROOT/'data/reference-effects/catalog.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');print('Extracted',len(out['records']),'exact official print references')
