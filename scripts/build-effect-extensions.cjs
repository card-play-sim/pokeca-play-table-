'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path'),{compile,norm,mainText,ijMechanics}=require('../engine/reference-effect-plans.cjs');
const input=process.argv[2]&&!process.argv[2].startsWith('--')?process.argv[2]:'data/effect-extensions/intake.json';
const output=process.argv[3]&&!process.argv[3].startsWith('--')?process.argv[3]:'data/effect-extensions/compiled.json';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const plain=s=>s.replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').trim();
const sharedAttackMechanics=new Set(['ATTACK_ACCELERATE_BASIC_ENERGY','CONDITIONAL_ATTACK_BONUS','SCALED_ATTACK_DAMAGE',
 'ATTACK_RESET_HAND','ATTACK_DISCARD_OWN_DECK_TOP','ATTACK_DISABLE_DEFENDER','ATTACK_WEAKEN_DEFENDER']);
for(const mechanic of ['ATTACK_DISCARD_FIELD_BASIC','ATTACK_OPTIONAL_DRAW_TO_LIMIT','ATTACK_DISCARD_DEFENDER_ENERGY',
 'ATTACK_HEAL_OWN_TARGET','ATTACK_SPLASH_OWN_BENCH','ATTACK_DISABLE_SELECTED_MOVE','CONTEXT_ATTACK_BONUS',
 'ATTACK_PRIZE_BONUS_RECOIL','ATTACK_BLIND_HAND_CHOICE','ATTACK_SPREAD_DAMAGE'])sharedAttackMechanics.add(mechanic);
