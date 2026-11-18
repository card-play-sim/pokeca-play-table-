/* Official deck recipe text parser: no identity inference. */
(function(root){'use strict';
const groups={'ポケモン':'pokemon','グッズ':'goods','ポケモンのどうぐ':'tool','サポート':'support','スタジアム':'stadium','エネルギー':'energy'};
const validCode=x=>/^[A-Za-z0-9]{6}-[A-Za-z0-9]{6}-[A-Za-z0-9]{6}$/.test(x);
function parse(text,code){
 if(!validCode(code))throw Error('デッキコード形式が不正です');
 if(typeof text!=='string'||text.length>1000000)throw Error('レシピ文字列が不正です');
 const lines=text.replace(/\r/g,'').split('\n').map(s=>s.trim()).filter(Boolean);
 let group='',rows=[],pending=null,pack='',number='';
 const push=(count)=>{if(!pending||!Number.isInteger(count)||count<1||count>60)throw Error('カード枚数が不正です');rows.push({name:pending,category:group,pack:pack||null,number:number||null,count});pending=null;pack='';number=''};
 for(let i=0;i<lines.length;i++){
  let line=lines[i];
  const head=line.match(/^(ポケモンのどうぐ|ポケモン|グッズ|サポート|スタジアム|エネルギー)\s*[（(](\d+)[)）]/);
  if(head){group=groups[head[1]];pending=null;pack='';number='';continue}
  if(!group||/^(削除|調整用カード|すべてを|選択されたカード|デッキ登録|レギュレーションチェック|リスト表示|画像表示|現在のデッキ内)/.test(line))continue;
  if(/^[-─]+$/.test(line)||/^\[Input\]/.test(line))continue;
  const compact=line.match(/^(.+?)\s*[|｜]\s*(\d+)\s*(?:枚)?\s*(?:[|｜].*)?$/);
  if(compact){pending=compact[1].replace(/^\[Input\]\s*/,'').trim();push(Number(compact[2]));continue}
  const cnt=line.match(/^(\d+)\s*枚?$/);
  if(cnt&&pending){push(Number(cnt[1]));continue}
  if(pending&&/^[A-Za-z][A-Za-z0-9-]{0,12}$/.test(line)){pack=line;continue}
  if(pending&&/^\d{1,4}\s*\/\s*(?:\d{1,4}|[A-Za-z]-P)$/.test(line)){number=line;continue}
  if(line==='|'||line==='削除'||line==='-')continue;
  if(!pending&&line.length<100&&!/^(\d+|\[Input|デッキコード)/.test(line))pending=line.replace(/^\|\s*/,'').trim();
 }
 const total=rows.reduce((a,r)=>a+r.count,0);
 if(total!==60)throw Error('60枚の公式レシピを解析できませんでした（解析 '+total+'枚）。不完全な情報は保存しません');
 return {schemaVersion:1,source:'official-recipe-text',deckCode:code,total,cards:rows,identityStatus:'UNVERIFIED',playable:false};
}
root.PokecaDeckCodeImport=Object.freeze({validCode,parse});
})(typeof window!=='undefined'?window:globalThis);
