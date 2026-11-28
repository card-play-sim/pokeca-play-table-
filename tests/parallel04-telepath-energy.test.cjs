'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {compile}=require('../engine/reference-effect-plans.cjs');
function readRow(v,officialCardId){const name=v.html.match(/カード詳細（([^）]+)）/)[1],text=v.html.match(/<h2 class="mt20">特殊エネルギー<\/h2>\s*<p>([\s\S]*?)<\/p>/)[1].replace(/<span class="icon-psychic icon"><\/span>/g,"[超]").replace(/<br\s*\/?>/g,"").replace(/\s+/g,"");if(v.url!==`https://www.pokemon-card.com/card-search/details.php/card/${officialCardId}`)throw Error("url mismatch");return {officialCardId,name,deckName:name,category:"energy",text,attacks:[],abilities:[],facts:{},set:"test",cardNumber:officialCardId,source:{sha256:v.htmlSha256},imageSourceUrl:"test"}}
function verify(compile,rt,row){
 let n=0;function eq(x,y){n++;if(x!==y)throw Error(`assert ${n}: ${JSON.stringify(x)} !== ${JSON.stringify(y)}`);}
 const compiled=compile({records:[row]}).records[0];eq(compiled.mainPlan?.mechanic,"ENERGY_HAND_ATTACH_BASIC_BENCH");eq(compile({records:[{...row,text:row.text+"追加条件。"}]}).records[0].mainPlan?.mechanic==="ENERGY_HAND_ATTACH_BASIC_BENCH",false);
 const mon=(key,type,basic=true)=>({officialCardId:key,name:key,deckName:key,category:"pokemon",attacks:[],abilities:[],facts:{types:[type],hp:100,stage:basic?0:1,basic,prizeCount:1,rulePokemon:false,retreatCost:1},set:"test",cardNumber:key,source:{sha256:"test"},imageSourceUrl:"test"});
 const psychic=mon("p","超"),other=mon("o","草"),evolved=mon("v","超",false);
 const card=(r,key)=>({id:key,name:r.name,kind:r.category,hp:100,damage:0,basic:r.facts.basic,stage:r.facts.stage,isSpecial:r.category==="energy",tools:[],energyCards:[],validationReference:{officialCardId:r.officialCardId,officialName:r.name,set:r.set,cardNumber:r.cardNumber,sourceSha256:r.source.sha256,imageSourceUrl:r.imageSourceUrl,adopted:false}});
 const catalog={records:[psychic,other,evolved,compiled]},m={exports:{}};
 const deps=s=>{if(s==="./pokeca_reference_effect_data")return catalog;if(s==="./pokeca_selection_constraints")return {resolve:r=>r,allows:()=>true};if(s==="./pokeca_engine_core")return {resolveKnockouts:()=>{}};if(s==="./pokeca_effect_extensions")return {catalog:x=>x};if(s==="./pokeca_effect_service")return {apply:()=>{throw Error("unexpected service")}};throw Error(s)};
 new Function("module","exports","require",rt+"\nObject.assign(module.exports,{handAttachBenchRequests,handAttachBenchTriggered,verifyHandAttachBench});")(m,m.exports,deps);
 const x=m.exports;
 for(const actor of ["you","ai"])for(const holderType of [psychic,other])for(const benchCount of [0,3,4,5])for(const target of ["active","bench"]){
  if(target==="bench"&&!benchCount)continue;
  const holder=card(holderType,"holder"),fill=Array.from({length:benchCount},(_,i)=>card(other,"b"+i));
  if(target==="bench")fill[0]=holder;
  const energy=card(compiled,"en"),deck=[card(psychic,"d1"),card(psychic,"d2"),card(psychic,"d3"),card(other,"bad"),card(evolved,"stage")];
  const own={id:actor,active:target==="active"?holder:card(other,"active"),bench:fill,hand:[energy],deck,discard:[],prizes:6},opp={id:actor==="you"?"ai":"you",active:card(other,"opp"),bench:[],hand:[],deck:[],discard:[],prizes:6};
  const g={referenceEffectValidation:true,turnNumber:3,turnPlayer:actor,status:"active",phase:"main",referenceRngState:42,history:[],players:[own,opp]};
  const eligible=holderType===psychic,limit=eligible?Math.min(2,5-benchCount):0;
  const option=x.handOptions(g,actor,"en").find(o=>o.key==="holder"),req=option.requests[0];
  eq(!!req,eligible);eq(req?.max||0,limit);if(req){eq(req.candidates.map(c=>c.id).join(","),"d1,d2,d3");eq(!!req.inspection,actor==="you");}
  const action=x.completeAction(g,actor,option);
  eq(action.selections?.cards?.length||0,limit);
  for(const choices of [["bad"],["stage"],["d1","d1"],["d1","d2","d3"],...(!limit?[["d1"]]:[]),...(limit===1?[["d1","d2"]]:[])]){
   const bad={...action,selections:{cards:choices}},before=JSON.stringify(g);
   eq(x.preflight(g,actor,bad).errors.length>0,true);eq(JSON.stringify(g),before);
  }
  eq(x.preflight(g,actor,action).errors.length,0);
  const chosen=action.selections?.cards||[],beforeIds=own.deck.map(c=>c.id);
  x.execute(g,actor,action);
  eq(own.normalEnergyAttached,true);eq(own.hand.length,0);eq(holder.energyCards[0],energy);eq(x.energyUnits(holder)[0][0],"超");
  eq(own.bench.length,benchCount+limit);eq(own.deck.length,5-limit);
  eq(own.deck.map(c=>c.id).sort().join(","),beforeIds.filter(i=>!chosen.includes(i)).sort().join(","));
  for(const i of chosen){const c=own.bench.find(c=>c.id===i);eq(c.enteredTurn,3);eq(c.entryWindow,-1);}
  eq(g.history.some(e=>e.details.command==="SHUFFLE_DECK"),eligible&&benchCount<5);
  eq(x.preflight(g,actor,action).errors.length>0,true);
 }
 const e=card(compiled,"e"),holder=card(psychic,"p"),p={id:"you",active:holder,bench:[],hand:[e],deck:[card(psychic,"d")],discard:[],prizes:6},o={id:"ai",active:card(other,"o"),bench:[],hand:[],deck:[],discard:[],prizes:6},g={referenceEffectValidation:true,turnNumber:3,turnPlayer:"you",status:"active",phase:"main",history:[],players:[p,o]};
 x.execute(g,"you",{type:"attach_energy",cardIndex:0,target:"active",selections:{cards:[]}});
 eq(p.bench.length,0);eq(p.deck.length,1);eq(g.history.some(e=>e.details.command==="SHUFFLE_DECK"),true);
 return n;
}
const v=JSON.parse(fs.readFileSync('data/effect-extensions/evidence/49712.json','utf8'));assert.equal(crypto.createHash('sha256').update(v.html).digest('hex'),v.htmlSha256);
console.log('OWNER04_TELEPATH_ENERGY_PASS',verify(compile,fs.readFileSync('engine/pokeca_reference_effect_runtime.cjs','utf8'),readRow(v,'49712')));
