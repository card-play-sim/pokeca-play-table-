'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {compile}=require('../engine/reference-effect-plans.cjs');
function verify(compile,source,files,checkHash){
 let n=0;const eq=(a,b)=>{n++;assert.equal(a,b);};
 const rows=['50929','46438'].map((officialCardId,i)=>{
  const v=JSON.parse(files[officialCardId]),name=v.html.match(/カード詳細（([^）]+)）/)[1],text=v.html.match(/<h2 class="mt20">ポケモンのどうぐ<\/h2>\s*<p>([\s\S]*?)<\/p>/)[1].replace(/\s+/g,'');
  eq(v.url,'https://www.pokemon-card.com/card-search/details.php/card/'+officialCardId);checkHash(v);
  const r={officialCardId,name,deckName:name,category:'tool',text,attacks:[],abilities:[],facts:{},set:'test',cardNumber:officialCardId,source:{sha256:v.htmlSha256},imageSourceUrl:'test'};
  const p=compile({records:[r]}).records[0].mainPlan;
  eq(p.mechanic,'TOOL_KO_SEARCH');eq(p.megaOnly,i===0);eq(p.min,i===0?1:0);eq(p.limit,i===0?1:3);
  eq(compile({records:[{...r,text:text+'追加条件。'}]}).records[0].mainPlan?.mechanic==='TOOL_KO_SEARCH',false);
  return {...r,mainPlan:p};
 });
 const mon=(officialCardId,name,mega=false)=>({officialCardId,name,deckName:name,category:'pokemon',attacks:[],abilities:[],rulesText:[],facts:{types:['無色'],stage:0,basic:true,hp:100,retreatCost:1,rulePokemon:mega,prizeCount:mega?3:1},set:'test',cardNumber:officialCardId,source:{sha256:'test'},imageSourceUrl:'test'});
 const normal=mon('normal','テスト'),mega=mon('mega','メガテストex',true),jam={...rows[0],officialCardId:'jam',name:'ジャミング',deckName:'ジャミング',category:'stadium',cardNumber:'jam',mainPlan:{mechanic:'JAMMING'}};
 const catalog={records:[...rows,normal,mega,jam]},card=(r,id)=>({id,name:r.name,kind:r.category,hp:r.facts.hp,damage:0,energyCards:[],tools:[],validationReference:{officialCardId:r.officialCardId,officialName:r.name,set:r.set,cardNumber:r.cardNumber,sourceSha256:r.source.sha256,imageSourceUrl:r.imageSourceUrl,adopted:false}});
 const m={exports:{}};let calls=[];
 const req=x=>{if(x==='./pokeca_reference_effect_data')return catalog;if(x==='./pokeca_selection_constraints')return {};if(x==='./pokeca_effect_extensions')return {catalog:x=>x};
 if(x==='./pokeca_effect_service')return {apply:(g,cmd,ctx)=>{eq(cmd.command,'DAMAGE');const target=g.players.flatMap(p=>[p.active,...p.bench]).find(c=>c.id===ctx.targetIds[0]);target.damage+=cmd.amount;}};
 if(x==='./pokeca_engine_core')return {resolveKnockouts:()=>calls.push('KO'),endTurn:()=>calls.push('END')};throw Error(x);};
 new Function('require','module','exports',source+'\nmodule.exports.finishAttackTest=finishAttack;module.exports.noteToolKoSearchTest=noteToolKoSearch;')(req,m,m.exports);
 const X=m.exports;
 function fixture(row,{isMega=true,bench=false,blocked=false,empty=false}={}){
  calls=[];const a=card(normal,'a'),d=card(isMega?mega:normal,'d');d.tools=[card(row,'t')];
  const p={id:'you',active:a,bench:[],hand:[],deck:[],discard:[]},q={id:'ai',active:bench?card(normal,'q'):d,bench:bench?[d]:[],hand:[],deck:empty?[]:[card(normal,'one'),card(row,'two'),card(mega,'three'),card(normal,'four')],discard:[]};
  const g={referenceEffectValidation:{adoptedPrints:0},referenceRngState:123,turnPlayer:'you',turnNumber:3,status:'active',phase:'main',players:[p,q],history:[],stadium:blocked?card(jam,'jam'):null};
  return {g,d,q};
 }
 function hit(f,amount=100,opts={}){X.damage(f.g,'you',f.d,amount,opts);X.finishAttackTest(f.g,'you');}
 function choose(f,cardId){const a=X.referenceChoiceAction(f.g.pendingReferenceChoice,cardId);eq(a.deckCardId,cardId);X.execute(f.g,'ai',a);}
 for(const row of rows){
  for(const opts of [{},{bench:true}]){
   const f=fixture(row,opts);hit(f,100,{bench:!!opts.bench});eq(f.g.pendingReferenceChoice.kind,'TOOL_KO_SEARCH');eq(f.g.pendingReferenceChoice.options.includes(null),row.mainPlan.min===0);eq(calls.length,0);
   eq(X.preflight(f.g,'you',{type:'resolve_reference_choice',deckCardId:'one'}).errors.length>0,true);
   eq(X.preflight(f.g,'ai',{type:'resolve_reference_choice',deckCardId:'fake'}).errors.length>0,true);
   const view=X.projectView(JSON.parse(JSON.stringify(f.g)),'you');eq(view.pendingReferenceChoice.options,undefined);
   choose(f,'two');
   if(row.mainPlan.limit===3){eq(f.q.hand.length,0);eq(f.g.pendingReferenceChoice.options.includes('two'),false);choose(f,'three');choose(f,null);}
   eq(f.q.hand.map(c=>c.id).join(','),row.mainPlan.limit===3?'two,three':'two');
   eq(f.g.history.filter(e=>e.details.command==='SHUFFLE_DECK').length,1);
   eq(f.g.history.some(e=>e.details.command==='REVEAL'),false);
   eq(f.g.history.filter(e=>e.details.command==='ADD_TO_HAND').every(e=>e.details.privateTo==='ai'),true);
   eq(calls.join(','),'KO,END');
  }
  for(const opts of [{blocked:true},{isMega:false}]){
   const f=fixture(row,opts);hit(f);const eligible=!opts.blocked&&!row.mainPlan.megaOnly;
   eq(!!f.g.pendingReferenceChoice,eligible);
  }
  const nonlethal=fixture(row);hit(nonlethal,90);eq(!!nonlethal.g.pendingReferenceChoice,false);
  const empty=fixture(row,{empty:true});hit(empty);eq(!!empty.g.pendingReferenceChoice,false);eq(empty.g.history.filter(e=>e.details.command==='SHUFFLE_DECK').length,1);
  const self=fixture(row);self.d.damage=100;X.noteToolKoSearchTest(self.g,'ai',self.d,{player:self.q},100,0);eq(!!self.g.referenceReactions,false);
 }
 const f=fixture(rows[1]);hit(f);choose(f,null);eq(f.q.hand.length,0);eq(calls.join(','),'KO,END');
 const three=fixture(rows[1]);hit(three);choose(three,'one');choose(three,'two');choose(three,'three');eq(three.q.hand.length,3);eq(three.g.pendingReferenceChoice,undefined);eq(calls.join(','),'KO,END');
 return n;
}
module.exports={verify};
if(require.main===module){
 const files=Object.fromEntries(['50929','46438'].map(id=>[id,fs.readFileSync('data/effect-extensions/evidence/'+id+'.json','utf8')]));
 console.log('OWNER04_KO_SEARCH_PASS',verify(compile,fs.readFileSync('engine/pokeca_reference_effect_runtime.cjs','utf8'),files,v=>assert.equal(crypto.createHash('sha256').update(v.html).digest('hex'),v.htmlSha256)));
}
