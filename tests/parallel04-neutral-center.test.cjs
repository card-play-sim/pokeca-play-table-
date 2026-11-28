'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {compile}=require('../engine/reference-effect-plans.cjs');
function readRow(v,officialCardId){const name=v.html.match(/カード詳細（([^）]+)）/)[1],text=v.html.match(/<h2 class="mt20">スタジアム<\/h2>\s*<p>([\s\S]*?)<\/p>/)[1].replace(/<br\s*\/?>/g,"").replace(/\s+/g,"");if(v.url!==`https://www.pokemon-card.com/card-search/details.php/card/${officialCardId}`)throw Error("url mismatch");return {officialCardId,name,deckName:name,category:"stadium",text,attacks:[],abilities:[],facts:{},set:"test",cardNumber:officialCardId,source:{sha256:v.htmlSha256},imageSourceUrl:"test"}}
function verify(compile,rt,rows){
 let n=0;function eq(x,y){n++;if(x!==y)throw Error(`assert ${n}: ${JSON.stringify(x)} !== ${JSON.stringify(y)}`);}
 const compiled=compile({records:rows}).records;
 for(const row of compiled){eq(row.mainPlan?.mechanic,"STADIUM_NEUTRAL_CENTER");eq(compile({records:[{...row,text:row.text+"追加条件。"}]}).records[0].mainPlan?.mechanic==="STADIUM_NEUTRAL_CENTER",false);}
 const mon=(key,name,rule)=>({officialCardId:key,name,deckName:name,category:"pokemon",attacks:[],abilities:[],facts:{types:["草"],hp:200,stage:0,basic:true,prizeCount:rule?2:1,rulePokemon:rule,retreatCost:1},set:"test",cardNumber:key,source:{sha256:"test"},imageSourceUrl:"test"});
 const attackers=[mon("a","テストex",true),mon("b","テストV",true),mon("c","テストVMAX",true),mon("d","テストVSTAR",true),mon("e","テスト",false),mon("f","テストGX",true)];
 const targets=[mon("g","対象",false),mon("h","対象ex",true),mon("i","対象かがやく",true)];
 const card=(r,key)=>({id:key,name:r.name,kind:r.category,hp:200,damage:0,tools:[],energyCards:[],validationReference:{officialCardId:r.officialCardId,officialName:r.name,set:r.set,cardNumber:r.cardNumber,sourceSha256:r.source.sha256,imageSourceUrl:r.imageSourceUrl,adopted:false}});
 const catalog={records:[...attackers,...targets,...compiled]},m={exports:{}};
 const deps=s=>{if(s==="./pokeca_reference_effect_data")return catalog;if(s==="./pokeca_selection_constraints"||s==="./pokeca_engine_core")return {};if(s==="./pokeca_effect_extensions")return {catalog:x=>x};if(s==="./pokeca_effect_service")return {apply:(game,c,ctx)=>{let t=game.players.flatMap(p=>[p.active,...p.bench]).find(x=>x.id===ctx.targetIds[0]);if(c.command==="DAMAGE")t.damage+=c.amount;else if(c.command==="PLACE_DAMAGE_COUNTERS")t.damage+=c.counterCount*10;else throw Error(c.command)}};throw Error(s)};
 new Function("module","exports","require",rt+"\nObject.assign(module.exports,{neutralCenterDamageGuard,discardReturnAllowed,massTransferCandidate,moveChosen,counters});")(m,m.exports,deps);
 const x=m.exports;
 for(const row of compiled)for(const ar of attackers)for(const dr of targets)for(const bench of [false,true]){
  const a=card(ar,"a"),d=card(dr,"d"),s=card(row,"s"),other=card(targets[1],"other");
  const g={referenceEffectValidation:true,turnNumber:3,history:[],stadium:s,stadiumOwner:"you",players:[{id:"you",active:a,bench:[],hand:[],deck:[],discard:[],prizes:6},{id:"ai",active:bench?other:d,bench:bench?[d]:[],hand:[],deck:[],discard:[],prizes:6}]};
  const expected=["a","b","c","d"].includes(ar.officialCardId)&&!dr.facts.rulePokemon;
  eq(x.neutralCenterDamageGuard(g,"you",a,d),expected);
  eq(x.damages(g,"you",d,40,{bench}),expected?0:40);
  eq(x.damages(g,"you",d,40,{bench,ignore:true}),40);
  x.counters(g,"you",d,1,{attack:true});eq(d.damage,10);
  g.stadium=null;eq(x.damages(g,"you",d,40,{bench}),40);
  const p=g.players[0];p.discard=[a,s];
  for(const dest of ["hand","deck"]){
   eq(x.massTransferCandidate(s,{zone:"discard",destination:dest,category:"any"}),false);
   eq(x.massTransferCandidate(a,{zone:"discard",destination:dest,category:"any"}),true);
   let blocked=false;const prior=JSON.stringify(g);
   try{x.moveChosen(g,p,"discard",["a","s"],dest)}catch(e){blocked=e.message==="DISCARD_RETURN_PROHIBITED"}
   eq(blocked,true);eq(JSON.stringify(g),prior);
  }
  eq(x.massTransferCandidate(s,{zone:"deck",destination:"hand",category:"any"}),true);
  x.moveChosen(g,p,"discard",["a"],"hand");eq(p.hand[0],a);eq(p.discard[0],s);
 }
 return n;
}
const rows=["45938","46845"].map(id=>{const v=JSON.parse(fs.readFileSync('data/effect-extensions/evidence/'+id+'.json','utf8'));assert.equal(crypto.createHash('sha256').update(v.html).digest('hex'),v.htmlSha256);return readRow(v,id);});
console.log('OWNER04_NEUTRAL_CENTER_PASS',verify(compile,fs.readFileSync('engine/pokeca_reference_effect_runtime.cjs','utf8'),rows));
