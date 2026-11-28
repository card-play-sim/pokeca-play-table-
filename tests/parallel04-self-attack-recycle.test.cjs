'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),vm=require('node:vm');
const {compile}=require('../engine/reference-effect-plans.cjs'),rows=[];
for(const [name,type,destination,...ids] of [['ニトロ炎エネルギー','炎','hand','50165','50546'],['ブーメランエネルギー','無色','attached','45639','49454']])for(const officialCardId of ids){
 const saved=JSON.parse(fs.readFileSync('data/effect-extensions/evidence/'+officialCardId+'.json','utf8'));
 assert.equal(saved.url,'https://www.pokemon-card.com/card-search/details.php/card/'+officialCardId);
 assert.equal(crypto.createHash('sha256').update(saved.html).digest('hex'),saved.htmlSha256);
 assert.ok(saved.html.includes('カード詳細（'+name+'）'));
 const text=saved.html.match(/<h2 class="mt20">特殊エネルギー<\/h2>\s*<p>([\s\S]*?)<\/p>/)[1].replace(/<span class="icon-(fire|none) icon"><\/span>/g,(_,x)=>x==='fire'?'[炎]':'[無色]').replace(/<br\s*\/?>/g,'').replace(/\s+/g,'');
 const row={officialCardId,name,deckName:name,category:'energy',text,attacks:[],abilities:[],facts:{},set:'test',cardNumber:officialCardId,source:{sha256:saved.htmlSha256},imageSourceUrl:'test'};
 const p=compile({records:[row]}).records[0].mainPlan;assert.equal(p?.mechanic,'ENERGY_SELF_ATTACK_RECYCLE');assert.equal(p.energyType,type);assert.equal(p.destination,destination);assert.equal(p.holderType,type==='炎'?'炎':null);
 assert.notEqual(compile({records:[{...row,text:text+'追加条件。'}]}).records[0].mainPlan?.mechanic,p.mechanic);rows.push({...row,mainPlan:p});
}
const mon=(id,type)=>({officialCardId:id,name:id,deckName:id,category:'pokemon',attacks:[],abilities:[],facts:{types:[type],stage:0,basic:true,hp:300,retreatCost:1,prizeCount:1},set:'test',cardNumber:id,source:{sha256:'test'},imageSourceUrl:'test'});
const card=(r,id)=>({id,name:r.name,kind:r.category,hp:300,damage:0,energyCards:[],tools:[],isSpecial:r.category==='energy',validationReference:{officialCardId:r.officialCardId,officialName:r.name,set:r.set,cardNumber:r.cardNumber,sourceSha256:r.source.sha256,imageSourceUrl:r.imageSourceUrl,adopted:false}});
const source=fs.readFileSync('engine/pokeca_reference_effect_runtime.cjs','utf8');
function fixture(row,type){
 const a=mon('a',type),d=mon('d','草'),b=mon('b','炎'),catalog={records:[a,d,b,...rows]};
 const box={module:{exports:{}},require:n=>{if(n==='./pokeca_reference_effect_data')return catalog;if(n==='./pokeca_selection_constraints'||n==='./pokeca_engine_core')return {};if(n==='./pokeca_effect_extensions')return {catalog:x=>x};if(n==='./pokeca_effect_service')return {apply:(g,c,ctx)=>{if(c.command==='DAMAGE')g.players.flatMap(p=>[p.active,...p.bench]).find(x=>x.id===ctx.targetIds[0]).damage+=c.amount;else throw Error(c.command);}};throw Error(n);}};
 vm.runInNewContext(source+'\nObject.assign(module.exports,{testCandidates:selfAttackRecycleCandidates,testResolve:resolveSelfAttackRecycle,testApply:applyPlan});',box,{filename:'reference-runtime',timeout:10000});
 const attacker=card(a,'a'),defender=card(d,'d'),bench=card(b,'b'),energy=card(row,'e'),old=card(row,'old'),other=card(row,'other');
 attacker.energyCards=[energy];bench.energyCards=[other];
 const owner={id:'you',active:attacker,bench:[bench],hand:[],discard:[old],prizes:6},opp={id:'ai',active:defender,bench:[],hand:[],discard:[],prizes:6},g={turnNumber:3,history:[],players:[owner,opp]};
 return {runtime:box.module.exports,g,attacker,defender,bench,energy,old,other,owner,opp};
}
for(const row of rows){
 const p=row.mainPlan;
 for(const type of ['炎','草']){
  const f=fixture(row,type),{runtime:r,g,attacker:a,owner:o,energy:e}=f,eligible=type==='炎'||!p.holderType;
  assert.equal(r.energyUnits(a)[0][0],p.energyType);
  const candidates=r.testCandidates(a);assert.equal(candidates.length,eligible?1:0);
  r.testApply(g,'you',a,{damage:'100',plan:{mechanic:'DISCARD_ONE_SELF_ENERGY_ATTACK',commands:['DAMAGE','DISCARD']}},{type:'attack_turn',selections:{energy:['e']}});
  assert.equal(f.defender.damage,100);assert.equal(o.discard.includes(e),true);
  r.testResolve(g,'you',candidates,0);
  assert.equal(o.discard.includes(e),!eligible);assert.equal(o.hand.includes(e),eligible&&p.destination==='hand');assert.equal(a.energyCards.includes(e),eligible&&p.destination==='attached');
  assert.equal(o.discard.includes(f.old),true);assert.equal(f.bench.energyCards.includes(f.other),true);
  const before=JSON.stringify(g);r.testResolve(g,'you',candidates,0);assert.equal(JSON.stringify(g),before);
 }
 for(const mode of ['retreat','opponent','wrongHolder','stale','noDiscard','removedHolder']){
  const f=fixture(row,'炎'),{runtime:r,g,attacker:a,owner:o,energy:e}=f,candidates=r.testCandidates(a);
  if(mode!=='noDiscard'){a.energyCards=[];o.discard.push(e);}
  if(mode==='removedHolder'){o.active=f.bench;o.bench=[];}
  g.history.push({player:mode==='opponent'?'ai':'you',details:{command:'DISCARD',cardIds:['e'],...(mode==='retreat'?{}:{sourceInstanceId:mode==='wrongHolder'?'b':'a'})}});
  r.testResolve(g,'you',candidates,mode==='stale'?1:0);
  const returned=mode==='removedHolder'&&p.destination==='hand';
  assert.equal(o.hand.includes(e),returned);assert.equal(o.discard.includes(e),mode!=='noDiscard'&&!returned);assert.equal(o.discard.includes(f.old),true);
 }
}
console.log('OWNER04_SELF_ATTACK_ENERGY_RECYCLE_PASS',rows.length);
