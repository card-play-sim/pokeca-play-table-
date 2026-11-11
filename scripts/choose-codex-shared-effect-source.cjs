'use strict';
// Resolve stable task IDs without accidentally executing a different task from another source.
const fs=require('node:fs'),path=require('node:path');
const [id,out,...sources]=process.argv.slice(2);
if(!id||!out||sources.length===0)throw Error('TASK_SOURCE_ARGS_REQUIRED');
const found=[];
for(const source of sources){
 if(!fs.existsSync(source))continue;
 const batch=JSON.parse(fs.readFileSync(source,'utf8'));
 if(batch.purpose!=='OFFICIAL_EFFECT_SHARED_MECHANIC_CODEX_BATCH'||!Array.isArray(batch.tasks))throw Error('INVALID_TASK_SOURCE:'+source);
 const matches=batch.tasks.filter(t=>t.taskId===id);
 if(matches.length>1)throw Error('DUPLICATE_TASK_ID_IN_SOURCE:'+source);
 if(matches.length===1){
  if(batch.status!=='READY_FOR_CODEX_REVIEW'||batch.counts?.blocked!==0)throw Error('BLOCKED_TASK_SOURCE:'+source);
  found.push({source,batch,task:matches[0]});
 }
}
if(id==='AUTO'){
 const candidates=[];
 for(const source of sources){
  if(!fs.existsSync(source))continue;
  const batch=JSON.parse(fs.readFileSync(source,'utf8'));
  if(batch.purpose!=='OFFICIAL_EFFECT_SHARED_MECHANIC_CODEX_BATCH'||!Array.isArray(batch.tasks))throw Error('INVALID_TASK_SOURCE:'+source);
  if(batch.status!=='READY_FOR_CODEX_REVIEW'||batch.counts?.blocked!==0)continue;
  const seen=new Set();
  for(const task of batch.tasks){
   if(seen.has(task.taskId))throw Error('DUPLICATE_TASK_ID_IN_SOURCE:'+source);
   seen.add(task.taskId);
   if(task.status==='CODEX_REVIEW_REQUIRED'&&Array.isArray(task.prints)&&task.prints.length)candidates.push({source,batch,task});
  }
 }
 if(!candidates.length)throw Error('NO_VERIFIED_CODEX_TASKS_AVAILABLE');
 const byId=new Map();
 for(const item of candidates){
  const other=byId.get(item.task.taskId);
  if(other&&(other.task.normalizedTextHash!==item.task.normalizedTextHash||other.task.category!==item.task.category||other.task.effectKind!==item.task.effectKind||other.task.officialText!==item.task.officialText))throw Error('TASK_ID_SOURCE_COLLISION:'+item.task.taskId);
  if(!other)byId.set(item.task.taskId,item);
 }
 // WORK evidence has priority over reference data, including when it contains fewer prints.
 const preferred=candidates.filter(x=>x.source===sources[0]);
 const pool=preferred.length?preferred:candidates;
 pool.sort((a,b)=>b.task.prints.length-a.task.prints.length||a.task.taskId.localeCompare(b.task.taskId));
 const selected=pool[0];
 fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});
 fs.writeFileSync(out,JSON.stringify(selected.batch,null,2)+'\n');
 console.log('CODEX_TASK_SOURCE_SELECTED:',JSON.stringify({taskId:selected.task.taskId,source:selected.source,auto:true}));
 process.exit(0);
}
if(!found.length)throw Error('TASK_ID_NOT_FOUND_IN_VERIFIED_SOURCES:'+id);
const primary=found[0];
for(const item of found.slice(1)){
 if(item.task.normalizedTextHash!==primary.task.normalizedTextHash||item.task.category!==primary.task.category||item.task.effectKind!==primary.task.effectKind||item.task.officialText!==primary.task.officialText)throw Error('TASK_ID_SOURCE_COLLISION:'+id);
}
fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});
fs.writeFileSync(out,JSON.stringify(primary.batch,null,2)+'\n');
console.log('CODEX_TASK_SOURCE_SELECTED:',JSON.stringify({taskId:id,source:primary.source,sourceCount:found.length}));
