'use strict';
// Turn verified CI cause batches into bounded, reviewable Codex tasks.
// No changes are made to source files or approved data.
const fs=require('node:fs'),path=require('node:path');
const input=process.argv[2]||'reports/reference-effect-codex-batch.json';
const output=process.argv[3]||'reports/reference-effect-codex-tasks.json';
if(!fs.existsSync(input))throw Error('MISSING_CODEX_CAUSE_BATCH');
const batch=JSON.parse(fs.readFileSync(input,'utf8'));
if(batch.purpose!=='CODEX_CROSS_JOB_SHARED_CAUSE_BATCH'||!Array.isArray(batch.issues)||!Array.isArray(batch.gaps)||batch.expectedJobs!==7)throw Error('INVALID_CODEX_CAUSE_BATCH');
const allowedFiles=['engine/pokeca_reference_effect_runtime.cjs','engine/pokeca_reference_validation_adapter.cjs','engine/reference-effect-plans.cjs','tests/','scripts/','ui/engine.bundle.js'];
const forbidden=['formal-1945','data/reference-effects/plans.json','data/fixed-test-decks.json','AI Core v0.2','Rule Engine v0.1.2','Effect Integration v0.1'];
const tasks=batch.issues.map((issue,index)=>{
 if(typeof issue.causeId!=='string'||typeof issue.command!=='string'||!Number.isInteger(issue.occurrences)||issue.occurrences<1||!Array.isArray(issue.affectedTests)||!Array.isArray(issue.affectedPrints))throw Error('INVALID_CODEX_ISSUE');
 return {taskId:'SHARED_CAUSE_'+String(index+1).padStart(3,'0'),status:'READY_FOR_CODEX_REVIEW',causeId:issue.causeId,command:issue.command,occurrences:issue.occurrences,affectedJobs:issue.affectedJobs,affectedTests:issue.affectedTests,affectedPrints:issue.affectedPrints,scope:'SHARED_MECHANIC_NOT_SINGLE_CARD',instructions:['Inspect official evidence and existing Effect Command contract before editing','Identify one shared cause across all affected cards','If official evidence or command contract is missing, record BLOCKED and stop without guessing','Add regression tests for all affected prints and command categories','Run all reference-effect CI jobs, verify bundle synchronization and PWA release','Do not declare published or Android-verified without independent evidence'],allowedFiles,forbiddenMutations:forbidden,acceptance:['ALL_AFFECTED_PRINTS_REGRESSION_PASS','FULL_REFERENCE_EFFECT_CI_PASS','SOURCE_BUNDLE_HASH_MATCH','NO_APPROVED_DATA_MUTATION']};
});
const blocked=batch.gaps.length>0;
const result={schemaVersion:1,purpose:'CODEX_REVIEWABLE_SHARED_EFFECT_TASKS',source:input,blockedByMissingOrInvalidEvidence:blocked,automatedFixAuthorized:false,taskCount:tasks.length,tasks,gaps:batch.gaps,nextAction:blocked?'REPAIR_CI_EVIDENCE_BEFORE_CODEX_EDITS':tasks.length?'REVIEW_AND_FIX_SHARED_CAUSES':'NO_RECORDED_CAUSES_NOT_PROOF_OF_FULL_EFFECT_SUPPORT',safety:'NO_AUTOMATIC_SOURCE_EDITS_NO_FORMAL_DB_MUTATION'};
fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log('CODEX_REVIEWABLE_TASKS:',JSON.stringify({tasks:tasks.length,blocked,output}));
if(blocked)process.exitCode=2;
module.exports={result};
