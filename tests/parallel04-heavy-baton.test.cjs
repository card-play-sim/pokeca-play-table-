'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {compile}=require('../engine/reference-effect-plans.cjs');
function verify(compile,source,saved,hash){
 let n=0;const eq=(a,b)=>{n++;assert.equal(a,b);};
 const v=JSON.parse(saved);hash(v);eq(v.url,'https://www.pokemon-card.com/card-search/details.php/card/45283');
 const text=v.html.match(/<h2 class="mt20">ポケモンのどうぐ<\/h2>\s*<p>([\s\S]*?)<\/p>/)[1].replace(/\s+/g,'');
 const row={officialCardId:'45283',name:'ヘビーバトン',deckName:'ヘビーバトン',category:'tool',text,attacks:[],abilities:[],facts:{},set:'test',cardNumber:'45283',source:{sha256:v.htmlSha256},imageSourceUrl:'test'};
 const tool=compile({records:[row]}).records[0];eq(tool.mainPlan.mechanic,'TOOL_HEAVY_BATON');eq(tool.mainPlan.limit,3);eq(tool.mainPlan.retreat,4);
 eq(compile({records:[{...row,text:text+'追加条件。'}]}).records[0].mainPlan?.mechanic==='TOOL_HEAVY_BATON',false);
 const mon=(officialCardId,name)=>({officialCardId,name,deckName:name,category:'pokemon',attacks:[],abilities:[],facts:{types:['闘'],hp:100,stage:0,basic:true,prizeCount:1,retreatCost:4},set:'test',cardNumber:officialCardId,source:{sha256:'test'},imageSourceUrl:'test'});
 const base=mon('p','テスト'),energy={...row,officialCardId:'e',name:'基本闘エネルギー',deckName:'基本闘エネルギー',cardNumber:'e',category:'energy',mainPlan:{mechanic:'BASIC_ENERGY',commands:['ATTACH_ENERGY']}},special={...energy,officialCardId:'s',cardNumber:'s',name:'特殊エネルギー',deckName:'特殊エネルギー'},jam={...row,officialCardId:'jam',cardNumber:'jam',name:'ジャミングタワー',deckName:'ジャミングタワー',category:'stadium',mainPlan:{mechanic:'JAMMING'}};
 const catalog={records:[tool,base,energy,special,jam]},card=(r,id)=>({id,name:r.name,kind:r.category,hp:r.facts.hp,damage:0,basic:r.facts.basic,stage:r.facts.stage,retreatCost:4,energyType:r.category==='energy'?'闘':undefined,isSpecial:r===special,energyCards:[],tools:[],validationReference:{officialCardId:r.officialCardId,officialName:r.name,set:r.set,cardNumber:r.cardNumber,sourceSha256:r.source.sha256,imageSourceUrl:r.imageSourceUrl,adopted:false}});
 let calls=[];const m={exports:{}};
 function req(x){if(x==='./pokeca_reference_effect_data')return catalog;if(x==='./pokeca_selection_constraints')return {};if(x==='./pokeca_effect_extensions')return {catalog:x=>x};if(x==='./pokeca_engine_core')return {resolveKnockouts:()=>calls.push('KO'),endTurn:()=>calls.push('END')};if(x==='./pokeca_effect_service')return {apply:(g,c,ctx)=>{const t=g.players.flatMap(p=>[p.active,...p.bench]).find(x=>x.id===ctx.targetIds[0]);eq(c.command,'DAMAGE');t.damage+=c.amount;}};throw Error(x);}
 new Function('require','module','exports',source+'\nmodule.exports.finishAttackTest=finishAttack;module.exports.noteHeavyBatonTest=noteHeavyBaton;')(req,m,m.exports);
 const X=m.exports;
 function fixture({retreat=4,bench=false,jamming=false,count=4,emptyBench=false,actor='you'}={}){
  calls=[];const other=actor==='you'?'ai':'you',a=card(base,'a'),d=card(base,'d');d.retreatCost=retreat;d.tools=[card(tool,'tool')];d.energyCards=[...Array.from({length:count},(_,i)=>card(energy,'e'+i)),card(special,'special')];
  const p={id:actor,active:a,bench:[],deck:[],hand:[],discard:[]},q={id:other,active:bench?card(base,'qa'):d,bench:emptyBench?[]:bench?[d,card(base,'b1')]:[card(base,'b1'),card(base,'b2')],deck:[],hand:[],discard:[]};
  const g={referenceEffectValidation:{adoptedPrints:0},turnNumber:3,turnPlayer:actor,status:'active',phase:'main',history:[],players:[p,q],stadium:jamming?card(jam,'jam'):null};
  return {g,d,q,actor};
 }
 function hit(f,amount=100,opts={}){X.damage(f.g,f.actor,f.d,amount,opts);X.finishAttackTest(f.g,f.actor);}
 function choose(f,energyId,benchInstanceId){const a=X.referenceChoiceAction(f.g.pendingReferenceChoice,{energyId,benchInstanceId});X.execute(f.g,f.q.id,a);}
 for(const actor of ['you','ai']){
  let f=fixture({actor});hit(f);eq(f.g.pendingReferenceChoice.kind,'TOOL_HEAVY_BATON');eq(f.g.pendingReferenceChoice.options.length,8);eq(calls.length,0);
  eq(X.preflight(f.g,f.q.id,{type:'resolve_reference_choice',energyId:'special',benchInstanceId:'b1'}).errors.length>0,true);
  eq(X.preflight(f.g,f.q.id,{type:'resolve_reference_choice',energyId:'e0',benchInstanceId:'d'}).errors.length>0,true);
  eq(X.preflight(f.g,f.q.id,{type:'resolve_reference_choice'}).errors.length>0,true);
  eq(X.preflight(f.g,f.actor,{type:'resolve_reference_choice',energyId:'e0',benchInstanceId:'b1'}).errors.length>0,true);
  choose(f,'e0','b1');eq(f.g.pendingReferenceChoice.moved,1);eq(f.g.pendingReferenceChoice.options.some(x=>x.energyId==='e0'),false);X.validateGame(f.g);
  choose(f,'e1','b2');choose(f,'e2','b1');
  eq(f.q.bench[0].energyCards.map(x=>x.id).join(','),'e0,e2');eq(f.q.bench[1].energyCards.map(x=>x.id).join(','),'e1');eq(f.d.energyCards.map(x=>x.id).join(','),'e3,special');eq(calls.join(','),'KO,END');eq(f.g.pendingReferenceChoice,undefined);
  eq(f.g.history.filter(e=>e.details.command==='MOVE_ENERGY').length,3);
  f=fixture({actor,count:1});hit(f);choose(f,'e0','b2');eq(f.g.pendingReferenceChoice,undefined);eq(calls.join(','),'KO,END');
 }
 for(const options of [{retreat:3},{retreat:5},{bench:true},{jamming:true},{count:0},{emptyBench:true}]){
  const f=fixture(options);hit(f,100,{bench:!!options.bench});eq(f.g.pendingReferenceChoice,undefined);eq(calls.join(','),'KO,END');
 }
 const nonlethal=fixture();hit(nonlethal,90);eq(nonlethal.g.pendingReferenceChoice,undefined);
 const self=fixture();self.d.damage=100;X.noteHeavyBatonTest(self.g,self.q.id,self.d,{player:self.q},100,0);eq(self.g.referenceReactions,undefined);
 return n;
}
module.exports={verify};
if(require.main===module)console.log('OWNER04_HEAVY_BATON_PASS',verify(compile,fs.readFileSync('engine/pokeca_reference_effect_runtime.cjs','utf8'),fs.readFileSync('data/effect-extensions/evidence/45283.json','utf8'),v=>assert.equal(crypto.createHash('sha256').update(v.html).digest('hex'),v.htmlSha256)));
