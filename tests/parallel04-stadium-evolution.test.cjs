'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {compile}=require('../engine/reference-effect-plans.cjs');
function readRow(v,officialCardId){const name=v.html.match(/カード詳細（([^）]+)）/)[1],text=v.html.match(/<h2 class="mt20">スタジアム<\/h2>\s*<p>([\s\S]*?)<\/p>/)[1].replace(/<span class="icon-grass icon"><\/span>/g,"[草]").replace(/<br\s*\/?>/g,"").replace(/\s+/g,"");if(v.url!==`https://www.pokemon-card.com/card-search/details.php/card/${officialCardId}`)throw Error("url mismatch");return {officialCardId,name,deckName:name,category:"stadium",text,attacks:[],abilities:[],facts:{},set:"test",cardNumber:officialCardId,source:{sha256:v.htmlSha256},imageSourceUrl:"test"}}
function mobileSource(bundle){const marker='"pokeca_mobile_rules":function(require,module,exports){',i=bundle.indexOf(marker),j=bundle.indexOf('},"pokeca_',i+1);if(i<0||j<0)throw Error("MobileRules module missing");return bundle.slice(i+marker.length,j);}
function verify(compile,rt,rows,mobile){
 let n=0;function eq(x,y){n++;if(x!==y)throw Error(`assert ${n}: ${JSON.stringify(x)} !== ${JSON.stringify(y)}`);}
 const compiled=compile({records:rows}).records;
 for(const row of compiled){const m=row.officialCardId==="48420"?"STADIUM_CONFUSION_RETENTION":"STADIUM_GRASS_EVOLUTION";eq(row.mainPlan?.mechanic,m);eq(compile({records:[{...row,text:row.text+"追加条件。"}]}).records[0].mainPlan?.mechanic===m,false);}
 const mon=(key,type,stage,from)=>({officialCardId:key,name:key,deckName:key,category:"pokemon",attacks:[],abilities:[],facts:{types:[type],hp:100+stage*20,stage,basic:stage===0,prizeCount:1,rulePokemon:false,retreatCost:1,evolvesFrom:from},set:"test",cardNumber:key,source:{sha256:"test"},imageSourceUrl:"test"});
 const base=mon("b","草",0),stage1=mon("s1","草",1,"b"),stage2=mon("s2","草",2,"s1"),nonGrass=mon("f","炎",1,"b"),wrong=mon("wrong","草",1,"other"),nonBase=mon("n","炎",0),moon=mon("moon","闘",0);
 moon.abilities=[{name:"しんげつ",text:"fixture",plan:{mechanic:"TEST_MOON"},effectId:"moon"}];
 const card=(r,key)=>({id:key,name:r.name,species:r.name,kind:r.category,hp:r.facts.hp,damage:0,basic:r.facts.basic,stage:r.facts.stage,evolvesFrom:r.facts.evolvesFrom,retreatCost:r.facts.retreatCost,tools:[],energyCards:[],enteredTurn:1,validationReference:{officialCardId:r.officialCardId,officialName:r.name,set:r.set,cardNumber:r.cardNumber,sourceSha256:r.source.sha256,imageSourceUrl:r.imageSourceUrl,adopted:false}});
 const catalog={records:[base,stage1,stage2,nonGrass,wrong,nonBase,moon,...compiled]},m={exports:{}},core={resolveKnockouts:()=>{}},effects={};
 const Mobile={exports:{}};new Function("require","module","exports",mobile)(s=>s==="./pokeca_engine_core"?core:effects,Mobile,Mobile.exports);
 const deps=s=>{if(s==="./pokeca_reference_effect_data")return catalog;if(s==="./pokeca_selection_constraints")return {};if(s==="./pokeca_engine_core")return core;if(s==="./pokeca_mobile_rules")return Mobile.exports;if(s==="./pokeca_effect_extensions")return {catalog:x=>x};if(s==="./pokeca_effect_service")return effects;throw Error(s)};
 new Function("module","exports","require",rt+"\nObject.assign(module.exports,{forestEvolutionAllowed,retainEvolutionConfusion});")(m,m.exports,deps);
 const x=m.exports;
 function game(actor,turn,stadiumRec,holderRec=base){
  const holder=card(holderRec,"holder"),p={id:actor,active:holder,bench:[],hand:[card(stage1,"e1"),card(stage2,"e2"),card(nonGrass,"fire"),card(wrong,"wrong")],deck:[],discard:[],prizes:6};
  return {referenceEffectValidation:true,turnNumber:turn,turnPlayer:actor,status:"active",phase:"main",history:[],players:[p,{id:actor==="you"?"ai":"you",active:card(nonBase,"opp"),bench:[],hand:[],deck:[],discard:[],prizes:6}],stadium:stadiumRec?card(stadiumRec,"st"):null,stadiumOwner:actor};
 }
 function act(g,actor,key){return {type:"evolve",cardId:key,targetInstanceId:"holder"};}
 function resolve(g,actor,a){const before=JSON.parse(JSON.stringify(g));x.execute(g,actor,a);x.afterAction(g,before,actor,a);}
 for(const row of compiled.filter(r=>r.officialCardId!=="48420"))for(const actor of ["you","ai"])for(const turn of [1,2,3,4]){
  const g=game(actor,turn,row),p=g.players[0],h=p.active;h.enteredTurn=turn;
  h.damage=20;h.statusCondition="CONFUSED";
  let a=act(g,actor,"e1"),before=JSON.stringify(g);
  eq(x.preflight(g,actor,a).errors.length===0,turn>2);eq(JSON.stringify(g),before);
  for(const key of ["fire","wrong","e2"]){eq(x.preflight(g,actor,act(g,actor,key)).errors.length>0,true);eq(JSON.stringify(g),before);}
  if(turn>2){resolve(g,actor,a);eq(h.enteredTurn,turn);eq(h.evolvedTurn,turn);eq(h.name,"s1");eq(h.evolutionCards[0].id,"e1");eq(h.damage,20);eq(h.statusCondition,null);eq(x.preflight(g,actor,act(g,actor,"e2")).errors.length,0);resolve(g,actor,act(g,actor,"e2"));eq(h.name,"s2");eq(h.evolutionCards.map(c=>c.id).join(","),"e1,e2");eq(h.enteredTurn,turn);eq(h.evolvedTurn,turn);}
 }
 for(const actor of ["you","ai"]){
  const forest=compiled[0],valley=compiled.find(r=>r.officialCardId==="48420");
  let g=game(actor,3,forest);g.players[0].active.enteredTurn=3;g.players[1].bench.push(card(moon,"moon"));eq(x.preflight(g,actor,act(g,actor,"e1")).errors.length>0,true);
  g=game(actor,3,null);g.players[0].active.enteredTurn=3;eq(x.preflight(g,actor,act(g,actor,"e1")).errors.length>0,true);
  g=game(actor,3,forest);g.players[0].active.enteredTurn=3;g.stadium=null;eq(x.preflight(g,actor,act(g,actor,"e1")).errors.length>0,true);
  for(const status of ["CONFUSED","POISONED","ASLEEP","PARALYZED",null]){
   g=game(actor,3,valley);let h=g.players[0].active;h.statusCondition=status;h.statusConditionInfo={fixture:status};resolve(g,actor,act(g,actor,"e1"));eq(h.statusCondition,status==="CONFUSED"?"CONFUSED":null);eq(h.statusConditionInfo?.fixture,status==="CONFUSED"?"CONFUSED":undefined);
  }
  g=game(actor,3,valley);let h=g.players[0].active;resolve(g,actor,act(g,actor,"e1"));h.statusCondition="CONFUSED";h.statusConditionInfo={fixture:"CONFUSED"};
  const prior=JSON.parse(JSON.stringify(g));h.evolutionCards.pop();h.name="b";h.stage=0;h.basic=true;h.statusCondition=null;delete h.statusConditionInfo;
  x.retainEvolutionConfusion(g,prior);eq(h.statusCondition,"CONFUSED");eq(h.statusConditionInfo.fixture,"CONFUSED");
  const same=JSON.parse(JSON.stringify(g));h.statusCondition=null;delete h.statusConditionInfo;x.retainEvolutionConfusion(g,same);eq(h.statusCondition,null);
  g=game(actor,3,null);h=g.players[0].active;h.statusCondition="CONFUSED";resolve(g,actor,act(g,actor,"e1"));eq(h.statusCondition,null);
 }
 return n;
}
const rows=["47857","48704","50076","48420"].map(id=>{const v=JSON.parse(fs.readFileSync('data/effect-extensions/evidence/'+id+'.json','utf8'));assert.equal(crypto.createHash('sha256').update(v.html).digest('hex'),v.htmlSha256);return readRow(v,id);});
console.log('OWNER04_STADIUM_EVOLUTION_PASS',verify(compile,fs.readFileSync('engine/pokeca_reference_effect_runtime.cjs','utf8'),rows,mobileSource(fs.readFileSync('ui/engine.bundle.js','utf8'))));
