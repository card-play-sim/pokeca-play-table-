'use strict';
// Select exactly one verified shared-effect task for Codex. No automatic approval.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const input=process.argv[2],taskId=process.argv[3],output=process.argv[4];
if(!input||!taskId||!output||!fs.existsSync(input))throw Error('MISSING_VERIFIED_CODEX_TASK_INPUT');
const batch=JSON.parse(fs.readFileSync(input,'utf8'));
if(batch.purpose!=='OFFICIAL_EFFECT_SHARED_MECHANIC_CODEX_BATCH'||batch.status!=='READY_FOR_CODEX_REVIEW'||batch.counts?.blocked!==0||!Array.isArray(batch.tasks))throw Error('CODEX_TASK_BATCH_NOT_VERIFIED');
const matches=taskId==='AUTO'?[...batch.tasks].filter(t=>t.status==='CODEX_REVIEW_REQUIRED'&&Array.isArray(t.prints)&&t.prints.length).sort((a,b)=>b.prints.length-a.prints.length||a.taskId.localeCompare(b.taskId)).slice(0,1):batch.tasks.filter(t=>t.taskId===taskId);
if(matches.length!==1)throw Error('CODEX_TASK_NOT_UNIQUE_OR_NOT_FOUND');
const task=matches[0];
if(task.status!=='CODEX_REVIEW_REQUIRED'||!Array.isArray(task.evidence)||!task.evidence.length||!Array.isArray(task.prints)||!task.prints.length)throw Error('INVALID_CODEX_TASK_EVIDENCE');
const digest=t=>crypto.createHash('sha256').update(t).digest('hex');
if(typeof task.officialText!=='string'||!task.officialText.trim()||!['pokemon','item','supporter','stadium','tool','energy'].includes(task.category)||!['attack','ability','item','supporter','stadium','tool','energy','rule'].includes(task.effectKind))throw Error('INVALID_CODEX_TASK_CONTENT');
if(task.normalizedTextHash!==digest(task.officialText.normalize('NFKC').replace(/\s+/g,' ').trim()))throw Error('CODEX_TASK_TEXT_HASH_MISMATCH');
if(new Set(task.prints).size!==task.prints.length||task.evidence.length<task.prints.length)throw Error('INVALID_CODEX_TASK_PRINT_COVERAGE');
for(const print of task.prints){
 if(!/^\d{4,8}$/.test(String(print)))throw Error('INVALID_CODEX_PRINT_ID');
 if(!task.evidence.some(e=>e.officialCardId===print&&typeof e.officialPageUrl==='string'&&new RegExp('^https://www[.]pokemon-card[.]com/card-search/details[.]php/card/'+print+'(?:/|$)').test(e.officialPageUrl)&&/^[a-f0-9]{64}$/.test(e.officialTextSha256)))throw Error('MISSING_CODEX_PRINT_PROVENANCE:'+print);
}

// The hash of the task text is not a substitute for checking source rows.
for(const e of task.evidence){
 if(!task.prints.includes(e.officialCardId)||typeof e.officialPageUrl!=='string'||!new RegExp('^https://www[.]pokemon-card[.]com/card-search/details[.]php/card/'+e.officialCardId+'(?:/|$)').test(e.officialPageUrl)||typeof e.effectText!=='string'||digest(e.effectText)!==e.officialTextSha256||e.effectText.normalize('NFKC').replace(/\s+/g,' ').trim()!==task.officialText.normalize('NFKC').replace(/\s+/g,' ').trim()||e.category!==task.category||e.effectKind!==task.effectKind)throw Error('INVALID_CODEX_EVIDENCE_ROW');
}
const prompt=[
 'You are working in the existing Pokemon card PWA repository. Follow AGENTS.md.',
 'Implement ONLY the verified shared-effect task below. Do not make print-specific hacks.',
 'Do not alter approved 1945 formal data, reference plans, image registry, deck lists, GitHub workflows, sw.js or AGENTS.md.',
 'Do not guess any official text, effects or unsupported Rule Engine semantics. If insufficient evidence or contract, stop without edits.',
 'Keep source and ui/engine.bundle.js synchronized. Add regression tests for all affected prints.',
 'Ensure rejection rollback, legal target selection, deterministic replay and card conservation.',
 'Never publish or merge. A review-only PR is created by CI after tests.',
 '',
 'TASK_ID: '+task.taskId,
 'EFFECT_CATEGORY: '+task.category,
 'EFFECT_KIND: '+task.effectKind,
 'PRINT_IDS: '+task.prints.join(', '),
 'OFFICIAL_EFFECT_TEXT:',
 task.officialText,
 'VERIFIED_EVIDENCE:',
 ...task.evidence.map(e=>JSON.stringify(e)),
 'ACCEPTANCE:',
 ...task.acceptance.map(a=>'- '+a)
].join('\n')+'\n';
fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});
fs.writeFileSync(output,prompt);
console.log('CODEX_SELECTED_VERIFIED_TASK:',JSON.stringify({taskId,prints:task.prints.length,output}));
