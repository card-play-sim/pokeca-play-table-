'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'official-effect-pipeline-'));
const run=(script,args,status=0)=>{
 const p=cp.spawnSync(process.execPath,[path.join(root,'scripts',script),...args],{encoding:'utf8'});
 assert.equal(p.status,status,script+' '+p.stderr+' '+p.stdout);
 return p;
};
const hash=t=>crypto.createHash('sha256').update(t).digest('hex');
const row=(id,kind,index,text,name='テスト')=>({
 officialCardId:id,category:kind==='attack'||kind==='ability'?'pokemon':kind,effectKind:kind,effectIndex:index,effectName:name,
 effectText:text,officialTextSha256:hash(text),
 officialPageUrl:'https://www.pokemon-card.com/card-search/details.php/card/'+id
});
const input=path.join(dir,'input.ndjson'),registry=path.join(dir,'registry.json'),batch=path.join(dir,'batch.json'),prompt=path.join(dir,'prompt.md');
const shared='山札を2枚引く。';
const records=[row('45152','ability',0,shared,'能力A'),row('45152','ability',1,shared,'能力B'),row('45746','ability',0,shared,'能力A'),row('48248','attack',0,'相手のバトルポケモンに30ダメージ。','攻撃')];
try{
 fs.writeFileSync(input,records.map(x=>JSON.stringify(x)).join('\n')+'\n');
 run('import-official-effect-evidence.cjs',[input,registry,'--checkpoint']);
 assert.equal(JSON.parse(fs.readFileSync(registry)).length,4);
 run('build-official-effect-codex-batch.cjs',[registry,batch]);
 const result=JSON.parse(fs.readFileSync(batch));
 assert.equal(result.status,'READY_FOR_CODEX_REVIEW');
 assert.equal(result.tasks.length,2);
 const ability=result.tasks.find(t=>t.effectKind==='ability');
 assert.deepEqual(ability.prints.sort(),['45152','45746']);
 assert.equal(ability.evidence.length,3,'DISTINCT_EFFECT_SLOTS_MUST_SURVIVE_GROUPING');
 run('select-codex-shared-effect-task.cjs',[batch,ability.taskId,prompt]);
 const text=fs.readFileSync(prompt,'utf8');
 assert.ok(text.includes('PRINT_IDS: 45152, 45746'));
 assert.ok(text.includes('"effectIndex":1'));
 run('import-official-effect-evidence.cjs',[input,registry,'--checkpoint']);
 assert.equal(JSON.parse(fs.readFileSync(registry)).length,4,'REIMPORT_MUST_BE_IDEMPOTENT');
 const before=fs.readFileSync(registry,'utf8');
 const conflicting={...records[0],effectText:'改ざん',officialTextSha256:hash('改ざん')};
 fs.writeFileSync(input,JSON.stringify(conflicting)+'\n');
 run('import-official-effect-evidence.cjs',[input,registry,'--checkpoint'],2);
 assert.equal(fs.readFileSync(registry,'utf8'),before,'CONFLICT_MUST_NOT_CHANGE_REGISTRY');
 const journal=registry+'.checkpoint.ndjson';
 assert.equal(fs.existsSync(journal),true,'FAILED_IMPORT_MUST_RETAIN_CHECKPOINT_JOURNAL');
 fs.writeFileSync(input,JSON.stringify(records[0])+'\\n');
 run('import-official-effect-evidence.cjs',[input,registry,'--checkpoint']);
 assert.equal(fs.existsSync(journal),false,'SUCCESSFUL_RECOVERY_MUST_COMPACT_JOURNAL');
 assert.equal(JSON.parse(fs.readFileSync(registry)).length,4);
 const extra=row('48249','ability',0,'山札を3枚引く。','能力C');
 fs.writeFileSync(journal,JSON.stringify(extra)+'\\n');
 fs.writeFileSync(input,JSON.stringify(extra)+'\\n');
 run('import-official-effect-evidence.cjs',[input,registry,'--checkpoint']);
 assert.equal(JSON.parse(fs.readFileSync(registry)).length,5,'RECOVERED_JOURNAL_ROW_MUST_BE_PRESERVED');
 assert.equal(fs.existsSync(journal),false,'RECOVERED_JOURNAL_MUST_BE_REMOVED_AFTER_COMPACTION');
 console.log('OFFICIAL_EFFECT_PIPELINE PASS');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
