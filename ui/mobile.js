'use strict';
(() => {
  const $=id=>document.getElementById(id), clone=x=>JSON.parse(JSON.stringify(x));
  const idOf=c=>c?.id || c?.cardId;
  const esc=x=>String(x ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const symbols={'水':'💧','炎':'🔥','草':'✦','超':'◉','悪':'◐','雷':'ϟ','闘':'◆','鋼':'⬡'};
  let store=null,persistenceReady=false,storageUnavailable=false,saveQueue=Promise.resolve();
  function saveSession(force=false){
    if(!persistenceReady||!store||(!force&&storageUnavailable))return saveQueue;
    const snapshot=port.getResumeSnapshot();
    $('save-status').textContent='保存中';
    const pending=saveQueue.catch(()=>{}).then(()=>store.save(snapshot)).then(()=>{
      storageUnavailable=false;$('save-status').textContent='自動保存済';$('save-status').title='';$('save-status').classList.remove('save-error');
    },error=>{
      storageUnavailable=true;$('save-status').textContent='端末保存不可・JSON書出し';
      $('save-status').title='保存失敗：'+String(error?.message||error);$('save-status').classList.add('save-error');
      throw error;
    });
    saveQueue=pending;
    return pending;
  }
  function downloadJSON(value,filename){const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  let game=Pokeca.createPracticeGame(),port,selected=null,drag=null,longTimer=null,suppressClick=0,toastTimer=null;
  const metrics={moves:0,shuffles:0,animationErrors:0};
  let animationsEnabled=!matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sheet=$('sheet');
  function japaneseError(value){
    const msg=String(value ?? '操作できません');
    const known=[
      [/Normal energy attachment already used this turn/i,'この番はすでにエネルギーを1枚つけています'],
      [/Not this player's turn|Only the current player may draw through this action|Action player is not the current turn player/i,'今は自分の番ではありません'],
      [/First player cannot attack on the first turn/i,'先攻最初の番はワザを使えません'],
      [/An attack has already been used this turn/i,'この番はすでにワザを使っています'],
      [/Attack energy cost is not satisfied|Insufficient Energy|Missing required .* Energy/i,'ワザに必要なエネルギーが足りません'],
      [/Selected hand card does not exist|Hand card not found/i,'選択した手札が見つかりません'],
      [/Normal energy attachment/i,'エネルギーをつけられません'],
      [/No legal|Illegal action|Action is not legal/i,'この操作はできません']
    ];
    for(const [pattern,label] of known)if(pattern.test(msg))return label;
    return msg;
  }
  function toast(text){$('toast').textContent=japaneseError(text);$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2600);}
  function closeSheet(){if(sheet.open)sheet.close();if(typeof prizeDialogOpen!=='undefined')prizeDialogOpen=false;}
  // A tap on the dimmed backdrop closes information sheets, but not confirmation dialogs.
  // Require pointer down and up to both be outside to avoid dismissing during a swipe.
  let sheetBackdropDown=false;
  sheet.addEventListener('pointerdown',event=>{
    const rect=sheet.getBoundingClientRect();
    sheetBackdropDown=event.target===sheet&&(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom);
  });
  sheet.addEventListener('pointerup',event=>{
    const rect=sheet.getBoundingClientRect();
    const outside=event.target===sheet&&(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom);
    if(sheetBackdropDown&&outside&&sheet.open)closeSheet();
    sheetBackdropDown=false;
  });
  sheet.addEventListener('pointercancel',()=>{sheetBackdropDown=false;});
  function openSheet(title,html){$('sheet-title').textContent=title;$('sheet-content').innerHTML=html;if(!sheet.open)sheet.showModal();}
  function button(label,callback,options={}){const b=document.createElement('button');b.textContent=label;b.disabled=options.disabled || false;if(options.className)b.className=options.className;b.onclick=callback;return b;}
  let confirmTouchGuardUntil=0;
  function confirmAction(message){return new Promise(resolve=>{const d=$('confirm-dialog');$('confirm-message').textContent=message;let settled=false;
    const done=value=>{if(settled)return;settled=true;confirmTouchGuardUntil=Date.now()+700;suppressClick=Math.max(suppressClick,confirmTouchGuardUntil);d.close();resolve(value);};
    $('confirm-ok').onclick=()=>done(true);$('confirm-cancel').onclick=()=>done(false);d.oncancel=e=>{e.preventDefault();done(false);};d.showModal();});}
  function view(){return port.getView('you');}
  function mine(){return view().players.find(p=>p.id==='you');}
  function imageURL(card){return card.imageUrl || window.PokecaArt?.[card.name] || '';}
  function cardArt(card){const url=imageURL(card);return url?`<img src="${esc(url)}" alt="${esc(card.name)}" draggable="false">`:`<span class="card-fallback"><span class="symbol">${esc(symbols[card.energyType] || (card.kind==='tool'?'⌘':card.cardType==='SUPPORTER'?'♧':'◈'))}</span><strong>${esc(card.name || 'カード')}</strong><small>${card.kind==='energy'?'エネルギー':card.kind==='tool'?'どうぐ':card.basic===false?'進化':card.kind==='pokemon'?'HP '+card.hp:'カード'}</small></span>`;}
  function statesFor(snapshot,id){return port.getStatusView().filter(s=>s.targetInstanceId===id);}
  function badges(card,snapshot,owner){let html='';
    if(card.damage)html+=`<span class="badge damage">${esc(card.damage)}</span>`;
    if(card.energyCards?.length)html+=`<span class="badge">${card.energyCards.map(e=>esc(symbols[e.energyType] || '◆')).join('')}${card.energyCards.length}</span>`;
    if(card.tools?.length)html+=`<span class="badge">⌘ ${card.tools.length}</span>`;
    if(card.statusCondition)html+=`<span class="badge effect" data-state-card="${esc(idOf(card))}">${esc(port.getCardInfo(owner.id,idOf(card))?.specialStatus?.short || card.statusCondition)}</span>`;
    const states=statesFor(snapshot,idOf(card));for(const state of states)html+=`<span class="badge effect" role="button" aria-label="${esc(state.label)}・詳細" data-state-card="${esc(idOf(card))}">${esc(state.short)}</span>`;
    if(Object.keys(owner.turnLimits?.abilityUses || {}).some(k=>k.startsWith(idOf(card)+':')))html+='<span class="badge used">特性 使用済</span>';
    return html?`<span class="badges">${html}</span>`:'';
  }
  function cardHTML(card,snapshot,owner,hand=false){return `<button class="card${selected===idOf(card)?' selected':''}" data-card-id="${esc(idOf(card))}" data-owner="${esc(owner.id)}" ${hand?'data-hand="true"':''} aria-label="${esc(card.name)}${hand?'・手札':'・HP '+Math.max(0,card.hp-(card.damage || 0))}" title="長押しで詳細">${cardArt(card)}${hand?'':(card.kind==='pokemon'?`<span class="field-hp" aria-label="残りHP ${esc(Math.max(0,Number(card.hp||0)-Number(card.damage||0)))}"><b>HP</b> <strong>${esc(Math.max(0,Number(card.hp||0)-Number(card.damage||0)))}</strong><span class="hp-total"> / ${esc(card.hp ?? '—')}</span></span>`:'')+badges(card,snapshot,owner)}</button>`;}
  function zoneHTML(player,zone,label,icon){const count=zone==='deck'?player.deckCount:zone==='prize'?player.prizeCount:player.discardCount;return `<button class="zone ${zone}" data-zone="${zone}" data-zone-owner="${player.id}" aria-label="${esc(label)} ${count}枚"><span class="zone-icon">${icon}</span><span>${label}</span><strong>${count}</strong></button>`;}
  function render(){const s=view(),you=s.players.find(p=>p.id==='you'),opp=s.players.find(p=>p.id!=='you');
    if(s.pendingPrizeSelection?.playerId==='you'&&!prizeDialogOpen)queueMicrotask(showPrizeChoice);
    $('turn-label').textContent=s.status==='finished'?'対戦終了 · '+(s.winner==='you'?'自分の勝ち':'相手の勝ち'):`TURN ${s.turnNumber} · ${s.turnPlayer==='you'?'自分の番':'相手の番'}`;
    $('game-note').textContent=s.practiceScenario?`実証${s.practiceScenario.index+1} · ${s.practiceScenario.label}`:s.mode==='practice'?'操作練習・仮HP':s.demo?'架空カードの試験対戦・公式データではありません':'JSON試験対戦・公式検証未完了';
    $('opponent-hand').innerHTML=Array.from({length:Math.min(opp.handCount,14)},()=>'<i class="card-back"></i>').join('');$('opponent-hand-count').textContent=opp.handCount+'枚';
    for(const [prefix,p] of [['opponent',opp],['self',you]]){
      $(prefix+'-bench').innerHTML=Array.from({length:5},(_,i)=>`<div class="bench-slot${p.bench[i]?'':' empty'}" ${prefix==='self'?'data-drop-zone="bench"':''}>${p.bench[i]?cardHTML(p.bench[i],s,p):''}</div>`).join('');
      $(prefix+'-active').innerHTML=p.active?cardHTML(p.active,s,p):'<span class="empty-message">バトル場</span>';
      $(prefix+'-left').innerHTML=zoneHTML(p,'prize','サイド','◇');
      $(prefix+'-right').innerHTML=zoneHTML(p,'deck','山札','▤')+zoneHTML(p,'discard','トラッシュ','↘');
    }
    const scroll=$('self-hand').scrollLeft;$('self-hand').innerHTML=you.hand.map(c=>cardHTML(c,s,you,true)).join('');$('self-hand').scrollLeft=scroll;$('hand-count').textContent=you.handCount+'枚';
    const used=Object.keys(you.turnLimits?.abilityUses || {}).length;
    $('limits').innerHTML=`<span class="limit${you.normalEnergyAttached?' spent':''}">手張り ${you.normalEnergyAttached?'済':'未'}</span><span class="limit${you.turnLimits?.supporterUsed?' spent':''}">サポ ${you.turnLimits?.supporterUsed?'済':'未'}</span><span class="limit${used?' spent':''}">特性 ${used}</span><span class="limit${s.retreatUsed?' spent':''}">にげる ${s.retreatUsed?'済':'未'}</span>`;
    $('history-count').textContent=s.history.length;
    let recent=$('recent-actions');
    if(!recent){recent=document.createElement('div');recent.id='recent-actions';recent.setAttribute('aria-live','polite');$('turn-label').parentElement.appendChild(recent);}
    const actions=s.history.filter(e=>!['practice_started'].includes(e.type)).slice(-12).reverse();
    const notable=actions.find(e=>!['draw','end_turn'].includes(e.type)) || actions[0];
    recent.classList.toggle('recent-opponent',notable?.player==='ai');recent.classList.toggle('recent-self',!!notable&&notable.player!=='ai');
    recent.innerHTML=notable?'<span class="recent-player">'+(notable.player==='ai'?'相手':'自分')+'</span><span class="recent-description">'+esc(eventText(notable))+'</span><span class="recent-open">履歴 ›</span>':'直近の行動：まだありません';recent.setAttribute('role','button');recent.setAttribute('tabindex','0');recent.onclick=history;recent.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();history();}};
    // Action availability is derived from the same legal options as card taps.
    const myTurn=s.status==='active'&&s.turnPlayer==='you';
    const attackOptions=you.active?port.getPokemonActions('you',idOf(you.active)).filter(o=>o.kind==='attack'):[];
    const abilityOptions=[you.active,...you.bench].filter(Boolean).flatMap(mon=>port.getPokemonActions('you',idOf(mon)).filter(o=>o.kind==='ability'));
    $('attack-button').disabled=!myTurn||!attackOptions.some(o=>o.enabled);
    $('ability-button').disabled=!myTurn||!abilityOptions.some(o=>o.enabled);
    $('attack-button').title=attackOptions.length?(attackOptions.some(o=>o.enabled)?'ワザを選択':'現在使えるワザはありません'):'ワザが登録されていません';
    $('ability-button').title=abilityOptions.length?(abilityOptions.some(o=>o.enabled)?'特性を選択':'現在使える特性はありません'):'手動で使う特性はありません';
    $('draw-button').disabled=!port.canDispatch('you',{type:'draw',count:1});
    $('end-turn').disabled=!port.canDispatch(s.turnPlayer,{type:'end_turn'})||(s.turnPlayer==='ai'&&(aiAutoMode||aiPracticeRunning));
    $('end-turn').textContent=s.turnPlayer==='you'?'番を終える →':'相手の番を終える →';
    $('stadium-name').textContent=s.stadium?.name || 'スタジアムなし';
    $('stadium-art').innerHTML=s.stadium?cardArt(s.stadium):'';
    $('stadium').classList.toggle('has-stadium',!!s.stadium);
    for(const [prefix,p] of [['self',you],['opponent',opp]]){const states=scopedStates(p.id);$(prefix+'-effects').replaceChildren(...states.map(state=>button(state.short,()=>scopedStateDetail(p.id),{className:'scope-chip'})));}
    bindCards();highlight();
    if(s.practiceScenario?.focusInstanceId)document.querySelectorAll('[data-card-id]').forEach(el=>el.classList.toggle('scenario-focus',el.dataset.cardId===s.practiceScenario.focusInstanceId));
  }
  function getCard(id){for(const p of view().players){const c=[...p.hand,p.active,...p.bench,...p.discard].find(c=>idOf(c)===id);if(c)return {card:c,player:p};}return null;}
  function bindCards(){document.querySelectorAll('[data-card-id]').forEach(el=>{
    el.onclick=()=>{if(Date.now()<suppressClick)return;const id=el.dataset.cardId;
      if(selected&&!el.dataset.hand){if(dropOn(el))return;}
      if(el.dataset.hand)selectHand(id);else pokemonMenu(id,el.dataset.owner);
    };
    el.oncontextmenu=e=>{e.preventDefault();detail(el.dataset.cardId);};
    el.onpointerdown=e=>pointerStart(e,el);
    el.onpointermove=e=>pointerMove(e);
    el.onpointerup=e=>pointerEnd(e);
    el.onpointercancel=()=>clearGesture();
    el.querySelectorAll('img').forEach(img=>img.onerror=()=>{img.replaceWith(Object.assign(document.createElement('span'),{className:'card-fallback',textContent:img.alt}));});
  });
    document.querySelectorAll('[data-state-card]').forEach(el=>{el.onclick=e=>{e.stopPropagation();stateDetail(el.dataset.stateCard);};});
    document.querySelectorAll('[data-zone]').forEach(el=>el.onclick=()=>{if(Date.now()<confirmTouchGuardUntil)return;zoneMenu(el.dataset.zoneOwner,el.dataset.zone);});
    document.querySelectorAll('.bench-slot.empty').forEach(el=>el.onclick=()=>{if(selected)dropOn(el);});
  }
  function selectHand(id){if(['ITEM','SUPPORTER','STADIUM'].includes(getCard(id)?.card.cardType)){selected=id;highlight();$('interaction-hint').textContent='選択中：'+(getCard(id)?.card.name||'カード');handMenu(id);return;}selected=selected===id?null:id;highlight();
    if(!selected){$('interaction-hint').textContent='カードをタップで操作・長押しで詳細';return;}
    const entry=getCard(id);if(!entry)return;
    $('interaction-hint').textContent='選択中：'+(entry.card.name||'カード')+'・配置先をタップ';
    const options=port.getHandActions('you',id);
    if(options.length){if(entry.card.cardType==='STADIUM'){toast('中央のスタジアム欄をタップ、またはカードをもう一度タップ');$('interaction-hint').textContent='スタジアム欄をタップして配置';}else{toast('緑色の対象へドラッグ、またはタップ');$('interaction-hint').textContent='緑の対象をタップして配置';}}
    else if(['SUPPORTER','ITEM','STADIUM'].includes(entry.card.cardType))handMenu(id);
    else {const reasons=port.getHandOptions('you',id).flatMap(x=>x.errors);toast(reasons[0] || '今は合法な配置先がありません。長押しで詳細');$('interaction-hint').textContent=reasons[0] || '合法な配置先なし';}
  }
  function targets(){return selected?port.getHandActions('you',selected):[];}
  function highlight(){document.querySelectorAll('.legal-target,.drop-hover').forEach(el=>el.classList.remove('legal-target','drop-hover'));
    document.querySelectorAll('[data-card-id]').forEach(el=>el.classList.toggle('selected',!!el.dataset.hand&&el.dataset.cardId===selected));
    for(const target of targets()) {
      if(target.key==='stadium')$('stadium').classList.add('legal-target');
      else if(target.key==='bench')document.querySelectorAll('#self-bench .bench-slot.empty').forEach(el=>el.classList.add('legal-target'));
      else if(target.key==='active')$('self-active').classList.add('legal-target');
      else document.querySelectorAll('#self-active [data-card-id],#self-bench [data-card-id]').forEach(el=>{if(el.dataset.cardId===target.key)el.classList.add('legal-target');});
    }
  }
  function actionFor(el){if(!el||!selected)return null;
    const stadium=el.closest('#stadium');if(stadium)return targets().find(t=>t.key==='stadium');
    const card=el.closest('[data-card-id]');
    if(card?.dataset.owner==='you'&&!card.dataset.hand){const match=targets().find(t=>t.key===card.dataset.cardId);if(match)return match;}
    const zone=el.closest('[data-drop-zone]');
    if(zone&&zone.classList.contains('empty'))return targets().find(t=>t.key==='bench');
    if(zone?.id==='self-active')return targets().find(t=>t.key==='active');
    return null;
  }
  function dropOn(el){const option=actionFor(el);if(!option)return false;const r=dispatch('you',option.action);if(r.ok){selected=null;highlight();}return r.ok;}
  function pointerStart(e,el){if(e.button!==0)return;suppressClick=0;
    clearTimeout(longTimer);const id=el.dataset.cardId;
    drag={pointerId:e.pointerId,x:e.clientX,y:e.clientY,el,id,hand:!!el.dataset.hand,active:false,scroll:false};
    longTimer=setTimeout(()=>{if(drag&&!drag.active&&!drag.scroll){suppressClick=Date.now()+1000;detail(id);clearGesture();suppressClick=Date.now()+500;}},480);
  }
  function pointerMove(e){if(!drag||drag.pointerId!==e.pointerId)return;
    const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
    if(!drag.active && Math.hypot(dx,dy)>8){clearTimeout(longTimer);
      if(!drag.hand||Math.abs(dx)>Math.abs(dy)){drag.scroll=true;return;}
      if(dy<-8){drag.active=true;selected=drag.id;highlight();suppressClick=Date.now()+1000;
        try{drag.el.setPointerCapture(e.pointerId);}catch(_){}
        const ghost=drag.el.cloneNode(true);ghost.removeAttribute('data-card-id');ghost.classList.add('drag-ghost');document.body.appendChild(ghost);drag.ghost=ghost;
      }
    }
    if(drag.active){e.preventDefault();drag.ghost.style.left=e.clientX+'px';drag.ghost.style.top=e.clientY+'px';highlight();const el=document.elementFromPoint(e.clientX,e.clientY);if(actionFor(el)) (el.closest('[data-card-id],.bench-slot,#self-active')||el).classList.add('drop-hover');}
  }
  function pointerEnd(e){clearTimeout(longTimer);if(!drag)return;
    const active=drag.active;const tapTarget=!active&&!drag.scroll&&e.pointerType==='touch'&&Date.now()>=suppressClick?(e.target.closest('[data-state-card]') || drag.el):null;if(active){const el=document.elementFromPoint(e.clientX,e.clientY);if(!dropOn(el)){port.dispatch('you',{type:'invalid_drop',cardId:selected,targetInstanceId:el?.closest('[data-card-id]')?.dataset.cardId || null});toast('ここには置けません。状態は変更されていません');}}
    clearGesture();if(tapTarget){tapTarget.click();suppressClick=Date.now()+500;}if(active)suppressClick=Date.now()+500;
  }
  function clearGesture(){clearTimeout(longTimer);suppressClick=Math.min(suppressClick,Date.now()+120);if(drag?.ghost)drag.ghost.remove();drag=null;document.querySelectorAll('.drop-hover').forEach(el=>el.classList.remove('drop-hover'));}
  function detail(id){const entry=getCard(id);if(!entry)return;const {card,player}=entry,s=view();
    const info=port.getCardInfo(player.id,id);const declared=card.abilities || [],registry=port.getEffects(player.id).find(x=>x.instanceId===id)?.effects || [];
    const attacks=registry.filter(e=>e.source.type==='ATTACK').map(e=>e.source.name).concat((card.attacks || []).map(a=>a.name));
    const abilities=declared.map(a=>a.name+': '+(a.text || '')).concat(registry.filter(e=>e.source.type==='ABILITY').map(e=>e.source.name));
    const stateHTML=statesFor(s,id).map(effectRow).join('');
    openSheet(card.name,`<div class="detail"><div class="detail-art">${cardArt(card)}</div><dl><dt>HP / ダメージ</dt><dd>${esc(card.hp ?? '—')} / ${esc(card.damage || 0)}</dd><dt>ワザ</dt><dd>${esc(attacks.join(' / ') || '提供データなし')}</dd><dt>特性</dt><dd>${esc(abilities.join(' / ') || '提供データなし')}</dd><dt>エネルギー</dt><dd>${esc((card.energyCards || []).map(c=>c.energyType).join(' / ') || 'なし')}</dd><dt>どうぐ</dt><dd>${esc((card.tools || []).map(c=>c.name).join(' / ') || 'なし')}</dd><dt>特殊状態</dt><dd>${esc(card.statusCondition || 'なし')}</dd>${card.fixtureNote?'<dt>実証情報</dt><dd>'+esc(card.fixtureNote)+'</dd>':''}</dl><div class="detail-effects">${(info?.entries || []).map(ruleRow).join('')}${stateHTML || '<p>継続効果なし</p>'}</div></div><div id="detail-actions" class="menu-list"></div>`);
    if(player.id==='you'&&player.hand.some(c=>idOf(c)===id))addHandActions(id,$('detail-actions'));
  }
  function effectRow(state){return `<div class="effect-row"><strong>${esc(state.label)}</strong><dl class="effect-metadata"><dt>効果内容</dt><dd>${esc(state.description)}</dd><dt>発生元カード／効果</dt><dd>${esc(state.sourceCard)} / ${esc(state.sourceEffect)}</dd><dt>対象</dt><dd>${esc(state.target)}</dd><dt>開始タイミング</dt><dd>${esc(state.start)}</dd><dt>期限</dt><dd>${esc(state.duration)}</dd><dt>解除条件</dt><dd>${esc(state.removal)}</dd></dl></div>`;}
  function ruleRow(entry){return `<section class="effect-row rule-explanation"><strong>${entry.type==='ABILITY'?'特性':'ワザ'} · ${esc(entry.name)}${entry.active===null?'':entry.active?'（現在有効）':'（現在無効／使用済み・条件不成立）'}</strong><p>${esc(entry.description)}</p>${entry.inactiveReasons?.length?'<p>'+esc(entry.inactiveReasons.join(' / '))+'</p>':''}${entry.officialText!==null?'<small>保存済みofficialTextを表示（原文は変更しません）</small>':''}<dl class="effect-metadata"><dt>発動条件</dt><dd>${esc(entry.condition)}</dd><dt>対象</dt><dd>${esc(entry.target)}</dd><dt>使用回数制限</dt><dd>${esc(entry.usage)}</dd><dt>解除条件</dt><dd>${esc(entry.removal)}</dd><dt>処理順（表示用）</dt><dd>${esc(entry.resolution)}</dd></dl></section>`;}
  function stateDetail(id){const found=getCard(id),info=found?port.getCardInfo(found.player.id,id):null;const states=statesFor(view(),id);openSheet('継続効果・期限',states.map(effectRow).join('')+(info?.specialStatus?effectRow(info.specialStatus):'') || '<p>現在有効な継続効果はありません。</p>');}
  function scopedStates(playerId){return port.getStatusView().filter(s=>s.scope==='PLAYER'?s.playerId===playerId:s.scope==='FIELD'&&(!s.playerIds || s.playerIds.includes(playerId)));}
  function scopedStateDetail(playerId){openSheet((playerId==='you'?'自分':'相手')+'側・場の制限',scopedStates(playerId).map(effectRow).join('') || '<p>現在有効な制限はありません。</p>');}
  function addHandActions(id,container){const card=getCard(id)?.card;
    if(card?.cardType==='SUPPORTER'){const a={type:'play_supporter',cardId:id},explanation=port.getActionExplanation('you',a);container.append(button('サポートを使う',()=>{dispatch('you',a);closeSheet();},{disabled:!explanation.ok}));if(!explanation.ok)container.append(button('使用できない理由',()=>openSheet('使用制限の理由',explanation.errors.map(reason=>'<p>'+esc(reason)+'</p>').join(''))));}
    for(const [kind,type,label] of [['ITEM','play_item','グッズを使う'],['STADIUM','play_stadium','スタジアムを出す']])if(card?.cardType===kind){
      const a={type,cardId:id},search=card.commands?.find(c=>c.command==='SEARCH_DECK');
      if(search){
        const snapshot=port.getSnapshot(),deck=snapshot.players.find(p=>p.id==='you').deck;
        const candidates=deck.filter(c=>(search.filter||[]).every(f=>f.field==='cardType'&&f.operator==='EQUALS'&&c.cardType===f.value));
        const allowed=port.getActionExplanation('you',{...a,selectedCardIds:[]});
        container.append(button('山札を見る・カードを選ぶ',async()=>{
          const ids=await selectCards({title:'山札から選ぶ（効果の対象のみ）',min:Math.min(search.min||0,candidates.length),max:search.max||1,candidates:candidates.map(c=>({id:idOf(c),name:c.name}))});
          if(ids===null)return;
          const result=dispatch('you',{...a,selectedCardIds:ids});if(result.ok)closeSheet();
        },{disabled:!allowed.ok}));
        if(!allowed.ok)container.append(button('使用できない理由',()=>toast(allowed.errors.join(' / '))));
      }else{
        const explanation=port.getActionExplanation('you',a);
        container.append(button(label,()=>{const result=dispatch('you',a);if(result.ok)closeSheet();},{disabled:!explanation.ok}));
        if(!explanation.ok)container.append(button('使用できない理由',()=>openSheet('使用制限の理由',explanation.errors.map(reason=>'<p>'+esc(reason)+'</p>').join(''))));
      }
    }
    if(view().mode==='practice')for(const [type,label] of [['return_hand_to_deck','練習操作：山札へ戻す'],['discard_card','練習操作：トラッシュへ']]){const a={type,cardId:id};container.append(button(label,()=>{dispatch('you',a);closeSheet();},{disabled:!port.canDispatch('you',a)}));}
  }
  function handMenu(id){if(view().turnPlayer!=='you'){detail(id);return;}openSheet(getCard(id)?.card.name || '手札','<div class="menu-list" id="hand-actions"></div>');addHandActions(id,$('hand-actions'));$('hand-actions').append(button('詳細を見る',()=>detail(id)));}
  function pokemonMenu(id,owner){if(view().turnPlayer!=='you'){detail(id);return;}if(owner!=='you'){detail(id);return;}
    const options=port.getPokemonActions('you',id),entry=getCard(id);
    openSheet(entry.card.name,'<div class="menu-list" id="pokemon-actions"></div>');const container=$('pokemon-actions');
    for(const option of options.filter(o=>o.kind!=='retreat')){const b=button((option.kind==='ability'?'特性 · ':option.kind==='attack'?'ワザ · ':'')+option.label+(option.used?' · 使用済':''),()=>resolveOption(option),{disabled:!option.enabled});b.dataset.actionKind=option.kind;container.append(b);if(!option.enabled&&option.disabledReasons?.length)container.append(button('使用できない理由',()=>openSheet('使用制限の理由',option.disabledReasons.map(reason=>'<p>'+esc(reason)+'</p>').join(''))));}
    const retreatOptions=options.filter(o=>o.kind==='retreat');
    if(retreatOptions.length){const enabled=retreatOptions.filter(o=>o.enabled);container.append(button('にげる',async()=>{
      const ids=await selectCards({title:'にげる先のベンチを選ぶ',min:1,max:1,candidates:enabled.map(o=>({id:o.action.benchInstanceId,name:o.label}))});if(!ids)return;
      const chosen=enabled.find(o=>o.action.benchInstanceId===ids[0]);resolveOption(chosen);
    },{disabled:!enabled.length}));
    if(!enabled.length)container.append(button('にげられない理由',()=>openSheet('にげるの制限',retreatOptions.flatMap(o=>o.disabledReasons || []).filter((x,i,a)=>a.indexOf(x)===i).map(x=>'<p>'+esc(x)+'</p>').join(''))));}
    const info=port.getCardInfo('you',id);
    for(const entry of info?.entries || []){const wrapper=document.createElement('div');wrapper.innerHTML=ruleRow(entry);container.append(wrapper.firstElementChild);}
    container.append(button('継続効果・期限',()=>stateDetail(id)),button('長押し詳細とカード情報',()=>detail(id)));
  }
  async function resolveOption(option){let action=clone(option.action);
    if(option.energyRequest){const ids=await selectCards({title:'にげるためのエネルギーを選ぶ',...option.energyRequest});if(!ids)return;action.energyIds=ids;}
    if(option.targets){const id=await selectCards({title:'特性の対象を選ぶ',min:1,max:1,candidates:option.targets.map(id=>{const state=view();const owner=state.players.find(p=>idOf(p.active)===id||p.bench.some(b=>idOf(b)===id));const index=owner?.bench.findIndex(b=>idOf(b)===id)??-1;const mon=owner?.active&&idOf(owner.active)===id?owner.active:owner?.bench[index];return {id,name:(owner?.id==='you'?'自分':'相手')+' '+(index>=0?'ベンチ'+(index+1):'バトル場')+' · '+(mon?.name||getCard(id)?.card.name||id)+(mon?.hp!=null?' · 残りHP '+Math.max(0,Number(mon.hp)-Number(mon.damage||0)):'')};})});if(!id)return;action.targetIds=id;}
    // All bench targeting goes through the engine-provided legal candidate list.
    // Never permit free-form damage or counter placement from the UI.
    for(const request of option.requests || []) {
      const choices=await selectCards({title:request.kind==='CARD'?'山札からサポートを選ぶ':'ワザ・特性の対象ポケモンを選ぶ',min:request.min,max:request.max,candidates:request.candidates.map(c=>{const id=c.instanceId||idOf(c);const state=view();const owner=state.players.find(p=>p.active&&idOf(p.active)===id||p.bench?.some(b=>idOf(b)===id));const benchIndex=owner?.bench?.findIndex(b=>idOf(b)===id)??-1;const position=benchIndex>=0?'ベンチ'+(benchIndex+1):'バトル場';if(request.kind==='CARD')return {...c,id,name:c.name||c.cardName||'カード'};const side=owner?.id==='you'?'自分':owner?'相手':'対象';const mon=benchIndex>=0?owner?.bench[benchIndex]:owner?.active;const hp=mon?.hp!=null?' · 残りHP '+Math.max(0,Number(mon.hp)-Number(mon.damage||0)):'';return {...c,id,name:side+' '+position+' · '+(mon?.name||c.name||'ポケモン')+hp};})});
      if(!choices)return;
      if(request.kind==='POKEMON')action.targetIds=choices;else{action.selections ||= {};action.selections[request.key]=choices;}
    }
    if(option.kind==='retreat'&&!await confirmAction(`エネルギー${action.energyIds.length}枚をトラッシュして、選んだベンチへにげます。実行しますか？`)){closeSheet();return;}
    if(option.kind==='attack'&&!await confirmAction('「'+option.label+'」を使います。解決後に番が進みます。よろしいですか？')){closeSheet();return;}
    if(option.kind==='ability'&&!await confirmAction('特性「'+option.label+'」を使います。よろしいですか？')){closeSheet();return;}
    closeSheet();const used=dispatch('you',action);
    if(used.ok&&option.kind==='attack'&&view().status==='active'&&view().turnPlayer==='you'){
      const ended=dispatch('you',{type:'end_turn'});
      if(!ended.ok)toast('ワザは使用済みです。番の終了を確認してください');
      else if(aiAutoMode&&view().turnPlayer==='ai')void runOpponentPracticeTurn();
    }
  }
  function selectCards({title,min,max,candidates}) {return new Promise(resolve=>{
    const unit=/エネルギー|カード|山札|サポート/.test(title)?'枚':'匹';
    const selectedIds=new Set();let settled=false;
    const done=value=>{if(settled)return;settled=true;sheet.removeEventListener('close',cancel);if(sheet.open)sheet.close();resolve(value);};
    const cancel=()=>done(null);
    openSheet(title,`<p>選択できるカードだけを表示しています。${min===max?`${min}${unit}選択してください。`:`${min}〜${max}${unit}選択できます。`}</p><div class="selection-grid" id="selection-cards"></div><div class="selection-footer"><span id="selection-count">0/${max}</span><button id="selection-confirm" class="primary" ${min?'disabled':''}>決定</button></div>`);
    sheet.addEventListener('close',cancel);
    for(const card of candidates){const b=button(card.name || 'カード',()=>{if(selectedIds.has(card.id))selectedIds.delete(card.id);else{if(max===1)selectedIds.clear();if(selectedIds.size<max)selectedIds.add(card.id);else toast('選べる数は最大'+max+unit+'です');}document.querySelectorAll('#selection-cards button').forEach(el=>el.setAttribute('aria-pressed',String(selectedIds.has(el.dataset.selectionId))));$('selection-count').textContent=selectedIds.size+'/'+max;$('selection-confirm').disabled=selectedIds.size<min;});b.dataset.selectionId=card.id;b.setAttribute('aria-pressed','false');$('selection-cards').append(b);}
    $('selection-confirm').onclick=()=>done([...selectedIds]);
  });}
  function dispatch(playerId,action){const before=view();if(playerId==='you'&&before.turnPlayer!=='you'&&action.type!=='take_prizes'){toast('今は相手の番です。自分のカードは操作できません');return {ok:false,errors:['相手の番です']};}const result=port.dispatch(playerId,action);
    if(!result.ok){toast((result.errors || ['操作できません']).map(e=>e==='Action player is not the current turn player'?'今は相手の番です':e).join(' / '));return result;}
    selected=null;highlight();$('interaction-hint').textContent='カードをタップで操作・長押しで詳細';
    if(result.persistenceError)toast('自動保存できませんでした。メニューから再開用JSONを書き出してください');
    if(result.viewError)toast('処理は確定しました。表示を再読み込みしてください');
    try{animateEvents(before,view());}catch(_){metrics.animationErrors++;}
    return result;
  }
  function anchor(owner,zone){return document.querySelector(`[data-zone-owner="${owner}"][data-zone="${zone}"]`) || (owner==='you'?$('self-hand'):$('opponent-hand'));}
  function fly(from,to){metrics.moves++;if(!animationsEnabled||!from||!to)return;const a=from.getBoundingClientRect(),b=to.getBoundingClientRect(),el=document.createElement('div');el.className='flying-card';el.style.left=a.x+a.width/2+'px';el.style.top=a.y+a.height/2+'px';$('animation-layer').append(el);
    try{const animation=el.animate([{transform:'translate(-50%,-50%) scale(.7)',opacity:.8},{transform:`translate(${b.x+b.width/2-a.x-a.width/2}px,${b.y+b.height/2-a.y-a.height/2}px) scale(.8)`,opacity:0}],{duration:260,easing:'ease-out'});animation.finished.catch(()=>{}).finally(()=>el.remove());}catch(_){el.remove();metrics.animationErrors++;}
  }
  function animateEvents(before,after){for(const event of after.history.slice(before.history.length)){
    const d=event.details || {},command=d.command || event.type,owner=event.player || after.turnPlayer;
    if(['DRAW','ADD_TO_HAND','draw'].includes(command))fly(anchor(owner,'deck'),owner==='you'?$('self-hand'):$('opponent-hand'));
    if(command==='return_to_deck')fly($('self-hand'),anchor(owner,'deck'));
    if(['discard','supporter_used'].includes(command))fly($('self-hand'),anchor(owner,'discard'));
    if(command==='knockout'){const recipient=d.playerId || owner;fly(anchor(recipient,'prize'),recipient==='you'?$('self-hand'):$('opponent-hand'));fly($(d.targetPlayerId==='you'?'self-active':'opponent-active'),anchor(d.targetPlayerId,'discard'));}
    if(['attach_energy','attach_tool','bench_basic','evolve'].includes(command)){
      const me=after.players.find(p=>p.id==='you');
      const targetId=d.targetInstanceId || (command==='bench_basic'?d.cardId:d.target==='active'?idOf(me.active):Number.isInteger(d.target)?idOf(me.bench[d.target]):null);
      const target=targetId?document.querySelector('[data-card-id="'+CSS.escape(targetId)+'"]'):null;
      fly($('self-hand'),target || $('self-active'));
    }
    if(['SWITCH','FORCE_SWITCH'].includes(command)){const moved=after.players.find(p=>idOf(p.active)===d.activeInstanceId)?.id || owner;const prefix=moved==='you'?'self':'opponent';fly($(prefix+'-active'),$(prefix+'-bench'));fly($(prefix+'-bench'),$(prefix+'-active'));}
    if(command==='SHUFFLE_DECK'){metrics.shuffles++;const el=anchor(owner,'deck');if(animationsEnabled&&el){el.classList.remove('shuffle-flash');void el.offsetWidth;el.classList.add('shuffle-flash');setTimeout(()=>el.classList.remove('shuffle-flash'),450);}}
  }}
  function eventText(event){const d=event.details || {},c=d.command || event.type;
    if(c==='demo_judge_hand_reset')return (d.targetPlayerId==='ai'?'相手':'自分')+'の手札を山札に戻してシャッフル → '+d.drawn+'枚引いた（戻した枚数 '+d.returned+'枚）';
    const labels={DAMAGE:'ダメージ',PLACE_DAMAGE_COUNTERS:'ダメカン配置',DRAW:'ドロー',draw:'ドロー',SEARCH_DECK:'山札を検索',REVEAL:'カードを公開',ADD_TO_HAND:'山札から手札へ',SHUFFLE_DECK:'山札をシャッフル',ADD_STATE:'継続状態を付与',REMOVE_STATE:'継続状態を解除',PREVENT_DAMAGE:'ダメージ防止',PREVENT_EFFECT:'効果防止',attach_energy:'エネルギー装着',attach_tool:'どうぐ装着',evolve:'進化',ability_used:'特性使用',attack:'ワザ使用',end_turn:'ターン終了',retreat:'にげる',knockout:'きぜつ・サイド取得',SWITCH:'いれかえ',FORCE_SWITCH:'強制いれかえ',discard:'トラッシュ',return_to_deck:'山札へ戻す',bench_basic:'ベンチに出す',play_active_basic:'バトル場へ',supporter_used:'サポート使用',item_used:'グッズ使用',stadium_played:'スタジアム配置',practice_started:'操作練習開始'};
    const amount=d.counterCount!==undefined?d.counterCount+'個':d.amount!==undefined?d.amount+'ダメージ':d.count!==undefined?d.count+'枚':d.cardIds?d.cardIds.length+'枚':'';
    const target=d.targetInstanceId?' → '+(getCard(d.targetInstanceId)?.card.name || d.targetInstanceId):'';
    return (labels[c] || c)+(d.name?' · '+d.name:'')+(d.cardName?' · '+d.cardName:'')+(d.cards?.length?' · '+d.cards.map(c=>c.name).join(' / '):'')+(amount?' · '+amount:'')+target+(d.prevented?'（防止）':'');
  }
  function history(){
    const s=view(),events=s.history.slice().reverse(),groups=[];
    for(const e of events){
      const turn=e.turnNumber ?? 0,player=e.player==='ai'?'相手':'自分',key=turn+':'+player;
      let group=groups.find(g=>g.key===key);
      if(!group){group={key,turn,player,events:[]};groups.push(group);}
      group.events.push(e);
    }
    const relevant=e=>!['draw','end_turn','practice_started'].includes(e.type);
    const highlights=events.filter(relevant).slice(0,7);
    const logClass=e=>e.player==='ai'?'log-opponent':'log-self';
    const overview=highlights.length?highlights.map(e=>'<div class="log-highlight '+logClass(e)+'"><span class="log-player">'+(e.player==='ai'?'相手':'自分')+'</span><span class="log-description">'+esc(eventText(e))+'</span></div>').join(''):'<p>まだ主な行動はありません。</p>';
    const rows=groups.map((g,i)=>'<details class="log-turn '+(g.player==='相手'?'log-turn-opponent':'log-turn-self')+'" '+(i<2?'open':'')+'><summary><strong>ターン '+esc(g.turn)+' · '+g.player+'</strong><span>'+g.events.length+'件</span></summary><ol class="log-events">'+g.events.map(e=>'<li class="'+(relevant(e)?'log-important':'log-minor')+' '+logClass(e)+'"><span class="log-event-label">'+(e.player==='ai'?'相手':'自分')+'</span><span>'+esc(eventText(e))+'</span></li>').join('')+'</ol></details>').join('');
    openSheet('対戦履歴 · 新表示 v137',`<div class="log-overview"><strong>直近の主な行動</strong>${overview}</div><div class="log-heading">ターンごとの履歴 <small>タップで開閉</small></div><div class="log-turns">${rows}</div><details class="log-export"><summary>ログ書き出し・研究用</summary><div class="menu-list"><button id="export-log">構造化ログを書き出す</button><button id="research-open">操作前後・研究履歴を確認</button><button id="export-research">研究ログJSONを書き出す（非公開情報を含む）</button></div></details>`);
    $('research-open').onclick=researchHistory;
    $('export-research').onclick=()=>downloadJSON(port.getResearchLog(),'pokeca-research-'+port.getResearchLog().matchId+'.json');
    $('export-log').onclick=()=>{const blob=new Blob([JSON.stringify({schemaVersion:1,mode:s.mode,status:s.status,winner:s.winner,events:s.history},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='pokeca-match-log.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  }
  function researchHistory(){const log=port.getResearchLog();openSheet('操作前後・研究履歴',`<p>対戦ID：${esc(log.matchId)}。評価値は未設定です。</p><div id="research-steps" class="menu-list"></div>`);for(const step of log.steps){$('research-steps').append(button(`TURN ${step.turnNumber} · ${step.playerId} · ${step.action.type} · ${step.legality}`,()=>researchStep(step.sequence)));}}
  function researchStep(sequence){const step=port.getResearchStep(sequence);if(!step)return;
    const summary=state=>state.players.map(p=>({player:p.id,active:p.active?{name:p.active.name,id:idOf(p.active),damage:p.active.damage}:null,bench:p.bench.map(c=>({name:c.name,id:idOf(c),damage:c.damage})),handCount:p.hand.length,deckCount:p.deck.length,prizes:p.prizes}));
    openSheet('この1手の変化（閲覧専用）',`<p>${esc(step.action.type)} · ${esc(step.legality)} / 評価：未設定</p><h3>操作前</h3><pre>${esc(JSON.stringify(summary(step.beforeState),null,2))}</pre><h3>操作後</h3><pre>${esc(JSON.stringify(summary(step.afterState),null,2))}</pre><p>変化した箇所：${esc(step.changes.map(c=>c.path.join('.')).join(' / ') || 'なし')}</p><p>予定Effect Command：${esc((step.plannedEffectCommands || []).map(c=>c.command).join(' → ') || 'なし')}</p><p>確定Effect Command：${esc(step.effectCommands.map(c=>c.command).join(' → ') || 'なし')}</p><p>判定段階：${esc(step.result.stage)} / ${esc(step.result.errors.join(' / ') || '成功')}</p>`);
  }
  async function savesMenu(){openSheet('中断・再開／保存データ','<p>再開用JSONはGame Stateと研究履歴を含みます。対戦ログの書き出しとは別形式です。山札・相手手札など非公開情報も含むため、保管先に注意してください。</p><div class="menu-list" id="save-actions"></div><label>再開用JSONを読み込む<input type="file" id="resume-file" accept="application/json,.json"></label><div class="menu-list" id="saved-matches"></div>');
    $('save-actions').append(button('端末への保存を再試行',async()=>{try{await saveSession(true);toast('端末への保存を確認しました');}catch(error){toast('保存できません：'+error.message+'。再開用JSONを書き出してください');}}));
    $('save-actions').append(button('再開用JSONを書き出す',()=>{try{const saved=port.getResumeSnapshot();downloadJSON(saved,'pokeca-resume-'+saved.matchId+'.json');toast('再開用JSONの書き出しを開始しました。端末のダウンロードを確認してください');}catch(error){toast('JSONを書き出せません：'+error.message);}}));
    const list=store?await store.list():[];
    for(const item of list){$('saved-matches').append(button(item.valid?`再開：TURN ${item.turnNumber} · ${item.status} · ${item.matchId}`:`破損・未対応の保存（保持中）：${item.matchId}`,async()=>{if(!await confirmAction('選んだ対戦の保存状態へ切り替えますか？'))return;try{const result=port.restoreSession(await store.read(item.matchId));if(!result.ok)throw Error(result.errors.join(' / '));selected=null;closeSheet();toast('保存した対戦を再開しました');if(view().turnPlayer==='ai'&&aiAutoMode)void runOpponentPracticeTurn();}catch(error){toast('再開できません：'+error.message);}},{disabled:!item.valid}));}
    $('resume-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>25*1024*1024)throw Error('ファイルが大きすぎます');const saved=JSON.parse(await file.text());if(!await confirmAction('再開用JSONの状態へ切り替えますか？'))return;const result=port.restoreSession(saved);if(!result.ok)throw Error(result.errors.join(' / '));selected=null;closeSheet();toast('再開用JSONを復元しました');}catch(error){toast('復元できません：'+error.message);}};
  }
  function saveSafely(){void saveSession().catch(error=>{toast('保存失敗：'+error.message+'。再開用JSONを書き出してください');});}
  async function protectBeforeNewMatch(){try{await saveSession(true);return true;}catch(error){toast('前の対戦を保存できないため切替を中止しました。再開用JSONを書き出してください：'+error.message);return false;}}
  let prizeDialogOpen=false;
  sheet.addEventListener('close',()=>{prizeDialogOpen=false;});
  function showPrizeChoice(){
    const state=view(),pending=state.pendingPrizeSelection;
    if(!pending||pending.playerId!=='you'||prizeDialogOpen)return;
    prizeDialogOpen=true;
    const p=state.players.find(x=>x.id==='you');
    const slots=p.prizeSlots||Array.from({length:p.prizeCount},(_,i)=>i);
    const chosen=new Set();
    openSheet('サイドを選ぶ',`<p>好きな位置から ${pending.count} 枚選んでください。中身は選択するまで見えません。</p><div id="prize-picks" class="discard-grid"></div><p id="prize-count"></p><div id="prize-submit"></div>`);
    const list=$('prize-picks'),counter=$('prize-count'),submit=$('prize-submit');
    const paint=()=>{
      list.innerHTML='';
      slots.forEach((id,i)=>{
        const b=document.createElement('button');b.className='discard-card';b.style.cssText='min-height:90px;cursor:pointer;'+(chosen.has(i)?'outline:3px solid #2b7653;':'');
        b.textContent=id?'サイド '+(i+1)+(chosen.has(i)?' ✓':''):'取得済み';b.disabled=!id;
        b.onclick=()=>{if(chosen.has(i))chosen.delete(i);else if(chosen.size<pending.count)chosen.add(i);paint();};
        list.appendChild(b);
      });
      counter.textContent=chosen.size+' / '+pending.count+'枚 選択中';
      submit.innerHTML='';
      const confirm=button('選んだサイドを手札に加える',()=>{
        const result=dispatch('you',{type:'take_prizes',slots:[...chosen]});
        if(result.ok){prizeDialogOpen=false;closeSheet();}
        else{const error=(result.errors||['サイドを取得できません']).join(' / ');counter.textContent='取得できません：'+error;}
      },{disabled:chosen.size!==pending.count});
      confirm.className='primary';confirm.style.cssText='width:100%;min-height:48px;font-weight:700;';submit.append(confirm);
    };
    paint();
  }
  function zoneMenu(owner,zone){const p=view().players.find(p=>p.id===owner);
    if(zone==='discard'){openSheet((owner==='you'?'自分':'相手')+'のトラッシュ',p.discard.length?`<p>${p.discard.length}枚 · カードを一覧表示</p><div class="discard-grid">${p.discard.map(c=>`<div class="discard-card" aria-label="${esc(c.name)}">${cardArt(c)}</div>`).join('')}</div>`:'<p>カードはありません</p>');return;}
    if(zone==='prize'){if(owner==='you'&&view().pendingPrizeSelection){prizeDialogOpen=false;showPrizeChoice();return;}openSheet('サイド',`<p>残り ${p.prizeCount}枚。サイド内容は非公開です。取得はエンジンのきぜつ処理に従います。</p>`);return;}
    openSheet((owner==='you'?'自分':'相手')+'の山札',`<p>${p.deckCount}枚 · 通常時の内容は非公開です。ワザの検索時に専用画面を開きます。</p><div id="deck-actions" class="menu-list"></div>`);
    if(owner==='you'&&view().mode==='practice')$('deck-actions').append(button('練習操作：シャッフル',()=>{dispatch('you',{type:'shuffle'});closeSheet();},{disabled:!port.canDispatch('you',{type:'shuffle'})}));
  }
  // A touch-end may open an overlay before Chrome emits its compatibility click.
  // Suppress only that follow-up click; a genuine new pointer-down clears the guard.
  document.addEventListener('pointerdown',()=>{if(Date.now()>=confirmTouchGuardUntil)suppressClick=0;},true);
  document.addEventListener('click',e=>{if(e.isTrusted&&e.detail>0&&Date.now()<suppressClick){e.preventDefault();e.stopImmediatePropagation();}},true);
  $('sheet-close').onclick=()=>closeSheet();
  $('history-open').onclick=history;
  function quickAction(kind){
    const state=view(),me=state.players.find(p=>p.id==='you');
    if(state.status!=='active'||state.turnPlayer!=='you'){toast('今は自分の操作ができません');return;}
    const mons=kind==='attack'?[me.active].filter(Boolean):[me.active,...me.bench].filter(Boolean);
    const actions=mons.flatMap(mon=>port.getPokemonActions('you',idOf(mon)).filter(o=>o.kind===kind).map(o=>({mon,option:o})));
    openSheet(kind==='attack'?'ワザを選ぶ':'特性を選ぶ','<p>使用する'+(kind==='attack'?'ワザ':'特性')+'を選んでください。使用できないものは灰色で表示します。</p><div id="quick-actions" class="menu-list"></div>');
    const list=$('quick-actions');
    if(!actions.length){list.textContent=kind==='attack'?'使えるワザが登録されていません':'手動で使う特性はありません';return;}
    for(const {mon,option} of actions){
      const label=(mon.name||'ポケモン')+' · '+option.label+(option.used?'（使用済み）':'');
      list.append(button(label,()=>resolveOption(option),{disabled:!option.enabled}));
      if(!option.enabled&&option.disabledReasons?.length)list.append(button('使用できない理由',()=>toast(option.disabledReasons.join(' / '))));
    }
  }
  $('attack-button').onclick=()=>quickAction('attack');
  $('ability-button').onclick=()=>quickAction('ability');
  $('draw-button').onclick=()=>dispatch('you',{type:'draw',count:1});
  // Opt-in AI practice: legal actions are selected from the existing AI Port,
  // never applied directly to Game State. Manual opponent control remains available.
  let aiAutoMode=true;
  let aiPracticeRunning=false;
  async function runOpponentPracticeTurn(){
    if(aiPracticeRunning)return;
    if(view().turnPlayer!=='ai'){toast('相手の番になってから実行してください');return;}
    aiPracticeRunning=true;
    render();
    try{
      const result=await Pokeca.runAITurn(port,'ai',{
        policy:({legalActions})=>{
          const candidates=legalActions.filter(action=>action.type!=='draw');
          return Pokeca.chooseBaseline({legalActions:candidates});
        }
      });
      if(result.ok){
        const recent=view().history.filter(e=>e.player==='ai'&&!['end_turn','draw'].includes(e.type)).slice(-1)[0];
        toast(recent?'相手：'+eventText(recent):'AIの番が終了しました');
      }
      else toast('AI停止：'+(result.errors||[result.stage]).join(' / '));
    }catch(error){toast('AI停止：'+error.message);}
    finally{aiPracticeRunning=false;render();}
  }
  $('end-turn').onclick=async()=>{if(Date.now()<confirmTouchGuardUntil)return;const s=view();if(s.turnPlayer==='ai'&&(aiAutoMode||aiPracticeRunning)){toast('相手AIの処理中です。手動で番を終了できません');return;}if(await confirmAction((s.turnPlayer==='you'?'自分':'相手')+'の番を終了しますか？')){
    const result=dispatch(s.turnPlayer,{type:'end_turn'});
    if(result.ok&&aiAutoMode&&s.turnPlayer==='you'&&view().turnPlayer==='ai'&&view().status==='active')void runOpponentPracticeTurn();
  }};
  $('stadium').onclick=()=>{if(selected&&dropOn($('stadium')))return;const stadiumCards=mine().hand.filter(c=>c.cardType==='STADIUM');openSheet('スタジアム',`<p>手札からスタジアムを選んで置けます。</p><div id="stadium-actions" class="menu-list"></div><div>${port.getStatusView().filter(s=>s.scope==='FIELD').map(effectRow).join('') || '<p>現在、場全体の効果はありません。</p>'}</div>`);const container=$('stadium-actions');for(const card of stadiumCards){const a={type:'play_stadium',cardId:idOf(card)},check=port.getActionExplanation('you',a);container.append(button(card.name+'を置く',()=>{const result=dispatch('you',a);if(result.ok)closeSheet();},{disabled:!check.ok}));if(!check.ok)container.append(button('置けない理由',()=>toast(check.errors.join(' / '))));}if(!stadiumCards.length)container.append(document.createTextNode('手札にスタジアムはありません'));};
  $('practice-info').onclick=()=>openSheet('この盤面について','<p>実証5件と操作練習を行うローカル盤面です。公式デッキではありません。実証カードのHPは仮設定です。</p><p>進化・どうぐ・宣言型特性は「練習」カードの明示データで確認できます。提供されていない公式カード効果は実装していません。</p><p>ドラッグはカードを上へ動かして開始します。横方向は手札スクロール、タップ後に緑の対象をタップしても同じ操作ができます。</p>');
  function setupRng(seed){let state=seed>>>0;return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};}
  async function chooseDemoOpening(){
    // Preview and final match share the exact shuffle sequence; no state is committed until confirmation.
    const seed=(Math.random()*4294967296)>>>0;
    const preview=Pokeca.createDemoMatch({rng:setupRng(seed),autoBenchBasics:false});
    if(!preview.ok)throw Error(preview.stage);
    const player=preview.game.players.find(p=>p.id==='you');
    const candidates=[player.active,...player.hand].filter(c=>c.kind==='pokemon'&&c.basic===true);
    if(!candidates.length)throw Error('初手にたねポケモンがありません');
    let activeId=null;
    const benchIds=new Set();
    openSheet('対戦準備：最初のポケモンを選ぶ','<p>最初の7枚からバトル場のたねを1匹選んでください。ベンチは0〜5匹、任意です。</p><div id="opening-choices" class="discard-grid"></div><p id="opening-status">バトル場：未選択 / ベンチ：0匹</p><button id="opening-start" class="primary" disabled>この配置で対戦開始</button>');
    const list=$('opening-choices'),start=$('opening-start'),status=$('opening-status');
    const paint=()=>{
      list.innerHTML='';
      for(const card of candidates){
        const b=document.createElement('button');
        b.className='discard-card';
        b.style.cssText='height:auto;min-height:150px;position:relative;padding:5px;cursor:pointer;'+(activeId===card.id?'outline:3px solid #c89c3a;':benchIds.has(card.id)?'outline:3px solid #2b7653;':'');
        b.innerHTML='<span class="opening-card-art">'+cardArt(card)+'</span><span class="opening-position">'+(activeId===card.id?'バトル場':benchIds.has(card.id)?'ベンチ':'未配置')+'</span>';
        b.onclick=()=>{
          if(activeId===null){activeId=card.id;}
          else if(activeId===card.id){activeId=null;}
          else if(benchIds.has(card.id)){benchIds.delete(card.id);}
          else if(benchIds.size<5){benchIds.add(card.id);}
          status.textContent='バトル場：'+(activeId?candidates.find(c=>c.id===activeId)?.name:'未選択')+' / ベンチ：'+benchIds.size+'匹';
          start.disabled=!activeId;
          paint();
        };
        list.appendChild(b);
      }
    };
    paint();
    start.onclick=async()=>{
      if(!activeId)return;
      try{
        const result=Pokeca.createDemoMatch({rng:setupRng(seed),autoBenchBasics:false,startingActive:{you:activeId},startingBench:{you:[...benchIds]}});
        if(!result.ok)throw Error(result.stage);
        if(!await protectBeforeNewMatch())return;
        const loaded=port.loadGame(result.game);
        if(!loaded.ok)throw Error(loaded.errors.join(' / '));
        selected=null;closeSheet();toast('対戦準備完了：選んだ配置で開始しました');
        if(view().turnPlayer==='ai'&&aiAutoMode)void runOpponentPracticeTurn();
      }catch(error){toast('対戦準備エラー：'+error.message);}
    };
  }
  $('demo-open').onclick=async()=>{
    if(!await confirmAction('架空カード60枚の対戦準備を開始します。最初のたねポケモンは自分で選びます。'))return;
    try{await chooseDemoOpening();}catch(error){toast('対戦準備を開始できません：'+error.message);}
  };
  $('menu-open').onclick=()=>{openSheet('プレイメニュー','<div class="menu-list" id="practice-menu"></div>');const list=$('practice-menu');
    list.append(button(animationsEnabled?'アニメーション：オン（タップでオフ）':'アニメーション：オフ（タップでオン）',()=>{animationsEnabled=!animationsEnabled;closeSheet();}));
    list.append(button('中断・再開／保存データ',savesMenu));
    list.append(button(aiAutoMode?'AI自動応答：オン（タップでオフ）':'AI自動応答：オフ（タップでオン）',()=>{
      aiAutoMode=!aiAutoMode;closeSheet();toast(aiAutoMode?'AI自動応答を有効にしました':'AI自動応答を無効にしました');
      if(aiAutoMode&&view().turnPlayer==='ai')void runOpponentPracticeTurn();
    }));
    list.append(button('相手AIの番を実行（練習版）',()=>{closeSheet();void runOpponentPracticeTurn();},{disabled:view().turnPlayer!=='ai'||aiPracticeRunning}));
    list.append(button('対戦準備から始める：架空カードのAI試験対戦',async()=>{
      if(!await confirmAction('架空カード60枚の対戦準備を開始します。最初のたねポケモンは自分で選びます。'))return;
      try{await chooseDemoOpening();}catch(error){toast('対戦準備を開始できません：'+error.message);}
    }));
    list.append(button('60枚デッキJSONで試験対戦開始',()=>{
      openSheet('60枚デッキの試験対戦',`<p>各カードに verified:true を持つ60枚JSONを入力できます。ただしJSONの自己申告フラグだけでは公式証跡を確認できません。この機能は試験用であり、公式デッキ・本番検証済みとは認定しません。固定2デッキ45種類の本番カード識別は未完了です。</p><label>自分のデッキJSON<input id="match-deck-you" type="file" accept="application/json,.json"></label><label>AIのデッキJSON<input id="match-deck-ai" type="file" accept="application/json,.json"></label><label>先攻プレイヤー<select id="match-first-player"><option value="you">自分が先攻</option><option value="ai">AIが先攻</option></select></label><label><input id="match-auto-bench" type="checkbox" checked> 試験用：初期手札のたねをベンチへ自動配置（最大5匹）</label><div class="menu-list"><button id="match-start-verified">検証して対戦開始</button></div>`);
      $('match-start-verified').onclick=async()=>{
        try{
          const read=async id=>{const file=$(id).files?.[0];if(!file)throw Error('自分とAIの両方のJSONを指定してください');if(file.size>1024*1024)throw Error('デッキJSONが大きすぎます');const data=JSON.parse(await file.text());return Array.isArray(data)?data:data.deck;};
          const you=await read('match-deck-you'),ai=await read('match-deck-ai');
          const result=Pokeca.createMatchFromVerifiedDecks({you,ai,maxOpeningAttempts:100,firstPlayer:$('match-first-player').value,autoBenchBasics:$('match-auto-bench').checked});
          if(!result.ok)throw Error('初期手札にたねポケモンが出ませんでした。'+result.stage);
          if(!await confirmAction('自己申告JSONによる試験対戦を開始しますか？ 公式カードの検証済み判定ではありません。現在の対戦は自動保存されます。'))return;
          if(!await protectBeforeNewMatch())return;const loaded=port.loadGame(result.game);if(!loaded.ok)throw Error(loaded.errors.join(' / '));
          selected=null;closeSheet();toast('60枚JSONによる試験対戦を開始しました');
          if(view().turnPlayer==='ai'&&aiAutoMode)void runOpponentPracticeTurn();
        }catch(error){toast('対戦開始不可：'+error.message);}
      };
    }));
    list.append(button('デッキコード取り込み基盤について',()=>openSheet('Deck Import Adapter','<p>公式取得仕様が未確認のため、取得Providerは未設定です。公式ID対応と60枚検証を行う境界だけを用意しています。未確認の取得やカード生成は行いません。</p>')));
    Pokeca.listPracticeScenarios().forEach(({index,label})=>list.append(button(label+'の実証を準備',async()=>{if(await confirmAction('現在の対戦を保存して、新しい実証盤面を準備します。保存失敗時は先に再開用JSONを書き出してください。')){if(!await protectBeforeNewMatch())return;closeSheet();selected=null;clearGesture();const result=port.loadGame(Pokeca.createPracticeGame(index));if(result.ok)toast(`実証${index+1}：${label}を準備しました`);else toast(result.errors.join(' / '));}})));
  };
  port=Pokeca.createUIPort({getGame:()=>game,setGame:next=>{game=next;},onChange:change=>{if(change.reason!=='action'){selected=null;clearGesture();closeSheet();}render();},onSessionChange:()=>{void saveSession().catch(error=>toast('保存失敗：'+error.message+'。再開用JSONを書き出してください'));}});
  window.PokecaMobile={port,metrics,dispatch,setAnimationsEnabled:enabled=>{animationsEnabled=!!enabled;},cancelAnimations:()=>{document.getAnimations().forEach(a=>a.cancel());},render};
  let restored=false,recoveryWarning='';
  await (async()=>{
  try{store=PokecaStorage.createIndexedMatchStore(window.localStorage);const saves=await store.list();if(saves.length){const valid=saves.filter(entry=>entry.valid);if(!valid.length)throw Error('保存データを確認できません（既存データは削除しません）');let failures=[];for(const entry of valid){try{const result=port.restoreSession(await store.read(entry.matchId));if(!result.ok)throw Error(result.errors.join(' / '));restored=true;break;}catch(error){failures.push(entry.matchId+': '+String(error?.message||error));}}if(!restored)throw Error('保存データの再開に失敗：'+failures.join(' / '));}}
  catch(error){recoveryWarning=error.message;storageUnavailable=true;}
  if(!restored){const loaded=port.loadGame(game);if(!loaded.ok)toast(loaded.errors.join(' / '));}
  persistenceReady=true;
  if(restored&&aiAutoMode&&view().turnPlayer==='ai'&&view().status==='active')void runOpponentPracticeTurn();
  if(recoveryWarning){$('save-status').textContent=storageUnavailable?'端末保存不可・JSON書出し':'保存の確認が必要';$('save-status').classList.add('save-error');toast('自動再開できませんでした：'+recoveryWarning+'。必要なら再開用JSONを書き出してください');}
  else{saveSafely();if(restored)toast('前回の対戦を再開しました');}
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveSafely();});
  window.addEventListener('pagehide',saveSafely);
  })();
})();
