'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {compile}=require('../engine/reference-effect-plans.cjs');
function verify(compile,source,bundle,files,hash){
 let n=0;const eq=(a,b)=>{n++;assert.equal(a,b);};
 const rows=['45933','46071','49399'].map(id=>{
 const v=JSON.parse(files[id]);hash(v);eq(v.url,'https://www.pokemon-card.com/card-search/details.php/card/'+id);
 const text=v.html.match(/<h2 class="mt20">ポケモンのどうぐ<\/h2>\s*<p>([\s\S]*?)<\/p>/)[1].replace(/\s+/g,'');
 const row={officialCardId:id,name:'力の砂時計',deckName:'力の砂時計',category:'tool',text,attacks:[],abilities:[],facts:{},set:'test',cardNumber:id,source:{sha256:v.htmlSha256},imageSourceUrl:'test'};
 const t=compile({records:[row]}).records[0];eq(t.mainPlan.mechanic,'TOOL_END_TURN_ENERGY');eq(t.mainPlan.limit,1);eq(compile({records:[{...row,text:text+'追加条件。'}]}).records[0].mainPlan?.mechanic==='TOOL_END_TURN_ENERGY',false);return t;
 });
 const base={officialCardId:'p',name:'たね',deckName:'たね',category:'pokemon',attacks:[],abilities:[],facts:{types:['闘'],hp:100,stage:0,basic:true,prizeCount:1,retreatCost:1},set:'test',cardNumber:'p',source:{sha256:'test'},imageSourceUrl:'test'};
 const energy={...base,officialCardId:'e',name:'基本闘エネルギー',deckName:'基本闘エネルギー',cardNumber:'e',category:'energy',facts:{},mainPlan:{mechanic:'BASIC_ENERGY',commands:['ATTACH_ENERGY']}},special={...energy,officialCardId:'s',cardNumber:'s',name:'特殊エネルギー',deckName:'特殊エネルギー'},jam={...energy,officialCardId:'jam',cardNumber:'jam',name:'ジャミングタワー',deckName:'ジャミングタワー',category:'stadium',mainPlan:{mechanic:'JAMMING'}};
 const catalog={records:[...rows,base,energy,special,jam],defaultValidationReferences:{}},card=(r,id)=>({id,name:r.name,species:r.name,kind:r.category,cardType:r.category==='stadium'?'STADIUM':undefined,hp:r.facts.hp,damage:0,basic:r.facts.basic,stage:r.facts.stage,prizeCount:r.facts.prizeCount,retreatCost:1,energyType:r.category==='energy'?'闘':undefined,isSpecial:r===special,energyCards:[],tools:[],energies:[],attacks:[],abilities:[],enteredTurn:1,validationReference:{officialCardId:r.officialCardId,officialName:r.name,set:r.set,cardNumber:r.cardNumber,sourceSha256:r.source.sha256,imageSourceUrl:r.imageSourceUrl,adopted:false}});
 const markers=[...bundle.matchAll(/"([^"]+)":function\(require,module,exports\)\{/g)],defs=new Map(),cache=new Map();
 for(let i=0;i<markers.length;i++){const a=markers[i],start=a.index+a[0].length,end=i+1<markers.length?markers[i+1].index-2:bundle.indexOf("}},cache=",start);defs.set(a[1],bundle.slice(start,end));}
 function req(name){name=name.replace(/^\.\//,'').replace(/\.js$/,'');if(name==='pokeca_reference_effect_data')return catalog;if(name==='pokeca_effect_extensions')return {catalog:x=>x};if(cache.has(name))return cache.get(name).exports;const code=name==='pokeca_reference_effect_runtime'?source+'\nmodule.exports.finishAttackTest=finishAttack;':defs.get(name);if(!code)throw Error(name);const m={exports:{}};cache.set(name,m);new Function('require','module','exports',code)(req,m,m.exports);return m.exports;}
 const X=req('pokeca_reference_effect_runtime'),Core=req('pokeca_engine_core'),Controller=req('pokeca_canonical_controller'),Effects=req('pokeca_effect_service'),AI=req('pokeca_ai_port');
 function game(row,actor,options={}){
 const other=actor==='you'?'ai':'you',a=card(base,'a'),b=card(base,'b');
 (options.bench?b:a).tools=[card(row,'tool')];
 const p=Core.createPlayer({id:actor,active:a,bench:[b],hand:[],deck:[card(energy,'d')],discard:[...(options.empty?[]:[card(energy,'e1'),card(energy,'e2')]),card(special,'special')]});
 const q=Core.createPlayer({id:other,active:card(base,'qa'),bench:[],hand:[],deck:[card(energy,'qd')],discard:[card(energy,'qe')]});
 const g=Core.createGame({players:[p,q],turnPlayer:actor,turnNumber:3});g.referenceEffectValidation={adoptedPrints:0};g.referenceRngState=3;g.mode='practice';if(options.jam){g.stadium=card(jam,'jam');g.stadiumOwner=other;g.stadiumPlayedTurn=2;g.stadiumPlayedBy=other;}Effects.refresh(g);return g;
 }
 function ok(g,actor,a){const v=Controller.executeCanonicalAction(g,actor,a);if(!v.ok)throw Error(JSON.stringify(v));eq(v.ok,true);}
 function reject(g,actor,a){const before=JSON.stringify(g);const v=Controller.executeCanonicalAction(g,actor,a);eq(v.ok,false);eq(JSON.stringify(g),before);}
 for(const row of rows)for(const actor of ['you','ai']){
  let g=game(row,actor),p=g.players[0],q=g.players[1];ok(g,actor,{type:'end_turn'});
  eq(g.turnPlayer,actor);eq(g.turnNumber,3);eq(g.pendingReferenceChoice.kind,'TOOL_END_TURN_ENERGY');eq(g.pendingReferenceChoice.options.join(','),'e1,e2,');eq(p.active.energyCards.length,0);
  eq(AI.getLegalActions(g,actor).actions.some(a=>a.energyId==='e2'),true);
  reject(g,actor,{type:'resolve_reference_choice',energyId:'special'});reject(g,actor,{type:'end_turn'});reject(g,q.id,{type:'resolve_reference_choice',energyId:'e1'});
  X.validateGame(g);ok(g,actor,X.referenceChoiceAction(g.pendingReferenceChoice,'e2'));
  eq(p.active.energyCards.map(c=>c.id).join(','),'e2');eq(p.discard.map(c=>c.id).join(','),'e1,special');eq(q.discard.length,1);eq(g.turnNumber,4);eq(g.turnPlayer,q.id);eq(g.pendingReferenceChoice,undefined);
  eq(g.history.filter(e=>e.details.command==='ATTACH_ENERGY'&&e.details.sourceOfficialCardId===row.officialCardId).length,1);
  g=game(row,actor);p=g.players[0];ok(g,actor,{type:'end_turn'});ok(g,actor,X.referenceChoiceAction(g.pendingReferenceChoice,null));eq(p.active.energyCards.length,0);eq(p.discard.length,3);eq(g.turnNumber,4);
  for(const options of [{bench:true},{jam:true},{empty:true}]){g=game(row,actor,options);ok(g,actor,{type:'end_turn'});eq(g.turnNumber,4);eq(g.pendingReferenceChoice,undefined);}
  g=game(row,actor);X.finishAttackTest(g,actor);eq(g.turnNumber,3);eq(g.pendingReferenceChoice.kind,'TOOL_END_TURN_ENERGY');ok(g,actor,X.referenceChoiceAction(g.pendingReferenceChoice,'e1'));eq(g.turnNumber,4);eq(g.players[0].active.energyCards[0].id,'e1');
 }
 return n;
}
module.exports={verify};
if(require.main===module){const files=Object.fromEntries(['45933','46071','49399'].map(id=>[id,fs.readFileSync('data/effect-extensions/evidence/'+id+'.json','utf8')]));console.log('OWNER04_HOURGLASS_PASS',verify(compile,fs.readFileSync('engine/pokeca_reference_effect_runtime.cjs','utf8'),fs.readFileSync('ui/engine.bundle.js','utf8'),files,v=>assert.equal(crypto.createHash('sha256').update(v.html).digest('hex'),v.htmlSha256)));}
