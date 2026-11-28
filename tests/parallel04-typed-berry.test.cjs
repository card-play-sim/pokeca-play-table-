'use strict';
// Owner 04: official saved HTML identity, shared compiler and actual runtime damage path.
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),vm=require('node:vm');
const {compile}=require('../engine/reference-effect-plans.cjs');
const families=[['水','water','イトケのみ','46287','49392'],['炎','fire','オッカのみ','46032','49394'],['超','psychic','ウタンのみ','46031','49393'],['竜','dragon','ハバンのみ','46817','49402'],['鋼','steel','リリバのみ','46440','49409'],['悪','dark','ナモのみ','46439','49401']];
const rows=[];
for(const [type,icon,name,...ids] of families)for(const officialCardId of ids){
 const saved=JSON.parse(fs.readFileSync('data/effect-extensions/evidence/'+officialCardId+'.json','utf8'));
 assert.equal(saved.url,'https://www.pokemon-card.com/card-search/details.php/card/'+officialCardId);
 assert.equal(crypto.createHash('sha256').update(saved.html).digest('hex'),saved.htmlSha256);
 assert.ok(saved.html.includes('カード詳細（'+name+'）'));
 const text='このカードをつけているポケモンが、相手の['+type+']ポケモンからワザのダメージを受けるとき、そのダメージは「-60」され、このカードをトラッシュする。';
 assert.ok(saved.html.includes(text.replace('['+type+']','<span class="icon-'+icon+' icon"></span>')));
 const row={officialCardId,category:'tool',name,deckName:name,set:'test',cardNumber:officialCardId,source:{sha256:saved.htmlSha256},imageSourceUrl:'test',text,attacks:[],abilities:[],facts:{}};
 const p=compile({records:[row]}).records[0].mainPlan;
 assert.equal(p.mechanic,'TOOL_TYPED_DAMAGE_REDUCTION_DISCARD');assert.equal(p.attackerType,type);assert.equal(p.amount,60);
 assert.notEqual(compile({records:[{...row,text:text+'追加条件。'}]}).records[0].mainPlan?.mechanic,p.mechanic);
 rows.push({...row,mainPlan:p});
}
const mon=(id,type,weakness=null)=>({officialCardId:id,category:'pokemon',name:id,deckName:id,set:'test',cardNumber:id,source:{sha256:'test'},imageSourceUrl:'test',attacks:[],abilities:[],facts:{types:[type],weakness,resistance:null}});
const defender=mon('defender','草');
const stadium={...mon('jam','草'),category:'stadium',mainPlan:{mechanic:'JAMMING'}};
const source=fs.readFileSync('engine/pokeca_reference_effect_runtime.cjs','utf8');
function card(r,id){return {id,name:r.deckName,hp:400,damage:0,energyCards:[],tools:[],validationReference:{officialCardId:r.officialCardId,officialName:r.name,set:r.set,cardNumber:r.cardNumber,sourceSha256:r.source.sha256,imageSourceUrl:r.imageSourceUrl,adopted:false}};}
function run(row,type,amount,{ignore=false,jam=false,bench=false,weak=false,prevent=false}={}){
 const attacker=mon('attacker',type),targetRecord={...defender,facts:{...defender.facts,weakness:weak?{types:[type],value:'×2'}:null}};
 const catalog={records:[attacker,targetRecord,stadium,...rows]};
 const box={module:{exports:{}},require:n=>{
  if(n==='./pokeca_reference_effect_data')return catalog;
  if(n==='./pokeca_selection_constraints')return {};
  if(n==='./pokeca_effect_extensions')return {catalog:x=>x};
  if(n==='./pokeca_effect_service')return {apply:(g,c,ctx)=>{assert.equal(c.command,'DAMAGE');const m=g.players.flatMap(p=>[p.active,...p.bench]).find(x=>x.id===ctx.targetIds[0]);m.damage+=c.amount;}};
  if(n==='./pokeca_engine_core')return {};
  throw Error(n);
 }};
 vm.runInNewContext(source,box,{filename:'reference-runtime',timeout:10000});
 const a=card(attacker,'a'),d=card(targetRecord,'d'),t=card(row,'tool');d.tools=[t];
 if(prevent)d.referenceProtection={opponentTurn:3};
 const p={id:'you',active:a,bench:[],discard:[]},o={id:'opponent',active:bench?card(targetRecord,'other'):d,bench:bench?[d]:[],discard:[]};
 const g={players:[p,o],turnNumber:3,history:[],stadium:jam?card(stadium,'jam'):null};
 const value=box.module.exports.damage(g,'you',d,amount,{ignore,bench});
 assert.equal(d.damage,value);
 return {value,consumed:o.discard.includes(t),attached:d.tools.includes(t),history:g.history};
}
for(const row of rows){
 const type=row.mainPlan.attackerType;
 for(const [amount,options,expected,used] of [[100,{},40,true],[30,{},0,true],[100,{bench:true},40,true],[100,{weak:true},140,true],[100,{ignore:true},100,false],[100,{jam:true},100,false],[100,{prevent:true},0,false],[0,{},0,false]]){
  const res=run(row,type,amount,options);assert.equal(res.value,expected,row.officialCardId);assert.equal(res.consumed,used);assert.equal(res.attached,!used);
  assert.equal(res.history.filter(x=>x.details.command==='DISCARD').length,used?1:0);
 }
 const mismatch=run(row,'無色',100);assert.equal(mismatch.value,100);assert.equal(mismatch.consumed,false);
}
console.log('OWNER04_TYPED_BERRY_SOURCE_RUNTIME_PASS',rows.length);
