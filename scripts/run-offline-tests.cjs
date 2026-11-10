'use strict';
const {spawnSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const output=process.env.EFFECT_DIAGNOSTICS_PATH||'artifacts/effect-test-diagnostics.json';
const files=fs.readdirSync('tests').filter(f=>/\.(?:test\.(?:cjs|js|mjs)|cjs)$/.test(f)).sort();
const results=[];
function classify(file,log){
 if(/OFFICIAL_RULING_EVIDENCE_MISMATCH|source fingerprint|SOURCE_|EVIDENCE_|OFFICIAL_/.test(log))return 'OFFICIAL_EVIDENCE';
 if(/REFERENCE_BUNDLE_STALE|BUNDLE_|generated bundle/.test(log))return 'GENERATED_BUNDLE';
 if(/INVALID_REFERENCE_SELECTION|_NOT_ALLOWED|_REQUIRED|LEGAL_ACTION|RULE_ORDER/.test(log))return 'RULE_ENGINE';
 if(/effect|command|reference|goods|supporter|stadium/i.test(file))return 'EFFECT_INTEGRATION';
 if(/pwa|mobile|ui|image|browser/i.test(file))return 'UI_OR_PUBLICATION';
 return 'OTHER';
}
for(const file of files){
 const result=spawnSync(process.execPath,['tests/'+file],{encoding:'utf8',timeout:900000,maxBuffer:16*1024*1024});
 const log=(result.stdout||'')+(result.stderr||'')+(result.error?'\n'+result.error.message:'');
 if(log)process.stdout.write(log);
 const passed=result.status===0&&!result.error;
 if(!passed)console.error('FAIL',file,result.error?.message||result.status);
 results.push({test:file,status:passed?'PASS':'FAIL',category:passed?null:classify(file,log),exitCode:result.status,signal:result.signal||null,excerpt:passed?'':log.slice(-4000)});
}
const report={schemaVersion:1,scope:'all-offline-tests',total:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results};
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log('DIAGNOSTICS',output,'failed='+report.failed);
if(report.failed)process.exitCode=1;
