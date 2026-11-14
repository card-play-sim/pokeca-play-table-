"""Cached official search discovery; IDs are candidates until detail-page verification."""
import hashlib,json,subprocess,sys,urllib.parse
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def save(file,value):
 file.parent.mkdir(parents=True,exist_ok=True);tmp=file.with_suffix('.tmp');tmp.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n');tmp.replace(file)
queries=sys.argv[1:] or ['基本'+t+'エネルギー' for t in '草炎水雷超闘悪鋼']+list(dict.fromkeys(r['name'] for r in json.loads((ROOT/'data/official-effect-intake/checkpoint.json').read_text())['records'] if r['category']=='energy'))
ids=[];blocked=[]
for name in queries:
 file=ROOT/'data/effect-extensions/discovery'/('search-'+hashlib.sha256(name.encode()).hexdigest()[:20]+'.json')
 try:
  if file.exists():
   proof=json.loads(file.read_text());assert hashlib.sha256(proof['body'].encode()).hexdigest()==proof['responseSha256'];body=proof['body']
  else:
   url='https://www.pokemon-card.com/card-search/resultAPI.php?'+urllib.parse.urlencode({'keyword':name,'freeword':name,'sm_and_keyword':'true','regulation_detail':'all'})
   body=subprocess.check_output(['curl','-fsS','--max-time','25',url],stderr=subprocess.PIPE).decode()
   save(file,{'url':url,'query':name,'responseSha256':hashlib.sha256(body.encode()).hexdigest(),'body':body,'purpose':'CANDIDATE_ID_DISCOVERY_NOT_EFFECT_VERIFICATION'})
  result=json.loads(body);assert result.get('result')==1
  found=[str(r['cardID']) for r in result['cardList'] if r['cardNameViewText']==name][:2];ids.extend(found)
  if len(found)<2:blocked.append({'query':name,'reason':'INSUFFICIENT_EXACT_NAME_RESULTS','found':len(found)})
 except Exception as e:blocked.append({'query':name,'reason':str(e)})
save(ROOT/'reports/official-effect-continuation/discovered-ids.json',list(dict.fromkeys(ids)));save(ROOT/'reports/official-effect-continuation/discovery-status.json',{'queries':len(queries),'ids':len(set(ids)),'blocked':blocked});print(json.dumps({'ids':list(dict.fromkeys(ids)),'blocked':blocked},ensure_ascii=False))
