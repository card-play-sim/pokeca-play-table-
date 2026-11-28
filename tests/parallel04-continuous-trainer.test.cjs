'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),vm=require('node:vm');
const {compile}=require('../engine/reference-effect-plans.cjs');
const groups=[
 ['Nの城','stadium','STADIUM_FILTERED_RETREAT','47105','48703'],
 ['パラダイスリゾート','stadium','STADIUM_FILTERED_RETREAT','46228','48261'],
 ['ハロンタウン','stadium','STADIUM_TEAM_BOOST','47107','48708'],
 ['ホップのこだわりハチマキ','tool','TOOL_TEAM_COST_BOOST','47100','48689','49406'],
 ['フルメタルラボ','stadium','STADIUM_FILTERED_REDUCTION','45287'],
 ['いしのどうくつ','stadium','STADIUM_FILTERED_REDUCTION','47289'],
 ['とくちゅうチョッキ','tool','TOOL_FILTERED_REDUCTION','50403','50540'],
 ['せいなるおまもり','tool','TOOL_FILTERED_REDUCTION','48415','48509'],
 ['ぶあついうろこ','tool','TOOL_FILTERED_REDUCTION','48686'],
 ['でんきだま','tool','TOOL_NAMED_EX_BOOST','48685']
];
const icons={none:'無色',grass:'草',fire:'炎',water:'水',electric:'雷',steel:'鋼',dragon:'竜'};
const rows=[];
for(const [name,category,mechanic,...ids] of groups)for(const officialCardId of ids){
 const saved=JSON.parse(fs.readFileSync('data/effect-extensions/evidence/'+officialCardId+'.json','utf8'));
 assert.equal(saved.url,'https://www.pokemon-card.com/card-search/details.php/card/'+officialCardId);
 assert.equal(crypto.createHash('sha256').update(saved.html).digest('hex'),saved.htmlSha256);
 assert.ok(saved.html.includes('カード詳細（'+name+'）'));
 const raw=saved.html.match(/<h2 class="mt20">(?:スタジアム|ポケモンのどうぐ)<\/h2>\s*<p>([\s\S]*?)<\/p>/)[1];
 const text=raw.replace(/<span class="icon-([a-z]+) icon"><\/span>/g,(_,x)=>'['+icons[x]+']').replace(/<br\s*\/?>/g,'').replace(/\s+/g,'');
 const row={officialCardId,name,deckName:name,category,text,attacks:[],abilities:[],facts:{},set:'test',cardNumber:officialCardId,source:{sha256:saved.htmlSha256},imageSourceUrl:'test'};
 const p=compile({records:[row]}).records[0].mainPlan;
 assert.equal(p.mechanic,mechanic);
 assert.notEqual(compile({records:[{...row,text:text+'追加条件。'}]}).records[0].mainPlan?.mechanic,mechanic);
 rows.push({...row,mainPlan:p});
}
const mon=(id,name,type,mega=false,ability=false)=>({officialCardId:id,name,deckName:name,category:'pokemon',attacks:[],abilities:ability?[{name:'test',plan:{mechanic:'TEST'}}]:[],rulesText:mega?'メガシンカexがきぜつしたとき':'',facts:{types:[type],stage:0,basic:true,hp:300,retreatCost:3,prizeCount:1},set:'test',cardNumber:id,source:{sha256:'test'},imageSourceUrl:'test'});
const card=(r,id)=>({id,name:r.name,kind:r.category,hp:300,damage:0,energyCards:[],tools:[],validationReference:{officialCardId:r.officialCardId,officialName:r.name,set:r.set,cardNumber:r.cardNumber,sourceSha256:r.source.sha256,imageSourceUrl:r.imageSourceUrl,adopted:false}});
const source=fs.readFileSync('engine/pokeca_reference_effect_runtime.cjs','utf8');
function fixture(row,{aName='ホップのウールー',aType='草',dName='ダイゴのダンバル',dType='鋼',aMega=false,dMega=false,ability=false,bench=false,holder='a',jam=false}={}){
 const a=mon('a',aName,aType,aMega,ability),d=mon('d',dName,dType,dMega),o=mon('other','other','無色');
 const j={...mon('jam','jam','無色'),category:'stadium',mainPlan:{mechanic:'JAMMING'}};
 const catalog={records:[a,d,o,j,...rows]},box={module:{exports:{}},require:n=>{
 if(n==='./pokeca_reference_effect_data')return catalog;
 if(n==='./pokeca_selection_constraints')return {};
 if(n==='./pokeca_effect_extensions')return {catalog:x=>x};
 throw Error(n);
 }};
 vm.runInNewContext(source+'\nmodule.exports.testCost=cost;',box,{filename:'reference-runtime',timeout:10000});
 const attacker=card(a,'a'),defender=card(d,'d'),tool=card(row,'t');
 if(row.category==='tool')(holder==='a'?attacker:defender).tools=[tool];
 const g={referenceEffectValidation:true,turnNumber:3,history:[],stadium:jam?card(j,'jam'):row.category==='stadium'?tool:null,players:[{id:'you',active:attacker,bench:[],discard:[],prizes:6},{id:'ai',active:bench?card(o,'o'):defender,bench:bench?[defender]:[],discard:[],prizes:6}]};
 const runtime=box.module.exports;runtime.refresh(g);
 return {runtime,g,a:attacker,d:defender,damage:(options={})=>runtime.damages(g,'you',defender,100,{bench,...options}),cost:()=>runtime.testCost(g,attacker,{name:'test',cost:['草','無色','無色']})};
}
for(const row of rows){
 const p=row.mainPlan;
 switch(p.mechanic){
 case 'STADIUM_FILTERED_RETREAT':{
  const name=p.team?p.team+'のゾロア':p.name;
  const f=fixture(row,{aName:name,dName:name});
  assert.equal(f.a.retreatCost,p.free?0:3-p.amount);assert.equal(f.d.retreatCost,p.free?0:3-p.amount);
  const bad=fixture(row,{aName:'other',dName:'other'});assert.equal(bad.a.retreatCost,3);
  f.g.stadium=null;f.runtime.refresh(f.g);assert.equal(f.a.retreatCost,3);break;
 }
 case 'STADIUM_TEAM_BOOST':
 case 'TOOL_TEAM_COST_BOOST':{
  const f=fixture(row);assert.equal(f.damage(),100+p.amount);
  assert.equal(f.cost().length,p.discount?2:3);assert.equal(f.cost()[0],'草');
  assert.equal(fixture(row,{aName:'other'}).damage(),100);
  assert.equal(fixture(row,{bench:true}).damage(),100);
  assert.equal(fixture(row,{jam:true}).damage(),100);break;
 }
 case 'TOOL_NAMED_EX_BOOST':{
  assert.equal(fixture(row,{aName:p.name,dName:'テストex'}).damage(),100+p.amount);
  assert.equal(fixture(row,{aName:'other',dName:'テストex'}).damage(),100);
  assert.equal(fixture(row,{aName:p.name,dName:'other'}).damage(),100);break;
 }
 case 'STADIUM_FILTERED_REDUCTION':
 case 'TOOL_FILTERED_REDUCTION':{
  const options={holder:'d',...(p.holderType?{dType:p.holderType}:{}),...(p.mode==='mega'?{aMega:true}:{}),...(p.mode==='ability'?{ability:true}:{}),...(p.mode==='types'?{aType:p.attackerTypes[0]}:{})};
  const f=fixture(row,options);assert.equal(f.damage(),100-p.amount);assert.equal(f.damage({ignore:true}),100);
  assert.equal(fixture(row,{...options,jam:true}).damage(),100);
  const negative=p.mode==='mega'?{dMega:true}:p.mode==='ability'?{ability:false}:p.mode==='types'?{aType:'無色'}:p.team?{dName:'other'}:{dType:'無色'};
  assert.equal(fixture(row,{...options,...negative}).damage(),100);break;
 }
 default:throw Error(p.mechanic);
 }
}
console.log('OWNER04_CONTINUOUS_TRAINER_RUNTIME_PASS',rows.length);
