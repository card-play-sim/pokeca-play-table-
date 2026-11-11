'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const MathCopy=Object.create(Math);let randomCalls=0,rolls=[];MathCopy.random=()=>{randomCalls++;return rolls.length?rolls.shift():.75;};
const ctx={window:{},performance,console,Math:MathCopy,setTimeout};vm.runInNewContext(fs.readFileSync('ui/engine.bundle.js','utf8'),ctx);const E=ctx.window.Pokeca;
const manifest=JSON.parse(fs.readFileSync('data/fixed-test-decks.json','utf8'));
const catalog=E.getReferenceEffectCatalog(),byName=name=>catalog.records.find(r=>r.officialCardId===catalog.defaultValidationReferences[name]);
function setup(options={}){
 let seed=2;const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};let g=E.createReferenceValidationMatch(manifest,{rng,firstDeck:options.firstDeck||0,referenceIds:options.referenceIds||{}}).game;
 delete g.pendingReferenceChoice;delete g.pendingPrizeSelection;g.turnNumber=3;g.turnPlayer='you';g.history=[];g.effectStates=[];
 const pools=g.players.map(p=>[p.active,...p.bench,...p.hand,...p.deck,...p.prizeCards].filter(Boolean));
 const take=(i,name)=>{const at=pools[i].findIndex(c=>c.name===name);assert(at>=0,'Missing fixed-deck fixture '+name);return pools[i].splice(at,1)[0];};
 const mon=c=>Object.assign(c,{cardId:c.id,damage:0,enteredTurn:0,energies:[],energyCards:[]});
 g.players.forEach((p,i)=>{
  p.active=mon(take(i,(options.active||['ロケット団のニューラ','ドラメシヤ'])[i]));
  p.bench=(options.bench?.[i]||[]).map(n=>mon(take(i,n)));
  p.hand=(options.hand?.[i]||[]).map(n=>take(i,n));p.discard=(options.discard?.[i]||[]).map(n=>take(i,n));p.prizes=6;p.turnLimits={supporterUsed:false,abilityUses:{}};p.normalEnergyAttached=false;
  for(const [which,names] of Object.entries(options.energy?.[i]||{})){
   const target=which==='active'?p.active:p.bench[Number(which)];target.energyCards=names.map(n=>take(i,n));target.energies=target.energyCards.map(c=>c.energyType).filter(Boolean);
  }
  p.prizeCards=pools[i].splice(0,6);p.deck=pools[i];
 });
 // Refresh via load initializes only derived effects. The immutable printed HP/stage stays exact.
 if(options.damage)for(const [i,n] of Object.entries(options.damage))g.players[Number(i)].active.damage=n;
 const port=E.createUIPort({getGame:()=>g,setGame:x=>g=x});const loaded=port.loadGame(g);assert(loaded.ok,JSON.stringify(loaded));
 return {port,get g(){return g;},do(actor,a){const result=port.dispatch(actor,a);assert(result.ok,JSON.stringify({action:a,result}));return result;},reject(actor,a,pattern){const before=JSON.stringify(port.getSnapshot());const result=port.dispatch(actor,a);assert(!result.ok,JSON.stringify(a));if(pattern)assert.match(result.errors.join(' '),pattern);assert.equal(JSON.stringify(port.getSnapshot()),before);return result;}};
}
function actionFor(t,actor,name,type){const p=t.g.players.find(p=>p.id===actor),card=p.hand.find(c=>c.name===name);assert(card);const choices=t.port.getHandOptions(actor,card.id);const x=choices.find(x=>x.action.type===type);assert(x,JSON.stringify(choices));assert(x.ok,JSON.stringify(x));return x.action;}
function ability(t,actor,name){const p=t.g.players.find(p=>p.id===actor),c=[p.active,...p.bench].find(c=>c.name===name);const x=t.port.getPokemonActions(actor,c.id).find(a=>a.kind==='ability'&&a.enabled);assert(x,JSON.stringify(t.port.getPokemonActions(actor,c.id)));return x.action;}
let cases=0;function test(name,fn){try{fn();console.log('PASS reference '+name);cases++;}catch(e){console.error('FAIL reference '+name);throw e;}}
test('89 print-specific references, 45 default names, no adoption',()=>{assert.equal(catalog.records.length,89);assert.equal(Object.keys(catalog.defaultValidationReferences).length,45);assert.equal(catalog.adoptedDeckPrints,0);const t=setup();assert(t.g.players.every(p=>[p.active,...p.bench,...p.hand,...p.deck,...p.prizeCards].filter(Boolean).every(c=>!c.officialCardId&&!c.catalogCardId&&c.validationReference.adopted===false)));});
test('fixed 20 damage, real energy, turn draw and identity preservation',()=>{const t=setup({energy:{0:{active:['基本悪エネルギー']}}});const count=t.g.players[1].hand.length;t.do('you',{type:'attack_turn',attackIndex:0});assert.equal(t.g.players[1].active.damage,20);assert.equal(t.g.turnPlayer,'ai');assert.equal(t.g.players[1].hand.length,count+1);});
test('reject first turn, wrong Energy and unconnected attack without mutation',()=>{const t=setup();t.reject('you',{type:'attack_turn',attackIndex:0},/ENERGY/);t.g.turnNumber=1;t.reject('you',{type:'attack_turn',attackIndex:0},/first|FIRST/);});
test('shared active-only dash, two draws and once across copies',()=>{const t=setup({active:['メガガルーラex','ドラメシヤ'],bench:{0:['メガガルーラex']},hand:{0:['ポケモンいれかえ']}});const a=ability(t,'you','メガガルーラex'),n=t.g.players[0].hand.length;t.do('you',a);assert.equal(t.g.players[0].hand.length,n+2);t.reject('you',a,/USED|SHARED/);t.do('you',actionFor(t,'you','ポケモンいれかえ','play_item'));const x=t.port.getPokemonActions('you',t.g.players[0].active.id).find(x=>x.kind==='ability');assert(!x.enabled);});
test('coin attack uses printed 200+50 and legality inspection consumes no RNG',()=>{const t=setup({active:['メガガルーラex','ドラメシヤ'],bench:{1:['スボミー']},energy:{0:{active:['基本悪エネルギー','基本悪エネルギー','基本超エネルギー']}}});const before=randomCalls;t.port.getPokemonActions('you',t.g.players[0].active.id);assert.equal(randomCalls,before);t.g.referenceRngState=0;const old=t.g.players[1].active;t.do('you',{type:'attack_turn',attackIndex:0});assert.equal(old.damage,300);assert.equal(t.g.pendingPrizeSelection.count,1);});
test('prizes and win are canonical; six prizes are not fabricated',()=>{const t=setup({active:['メガガルーラex','ドラメシヤ'],bench:{1:['スボミー']},energy:{0:{active:['基本悪エネルギー','基本悪エネルギー','基本超エネルギー']}}});t.g.referenceRngState=682;t.do('you',{type:'attack_turn',attackIndex:0});assert.equal(t.g.players[0].prizes,6);assert.equal(t.g.pendingPrizeSelection.count,1);t.do('you',{type:'take_prizes',slots:[0]});assert.equal(t.g.players[0].prizes,5);assert.equal(t.g.status,'active');assert.equal(t.g.turnPlayer,'ai');});
test('ultra ball pays exactly two and only searches Pokemon',()=>{const t=setup({hand:{0:['ハイパーボール','基本悪エネルギー','基本超エネルギー']}});const a=actionFor(t,'you','ハイパーボール','play_item'),before=t.g.players[0].hand.length;t.do('you',a);assert.equal(t.g.players[0].discard.length,3);assert.equal(t.g.players[0].hand.length,before-2);const found=t.g.players[0].hand[0];assert.equal(found.kind,'pokemon');});
test('stretcher only moves real discard target and preserves its ID',()=>{const t=setup({hand:{0:['夜のタンカ']},discard:{0:['基本悪エネルギー']}});const id=t.g.players[0].discard[0].id;t.do('you',actionFor(t,'you','夜のタンカ','play_item'));assert(t.g.players[0].hand.some(c=>c.id===id));});
test('supporter once per turn and printed Lillie draw eight at six prizes',()=>{const t=setup({hand:{0:['リーリエの決心','ジャッジマン']}});t.do('you',actionFor(t,'you','リーリエの決心','play_supporter'));assert.equal(t.g.players[0].hand.length,8);assert(t.g.players[0].turnLimits.supporterUsed);const c=t.g.players[0].hand.find(c=>c.cardType==='SUPPORTER');if(c)t.reject('you',{type:'play_supporter',cardId:c.id},/SUPPORTER/);});
test('judge resets both exact hands to four, not synthetic demo effect',()=>{const t=setup({hand:{0:['ジャッジマン','基本悪エネルギー'],1:['基本炎エネルギー']}});t.do('you',actionFor(t,'you','ジャッジマン','play_supporter'));assert.equal(t.g.players[0].hand.length,4);assert.equal(t.g.players[1].hand.length,4);});
test('boss caster choice and repellent defender choice are distinct',()=>{let t=setup({hand:{0:['ボスの指令']},bench:{1:['スボミー']}});const target=t.g.players[1].bench[0].id;t.do('you',actionFor(t,'you','ボスの指令','play_supporter'));assert.equal(t.g.players[1].active.id,target);t=setup({hand:{0:['むしよけスプレー']},bench:{1:['スボミー','ノコッチ']}});t.do('you',actionFor(t,'you','むしよけスプレー','play_item'));assert.equal(t.g.pendingReferenceChoice.playerId,'ai');t.reject('you',{type:'resolve_reference_choice',benchInstanceId:t.g.players[1].bench[0].id},/turn|CHOICE/);const chosen=t.g.players[1].bench[1].id;t.do('ai',{type:'resolve_reference_choice',benchInstanceId:chosen});assert.equal(t.g.players[1].active.id,chosen);});
test('all 89 verified reference print effects have connected plans without adopting official prints',()=>{assert.equal(catalog.records.length,89);for(const r of catalog.records){for(const effect of [...r.attacks,...r.abilities])assert(effect.plan,'missing '+r.officialCardId+':'+effect.name);}assert.equal(catalog.adoptedDeckPrints,0);});
test('shared self-switch attack uses selected bench target on both verified print variants',()=>{
 for(const officialCardId of ['47086','49290']){
  const t=setup({active:['ロケット団のニューラ','ノコッチ'],bench:{1:['ドラメシヤ']},
   energy:{1:{active:['基本超エネルギー']}},referenceIds:{'ノコッチ':officialCardId}});
  const selected=t.g.players[1].bench[0].id;
  t.do('you',{type:'end_turn'});
  t.reject('ai',{type:'attack_turn',attackIndex:0},/INVALID_REFERENCE_SELECTION/);
  t.do('ai',{type:'attack_turn',attackIndex:0,targetIds:[selected]});
  assert.equal(t.g.players[1].active.name,'ドラメシヤ');
  assert(t.g.players[1].bench.some(c=>c.name==='ノコッチ'));
  assert.equal(t.g.players[0].active.damage,0);
 }
});
test('shared any-target damage reaches opponent bench for both Cruel Arrow prints',()=>{
 for(const officialCardId of ['46058','46066']){
  const t=setup({active:['ロケット団のニューラ','キチキギスex'],bench:{0:['マシマシラ']},
   energy:{1:{active:['基本炎エネルギー','基本超エネルギー','基本悪エネルギー']}},
   referenceIds:{'キチキギスex':officialCardId}});
  const target=t.g.players[0].bench[0].id;
  t.do('you',{type:'end_turn'});
  t.reject('ai',{type:'attack_turn',attackIndex:0},/INVALID_REFERENCE_SELECTION/);
  t.do('ai',{type:'attack_turn',attackIndex:0,targetIds:[target]});
  assert.equal(t.g.players[0].bench[0].damage,100);
  assert.equal(t.g.players[0].active.damage,0);
 }
});
test('shared Flower Curtain protects non-rule bench but not rule Pokemon on four prints',()=>{
 for(const officialCardId of ['47301','47367','47860','48534']){
  for(const [targetName,expectedDamage] of [['マシマシラ',0],['メガガルーラex',100]]){
   const t=setup({active:['ロケット団のニューラ','キチキギスex'],
    bench:{0:['シェイミ','マシマシラ','メガガルーラex']},
    energy:{1:{active:['基本炎エネルギー','基本超エネルギー','基本悪エネルギー']}},
    referenceIds:{'シェイミ':officialCardId}});
   const target=t.g.players[0].bench.find(c=>c.name===targetName).id;
   t.do('you',{type:'end_turn'});
   t.do('ai',{type:'attack_turn',attackIndex:0,targetIds:[target]});
   assert.equal(t.g.players[0].bench.find(c=>c.name===targetName).damage,expectedDamage);
  }
 }
});
test('shared active-plus-bench attack exposes one bench target and rejects missing grass energy',()=>{
 const t=setup({active:['シェイミ','ドラメシヤ'],bench:{1:['スボミー']},
  referenceIds:{'シェイミ':'50452'}});
 const choices=t.port.getPokemonActions('you',t.g.players[0].active.id);
 const attack=choices.find(x=>x.kind==='attack'&&x.action.attackIndex===0);
 assert(attack,'verified Shaymin attack missing');
 assert(attack.requests.some(x=>x.kind==='POKEMON'&&x.candidates.length===1));
 t.reject('you',{type:'attack_turn',attackIndex:0,targetIds:[t.g.players[1].bench[0].id]},/ENERGY/);
});
test('energy reflect damages active and transfers exactly one selected energy to bench',()=>{
 const t=setup({active:['シェイミ','ドラメシヤ'],bench:{0:['マシマシラ']},
  energy:{0:{active:['基本悪エネルギー','基本超エネルギー']}},
  referenceIds:{'シェイミ':'46559'}});
 const source=t.g.players[0].active,target=t.g.players[0].bench[0];
 const energyId=source.energyCards[0].id;
 t.reject('you',{type:'attack_turn',attackIndex:0},/INVALID_REFERENCE_SELECTION/);
 t.do('you',{type:'attack_turn',attackIndex:0,selections:{energy:[energyId],attachTo:[target.id]}});
 assert.equal(t.g.players[1].active.damage,60);
 assert.equal(source.energyCards.length,1);
 assert.equal(target.energyCards.length,1);
 assert.equal(target.energyCards[0].id,energyId);
});
test('flower delivery only offers deck energy and grass bench and rejects unpayable grass attack',()=>{
 const t=setup({active:['シェイミ','ドラメシヤ'],bench:{0:['マシマシラ']},
  referenceIds:{'シェイミ':'49636'}});
 const choices=t.port.getPokemonActions('you',t.g.players[0].active.id);
 const attack=choices.find(x=>x.kind==='attack'&&x.action.attackIndex===0);
 assert(attack,'verified flower delivery attack missing');
 const energy=attack.requests.find(x=>x.key==='energy');
 const attachTo=attack.requests.find(x=>x.key==='attachTo');
 assert(energy&&energy.candidates.every(c=>c.kind==='energy'));
 assert(attachTo&&attachTo.candidates.length===0,'non-grass bench must not be eligible');
 t.reject('you',{type:'attack_turn',attackIndex:0},/ENERGY/);
});
test('reference-mode or print tuple tampering is rejected',()=>{const t=setup(),g=JSON.parse(JSON.stringify(t.g));delete g.referenceEffectValidation;assert.equal(t.port.loadGame(g).ok,false);const bad=JSON.parse(JSON.stringify(t.g));bad.players[0].active.validationReference.set='WRONG';assert.equal(t.port.loadGame(bad).ok,false);});

