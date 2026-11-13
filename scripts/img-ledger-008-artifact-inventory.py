#!/usr/bin/env python3
"""Read-only GitHub Actions artifact inventory, paginated and resumable via JSON checkpoint."""
import datetime,json,os,pathlib,subprocess,sys,urllib.request,urllib.error
repos=['card-play-sim/pokeca-play-table-','card-play-sim/pokeca-card-simulator']
out=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else 'reports/img-ledger-008-artifact-search.json')
out.parent.mkdir(parents=True,exist_ok=True)
token=os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN')
if not token: raise SystemExit('GH_TOKEN required')
checkpoint=json.loads(out.read_text()) if out.exists() else {'schemaVersion':1,'repositories':{},'candidates':[],'errors':[],'expectedSha256':'6a6ba0837d3fc3392bfc41537d6666c19719ab554921d4e64fdb1bbbb615a790'}
def get(url):
 req=urllib.request.Request(url,headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'})
 with urllib.request.urlopen(req,timeout=40) as response:return json.load(response)
for repo in repos:
 state=checkpoint['repositories'].setdefault(repo,{'nextPage':1,'runsScanned':0,'artifactsScanned':0,'candidateArtifacts':[],'expired':0,'complete':False})
 if state['complete']:continue
 page=state['nextPage']
 while True:
  try:data=get('https://api.github.com/repos/'+repo+'/actions/artifacts?per_page=100&page='+str(page))
  except urllib.error.HTTPError as e:
   checkpoint['errors'].append({'repository':repo,'page':page,'status':e.code,'reason':'PERMISSION_DENIED' if e.code in (401,403) else 'HTTP_ERROR'})
   break
  except Exception as e:
   checkpoint['errors'].append({'repository':repo,'page':page,'reason':'NETWORK_ERROR','detail':str(e)})
   break
  items=data.get('artifacts',[])
  for a in items:
   state['artifactsScanned']+=1
   if a.get('expired'):state['expired']+=1
   name=a.get('name','')
   if any(w in name.lower() for w in ('1945','formal','catalog','original','checkpoint','backup')):
    candidate={'repository':repo,'id':a['id'],'name':name,'createdAt':a.get('created_at'),'expiresAt':a.get('expires_at'),'expired':a.get('expired'),'sizeBytes':a.get('size_in_bytes'),'runId':(a.get('workflow_run') or {}).get('id'),'status':'UNVERIFIED_ARCHIVE_CONTENT'}
    state['candidateArtifacts'].append(candidate)
    checkpoint['candidates'].append(candidate)
  state['nextPage']=page+1
  out.write_text(json.dumps(checkpoint,ensure_ascii=False,indent=2)+'\n')
  if len(items)<100:state['complete']=True;break
  page+=1
checkpoint['status']='INVENTORY_COMPLETE' if all(x['complete'] for x in checkpoint['repositories'].values()) else 'INVENTORY_PARTIAL'
checkpoint['formalOriginalStatus']='BLOCKED_UNTIL_EXACT_SHA256_VERIFIED'
out.write_text(json.dumps(checkpoint,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'status':checkpoint['status'],'repositories':{k:{'artifactsScanned':v['artifactsScanned'],'candidateArtifacts':len(v['candidateArtifacts']),'complete':v['complete']} for k,v in checkpoint['repositories'].items()},'errors':len(checkpoint['errors'])}))
