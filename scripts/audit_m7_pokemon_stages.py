#!/usr/bin/env python3
"""Read-only M7 official stage audit: reuse canonical strict HTML parser, no guesses."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from hashlib import sha256
import json
import re
import subprocess
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
IDENTITIES=ROOT/'reports/m7-official-delta.json'
PRINTS=ROOT/'reports/m7-full-print-number-audit.json'
OUT=ROOT/'reports/m7-pokemon-stage-audit.json'
PARSER=ROOT/'scripts/parse-official-pokemon-energy.cjs'

def official_stage_field(body):
    # Stage-only fallback; never parse or accept gameplay effect text in this path.
    anchor='<div class="RightBox-inner">'
    if body.count(anchor)!=1:
        return None
    top=body.split(anchor,1)[1].split('<h2',1)[0]
    fields=re.findall(r'<span class="type">\\s*(たね|1進化|2進化)\\s*</span>',top)
    if len(fields)!=1:
        return None
    return {'たね':0,'1進化':1,'2進化':2}[fields[0]]

def collect(row,number):
    url=number['officialPageUrl']
    req=urllib.request.Request(url,headers={'User-Agent':'PokecaCatalogAudit/1.0'})
    with urllib.request.urlopen(req,timeout=30) as response:
        raw=response.read()
    digest=sha256(raw).hexdigest()
    ident=str(row['officialCardId'])
    if digest!=number['officialPageSha256']:
        return {'officialCardId':ident,'status':'BLOCKED_OFFICIAL_PAGE_HASH_DRIFT','observedSha256':digest,
                'expectedSha256':number['officialPageSha256']}
    result=subprocess.run(['node',str(PARSER)],input=raw.decode('utf-8'),text=True,capture_output=True,timeout=15,cwd=ROOT)
    if result.returncode!=0:
        stage=official_stage_field(raw.decode('utf-8'))
        if stage is not None:
            return {'officialCardId':ident,'status':'VERIFIED_OFFICIAL_STAGE_ONLY',
                    'pokemonStage':stage,'evolvesFrom':None,'basic':stage==0,
                    'strictParserReason':result.stderr.strip()[:300],
                    'officialPageUrl':url,'officialPageSha256':digest}
        return {'officialCardId':ident,'status':'BLOCKED_OFFICIAL_STAGE_PARSER',
                'reason':result.stderr.strip()[:300]}
    try:
        data=json.loads(result.stdout)
        facts=data['facts']
        stage=facts['stage']
        if data['category']!='pokemon' or type(stage)!=int or stage not in (0,1,2):
            raise ValueError('INVALID_OFFICIAL_STAGE')
    except (ValueError,TypeError,KeyError) as error:
        return {'officialCardId':ident,'status':'BLOCKED_OFFICIAL_STAGE_UNKNOWN','reason':str(error)}
    return {'officialCardId':ident,'status':'VERIFIED_OFFICIAL_STAGE','pokemonStage':stage,
            'evolvesFrom':facts.get('evolvesFrom'),'basic':facts.get('basic'),
            'officialPageUrl':url,'officialPageSha256':digest}

def main():
    catalog=json.loads(IDENTITIES.read_text(encoding='utf-8'))
    numbers=json.loads(PRINTS.read_text(encoding='utf-8'))
    rows=catalog['records']
    if catalog['officialFound']!=78 or numbers['verifiedPrints']!=78:
        raise RuntimeError('M7_OFFICIAL_IDENTITY_COVERAGE_INCOMPLETE')
    by_id={str(v['officialCardId']):v for v in numbers['records']}
    if len(by_id)!=78:
        raise RuntimeError('M7_OFFICIAL_PRINT_IDENTITY_DUPLICATE')
    pokemon=[r for r in rows if r['category']=='pokemon']
    verified=[]; blocked=[]
    with ThreadPoolExecutor(max_workers=4) as pool:
        jobs={pool.submit(collect,row,by_id[str(row['officialCardId'])]):row for row in pokemon}
        for job in as_completed(jobs):
            result=job.result()
            (verified if result['status'].startswith('VERIFIED_OFFICIAL_STAGE') else blocked).append(result)
    verified.sort(key=lambda r:int(r['officialCardId']))
    blocked.sort(key=lambda r:int(r['officialCardId']))
    outcome={'schemaVersion':1,'status':'OFFICIAL_STAGE_AUDIT_NOT_J_MARK_VERIFICATION',
             'expectedPokemon':len(pokemon),'verifiedPokemon':len(verified),
             'blockedPokemon':len(blocked),
             'strictStageAndEffects':sum(r['status']=='VERIFIED_OFFICIAL_STAGE' for r in verified),
             'stageOnly':sum(r['status']=='VERIFIED_OFFICIAL_STAGE_ONLY' for r in verified),
             'verified':verified,'blocked':blocked,
             'catalogUnchanged':True}
    OUT.parent.mkdir(exist_ok=True,parents=True)
    OUT.write_text(json.dumps(outcome,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'officialM7':78,'pokemon':len(pokemon),'verifiedStage':len(verified),
        'blockedStage':len(blocked),'catalogMutated':False},ensure_ascii=False))
    if not verified:
        raise RuntimeError('M7_NO_VERIFIED_OFFICIAL_POKEMON_STAGES')
if __name__=='__main__':main()
