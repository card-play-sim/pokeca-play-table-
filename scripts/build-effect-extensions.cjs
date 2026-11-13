'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path'),{compile,norm,mainText}=require('../engine/reference-effect-plans.cjs');
const input=process.argv[2]&&!process.argv[2].startsWith('--')?process.argv[2]:'data/effect-extensions/intake.json';
const output=process.argv[3]&&!process.argv[3].startsWith('--')?process.argv[3]:'data/effect-extensions/compiled.json';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const plain=s=>s.replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').trim();
function build(intake,read=p=>JSON.parse(fs.readFileSync(p,'utf8'))){
 const records=[],blocked=[...(intake.blocked||[])],seen=new Set(),base=new Set(JSON.parse(fs.readFileSync('data/reference-effects/catalog.json')).records.map(r=>r.officialCardId));
 for(const row of intake.records||[]){
  const ident=String(row.officialCardId||'');
  try{
   if(!/^\d{4,8}$/.test(ident)||seen.has(ident)||base.has(ident))throw Error('DUPLICATE_OR_INVALID_PRINT');seen.add(ident);
   const url='https://www.pokemon-card.com/card-search/details.php/card/'+ident;
   if(row.officialPageUrl!==url||!['item','supporter','tool','stadium'].includes(row.category)||row.deckPrintAdopted!==false)throw Error('INVALID_REFERENCE_BOUNDARY');
   if(!row.source?.path?.startsWith('data/effect-extensions/evidence/')||row.source.path.includes('..'))throw Error('INVALID_EVIDENCE_PATH');
   const proof=read(row.source.path),body=proof.html;if(proof.url!==url||hash(body)!==proof.htmlSha256||proof.htmlSha256!==row.source.sha256)throw Error('HTML_HASH_MISMATCH');
   if(!body.includes('<meta property="og:url" content="'+url+'"'))throw Error('CANONICAL_PRINT_MISMATCH');
   const name=plain(body.match(/<h1[^>]*>(.*?)<\/h1>/s)?.[1]||'');if(!name||row.name!==name||row.deckName!==name)throw Error('PRINT_NAME_MISMATCH');
   const section=body.match(/<h2[^>]*>(グッズ|サポート|スタジアム|ポケモンのどうぐ)<\/h2>((?:\s*<p[^>]*>.*?<\/p>)+)/s),categories={'グッズ':'item','サポート':'supporter','スタジアム':'stadium','ポケモンのどうぐ':'tool'};
   const paragraphs=section?[...section[2].matchAll(/<p[^>]*>(.*?)<\/p>/gs)].map(m=>m[1]):[];
   const usage={item:'グッズは、自分の番に何枚でも使える。',supporter:'サポートは、自分の番に1枚しか使えない。',tool:'ポケモンのどうぐは、自分の番に何枚でも、自分のポケモンにつけられる。ポケモン1匹につき1枚だけつけられ、つけたままにする。',stadium:'スタジアムは、自分の番に1枚、バトル場の横に出せる。別のスタジアムが場に出たなら、このカードをトラッシュする。同じ名前のスタジアムは場に出せない。'};
   if(paragraphs.length!==2||plain(paragraphs[1])!==usage[row.category])throw Error('UNSUPPORTED_EFFECT_PARAGRAPHS');
   if(!section||categories[section[1]]!==row.category||/<span/.test(paragraphs[0])||plain(paragraphs[0])!==row.text||hash(row.text)!==row.source.textSha256)throw Error('OFFICIAL_TEXT_MISMATCH');
   if(!/^https:\/\/www\.pokemon-card\.com\/assets\/images\/card_images\/large\//.test(row.imageSourceUrl)||!body.includes(row.imageSourceUrl.replace('https://www.pokemon-card.com','')))throw Error('IMAGE_REFERENCE_MISMATCH');
   if(mainText(row.text)!==norm(row.text))throw Error('EMBEDDED_USAGE_RULE_NOT_SUPPORTED');
   const clean={...row,attacks:[],abilities:[],facts:{prizeCount:1,rulePokemon:false,teraBenchProtection:false},rulesText:[],set:'OFFICIAL_PAGE_REFERENCE',cardNumber:''};
   const record=compile({records:[clean]}).records[0];if(!record.mainPlan){blocked.push({officialCardId:ident,name,category:row.category,status:'BLOCKED',reason:'UNSUPPORTED_EFFECT_PATTERN',text:row.text,source:row.source});continue;}
   records.push(record);
  }catch(e){blocked.push({officialCardId:ident,status:'BLOCKED',reason:e.message});}
 }
 return {schemaVersion:1,scope:'SUPPLEMENTAL_OFFICIAL_REFERENCES_NOT_DECK_ADOPTION',records,blocked};
}
if(require.main===module){const result=build(JSON.parse(fs.readFileSync(input))),text=JSON.stringify(result,null,2)+'\n';if(fs.existsSync(output)){const indexed=new Map(result.records.map(r=>[r.officialCardId,r]));for(const prior of JSON.parse(fs.readFileSync(output)).records){const current=indexed.get(prior.officialCardId);if(!current||JSON.stringify(current)!==JSON.stringify(prior))throw Error('EXTENSION_IMMUTABLE_SOURCE_CONFLICT');}}if(process.argv.includes('--check')){if(fs.readFileSync(output,'utf8')!==text)throw Error('EXTENSION_DATA_STALE');}else{fs.mkdirSync(path.dirname(output),{recursive:true});const tmp=output+'.tmp';fs.writeFileSync(tmp,text);fs.renameSync(tmp,output);}console.log(JSON.stringify({accepted:result.records.length,blocked:result.blocked.length,output}));}
module.exports={build};
