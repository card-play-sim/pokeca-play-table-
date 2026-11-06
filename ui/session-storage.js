'use strict';
// Separate resume snapshots from human-readable logs. Each match has one atomic storage value.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PokecaStorage=factory();})(typeof window!=='undefined'?window:globalThis,()=>{
 function createMatchStore(storage,{prefix='pokeca.resume.v1.'}={}){
  const read=id=>{const text=storage.getItem(prefix+id);if(!text)throw Error('保存データがありません');const value=JSON.parse(text);if(value.format!=='pokeca-resume'||value.version!==1||value.matchId!==id)throw Error('保存ファイル形式が不正です');return value;};
  return {
   save(envelope){if(envelope?.format!=='pokeca-resume'||envelope.version!==1||!envelope.matchId)throw Error('再開用データではありません');storage.setItem(prefix+envelope.matchId,JSON.stringify(envelope));return {ok:true,matchId:envelope.matchId};},
   read,
   list(){const result=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(!key?.startsWith(prefix))continue;const id=key.slice(prefix.length);try{const e=read(id);result.push({matchId:id,savedAt:e.savedAt,turnNumber:e.game?.turnNumber,status:e.game?.status,valid:true});}catch(error){result.push({matchId:id,valid:false,error:error.message});}}return result.sort((a,b)=>(b.savedAt || '').localeCompare(a.savedAt || ''));},
   remove(id){storage.removeItem(prefix+id);}
  };
 }
 return {createMatchStore};
});
