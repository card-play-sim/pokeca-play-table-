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
if(!found.length)throw Error('TASK_ID_NOT_FOUND_IN_VERIFIED_SOURCES:'+id);
const primary=found[0];
for(const item of found.slice(1)){
 if(item.task.normalizedTextHash!==primary.task.normalizedTextHash||item.task.category!==primary.task.category||item.task.effectKind!==primary.task.effectKind||item.task.officialText!==primary.task.officialText)throw Error('TASK_ID_SOURCE_COLLISION:'+id);
}
fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});
fs.writeFileSync(out,JSON.stringify(primary.batch,null,2)+'\n');
console.log('CODEX_TASK_SOURCE_SELECTED:',JSON.stringify({taskId:id,source:primary.source,sourceCount:found.length}));
