'use strict';
// Aggregate ALL independent CI jobs before offering any Codex fix batch.
// A missing or malformed artifact is BLOCKED, never interpreted as a pass.
const fs=require('node:fs'),path=require('node:path');
const root=process.argv[2]||'reports/ci-artifacts';
const output=process.argv[3]||'reports/reference-effect-codex-batch.json';
const expected=['smoke','opening-actions','opening-rejection','multi-turn','extended-gameplay','cross-category','provenance'];
const issues=new Map(),gaps=[],jobs=[];
for(const job of expected){
 const dir=job==='provenance'?'reference-effect-coverage':'reference-runtime-causes-'+job;
 const file=path.join(root,dir,'reference-effect-runtime-causes.json');
 if(!fs.existsSync(file)){gaps.push({job,reason:'MISSING_JOB_CAUSE_ARTIFACT'});jobs.push({job,status:'BLOCKED'});continue;}
 let report;
 try{report=JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){gaps.push({job,reason:'MALFORMED_JOB_CAUSE_ARTIFACT'});jobs.push({job,status:'BLOCKED'});continue;}
 if(report.purpose!=='CODEX_RUNTIME_FAILURE_CAUSE_HANDOFF'||!Array.isArray(report.issues)||!Array.isArray(report.malformed)||!Number.isInteger(report.structuredFailures)||!Number.isInteger(report.malformedRecords)||report.structuredFailures!==report.issues.reduce((n,x)=>n+x.occurrences,0)||report.malformedRecords!==report.malformed.length||report.safetyStopRequired!==(report.issues.length>0||report.malformedRecords>0)){
  gaps.push({job,reason:'INVALID_JOB_CAUSE_SCHEMA'});jobs.push({job,status:'BLOCKED'});continue;
 }
 jobs.push({job,status:report.safetyStopRequired?'BLOCKED':'NO_STRUCTURED_FAILURES',failures:report.structuredFailures});
 for(const malformed of report.malformed)gaps.push({job,reason:malformed.reason||'INVALID_LOG_RECORD'});
 for(const issue of report.issues){
  if(typeof issue.causeId!=='string'||typeof issue.command!=='string'||!Number.isInteger(issue.occurrences)||issue.occurrences<1){gaps.push({job,reason:'INVALID_ISSUE_SCHEMA'});continue;}
  const key=JSON.stringify([issue.causeId,issue.command]);
  const item=issues.get(key)||{causeId:issue.causeId,command:issue.command,status:'BLOCKED',occurrences:0,affectedJobs:[],affectedTests:[],affectedPrints:[],requiredWork:['FIX_SHARED_EFFECT_COMMAND_OR_RULE_ORDER','RETEST_ALL_AFFECTED_PRINTS','VERIFY_EXISTING_ANDROID_APP'],safety:'DO_NOT_MODIFY_FORMAL_DB_OR_APPROVED_CONTRACTS'};
  item.occurrences+=issue.occurrences;item.affectedJobs.push(job);
  for(const test of issue.affectedTests||[])if(!item.affectedTests.includes(test))item.affectedTests.push(test);
  for(const ident of issue.affectedPrints||[])if(!item.affectedPrints.includes(ident))item.affectedPrints.push(ident);
  issues.set(key,item);
 }
}
const grouped=[...issues.values()].map(x=>({...x,affectedJobs:x.affectedJobs.sort(),affectedTests:x.affectedTests.sort(),affectedPrints:x.affectedPrints.sort()})).sort((a,b)=>b.occurrences-a.occurrences||a.causeId.localeCompare(b.causeId)||a.command.localeCompare(b.command));
const batch={schemaVersion:1,purpose:'CODEX_CROSS_JOB_SHARED_CAUSE_BATCH',expectedJobs:expected.length,receivedJobs:jobs.filter(x=>x.status!=='BLOCKED').length,jobs,blocked:gaps.length>0||grouped.length>0,gaps,issues:grouped,nextAction:gaps.length?'STOP_AND_REPAIR_EVIDENCE_OR_CI':grouped.length?'FIX_SHARED_CAUSES_AND_RUN_FULL_REGRESSION':'NO_RECORDED_FAILURES_NOT_RELEASE_VERIFIED',limits:['NEVER_ASSUME_MISSING_JOB_PASSED','NO_AUTOMATIC_SOURCE_MODIFICATION','NO_FORMAL_DB_OR_APPROVED_SPEC_MUTATION','CI_PASS_IS_NOT_ANDROID_DEVICE_VERIFICATION']};
fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});fs.writeFileSync(output,JSON.stringify(batch,null,2)+'\n');
console.log('CODEX_CROSS_JOB_BATCH:',JSON.stringify({received:batch.receivedJobs,expected:expected.length,causes:grouped.length,gaps:gaps.length,blocked:batch.blocked}));
if(batch.blocked)process.exitCode=2;
module.exports={batch};