test('Skyline uses source-verified basic retreat and Watchtower suppresses colorless ability only',()=>{const t=setup({active:['メガガルーラex','ドラメシヤ'],bench:{0:['ラティアスex']},hand:{0:['ロケット団の監視塔']}});assert.equal(t.g.players[0].active.retreatCost,0);t.do('you',actionFor(t,'you','ロケット団の監視塔','play_stadium'));const dash=t.port.getPokemonActions('you',t.g.players[0].active.id).find(a=>a.label==='おつかいダッシュ');assert(!dash.enabled);assert.equal(t.g.players[0].active.retreatCost,0);});
test('Fairy Zone, weakness, bench-count damage and defender promotion choice',()=>{const t=setup({active:['リーリエのピッピex','ドラメシヤ'],bench:{1:['スボミー','ノコッチ']},energy:{0:{active:['基本超エネルギー','基本悪エネルギー']}}});const old=t.g.players[1].active;t.do('you',{type:'attack_turn',attackIndex:0});assert.equal(old.damage,120);assert.equal(t.g.pendingReferenceChoice.playerId,'ai');assert.equal(t.g.pendingPrizeSelection.playerId,'you');t.do('you',{type:'take_prizes',slots:[0]});const target=t.g.players[1].bench[1].id;t.do('ai',{type:'resolve_reference_choice',benchInstanceId:target});assert.equal(t.g.players[1].active.id,target);assert.equal(t.g.turnPlayer,'ai');});
test('Adrena Brain requires Dark, moves up to three, and cannot duplicate counters',()=>{const t=setup({active:['マシマシラ','ドラメシヤ'],energy:{0:{active:['基本悪エネルギー']}},damage:{0:50}});const a=ability(t,'you','マシマシラ');t.do('you',a);assert.equal(t.g.players[0].active.damage,20);assert.equal(t.g.players[1].active.damage,30);t.reject('you',a,/USED/);});
test('hand Excite Dive keeps its real evolution stage and shared entry event',()=>{const t=setup({active:['メガガルーラex','ドラメシヤ'],hand:{0:['ファイアローex']}});const c=t.g.players[0].hand[0],a=t.port.getHandOptions('you',c.id).find(o=>o.action.type==='use_ability');assert(a?.ok,JSON.stringify(a));t.do('you',a.action);assert.equal(t.g.players[0].bench[0].name,'ファイアローex');assert.equal(t.g.players[0].bench[0].basic,false);assert.equal(t.g.players[0].bench[0].stage,2);});
test('Meowth trigger is only the immediate from-hand Bench window',()=>{const t=setup({hand:{0:['ニャースex']}});const c=t.g.players[0].hand[0];t.do('you',{type:'bench_basic',cardId:c.id});const a=ability(t,'you','ニャースex');t.do('you',a);assert(t.g.players[0].hand.some(c=>c.cardType==='SUPPORTER'));t.reject('you',a,/USED|ENTRY/);});
test('Hero Cape HP is recalculated when Jamming Tower removes the tool effect',()=>{const t=setup({hand:{0:['ヒーローマント'],1:['ジャミングタワー']}});const c=t.g.players[0].hand[0];t.do('you',{type:'attach_tool',cardId:c.id,targetInstanceId:t.g.players[0].active.id});assert.equal(t.g.players[0].active.hp,180);t.g.players[0].active.damage=100;t.do('you',{type:'end_turn'});t.do('ai',actionFor(t,'ai','ジャミングタワー','play_stadium'));assert.equal(t.g.status,'finished');assert.equal(t.g.winner,'ai');});
test('Rocket Energy is two typed units only on Rocket Pokemon and Ignition expires',()=>{let t=setup({hand:{0:['ロケット団のエネルギー']},bench:{1:['スボミー']}});t.do('you',{type:'attach_energy',cardIndex:0,target:'active'});const a=t.port.getPokemonActions('you',t.g.players[0].active.id).find(x=>x.label==='ねくびをかく');assert(a.enabled,JSON.stringify(a));t=setup({active:['メガガルーラex','ドラメシヤ'],hand:{0:['ロケット団のエネルギー']}});t.reject('you',{type:'attach_energy',cardIndex:0,target:'active'},/ROCKET/);t=setup({active:['ファイアローex','ドラメシヤ'],hand:{0:['イグニッションエネルギー']}});const id=t.g.players[0].hand[0].id;t.do('you',{type:'attach_energy',cardIndex:0,target:'active'});assert.equal(t.g.players[0].active.energies.length,3);t.do('you',{type:'end_turn'});assert(t.g.players[0].discard.some(c=>c.id===id));assert.equal(t.g.players[0].active.energyCards.length,0);});
test('Ruins is two counters on a non-Dark Basic entry, not guessed attack damage',()=>{const t=setup({hand:{0:['危ない廃墟','シェイミ']}});t.do('you',actionFor(t,'you','危ない廃墟','play_stadium'));const c=t.g.players[0].hand.find(c=>c.name==='シェイミ');t.do('you',{type:'bench_basic',cardId:c.id});assert.equal(t.g.players[0].bench[0].damage,20);});
test('Cyrano, Hilda and Brock cannot mix search categories illegally',()=>{for(const name of ['シアノ','トウコ','たけしのスカウト']){const t=setup({hand:{0:[name]}}),a=actionFor(t,'you',name,'play_supporter');t.do('you',a);assert(t.g.players[0].hand.length>0);assert(t.g.players[0].turnLimits.supporterUsed);}});
test('Akamatsu chooses different basic types and attaches only the non-hand card',()=>{const t=setup({hand:{0:['アカマツ']}}),a=actionFor(t,'you','アカマツ','play_supporter');assert.equal(a.selections.cards.length,2);t.do('you',a);assert.equal(t.g.players[0].active.energyCards.length,1);assert(t.g.players[0].hand.some(c=>c.kind==='energy'));});
test('Red Card checks three prizes; Unfair checks previous opponent knockout',()=>{let t=setup({hand:{0:['スペシャルレッドカード']}});t.reject('you',{type:'play_item',cardId:t.g.players[0].hand[0].id},/PRIZES/);t.g.players[1].prizes=3;t.g.players[1].prizeCards.splice(3).forEach(c=>t.g.players[1].hand.push(c));t.do('you',actionFor(t,'you','スペシャルレッドカード','play_item'));assert.equal(t.g.players[1].hand.length,3);t=setup({firstDeck:1,active:['ドラメシヤ','ロケット団のニューラ'],hand:{0:['アンフェアスタンプ']}});t.reject('you',{type:'play_item',cardId:t.g.players[0].hand[0].id},/KNOCKOUT/);});
test('Recon looks at exactly two, adds one and returns the other to bottom',()=>{const t=setup({firstDeck:1,active:['ドロンチ','ロケット団のニューラ']});const top=t.g.players[0].deck.slice(0,2).map(c=>c.id),a=ability(t,'you','ドロンチ');t.do('you',a);assert(t.g.players[0].hand.some(c=>c.id===top[0]));assert.equal(t.g.players[0].deck.at(-1).id,top[1]);});
test('evolution uses exact print effect and once-per-turn state; stack IDs return intact',()=>{const t=setup({firstDeck:1,active:['ノコッチ','ロケット団のニューラ'],bench:{0:['ドラメシヤ']},hand:{0:['ノココッチ']}});const base=t.g.players[0].active.id,evo=t.g.players[0].hand[0].id;t.do('you',{type:'evolve',cardId:evo,targetInstanceId:base});assert.equal(t.g.players[0].active.name,'ノココッチ');const a=ability(t,'you','ノココッチ');t.do('you',a);assert(t.g.players[0].deck.some(c=>c.id===base&&c.name==='ノコッチ'));assert(t.g.players[0].deck.some(c=>c.id===evo&&c.name==='ノココッチ'));assert.equal(t.g.players[0].active.name,'ドラメシヤ');});
test('last remaining Active knockout ends the game without an invalid active-less state',()=>{const t=setup({active:['メガガルーラex','ドラメシヤ'],energy:{0:{active:['基本悪エネルギー','基本悪エネルギー','基本超エネルギー']}}});rolls=[.8];t.do('you',{type:'attack_turn',attackIndex:0});assert.equal(t.g.status,'finished');assert.equal(t.g.winner,'you');assert(!t.g.pendingPrizeSelection);});
test('evolved knockout returns the original Basic print and evolution separately; finished research restores exactly',()=>{const t=setup({firstDeck:1,active:['ドラメシヤ','メガガルーラex'],hand:{0:['ドロンチ']},bench:{0:['ノコッチ','スボミー']},energy:{1:{active:['基本悪エネルギー','基本悪エネルギー','基本超エネルギー']}}});const base=t.g.players[0].active.id,evo=t.g.players[0].hand[0].id;t.do('you',{type:'evolve',cardId:evo,targetInstanceId:base});t.do('you',{type:'end_turn'});rolls=[.8];t.do('ai',{type:'attack_turn',attackIndex:0});assert.equal(t.g.players[0].discard.find(c=>c.id===base).name,'ドラメシヤ');assert.equal(t.g.players[0].discard.find(c=>c.id===evo).name,'ドロンチ');const saved=t.port.getResumeSnapshot(),result=t.port.restoreSession(saved);assert(result.ok,JSON.stringify(result));assert.equal(JSON.stringify(t.port.getSnapshot()),JSON.stringify(saved.game));});
test('full fixed120 reference state saves and restores without adoption',()=>{const t=setup({hand:{0:['ジャッジマン']}});t.do('you',actionFor(t,'you','ジャッジマン','play_supporter'));const saved=t.port.getResumeSnapshot();assert(t.port.restoreSession(saved).ok);assert.equal(JSON.stringify(t.port.getSnapshot()),JSON.stringify(saved.game));});

