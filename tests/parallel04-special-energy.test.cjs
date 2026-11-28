'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),vm=require('node:vm');
const {compile}=require('../engine/reference-effect-plans.cjs');
const groups=[
 ['プリズムエネルギー','rainbow',0,1,'47622','47902','48714','49455'],
 ['ネオアッパーエネルギー','rainbow',2,2,'45217'],
 ['グロウ草エネルギー','hp','草',20,'49711','50545'],
 ['マグネット鋼エネルギー','retreat','鋼',0,'50167'],
 ['ボルト雷エネルギー','boost','雷',20,'50299'],
 ['シャドー悪エネルギー','benchGuard','悪',0,'50300']
];
const icons={none:'無色',grass:'草',steel:'鋼',electric:'雷',dark:'悪'};
const rows=[];
for(const [name,mode,type,amount,...ids] of groups)for(const officialCardId of ids){
 const evidence=JSON.parse(fs.readFileSync('data/effect-extensions/evidence/'+officialCardId+'.json','utf8'));
 assert.equal(evidence.url,'https://www.pokemon-card.com/card-search/details.php/card/'+officialCardId);
 assert.equal(crypto.createHash('sha256').update(evidence.html).digest('hex'),evidence.htmlSha256);
 assert.ok(evidence.html.includes('カード詳細（'+name+'）'));
 const raw=evidence.html.match(/<h2 class="mt20">特殊エネルギー<\/h2>\s*<p>([\s\S]*?)<\/p>/)[1];
 const text=raw.replace(/<span class="icon-([a-z]+) icon"><\/span>/g,(_,x)=>'['+icons[x]+']').replace(/<br\s*\/?>/g,'').replace(/\s+/g,'');
 const row={officialCardId,name,deckName:name,category:'energy',text,attacks:[],abilities:[],facts:{},set:'test',cardNumber:officialCardId,source:{sha256:evidence.htmlSha256},imageSourceUrl:'test'};
 const plan=compile({records:[row]}).records[0].mainPlan;
 assert.equal(plan.mechanic,mode==='rainbow'?'ENERGY_STAGE_RAINBOW':'ENERGY_TYPED_PASSIVE');
 if(mode==='rainbow'){assert.equal(plan.stage,type);assert.equal(plan.units,amount);}
 else {assert.equal(plan.mode,mode);assert.equal(plan.energyType,type);assert.equal(plan.amount,amount);}
 assert.notEqual(compile({records:[{...row,text:text+'追加条件。'}]}).records[0].mainPlan?.mechanic,plan.mechanic);
 rows.push({...row,mainPlan:plan});
}
const mon=(id,type,stage)=>({officialCardId:id,name:id,deckName:id,category:'pokemon',attacks:[],abilities:[],facts:{types:[type],stage,basic:stage===0,hp:300,retreatCost:3,prizeCount:1},set:'test',cardNumber:id,source:{sha256:'test'},imageSourceUrl:'test'});
const card=(r,id)=>({id,name:r.name,kind:r.category,hp:300,damage:0,energyCards:[],tools:[],isSpecial:r.category==='energy',validationReference:{officialCardId:r.officialCardId,officialName:r.name,set:r.set,cardNumber:r.cardNumber,sourceSha256:r.source.sha256,imageSourceUrl:r.imageSourceUrl,adopted:false}});
const source=fs.readFileSync('engine/pokeca_reference_effect_runtime.cjs','utf8');
function fixture(row,type,stage,onTarget=false,bench=false){
 const a=mon('attacker',onTarget?'無色':type,stage),d=mon('defender',onTarget?type:'無色',stage),other=mon('other','無色',0);
 const catalog={records:[a,d,other,...rows]},box={module:{exports:{}},require:n=>{
 if(n==='./pokeca_reference_effect_data')return catalog;
 if(n==='./pokeca_selection_constraints')return {};
 if(n==='./pokeca_effect_extensions')return {catalog:x=>x};
 throw Error(n);
 }};
 vm.runInNewContext(source,box,{filename:'reference-runtime',timeout:10000});
 const attacker=card(a,'a'),defender=card(d,'d'),holder=onTarget?defender:attacker;
 const energy=card(row,'e');holder.energyCards.push(energy);
 const g={referenceEffectValidation:true,turnNumber:3,history:[],players:[{id:'you',active:attacker,bench:[],discard:[],prizes:6},{id:'ai',active:bench?card(other,'o'):defender,bench:bench?[defender]:[],discard:[],prizes:6}]};
 const runtime=box.module.exports;runtime.refresh(g);
 return {runtime,g,attacker,defender,holder,energy};
}
for(const row of rows){
 const p=row.mainPlan;
 if(p.mechanic==='ENERGY_STAGE_RAINBOW'){
  for(const stage of [0,1,2]){
   const f=fixture(row,'草',stage),units=f.runtime.energyUnits(f.holder);
   assert.equal(units.length,stage===p.stage?p.units:1);
   assert.equal(units.every(u=>u.includes('炎')&&u.includes('超')),stage===p.stage);
   assert.equal(f.holder.energyCards.length,1);
   f.holder.energyCards=[];assert.equal(f.runtime.energyUnits(f.holder).length,0);
  }
 }else{
  for(const type of [p.energyType,'無色']){
   const match=type===p.energyType;
   const f=fixture(row,type,0,p.mode==='benchGuard',p.mode==='benchGuard');
   assert.equal(f.runtime.energyUnits(f.holder)[0][0],p.energyType);
   assert.equal(f.holder.hp,p.mode==='hp'&&match?320:300);
   assert.equal(f.holder.retreatCost,p.mode==='retreat'&&match?0:3);
   assert.equal(f.runtime.damages(f.g,'you',f.defender,100,{bench:p.mode==='benchGuard'}),p.mode==='boost'&&match?120:p.mode==='benchGuard'&&match?0:100);
   if(p.mode==='benchGuard')assert.equal(f.runtime.damages(f.g,'you',f.defender,100,{bench:true,ignore:true}),100);
   f.holder.energyCards=[];f.runtime.refresh(f.g);assert.equal(f.holder.hp,300);assert.equal(f.holder.retreatCost,3);
   assert.equal(f.runtime.damages(f.g,'you',f.defender,100,{bench:p.mode==='benchGuard'}),100);
  }
 }
}
console.log('OWNER04_SPECIAL_ENERGY_RUNTIME_PASS',rows.length);
