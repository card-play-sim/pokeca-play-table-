'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {compile}=require('../engine/reference-effect-plans.cjs');
function verify(compile,source,bundle,saved,hash){
 let n=0;const eq=(a,b)=>{n++;assert.equal(a,b);};
 const v=JSON.parse(saved);hash(v);
 eq(v.url,'https://www.pokemon-card.com/card-search/details.php/card/46040');
 const text=v.html.match(/<h2 class="mt20">スタジアム<\/h2>\s*<p>([\s\S]*?)<\/p>/)[1].replace(/\s+/g,'');
 const row={officialCardId:'46040',name:'偉大な大樹',deckName:'偉大な大樹',category:'stadium',text,attacks:[],abilities:[],facts:{},set:'test',cardNumber:'46040',source:{sha256:v.htmlSha256},imageSourceUrl:'test'};
 const stadium=compile({records:[row]}).records[0];eq(stadium.mainPlan?.mode,'greatTree');
 eq(compile({records:[{...row,text:text+'追加条件。'}]}).records[0].mainPlan?.mode==='greatTree',false);
 const mon=(officialCardId,name,stage=0,abilities=[])=>({officialCardId,name,deckName:name,category:'pokemon',attacks:[],abilities,facts:{types:['草'],hp:100+50*stage,stage,basic:stage===0,prizeCount:1,rulePokemon:false,retreatCost:1},set:'test',cardNumber:officialCardId,source:{sha256:'test'},imageSourceUrl:'test'});
 const basic=mon('b','たね'),other=mon('o','別たね'),one=mon('s1','一進化',1),two=mon('s2','二進化',2),wrong=mon('w','別進化',1),soul=mon('soul','イルカマンex',1,[{name:'マイティソウル'}]);
 const catalog={records:[stadium,basic,other,one,two,wrong,soul],defaultValidationReferences:{}};
 const card=(r,id,from)=>({id,name:r.name,species:r.name,kind:r.category,cardType:r.category==='stadium'?'STADIUM':undefined,hp:r.facts.hp,damage:0,basic:r.facts.basic,stage:r.facts.stage,evolvesFrom:from,retreatCost:1,prizeCount:1,energyCards:[],tools:[],energies:[],attacks:[],abilities:[],enteredTurn:1,validationReference:{officialCardId:r.officialCardId,officialName:r.name,set:r.set,cardNumber:r.cardNumber,sourceSha256:r.source.sha256,imageSourceUrl:r.imageSourceUrl,adopted:false}});
 const markers=[...bundle.matchAll(/"([^"]+)":function\(require,module,exports\)\{/g)],defs=new Map(),cache=new Map();
 for(let i=0;i<markers.length;i++){const a=markers[i],start=a.index+a[0].length,end=i+1<markers.length?markers[i+1].index-2:bundle.indexOf("}},cache=",start);defs.set(a[1],bundle.slice(start,end));}
 function req(name){name=name.replace(/^\.\//,'').replace(/\.js$/,'');if(name==='pokeca_reference_effect_data')return catalog;if(name==='pokeca_effect_extensions')return {catalog:x=>x};if(cache.has(name))return cache.get(name).exports;const code=name==='pokeca_reference_effect_runtime'?source:defs.get(name);if(!code)throw Error(name);const m={exports:{}};cache.set(name,m);new Function('require','module','exports',code)(req,m,m.exports);return m.exports;}
 const X=req('pokeca_reference_effect_runtime'),Core=req('pokeca_engine_core'),Effects=req('pokeca_effect_service');
 function game(actor='you'){
 const q=actor==='you'?'ai':'you',a=card(basic,'a');a.damage=30;a.statusCondition='POISONED';a.referenceEvolutionWindow=1;
 const p=Core.createPlayer({id:actor,active:a,bench:[card(other,'b')],hand:[],deck:[card(one,'one','たね'),card(two,'two','一進化'),card(wrong,'wrong','別たね'),card(soul,'soul','たね')]});
 const opp=Core.createPlayer({id:q,active:card(basic,'qa'),bench:[],hand:[],deck:[card(one,'qone','たね')]});
 const g=Core.createGame({players:[p,opp],turnPlayer:actor,turnNumber:3});g.referenceEffectValidation={adoptedPrints:0};g.referenceRngState=3;g.stadium=card(stadium,'stadium');g.stadiumOwner=q;g.stadiumPlayedTurn=2;g.stadiumPlayedBy=q;g.mode='practice';Effects.refresh(g);return g;
 }
 function action(g,actor){return X.completeAction(g,actor,X.stadiumActions(g,actor)[0]);}
 function reject(g,actor,a){const before=JSON.stringify(g);eq(X.preflight(g,actor,a).errors.length>0,true);eq(JSON.stringify(g),before);}
 for(const actor of ['you','ai']){
 let g=game(actor),p=g.players[0],q=g.players[1],a=action(g,actor);
 eq(a.selections.treeTarget[0],'a');eq(a.selections.treeFirst0[0],'one');eq(a.selections.treeSecond0_0[0],'two');
 const bad=JSON.parse(JSON.stringify(a));bad.selections.treeFirst0=['soul'];reject(g,actor,bad);
 const bad2=JSON.parse(JSON.stringify(a));bad2.selections.treeFirst0=['wrong'];reject(g,actor,bad2);
 const bad3=JSON.parse(JSON.stringify(a));bad3.selections.treeTarget=['b'];reject(g,actor,bad3);
 reject(g,q.id,a);
 X.execute(g,actor,a);
 eq(p.active.stage,2);eq(p.active.id,'a');eq(p.active.damage,30);eq(p.active.hp,200);eq(p.active.statusCondition,null);eq(p.active.referenceEvolutionWindow,undefined);eq(p.active.validationBase.name,'たね');
 eq(p.active.evolutionCards.map(c=>c.id).join(','),'one,two');eq(p.hand.length,0);eq(p.deck.length,2);eq(q.active.stage,0);eq(g.history.filter(e=>e.details.command==='SHUFFLE_DECK').length,1);eq(X.stadiumActions(g,actor).length,0);X.validateGame(g);
 g=game(actor);p=g.players[0];a=action(g,actor);a.selections.treeSecond0_0=[];X.execute(g,actor,a);eq(p.active.stage,1);eq(p.deck.some(c=>c.id==='two'),true);
 g=game(actor);g.turnNumber=2;eq(X.stadiumActions(g,actor).length,0);
 g=game(actor);g.players[0].active.enteredTurn=3;g.players[0].bench[0].enteredTurn=3;eq(X.stadiumActions(g,actor).length,0);
 }
 return n;
}
module.exports={verify};
if(require.main===module)console.log('OWNER04_GREAT_TREE_PASS',verify(compile,fs.readFileSync('engine/pokeca_reference_effect_runtime.cjs','utf8'),fs.readFileSync('ui/engine.bundle.js','utf8'),fs.readFileSync('data/effect-extensions/evidence/46040.json','utf8'),v=>assert.equal(crypto.createHash('sha256').update(v.html).digest('hex'),v.htmlSha256)));
