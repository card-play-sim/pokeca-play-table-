(()=>{
 const clone=x=>JSON.parse(JSON.stringify(x)),id=c=>c?.id||c?.instanceId;
 function inventory(E,manifest){
  const catalog=E.getReferenceEffectCatalog();return Object.entries(catalog.defaultValidationReferences).flatMap(([name,print])=>{
   const r=catalog.records.find(x=>x.officialCardId===print),locations=manifest.decks.flatMap((d,i)=>d.cards.filter(c=>c.name===name).map(c=>({deck:i,count:c.count,identityStatus:c.identityStatus,officialCardId:c.officialCardId})));
   const common={cardName:name,officialCardId:print,category:r.category,source:clone(r.source),officialPageUrl:r.officialPageUrl,locations,copies:locations.reduce((n,x)=>n+x.count,0)};
   return [...r.attacks.map((e,i)=>({...common,effectId:e.effectId,kind:'attack',index:i,effectName:e.name,text:e.text,cost:e.cost,damage:e.damage,plan:e.plan})),...r.abilities.map((e,i)=>({...common,effectId:e.effectId,kind:'ability',index:i,effectName:e.name,text:e.text,plan:e.plan})),...(r.category==='pokemon'?[]:[{...common,effectId:'reference-'+print+'-main-0',kind:'main',index:0,effectName:r.name,text:r.text,plan:r.mainPlan}])];
  });
 }
 function create(E,manifest,row,variant='normal'){
  const m=row.plan?.mechanic;if(!m)return {blocked:'NO_COMPILED_EFFECT_COMMAND'};
  const firstDeck=row.locations[0].deck;let seed=2;
  const result=E.createReferenceValidationMatch(manifest,{firstDeck,rng:()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}});if(!result.ok)throw Error(result.stage);
  let g=result.game;delete g.pendingReferenceChoice;delete g.pendingPrizeSelection;g.turnNumber=40;g.turnPlayer='you';g.history=[];g.effectStates=[];g.referenceRngState=variant==='tails'?682:0;
  const record=c=>E.getReferenceEffectRecord(c),pools=g.players.map(p=>[p.active,...p.bench,...p.hand,...p.deck,...p.prizeCards,...p.discard].filter(Boolean));
  const take=(i,pred,required=true)=>{const index=pools[i].findIndex(typeof pred==='string'?c=>c.name===pred:pred);if(index<0){if(required)throw Error('FIXTURE_RESOURCE_MISSING');return null;}return pools[i].splice(index,1)[0];};
  const mon=c=>Object.assign(c,{cardId:c.id,damage:0,enteredTurn:0,energyCards:[],energies:[],tools:[]});
  const pokemon=(i,pred=()=>true)=>{const choices=pools[i].filter(c=>c.kind==='pokemon'&&pred(c)).sort((a,b)=>record(b).facts.hp-record(a).facts.hp);return choices[0]?mon(take(i,choices[0].name)):null;};
  const source=take(0,row.cardName),handActivation=['EXCITE_DIVE','MEOWTH_ENTRY','SKYLINE','FAIRY_ZONE'].includes(m),fieldSource=row.kind==='attack'||row.kind==='ability'&&!handActivation;
  g.players.forEach(p=>{p.active=null;p.bench=[];p.hand=[];p.deck=[];p.discard=[];p.prizeCards=[];p.prizes=6;p.turnLimits={supporterUsed:false,abilityUses:{}};p.normalEnergyAttached=false;});
  const p=g.players[0],o=g.players[1];
  if(fieldSource)p.active=mon(source);else p.hand.push(source);
  if(!p.active){
   const criterion=m==='ROCKET_ENERGY'?c=>record(c).name.startsWith('ロケット団の'):m==='IGNITION'||m==='ROSA'?c=>record(c).facts.stage===2:m==='FAIRY_ZONE'?c=>record(c).facts.types.includes('超')&&!record(c).abilities.some(a=>a.plan?.mechanic==='FAIRY_ZONE'):()=>true;
   p.active=pokemon(0,criterion);if(!p.active)throw Error('FIXTURE_ACTIVE_MISSING');
  }
  o.active=pokemon(1,m==='COIN_PROTECT'?c=>record(c).facts.basic&&record(c).facts.types.includes('悪')&&!record(c).facts.rulePokemon:()=>true);
  for(let i=0;i<2;i++){const a=pokemon(0);if(a)p.bench.push(a);const b=pokemon(1,c=>!record(c).facts.teraBenchProtection);if(b)o.bench.push(b);}
  function addHand(i,pred){const c=take(i,pred,false);if(c)g.players[i].hand.push(c);return c;}
  function attach(i,target,pred){const c=take(i,pred,false);if(c)target.energyCards.push(c);return c;}
  const basic=c=>c.kind==='energy'&&!c.isSpecial;
  if(row.kind==='attack'){
   const needs=row.cost.filter(t=>t!=='無色'),available=new Set(pools[0].filter(basic).map(c=>c.energyType));
   if(needs.some(t=>!available.has(t)&&!(t==='超'||t==='悪') ))return {blocked:'FIXED_DECK_ENERGY_UNAVAILABLE',requiredTypes:needs,availableTypes:[...available]};
   for(const c of [...pools[0]].filter(c=>c.kind==='energy'))attach(0,p.active,x=>x.id===c.id);
  }
  if(m==='FAIRY_ZONE'){attach(0,p.active,c=>basic(c)&&c.energyType==='超');attach(0,p.active,basic);}
  if(m==='ADRENA_BRAIN'){attach(0,p.active,c=>basic(c)&&c.energyType==='悪');p.active.damage=50;}
  if(m==='BENCH_COUNTER_DAMAGE')o.bench[0].damage=40;
  if(['REVERSAL_DRAW','UNFAIR'].includes(m)){
   const fallen=take(0,c=>c.kind==='pokemon',false);if(fallen)p.discard.push(fallen);
   g.history.push({turnNumber:39,player:'ai',type:'knockout',details:{targetPlayerId:'you',cardId:fallen?.id}});o.prizes=5;
  }
  if(m==='RED_CARD')o.prizes=3;
  if(m==='ROSA'){o.prizes=5;for(let n=0;n<2;n++)p.discard.push(take(0,basic));}
  if(m==='STRETCHER')p.discard.push(take(0,basic));
  if(m==='ENERGY_SWITCH')attach(0,p.active,basic);
  if(['HAMMER','CIRCULATOR','NIGHT_MINE'].includes(m))attach(1,o.active,basic);
  if(m==='COIN_PROTECT')attach(1,o.active,c=>basic(c)&&c.energyType==='悪');
  const extras={};
  if(m==='HERO_CAPE'){
   extras.otherStadium=addHand(1,c=>record(c)?.mainPlan?.mechanic==='JAMMING');extras.replacement=addHand(0,c=>c.kind==='stadium');
  }
  if(['WATCHTOWER','NIGHT_MINE'].includes(m))extras.replacement=addHand(0,c=>c.kind==='stadium');
  if(m==='RUINS')extras.entry=addHand(0,c=>c.kind==='pokemon'&&record(c).facts.basic&&!record(c).facts.types.includes('悪'));
  if(m==='JAMMING'){
   extras.cape=take(1,c=>record(c)?.mainPlan?.mechanic==='HERO_CAPE');o.active.tools.push(extras.cape);o.active.hp=record(o.active).facts.hp+100;o.active.damage=record(o.active).facts.hp+50;
  }
  // Real physical fillers provide discard costs and hand-reset subjects.
  for(let i=0;i<2;i++)for(let n=0;n<2;n++)addHand(i,c=>c.kind==='trainer');
  if(row.category==='supporter')addHand(0,c=>c.cardType==='SUPPORTER');
  if(row.category==='energy')addHand(0,c=>c.kind==='energy');
  g.players.forEach((p,i)=>{p.prizeCards=pools[i].splice(0,p.prizes);p.deck=pools[i];});
  const port=E.createUIPort({getGame:()=>g,setGame:x=>g=x}),loaded=port.loadGame(g);if(!loaded.ok)throw Error(JSON.stringify(loaded));
  return {game:port.getSnapshot(),sourceId:source.id,activeId:p.active.id,opponentId:o.active.id,firstDeck,variant,extras:Object.fromEntries(Object.entries(extras).map(([k,v])=>[k,v?.id])),row};
 }
 function option(E,port,frame){
  const row=frame.row,m=row.plan.mechanic;
  if(['SKYLINE','FAIRY_ZONE'].includes(m))return port.getHandOptions('you',frame.sourceId).find(x=>x.action.type==='bench_basic');
  if(row.kind==='attack')return port.getPokemonActions('you',frame.sourceId).find(x=>x.kind==='attack'&&x.action.attackIndex===row.index);
  if(row.kind==='ability'&&m!=='EXCITE_DIVE')return port.getPokemonActions('you',frame.sourceId).find(x=>x.kind==='ability'&&x.action.abilityId===row.effectId);
  const candidates=port.getHandOptions('you',frame.sourceId);
  return candidates.find(x=>row.kind==='ability'?x.action.type==='use_ability':row.category==='energy'?x.action.type==='attach_energy'&&x.action.target==='active':row.category==='tool'?x.action.type==='attach_tool'&&x.action.targetInstanceId===frame.activeId:['play_item','play_supporter','play_stadium'].includes(x.action.type));
 }
 function identities(g){
  const ids=[];function collect(c){if(!c)return;ids.push(c.id);for(const key of ['energyCards','tools','evolutionCards'])for(const nested of c[key]||[])collect(nested);}
  for(const p of g.players)for(const c of [p.active,...p.bench,...p.hand,...p.deck,...p.discard,...p.prizeCards])collect(c);collect(g.stadium);return ids.sort();
 }
 function verify(E,frame,before,after,action){
  const checks=[],expect=(ok,label)=>{if(!ok)throw Error('EXPECTED_STATE_MISMATCH:'+label);checks.push(label);},m=frame.row.plan.mechanic,p=after.players[0],o=after.players[1],bp=before.players[0],bo=before.players[1],find=(g,ident)=>g.players.flatMap(x=>[x.active,...x.bench,...x.hand,...x.deck,...x.discard,...x.prizeCards]).find(c=>c?.id===ident);
  expect(identities(before).join('|')===identities(after).join('|')&&new Set(identities(after)).size===120,'120 physical identities conserved');
  const chosen=action.selections?.cards||[];
  if(frame.row.kind==='attack'){
   let amount=parseInt(frame.row.damage,10)||0,target=bo.active,bench=false;
   if(m==='COMBO')amount=frame.variant==='tails'?200:300;
   if(m==='MOON_RONDO')amount=20+20*(bp.bench.length+bo.bench.length);
   if(m==='EX_COUNT_DAMAGE')amount=60*[bo.active,...bo.bench].filter(c=>E.getReferenceEffectRecord(c).facts.prizeCount>=2).length;
   if(['BENCH_COUNTER_DAMAGE','BENCH_EX_DAMAGE','ANY_DAMAGE'].includes(m)){target=find(before,action.targetIds[0]);bench=target.id!==bo.active.id;amount=m==='BENCH_COUNTER_DAMAGE'?target.damage*2:m==='BENCH_EX_DAMAGE'?60:100;}
   if(!bench){const attackTypes=E.getReferenceEffectRecord(bp.active).facts.types,def=E.getReferenceEffectRecord(target).facts;let weakness=def.weakness;
    if(attackTypes.includes('超')&&def.types.includes('竜')&&[bp.active,...bp.bench].some(c=>E.getReferenceEffectRecord(c).abilities.some(a=>a.plan?.mechanic==='FAIRY_ZONE')))weakness={types:['超']};
    if(weakness?.types.some(t=>attackTypes.includes(t)))amount*=2;
    if(def.resistance?.types.some(t=>attackTypes.includes(t)))amount=Math.max(0,amount+Number(def.resistance.value.replace('－','-')));
   }
   expect(find(after,target.id)?.damage===(target.damage||0)+amount,'printed damage and weakness/resistance');
   if(m==='CONFUSION')expect(o.active.statusCondition==='CONFUSED','special condition');
   if(m==='NO_NEXT_ATTACK')expect(find(after,frame.sourceId).referenceCannotAttackTurn===before.turnNumber+2,'next-own-turn attack lock');
   if(m==='ITEM_LOCK')expect(after.referenceItemLock.some(x=>x.playerId==='ai'&&x.turnNumber===before.turnNumber+1),'next-opponent-turn item lock');
   if(m==='RETURN_SELF_HAND')expect(p.hand.some(c=>c.id===frame.sourceId),'whole source returned to hand');
   if(m==='HUNT')expect(chosen.every(cid=>p.hand.some(c=>c.id===cid)),'chosen physical search cards in hand');
   if(m==='PHANTOM')expect(o.bench.reduce((n,c)=>n+c.damage,0)-bo.bench.reduce((n,c)=>n+c.damage,0)===60,'six allocated counters');
   if(m==='COIN_PROTECT')expect(Boolean(find(after,frame.sourceId).referenceProtection)===(frame.variant!=='tails'),'coin protection branch');
  }else if(frame.row.kind==='ability'){
   if(['DASH','REVERSAL_DRAW','RUN_AWAY_DRAW'].includes(m))expect(p.hand.length-bp.hand.length===(m==='DASH'?2:3),'exact ability draw count');
   if(m==='RUN_AWAY_DRAW')expect(p.deck.some(c=>c.id===frame.sourceId),'real source returned to deck');
   if(m==='EXCITE_DIVE')expect(p.bench.some(c=>c.id===frame.sourceId&&!c.basic&&c.stage===2),'hand evolution enters through ability without changing stage');
   if(m==='MEOWTH_ENTRY')expect(chosen.length===1&&p.hand.some(c=>c.id===chosen[0]&&c.cardType==='SUPPORTER'),'immediate-entry supporter search');
   if(m==='RECON'){expect(p.hand.some(c=>c.id===chosen[0]),'top-card choice in hand');expect(p.deck.at(-1).id===bp.deck.slice(0,2).find(c=>c.id!==chosen[0]).id,'unchosen inspected card on bottom');}
   if(m==='ADRENA_BRAIN'){expect(find(after,action.selections.source[0]).damage===find(before,action.selections.source[0]).damage-30,'source counters removed');expect(find(after,action.selections.target[0]).damage===find(before,action.selections.target[0]).damage+30,'same counters added to target');}
   if(m==='SKYLINE')expect([p.active,...p.bench].filter(c=>E.getReferenceEffectRecord(c).facts.basic).every(c=>c.retreatCost===0),'all own Basics retreat free');
   if(m==='FAIRY_ZONE')expect(p.bench.some(c=>c.id===frame.sourceId),'continuous weakness modifier source entered');
   if(!['SKYLINE','FAIRY_ZONE'].includes(m))expect(Object.keys(p.turnLimits.abilityUses).some(k=>k.includes(frame.row.effectId)),'ability-use state recorded');
  }else{
   if(['ULTRA_BALL','STRETCHER','CYRANO','HILDA','BROCK','POKEPAD'].includes(m))expect(chosen.every(cid=>p.hand.some(c=>c.id===cid))&&chosen.length>0,'selected real cards enter hand');
   if(m==='ULTRA_BALL')expect(action.selections.discard.length===2&&action.selections.discard.every(cid=>p.discard.some(c=>c.id===cid)),'exact two-card discard cost');
   if(m==='POFFIN')expect(chosen.length>0&&chosen.every(cid=>p.bench.some(c=>c.id===cid&&c.basic&&c.hp<=70)),'eligible Basics benched from deck');
   if(['SWITCH','BOSS'].includes(m)){const owner=m==='SWITCH'?0:1;expect(after.players[owner].active.id===action.selections.bench[0],'selected bench becomes Active');}
   if(m==='REPELLENT')expect(after.pendingReferenceChoice?.kind==='SWITCH'&&after.pendingReferenceChoice.playerId==='ai','defender owns forced switch choice');
   if(m==='ENERGY_SWITCH'){expect(p.active.energyCards.length===bp.active.energyCards.length-1,'source energy removed');expect(find(after,action.selections.attachTo[0]).energyCards.some(c=>c.id===action.selections.energy[0]),'same physical energy moved');expect(p.normalEnergyAttached===bp.normalEnergyAttached,'effect does not consume normal attachment');}
   if(m==='AKAMATSU'){expect(chosen.length===2&&p.hand.some(c=>c.id===action.selections.toHand[0]),'one chosen type in hand');expect(p.active.energyCards.some(c=>chosen.includes(c.id)&&c.id!==action.selections.toHand[0]),'remaining different type attached');}
   if(m==='LILLIE')expect(p.hand.length===8,'eight cards at six prizes');
   if(m==='JUDGE')expect(p.hand.length===4&&o.hand.length===4,'both hands reset to four');
   if(m==='RED_CARD')expect(o.hand.length===3,'opponent hand reset to three');
   if(m==='UNFAIR')expect(p.hand.length===5&&o.hand.length===2,'conditional unequal hand reset');
   if(m==='ROSA')expect(action.selections.cards.length===2&&action.selections.cards.every(cid=>find(after,action.selections.attachTo[0]).energyCards.some(c=>c.id===cid)),'two discarded basic energies attached to Stage 2');
   if(m==='HAMMER'){const cid=action.selections.energy[0];expect(o.discard.some(c=>c.id===cid)===(frame.variant!=='tails'),'coin controls discard of selected opposing energy');}
   if(frame.row.category==='item'||frame.row.category==='supporter')expect(p.discard.some(c=>c.id===frame.sourceId),'trainer consumed once into discard');
   if(frame.row.category==='supporter')expect(p.turnLimits.supporterUsed,'supporter turn limit');
   if(frame.row.category==='stadium')expect(after.stadium?.id===frame.sourceId,'physical stadium on shared field');
   if(m==='HERO_CAPE')expect(p.active.hp===E.getReferenceEffectRecord(p.active).facts.hp+100,'tool adds printed 100 HP');
   if(m==='CIRCULATOR')expect(p.active.tools.some(c=>c.id===frame.sourceId),'reaction tool attached');
   if(frame.row.category==='energy'){
    expect(p.active.energyCards.some(c=>c.id===frame.sourceId)&&p.normalEnergyAttached,'real energy attached once');
    expect(p.active.energies.length===(m==='ROCKET_ENERGY'?2:m==='IGNITION'?3:1),'source-backed energy supply units');
   }
   if(m==='JAMMING')expect(o.discard.some(c=>c.id===frame.opponentId)&&o.discard.some(c=>c.id===frame.extras.cape),'tool suppression lowers HP and resolves knockout stack');
  }
  return checks;
 }
 return {inventory,create,option,identities,verify};
})()
