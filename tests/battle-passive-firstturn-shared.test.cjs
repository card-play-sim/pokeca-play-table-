'use strict';
// Strict source-text compiler + executable battle-state regression.
// No official print ID is adopted here: synthetic fixtures exercise reusable
// mechanics, while the intake pipeline owns official print evidence and release.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {compile}=require('../engine/reference-effect-plans.cjs');
const reduction='このポケモンが受けるワザのダメージは「-30」される。';
const firstTurn='このカードは、先攻プレイヤーの最初の番でも使える。\n\n自分の手札をすべてトラッシュし、山札を5枚引く。';
const facts=(types=['悪'])=>({types,weakness:null,resistance:null,stage:0,basic:true,retreatCost:1,hp:130,prizeCount:1,teraBenchProtection:false});
const rec=(id,name,category,extra={})=>({
 officialCardId:String(id),name,deckName:name,set:'SYNTHETIC',cardNumber:String(id),category,
 source:{sha256:'verified-source-placeholder'},imageSourceUrl:'https://example.invalid/'+id,
 facts:facts(),attacks:[],abilities:[],text:'',...extra
});
const attackRecord=rec(990001,'攻撃側','pokemon');
const passiveRecord=rec(990002,'防御側','pokemon',{
 facts:facts(['無色']),abilities:[{name:'防御能力',text:reduction}]
});
const specialSupporter=rec(990003,'先攻サポート','supporter',{text:firstTurn});
const ordinarySupporter=rec(990004,'通常サポート','supporter',{
 text:'自分の手札をすべてトラッシュし、山札を5枚引く。'
});
const stadiumRecord=rec(990005,'特性を無効にする場','stadium',{
 mainPlan:{mechanic:'WATCHTOWER',commands:['ADD_STATE']}
});
const compiled=compile({records:[attackRecord,passiveRecord,specialSupporter,ordinarySupporter]});
const compiledDefender=compiled.records.find(r=>r.officialCardId==='990002');
const compiledSupporter=compiled.records.find(r=>r.officialCardId==='990003');
assert.equal(compiledDefender.abilities[0].plan.mechanic,'PASSIVE_INCOMING_ATTACK_DAMAGE_REDUCTION');
assert.equal(compiledDefender.abilities[0].plan.amount,30);
assert.equal(compiledSupporter.mainPlan.mechanic,'SUPPORTER_FIRST_TURN_DISCARD_HAND_DRAW');
assert.equal(compiledSupporter.mainPlan.amount,5);
assert.equal(compiled.records.find(r=>r.officialCardId==='990004').mainPlan.mechanic,'DISCARD_HAND_DRAW');
// Similar but semantically different source cannot be guessed as the same mechanic.
const unknown=compile({records:[rec(990006,'別の特性','pokemon',{
 abilities:[{name:'追加条件つき',text:'このポケモンがバトル場にいるなら、このポケモンが受けるワザのダメージは「-30」される。'}]
})]});
assert.equal(unknown.records[0].abilities[0].plan,null);
const catalog={
 records:[compiled.records[0],compiledDefender,compiledSupporter,
   {...ordinarySupporter,mainPlan:{mechanic:'DISCARD_HAND_DRAW',commands:['DISCARD','DRAW'],amount:5}},
   stadiumRecord],
 defaultValidationReferences:{}
};
const runtimeFile=fs.readFileSync('engine/pokeca_reference_effect_runtime.cjs','utf8');
const mockedModule={exports:{}};
const effects={
 apply(game,command,{playerId}){
  if(command.command!=='DRAW')throw Error('UNEXPECTED_COMMAND:'+command.command);
  const p=game.players.find(x=>x.id===playerId);
  const drawn=p.deck.splice(0,command.amount);p.hand.push(...drawn);
  game.history.push({turnNumber:game.turnNumber,player:playerId,type:'draw',details:{playerId,count:drawn.length}});
 }
};
const fakeRequire=name=>{
 if(name==='./pokeca_reference_effect_data')return {records:[]};
 if(name==='./pokeca_effect_extensions')return {catalog:()=>catalog};
 if(name==='./pokeca_selection_constraints')return {};
 if(name==='./pokeca_effect_service')return effects;
 if(name==='./pokeca_engine_core')return {resolveKnockouts(){}};
 throw Error('UNEXPECTED_IMPORT:'+name);
};
const factory=vm.runInNewContext('(function(require,module,exports){\n'+runtimeFile+'\n})',{console});
factory(fakeRequire,mockedModule,mockedModule.exports);
const engine=mockedModule.exports;
function card(row,ident,kind){
 return {id:ident,name:row.name,kind,
  cardType:row.category==='supporter'?'SUPPORTER':undefined,
  validationReference:{officialCardId:row.officialCardId,officialName:row.name,
   set:row.set,cardNumber:row.cardNumber,sourceSha256:row.source.sha256,
   imageSourceUrl:row.imageSourceUrl,adopted:false},
  energyCards:[],tools:[],damage:0,bench:[]};
}
const attacker=card(catalog.records[0],'attacker','pokemon');
const defender=card(catalog.records[1],'defender','pokemon');
const special=card(catalog.records[2],'special','trainer');
const regular=card(catalog.records[3],'regular','trainer');
const stadium=card(catalog.records[4],'stadium','stadium');
const otherCards=[{id:'discard1',name:'その他1'},{id:'discard2',name:'その他2'}];
const game={status:'active',phase:'main',turnPlayer:'you',turnNumber:1,
 attackUsed:false,referenceEffectValidation:{adoptedPrints:0},history:[],
 players:[
  {id:'you',active:attacker,bench:[],hand:[special,...otherCards],deck:Array.from({length:8},(_,i)=>({id:'deck'+i})),
   discard:[],prizes:6,turnLimits:{supporterUsed:false,abilityUses:{}}},
  {id:'opponent',active:defender,bench:[],hand:[],deck:[],discard:[],prizes:6,
   turnLimits:{supporterUsed:false,abilityUses:{}}}
 ]};
assert.equal(engine.damages(game,'you',defender,100),70,'defending continuous -30 must execute');
assert.equal(engine.damages(game,'you',defender,100,{ignore:true}),100,'ignore defender effects must bypass reduction');
game.stadium=stadium;
assert.equal(engine.damages(game,'you',defender,100),100,'suppressed ability must not reduce damage');
delete game.stadium;
const first={type:'play_supporter',cardId:'special'};
assert.equal(engine.preflight(game,'you',first).errors.length,0,'printed first-turn exception must be legal');
game.players[0].hand.unshift(regular);
assert.match(engine.preflight(game,'you',{type:'play_supporter',cardId:'regular'}).errors.join(';'),/SUPPORTER_NOT_ALLOWED/);
game.players[0].hand.shift();
engine.execute(game,'you',first);
assert.equal(game.players[0].hand.length,5,'actual draw should replace discarded hand');
assert.equal(game.players[0].discard.length,3,'played supporter and the two remaining hand cards must be discarded');
assert.equal(game.players[0].deck.length,3);
assert.equal(game.players[0].turnLimits.supporterUsed,true);
assert.ok(game.history.some(e=>e.type==='effect_command'&&e.details.command==='DRAW'));
assert.match(engine.preflight(game,'you',first).errors.join(';'),/SUPPORTER_NOT_ALLOWED|HAND_CARD_MISSING/);
console.log('PASS: official-text shared passive reduction and first-turn supporter resolve real battle-state changes');
