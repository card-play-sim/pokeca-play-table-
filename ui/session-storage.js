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

 // Large resume snapshots are written to IndexedDB. Legacy localStorage entries
 // remain read-only and are never deleted during migration.
 function createIndexedMatchStore(storage,{prefix='pokeca.resume.v1.'}={}){
  const legacy=createMatchStore(storage,{prefix});
  const dbPromise=new Promise((resolve,reject)=>{
   if(typeof indexedDB==='undefined'){reject(Error('IndexedDBを利用できません'));return;}
   const req=indexedDB.open('pokeca-resume-db',1);
   req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('matches'))db.createObjectStore('matches',{keyPath:'matchId'});};
   req.onsuccess=()=>resolve(req.result);
   req.onerror=()=>reject(req.error||Error('IndexedDBを開けません'));
   req.onblocked=()=>reject(Error('保存DBがほかの画面で使用中です'));
  });
  async function transact(mode,work){
   const db=await dbPromise;
   return new Promise((resolve,reject)=>{
    const tx=db.transaction('matches',mode),os=tx.objectStore('matches');
    let value;
    tx.oncomplete=()=>resolve(value);
    tx.onerror=()=>reject(tx.error||Error('保存処理に失敗しました'));
    tx.onabort=()=>reject(tx.error||Error('保存処理が中断されました'));
    try{const req=work(os);req.onsuccess=()=>{value=req.result;};req.onerror=()=>{tx.abort();};}
    catch(error){tx.abort();reject(error);}
   });
  }
  const validate=(e,id)=>{if(e?.format!=='pokeca-resume'||e.version!==1||e.matchId!==id)throw Error('保存ファイル形式が不正です');return e;};
  return {
   async save(e){validate(e,e?.matchId);await transact('readwrite',os=>os.put(e));return {ok:true,matchId:e.matchId};},
   async read(id){const e=await transact('readonly',os=>os.get(id));if(e)return validate(e,id);return legacy.read(id);},
   async list(){
    const entries=await transact('readonly',os=>os.getAll());
    const result=new Map();
    for(const e of entries){try{validate(e,e.matchId);result.set(e.matchId,{matchId:e.matchId,savedAt:e.savedAt,turnNumber:e.game?.turnNumber,status:e.game?.status,valid:true});}catch(error){result.set(String(e?.matchId),{matchId:String(e?.matchId),valid:false,error:error.message});}}
    for(const e of legacy.list())if(!result.has(e.matchId))result.set(e.matchId,e);
    return [...result.values()].sort((a,b)=>(b.savedAt||'').localeCompare(a.savedAt||''));
   }
  };
 }
 return {createMatchStore,createIndexedMatchStore};
});
