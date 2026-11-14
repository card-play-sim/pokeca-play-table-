'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const c={window:{},console,performance,Math,setTimeout};vm.runInNewContext(fs.readFileSync('ui/engine.bundle.js','utf8'),c);const E=c.window.Pokeca;
const intake=JSON.parse(fs.readFileSync('data/effect-extensions/intake.json')),data=JSON.parse(fs.readFileSync('data/effect-extensions/compiled.json')),build=require('../scripts/build-effect-extensions.cjs').build;
const fixed=JSON.parse(fs.readFileSync('data/fixed-test-decks.json')),manifest=require('./fixtures/control-008-extension-manifest.cjs')(fixed),results=[];
function run(name,fn){try{fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAILED',error:String(e),stack:e.stack});}}
function setup(id,coin=0){let n=2;const m=E.createReferenceValidationMatch(manifest,{firstDeck:manifest.decks.findIndex(d=>d.cards.some(c=>c.referenceOfficialCardId===id)),rng:()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;}});assert(m.ok);let g=m.game;delete g.pendingReferenceChoice;g.turnNumber=8;g.turnPlayer='you';g.history=[];g.referenceRngState=coin;
 const p=g.players[0],o=g.players[1],pool=p.hand.concat(p.deck,p.prizeCards),source=pool.find(c=>c.validationReference.officialCardId===id);assert(source);
 // Swap the selected physical card into hand without creating or removing cards.
 if(!p.hand.includes(source)){const zone=p.deck.includes(source)?p.deck:p.prizeCards;zone[zone.indexOf(source)]=p.hand[0];p.hand[0]=source;}
 if(!o.bench.length){const i=o.deck.findIndex(c=>c.kind==='pokemon'&&c.basic);assert(i>=0);o.bench.push({...o.deck.splice(i,1)[0],damage:0,energyCards:[],energies:[],tools:[],enteredTurn:0});}
 p.active.damage=50;p.turnLimits={supporterUsed:false,abilityUses:{}};
 const port=E.createUIPort({getGame:()=>g,setGame:x=>g=x});assert(port.loadGame(g).ok);return {port,sourceId:source.id,get game(){return port.getSnapshot();}};
}
function identities(g){let ids=[];function collect(c){if(!c)return;ids.push(c.id);for(const k of ['energyCards','tools','evolutionCards'])for(const x of c[k]||[])collect(x);}for(const p of g.players)for(const x of [p.active,...p.bench,...p.hand,...p.deck,...p.prizeCards,...p.discard])collect(x);collect(g.stadium);return ids.sort().join('|');}
for(const r of data.records.filter(r=>manifest.decks.some(d=>d.cards.some(c=>c.referenceOfficialCardId===r.officialCardId))).filter(r=>['DRAW_CARDS','HEAL_DAMAGE','COIN_FORCE_SWITCH'].includes(r.mainPlan?.mechanic)))for(const seed of r.mainPlan.mechanic==='COIN_FORCE_SWITCH'?[0,682]:[0])run(r.name+' '+r.officialCardId+' seed '+seed,()=>{
 const t=setup(r.officialCardId,seed),option=t.port.getHandOptions('you',t.sourceId).find(o=>o.ok);assert(option);const before=t.game,legal=E.getLegalActions(before,'you').actions;assert(legal.some(a=>a.cardId===t.sourceId&&a.type===option.action.type));
 const forged=JSON.parse(JSON.stringify(option.action));if(r.mainPlan.mechanic==='HEAL_DAMAGE')forged.selections.cards=[before.players[1].active.id];else if(r.mainPlan.mechanic==='COIN_FORCE_SWITCH')forged.selections.bench=[before.players[0].active.id];else forged.type='play_item';
 const original=JSON.stringify(before);assert.equal(t.port.dispatch('you',forged).ok,false);assert.equal(JSON.stringify(t.game),original,'rejection preserves all state/RNG');
 assert(t.port.dispatch('you',option.action).ok);const after=t.game;assert.equal(identities(before),identities(after));assert(after.players[0].discard.some(c=>c.id===t.sourceId));
 if(r.mainPlan.mechanic==='DRAW_CARDS'){assert.equal(after.players[0].hand.length,before.players[0].hand.length-1+3);assert(after.players[0].turnLimits.supporterUsed);assert.equal(t.port.getHandOptions('you',after.players[0].hand.find(c=>c.cardType==='SUPPORTER')?.id).some(o=>o.ok),false);}
 if(r.mainPlan.mechanic==='HEAL_DAMAGE'){const target=option.action.selections.cards[0],a=[after.players[0].active,...after.players[0].bench].find(c=>c.id===target);assert.equal(a.damage,20);}
 if(r.mainPlan.mechanic==='COIN_FORCE_SWITCH')assert.equal(after.players[1].active.id,seed===0?option.action.selections.bench[0]:before.players[1].active.id);
 const envelope=t.port.getResumeSnapshot();assert(t.port.restoreSession(envelope).ok);assert.equal(JSON.stringify(t.game),JSON.stringify(after));
});
for(const r of data.records.filter(r=>manifest.decks.some(d=>d.cards.some(c=>c.referenceOfficialCardId===r.officialCardId))).filter(r=>['DRAW_CARDS','HEAL_DAMAGE','COIN_FORCE_SWITCH'].includes(r.mainPlan?.mechanic)))run(r.officialCardId+' source-specific use conditions and heal clamping',()=>{
 const t=setup(r.officialCardId),option=t.port.getHandOptions('you',t.sourceId).find(o=>o.ok),g=t.game,m=r.mainPlan.mechanic;
 if(m==='HEAL_DAMAGE'){
  g.players[0].active.damage=10;assert(t.port.loadGame(g).ok);assert(t.port.dispatch('you',option.action).ok);assert.equal(t.game.players[0].active.damage,0);
  const u=setup(r.officialCardId),empty=u.game;for(const mon of [empty.players[0].active,...empty.players[0].bench])mon.damage=0;assert(u.port.loadGame(empty).ok);const before=JSON.stringify(u.game);assert(!u.port.getHandOptions('you',u.sourceId).some(o=>o.ok));assert(!u.port.dispatch('you',option.action).ok);assert.equal(JSON.stringify(u.game),before);
 }else{
  if(m==='DRAW_CARDS')g.turnNumber=1;
  else g.players[1].hand.push(...g.players[1].bench.splice(0));
  assert(t.port.loadGame(g).ok);const before=JSON.stringify(t.game);assert(!t.port.getHandOptions('you',t.sourceId).some(o=>o.ok));assert(!t.port.dispatch('you',option.action).ok);assert.equal(JSON.stringify(t.game),before);
 }
});
run('missing sources, edited originals, duplicate prints and unsupported effects fail closed',()=>{
 const bad=JSON.parse(JSON.stringify(intake));bad.records[0].text+='未確認';assert(build(bad).blocked.some(x=>x.reason==='OFFICIAL_TEXT_MISMATCH'));const forged=JSON.parse(JSON.stringify(intake));forged.records[0].officialCardId='999999';assert(build(forged).blocked.length>data.blocked.length);
 const paragraph=JSON.parse(JSON.stringify(intake.records[0])),proof=JSON.parse(fs.readFileSync(paragraph.source.path));proof.html=proof.html.replace('サポートは、自分の番に1枚しか使えない。','さらに自分の手札をすべてトラッシュする。');proof.htmlSha256=require('node:crypto').createHash('sha256').update(proof.html).digest('hex');paragraph.source.sha256=proof.htmlSha256;assert(build({records:[paragraph]},()=>proof).blocked.some(x=>x.reason==='UNSUPPORTED_EFFECT_PARAGRAPHS'));
 const duplicate={...intake,records:[...intake.records,intake.records[0]]};assert(build(duplicate).blocked.some(x=>x.reason==='DUPLICATE_OR_INVALID_PRINT'));assert(data.blocked.some(x=>x.reason==='UNSUPPORTED_EFFECT_PATTERN'));assert.equal(data.records.some(x=>x.officialCardId==='44506'),false);
 const invalid=JSON.parse(JSON.stringify(manifest));invalid.decks[0].cards.at(-1).referenceOfficialCardId='44506';assert.throws(()=>E.createReferenceValidationMatch(invalid),/REFERENCE_PRINT_BINDING/);
 const huge=JSON.parse(JSON.stringify(manifest));huge.decks[0].cards[0].count=6000000;assert.throws(()=>E.createReferenceValidationMatch(huge),/REFERENCE_DECK_COUNT/);
});
run('existing official intake, checkpoint importer and shared batch pipeline accept supplemental evidence',()=>{
 const {spawnSync}=require('node:child_process'),os=require('node:os'),path=require('node:path'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pokeca-extension-pipeline-'));
 try{const exported=path.join(tmp,'export.json'),ndjson=path.join(tmp,'rows.ndjson'),registry=path.join(tmp,'registry.json'),batch=path.join(tmp,'batch.json');
  const invoke=args=>{const r=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(r.status,0,r.stderr||r.stdout);};
  invoke(['scripts/export-reference-official-effect-evidence.cjs','data/effect-extensions/compiled.json',exported]);fs.writeFileSync(ndjson,JSON.parse(fs.readFileSync(exported)).map(r=>JSON.stringify(r)).join('\n')+'\n');
  invoke(['scripts/import-official-effect-evidence.cjs',ndjson,registry,'--checkpoint']);invoke(['scripts/build-official-effect-codex-batch.cjs',registry,batch]);const result=JSON.parse(fs.readFileSync(batch));const effects=data.records.flatMap(r=>r.category==='pokemon'?[...r.attacks,...r.abilities].filter(e=>e.plan&&e.text):[{plan:r.mainPlan}]);assert.equal(result.counts.verified,effects.length);assert.equal(result.counts.sharedPatterns,new Set(JSON.parse(fs.readFileSync(exported)).map(e=>[e.category,e.effectKind,e.effectText.normalize('NFKC').replace(/\s+/g,' ').trim()].join(':'))).size);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
run('6001 shared compilation operations do not depend on card names or print IDs',()=>{
 const {compile}=require('../engine/reference-effect-plans.cjs');for(let i=0;i<6001;i++){const row=intake.records[i%6];const r=compile({records:[row]}).records[0];assert(r.mainPlan);assert(!E.getReferenceEffectCatalog().defaultValidationReferences[row.name]);}
 assert.equal(E.getReferenceEffectCatalog().records.length,89);assert.equal(E.getReferenceEffectCatalog({includeExtensions:true}).records.length,89+data.records.length);assert.deepEqual(fixed,JSON.parse(fs.readFileSync('data/fixed-test-decks.json')));
});
fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/control-008-extensions.json',JSON.stringify({scope:'outside-fixed-deck-supplemental-official-references',actualAdditionalPrints:data.records.length,sharedCompilationWorkload:6001,notClaiming6001OfficialCards:true,results},null,2)+'\n');console.log(JSON.stringify(results,null,2));if(results.some(r=>r.status==='FAILED'))process.exitCode=1;
