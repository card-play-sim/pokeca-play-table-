'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),vm=require('node:vm');
const {compile}=require('../engine/reference-effect-plans.cjs');
const groups=[
 ['バブル水エネルギー','energy','ENERGY_TYPED_PASSIVE','50166','50547'],
 ['お祭り会場','stadium','STADIUM_ENERGY_STATUS_GUARD','45790','46841'],
 ['バトルコロシアム','stadium','STADIUM_BENCH_COUNTER_GUARD','48419','48514'],
 ['重力玉','tool','TOOL_BOTH_ACTIVE_RETREAT_INCREASE','46034'],
 ['きらめく結晶','tool','TOOL_TERA_ANY_COST_DISCOUNT','46033','46813','49396']
],rows=[];
for(const [name,category,mechanic,...ids] of groups)for(const officialCardId of ids){
 const saved=JSON.parse(fs.readFileSync('data/effect-extensions/evidence/'+officialCardId+'.json','utf8'));
 assert.equal(saved.url,'https://www.pokemon-card.com/card-search/details.php/card/'+officialCardId);
 assert.equal(crypto.createHash('sha256').update(saved.html).digest('hex'),saved.htmlSha256);
 assert.ok(saved.html.includes('カード詳細（'+name+'）'));
 const raw=saved.html.match(/<h2 class="mt20">(?:特殊エネルギー|ポケモンのどうぐ|スタジアム)<\/h2>\s*<p>([\s\S]*?)<\/p>/)[1];
 const text=raw.replace(/<span class="icon-water icon"><\/span>/g,'[水]').replace(/<br\s*\/?>/g,'').replace(/\s+/g,'');
 const row={officialCardId,name,deckName:name,category,text,attacks:[],abilities:[],facts:{},set:'test',cardNumber:officialCardId,source:{sha256:saved.htmlSha256},imageSourceUrl:'test'};
 const p=compile({records:[row]}).records[0].mainPlan;assert.equal(p?.mechanic,mechanic);
 assert.notEqual(compile({records:[{...row,text:text+'追加条件。'}]}).records[0].mainPlan?.mechanic,mechanic);
 rows.push({...row,mainPlan:p});
}
const mon=(id,type,tera=false)=>({officialCardId:id,name:id,deckName:id,category:'pokemon',attacks:[],abilities:[],facts:{types:[type],stage:0,basic:true,hp:300,retreatCost:3,prizeCount:1,teraBenchProtection:tera},set:'test',cardNumber:id,source:{sha256:'test'},imageSourceUrl:'test'});
const card=(r,id)=>({id,name:r.name,kind:r.category,hp:300,damage:0,energyCards:[],tools:[],validationReference:{officialCardId:r.officialCardId,officialName:r.name,set:r.set,cardNumber:r.cardNumber,sourceSha256:r.source.sha256,imageSourceUrl:r.imageSourceUrl,adopted:false}});
const source=fs.readFileSync('engine/pokeca_reference_effect_runtime.cjs','utf8');
function fixture(row,{type='水',tera=true,bench=false,jam=false}={}){
 const ar=mon('attacker',type,tera),dr=mon('defender','草'),br=mon('bench','草'),j={...mon('jam','無色'),category:'stadium',mainPlan:{mechanic:'JAMMING'}};
 const catalog={records:[ar,dr,br,j,...rows]},box={module:{exports:{}},require:n=>{
 if(n==='./pokeca_reference_effect_data')return catalog;
 if(n==='./pokeca_selection_constraints')return {};
 if(n==='./pokeca_effect_extensions')return {catalog:x=>x};
 if(n==='./pokeca_engine_core')return {};
 if(n==='./pokeca_effect_service')return {apply:(g,c,ctx)=>{const m=g.players.flatMap(p=>[p.active,...p.bench]).find(x=>x.id===ctx.targetIds[0]);if(c.command==='PLACE_DAMAGE_COUNTERS')m.damage+=10*c.counterCount;else throw Error(c.command);}};
 throw Error(n);
 }};
 vm.runInNewContext(source+'\nObject.assign(module.exports,{testStatus:applySpecialStatus,testCounters:counters,testMove:moveDamageCounters,testCost:cost,testPays:pays});',box,{filename:'reference-runtime',timeout:10000});
 const a=card(ar,'a'),d=card(dr,'d'),b=card(br,'b'),t=card(row,'t'),basic={id:'basic',kind:'energy',energyType:'草'};
 a.energyCards=[basic];if(row.category==='energy')a.energyCards.push(t);
 if(row.category==='tool')(bench?b:a).tools=[t];
 const g={referenceEffectValidation:true,turnNumber:3,history:[],stadium:jam?card(j,'jam'):row.category==='stadium'?t:null,players:[{id:'you',active:a,bench:[],discard:[],prizes:6},{id:'ai',active:d,bench:[b],discard:[],prizes:6}]};
 const runtime=box.module.exports;return {runtime,g,a,d,b,t};
}
for(const row of rows){
 const p=row.mainPlan,f=fixture(row),{runtime:r,g,a,d,b}=f;
 if(p.mechanic==='ENERGY_TYPED_PASSIVE'||p.mechanic==='STADIUM_ENERGY_STATUS_GUARD'){
  a.statusCondition='POISONED';a.statusConditionInfo={turn:1};r.refresh(g);assert.equal(a.statusCondition,null);assert.equal(a.statusConditionInfo,undefined);
  for(const s of ['POISONED','ASLEEP','PARALYZED','CONFUSED','BURNED']){assert.equal(r.testStatus(g,'ai',a,s),false);assert.equal(a.statusCondition,null);}
  assert.equal(r.testStatus(g,'you',d,'ASLEEP'),true);assert.equal(d.statusCondition,'ASLEEP');
  a.energyCards=[];assert.equal(r.testStatus(g,'ai',a,'ASLEEP'),true);assert.equal(a.statusCondition,'ASLEEP');
  if(row.category==='energy'){const bad=fixture(row,{type:'草'});assert.equal(bad.runtime.testStatus(bad.g,'ai',bad.a,'ASLEEP'),true);assert.equal(r.energyUnits({...a,energyCards:[f.t]})[0][0],'水');}
 }else if(p.mechanic==='STADIUM_BENCH_COUNTER_GUARD'){
  r.testCounters(g,'you',b,2,{attack:true});assert.equal(b.damage,0);
  r.testCounters(g,'you',b,2);assert.equal(b.damage,0);
  a.damage=30;r.testMove(g,'you',a,b,2);assert.equal(a.damage,30);assert.equal(b.damage,0);
  r.testCounters(g,'ai',b,2);assert.equal(b.damage,20);
  r.testCounters(g,'you',d,2,{attack:true});assert.equal(d.damage,20);
  assert.equal(r.damages(g,'you',b,100,{bench:true}),100);
  g.stadium=null;r.testCounters(g,'you',b,2);assert.equal(b.damage,40);
 }else if(p.mechanic==='TOOL_BOTH_ACTIVE_RETREAT_INCREASE'){
  r.refresh(g);assert.equal(a.retreatCost,4);assert.equal(d.retreatCost,4);assert.equal(b.retreatCost,3);
  a.tools=[];r.refresh(g);assert.equal(a.retreatCost,3);assert.equal(d.retreatCost,3);
  const j=fixture(row,{jam:true});j.runtime.refresh(j.g);assert.equal(j.a.retreatCost,3);
  const ben=fixture(row,{bench:true});ben.runtime.refresh(ben.g);assert.equal(ben.a.retreatCost,3);
 }else{
  for(const cost of [['草','炎'],['炎','草'],['草','無色']]){const c=r.testCost(g,a,{name:'attack',cost});assert.equal(c.length,1);assert.equal(r.testPays(a,c),true);}
  const cost=['草','炎','水'];assert.equal(r.testPays(a,r.testCost(g,a,{name:'attack',cost})),false);
  for(const opt of [{tera:false},{jam:true}]){const n=fixture(row,opt);assert.equal(n.runtime.testCost(n.g,n.a,{name:'attack',cost:['草','炎']}).length,2);}
 }
}
console.log('OWNER04_GUARD_AND_COST_RUNTIME_PASS',rows.length);
