"""Incremental official HTML -> immutable evidence -> approved compiler -> durable queue.
No model API. Run again with the same state files to process new IDs only.
"""
import argparse,concurrent.futures,hashlib,importlib.util,json,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('existing_collector',ROOT/'scripts/collect-effect-extensions.py')
C=importlib.util.module_from_spec(spec);spec.loader.exec_module(C)
def node(*args):
 r=subprocess.run(['node',*args],cwd=ROOT,capture_output=True,text=True)
 if r.returncode:raise RuntimeError(r.stderr[-3000:] or r.stdout[-3000:])
 return r.stdout
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--ids');p.add_argument('--limit',type=int,default=100);p.add_argument('--adopt',action='store_true');p.add_argument('--retry-blocked',action='store_true');p.add_argument('--reparse-saved',action='store_true');p.add_argument('--max-tasks',type=int,default=10000);a=p.parse_args()
 assert 1<=a.limit<=10000 and a.max_tasks>0
 folder=ROOT/'data/official-effect-intake';folder.mkdir(exist_ok=True)
 file=folder/'checkpoint.json';prior=json.loads(file.read_text()) if file.exists() else {'schemaVersion':1,'records':[],'blocked':[]}
 records={r['officialCardId']:r for r in prior['records']};blocked={r['officialCardId']:r for r in prior['blocked']}
 base=json.loads((ROOT/'data/reference-effects/catalog.json').read_text());ext=json.loads((ROOT/'data/effect-extensions/intake.json').read_text());adopted={r['officialCardId'] for r in base['records']+ext['records']}
 ids=json.loads(Path(a.ids).read_text()) if a.ids else [r['officialCardId'] for r in json.loads((ROOT/'data/official-image-registry.json').read_text())['cards']]
 ids=list(dict.fromkeys(str(i) for i in ids));assert all(i.isdigit() and 4<=len(i)<=8 for i in ids)
 pending=[i for i in ids if ((a.reparse_saved and (ROOT/f'data/effect-extensions/evidence/{i}.json').exists()) or (i not in adopted and i not in records and (a.retry_blocked or i not in blocked)))][:a.limit]
 def collect(i):
  # Existing saved official HTML is preferred, including previously unparsed pages.
  path=ROOT/f'data/effect-extensions/evidence/{i}.json'
  if path.exists():
   proof=json.loads(path.read_text());assert hashlib.sha256(proof['html'].encode()).hexdigest()==proof['htmlSha256'],'CACHED_HTML_HASH_MISMATCH'
   # Existing collector is imported once; the mode is fixed for this per-call helper.
   return collect_saved(i)
  return C.collect(i)
 def collect_saved(i):
  return C.collect(i,saved=True,reparse=a.reparse_saved)
 results=[];saved=[i for i in pending if (ROOT/f'data/effect-extensions/evidence/{i}.json').exists()];network=[i for i in pending if i not in saved]
 for i in saved:
  try:results.append(collect(i))
  except Exception as e:results.append({'status':'BLOCKED','officialCardId':i,'reason':str(e)})
 def persist(r):
  if r['status']=='FETCHED':
   row=r['record'];records[row['officialCardId']]=row;blocked.pop(row['officialCardId'],None)
  else:blocked[r['officialCardId']]=r
  C.save(file,{'schemaVersion':1,'records':list(records.values()),'blocked':list(blocked.values())})
 for r in results:persist(r)
 def collect_network(i):
  # A single transient request failure must not abort the entire unattended batch.
  # Keep the failed ID retryable and persist every other successful result.
  try:return C.collect(i)
  except Exception as e:return {'status':'BLOCKED','officialCardId':i,'reason':'COLLECTOR_EXCEPTION','detail':str(e)[:500]}
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  for r in pool.map(collect_network,network):persist(r)
 # Persist before compilation/queue execution: interruptions never lose successful pages.
 C.save(file,{'schemaVersion':1,'records':list(records.values()),'blocked':list(blocked.values())})
 if a.adopt:
  merged={r['officialCardId']:r for r in ext['records']};merged.update(records)
  C.save(ROOT/'data/effect-extensions/intake.json',{**ext,'records':list(merged.values())})
  node('scripts/build-effect-extensions.cjs');node('scripts/sync-reference-effects.cjs')
 output=node('scripts/connect-official-effect-intake.cjs',str(a.max_tasks));print(output)
 print(json.dumps({'discoveredIds':len(ids),'newAttempts':len(pending),'newNetworkRequests':len(network),'savedPagesReused':len(saved),'remainingIds':sum(i not in adopted and i not in records and i not in blocked for i in ids),'checkpoint':str(file.relative_to(ROOT))}))
if __name__=='__main__':
 import fcntl
 (ROOT/'work').mkdir(exist_ok=True)
 with open(ROOT/'work/official-effect-intake.lock','a') as guard:
  fcntl.flock(guard,fcntl.LOCK_EX|fcntl.LOCK_NB)
  main()
