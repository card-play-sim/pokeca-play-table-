'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {compile}=require('../engine/reference-effect-plans.cjs');
const text='自分の場の「ロケット団のポケモン」が4匹以上のときにしか、このポケモンはワザが使えない。';
const facts=(rulePokemon=false)=>({types:['悪'],basic:true,stage:0,hp:130,retreatCost:1,prizeCount:1,
 weakness:null,resistance:null,rulePokemon,teraBenchProtection:false});
const mk=(n,name,{attacks=[],abilities=[],rulePokemon=false}={})=>({
 officialCardId:String(990100+n),name,deckName:name,category:'pokemon',set:'SYNTHETIC',cardNumber:String(n),
 source:{sha256:'synthetic-evidence-checksum'},imageSourceUrl:'https://example.invalid/'+n,
 text:'',attacks,abilities,facts:facts(rulePokemon)});
const rocket=mk(1,'ロケット団の主力',{rulePokemon:true,
 attacks:[{name:'いちげき',text:'',damage:'90',cost:[]}],
 abilities:[{name:'なかまのちから',text}]});
const mate=mk(2,'ロケット団の仲間');
const stranger=mk(3,'普通のポケモン');
const enemy=mk(4,'相手のポケモン');
const records=compile({records:[rocket,mate,stranger,enemy]}).records;
assert.equal(records[0].attacks[0].plan.mechanic,'VANILLA_DAMAGE');
assert.equal(records[0].abilities[0].plan.mechanic,'PASSIVE_ROCKET_TEAM_ATTACK_GATE');
assert.equal(records[0].abilities[0].plan.required,4);
assert.equal(compile({records:[mk(5,'類似文',{abilities:[{
 name:'違う条件',text:'自分の場の「ロケット団のポケモン」が4匹以上なら、このポケモンはワザが使える。'
}]})]}).records[0].abilities[0].plan,null,'different printed text remains unconnected');
const suppression={...mk(6,'抑制スタジアム'),category:'stadium',mainPlan:{
 mechanic:'SUPPRESS_RULE_ABILITIES',commands:['ADD_STATE']
}};
const indexed=[...records,suppression];
function physical(r,id){return {id,cardId:id,name:r.name,kind:'pokemon',
 validationReference:{officialCardId:r.officialCardId,officialName:r.name,set:r.set,
 cardNumber:r.cardNumber,sourceSha256:r.source.sha256,imageSourceUrl:r.imageSourceUrl,adopted:false},
 energyCards:[],tools:[],damage:0};}
const Module={exports:{}};
const fakeRequire=name=>{
 if(name==='./pokeca_reference_effect_data')return {records:[]};
 if(name==='./pokeca_effect_extensions')return {catalog:()=>({records:indexed,defaultValidationReferences:{}})};
 if(name==='./pokeca_selection_constraints')return {resolve:()=>{throw Error('unexpected selection')}};
 if(name==='./pokeca_effect_service')return {apply(game,cmd,{targetIds}){
  assert.equal(cmd.command,'DAMAGE');
  const found=game.players.flatMap(p=>[p.active,...p.bench]).find(c=>c&&c.id===targetIds[0]);
  assert(found,'damage target missing');found.damage=(found.damage||0)+cmd.amount;
  game.history.push({type:'effect_command',details:{command:'DAMAGE',amount:cmd.amount}});
 }};
 if(name==='./pokeca_engine_core')return {resolveKnockouts(){},endTurn(game){game.turnPlayer='opponent';}};
 throw Error('UNKNOWN_IMPORT '+name);
};
vm.runInNewContext('(function(require,module,exports){\n'+fs.readFileSync('engine/pokeca_reference_effect_runtime.cjs','utf8')+'\n})',{console})(fakeRequire,Module,Module.exports);
const engine=Module.exports;
function game(){
 return {referenceEffectValidation:{adoptedPrints:0},status:'active',phase:'main',turnNumber:2,
  attackUsed:false,turnPlayer:'you',history:[],
  players:[
   {id:'you',active:physical(records[0],'rocket-active'),bench:[],hand:[],deck:[],discard:[],prizes:6,
    turnLimits:{supporterUsed:false,abilityUses:{}}},
   {id:'opponent',active:physical(records[3],'enemy'),bench:[],hand:[],deck:[],discard:[],prizes:6,
    turnLimits:{supporterUsed:false,abilityUses:{}}}
  ]};
}
const action={type:'attack_turn',attackIndex:0};
let g=game();
assert.match(engine.preflight(g,'you',action).errors.join(';'),/ROCKET_TEAM_ATTACK_REQUIREMENT/);
assert.equal(g.players[1].active.damage,0,'invalid attack never modifies state');
g.players[0].bench.push(physical(records[1],'rocket-1'),physical(records[1],'rocket-2'));
assert.match(engine.preflight(g,'you',action).errors.join(';'),/ROCKET_TEAM_ATTACK_REQUIREMENT/);
g.players[0].bench.push(physical(records[2],'non-rocket'));
assert.match(engine.preflight(g,'you',action).errors.join(';'),/ROCKET_TEAM_ATTACK_REQUIREMENT/);
g.players[0].bench[2]=physical(records[1],'rocket-3');
assert.equal(engine.preflight(g,'you',action).errors.length,0,'four Rocket Team Pokémon including attacker permit attack');
engine.execute(g,'you',action);
assert.equal(g.players[1].active.damage,90,'legitimate attack resolves real damage');
assert.equal(g.turnPlayer,'opponent','attack ends the turn');
g=game();g.turnNumber=1;
assert.match(engine.preflight(g,'you',action).errors.join(';'),/FIRST_PLAYER_FIRST_TURN_ATTACK/);
g=game();g.stadium=physical(suppression,'stadium');
assert.equal(engine.preflight(g,'you',action).errors.length,0,'rule-Pokémon ability suppression removes restriction');
console.log('PASS: Rocket Team shared attack gate count, non-team exclusion, first turn and suppression in executable battle state');
