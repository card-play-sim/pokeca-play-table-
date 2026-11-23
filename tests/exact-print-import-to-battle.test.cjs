'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const context={window:{},localStorage:{getItem:()=>null}};
vm.runInNewContext(fs.readFileSync('ui/deck-code-import.js','utf8'),context,{filename:'deck-code-import.js'});
vm.runInNewContext(fs.readFileSync('ui/saved-decks.js','utf8'),context,{filename:'saved-decks.js'});
const api=context.window.PokecaDeckCodeImport,gate=context.window.PokecaSavedDecks;
const catalog=api.catalogFrom(read('data/official-image-registry.json'),read('data/reference-effects/catalog.json'),
 read('data/deck-building/catalog.json'),read('data/deck-building/m7-official-image-extension.json'),
 read('data/deck-building/official-import-verified-extension.json'));
const plans=gate.plansFrom(read('data/reference-effects/plans.json'),read('data/effect-extensions/compiled.json'));
// This is a synthetic but legal 60-card official-format recipe. No card substitutions
// are allowed: the exact print IDs must survive parsing, catalog lookup and match entry creation.
const deckCode='ABC123-DEF456-GHI789';
const fields={saveDeckID:deckCode,deck_pke:'47847_4_1',deck_gds:'49573_4_1',
 deck_tool:'',deck_tech:'',deck_sup:'47288_3_1',deck_sta:'',deck_ene:'49460_49_1'};
const parsed=api.parseFields(fields,deckCode);
assert.equal(parsed.total,60);
const reconciled=api.matchCatalog(parsed,catalog);
assert.equal(reconciled.identityStatus,'CONFIRMED',JSON.stringify(reconciled.cards.filter(x=>x.identityStatus!=='CONFIRMED')));
const byId=new Map(reconciled.cards.map(r=>[String(r.officialCardId),r]));
for(const [id,count] of [['47847',4],['49573',4],['47288',3],['49460',49]]){
 assert.equal(byId.get(id)?.count,count,'exact official recipe ID and count '+id);
 const meta=catalog.get(id),record=plans.get(id);
 assert(meta&&record,'catalog and effect plan required '+id);
 assert.equal(meta.name,record.name,'no same-name-only lookup '+id);
 assert.equal(meta.url,record.imageSourceUrl,'official print image must match verified effect '+id);
 assert.equal(gate.connectionError(id,meta,record),'','effect plan must match imported image '+id);
}
assert.equal(plans.get('49573').mainPlan.mechanic,'POKEPAD');
assert.equal(plans.get('47288').mainPlan.mechanic,'BOSS');
const deck={name:'official-import-exact-prints',cards:Object.fromEntries(byId.entries().map(([id,row])=>[id,row.count])),blocked:[]};
assert.equal(gate.total(deck),60);
const entries=gate.matchEntries(deck,catalog,plans);
assert.equal(entries.reduce((n,e)=>n+e.count,0),60);
assert.equal(entries.find(e=>e.referenceOfficialCardId==='49573').count,4);
assert.equal(entries.find(e=>e.referenceOfficialCardId==='47288').count,3);
assert(entries.some(e=>e.category==='pokemon'),'valid Basic Pokémon is required');
const fake={...catalog.get('47288'),url:'https://example.invalid/fake.jpg'};
assert.equal(gate.connectionError('47288',fake,plans.get('47288')),'PRINT_IDENTITY_CONFLICT');
console.log('PASS official-form recipe -> 60-card catalog -> two exact print effects -> match entries (plus image-conflict rejection)');

const engineContext={window:{},console,performance,Math,setTimeout};
vm.runInNewContext(fs.readFileSync('ui/engine.bundle.js','utf8'),engineContext);
const E=engineContext.window.Pokeca;
const exactDeck={name:'シークレットボックスの60枚対戦',cards:{
  47847:4,49573:4,47288:3,45786:1,48711:2,45783:1,42945:45
},blocked:[]};
const exactCards=gate.matchEntries(exactDeck,catalog,plans);
assert.equal(gate.diagnoseDeck(exactDeck,catalog,plans).deckReady,true);
const tooManyAce={...exactDeck,cards:{...exactDeck.cards,45783:2,42945:44}};
assert.throws(()=>gate.matchEntries(tooManyAce,catalog,plans),/ACE SPEC/);
const revealId=card=>card.validationReference?.officialCardId;
const manifest={decks:[{name:exactDeck.name,total:60,cards:exactCards},
  {name:'対戦相手',total:60,cards:entries}]};
