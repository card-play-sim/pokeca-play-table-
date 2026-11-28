'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),vm=require('node:vm');
const {compile}=require('../engine/reference-effect-plans.cjs'),rows=[];
for(const [name,category,mechanic,...ids] of [['レガシーエネルギー','energy','ENERGY_LEGACY_PRIZE_REDUCTION','45792','49457','46848','47220'],['リーリエのしんじゅ','tool','TOOL_TEAM_KO_PRIZE_REDUCTION','47101','49408']])for(const officialCardId of ids){
 const saved=JSON.parse(fs.readFileSync('data/effect-extensions/evidence/'+officialCardId+'.json','utf8'));
 assert.equal(saved.url,'https://www.pokemon-card.com/card-search/details.php/card/'+officialCardId);
 assert.equal(crypto.createHash('sha256').update(saved.html).digest('hex'),saved.htmlSha256);
 assert.ok(saved.html.includes('カード詳細（'+name+'）'));
 const text=saved.html.match(/<h2 class="mt20">(?:特殊エネルギー|ポケモンのどうぐ)<\/h2>\s*<p>([\s\S]*?)<\/p>/)[1].replace(/<br\s*\/?>/g,'').replace(/\s+/g,'');
 const row={officialCardId,name,deckName:name,category,text,attacks:[],abilities:[],facts:{},set:'test',cardNumber:officialCardId,source:{sha256:saved.htmlSha256},imageSourceUrl:'test'};
 const p=compile({records:[row]}).records[0].mainPlan;assert.equal(p?.mechanic,mechanic);assert.equal(p.amount,1);
 assert.notEqual(compile({records:[{...row,text:text+'追加条件。'}]}).records[0].mainPlan?.mechanic,mechanic);rows.push({...row,mainPlan:p});
}
const mon=(id,name,prizes)=>({officialCardId:id,name,deckName:name,category:'pokemon',attacks:[],abilities:[],facts:{types:['草'],stage:0,basic:true,hp:100,retreatCost:1,prizeCount:prizes},set:'test',cardNumber:id,source:{sha256:'test'},imageSourceUrl:'test'});
const card=(r,id)=>({id,name:r.name,kind:r.category,hp:100,damage:0,prizeCount:r.facts.prizeCount,energyCards:[],tools:[],validationReference:{officialCardId:r.officialCardId,officialName:r.name,set:r.set,cardNumber:r.cardNumber,sourceSha256:r.source.sha256,imageSourceUrl:r.imageSourceUrl,adopted:false}});
const source=fs.readFileSync('engine/pokeca_reference_effect_runtime.cjs','utf8');
function fixture(row,{prizes=2,team=true,used=false,jam=false}={}){
 const ar=mon('a','attacker',1),dr=mon('d',team?'リーリエのポケモン':'other',prizes),jr={...mon('j','jam',1),category:'stadium',mainPlan:{mechanic:'JAMMING'}};
 const catalog={records:[ar,dr,jr,...rows]},awards=[],box={module:{exports:{}},require:n=>{
 if(n==='./pokeca_reference_effect_data')return catalog;if(n==='./pokeca_selection_constraints')return {};if(n==='./pokeca_effect_extensions')return {catalog:x=>x};
 if(n==='./pokeca_engine_core')return {resolveKnockouts:(g,actor)=>{for(const p of g.players)for(const c of [p.active,...p.bench].filter(Boolean))if(c.damage>=c.hp)awards.push(c.prizeCount);},endTurn:()=>{}};
 if(n==='./pokeca_effect_service')return {apply:(g,c,ctx)=>{if(c.command==='DAMAGE'||c.command==='PLACE_DAMAGE_COUNTERS'){const m=g.players.flatMap(p=>[p.active,...p.bench]).find(x=>x.id===ctx.targetIds[0]);m.damage+=c.amount??c.counterCount*10;}else throw Error(c.command);}};
 throw Error(n);
 }};
 vm.runInNewContext(source+'\nObject.assign(module.exports,{testFinish:finishAttack,testCounters:counters});',box,{filename:'reference-runtime',timeout:10000});
 const a=card(ar,'a'),d=card(dr,'d'),e=card(row,'e');if(row.category==='energy')d.energyCards=[e];else d.tools=[e];
 const own={id:'you',active:a,bench:[],discard:[],prizes:6},opp={id:'ai',active:d,bench:[],discard:[],prizes:6,referenceLegacyPrizeReductionUsed:used},g={referenceEffectValidation:true,status:'active',turnNumber:3,history:[],stadium:jam?card(jr,'j'):null,players:[own,opp]};
 const runtime=box.module.exports;return {runtime,g,a,d,opp,e,awards,run:(amount)=>{runtime.damage(g,'you',d,amount);runtime.refresh(g);runtime.testFinish(g,'you');}};
}
for(const row of rows){
 const legacy=row.category==='energy';
 for(const prizes of [1,2,3]){
  const f=fixture(row,{prizes});if(legacy){assert.equal(f.runtime.energyUnits(f.d).length,1);for(const t of ['草','炎','水','雷','超','闘','悪','鋼','無色'])assert.ok(f.runtime.energyUnits(f.d)[0].includes(t));}
  f.run(100);assert.equal(f.awards[0],prizes-1);assert.equal(f.opp.referenceLegacyPrizeReductionUsed,legacy);assert.equal(f.g.referenceAttackPrizeReductions,undefined);
 }
 const nonlethal=fixture(row);nonlethal.run(90);assert.equal(nonlethal.awards.length,0);assert.equal(nonlethal.opp.referenceLegacyPrizeReductionUsed,false);
 const counters=fixture(row);counters.runtime.testCounters(counters.g,'you',counters.d,10,{attack:true});counters.runtime.testFinish(counters.g,'you');assert.equal(counters.awards[0],2);assert.equal(counters.opp.referenceLegacyPrizeReductionUsed,false);
 const after=fixture(row);after.runtime.damage(after.g,'you',after.d,100);after.d.damage=90;after.runtime.testFinish(after.g,'you');assert.equal(after.awards.length,0);assert.equal(after.opp.referenceLegacyPrizeReductionUsed,false);
 const neg=fixture(row,legacy?{used:true}:{team:false});neg.run(100);assert.equal(neg.awards[0],2);
 const jam=fixture(row,{jam:true});jam.run(100);assert.equal(jam.awards[0],legacy?1:2);
}
console.log('OWNER04_PRIZE_REDUCTION_CORE_INPUT_PASS',rows.length);
