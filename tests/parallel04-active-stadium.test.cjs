'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {compile}=require('../engine/reference-effect-plans.cjs');
const groups=[{"ids":["47859","48305","48472","48709"],"name":"ミステリーガーデン","mode":"psychicDraw","text":"おたがいのプレイヤーは、自分の番ごとに1回、手札からエネルギーを1枚トラッシュするなら、自分の手札の枚数が、自分の場の[超]ポケモンの数と同じ枚数になるように、山札を引いてよい。","commands":["DISCARD","DRAW"]},{"ids":["46309","48479","50491"],"name":"おいわいファンファーレ","mode":"healEnd","text":"おたがいのプレイヤーは、自分の番ごとに1回、自分のポケモン全員のHPを、それぞれ「10」回復してよい。その場合、自分の番は終わる。","commands":["HEAL"],"amount":10,"endTurn":true},{"ids":["47106","47393","48707"],"name":"ハッコウシティ","mode":"lightningRecover","text":"おたがいのプレイヤーは、自分の番ごとに1回、自分のトラッシュから「基本[雷]エネルギー」を2枚まで選び、相手に見せて、手札に加えてよい。","commands":["REVEAL","ADD_TO_HAND"],"amount":2},{"ids":["49710","50077"],"name":"ミアレシティ","mode":"basicBench","text":"おたがいのプレイヤーは、自分の番ごとに1回、自分の山札からたねポケモンを1枚選び、ベンチに出してよい。そして山札を切る。この効果を使ったなら、自分の番は終わる。","commands":["SEARCH_DECK","BENCH_FROM_ZONE","SHUFFLE_DECK"],"amount":1,"endTurn":true},{"ids":["47490","48712"],"name":"ロケット団のファクトリー","mode":"rocketDraw","text":"この番に、手札から、名前に「ロケット団」とつくサポートを出して使っていたプレイヤーは、自分の番ごとに1回、自分の山札を2枚引いてよい。","commands":["DRAW"],"amount":2},{"ids":["50164","50212"],"name":"プリズムタワー","mode":"discardDraw","text":"おたがいのプレイヤーは、自分の番ごとに1回、自分の手札を2枚トラッシュするなら、自分の山札を1枚引いてよい。","commands":["DISCARD","DRAW"],"amount":1,"cost":2},{"ids":["47858","50211"],"name":"なみのりビーチ","mode":"waterSwitch","text":"おたがいのプレイヤーは、自分の番ごとに1回、自分のバトル場の[水]ポケモンを、ベンチの[水]ポケモンと入れ替えてよい。","commands":["SWITCH"]},{"ids":["50933"],"name":"ファイトアリーナ","mode":"nonRuleHeal","text":"おたがいのプレイヤーは、自分の番ごとに1回、自分のポケモン(「ルールを持つポケモン」をのぞく)全員のHPを、それぞれ「20」回復してよい。","commands":["HEAL"],"amount":20},{"ids":["47271"],"name":"スパイクタウンジム","mode":"marnieSearch","text":"おたがいのプレイヤーは、自分の番ごとに1回、自分の山札から「マリィのポケモン」を1枚選び、相手に見せて、手札に加えてよい。そして山札を切る。","commands":["SEARCH_DECK","REVEAL","ADD_TO_HAND","SHUFFLE_DECK"],"amount":1},{"ids":["45939"],"name":"夜のアカデミー","mode":"handTop","text":"おたがいのプレイヤーは、自分の番ごとに1回、自分の手札を1枚選び、山札の上にもどしてよい。","commands":["RETURN_TO_DECK"]},{"ids":["45638"],"name":"公民館","mode":"supporterHeal","text":"この番、手札からサポートを出して使っていたプレイヤーは、自分の番ごとに1回、自分のポケモン全員のHPを、それぞれ「10」回復してよい。","commands":["HEAL"],"amount":10}];
function rowFromText(officialCardId,name,text,sha="fixture"){return {officialCardId,name,deckName:name,category:"stadium",text,attacks:[],abilities:[],facts:{},set:"fixture",cardNumber:officialCardId,source:{sha256:sha},imageSourceUrl:"fixture"}}
function readRow(v,officialCardId){const name=v.html.match(/カード詳細（([^）]+)）/)[1],text=v.html.match(/<h2 class="mt20">スタジアム<\/h2>\s*<p>([\s\S]*?)<\/p>/)[1].replace(/<span class="icon-psychic icon"><\/span>/g,"[超]").replace(/<span class="icon-electric icon"><\/span>/g,"[雷]").replace(/<span class="icon-water icon"><\/span>/g,"[水]").replace(/<br\s*\/?>/g,"").replace(/\s+/g,"");if(v.url!==`https://www.pokemon-card.com/card-search/details.php/card/${officialCardId}`)throw Error("url mismatch");return rowFromText(officialCardId,name,text,v.htmlSha256);}
function verify(compile,rt,rows,groups,bundle){
 let n=0;function eq(x,y,label=""){n++;if(x!==y)throw Error(`assert ${n} ${label}: ${JSON.stringify(x)} !== ${JSON.stringify(y)}`);}
 const compiled=compile({records:rows}).records;
 for(const row of compiled){const group=groups.find(g=>g.ids.includes(row.officialCardId));eq(row.mainPlan?.mechanic,"STADIUM_ACTIVE",row.officialCardId);eq(row.mainPlan.mode,group.mode);eq(compile({records:[{...row,text:row.text+"追加条件。"}]}).records[0].mainPlan?.mechanic==="STADIUM_ACTIVE",false);}
 function fixture(key,name,category,facts={},plan=null){return {officialCardId:key,name,deckName:name,category,attacks:[],abilities:[],facts,set:"test",cardNumber:key,source:{sha256:"test"},imageSourceUrl:"test",mainPlan:plan};}
 const mon=(key,name,type,basic=true,rule=false)=>fixture(key,name,"pokemon",{types:[type],hp:120,stage:basic?0:1,basic,prizeCount:rule?2:1,rulePokemon:rule,retreatCost:1});
 const psychic=mon("p","超たね","超"),water=mon("w","水たね","水"),grass=mon("g","草たね","草"),rule=mon("ex","超ex","超",true,true),marnie=mon("m","マリィのテスト","悪"),marnieEvolved=mon("me","マリィの進化","悪",false),evolved=mon("e","進化","超",false);
 const energy=fixture("el","基本雷エネルギー","energy",{},{mechanic:"BASIC_ENERGY",commands:["ATTACH_ENERGY"]}),special=fixture("es","特殊雷エネルギー","energy",{},{mechanic:"ENERGY_TYPED_PASSIVE",energyType:"雷",commands:["ATTACH_ENERGY"]}),otherEnergy=fixture("ep","基本超エネルギー","energy",{},{mechanic:"BASIC_ENERGY",commands:["ATTACH_ENERGY"]});
 const rocket=fixture("rs","ロケット団のテスト","supporter",{},{mechanic:"DRAW_CARDS",commands:["DRAW"],amount:1}),supporter=fixture("ns","通常サポート","supporter",{},{mechanic:"DRAW_CARDS",commands:["DRAW"],amount:1});
 const catalog={records:[...compiled,psychic,water,grass,rule,marnie,marnieEvolved,evolved,energy,special,otherEnergy,rocket,supporter],defaultValidationReferences:{}};
 function card(r,key){return {id:key,cardId:key,name:r.name,species:r.name,kind:r.category==="supporter"?"trainer":r.category,cardType:r.category==="supporter"?"SUPPORTER":r.category==="stadium"?"STADIUM":undefined,hp:r.facts.hp,damage:0,basic:r.facts.basic,stage:r.facts.stage,retreatCost:r.facts.retreatCost,prizeCount:r.facts.prizeCount,energyType:r===energy||r===special?"雷":r===otherEnergy?"超":undefined,isSpecial:r===special,tools:[],energyCards:[],energies:[],attacks:[],abilities:[],enteredTurn:1,validationReference:{officialCardId:r.officialCardId,officialName:r.name,set:r.set,cardNumber:r.cardNumber,sourceSha256:r.source.sha256,imageSourceUrl:r.imageSourceUrl,adopted:false}};}
 // Use actual bundled Core, legality/gateway, selection, AI, effect
 // service, snapshot and transaction modules, substituting only a small
 // controlled print catalog and the candidate runtime under test.
 const markers=[...bundle.matchAll(/"([^"]+)":function\(require,module,exports\)\{/g)],defs=new Map(),cache=new Map();
 for(let i=0;i<markers.length;i++){const a=markers[i],start=a.index+a[0].length,end=i+1<markers.length?markers[i+1].index-2:bundle.indexOf("}},cache=",start);defs.set(a[1],bundle.slice(start,end));}
 function req(name){name=name.replace(/^\.\//,"").replace(/\.js$/,"");if(name==="pokeca_reference_effect_data")return catalog;if(name==="pokeca_effect_extensions")return {catalog:x=>x};if(cache.has(name))return cache.get(name).exports;const source=name==="pokeca_reference_effect_runtime"?rt:defs.get(name);if(!source)throw Error("Missing actual module "+name);const m={exports:{}};cache.set(name,m);new Function("require","module","exports",source)(req,m,m.exports);return m.exports;}
 const X=req("pokeca_reference_effect_runtime"),Core=req("pokeca_engine_core"),Controller=req("pokeca_canonical_controller"),AI=req("pokeca_ai_port"),Snapshot=req("pokeca_session_snapshot"),Effects=req("pokeca_effect_service");
 function game(actor,row){
  const other=actor==="you"?"ai":"you",active=card(row.mainPlan.mode==="waterSwitch"?water:psychic,"a");active.damage=40;
  const bench=[card(water,"b1"),card(psychic,"b2"),card(rule,"b3")];bench[0].damage=10;bench[1].damage=30;bench[2].damage=40;
  const p=Core.createPlayer({id:actor,active,bench,hand:[card(otherEnergy,"h1"),card(special,"h2")],deck:[card(marnie,"d1"),card(grass,"d2"),card(evolved,"d3"),card(marnieEvolved,"d4"),card(otherEnergy,"d5")],discard:[card(energy,"t1"),card(energy,"t2"),card(special,"t3"),card(otherEnergy,"t4"),card(rocket,"t5"),card(supporter,"t6")]});
  const q=Core.createPlayer({id:other,active:card(psychic,"qa"),bench:[card(water,"qb")],hand:[card(otherEnergy,"qh1"),card(energy,"qh2")],deck:[card(grass,"qd1"),card(marnie,"qd2"),card(otherEnergy,"qd3")],discard:[card(energy,"qt1"),card(rocket,"qt2")]});
  const g=Core.createGame({players:[p,q],turnPlayer:actor,turnNumber:3});
  g.referenceEffectValidation={adoptedPrints:0};g.referenceRngState=42;g.stadium=card(row,"stadium");g.stadiumOwner=other;g.stadiumPlayedTurn=2;g.stadiumPlayedBy=other;g.retreatUsed=false;g.mode="practice";
  g.history.push({turnNumber:3,player:actor,type:"supporter_used",details:{cardId:"t5",cardName:rocket.name,referenceOfficialCardId:rocket.officialCardId}});
  g.players[0].turnLimits={supporterUsed:true,abilityUses:{}};g.players[1].turnLimits={supporterUsed:false,abilityUses:{}};
  Effects.refresh(g);return g;
 }
 function clone(g){return JSON.parse(JSON.stringify(g));}
 function ok(g,actor,action){const result=Controller.executeCanonicalAction(g,actor,action);eq(result.ok,true,JSON.stringify(result.errors||[]));return result;}
 function reject(g,actor,action){const before=JSON.stringify(g),result=Controller.executeCanonicalAction(g,actor,action);eq(result.ok,false,"reject");eq(JSON.stringify(g),before,"no mutation");}
 for(const row of compiled)for(const actor of ["you","ai"]){
  let g=game(actor,row),p=g.players[0],q=g.players[1],mode=row.mainPlan.mode;
  const opts=X.stadiumActions(g,actor);eq(opts.length,1,row.name);eq(X.pokemonActions(g,actor,"stadium")[0].action.type,"use_stadium");eq(X.pokemonActions(g,actor,"a").some(o=>o.action.type==="use_stadium"),true);
  const option=opts[0],action=X.completeAction(g,actor,option);
  eq(AI.getLegalActions(g,actor).actions.some(a=>JSON.stringify(a)===JSON.stringify(action)),true,"AI candidate");
  eq(X.plannedCommands(g,actor,action).every(c=>c.referenceOfficialCardId===row.officialCardId),true);
  reject(g,actor,{...action,sourceInstanceId:"fake"});reject(g,q.id,action);
  reject(g,actor,{...action,selections:{bogus:["d1"]}});
  if(option.requests.length){let key=option.requests[0].key;reject(g,actor,{...action,selections:{[key]:["not-existing"]}});reject(g,actor,{...action,selections:{[key]:[option.requests[0].candidates[0]?.id,option.requests[0].candidates[0]?.id]}});}
  if(mode==="psychicDraw"){reject(g,actor,{...action,selections:{discard:["d1"]}});const before=clone(g);g.players[0].hand=[...g.players[0].hand,...g.players[0].deck.splice(0,3)];eq(X.stadiumActions(g,actor).length,0);g=before;p=g.players[0];q=g.players[1];}
  if(mode==="rocketDraw"||mode==="supporterHeal"){const neg=clone(g);neg.history=[];eq(X.stadiumActions(neg,actor).length,0);if(mode==="rocketDraw"){neg.history=[{turnNumber:3,player:actor,type:"supporter_used",details:{cardId:"t6",cardName:supporter.name}}];eq(X.stadiumActions(neg,actor).length,0);}}
  const prev=clone(g),oldHand=p.hand.length,oldDeck=p.deck.length;
  const result=ok(g,actor,action);eq(result.identityAudit.ok,true);
  eq(g.history.filter(e=>e.type==="stadium_used"&&e.details.sourceOfficialCardId===row.officialCardId).length,1);
  eq(g.turnPlayer,row.mainPlan.endTurn?q.id:actor);eq(g.turnNumber,row.mainPlan.endTurn?4:3);
  eq(p.turnLimits.abilityUses["stadium:stadium"],true);
  eq(X.stadiumActions(g,actor).length,0);
  reject(g,actor,action);
  if(mode==="psychicDraw"){eq(p.hand.length,3);eq(p.discard.some(c=>c.id===action.selections.discard[0]),true);}
  if(mode==="discardDraw"){eq(p.hand.length,oldHand-1);eq(p.deck.length,oldDeck-1);}
  if(mode==="rocketDraw"){eq(p.hand.length,oldHand+2);eq(p.deck.length,oldDeck-2);}
  if(mode==="healEnd"||mode==="supporterHeal"){eq(p.active.damage,30);eq(p.bench.map(c=>c.damage).join(","),"0,20,30");}
  if(mode==="nonRuleHeal"){eq(p.active.damage,20);eq(p.bench.map(c=>c.damage).join(","),"0,10,40");}
  if(mode==="lightningRecover"){eq(p.hand.length,oldHand+2);eq(p.discard.some(c=>c.id==="t1"||c.id==="t2"),false);eq(p.discard.some(c=>c.id==="t3"),true);}
  if(mode==="basicBench"){eq(p.bench.length,4);eq(p.bench.at(-1).id,action.selections.cards[0]);eq(p.bench.at(-1).entryWindow,-1);eq(p.deck.length,oldDeck-1);}
  if(mode==="marnieSearch"){eq(p.hand.length,oldHand+1);eq(p.hand.at(-1).id,action.selections.cards[0]);eq(p.deck.length,oldDeck-1);}
  if(mode==="waterSwitch"){eq(p.active.id,"b1");eq(p.bench[0].id,"a");}
  if(mode==="handTop"){eq(p.deck[0].id,action.selections.cards[0]);eq(p.hand.length,oldHand-1);}
  eq(q.active.damage,prev.players[1].active.damage);eq(JSON.stringify(q.bench),JSON.stringify(prev.players[1].bench));
  eq(g.history.some(e=>e.details?.command==="SHUFFLE_DECK"),mode==="basicBench"||mode==="marnieSearch");
  const persisted=clone(g);Snapshot.validateGame(persisted);eq(JSON.stringify(persisted),JSON.stringify(g));
  if(!row.mainPlan.endTurn)ok(g,actor,{type:"end_turn"});
  eq(g.turnPlayer,q.id);
  // Each side has an independent limit; the next turn clears the next player's uses.
  if(mode==="rocketDraw"||mode==="supporterHeal")g.history.push({turnNumber:g.turnNumber,player:q.id,type:"supporter_used",details:{cardId:"qt2",cardName:rocket.name}});
  if(mode==="healEnd"||mode==="supporterHeal"||mode==="nonRuleHeal")q.active.damage=20;
  if(mode==="waterSwitch"){q.active=card(water,"qa");}
  const next=X.stadiumActions(g,q.id);if(mode!=="psychicDraw")eq(next.length,1,"other side independent");
  if(next.length)ok(g,q.id,X.completeAction(g,q.id,next[0]));
 }
 // Placement is not activation. Verify supporter history recorded by the
 // actual hand-play path and Rocket condition is based on that turn.
 const rocketRow=compiled.find(r=>r.mainPlan.mode==="rocketDraw");
 let g=game("you",rocketRow),p=g.players[0];
 g.history=[];p.turnLimits.supporterUsed=false;p.hand.push(p.discard.splice(p.discard.findIndex(c=>c.id==="t5"),1)[0]);
 ok(g,"you",{type:"play_supporter",cardId:"t5"});eq(g.history.some(e=>e.type==="supporter_used"&&e.details.cardId==="t5"),true);eq(X.stadiumActions(g,"you").length,1);
 p.hand.push(p.discard.splice(p.discard.findIndex(c=>c.id==="t5"),1)[0]);
 eq(X.stadiumActions(g,"you").length,1,"supporter identity retained after leaving discard");
 let target=compiled.find(r=>r.mainPlan.mode==="handTop");g=game("you",target);p=g.players[0];p.hand.push(g.stadium);g.stadium=null;g.stadiumOwner=null;const priorHand=p.hand.length;ok(g,"you",{type:"play_stadium",cardId:"stadium"});eq(p.hand.length,priorHand-1);eq(g.history.some(e=>e.type==="stadium_used"),false);eq(X.stadiumActions(g,"you").length,1);
 return n;
}
const rows=groups.flatMap(g=>g.ids.map(id=>{const v=JSON.parse(fs.readFileSync('data/effect-extensions/evidence/'+id+'.json','utf8'));assert.equal(crypto.createHash('sha256').update(v.html).digest('hex'),v.htmlSha256);return readRow(v,id);}));
console.log('OWNER04_ACTIVE_STADIUM_PASS',verify(compile,fs.readFileSync('engine/pokeca_reference_effect_runtime.cjs','utf8'),rows,groups,fs.readFileSync('ui/engine.bundle.js','utf8')));