const s=Array.from({length:250},(_,index)=>index+1).find(seed=>{
  const trial=start(seed);
  if(!trial.ok||trial.game.pendingReferenceChoice||trial.game.turnPlayer!=='you')return false;
  const p=trial.game.players[0];
  return p.hand.some(card=>revealId(card)==='45783')&&p.hand.filter(card=>revealId(card)==='42945').length>=4&&
    [49573,47288,45786,48711].every(id=>p.deck.some(card=>revealId(card)===String(id)));
});
assert(s,'opening seed for exact prints and all four search categories');
function start(seed){
  let state=seed;
  return E.createReferenceValidationMatch(manifest,{firstDeck:0,startingBench:{you:[]},rng:()=>{
    state=(Math.imul(state,1664525)+1013904223)>>>0;
    return state/4294967296;
  }});
}
let {game}=start(s);
const port=E.createUIPort({getGame:()=>game,setGame:next=>{game=next;}});
assert(port.loadGame(game).ok);
const initial=port.getSnapshot(),own=initial.players[0];
const box=own.hand.find(card=>revealId(card)==='45783');
const fire=own.hand.find(card=>revealId(card)==='42945');
const attach=port.getHandOptions('you',fire.id).find(o=>o.ok&&o.action.target==='active');
assert(attach&&port.dispatch('you',attach.action).ok);
assert(port.getSnapshot().players[0].active.energyCards.some(card=>card.id===fire.id&&revealId(card)==='42945'));
const use=port.getHandOptions('you',box.id).find(o=>o.ok&&o.action.type==='play_item');
assert(use);
const beforeBox=port.getSnapshot();
const {cards:selected,discard}=use.action.selections;
assert.equal(discard.length,3);
assert.equal(selected.length,4);
assert.equal(port.dispatch('you',{...use.action,selections:{cards:selected,discard:[box.id,...discard.slice(1)]}}).ok,false);
assert.deepEqual(port.getSnapshot(),beforeBox);
assert(port.dispatch('you',use.action).ok);
const afterBox=port.getSnapshot();
assert([box.id,...discard].every(id=>afterBox.players[0].discard.some(card=>card.id===id)));
assert(selected.every(id=>afterBox.players[0].hand.some(card=>card.id===id)));
assert(port.restoreSession(port.getResumeSnapshot()).ok);
assert.deepEqual(port.getSnapshot(),afterBox);
console.log('PASS exact prints 45783 and 42945 in the same 60-card match, four category search, ACE SPEC and save/restore');

async function verifyExactPrintsThroughFinishedMatch(){
 const ownDeck={name:'対戦接続回帰',cards:{
 47847:4,49262:4,49263:4,49264:3,49573:4,47288:3,45786:1,48711:2,45783:1,42945:18,49460:16
 },blocked:[]};
 assert.equal(gate.total(ownDeck),60);
 const both={decks:[{...ownDeck,cards:gate.matchEntries(ownDeck,catalog,plans)},
  {name:'対戦相手',total:60,cards:entries}]};
 // Fixed shuffle that opens both issue #164 prints and the evolution line.
 const seed=191089423;
 let n=seed;
 const create=(opening={})=>E.createReferenceValidationMatch(both,{firstDeck:0,
  rng:()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;},
  startingBench:{you:[]},...opening});
 let result=create();
 assert(result.ok&&!result.game.pendingReferenceChoice&&result.game.turnPlayer==='you');
 const first=result.game.players[0];
 const opening=[first.active,...first.hand];
 assert.equal(opening.length,7);
 const active=opening.find(card=>revealId(card)==='47847');
 const bench=opening.find(card=>revealId(card)==='49262');
 assert(active&&bench&&opening.some(card=>revealId(card)==='45783')&&
   opening.some(card=>revealId(card)==='42945'));
 n=seed;
 result=create({startingActive:{you:active.id},startingBench:{you:[bench.id]}});
 assert(result.ok);
 let game=result.game;
 const p=E.createUIPort({getGame:()=>game,setGame:next=>{game=next;}});
 assert(p.loadGame(game).ok);
 const initial=p.getSnapshot();
 assert.equal(revealId(initial.players[0].active),'47847');
 assert.equal(revealId(initial.players[0].bench[0]),'49262');
 const play=(id,type,condition=()=>true)=>{
  const card=p.getSnapshot().players[0].hand.find(card=>revealId(card)===id);
  const option=card&&p.getHandOptions('you',card.id).find(o=>o.ok&&o.action.type===type&&condition(o.action));
  return Boolean(option&&p.dispatch('you',option.action).ok);
 };
 assert(play('42945','attach_energy',action=>action.target==='active'));
 assert(!E.getLegalActions(p.getSnapshot(),'you').actions.some(action=>action.type==='attack_turn'));
 const dash=p.getPokemonActions('you',active.id).find(option=>option.kind==='ability'&&option.enabled);
 assert(dash&&p.dispatch('you',dash.action).ok);
 assert(play('45783','play_item',action=>action.selections.discard.length===3));
 assert(!E.getLegalActions(p.getSnapshot(),'you').actions.some(action=>action.type==='evolve'));
 for(let i=0;i<100&&p.getSnapshot().status==='active';i++){
  const current=p.getSnapshot();
  const actor=(current.pendingPrizeSelection||current.pendingReferenceChoice||{}).playerId||current.turnPlayer;
  const next=await E.runAITurn(p,actor,{maxActions:80});
  assert(next.ok,JSON.stringify(next));
  const snap=p.getSnapshot();
  assert(p.restoreSession(p.getResumeSnapshot()).ok);
  assert.deepEqual(p.getSnapshot(),snap);
 }
 const end=p.getSnapshot();
 const events=new Set(end.history.map(event=>event.type));
 assert.equal(end.status,'finished');
 for(const type of ['attack','evolve','ability_used','knockout'])assert(events.has(type),type);
 assert(end.players.some(player=>player.prizes<6));
 console.log('PASS issue #164 exact prints through a finished 60-card match, evolution, ability, attack, prize and restore');
}
verifyExactPrintsThroughFinishedMatch().catch(error=>{console.error(error);process.exitCode=1;});
