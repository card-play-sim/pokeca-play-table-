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
 async function update(){
  button.disabled=true;
  try{
   if(!isSecureContext||!navigator.serviceWorker)throw Error('この画面はHTTPSのChromeで開いてください。');
   if(navigator.onLine===false)throw Error('オンラインで更新をお試しください。保存対戦は保持されています。');
   progress.textContent='更新ファイルを確認しています。保存対戦は保持しています。';
   const reg=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});await reg.update();
   const until=Date.now()+90000;
   while(Date.now()<until){
    reg.waiting?.postMessage({type:'ACTIVATE_UPDATE'});
    const active=await info(reg.active);
    if(active&&Number(active.build)>=Number(build)&&active.files?.['./ui/mobile.js?build='+active.build]){
     window.PokecaRecoveryResult={build:active.build,cacheName:active.cacheName,savedDataTouched:false};
     progress.textContent='v'+active.build+'を受信しました。保存した対戦を保持してアプリへ戻ります。';
     location.replace('./?updated='+encodeURIComponent(active.build));return;
    }
    await delay(500);
   }
   throw Error('更新を完了できませんでした。接続を確認して、もう一度お試しください。');
  }catch(error){progress.textContent=error.message+' 保存データを削除する必要はありません。';button.disabled=false;}
 }
 button.onclick=()=>{void update();};void update();
})();
