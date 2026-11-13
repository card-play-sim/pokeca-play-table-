'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={window:{},performance,console,Math,setTimeout};vm.runInNewContext(fs.readFileSync('ui/engine.bundle.js','utf8'),context);const E=context.window.Pokeca;
const S=vm.runInNewContext(fs.readFileSync('tests/fixtures/control-005-scenarios.js','utf8'),{console});const manifest=JSON.parse(fs.readFileSync('data/fixed-test-decks.json')),rows=S.inventory(E,manifest),results=[];
function test(name,fn){try{fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAILED',error:String(e),stack:e.stack});}}
function fixture(row){const frame=S.create(E,manifest,row);let game=frame.game;const port=E.createUIPort({getGame:()=>game,setGame:g=>game=g});assert(port.loadGame(game).ok);return {frame,port,snapshot:()=>port.getSnapshot()};}
const reject=(p,a)=>{const before=JSON.stringify(p.getSnapshot());assert.equal(p.dispatch('you',a).ok,false);assert.equal(JSON.stringify(p.getSnapshot()),before);};
for(const row of rows.filter(x=>x.kind==='ability'&&!['SKYLINE','FAIRY_ZONE'].includes(x.plan.mechanic))){test(row.cardName+' ability gateway, AI parity and reuse rejection',()=>{
 const {frame,port,snapshot}=fixture(row);if(row.plan.mechanic==='MEOWTH_ENTRY')assert(port.dispatch('you',{type:'bench_basic',cardId:frame.sourceId}).ok);
 const option=S.option(E,port,frame);assert(option&&(option.ok??option.enabled));const before=snapshot(),legal=E.getLegalActions(before,'you').actions;
 assert(legal.some(a=>a.type==='use_ability'&&a.sourceInstanceId===frame.sourceId&&a.abilityId===row.effectId),'AI sees same ability');
 assert(port.dispatch('you',option.action).ok);S.verify(E,frame,before,snapshot(),option.action);reject(port,option.action);
 const resume=port.getResumeSnapshot();assert(port.restoreSession(resume).ok);reject(port,option.action);
});}
for(const mechanic of ['DASH','RUN_AWAY_DRAW'])test(mechanic+' suppression and replacement restore legal ability',()=>{
 const row=rows.find(r=>r.plan.mechanic===mechanic),{frame,port,snapshot}=fixture(row),g=snapshot(),p=g.players[0];
 const take=(predicate,owners=g.players)=>{for(const owner of owners)for(const zone of ['deck','hand','prizeCards']){const list=owner[zone],i=list.findIndex(predicate);if(i<0)continue;const card=list[i];if(zone==='prizeCards')list[i]=owner.deck.shift();else list.splice(i,1);return {card,owner};}throw Error('STADIUM_FIXTURE_MISSING');};
 const tower=take(c=>E.getReferenceEffectRecord(c)?.mainPlan?.mechanic==='WATCHTOWER');g.stadium=tower.card;g.stadiumOwner=tower.owner.id;
 const replacement=take(c=>c.kind==='stadium'&&E.getReferenceEffectRecord(c)?.mainPlan?.mechanic!=='WATCHTOWER',[p]).card;p.hand.push(replacement);assert(port.loadGame(g).ok);
 const option=S.option(E,port,frame);assert.equal(option.enabled,false);reject(port,option.action);assert(!E.getLegalActions(snapshot(),'you').actions.some(a=>a.type==='use_ability'&&a.sourceInstanceId===frame.sourceId));
 const play=port.getHandOptions('you',replacement.id).find(o=>o.ok);assert(play);assert(port.dispatch('you',play.action).ok);assert(S.option(E,port,frame).enabled);assert(port.dispatch('you',S.option(E,port,frame).action).ok);
});
for(const mechanic of ['DASH','RECON','ADRENA_BRAIN'])test(mechanic+' turn limit resets on the next own turn',()=>{
 const {frame,port}=fixture(rows.find(r=>r.plan.mechanic===mechanic)),first=S.option(E,port,frame);assert(port.dispatch('you',first.action).ok);assert(!S.option(E,port,frame).enabled);
 assert(port.dispatch('you',{type:'end_turn'}).ok);assert(port.dispatch('ai',{type:'end_turn'}).ok);assert(S.option(E,port,frame).enabled);assert(port.dispatch('you',S.option(E,port,frame).action).ok);
});
for(const mechanic of ['SKYLINE','FAIRY_ZONE'])test(mechanic+' continuous source lifecycle, details and save round trip',()=>{
 const row=rows.find(r=>r.plan.mechanic===mechanic),{frame,port,snapshot}=fixture(row);if(mechanic==='FAIRY_ZONE'){const g=snapshot(),p=g.players[0],zone=['bench','deck','hand','prizeCards'].find(z=>p[z].some(c=>c.name==='マシマシラ')),i=p[zone].findIndex(c=>c.name==='マシマシラ'),old=p.active;p.active=p[zone][i];p[zone][i]=old;Object.assign(p.active,{cardId:p.active.id,damage:0,enteredTurn:0,energyCards:old.energyCards,energies:old.energies,tools:[]});old.energyCards=[];old.energies=[];assert(port.loadGame(g).ok);}assert(port.dispatch('you',S.option(E,port,frame).action).ok);const present=snapshot();
 const info=port.getCardInfo('you',frame.sourceId).entries.find(e=>e.id===row.effectId);assert.equal(info.active,true);const resume=port.getResumeSnapshot();assert(port.restoreSession(resume).ok);
 if(mechanic==='SKYLINE')assert.equal(present.players[0].active.retreatCost,0);
 else {assert(port.dispatch('you',{type:'attack_turn',attackIndex:0}).ok);assert.equal(snapshot().players[1].active.damage,120);}
 const absent=JSON.parse(JSON.stringify(present)),p=absent.players[0],index=p.bench.findIndex(c=>c.id===frame.sourceId);p.hand.push(...p.bench.splice(index,1));assert(port.loadGame(absent).ok);assert.equal(port.getCardInfo('you',frame.sourceId).entries.find(e=>e.id===row.effectId).active,false);
 if(mechanic==='SKYLINE')assert.equal(snapshot().players[0].active.retreatCost,E.getReferenceEffectRecord(p.active).facts.retreatCost);
 else {assert(port.dispatch('you',{type:'attack_turn',attackIndex:0}).ok);assert.equal(snapshot().players[1].active.damage,60);}
 assert.equal(new Set(S.identities(snapshot())).size,120);
});
test('dependent counter count never offers zero or more counters than the selected source',()=>{
 const {frame,port,snapshot}=fixture(rows.find(r=>r.plan.mechanic==='ADRENA_BRAIN'));const g=snapshot();g.players[0].active.damage=10;assert(port.loadGame(g).ok);
 const o=S.option(E,port,frame),r=E.resolveReferenceRequest(o.requests.find(r=>r.kind==='COUNT'),o.requests,{source:[frame.sourceId]});assert.equal(r.min,1);assert.equal(r.max,1);
 reject(port,{...o.action,selections:{...o.action.selections,count:0}});reject(port,{...o.action,selections:{...o.action.selections,count:2}});assert(port.dispatch('you',o.action).ok);
});
test('energy transfer excludes the holder and optional search choices track the previous selection',()=>{
 const {frame,port}=fixture(rows.find(r=>r.plan.mechanic==='ENERGY_SWITCH')),o=S.option(E,port,frame);const r=E.resolveReferenceRequest(o.requests[1],o.requests,o.action.selections);assert(!r.candidates.some(c=>c.id===frame.activeId));assert(r.candidates.some(c=>c.id===o.action.selections.attachTo[0]));
 const a=fixture(rows.find(r=>r.plan.mechanic==='AKAMATSU')),ao=S.option(E,a.port,a.frame);
 for(const n of [0,1,2]){const selected={cards:ao.action.selections.cards.slice(0,n)};const hand=E.resolveReferenceRequest(ao.requests.find(r=>r.key==='toHand'),ao.requests,selected),target=E.resolveReferenceRequest(ao.requests.find(r=>r.key==='attachTo'),ao.requests,selected);assert.equal(hand.candidates.length,n);assert.equal(hand.min,n?1:0);assert.equal(target.min,n>1?1:0);}
});
test('unknown dependency semantics fail closed',()=>{assert.throws(()=>E.resolveReferenceRequest({key:'b',dependencies:[{kind:'unknown',key:'a'}]},[{key:'a',candidates:[]},{key:'b'}]),/UNKNOWN/);});
fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/control-006-abilities.json',JSON.stringify({scope:'reference-ability-gateway',results},null,2)+'\n');console.log(JSON.stringify(results,null,2));if(results.some(r=>r.status==='FAILED')){fs.mkdirSync('test-results/control-006-failures',{recursive:true});fs.writeFileSync('test-results/control-006-failures/'+Date.now()+'.json',JSON.stringify({cause:'SHARED_ABILITY_GATEWAY_OR_FIXTURE',results},null,2));process.exitCode=1;}
