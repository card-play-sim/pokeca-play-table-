/* Save before activating a verified release; installed PWA identity and saves stay intact. */
(()=>{
 'use strict';
 const status=window.PokecaUpdateStatus={htmlBuild:document.querySelector('meta[name="pokeca-build"]')?.content,mobileBuild:window.PokecaMobileBuild,controllerBuild:null,state:'checking'};
 function notice(text){let el=document.getElementById('app-update-status');if(!el){el=document.createElement('p');el.id='app-update-status';el.setAttribute('role','status');document.body.append(el);}el.textContent=text;}
 if(!isSecureContext||!('serviceWorker' in navigator)){status.state='unsupported';return;}
 let refreshing=false,inFlight=null,registrationPromise=null,retryTimer=null,retries=0,userCheck=false,updateFailed=false;
 function controllerInfo(){
  if(!navigator.serviceWorker.controller)return;
  const channel=new MessageChannel();
  channel.port1.onmessage=e=>{
   channel.port1.close();status.controllerBuild=e.data.build;status.releaseFiles=e.data.files;status.cacheName=e.data.cacheName;
   status.manualOpening=window.PokecaMobile?.features?.manualOpening===true;
   status.coherent=status.htmlBuild===status.mobileBuild&&status.mobileBuild===status.controllerBuild&&status.manualOpening;
   if(updateFailed)return;
   status.state=status.coherent?'ready':'mismatch';
   if(!status.coherent)notice('更新を確認中です。保存済みの対戦は保持しています。');
   else if(userCheck){notice('v'+status.mobileBuild+'・手動対戦準備に対応しています。保存済みの対戦は保持しています。');userCheck=false;}
  };
  navigator.serviceWorker.controller.postMessage({type:'RELEASE_INFO'},[channel.port2]);
 }
 async function refresh(){
  if(refreshing)return;refreshing=true;
  try{if(window.PokecaMobile?.prepareForUpdate)await window.PokecaMobile.prepareForUpdate();else if(window.PokecaMobile?.port&&window.PokecaStorage)await PokecaStorage.createIndexedMatchStore(localStorage).save(PokecaMobile.port.getResumeSnapshot());else throw Error('保存準備待ち');location.reload();}
  catch(error){refreshing=false;status.state='save-pending';notice('最新版を受信しました。対戦の保存完了後に更新します。');setTimeout(refresh,3000);}
 }
 function failed(error){
  updateFailed=true;status.state='update-failed';status.error=String(error);
  notice('更新を完了できませんでした。保存対戦はそのままです。オンラインでメニューの「最新版を確認・更新」をお試しください。');
  if(retries<3&&!retryTimer){retries++;retryTimer=setTimeout(()=>{retryTimer=null;void checkForUpdate();},15000);}
 }
 function watch(worker){
  if(!worker?.addEventListener)return;
  let activated=worker.state==='activated';
  const changed=()=>{
   if(worker.state==='activated')activated=true;
   if(worker.state==='redundant'&&!activated)failed('Verified release installation failed');
   else if(worker.state==='installed'){status.state='updating';notice('最新版を受信しました。対戦を保存して更新します。');}
  };
  worker.addEventListener('statechange',changed);
 }
 async function checkForUpdate({userInitiated=false}={}){
  if(userInitiated){retries=0;userCheck=true;notice('最新版を確認しています。保存対戦は保持しています。');}
  if(navigator.onLine===false){status.state='offline';userCheck=false;if(userInitiated)notice('オフラインです。保存対戦は再開できます。更新はオンラインでお試しください。');return {ok:false,state:status.state};}
  if(inFlight)return inFlight;
  inFlight=(async()=>{
   try{const reg=await getRegistration();updateFailed=false;status.error=null;await reg.update();controllerInfo();return {ok:true};}
   catch(error){failed(error);return {ok:false,state:status.state};}
   finally{inFlight=null;}
  })();return inFlight;
 }
 navigator.serviceWorker.addEventListener('controllerchange',()=>{void refresh();});
 function getRegistration(){
  if(!registrationPromise)registrationPromise=navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(reg=>{
   watch(reg.installing);reg.addEventListener?.('updatefound',()=>watch(reg.installing));controllerInfo();return reg;
  }).catch(error=>{registrationPromise=null;throw error;});
  return registrationPromise;
 }
 window.PokecaUpdates={checkForUpdate};
 controllerInfo();void checkForUpdate();
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){void checkForUpdate();controllerInfo();}});
})();
