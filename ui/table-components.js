'use strict';
// Presentation only. All availability comes from the existing UI port.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PokecaTableUI=factory();})(typeof window!=='undefined'?window:globalThis,()=>{
 const labels={use_ability:'特性',play_item:'使う',play_supporter:'使う',play_stadium:'使う',bench_basic:'出す',play_active_basic:'出す',evolve:'進化',attach_energy:'つける',attach_tool:'つける',attack:'ワザ'};
 function marks(options){return [...new Set((options||[]).filter(o=>(o.ok===true||o.enabled===true)&&o.ok!==false&&o.enabled!==false).map(o=>labels[o.action?.type]||(o.kind==='ability'?'特性':o.kind==='attack'?'ワザ':null)).filter(Boolean))];}
 function energyGroups(cards){const groups=new Map();for(const c of cards||[]){const special=c.isSpecial===true||c.energyType==='特殊';const label=special?(c.name||'特殊エネルギー'):(c.energyType||'不明');const key=(special?'special:':'basic:')+label;const g=groups.get(key)||{label,special,count:0};g.count++;groups.set(key,g);}return [...groups.values()];}
 function installZoom(doc){
  const dialog=doc.getElementById('card-zoom'),content=doc.getElementById('card-zoom-art');let timer=null,origin=null,until=0,held=false;
  function cancel(){clearTimeout(timer);timer=null;origin=null;}
  function open(el){const images=[...el.querySelectorAll('img')].filter(i=>!i.hidden);content.replaceChildren();for(const image of images){const copy=image.cloneNode(true);copy.removeAttribute('id');content.append(copy);}if(!images.length){const fallback=el.querySelector('.card-fallback');content.append(fallback?fallback.cloneNode(true):doc.createTextNode(el.getAttribute('aria-label')||'カード画像なし'));}doc.getElementById('card-zoom-title').textContent=el.dataset.cardName||el.getAttribute('aria-label')||images[0]?.alt||'カード拡大';until=Date.now()+800;held=true;if(!dialog.open)dialog.showModal();}
  doc.getElementById('card-zoom-close').onclick=()=>dialog.close();
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
  doc.addEventListener('contextmenu',e=>{const el=e.target.closest('.discard-card,.detail-art,.opening-card-art,#stadium-art,.fixed-image-card');if(el){e.preventDefault();if(!dialog.open)open(el);}},true);
  doc.addEventListener('pointerdown',e=>{if(e.button!==0)return;const el=e.target.closest('.discard-card,.detail-art,.opening-card-art,#stadium-art,.fixed-image-card');if(!el||!el.querySelector('img,.card-fallback'))return;origin={x:e.clientX,y:e.clientY};timer=setTimeout(()=>open(el),480);},true);
  doc.addEventListener('pointermove',e=>{if(origin&&Math.hypot(e.clientX-origin.x,e.clientY-origin.y)>8)cancel();},true);
  doc.addEventListener('pointerup',()=>{cancel();if(held){until=Date.now()+700;held=false;}},true);doc.addEventListener('pointercancel',cancel,true);
  doc.addEventListener('click',e=>{if(Date.now()<until&&!e.target.closest('#card-zoom')){e.preventDefault();e.stopImmediatePropagation();}},true);
  return {open};
 }
 return {marks,energyGroups,installZoom};
});