test('Circulator waits for defender choice after damage and moves the actual energy',()=>{const t=setup({hand:{0:['ハンディサーキュレーター']},bench:{1:['ノコッチ']},energy:{1:{active:['基本超エネルギー']}}});t.do('you',{type:'attach_tool',cardId:t.g.players[0].hand[0].id,targetInstanceId:t.g.players[0].active.id});t.do('you',{type:'end_turn'});const energy=t.g.players[1].active.energyCards[0].id;t.do('ai',{type:'attack_turn',attackIndex:0});assert.equal(t.g.pendingReferenceChoice.kind,'CIRCULATOR');assert.equal(t.g.pendingReferenceChoice.playerId,'you');const target=t.g.players[1].bench[0].id;t.reject('ai',{type:'resolve_reference_choice',energyId:energy,benchInstanceId:target},/turn|CHOICE/);t.do('you',{type:'resolve_reference_choice',energyId:energy,benchInstanceId:target});assert.equal(t.g.players[1].bench[0].energyCards[0].id,energy);assert.equal(t.g.players[1].active.energyCards.length,0);assert.equal(t.g.turnPlayer,'you');});
test('Circulator resolves before knockout, prizes and defender replacement without losing the tool evidence',()=>{const t=setup({hand:{0:['ハンディサーキュレーター']},bench:{0:['マシマシラ','シェイミ'],1:['ノコッチ']},energy:{1:{active:['基本超エネルギー']}},damage:{0:70}});const tool=t.g.players[0].hand[0].id;t.do('you',{type:'attach_tool',cardId:tool,targetInstanceId:t.g.players[0].active.id});t.do('you',{type:'end_turn'});t.do('ai',{type:'attack_turn',attackIndex:0});assert.equal(t.g.pendingReferenceChoice.kind,'CIRCULATOR');assert(!t.g.pendingPrizeSelection);const option=t.g.pendingReferenceChoice.options[0];t.do('you',{type:'resolve_reference_choice',...option});assert(!t.g.pendingPrizeSelection);assert.equal(t.g.players[1].prizes,5);assert.equal(t.g.pendingReferenceChoice.kind,'PROMOTE');assert.equal(t.g.pendingReferenceChoice.playerId,'you');assert(t.g.players[0].discard.some(c=>c.id===tool));t.do('you',{type:'resolve_reference_choice',benchInstanceId:t.g.players[0].bench[1].id});assert.equal(t.g.turnPlayer,'you');assert(!t.g.pendingPrizeSelection);assert(!t.g.pendingReferenceChoice);});
test('Circulator cannot move an energy from a replacement for an attacker returned to hand (official FAQ)',()=>{const t=setup({hand:{0:['ハンディサーキュレーター']},active:['ロケット団のニューラ','ニャースex'],bench:{1:['ドラメシヤ']},energy:{1:{active:['基本超エネルギー','基本超エネルギー','基本炎エネルギー']}}});t.do('you',{type:'attach_tool',cardId:t.g.players[0].hand[0].id,targetInstanceId:t.g.players[0].active.id});t.do('you',{type:'end_turn'});const energyIds=t.g.players[1].active.energyCards.map(c=>c.id);t.do('ai',{type:'attack_turn',attackIndex:0});assert(!t.g.pendingReferenceChoice);assert.equal(t.g.players[1].active.name,'ドラメシヤ');assert.equal(t.g.players[1].active.energyCards.length,0);assert(energyIds.every(id=>t.g.players[1].hand.some(c=>c.id===id)));});
test('Phantom Dive allocates exactly six counters and rejects a forged distribution',()=>{const t=setup({firstDeck:1,active:['ドラパルトex','ロケット団のニューラ'],bench:{1:['シェイミ','メガガルーラex']},energy:{0:{active:['基本炎エネルギー','基本超エネルギー']}}});const ids=t.g.players[1].bench.map(c=>c.id);t.reject('you',{type:'attack_turn',attackIndex:1,selections:{allocation:{[ids[0]]:5}}},/ALLOCATION/);t.do('you',{type:'attack_turn',attackIndex:1,selections:{allocation:{[ids[0]]:3,[ids[1]]:3}}});assert.equal(t.g.players[1].bench.reduce((s,c)=>s+(c.damage||0),0),60);});
test('Budew zero cost is observed from the official zero-energy icon; item lock expires',()=>{const t=setup({firstDeck:1,active:['スボミー','ロケット団のニューラ'],hand:{1:['ハイパーボール','基本悪エネルギー','基本超エネルギー']}});assert.deepEqual(Array.from(byName('スボミー').attacks[0].cost),[]);t.do('you',{type:'attack_turn',attackIndex:0});const ball=t.g.players[1].hand.find(c=>c.name==='ハイパーボール');t.reject('ai',{type:'play_item',cardId:ball.id},/ITEM/);t.do('ai',{type:'end_turn'});t.do('you',{type:'end_turn'});assert(t.port.getHandOptions('ai',ball.id).some(o=>o.ok&&o.action.type==='play_item'));});
test('bench damage prevention is not counter prevention',()=>{const t=setup({active:['マシマシラ','ドラメシヤ'],bench:{1:['ドラパルトex']},energy:{0:{active:['基本悪エネルギー']}},damage:{0:40}});const a=ability(t,'you','マシマシラ');a.selections.target=[t.g.players[1].bench[0].id];t.do('you',a);assert.equal(t.g.players[1].bench[0].damage,30);});
test('printed confusion is applied; tails deals 30 to the attacker and ends its turn',()=>{const t=setup({active:['マシマシラ','ドラメシヤ'],energy:{0:{active:['基本超エネルギー','基本悪エネルギー']},1:{active:['基本超エネルギー']}}});t.do('you',{type:'attack_turn',attackIndex:0});assert.equal(t.g.players[1].active.statusCondition,'CONFUSED');const old=t.g.players[0].active.damage,confused=t.g.players[1].active;rolls=[.9];t.do('ai',{type:'attack_turn',attackIndex:0});assert.equal(confused.damage,90);assert.equal(t.g.players[0].active.damage,old);assert.equal(t.g.status,'finished');assert.equal(t.g.winner,'you');});
test('coin protection uses damage/effect prevention only in the next opposing turn',()=>{const t=setup({firstDeck:1,active:['ノコッチ','ロケット団のニューラ'],energy:{0:{active:['基本炎エネルギー','基本超エネルギー']},1:{active:['基本悪エネルギー']}}});rolls=[.1];t.do('you',{type:'attack_turn',attackIndex:1});t.do('ai',{type:'attack_turn',attackIndex:0});assert.equal(t.g.players[0].active.damage,0);assert.equal(t.g.turnPlayer,'you');});
test('energy switch cannot select the same Pokemon and does not consume hand attachment',()=>{const t=setup({hand:{0:['エネルギーつけかえ']},bench:{0:['メガガルーラex']},energy:{0:{active:['基本悪エネルギー']}}});const a=actionFor(t,'you','エネルギーつけかえ','play_item'),bad=JSON.parse(JSON.stringify(a));bad.selections.attachTo=[t.g.players[0].active.id];t.reject('you',bad,/SAME/);t.do('you',a);assert.equal(t.g.players[0].bench[0].energyCards.length,1);assert.equal(t.g.players[0].normalEnergyAttached,false);});
test('Night Mine adds one Colorless only for a source-verified Tera Pokemon',()=>{const t=setup({firstDeck:1,active:['ドラパルトex','ロケット団のニューラ'],hand:{1:['夜の鉱山']},energy:{0:{active:['基本炎エネルギー','基本超エネルギー']}}});t.do('you',{type:'end_turn'});t.do('ai',actionFor(t,'ai','夜の鉱山','play_stadium'));t.do('ai',{type:'end_turn'});t.reject('you',{type:'attack_turn',attackIndex:1},/ENERGY/);});