function requiresHijAttackScope(plan){
 return sharedAttackMechanics.has(plan.mechanic)||plan.sharedWording===true||
   plan.mechanic==='ANY_DAMAGE'&&Object.hasOwn(plan,'amount')||
   plan.mechanic==='FIXED_COIN_HITS'&&Object.hasOwn(plan,'base');
}
function build(intake,read=p=>JSON.parse(fs.readFileSync(p,'utf8'))){
 const records=[],blocked=[...(intake.blocked||[])],seen=new Set(),base=new Set(JSON.parse(fs.readFileSync('data/reference-effects/catalog.json')).records.map(r=>r.officialCardId));
 const hijIds=new Set(JSON.parse(fs.readFileSync('data/deck-building/catalog.json')).records
  .filter(row=>row.legality==='printed-hij'&&['H','I','J'].includes(row.regulationMark))
  .map(row=>row.officialCardId));
 for(const row of intake.records||[]){
  const ident=String(row.officialCardId||'');
  try{
   if(!/^[1-9][0-9]{0,7}$/.test(ident)||seen.has(ident)||base.has(ident))throw Error('DUPLICATE_OR_INVALID_PRINT');seen.add(ident);
   const url='https://www.pokemon-card.com/card-search/details.php/card/'+ident;
   if(row.officialPageUrl!==url||!['item','supporter','tool','stadium','pokemon','energy'].includes(row.category)||row.deckPrintAdopted!==false)throw Error('INVALID_REFERENCE_BOUNDARY');
   if(!row.source?.path?.startsWith('data/effect-extensions/evidence/')||row.source.path.includes('..'))throw Error('INVALID_EVIDENCE_PATH');
   const proof=read(row.source.path),body=proof.html;if(proof.url!==url||hash(body)!==proof.htmlSha256||proof.htmlSha256!==row.source.sha256)throw Error('HTML_HASH_MISMATCH');
   if(!body.includes('<meta property="og:url" content="'+url+'"'))throw Error('CANONICAL_PRINT_MISMATCH');
   const name=plain(body.match(/<h1[^>]*>(.*?)<\/h1>/s)?.[1]||'');if(!name||row.name!==name||row.deckName!==name)throw Error('PRINT_NAME_MISMATCH');
   if(['pokemon','energy'].includes(row.category)){
    const parsed=require('./parse-official-pokemon-energy.cjs').parse(body);
    for(const key of ['category','text','facts','attacks','abilities','rulesText'])if(JSON.stringify(row[key])!==JSON.stringify(parsed[key]))throw Error('PARSED_OFFICIAL_FACT_CONFLICT:'+key);
    if(hash(row.text)!==row.source.textSha256)throw Error('OFFICIAL_TEXT_MISMATCH');
    if(!/^https:\/\/www\.pokemon-card\.com\/assets\/images\/card_images\/large\//.test(row.imageSourceUrl)||!body.includes(row.imageSourceUrl.replace('https://www.pokemon-card.com','')))throw Error('IMAGE_REFERENCE_MISMATCH');
    const record=compile({records:[row]}).records[0],effects=row.category==='pokemon'?[...record.attacks,...record.abilities]:[{plan:record.mainPlan}];
    if(effects.some(e=>!e.plan))throw Error('UNSUPPORTED_POKEMON_OR_ENERGY_EFFECT_PATTERN');
    if(effects.some(e=>['COIN_UNTIL_TAILS_DAMAGE','ACTIVE_TOP_SUPPORTER_SEARCH'].includes(e.plan.mechanic)||requiresHijAttackScope(e.plan))&&!hijIds.has(ident))throw Error('OUTSIDE_HIJ_MECHANIC_SCOPE');
    records.push(record);continue;
   }
   const section=body.match(/<h2[^>]*>(グッズ|サポート|スタジアム|ポケモンのどうぐ)<\/h2>((?:\s*<p[^>]*>.*?<\/p>)+)/s),categories={'グッズ':'item','サポート':'supporter','スタジアム':'stadium','ポケモンのどうぐ':'tool'};
   const paragraphs=section?[...section[2].matchAll(/<p[^>]*>(.*?)<\/p>/gs)].map(m=>m[1]):[];
   if(row.category==='stadium'&&section?.[1]==='スタジアム'&&paragraphs.length===1){
    const tail=body.slice(section.index+section[0].length);
    const combined=tail.match(/^\s*<h2[^>]*>特別なルール<\/h2>\s*<h4>\s*<\/h4>\s*<p>(このカードは1枚だけでは出せず、自分の手札から2種類の「([^」]+)」を組み合わせて、1枚のスタジアムとして場に出す。)<\/p>/);
    if(combined){
     const officialText=require('./parse-official-pokemon-energy.cjs').text(paragraphs[0]);
     assertCombinedStadium(row,officialText,combined[2],hash,body);
     blocked.push({officialCardId:ident,name,category:row.category,status:'BLOCKED',reason:'UNSUPPORTED_COMBINED_STADIUM_PLAY',text:officialText,rulesText:[combined[1]],source:row.source});
     continue;
    }
   }
   const usage={item:'グッズは、自分の番に何枚でも使える。',supporter:'サポートは、自分の番に1枚しか使えない。',tool:'ポケモンのどうぐは、自分の番に何枚でも、自分のポケモンにつけられる。ポケモン1匹につき1枚だけつけられ、つけたままにする。',stadium:'スタジアムは、自分の番に1枚、バトル場の横に出せる。別のスタジアムが場に出たなら、このカードをトラッシュする。同じ名前のスタジアムは場に出せない。'};
   const acceptedUsage=[usage[row.category],...(row.category==='stadium'?['スタジアムは、自分の番に1枚だけ、バトル場の横に出せる。別の名前のスタジアムが場に出たなら、このカードをトラッシュする。']:[])];
   if(paragraphs.length!==2||!acceptedUsage.includes(plain(paragraphs[1])))throw Error('UNSUPPORTED_EFFECT_PARAGRAPHS');
   if(!section||categories[section[1]]!==row.category||(paragraphs[0].includes('<span')?require('./parse-official-pokemon-energy.cjs').text(paragraphs[0]):plain(paragraphs[0]))!==row.text||hash(row.text)!==row.source.textSha256)throw Error('OFFICIAL_TEXT_MISMATCH');
   if(!/^https:\/\/www\.pokemon-card\.com\/assets\/images\/card_images\/large\//.test(row.imageSourceUrl)||!body.includes(row.imageSourceUrl.replace('https://www.pokemon-card.com','')))throw Error('IMAGE_REFERENCE_MISMATCH');
   if(mainText(row.text)!==norm(row.text))throw Error('EMBEDDED_USAGE_RULE_NOT_SUPPORTED');
   const clean={...row,attacks:[],abilities:[],facts:{prizeCount:1,rulePokemon:false,teraBenchProtection:false},rulesText:[],set:'OFFICIAL_PAGE_REFERENCE',cardNumber:''};
   const record=compile({records:[clean]}).records[0];if(!record.mainPlan){blocked.push({officialCardId:ident,name,category:row.category,status:'BLOCKED',reason:'UNSUPPORTED_EFFECT_PATTERN',text:row.text,source:row.source});continue;}
   if((ijMechanics.has(record.mainPlan.mechanic)||['COIN_DRAW_CARDS','HEAL_ACTIVE_DAMAGE','RETURN_HAND_PRIZE_DRAW','RETURN_HAND_COIN_DRAW','DISCARD_ONE_DRAW_OPP_BENCH'].includes(record.mainPlan.mechanic))&&!hijIds.has(ident))throw Error('OUTSIDE_HIJ_MECHANIC_SCOPE');
   records.push(record);
  }catch(e){blocked.push({officialCardId:ident,status:'BLOCKED',reason:e.message});}
 }
 return {schemaVersion:1,scope:'SUPPLEMENTAL_OFFICIAL_REFERENCES_NOT_DECK_ADOPTION',records,blocked};
}
function assertCombinedStadium(row,text,title,hash,body){
 if(row.name!==title||row.text!==text||row.source.textSha256!==hash(text))
  throw Error('COMBINED_STADIUM_OFFICIAL_TEXT_MISMATCH');
 if(!/^https:\/\/www\.pokemon-card\.com\/assets\/images\/card_images\/large\//.test(row.imageSourceUrl)||!body.includes(row.imageSourceUrl.replace('https://www.pokemon-card.com','')))
  throw Error('IMAGE_REFERENCE_MISMATCH');
}
if(require.main===module){const result=build(JSON.parse(fs.readFileSync(input))),text=JSON.stringify(result,null,2)+'\n';if(fs.existsSync(output)){const indexed=new Map(result.records.map(r=>[r.officialCardId,r]));for(const prior of JSON.parse(fs.readFileSync(output)).records){const current=indexed.get(prior.officialCardId);if(!current||JSON.stringify(current)!==JSON.stringify(prior))throw Error('EXTENSION_IMMUTABLE_SOURCE_CONFLICT:'+prior.officialCardId+':'+(!current?'missing':'compiled facts differ')+': recompile evidence and review parser before adoption');}}if(process.argv.includes('--check')){if(fs.readFileSync(output,'utf8')!==text)throw Error('EXTENSION_DATA_STALE');}else{fs.mkdirSync(path.dirname(output),{recursive:true});const tmp=output+'.tmp';fs.writeFileSync(tmp,text);fs.renameSync(tmp,output);}console.log(JSON.stringify({accepted:result.records.length,blocked:result.blocked.length,output}));}
module.exports={build};
