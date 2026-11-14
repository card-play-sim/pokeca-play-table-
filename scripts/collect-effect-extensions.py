"""Fetch official trainer, Pokemon and special-energy prints; no image-ID adoption."""
import concurrent.futures,hashlib,json,re,subprocess,sys,os,tempfile
from pathlib import Path
from html.parser import HTMLParser
ROOT=Path(__file__).resolve().parents[1]
PRIOR=json.loads((ROOT/'data/effect-extensions/intake.json').read_text()) if (ROOT/'data/effect-extensions/intake.json').exists() else {'records':[],'blocked':[]}
BY_ID={r['officialCardId']:r for r in PRIOR['records']}
class Text(HTMLParser):
 def __init__(self):super().__init__();self.parts=[]
 def handle_data(self,s):self.parts.append(s)
def plain(s):
 p=Text();p.feed(s);return ''.join(p.parts).strip()
def save(path,value):
 path.parent.mkdir(parents=True,exist_ok=True);fd,tmp=tempfile.mkstemp(dir=path.parent)
 with os.fdopen(fd,'w') as f:json.dump(value,f,ensure_ascii=False,indent=2);f.write('\n')
 os.replace(tmp,path)
def collect(ident,saved=False,reparse=False):
 url='https://www.pokemon-card.com/card-search/details.php/card/'+ident;path=ROOT/f'data/effect-extensions/evidence/{ident}.json'
 try:
  prior=BY_ID.get(ident)
  if prior and not reparse:return {'status':'FETCHED','record':prior}
  body=json.loads(path.read_text())['html'] if saved or '--saved' in sys.argv else subprocess.check_output(['curl','-fsS','--max-time','30',url],stderr=subprocess.PIPE).decode('utf8')
  canonical=re.search(r'<meta property="og:url" content="([^"]+)"',body)[1];assert re.search('/card/'+ident+'/?$',canonical)
  sha=hashlib.sha256(body.encode()).hexdigest();save(path,{'url':url,'htmlSha256':sha,'html':body})
  name=plain(re.search(r'<h1[^>]*>(.*?)</h1>',body,re.S)[1]);section=re.search(r'<h2[^>]*>(グッズ|サポート|スタジアム|ポケモンのどうぐ)</h2>\s*<p[^>]*>(.*?)</p>',body,re.S)
  parsed=None
  if section:
   category={'グッズ':'item','サポート':'supporter','スタジアム':'stadium','ポケモンのどうぐ':'tool'}[section[1]]
   text=plain(section[2]) if '<span' not in section[2] else subprocess.check_output(['node','-e',"process.stdout.write(require('./scripts/parse-official-pokemon-energy.cjs').text(require('fs').readFileSync(0,'utf8')))"],input=section[2].encode(),stderr=subprocess.PIPE,cwd=ROOT).decode()
   assert text,'EMPTY_OFFICIAL_EFFECT'
  else:
   parsed=json.loads(subprocess.check_output(['node','scripts/parse-official-pokemon-energy.cjs'],input=body.encode(),stderr=subprocess.PIPE,cwd=ROOT));category=parsed['category'];text=parsed['text']
  image=re.search(r'<img[^>]*src="([^"]*/card_images/large/[^"]+)"',body)[1];image='https://www.pokemon-card.com'+image if image.startswith('/') else image
  record={'officialCardId':ident,'name':name,'deckName':name,'set':'OFFICIAL_PAGE_REFERENCE','cardNumber':'','officialPageUrl':url,'imageSourceUrl':image,'category':category,'deckPrintAdopted':False,'attacks':[],'abilities':[],'rulesText':[],'text':text,'facts':{'prizeCount':1,'rulePokemon':False,'teraBenchProtection':False},'source':{'kind':'saved-official-extension','path':str(path.relative_to(ROOT)),'sha256':sha,'htmlSha256':sha,'textSha256':hashlib.sha256(text.encode()).hexdigest()}}
  if parsed:record.update(parsed)
  return {'status':'FETCHED','record':record}
 except Exception as e:return {'status':'BLOCKED','officialCardId':ident,'officialPageUrl':url,'evidencePath':str(path.relative_to(ROOT)) if path.exists() else None,'reason':str(e) if isinstance(e,AssertionError) else (e.stderr.decode() if isinstance(e,subprocess.CalledProcessError) and e.stderr else type(e).__name__)}
if __name__=='__main__':
 ids=[s for s in sys.argv[1:] if s.isdigit()];assert ids and len(ids)==len(set(ids))
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(collect,ids))
 prior=PRIOR
 merged={r['officialCardId']:r for r in prior['records']}
 merged.update({r['record']['officialCardId']:r['record'] for r in results if r['status']=='FETCHED'})
 blockers={r['officialCardId']:r for r in prior.get('blocked',[]) if r['officialCardId'] not in ids}
 blockers.update({r['officialCardId']:r for r in results if r['status']=='BLOCKED'})
 save(ROOT/'data/effect-extensions/intake.json',{'schemaVersion':1,'scope':'SUPPLEMENTAL_OFFICIAL_REFERENCES_NOT_DECK_ADOPTION','records':list(merged.values()),'blocked':list(blockers.values())});print(json.dumps([{k:v for k,v in r.items() if k!='record'}|({'id':r['record']['officialCardId'],'name':r['record']['name'],'text':r['record']['text']} if 'record' in r else {}) for r in results],ensure_ascii=False))