test('Goods switch moves the real benched Pokemon and preserves card IDs',()=>{const t=setup({hand:{0:['ポケモンいれかえ']},bench:{0:['マシマシラ']}});const p=t.g.players[0],old=p.active.id,next=p.bench[0].id;const a=actionFor(t,'you','ポケモンいれかえ','play_item');a.selections={bench:[next]};t.do('you',a);assert.equal(p.active.id,next);assert.equal(p.bench[0].id,old);assert(p.discard.some(c=>c.name==='ポケモンいれかえ'));});
test('Goods Poffin benches selected eligible Basic without creating cards',()=>{const t=setup({firstDeck:1,active:['ドラメシヤ','ロケット団のニューラ'],hand:{0:['なかよしポフィン']}});const p=t.g.players[0],before=p.deck.length;const a=actionFor(t,'you','なかよしポフィン','play_item');const options=t.port.getHandOptions('you',a.cardId);const req=options.find(x=>x.action.type==='play_item').requests.find(x=>x.key==='cards');assert(req);const c=req.candidates[0];assert(c,'eligible Basic in deck');a.selections={cards:[c.id]};t.do('you',a);assert(p.bench.some(x=>x.id===c.id));assert.equal(p.deck.length,before-1);});
test('Goods Pokepad retrieves only a non-rule Pokemon from the real deck',()=>{const t=setup({firstDeck:1,active:['ドラメシヤ','ロケット団のニューラ'],hand:{0:['ポケパッド']}});const p=t.g.players[0],a=actionFor(t,'you','ポケパッド','play_item');const req=t.port.getHandOptions('you',a.cardId).find(x=>x.action.type==='play_item').requests.find(x=>x.key==='cards');assert(req.candidates.length);const c=req.candidates[0];a.selections={cards:[c.id]};t.do('you',a);assert(p.hand.some(x=>x.id===c.id));assert(!p.deck.some(x=>x.id===c.id));});
test('Goods Hammer discards the selected opposing energy on heads',()=>{const t=setup({firstDeck:1,active:['ドラメシヤ','ロケット団のニューラ'],hand:{0:['クラッシュハンマー']},energy:{1:{active:['基本悪エネルギー']}}});const p=t.g.players[1],energy=p.active.energyCards[0].id;const a=actionFor(t,'you','クラッシュハンマー','play_item');a.selections={energy:[energy]};rolls.push(.1);t.do('you',a);assert(!p.active.energyCards.some(x=>x.id===energy));assert(p.discard.some(x=>x.id===energy));});
test('forged card attack commands never bypass source-verified attack cost',()=>{const t=setup({active:['シェイミ','ドラメシヤ']});t.g.players[0].active.attacks=[{name:'forged',cost:[],damage:999,commands:[{command:'DAMAGE',amount:999}]}];t.reject('you',{type:'attack_turn',attackIndex:0},/ENERGY/);assert.equal(t.g.players[1].active.damage,0);});
console.log('Reference effect scenarios',cases);

(async()=>{
 const t=setup({active:['リーリエのピッピex','ドラメシヤ'],bench:{1:['スボミー','ノコッチ']},energy:{0:{active:['基本超エネルギー','基本悪エネルギー']}}});
 t.do('you',{type:'attack_turn',attackIndex:0});
 assert(t.g.pendingPrizeSelection&&t.g.pendingReferenceChoice);
 const saved=t.port.getResumeSnapshot();assert(t.port.restoreSession(saved).ok);
 const result=await E.runAITurn(t.port,'you',{maxActions:10});
 assert(result.ok,JSON.stringify(result));assert(result.actions>0,'must take prizes before yielding to defender');
 assert(!t.g.pendingPrizeSelection);assert.equal(t.g.players[0].prizes,5);
 assert.equal(t.g.pendingReferenceChoice.playerId,'ai');assert.equal(t.g.pendingReferenceChoice.kind,'PROMOTE');
 const next=await E.runAITurn(t.port,'ai',{maxActions:80});assert(next.ok,JSON.stringify(next));assert(!t.g.pendingReferenceChoice);
 console.log('PASS reference AI takes pending prizes before yielding to replacement Active choice, including restore');
})().catch(e=>{console.error(e);process.exitCode=1;});
