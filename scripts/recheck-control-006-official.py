"""Recheck priority ability reference text; never bind deck print IDs."""
import concurrent.futures,hashlib,html,json,os,re,subprocess,tempfile,unicodedata,sys
from pathlib import Path
from html.parser import HTMLParser
ROOT=Path(__file__).resolve().parents[1]
ICONS={'none':'無色','dark':'悪','psychic':'超','dragon':'竜','grass':'草','fire':'炎','water':'水','electric':'雷','fighting':'闘','steel':'鋼','fairy':'妖'}
class Text(HTMLParser):
 def __init__(self):super().__init__();self.parts=[]
 def handle_data(self,data):self.parts.append(data)
 def handle_starttag(self,tag,attrs):
  if tag=='img':self.parts.append(dict(attrs).get('alt',''))
  if tag=='span':
   for cls in dict(attrs).get('class','').split():
    if cls.startswith('icon-'):self.parts.append(ICONS.get(cls[5:],'[UNPARSED_ICON:'+cls+']'))
def norm(s):return re.sub(r'[\s\[\]［］]','',unicodedata.normalize('NFKC',s))
def atomic(path,value):
 path.parent.mkdir(parents=True,exist_ok=True)
 fd,name=tempfile.mkstemp(dir=path.parent,prefix='.pending-')
 with os.fdopen(fd,'w') as f:json.dump(value,f,ensure_ascii=False,indent=2);f.write('\n')
 os.replace(name,path)
def check(row):
 ident=row['officialCardId'];result={'referenceOfficialCardId':ident,'cardName':row['name'],'url':row['officialPageUrl'],'deckPrintAdopted':False,'storedSource':row['source']}
 try:
  assert re.match(r'https://www\.pokemon-card\.com/card-search/details\.php/card/'+ident+r'(?:/|$)',result['url'])
  raw=json.loads((ROOT/f'data/effect-evidence/control-006/{ident}.json').read_text())['html'].encode() if '--saved' in sys.argv else subprocess.check_output(['curl','-fLsS','--max-time','30',result['url']],stderr=subprocess.PIPE);body=raw.decode('utf-8');parser=Text();parser.feed(body);text=''.join(parser.parts);canonical=re.search(r'<meta property="og:url" content="([^"]+)"',body).group(1);heading=re.search(r'<h1[^>]*>(.*?)</h1>',body,re.S).group(1);assert re.search(r'/card/'+ident+r'(?:/regu/[^/]+)?/?$',canonical) and norm(heading)==norm(row['name']);result.update(canonicalUrl=canonical,headingMatches=True)
  checks=[{'effectId':a['effectId'],'name':a['name'],'text':a['text'],'textSha256':hashlib.sha256(a['text'].encode()).hexdigest(),'nameMatches':norm(a['name']) in norm(text),'textMatches':norm(a['text']) in norm(text)} for a in row['abilities']]
  result.update(status='MATCHED' if all(c['nameMatches'] and c['textMatches'] for c in checks) and norm(row['name']) in norm(text) else 'BLOCKED',htmlSha256=hashlib.sha256(raw).hexdigest(),effects=checks)
  path=ROOT/f'data/effect-evidence/control-006/{ident}.json';atomic(path,{'url':result['url'],'htmlSha256':result['htmlSha256'],'html':body});result['evidencePath']=str(path.relative_to(ROOT))
 except Exception as e:result.update(status='BLOCKED',reason=type(e).__name__)
 return result
if __name__=='__main__':
 catalog=json.loads((ROOT/'data/reference-effects/plans.json').read_text());ids=set(catalog['defaultValidationReferences'].values());rows=[r for r in catalog['records'] if r['officialCardId'] in ids and r['abilities']]
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(check,rows))
 report={'iconVocabulary':ICONS,'scope':'priority-reference-ability-text-not-deck-adoption','results':results,'matched':sum(r['status']=='MATCHED' for r in results),'blocked':sum(r['status']=='BLOCKED' for r in results)};atomic(ROOT/'reports/control-006-official-recheck.json',report);print(json.dumps({k:v for k,v in report.items() if k!='results'}))
