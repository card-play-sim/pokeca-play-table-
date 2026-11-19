#!/usr/bin/env python3
"""IMG-LEDGER-011: resumable, read-only per-run artifact and catalog SHA audit."""
import hashlib,io,json,os,pathlib,sys,time,urllib.request,urllib.error,zipfile
REPO='card-play-sim/pokeca-card-simulator'
SHA='6a6ba0837d3fc3392bfc41537d6666c19719ab554921d4e64fdb1bbbb615a790'
DEST=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else 'reports/img-ledger-011-deep-scan.json')
DEST.parent.mkdir(parents=True,exist_ok=True)
state=json.loads(DEST.read_text()) if DEST.exists() else {'repository':REPO,'expectedSha256':SHA,'nextRunPage':1,'runIdsProcessed':[],'runsScanned':0,'artifactsScanned':0,'artifactsDownloaded':0,'verified':[],'artifacts':[],'errors':[],'status':'IN_PROGRESS'}
token=os.environ.get('DEVELOPMENT_REPO_TOKEN') or os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN')
if not os.environ.get('DEVELOPMENT_REPO_TOKEN'):
 state['status']='BLOCKED_DEVELOPMENT_REPO_SECRET_NOT_CONFIGURED';state['requiredSecret']='DEVELOPMENT_REPO_READ_TOKEN';save_text=json.dumps(state,indent=2);DEST.write_text(save_text+'\n');sys.exit(0)
def req(url,binary=False):
 for attempt in range(5):
  try:
   request=urllib.request.Request(url,headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'})
   with urllib.request.urlopen(request,timeout=80) as response:
    return response.read(100*1024*1024+1) if binary else json.load(response)
  except urllib.error.HTTPError as e:
   if e.code not in (429,500,502,503,504) and not (e.code==403 and (e.headers.get('Retry-After') or e.headers.get('X-RateLimit-Remaining')=='0')):raise
   if attempt==4:raise
   wait=min(60,int(e.headers.get('Retry-After') or 2**attempt))
   time.sleep(wait)
  except (TimeoutError,urllib.error.URLError):
   if attempt==4:raise
   time.sleep(min(30,2**attempt))
def save():
 DEST.write_text(json.dumps(state,ensure_ascii=False,indent=2)+'\n')
def classify(e):
 if isinstance(e,urllib.error.HTTPError):return {'reason':'ACCESS_DENIED' if e.code in (401,403) else 'NOT_FOUND_OR_PRIVATE' if e.code==404 else 'HTTP_ERROR','httpStatus':e.code}
 return {'reason':'NETWORK_OR_ARCHIVE_ERROR','detail':str(e)[:200]}
def inspect(a):
 if a.get('expired'):return {'status':'EXPIRED'}
 try:
  data=req(a['archive_download_url'],True)
  if len(data)>100*1024*1024:return {'status':'ARCHIVE_TOO_LARGE'}
  state['artifactsDownloaded']+=1
  with zipfile.ZipFile(io.BytesIO(data)) as z:
   matches=[n for n in z.namelist() if n.split('/')[-1]=='card_catalog.json']
   if not matches:return {'status':'NO_CATALOG','files':len(z.namelist())}
   for n in matches:
    info=z.getinfo(n)
    if info.file_size>15*1024*1024:continue
    raw=z.read(n)
    digest=hashlib.sha256(raw).hexdigest()
    if digest!=SHA:continue
    obj=json.loads(raw)
    records=obj if isinstance(obj,list) else next((obj[k] for k in ('records','cards','entries') if isinstance(obj.get(k),list)),[])
    ids=[str(x.get('officialCardId','')) for x in records if isinstance(x,dict)]
    if len(records)==1945 and len(ids)==1945 and len(set(ids))==1945 and all(ids):
     return {'status':'VERIFIED','sha256':digest,'count':1945,'uniqueIds':1945,'path':n}
    return {'status':'HASH_MATCH_STRUCTURE_INVALID','count':len(records),'uniqueIds':len(set(ids))}
   return {'status':'SHA_MISMATCH','catalogFiles':len(matches)}
 except Exception as e:return {'status':'DOWNLOAD_OR_INSPECTION_ERROR',**classify(e)}
# Import verified direct-connector inspections, so resumed scans do not repeat them.
prior=pathlib.Path('reports/img-ledger-012-direct-scan.json')
if prior.exists() and not state.get('directCheckpointImported'):
 try:
  direct=json.loads(prior.read_text())
  for rid in direct.get('inspectedRunIds',[]):
   if rid not in state['runIdsProcessed']:state['runIdsProcessed'].append(rid)
  state['runsScanned']=len(state['runIdsProcessed'])
  state['directCheckpointImported']=True
 except (ValueError,KeyError) as e:state['errors'].append({'reason':'DIRECT_CHECKPOINT_INVALID','detail':str(e)})
processed=set(state['runIdsProcessed'])
try:
 page=state['nextRunPage']
 while True:
  runs=req(f'https://api.github.com/repos/{REPO}/actions/runs?per_page=100&page={page}').get('workflow_runs',[])
  if not runs:state['status']='COMPLETE' if not state['errors'] else 'COMPLETE_WITH_ERRORS';break
  for run in runs:
   rid=run['id']
   if rid in processed:continue
   run_report={'runId':rid,'createdAt':run.get('created_at'),'status':run.get('status'),'conclusion':run.get('conclusion'),'artifacts':0}
   ap=1
   while True:
    response=req(f'https://api.github.com/repos/{REPO}/actions/runs/{rid}/artifacts?per_page=100&page={ap}')
    artifacts=response.get('artifacts',[])
    for a in artifacts:
     item={'id':a['id'],'runId':rid,'name':a.get('name'),'sizeBytes':a.get('size_in_bytes'),'createdAt':a.get('created_at'),'expiresAt':a.get('expires_at'),'expired':a.get('expired')}
     item['inspection']=inspect(a)
     state['artifacts'].append(item)
     state['artifactsScanned']+=1
     run_report['artifacts']+=1
     if item['inspection']['status']=='VERIFIED':state['verified'].append(item)
    if len(artifacts)<100:break
    ap+=1
   state.setdefault('runs',[]).append(run_report)
   state['runsScanned']+=1
   state['runIdsProcessed'].append(rid)
   processed.add(rid)
   save()
  page+=1
  state['nextRunPage']=page
  save()
except Exception as e:
 state['status']='BLOCKED_OR_INTERRUPTED'
 state['errors'].append({'page':page,**classify(e)})
finally:
 save()
print(json.dumps({'status':state['status'],'runsScanned':state['runsScanned'],'artifactsScanned':state['artifactsScanned'],'downloaded':state['artifactsDownloaded'],'verified':len(state['verified']),'errors':len(state['errors'])}))
