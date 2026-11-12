'use strict';
// Group machine-readable regression failures into bounded, reviewable Codex tasks.
// No code changes, official DB writes, or automatic merge are performed here.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('USAGE: node scripts/group-effect-failures-for-codex.cjs failures.json tasks.json');
const source=JSON.parse(fs.readFileSync(input,'utf8'));
if(!Array.isArray(source))throw Error('FAILURES_MUST_BE_ARRAY');
const groups=new Map(),allowed=new Set(['pokemon','goods','support','stadium','tool','energy','ability','attack','unknown']);
for(const [index,f] of source.entries()){
 if(!f||typeof f!=='object')throw Error('INVALID_FAILURE:'+index);
 const causeId=String(f.causeId||'').trim(),command=String(f.command||'').trim();
 if(!/^[A-Z][A-Z0-9_]{2,100}$/.test(causeId)||!/^[A-Za-z][A-Za-z0-9_]{1,100}$/.test(command))throw Error('INVALID_FAILURE_ID:'+index);
 const officialCardId=String(f.officialCardId||'').trim();
 const category=String(f.category||'unknown');
 if(!allowed.has(category)|| (officialCardId&&!/^\d{1,8}$/.test(officialCardId)))throw Error('INVALID_CARD_ID_OR_CATEGORY:'+index);
 const key=causeId+'|'+command;
 if(!groups.has(key))groups.set(key,{causeId,command,prints:new Set(),categories:new Set(),tests:new Set(),evidence:new Set(),failures:0});
 const g=groups.get(key);g.failures++;g.categories.add(category);
 if(officialCardId)g.prints.add(officialCardId);
 if(typeof f.test==='string'&&/^tests\/[\w./-]+$/.test(f.test)&&!f.test.includes('..'))g.tests.add(f.test);
 if(typeof f.evidencePath==='string'&&/^data\/[\w./-]+$/.test(f.evidencePath)&&!f.evidencePath.includes('..'))g.evidence.add(f.evidencePath);
}
const tasks=[...groups.values()].sort((a,b)=>a.causeId.localeCompare(b.causeId)||a.command.localeCompare(b.command)).map(g=>{
 const prints=[...g.prints].sort((a,b)=>Number(a)-Number(b));
 const evidencePaths=[...g.evidence].sort(),tests=[...g.tests].sort();
 const taskId='effect-'+crypto.createHash('sha256').update(g.causeId+'|'+g.command).digest('hex').slice(0,16);
 const verified=evidencePaths.length>0&&tests.length>0&&prints.length>0;
 return {taskId,causeId:g.causeId,command:g.command,prints,categories:[...g.categories].sort(),tests,evidencePaths,occurrences:g.failures,
  status:verified?'CODEX_REVIEW_REQUIRED':'BLOCKED',
  blockedReason:verified?null:'MISSING_OFFICIAL_PRINT_EVIDENCE_OR_TEST',
  instructions:'Review official evidence and approved shared Effect Command contracts; fix shared cause across all affected prints. Preserve formal DB and image registry READ-ONLY. Run related regression tests. Never auto-merge or publish.'};
});
const result={schemaVersion:1,purpose:'OFFICIAL_EFFECT_SHARED_MECHANIC_CODEX_BATCH',generatedFrom:path.basename(input),tasks};
fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});
const tmp=output+'.tmp-'+process.pid;
try{fs.writeFileSync(tmp,JSON.stringify(result,null,2)+'\n',{flag:'wx'});fs.renameSync(tmp,output);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
console.log(JSON.stringify({tasks:tasks.length,review:tasks.filter(t=>t.status==='CODEX_REVIEW_REQUIRED').length,blocked:tasks.filter(t=>t.status==='BLOCKED').length}));
