'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),vm=require('node:vm');
const {compile}=require('../engine/reference-effect-plans.cjs');
const groups=[
 ['スパイクエネルギー','energy','ATTACHED_ACTIVE_HIT',2,'47108','47252','49453'],
 ['デラックスボム','tool','ATTACHED_ACTIVE_HIT',12,'46035','49400'],
 ['ごうかいボム','tool','ATTACHED_ACTIVE_HIT',12,'50292','50326'],
 ['パンクメット','tool','ATTACHED_ACTIVE_HIT',4,'48278','48510'],
 ['ロケット団のさいみん装置','tool','ATTACHED_ACTIVE_HIT',0,'47497'],
 ['逆境ほけん','tool','ATTACHED_ACTIVE_HIT',0,'48484'],
 ['ラッキーメット','tool','ATTACHED_ACTIVE_HIT',0,'45633'],
 ['サバイブギプス','tool','TOOL_FULL_HP_SURVIVAL',10,'45642'],
 ['リッチエネルギー','energy','ENERGY_HAND_ATTACH_DRAW',4,'46293','49456']
],icons={none:'無色',dark:'悪'},rows=[];
for(const [name,category,mechanic,amount,...ids] of groups)for(const officialCardId of ids){
 const saved=JSON.parse(fs.readFileSync('data/effect-extensions/evidence/'+officialCardId+'.json','utf8'));
 assert.equal(saved.url,'https://www.pokemon-card.com/card-search/details.php/card/'+officialCardId);
 assert.equal(crypto.createHash('sha256').update(saved.html).digest('hex'),saved.htmlSha256);
 assert.ok(saved.html.includes('カード詳細（'+name+'）'));
 const raw=saved.html.match(/<h2 class="mt20">(?:特殊エネルギー|ポケモンのどうぐ)<\/h2>\s*<p>([\s\S]*?)<\/p>/)[1];
 const text=raw.replace(/<span class="icon-([a-z]+) icon"><\/span>/g,(_,x)=>'['+icons[x]+']').replace(/<br\s*\/?>/g,'').replace(/\s+/g,'');
 const row={officialCardId,name,deckName:name,category,text,attacks:[],abilities:[],facts:{},set:'test',cardNumber:officialCardId,source:{sha256:saved.htmlSha256},imageSourceUrl:'test'};
 const p=compile({records:[row]}).records[0].mainPlan;assert.equal(p?.mechanic,mechanic);
 assert.equal(p.counterCount??p.remainingHp??p.amount,amount);
 assert.notEqual(compile({records:[{...row,text:text+'追加条件。'}]}).records[0].mainPlan?.mechanic,mechanic);
 rows.push({...row,mainPlan:p});
}
const mon=(id,name,type,mega=false,weakness=null)=>({officialCardId:id,name,deckName:name,category:'pokemon',attacks:[],abilities:[],rulesText:mega?'メガシンカexがきぜつしたとき':'',facts:{types:[type],stage:0,basic:true,hp:400,retreatCost:3,prizeCount:1,weakness},set:'test',cardNumber:id,source:{sha256:'test'},imageSourceUrl:'test'});
const card=(r,id)=>({id,name:r.name,kind:r.category,hp:400,damage:0,energyCards:[],tools:[],validationReference:{officialCardId:r.officialCardId,officialName:r.name,set:r.set,cardNumber:r.cardNumber,sourceSha256:r.source.sha256,imageSourceUrl:r.imageSourceUrl,adopted:false}});
const source=fs.readFileSync('engine/pokeca_reference_effect_runtime.cjs','utf8');
function fixture(row,{type='悪',team=true,mega=true,weak=true,bench=false,jam=false,damaged=false}={}){
 const a=mon('a','attacker','草',mega),d=mon('d',team?'ロケット団のポケモン':'other',type,false,weak?{types:['草'],value:'×2'}:null),o=mon('other','other','無色');
 const j={...mon('jam','jam','無色'),category:'stadium',mainPlan:{mechanic:'JAMMING'}};
 const catalog={records:[a,d,o,j,...rows]},box={module:{exports:{}},require:n=>{
 if(n==='./pokeca_reference_effect_data')return catalog;
 if(n==='./pokeca_selection_constraints')return {};
 if(n==='./pokeca_effect_extensions')return {catalog:x=>x};
 if(n==='./pokeca_engine_core')return {resolveKnockouts:()=>{},endTurn:()=>{}};
 if(n==='./pokeca_effect_service')return {apply:(g,c,ctx)=>{
  const target=g.players.flatMap(p=>[p.active,...p.bench]).find(m=>m.id===ctx.targetIds?.[0]);
  if(c.command==='DAMAGE')target.damage+=c.amount;
  else if(c.command==='PLACE_DAMAGE_COUNTERS')target.damage+=10*c.counterCount;
  else if(c.command==='DRAW'){const p=g.players.find(x=>x.id===ctx.playerId);p.hand.push(...p.deck.splice(0,c.amount));}
  else throw Error(c.command);
 }};
 throw Error(n);
 }};
 vm.runInNewContext(source+'\nmodule.exports.testFinishAttack=finishAttack;',box,{filename:'reference-runtime',timeout:10000});
 const attacker=card(a,'a'),defender=card(d,'d'),attached=card(row,'t');
 if(damaged)defender.damage=10;
 if(row.category==='energy')defender.energyCards=[attached];else defender.tools=[attached];
 const own={id:'you',active:attacker,bench:[],discard:[],hand:[],deck:[],prizes:6},opp={id:'ai',active:bench?card(o,'o'):defender,bench:bench?[defender]:[],discard:[],hand:[],deck:Array.from({length:8},(_,i)=>({id:'draw'+i})),prizes:6};
 const g={referenceEffectValidation:true,turnNumber:3,status:'active',history:[],stadium:jam?card(j,'jam'):null,players:[own,opp]};
 const runtime=box.module.exports;
 return {runtime,g,attacker,defender,attached,opp,run:(amount)=>{runtime.damage(g,'you',defender,amount,{bench});runtime.testFinishAttack(g,'you');}};
}
for(const row of rows){
 const p=row.mainPlan;
 if(p.mechanic==='ATTACHED_ACTIVE_HIT'){
  const f=fixture(row,{weak:p.weakness});f.run(p.minDamage>1?p.minDamage:100);
  assert.equal(f.attacker.damage,p.counterCount*10);
  assert.equal(f.attacker.statusCondition??null,p.status);
  assert.equal(f.opp.hand.length,p.drawCount);
  assert.equal(f.opp.discard.includes(f.attached),p.consume);
  const blocked=fixture(row,{bench:true});blocked.run(300);assert.equal(blocked.attacker.damage,0);assert.equal(blocked.opp.hand.length,0);assert.equal(blocked.opp.discard.length,0);
  const zero=fixture(row);zero.run(0);assert.equal(zero.attacker.damage,0);assert.equal(zero.opp.hand.length,0);assert.equal(zero.opp.discard.length,0);
  if(p.megaOnly){const low=fixture(row,{weak:false});low.run(p.minDamage-10);assert.equal(low.attacker.damage,0);const ordinary=fixture(row,{mega:false});ordinary.run(300);assert.equal(ordinary.attacker.damage,0);}
  if(p.holderType){const wrong=fixture(row,{type:'草'});wrong.run(100);assert.equal(wrong.attacker.damage,0);}
  if(p.team){const wrong=fixture(row,{team:false});wrong.run(100);assert.equal(wrong.attacker.statusCondition??null,null);}
  if(p.weakness){const wrong=fixture(row,{weak:false});wrong.run(100);assert.equal(wrong.opp.hand.length,0);}
  if(row.category==='tool'){const jam=fixture(row,{jam:true});jam.run(300);assert.equal(jam.attacker.damage,0);assert.equal(jam.opp.hand.length,0);assert.equal(jam.attacker.statusCondition??null,null);}
  else assert.equal(f.runtime.energyUnits(f.defender)[0][0],'無色');
 }else if(p.mechanic==='TOOL_FULL_HP_SURVIVAL'){
  const f=fixture(row,{weak:false});f.run(400);assert.equal(f.defender.damage,390);assert.equal(f.opp.discard.includes(f.attached),true);
  const partial=fixture(row,{damaged:true,weak:false});partial.run(400);assert.equal(partial.defender.damage,410);assert.equal(partial.opp.discard.length,0);
  const jam=fixture(row,{jam:true,weak:false});jam.run(400);assert.equal(jam.defender.damage,400);assert.equal(jam.opp.discard.length,0);
 }else{
  const f=fixture(row);assert.equal(f.runtime.energyUnits(f.defender)[0][0],'無色');
  f.defender.energyCards=[];f.opp.hand=[f.attached];f.g.turnPlayer='ai';
  f.runtime.execute(f.g,'ai',{type:'attach_energy',cardIndex:0,target:'active'});
  assert.equal(f.opp.hand.length,4);assert.equal(f.defender.energyCards[0],f.attached);assert.equal(f.opp.normalEnergyAttached,true);
 }
}
console.log('OWNER04_ATTACHED_REACTIONS_RUNTIME_PASS',rows.length);
