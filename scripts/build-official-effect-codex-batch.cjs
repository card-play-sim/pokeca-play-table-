'use strict';
// Build reviewable, shared-mechanic Codex work from verified official card text.
// Image registry entries are NEVER treated as proof of effect text.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const input=process.argv[2]||'data/official-effect-evidence.json';
const output=process.argv[3]||'reports/official-effect-codex-batch.json';
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
const result={schemaVersion:1,purpose:'OFFICIAL_EFFECT_SHARED_MECHANIC_CODEX_BATCH',source:input,
 sourcePolicy:'OFFICIAL_TEXT_REQUIRED_IMAGE_URL_IS_NOT_EFFECT_EVIDENCE',
 approvedSourceFiles:['engine/reference-effect-plans.cjs','engine/pokeca_reference_effect_runtime.cjs','engine/pokeca_reference_validation_adapter.cjs','ui/engine.bundle.js','tests/','scripts/'],
 forbiddenMutations:['formal1945','data/reference-effects/plans.json','data/fixed-test-decks.json','image registry','approved AI/Rule/Effect contracts'],
 tasks:[],blocked:[],counts:{received:0,verified:0,blocked:0,sharedPatterns:0},autoModify:false};
let rows=[];
if(!fs.existsSync(input))result.blocked.push({reason:'OFFICIAL_EFFECT_EVIDENCE_FILE_MISSING',source:input});
else{
 const data=JSON.parse(fs.readFileSync(input,'utf8'));
 if(!Array.isArray(data))throw Error('EVIDENCE_MUST_BE_ARRAY');
 rows=data;
}
result.counts.received=rows.length;
const grouped=new Map(),seen=new Map();
for(const row of rows){
 const ident=String(row?.officialCardId||'').trim(),category=String(row?.category||'').trim();
 const text=String(row?.effectText||'').trim(),url=String(row?.officialPageUrl||'').trim();
 const sourceHash=String(row?.officialTextSha256||'').toLowerCase();
 const kind=String(row?.effectKind||'').trim();
 const reasons=[];
 if(!/^\d{4,8}$/.test(ident))reasons.push('INVALID_OFFICIAL_CARD_ID');
 if(!['attack','ability','item','supporter','stadium','tool','energy','rule'].includes(kind))reasons.push('INVALID_EFFECT_KIND');
 if(!['pokemon','item','supporter','stadium','tool','energy'].includes(category))reasons.push('INVALID_CATEGORY');
 if(!text)reasons.push('MISSING_OFFICIAL_EFFECT_TEXT');
 if(!/^https:\/\/www\.pokemon-card\.com\//.test(url))reasons.push('INVALID_OFFICIAL_SOURCE_URL');
 if(!/^[a-f0-9]{64}$/.test(sourceHash)||sourceHash!==digest(text))reasons.push('OFFICIAL_TEXT_HASH_MISMATCH');
 const key=ident+':'+kind+':'+String(row?.effectName||'');
 if(seen.has(key)&&seen.get(key)!==sourceHash)reasons.push('CONFLICTING_EFFECT_EVIDENCE');
 if(seen.has(key)&&seen.get(key)===sourceHash)reasons.push('DUPLICATE_EFFECT_EVIDENCE');
 if(reasons.length){result.blocked.push({officialCardId:ident,effectKind:kind,reasons});continue;}
 seen.set(key,sourceHash);result.counts.verified++;
 // Exact normalized text is a conservative grouping key, not a claim of equivalent semantics.
 const normalized=text.normalize('NFKC').replace(/\s+/g,' ').trim();
 const groupKey=kind+':'+digest(normalized);
 const group=grouped.get(groupKey)||{effectKind:kind,normalizedTextHash:digest(normalized),officialText:normalized,prints:[],evidence:[]};
 if(!group.prints.includes(ident))group.prints.push(ident);
 group.evidence.push({officialCardId:ident,officialPageUrl:url,officialTextSha256:sourceHash,category,effectName:String(row.effectName||'')});
 grouped.set(groupKey,group);
}
result.tasks=[...grouped.values()].sort((a,b)=>b.prints.length-a.prints.length||a.normalizedTextHash.localeCompare(b.normalizedTextHash)).map((group,index)=>({
 taskId:'OFFICIAL_SHARED_EFFECT_'+String(index+1).padStart(4,'0'),status:'CODEX_REVIEW_REQUIRED',
 scope:'ONE_SHARED_EFFECT_PATTERN_ALL_AFFECTED_PRINTS',...group,
 instructions:['Verify official source and hash for every affected print','Compare with approved Effect Command contract; do not infer missing behavior','Implement or extend a reusable command, not a print-specific branch','Cover attacks, abilities and trainer categories using the same engine boundary','Add positive, invalid-action rollback, deterministic replay and card conservation tests for all affected prints','Synchronize browser bundle and run full CI; publish only after release gates pass'],
 acceptance:['OFFICIAL_EVIDENCE_VERIFIED','NO_UNAPPROVED_COMMAND_SEMANTICS','AFFECTED_PRINTS_REGRESSION_PASS','FULL_REFERENCE_EFFECT_CI_PASS','BROWSER_BUNDLE_SYNCHRONIZED']
}));
result.counts.sharedPatterns=result.tasks.length;result.counts.blocked=result.blocked.length;
result.status=result.blocked.length?'PARTIAL_BLOCKED':rows.length?'READY_FOR_CODEX_REVIEW':'BLOCKED_NO_EFFECT_EVIDENCE';
fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log('OFFICIAL_EFFECT_CODEX_BATCH:',JSON.stringify({status:result.status,counts:result.counts,output}));
if(result.status!=='READY_FOR_CODEX_REVIEW')process.exitCode=2;
module.exports={result};
