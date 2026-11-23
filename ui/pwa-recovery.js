/* Network recovery entry for cached clients; never clears or rewrites match storage. */
(()=>{
 'use strict';
 const build=document.querySelector('meta[name="pokeca-build"]').content,progress=document.getElementById('update-progress'),button=document.getElementById('update-retry');
 const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 function info(worker){return new Promise(resolve=>{
  if(!worker)return resolve(null);
  const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();resolve(null);},1500);
  channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data);};
  try{worker.postMessage({type:'RELEASE_INFO'},[channel.port2]);}catch(error){clearTimeout(timer);resolve(null);}
 });}
 // Different complete releases can share the same visible build number. Fetch
 // the generated SW over the network; never accept an older cached release
 // merely because both say v258 (or v256).
 async function desiredRelease(){
  const response=await fetch('./sw.js?recovery-check='+Date.now(),{cache:'no-store'});
  if(!response.ok)throw Error('最新の公開版を取得できませんでした。');
  const source=await response.text();
  const version=source.match(/^const BUILD="(\d+)";$/m)?.[1];
  const name=source.match(/^const CACHE='(pokeca-first-playable-v\d+-[a-f0-9]{16})';$/m)?.[1];
  if(!version||!name||Number(version)<Number(build)||!name.startsWith('pokeca-first-playable-v'+version+'-'))
   throw Error('公開版の識別情報を確認できませんでした。');
  return {build:version,cacheName:name};
 }
 async function update(){
  button.disabled=true;
  try{
   if(!isSecureContext||!navigator.serviceWorker)throw Error('この画面はHTTPSのChromeで開いてください。');
   if(navigator.onLine===false)throw Error('オフラインです。保存データは保持されています。');
   progress.textContent='最新リリースの配信内容を確認しています。保存データは保持します。';
   const target=await desiredRelease();
   const reg=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
   // Verify the *actual* activated cache identity, not only BUILD or UI text.
   // An old v258 worker with missing basic-energy data must not pass.
   await reg.update();
   const until=Date.now()+90000;
   while(Date.now()<until){
    reg.waiting?.postMessage({type:'ACTIVATE_UPDATE'});
    const active=await info(reg.active);
    if(active?.build===target.build&&active.cacheName===target.cacheName&&
       active.files?.['./data/effect-extensions/compiled.json']&&
       active.files?.['./ui/saved-decks.js?build='+target.build]){
     window.PokecaRecoveryResult={build:target.build,cacheName:active.cacheName,savedDataTouched:false,releaseVerified:true};
     progress.textContent='最新版 v'+target.build+'を確認しました。保存データを保持してアプリへ戻ります。';
     location.replace('./?updated='+encodeURIComponent(target.build)+'&release='+encodeURIComponent(target.cacheName)+'#battle');return;
    }
    await delay(500);
   }
   throw Error('更新を完了できませんでした。接続を確認して、もう一度お試しください。');
  }catch(error){progress.textContent=error.message+' 保存データを削除する必要はありません。';button.disabled=false;}
 }
 button.onclick=()=>{void update();};void update();
})();
