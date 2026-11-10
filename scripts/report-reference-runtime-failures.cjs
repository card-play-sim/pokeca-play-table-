'use strict';
// Parse structured runtime failures from CI logs; group by shared cause, not card.
// Input records must be emitted as: REFERENCE_RUNTIME_FAILURE_JSON:{"causeId":"...",...}
const fs=require('node:fs'),path=require('node:path');
const input=process.argv[2]||'reports/reference-effect-runtime.log';
const output=process.argv[3]||'reports/reference-effect-runtime-causes.json';
const groups=new Map(),malformed=[];
const inputPresent=fs.existsSync(input);
const lines=inputPresent?fs.readFileSync(input,'utf8').split(/\r?\n/):[];
if(!inputPresent)malformed.push({line:0,reason:'MISSING_RUNTIME_LOG'});
const prefix='REFERENCE_RUNTIME_FAILURE_JSON:';
for(let i=0;i<lines.length;i++){
 const pos=lines[i].indexOf(prefix);if(pos<0)continue;
 let item;try{item=JSON.parse(lines[i].slice(pos+prefix.length));}catch(e){malformed.push({line:i+1,reason:'INVALID_JSON'});continue;}
 if(!item||typeof item!=='object'||Array.isArray(item)||typeof item.causeId!=='string'||!/^[-A-Z0-9_]{2,120}$/.test(item.causeId)||typeof item.test!=='string'||!item.test.trim()){malformed.push({line:i+1,reason:'INVALID_FAILURE_SCHEMA'});continue;}
 const command=typeof item.command==='string'?item.command:'UNKNOWN';
 const fingerprint=JSON.stringify([item.causeId,command]);
 const group=groups.get(fingerprint)||{causeId:item.causeId,command,status:'BLOCKED',occurrences:0,affectedTests:[],affectedPrints:[],errors:[],requiredWork:['TRACE_COMMON_COMMAND_OR_RULE_ORDER','FIX_SHARED_CAUSE','RETEST_ALL_AFFECTED_CARDS'],safety:'NO_GUESSED_EFFECTS_NO_FORMAL_DB_MUTATION'};
 group.occurrences++;
 if(!group.affectedTests.includes(item.test))group.affectedTests.push(item.test);
 if(typeof item.officialCardId==='string'&&item.officialCardId&&!group.affectedPrints.includes(item.officialCardId))group.affectedPrints.push(item.officialCardId);
 if(typeof item.error==='string'&&item.error&&!group.errors.includes(item.error))group.errors.push(item.error.slice(0,400));
 groups.set(fingerprint,group);
}
const issues=[...groups.values()].map(x=>({...x,affectedTests:x.affectedTests.sort(),affectedPrints:x.affectedPrints.sort(),errors:x.errors.sort()})).sort((a,b)=>b.occurrences-a.occurrences||a.causeId.localeCompare(b.causeId)||a.command.localeCompare(b.command));
const handoff={schemaVersion:1,purpose:'CODEX_RUNTIME_FAILURE_CAUSE_HANDOFF',source:input,structuredFailures:issues.reduce((n,x)=>n+x.occurrences,0),malformedRecords:malformed.length,safetyStopRequired:issues.length>0||malformed.length>0,issues,malformed,nextAction:malformed.length?'FIX_FAILURE_RECORD_FORMAT':issues.length?'FIX_SHARED_RUNTIME_CAUSES_AND_RETEST':'NO_STRUCTURED_FAILURES_OBSERVED',limits:['NO_FAILURES_OBSERVED_IS_NOT_EXECUTION_VERIFIED','DO_NOT_MODIFY_FORMAL_1945_DB','DO_NOT_CHANGE_APPROVED_CONTRACTS']};
fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});
fs.writeFileSync(output,JSON.stringify(handoff,null,2)+'\n');
console.log('REFERENCE_RUNTIME_CAUSE_HANDOFF:',JSON.stringify({groups:issues.length,failures:handoff.structuredFailures,malformed:malformed.length,output}));
if(malformed.length)process.exitCode=2;
module.exports={handoff};
