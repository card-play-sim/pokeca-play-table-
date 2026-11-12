'use strict';
// Durable task ledger for verified shared-effect Codex tasks. No automatic approvals.
const fs=require('node:fs'),path=require('node:path');
const [batchFile,ledgerFile,command,taskId,detail='']=process.argv.slice(2);
const states=['PENDING','RUNNING','FAILED','RETRY','REVIEW','VERIFIED','BLOCKED'];
if(!batchFile||!ledgerFile||!['sync','next','set','summary'].includes(command))throw Error('USAGE: task-ledger.cjs batch.json ledger.json sync|next|set|summary [taskId] [detail]');
const batch=JSON.parse(fs.readFileSync(batchFile,'utf8'));
if(batch.purpose!=='OFFICIAL_EFFECT_SHARED_MECHANIC_CODEX_BATCH'||!Array.isArray(batch.tasks))throw Error('INVALID_VERIFIED_BATCH');
const known=new Map(batch.tasks.filter(t=>t.status==='CODEX_REVIEW_REQUIRED').map(t=>[t.taskId,t]));
if(known.size!==batch.tasks.filter(t=>t.status==='CODEX_REVIEW_REQUIRED').length)throw Error('DUPLICATE_TASK_IDS');
const ledger=fs.existsSync(ledgerFile)?JSON.parse(fs.readFileSync(ledgerFile,'utf8')):{schemaVersion:1,tasks:{}};
if(ledger.schemaVersion!==1||!ledger.tasks||typeof ledger.tasks!=='object')throw Error('INVALID_LEDGER');
function save(){
 fs.mkdirSync(path.dirname(path.resolve(ledgerFile)),{recursive:true});
 const temp=ledgerFile+'.tmp-'+process.pid;
 try{fs.writeFileSync(temp,JSON.stringify(ledger,null,2)+'\n',{flag:'wx'});fs.renameSync(temp,ledgerFile);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
if(command==='sync'){
 let added=0;
 for(const [id,t] of known)if(!ledger.tasks[id]){ledger.tasks[id]={status:'PENDING',attempts:0,prints:t.prints.length,history:[]};added++;}
 save();console.log(JSON.stringify({added,total:Object.keys(ledger.tasks).length}));process.exit(0);
}
if(command==='summary'){
 const counts={};for(const t of Object.values(ledger.tasks))counts[t.status]=(counts[t.status]||0)+1;
 console.log(JSON.stringify(counts));process.exit(0);
}
if(command==='next'){
 const candidates=[...known.values()].filter(t=>['PENDING','RETRY'].includes(ledger.tasks[t.taskId]?.status)).sort((a,b)=>b.prints.length-a.prints.length||a.taskId.localeCompare(b.taskId));
 if(!candidates.length){console.log('NO_ELIGIBLE_TASK');process.exit(2);}
 console.log(candidates[0].taskId);process.exit(0);
}
if(!known.has(taskId)||!ledger.tasks[taskId])throw Error('UNKNOWN_TASK_ID');
if(!states.includes(detail))throw Error('INVALID_TARGET_STATUS');
const t=ledger.tasks[taskId],transitions={
 PENDING:['RUNNING','BLOCKED'],RUNNING:['FAILED','REVIEW','BLOCKED'],FAILED:['RETRY','BLOCKED'],
 RETRY:['RUNNING','BLOCKED'],REVIEW:['VERIFIED','FAILED','BLOCKED'],VERIFIED:[],BLOCKED:['RETRY']
};
if(!transitions[t.status]?.includes(detail))throw Error('ILLEGAL_TASK_TRANSITION:'+t.status+':'+detail);
if(detail==='RUNNING')t.attempts++;
t.history.push({from:t.status,to:detail,at:new Date().toISOString()});t.status=detail;
save();console.log(JSON.stringify({taskId,status:t.status,attempts:t.attempts}));
