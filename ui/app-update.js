/* Release checks are based on the loaded module and controlling worker, not the label. */
(()=>{
 'use strict';
 const status=window.PokecaUpdateStatus={htmlBuild:document.querySelector('meta[name="pokeca-build"]')?.content,mobileBuild:window.PokecaMobileBuild,controllerBuild:null,state:'checking'};
 function notice(text){let el=document.getElementById('app-update-status');if(!el){el=document.createElement('p');el.id='app-update-status';el.setAttribute('role','status');document.getElementById('app').prepend(el);}el.textContent=text;}
 async function controllerInfo(){
  if(!navigator.serviceWorker.controller)return;
  const channel=new MessageChannel();
  channel.port1.onmessage=e=>{channel.port1.close();status.controllerBuild=e.data.build;status.releaseFiles=e.data.files;status.cacheName=e.data.cacheName;status.state=status.htmlBuild===status.mobileBuild&&status.mobileBuild===status.controllerBuild?'ready':'mismatch';if(status.state==='mismatch')notice('更新を確認中です。対戦データは保持しています。');};
  navigator.serviceWorker.controller.postMessage({type:'RELEASE_INFO'},[channel.port2]);
 }
 if(!isSecureContext||!('serviceWorker' in navigator)){status.state='unsupported';return;}
 let refreshing=false;
 async function refresh(){
  if(refreshing)return;refreshing=true;
  try{if(window.PokecaMobile?.prepareForUpdate)await window.PokecaMobile.prepareForUpdate();else if(window.PokecaMobile?.port&&window.PokecaStorage)await PokecaStorage.createIndexedMatchStore(localStorage).save(PokecaMobile.port.getResumeSnapshot());else throw Error('保存準備待ち');location.reload();}
  catch(error){refreshing=false;status.state='save-pending';notice('最新版を受信しました。対戦の保存完了後に更新します。');setTimeout(refresh,3000);}
 }
 navigator.serviceWorker.addEventListener('controllerchange',()=>{void refresh();});
 navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(reg=>{
  void controllerInfo();reg.update().catch(()=>{});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){reg.update().catch(()=>{});void controllerInfo();}});
 }).catch(error=>{status.state='update-failed';status.error=String(error);notice('更新確認に失敗しました。保存済みの対戦は保持しています。');});
})();
