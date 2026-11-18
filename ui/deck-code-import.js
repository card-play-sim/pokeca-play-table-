/* Official deck recipe text parser: no identity inference. */
(function(root){'use strict';
const groups={'ポケモン':'pokemon','グッズ':'goods','ポケモンのどうぐ':'tool','サポート':'support','スタジアム':'stadium','エネルギー':'energy'};
const validCode=x=>/^[A-Za-z0-9]{6}-[A-Za-z0-9]{6}-[A-Za-z0-9]{6}$/.test(x);
function parse(text,code){
 if(!validCode(code))throw Error('デッキコード形式が不正です');
 if(typeof text!=='string'||text.length>1000000)throw Error('レシピ文字列が不正です');
 const lines=text.replace(/\\r/g,'').split('\\n').map(x=>x.trim()).filter(Boolean);
 const rows=[],declared={};let group='',pending=null,pack=null,number=null;
 const flush=count=>{
  if(!pending||!Number.isInteger(count)||count<1||count>60)throw Error('カード枚数が不正です');
  rows.push({name:pending,category:group,pack,number,count});
  pending=null;pack=null;number=null;
 };
 for(const line of lines){
  const header=line.match(/^(ポケモンのどうぐ|ポケモン|グッズ|サポート|スタジアム|エネルギー)\\s*[（(](\\d+)[)）]/);
  if(header){if(pending)throw Error('公式レシピのカード枚数が欠落しています');group=groups[header[1]];declared[group]=Number(header[2]);continue}
  if(!group||/^(削除|調整用カード|すべてを|選択されたカード|デッキ登録|レギュレーションチェック|リスト表示|画像表示|現在のデッキ内)/.test(line)||/^[-─]+$/.test(line))continue;
  if(pending){const quantity=line.match(/^[|｜]\\s*(\\d+)\\s*(?:枚)?(?:\\s*[|｜].*)?$/)||line.match(/^(\\d+)\\s*枚?$/);if(quantity){flush(Number(quantity[1]));continue}}
  const compact=line.match(/^(.+?)\\s*[|｜]\\s*(\\d+)\\s*(?:枚)?$/);
  if(compact&&!line.startsWith('[Input]')){if(pending)throw Error('公式レシピのカード枚数が欠落しています');pending=compact[1].trim();flush(Number(compact[2]));continue}
  const nameLine=line.match(/^(?:\\[Input\\]\\s*)?[|｜]\\s*(.+?)(?:\\s*[|｜]\\s*(\\d+)\\s*(?:枚)?\\s*)?$/);
  if(nameLine&&nameLine[1]!=='削除'){
   if(pending)throw Error('公式レシピのカード枚数が欠落しています');
   pending=nameLine[1].trim();if(nameLine[2])flush(Number(nameLine[2]));continue;
  }
  if(pending){
   const countLine=line.match(/^[|｜]\\s*(\\d+)\\s*(?:枚)?(?:\\s*[|｜].*)?$/)||line.match(/^(\\d+)\\s*枚?$/);
   if(countLine){flush(Number(countLine[1]));continue}
   if(!pack&&/^[A-Za-z][A-Za-z0-9-]{0,12}$/.test(line)){pack=line;continue}
   if(!number&&/^\\d{1,4}\\s*\\/\\s*(?:\\d{1,4}|[A-Za-z]-P)$/.test(line)){number=line;continue}
  }
 }
 if(pending)throw Error('公式レシピのカード枚数が欠落しています');
 const total=rows.reduce((a,r)=>a+r.count,0);
 if(total!==60)throw Error('60枚の公式レシピを解析できませんでした（解析 '+total+'枚）。不完全な情報は保存しません');
 for(const [category,count] of Object.entries(declared)){
  if(rows.filter(r=>r.category===category).reduce((n,r)=>n+r.count,0)!==count)throw Error('公式レシピの分類別枚数が不一致: '+category);
 }
 return {schemaVersion:1,source:'official-recipe-text',deckCode:code,total,cards:rows,identityStatus:'UNVERIFIED',playable:false};
}
function reconcile(deck,officialRecords,imageRegistry){
 if(!deck||deck.total!==60||!Array.isArray(deck.cards))throw Error('60枚レシピが必要です');
 const records=Array.isArray(officialRecords)?officialRecords:Object.values(officialRecords||{});
 const images=imageRegistry?.imageByOfficialCardId||imageRegistry||{};
 const output=deck.cards.map(row=>{
  const candidates=records.filter(r=>r&&r.name===row.name&&(!row.pack||r.pack===row.pack||r.expansion===row.pack)&&(!row.number||r.number===row.number||r.cardNumber===row.number));
  if(candidates.length!==1)return {...row,identityStatus:'BLOCKED',reason:candidates.length?'AMBIGUOUS_PRINT':'OFFICIAL_PRINT_NOT_FOUND'};
  const record=candidates[0],id=String(record.officialCardId||'');
  if(!/^\\d+$/.test(id))return {...row,identityStatus:'BLOCKED',reason:'OFFICIAL_ID_MISSING'};
  const image=images[id];
  if(!image||image.officialCardId!=null&&String(image.officialCardId)!==id||image.name&&image.name!==row.name||!(image.imageSourceUrl||image.sourceUrl))
   return {...row,officialCardId:id,identityStatus:'BLOCKED',reason:'IMAGE_MISSING_OR_CONFLICT'};
  if(record.effectStatus!=='verified'||record.engineReadable!==true)
   return {...row,officialCardId:id,imageUrl:image.imageSourceUrl||image.sourceUrl,identityStatus:'BLOCKED',reason:'ENGINE_EFFECT_UNVERIFIED'};
  return {...row,officialCardId:id,imageUrl:image.imageSourceUrl||image.sourceUrl,identityStatus:'CONFIRMED'};
 });
 const blocked=output.filter(r=>r.identityStatus!=='CONFIRMED');
 return {...deck,cards:output,identityStatus:blocked.length?'BLOCKED':'CONFIRMED',playable:blocked.length===0,blockedCount:blocked.length};
}
root.PokecaDeckCodeImport=Object.freeze({validCode,parse,reconcile});
})(typeof window!=='undefined'?window:globalThis);
