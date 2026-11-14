'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={window:{},console,performance,Math,setTimeout};vm.runInNewContext(fs.readFileSync('ui/engine.bundle.js','utf8'),context);const E=context.window.Pokeca,F=require('./fixtures/control-009-scenarios.cjs')(E),results=[];
function test(name,fn){try{fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAILED',error:String(e),stack:e.stack});}}
const option=t=>t.port.getHandOptions('you',t.frame.sourceId).find(o=>o.ok);
function reject(t,a){const before=JSON.stringify(t.port.getSnapshot());assert.equal(t.port.dispatch('you',a).ok,false);assert.equal(JSON.stringify(t.port.getSnapshot()),before);}
function restore(t){const before=JSON.stringify(t.port.getSnapshot()),saved=t.port.getResumeSnapshot();assert(t.port.restoreSession(saved).ok);assert.equal(JSON.stringify(t.port.getSnapshot()),before);}
for(const r of F.records)test(r.officialCardId+' '+r.mainPlan.mechanic+' command/UI/AI/state/save',()=>{
 const t=F.create(r.officialCardId),o=option(t);assert(o);const before=t.port.getSnapshot(),p=before.players[0];assert(E.getLegalActions(before,'you').actions.some(a=>JSON.stringify(a)===JSON.stringify(o.action)));
 reject(t,{...o.action,type:r.category==='item'?'play_supporter':'play_item'});
 assert(t.port.dispatch('you',o.action).ok);const after=t.port.getSnapshot(),a=after.players[0];assert.deepEqual(t.S.identities(before),t.S.identities(after));
 if(r.mainPlan.mechanic==='DISCARD_HAND_DRAW'){assert.equal(a.hand.length,7);assert.equal(a.deck.length,p.deck.length-7);assert(p.hand.every(c=>a.discard.some(d=>d.id===c.id)));assert(a.turnLimits.supporterUsed);}
 if(r.mainPlan.mechanic==='RECOVER_BASIC_ENERGY'){assert.equal(a.hand.length,p.hand.length-1+o.action.selections.cards.length);assert(o.action.selections.cards.every(i=>a.hand.some(c=>c.id===i)));assert.equal(a.discard.filter(c=>c.kind==='energy').length,0);assert(!a.normalEnergyAttached);}
 if(r.mainPlan.mechanic==='CONDITIONAL_MAX_HP'){const target=[a.active,...a.bench].find(c=>c.id===o.action.targetInstanceId),old=[p.active,...p.bench].find(c=>c.id===target.id);assert.equal(target.hp,old.hp+(E.getReferenceEffectRecord(target).facts.basic?50:0));assert.equal(target.damage,old.damage);assert(target.tools.some(c=>c.id===t.frame.sourceId));}
 if(r.mainPlan.mechanic==='SUPPRESS_RULE_ABILITIES'){assert.equal(after.stadium.id,t.frame.sourceId);const abilities=t.port.getPokemonActions('you',p.active.id).filter(o=>o.kind==='ability');assert(abilities.length&&abilities.every(o=>!o.enabled&&o.disabledReasons.includes('ABILITY_SUPPRESSED')));assert(!E.getLegalActions(after,'you').actions.some(a=>a.type==='use_ability'&&a.sourceInstanceId===p.active.id));}
 restore(t);
});
for(const r of F.records.filter(r=>r.category==='supporter'))test(r.officialCardId+' first turn and reused supporter reject',()=>{const t=F.create(r.officialCardId),o=option(t),g=t.port.getSnapshot();g.turnNumber=1;assert(t.port.loadGame(g).ok);reject(t,o.action);g.turnNumber=40;g.players[0].turnLimits.supporterUsed=true;assert(t.port.loadGame(g).ok);reject(t,o.action);});
for(const r of F.records.filter(r=>r.mainPlan.mechanic==='RECOVER_BASIC_ENERGY'))test(r.officialCardId+' recovery rejects foreign, duplicate, excessive, special, absent targets',()=>{
 const t=F.create(r.officialCardId),o=option(t),g=t.port.getSnapshot();
 const special=g.players[0].deck.find(c=>c.kind==='energy'&&c.isSpecial);assert(special);
 for(const ids of [[],[special.id],[g.players[1].active.id],[o.action.selections.cards[0],o.action.selections.cards[0]],[...o.action.selections.cards,g.players[0].active.id]])reject(t,{...o.action,selections:{cards:ids}});
 const p=g.players[0];p.deck.push(...p.discard.splice(0));assert(t.port.loadGame(g).ok);reject(t,o.action);assert(!t.port.getHandOptions('you',t.frame.sourceId).some(o=>o.ok));
});
for(const r of F.records.filter(r=>r.category==='tool'))test(r.officialCardId+' evolved attachment legal without basic-only bonus',()=>{
 const t=F.create(r.officialCardId),g=t.port.getSnapshot(),p=g.players[0],target=p.deck.find(c=>c.kind==='pokemon'&&!E.getReferenceEffectRecord(c).facts.basic);assert(target);p.deck.splice(p.deck.indexOf(target),1);Object.assign(target,{cardId:target.id,damage:0,enteredTurn:0,energyCards:[],energies:[],tools:[]});p.bench.push(target);assert(t.port.loadGame(g).ok);const old=target.hp,o=t.port.getHandOptions('you',t.frame.sourceId).find(o=>o.action.targetInstanceId===target.id);assert(o.ok);assert(t.port.dispatch('you',o.action).ok);assert.equal(t.port.getSnapshot().players[0].bench.find(c=>c.id===target.id).hp,old);restore(t);
});
test('rule suppression preserves non-rule abilities, clears on replacement, both owners agree',()=>{
 const r=F.records.find(r=>r.category==='stadium'),t=F.create(r.officialCardId,1),g=t.port.getSnapshot(),p=g.players[0];
 const i=p.deck.findIndex(c=>E.getReferenceEffectRecord(c).abilities.some(a=>a.plan?.mechanic==='RECON'));assert(i>=0);const mon=p.deck.splice(i,1)[0];Object.assign(mon,{cardId:mon.id,damage:0,enteredTurn:0,energyCards:[],energies:[],tools:[]});p.bench.push(mon);assert(t.port.loadGame(g).ok);
 assert(t.port.dispatch('you',option(t).action).ok);assert(t.port.getPokemonActions('you',mon.id).find(o=>o.kind==='ability').enabled);restore(t);
 assert(t.port.dispatch('you',{type:'end_turn'}).ok);const present=t.port.getSnapshot(),enemy=present.players[1].active,owner=present.players[1];assert(t.port.getPokemonActions('ai',enemy.id).filter(o=>o.kind==='ability').every(o=>!o.enabled));
 const zone=['hand','deck','prizeCards'].find(z=>owner[z].some(c=>E.getReferenceEffectRecord(c).mainPlan?.mechanic==='NIGHT_MINE'));assert(zone);const index=owner[zone].findIndex(c=>E.getReferenceEffectRecord(c).mainPlan?.mechanic==='NIGHT_MINE'),replacement=owner[zone].splice(index,1)[0];owner.hand.push(replacement);assert(t.port.loadGame(present).ok);assert(t.port.dispatch('ai',{type:'play_stadium',cardId:replacement.id}).ok);assert(t.port.getPokemonActions('ai',enemy.id).some(o=>o.kind==='ability'&&o.enabled));assert(t.port.getSnapshot().players[0].discard.some(c=>c.id===t.frame.sourceId));restore(t);
});
for(const r of F.records.filter(r=>r.category==='tool'))test(r.officialCardId+' tool nullification preserves damage and resolves knockout',()=>{
 const t=F.create(r.officialCardId);assert(t.port.dispatch('you',option(t).action).ok);const g=t.port.getSnapshot(),p=g.players[0],o=g.players[1],target=p.active;assert(target.hp>E.getReferenceEffectRecord(target).facts.hp);target.damage=E.getReferenceEffectRecord(target).facts.hp+10;
 const zones=['hand','deck','prizeCards'],z=zones.find(z=>o[z].some(c=>E.getReferenceEffectRecord(c).mainPlan?.mechanic==='JAMMING'));assert(z);const i=o[z].findIndex(c=>E.getReferenceEffectRecord(c).mainPlan?.mechanic==='JAMMING'),stadium=o[z].splice(i,1)[0];o.hand.push(stadium);g.turnPlayer='ai';assert(t.port.loadGame(g).ok);
 const before=t.S.identities(g);assert(t.port.dispatch('ai',{type:'play_stadium',cardId:stadium.id}).ok);const after=t.port.getSnapshot();assert(after.players[0].discard.some(c=>c.id===target.id));assert(after.players[0].discard.some(c=>c.id===t.frame.sourceId));assert.deepEqual(t.S.identities(after),before);restore(t);
});
for(const r of F.records.filter(r=>r.category==='supporter'))test(r.officialCardId+' discard/draw keeps physical identities with a short deck',()=>{
 const t=F.create(r.officialCardId),g=t.port.getSnapshot(),p=g.players[0];p.discard.push(...p.deck.splice(1));assert(t.port.loadGame(g).ok);const before=t.port.getSnapshot(),o=option(t);assert(o);assert(t.port.dispatch('you',o.action).ok);const after=t.port.getSnapshot();assert.equal(after.players[0].hand.length,1);assert.equal(after.players[0].deck.length,0);assert.deepEqual(t.S.identities(before),t.S.identities(after));restore(t);
});
test('official public recovery minimum and partial draw rulings retain raw hashes',()=>{
 const crypto=require('node:crypto');for(const name of ['public-recovery-minimum','partial-discard-draw']){const p=require('../data/effect-extensions/rulings/'+name+'.json');assert.equal(crypto.createHash('sha256').update(p.html).digest('hex'),p.htmlSha256);assert(p.url.startsWith('https://www.pokemon-card.com/rules/faq/search.php?freeword='));const text=p.html.replace(/<[^>]*>/g,'');assert(name==='public-recovery-minimum'?text.includes('1枚以上選ぶ必要があります。'):text.includes('山札を1枚引きます。'));}
});
// Source parsing remains exact even when the official usage-rule footer changed between eras.
test('new families reject wrong category, extra clauses and unsupported evolution shortcut',()=>{
 const {compile}=require('../engine/reference-effect-plans.cjs'),data=require('../data/effect-extensions/compiled.json');for(const r of F.records){assert.equal(compile({records:[{...r,text:r.text+'さらに別の効果を行う。'}]}).records[0].mainPlan,null);assert.equal(compile({records:[{...r,category:'energy'}]}).records[0].mainPlan,null);}assert(data.blocked.some(b=>b.officialCardId==='44506'));assert.equal(F.records.length,7);
});
fs.mkdirSync('test-results',{recursive:true});const categories={};for(const r of F.records)categories[r.category]=(categories[r.category]||0)+1;fs.writeFileSync('test-results/control-009-expansion.json',JSON.stringify({newPatterns:4,newPrints:F.records.length,categories,blocked:require('../data/effect-extensions/compiled.json').blocked,results},null,2));console.log(JSON.stringify(results,null,2));if(results.some(r=>r.status==='FAILED'))process.exitCode=1;
