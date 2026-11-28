'use strict';
// Exact print text patterns only. Unrecognized text remains explicitly unconnected.
const norm=s=>String(s||'').replace(/\s+/g,'');
const definitions=[
 ['DASH','このポケモンがバトル場にいるなら、自分の番に1回使える。自分の山札を2枚引く。この特性は別の「おつかいダッシュ」を使った番は使えない。',['DRAW']],
 ['SKYLINE','このポケモンがいるかぎり、自分のたねポケモン全員のにげるためのエネルギーは、すべてなくなる。',['MODIFY_RETREAT_COST']],
 ['FAIRY_ZONE','このポケモンがいるかぎり、相手の場の竜ポケモン全員の弱点は、すべて超タイプになる。［弱点は「×2」で計算する。］',['ADD_STATE']],
 ['ADRENA_BRAIN','このポケモンに悪エネルギーがついているなら、自分の番に1回使える。自分の場のポケモン1匹にのっているダメカンを3個まで選び、相手の場のポケモン1匹にのせ替える。',['MOVE_DAMAGE_COUNTERS']],
 ['MEOWTH_ENTRY','自分の番に、このカードを手札からベンチに出したとき、1回使える。自分の山札からサポートを1枚選び、相手に見せて、手札に加える。そして山札を切る。この番、名前に「おくのて」とつく特性を使っていたなら、この特性は使えない。',['SEARCH_DECK','REVEAL','ADD_TO_HAND','SHUFFLE_DECK']],
 ['EXCITE_DIVE','自分の番に、このカードが手札にあり、自分の場に[無色]タイプの「メガシンカex」がいるなら、1回使える。このカードをベンチに出す。',['ABILITY_TRIGGER','BENCH_FROM_ZONE']],
 ['TOP_SUPPORTER_SEARCH','自分の山札を上から7枚見て、その中からサポートを1枚選び、相手に見せて、手札に加える。残りのカードは山札にもどして切る。',['SEARCH_DECK','REVEAL','ADD_TO_HAND','RETURN_TO_DECK','SHUFFLE_DECK']],
 ['RECON','自分の番に1回使える。自分の山札を上から2枚見て、どちらか1枚を選び、手札に加える。残りのカードは、山札の下にもどす。',['SEARCH_DECK','ADD_TO_HAND','RETURN_TO_DECK']],
 ['REVERSAL_DRAW','前の相手の番に、自分のポケモンがきぜつしていたなら、自分の番に1回使える。自分の山札を3枚引く。この番、すでに別の「さかてにとる」を使っていたなら、この特性は使えない。',['DRAW']],
 ['RUN_AWAY_DRAW','自分の番に1回使える。自分の山札を3枚引く。その後、このポケモンと、ついているすべてのカードを、山札にもどして切る。',['DRAW','RETURN_TO_DECK','SHUFFLE_DECK']],
 ['COMBO','ウラが出るまでコインを投げ、オモテの数×50ダメージ追加。',['COIN_FLIP','DAMAGE']],
 ['NO_NEXT_ATTACK','次の自分の番、このポケモンはワザが使えない。',['DAMAGE','ADD_STATE']],
 ['MOON_RONDO','おたがいのベンチポケモンの数×20ダメージ追加。',['DAMAGE']],
 ['CONFUSION','相手のバトルポケモンをこんらんにする。',['DAMAGE','STATUS_CONDITION']],
 ['BENCH_COUNTER_DAMAGE','相手のベンチポケモン1匹に、そのポケモンにのっているダメカンの数×20ダメージ。［ベンチは弱点・抵抗力を計算しない。］',['DAMAGE']],
 ['BENCH_EX_DAMAGE','相手のベンチの「ポケモンex・V」1匹に、60ダメージ。［ベンチは弱点・抵抗力を計算しない。］',['DAMAGE']],
 ['RETURN_SELF_HAND','このポケモンと、ついているすべてのカードを、手札にもどす。',['DAMAGE','RETURN_TO_HAND']],
 ['HUNT','のぞむなら、自分の山札から好きなカードを2枚まで選び、手札に加える。そして山札を切る。',['DAMAGE','SEARCH_DECK','ADD_TO_HAND','SHUFFLE_DECK']],
 ['PHANTOM','ダメカン6個を、相手のベンチポケモンに好きなようにのせる。',['DAMAGE','PLACE_DAMAGE_COUNTERS']],
 ['ITEM_LOCK','次の相手の番、相手は手札からグッズを出して使えない。',['DAMAGE','ADD_STATE']],
 ['ANY_DAMAGE','相手のポケモン1匹に、100ダメージ。［ベンチは弱点・抵抗力を計算しない。］',['DAMAGE']],
 ['ANY_DAMAGE','相手のポケモン1匹に、100ダメージ。ベンチは弱点・抵抗力を計算しない。',['DAMAGE']],
 ['SWITCH_SELF_ATTACK','このポケモンをベンチポケモンと入れ替える。',['SWITCH']],
 ['ACTIVE_AND_BENCH_DAMAGE','相手のベンチポケモン1匹にも、20ダメージ。［ベンチは弱点・抵抗力を計算しない。］',['DAMAGE']],
 ['ATTACK_DAMAGE_MOVE_ENERGY','このポケモンについているエネルギーを1個選び、ベンチポケモンにつけ替える。',['DAMAGE','MOVE_ENERGY']],
 ['DECK_ENERGY_TO_GRASS_BENCH','自分の山札からエネルギーを1枚選び、ベンチの草ポケモンにつける。そして山札を切る。',['ATTACH_ENERGY','SHUFFLE_DECK']],
 ['BENCH_NON_RULE_PROTECTION','このポケモンがいるかぎり、自分のベンチポケモン（「ルールを持つポケモン」をのぞく）全員は、相手のワザのダメージを受けない。',['PREVENT_DAMAGE']],
 ['EX_COUNT_DAMAGE','相手の場の「ポケモンex」の数×60ダメージ。',['DAMAGE']],
 ['IGNORE_DEFENDER_EFFECTS','このワザのダメージは、相手のバトルポケモンにかかっている効果を計算しない。',['DAMAGE']],
 ['COIN_PROTECT','コインを1回投げオモテなら、次の相手の番、このポケモンはワザのダメージや効果を受けない。',['DAMAGE','COIN_FLIP','ADD_STATE']],
 ['ULTRA_BALL','このカードは、自分の手札を2枚トラッシュしなければ使えない。自分の山札からポケモンを1枚選び、相手に見せて、手札に加える。そして山札を切る。',['DISCARD','SEARCH_DECK','REVEAL','ADD_TO_HAND','SHUFFLE_DECK']],
 ['STRETCHER','自分のトラッシュからポケモンまたは基本エネルギーを1枚選び、相手に見せて、手札に加える。',['REVEAL','ADD_TO_HAND']],
 ['ENERGY_SWITCH','自分の場のポケモンについている基本エネルギーを1個選び、自分の別のポケモンにつけ替える。',['MOVE_ENERGY']],
 ['SWITCH','自分のバトルポケモンをベンチポケモンと入れ替える。',['SWITCH']],
 ['RED_CARD','このカードは、相手のサイドの残り枚数が3枚以下のときにしか使えない。相手は相手自身の手札をすべてウラにして切り、山札の下にもどす。その後、相手は山札を3枚引く。',['RETURN_TO_DECK','DRAW']],
 ['REPELLENT','相手のバトルポケモンをベンチポケモンと入れ替える。［バトル場に出すポケモンは相手が選ぶ。］',['FORCE_SWITCH']],
 ['AKAMATSU','自分の山札から、それぞれちがうタイプの基本エネルギーを2枚まで選び、相手に見せて、どちらか1枚を手札に加え、残りのエネルギーを自分のポケモンにつける。そして山札を切る。',['SEARCH_DECK','REVEAL','ADD_TO_HAND','ATTACH_ENERGY','SHUFFLE_DECK']],
 ['CYRANO','自分の山札から「ポケモンex」を3枚まで選び、相手に見せて、手札に加える。そして山札を切る。',['SEARCH_DECK','REVEAL','ADD_TO_HAND','SHUFFLE_DECK']],
 ['HILDA','自分の山札から進化ポケモンとエネルギーを1枚ずつ選び、相手に見せて、手札に加える。そして山札を切る。',['SEARCH_DECK','REVEAL','ADD_TO_HAND','SHUFFLE_DECK']],
 ['BOSS','相手のベンチポケモンを1匹選び、バトルポケモンと入れ替える。',['FORCE_SWITCH']],
 ['LILLIE','自分の手札をすべて山札にもどして切る。その後、山札を6枚引く。自分のサイドの残り枚数が6枚なら、引く枚数は8枚になる。',['RETURN_TO_DECK','SHUFFLE_DECK','DRAW']],
 ['JUDGE','おたがいのプレイヤーは、それぞれ手札をすべて山札にもどして切る。その後、それぞれ山札を4枚引く。',['RETURN_TO_DECK','SHUFFLE_DECK','DRAW']],
 ['BROCK','自分の山札からたねポケモンを2枚まで、または進化ポケモンを1枚選び、相手に見せて、手札に加える。そして山札を切る。',['SEARCH_DECK','REVEAL','ADD_TO_HAND','SHUFFLE_DECK']],
 ['CIRCULATOR','このカードをつけているポケモンが、バトル場で相手のポケモンからワザのダメージを受けたとき、ワザを使ったポケモンについているエネルギーを1個選び、相手のベンチポケモンにつけ替える。',['ABILITY_TRIGGER','MOVE_ENERGY']],
 ['HERO_CAPE','このカードをつけているポケモンの最大HPは「＋100」される。',['MODIFY_MAX_HP']],
 ['WATCHTOWER','おたがいの場の[無色]ポケモン全員の特性は、すべてなくなる。',['ADD_STATE']],
 ['NIGHT_MINE','おたがいの場の「テラスタル」のポケモン全員は、ワザを使うためのエネルギーが、それぞれ[無色]エネルギー1個ぶん多くなる。',['ADD_STATE']],
 ['RUINS','おたがいのプレイヤーは、それぞれ、自分の番に、たねポケモン（[悪]ポケモンをのぞく）をベンチに出すたび、そのポケモンにダメカンを2個のせる。',['PLACE_DAMAGE_COUNTERS']],
 ['ROCKET_ENERGY','このカードは「ロケット団のポケモン」にしかつけられず、「ロケット団のポケモン」以外についているなら、トラッシュする。このカードは、ポケモンについているかぎり、[超][悪]の2つのタイプのエネルギー2個ぶんとしてはたらく。',['ATTACH_ENERGY','DISCARD']],
 ['IGNITION','ポケモンについているこのカードは、自分の番の終わりにトラッシュする。このカードは、ポケモンについているかぎり、[無色]エネルギー1個ぶんとしてはたらく。進化ポケモンについているなら、[無色]エネルギー3個ぶんとしてはたらく。',['ATTACH_ENERGY','DISCARD']],
 ['POFFIN','自分の山札から、HPが「70」以下のたねポケモンを2枚まで選び、ベンチに出す。そして山札を切る。',['SEARCH_DECK','BENCH_FROM_ZONE','SHUFFLE_DECK']],
 ['HAMMER','コインを1回投げオモテなら、相手の場のポケモンについているエネルギーを1個選び、トラッシュする。',['COIN_FLIP','DISCARD']],
 ['POKEPAD','自分の山札からポケモン（「ルールを持つポケモン」をのぞく）を1枚選び、相手に見せて、手札に加える。そして山札を切る。',['SEARCH_DECK','REVEAL','ADD_TO_HAND','SHUFFLE_DECK']],
 ['UNFAIR','このカードは、前の相手の番に、自分のポケモンがきぜつしていなければ使えない。おたがいのプレイヤーは、それぞれ手札をすべて山札にもどして切る。その後、自分は5枚、相手は2枚、山札を引く。',['RETURN_TO_DECK','SHUFFLE_DECK','DRAW']],
 ['ROSA','このカードは、自分のサイドの残り枚数が、相手のサイドの残り枚数より多いときにしか使えない。自分のトラッシュから基本エネルギーを2枚まで選び、自分の2進化ポケモン1匹につける。',['ATTACH_ENERGY']],
 ['JAMMING','おたがいのポケモン全員についている「ポケモンのどうぐ」の効果は、すべてなくなる。',['ADD_STATE']]
];
const byText=new Map(definitions.map(([mechanic,text,commands])=>[norm(text),{mechanic,commands}]));
function mainText(text){return norm(text).split(/グッズは、自分の番に|サポートは、自分の番に|ポケモンのどうぐは、自分の番に|スタジアムは、自分の番に/)[0];}
const ijMainPlans=new Map([
 ['supporter:自分のポケモン1匹のHPを「60」回復し、特殊状態もすべて回復する。',{mechanic:'HEAL_AND_CLEAR_STATUS',commands:['HEAL','STATUS_CONDITION'],amount:60}],
 ['item:自分の山札を上から2枚トラッシュする。',{mechanic:'DISCARD_DECK_TOP',commands:['DISCARD'],amount:2}],
 ['item:自分のトラッシュから基本エネルギーを5枚まで選び、相手に見せて、山札にもどして切る。',{mechanic:'RECYCLE_BASIC_ENERGY',commands:['REVEAL','RETURN_TO_DECK','SHUFFLE_DECK'],amount:5}],
 ['item:自分の山札から「メガシンカex」を1枚選び、相手に見せて、手札に加える。そして山札を切る。',{mechanic:'SEARCH_MEGA_EVOLUTION_EX',commands:['SEARCH_DECK','REVEAL','ADD_TO_HAND','SHUFFLE_DECK']}]
]);
const ijMechanics=new Set([...ijMainPlans.values()].map(plan=>plan.mechanic));
function additionalAttackPlan(entry,text){
 const printed=String(entry.damage).normalize('NFKC');
 const base=/^\d{1,3}\+?$/.test(printed)?Number.parseInt(printed,10):null;
 // Fixed-count coin outcomes use one deterministic match-owned stream.
 const coinPlan=(flips,base,extra={})=>({mechanic:'MASS_COIN_OUTCOME',commands:['COIN_FLIP','DAMAGE',...(extra.status?['STATUS_CONDITION']:[]),...(extra.heal?['HEAL']:[]),...(extra.mill?['DISCARD']:[]),...(extra.lock||extra.protect?['ADD_STATE']:[])],flips,base,...extra,sharedWording:true});
 const coinStatus=text.match(/^コインを([1-9])回投げ、オモテの数×([1-9]\d{0,2})ダメージ。(1回でもオモテ|オモテが([1-9])回以上|すべてウラ)なら、相手のバトルポケモンを(マヒ|こんらん|やけど|ねむり|どく)にする。$/);
 const statusMap={'マヒ':'PARALYZED','こんらん':'CONFUSED','やけど':'BURNED','ねむり':'ASLEEP','どく':'POISONED'};
 if(coinStatus&&printed===coinStatus[2]+'×'&&Number(coinStatus[4]||1)<=Number(coinStatus[1]))
  return coinPlan(Number(coinStatus[1]),0,{unit:Number(coinStatus[2]),status:statusMap[coinStatus[5]],when:coinStatus[3]==='すべてウラ'?'none':'threshold',threshold:Number(coinStatus[4]||1)});
 const tierCoin=text.match(/^コインを3回投げる。オモテが1回なら、([1-9]\d{0,2})ダメージ追加。オモテが2回なら、([1-9]\d{0,2})ダメージ追加。すべてオモテなら、([1-9]\d{0,2})ダメージ追加。$/);
 if(tierCoin&&base!==null&&printed.endsWith('+'))
  return {mechanic:'MASS_COUNT_COIN_DAMAGE',commands:['COIN_FLIP','DAMAGE'],metric:'fixed',flips:3,base,bonuses:[0,...tierCoin.slice(1).map(Number)],sharedWording:true};
 const typedBoardCoin=text.match(/^自分の場の\[([草炎水雷超闘悪鋼竜無色])\]ポケモンの数ぶんコインを投げ、オモテの数×([1-9]\d{0,2})ダメージ。$/);
 if(typedBoardCoin&&printed===typedBoardCoin[2]+'×')
  return {mechanic:'MASS_COUNT_COIN_DAMAGE',commands:['COIN_FLIP','DAMAGE'],metric:'ownTypedBoard',type:typedBoardCoin[1],unit:Number(typedBoardCoin[2]),base:0,sharedWording:true};
 const typedEnergyCoin=text.match(/^このポケモンについている\[([草炎水雷超闘悪鋼])\]エネルギーの数ぶんコインを投げ、オモテの数×([1-9]\d{0,2})ダメージ。$/);
 if(typedEnergyCoin&&printed===typedEnergyCoin[2]+'×')
  return {mechanic:'MASS_COUNT_COIN_DAMAGE',commands:['COIN_FLIP','DAMAGE'],metric:'ownTypedEnergy',type:typedEnergyCoin[1],unit:Number(typedEnergyCoin[2]),base:0,sharedWording:true};
 const bothEnergyCoin=text.match(/^おたがいのバトルポケモンについているエネルギーの数ぶんコインを投げ、オモテの数×([1-9]\d{0,2})ダメージ。$/);
 if(bothEnergyCoin&&printed===bothEnergyCoin[1]+'×')
  return {mechanic:'MASS_COUNT_COIN_DAMAGE',commands:['COIN_FLIP','DAMAGE'],metric:'bothActiveEnergy',unit:Number(bothEnergyCoin[1]),base:0,sharedWording:true};
 const opponentTails=text.match(/^相手は相手自身のベンチポケモンの数ぶんコインを投げる。相手のバトルポケモンに、ウラの数×([1-9]\d{0,2})ダメージ。このワザのダメージは弱点・抵抗力を計算しない。$/);
 if(opponentTails&&printed===opponentTails[1]+'×')
  return {mechanic:'MASS_COUNT_COIN_DAMAGE',commands:['COIN_FLIP','DAMAGE'],metric:'opponentBench',unit:Number(opponentTails[1]),base:0,tails:true,skipWeakness:true,skipResistance:true,sharedWording:true};
 const energyCoin=text.match(/^このポケモンについているエネルギーの数ぶんコインを投げ、オモテの数×([1-9]\d{0,2})ダメージ。$/);
 if(energyCoin&&printed===energyCoin[1]+'×')
  return {mechanic:'ATTACK_ATTACHED_ENERGY_COINS',commands:['COIN_FLIP','DAMAGE'],unit:Number(energyCoin[1])};
 const singleStatus=text.match(/^コインを1回投げ、?オモテなら、相手のバトルポケモンを(やけど|こんらん|ねむり|どく)にする。$/);
 if(singleStatus&&/^\d+$/.test(printed))return coinPlan(1,base,{status:statusMap[singleStatus[1]],when:'all'});
 const recoil=text.match(/^コインを([1-9])回投げ、?(?:すべて)?ウラなら、このポケモンにも([1-9]\d{0,2})ダメージ。$/);
 if(recoil&&/^\d+$/.test(printed)&&(Number(recoil[1])===1||text.includes('すべてウラ')))return coinPlan(Number(recoil[1]),base,{recoil:Number(recoil[2]),when:'none'});
 if(/^\d+$/.test(printed)&&text==='コインを1回投げウラなら、次の自分の番、このポケモンはワザが使えない。')return coinPlan(1,base,{lock:'selfAttack',when:'none'});
 const lock=text.match(/^コインを1回投げオモテなら、次の相手の番、このワザを受けたポケモンは、(ワザが使えない|にげられない)。$/);
 if(lock&&/^\d+$/.test(printed))return coinPlan(1,base,{lock:lock[1]==='にげられない'?'opponentRetreat':'opponentAttack',when:'all'});
 if(/^\d+$/.test(printed)&&text==='コインを1回投げウラなら、このワザは失敗。オモテなら、次の相手の番、このポケモンはワザのダメージや効果を受けない。')return coinPlan(1,base,{failOnTails:true,protect:true,when:'all'});
 const healBonus=text.match(/^コインを1回投げオモテなら、([1-9]\d{0,2})ダメージ追加し、このポケモンのHPを「([1-9]\d{0,2})」回復する。$/);
 if(healBonus&&base!==null&&printed.endsWith('+'))return coinPlan(1,base,{bonus:Number(healBonus[1]),heal:Number(healBonus[2]),when:'all'});
 if(/^\d+$/.test(printed)&&text==='ウラが出るまでコインを投げ、オモテの数ぶん、相手の山札を上からトラッシュする。')
  return {mechanic:'COIN_UNTIL_TAILS_MILL',commands:['COIN_FLIP','DAMAGE','DISCARD'],base,sharedWording:true};
 const mill=text.match(/^コインを([1-9])回投げ、オモテの数ぶん、相手の山札を上からトラッシュする。$/);
 if(mill&&/^\d+$/.test(printed))return coinPlan(Number(mill[1]),base,{mill:true,when:'threshold',threshold:1});
 const allBonus=text.match(/^コインを([2-9])回投げ、すべてオモテなら、([1-9]\d{0,2})ダメージ追加。$/);
 if(allBonus&&base!==null&&printed.endsWith('+'))return coinPlan(Number(allBonus[1]),base,{bonus:Number(allBonus[2]),when:'all'});
 const discardBasic=text.match(/^自分の場のポケモンについている基本エネルギーを好きなだけトラッシュし、その枚数×([1-9]\d{0,2})ダメージ。$/);
 if(discardBasic&&printed===discardBasic[1]+'×')
  return {mechanic:'ATTACK_DISCARD_FIELD_BASIC',commands:['DISCARD','DAMAGE'],unit:Number(discardBasic[1])};
 const additionalFlips=text.match(/^コインを([1-9]\d?)回投げ、オモテの数×([1-9]\d{0,2})ダメージ追加。$/);
 if(additionalFlips&&base!==null&&printed.endsWith('+'))
  return {mechanic:'FIXED_COIN_HITS',commands:['COIN_FLIP','DAMAGE'],flips:Number(additionalFlips[1]),unit:Number(additionalFlips[2]),base};
 const conditional=text.match(/^(相手のバトルポケモンが「ポケモンex」なら|相手のバトルポケモンが「ポケモンex・V」なら|相手のバトルポケモンが進化ポケモンなら|相手のバトルポケモンにダメカンがのっているなら|自分のベンチポケモンにダメカンがのっているなら)、([1-9]\d{0,2})ダメージ追加。$/);
 if(conditional&&base!==null&&printed.endsWith('+')){
  const predicates={
   '相手のバトルポケモンが「ポケモンex」なら':'opponentEx',
   '相手のバトルポケモンが「ポケモンex・V」なら':'opponentExOrV',
   '相手のバトルポケモンが進化ポケモンなら':'opponentEvolved',
   '相手のバトルポケモンにダメカンがのっているなら':'opponentDamaged',
   '自分のベンチポケモンにダメカンがのっているなら':'ownBenchDamaged'
  };
  return {mechanic:'CONDITIONAL_ATTACK_BONUS',commands:['DAMAGE'],predicate:predicates[conditional[1]],base,bonus:Number(conditional[2])};
 }
 const specific=text.match(/^(相手のバトルポケモンがどくなら|このポケモンがどくなら|このポケモンにダメカンがのっているなら|このポケモンに「ポケモンのどうぐ」がついているなら|相手のバトルポケモンに「ポケモンのどうぐ」がついているなら|自分のサイドの残り枚数が、相手のサイドの残り枚数より多いなら)、([1-9]\d{0,2})ダメージ追加。$/);
 if(specific&&base!==null&&printed.endsWith('+')){
  const predicates={
   '相手のバトルポケモンがどくなら':'opponentPoisoned','このポケモンがどくなら':'ownPoisoned',
   'このポケモンにダメカンがのっているなら':'ownDamaged',
   'このポケモンに「ポケモンのどうぐ」がついているなら':'ownTool',
   '相手のバトルポケモンに「ポケモンのどうぐ」がついているなら':'opponentTool',
   '自分のサイドの残り枚数が、相手のサイドの残り枚数より多いなら':'ownMorePrizes'
  };
  return {mechanic:'CONTEXT_ATTACK_BONUS',commands:['DAMAGE'],predicate:predicates[specific[1]],base,bonus:Number(specific[2])};
 }
 const context=text.match(/^(相手のサイドの残り枚数が([1-6])枚以下なら|相手の手札が([1-9]\d?)枚以下なら|相手のバトルポケモンが([12])進化ポケモンなら|このワザを使うためのエネルギーより、([1-6])個多くエネルギーがついているなら|このポケモンに\[(草|炎|水|雷|超|闘|悪|鋼)\]エネルギーがついているなら)、([1-9]\d{0,2})ダメージ追加。$/);
 if(context&&base!==null&&printed.endsWith('+')){
  const [, ,prizes,hand,stage,extraEnergy,type,bonus]=context;
  const predicate=prizes?'opponentPrizes':hand?'opponentHand':stage?'opponentStage':extraEnergy?'extraEnergy':'ownEnergyType';
  return {mechanic:'CONTEXT_ATTACK_BONUS',commands:['DAMAGE'],predicate,base,bonus:Number(bonus),
   ...(type?{type}:{threshold:Number(prizes||hand||stage||extraEnergy)})};
 }
 if(base>0&&/^\d+$/.test(printed)){
  const guard=text.match(/^(.+)、このワザは失敗。(?:(このワザのダメージは、?弱点・抵抗力を計算しない。))?$/);
  if(guard){
   const patterns=[
    ['opponentEx',/^相手のバトルポケモンが「ポケモンex」でないなら$/],
    ['ownBenchedNames',/^自分のベンチに((?:「[^「」]{1,40}」){1,5})がいないなら$/,'names'],
    ['opponentDamaged',/^相手のバトルポケモンにダメカンがのっていないなら$/],
    ['opponentStatus',/^相手のバトルポケモンが(やけど|こんらん|どく|ねむり|マヒ)でないなら$/,'status'],
    ['opponentPrizeCounts',/^相手のサイドの残り枚数が((?:[1-6]枚・){0,5}[1-6]枚)でないなら$/,'prizes'],
    ['handCountsEqual',/^自分の手札と相手の手札が同じ枚数でないなら$/],
    ['ownHandCount',/^自分の手札が([1-9]\d?)枚でないなら$/,'threshold']
   ];
   for(const [predicate,pattern,key] of patterns){
    const match=guard[1].match(pattern);
    if(!match)continue;
    const value=key==='names'?Array.from(match[1].matchAll(/「([^「」]+)」/g),name=>name[1]):
      key==='prizes'?match[1].split('・').map(s=>Number(s[0])):key==='threshold'?Number(match[1]):key==='status'?statusMap[match[1]]:null;
    return {mechanic:'ATTACK_GUARDED_DAMAGE',commands:['DAMAGE'],predicate,...(key?{[key]:value}:{}),
     ...(guard[2]?{skipWeakness:true,skipResistance:true}:{}),sharedWording:true};
   }
  }
  if(text==='場に出ているスタジアムをトラッシュする。トラッシュできないなら、このワザは失敗。')
   return {mechanic:'ATTACK_GUARDED_DAMAGE',commands:['DISCARD','DAMAGE'],predicate:'stadium',discardStadium:true,sharedWording:true};
 }
 const stadiumBonus=text.match(/^場にスタジアムが出ているなら、([1-9]\d{0,2})ダメージ追加。その後、そのスタジアムをトラッシュする。$/);
 if(stadiumBonus&&base!==null&&printed.endsWith('+'))
  return {mechanic:'MASS_BOARD_BONUS',commands:['DAMAGE','DISCARD'],predicate:'stadiumPresent',discardStadium:true,base,bonus:Number(stadiumBonus[1]),sharedWording:true};
 const optionalStadium=text.match(/^のぞむなら、場に出ているスタジアムをトラッシュする。その場合、([1-9]\d{0,2})ダメージ追加。$/);
 if(optionalStadium&&base!==null&&printed.endsWith('+'))
  return {mechanic:'MASS_BOARD_BONUS',commands:['DISCARD','DAMAGE'],predicate:'stadiumPresent',discardStadium:true,optional:true,base,bonus:Number(optionalStadium[1]),sharedWording:true};
 const recoilBonus=text.match(/^のぞむなら、([1-9]\d{0,2})ダメージ追加。その場合、このポケモンにも([1-9]\d{0,2})ダメージ。$/);
 if(recoilBonus&&base!==null&&printed.endsWith('+'))
  return {mechanic:'ATTACK_OPTIONAL_RECOIL_BONUS',commands:['DAMAGE'],base,bonus:Number(recoilBonus[1]),recoil:Number(recoilBonus[2])};
 // Exact printed board predicates. Unknown clauses never fall back to damage only.
 if(base!==null&&printed.endsWith('+')){
  const boardBonus=text.match(/^(.+)、([1-9]\d{0,2})ダメージ追加。$/);
  if(boardBonus){
   const clause=boardBonus[1],bonus=Number(boardBonus[2]);
   const patterns=[
    ['healedThisTurn',/^この番に?、このポケモンのHPを回復していたなら$/],
    ['evolvedFromThisTurn',/^この番に?、このポケモンが「([^「」]{1,40})」から進化していたなら$/,'name'],
    ['becameActive',/^この番に?、このポケモンがベンチからバトル場に出ていたなら$/],
    ['sharedFieldType',/^自分の場に、相手の場のポケモンと同じタイプのポケモンがいるなら$/],
    ['ownNamedEnergy',/^このポケモンに「([^「」]{1,40}エネルギー)」がついているなら$/,'name'],
    ['ownHandEmpty',/^自分の手札が1枚もないなら$/],
    ['ownPrizesExact',/^自分のサイドの残り枚数が([1-6])枚なら$/,'threshold'],
    ['opponentPrizesExact',/^相手のサイドの残り枚数が([1-6])枚なら$/,'threshold'],
    ['ownDeckAtMost',/^自分の山札の残り枚数が([1-9]\d?)枚以下なら$/,'threshold'],
    ['allDamagedBench',/^自分のベンチポケモン全員にダメカンがのっているなら$/],
    ['ownBenchNamed',/^自分のベンチに「([^「」]{1,40})」がいるなら$/,'name'],
    ['ownBenchContains',/^自分のベンチに、名前に「([^「」]{1,40})」とつくポケモンがいるなら$/,'name'],
    ['ownStadium',/^場に自分のスタジアムが出ているなら$/],
    ['stadiumContains',/^名前に「([^「」]{1,40})」とつくスタジアムが場に出ているなら$/,'name'],
    ['opponentType',/^相手のバトルポケモンが\[([草炎水雷超闘悪鋼竜無色])\]ポケモンなら$/,'type'],
    ['opponentResistance',/^相手のバトルポケモンの抵抗力が\[([草炎水雷超闘悪鋼竜無色])\]タイプなら$/,'type'],
    ['opponentTera',/^相手のバトルポケモンが「テラスタル」のポケモンなら$/],
    ['ownSpecialEnergy',/^このポケモンに特殊エネルギーがついているなら$/]
   ];
   for(const [predicate,regex,key] of patterns){
    const match=clause.match(regex);
    if(match)return {mechanic:'MASS_BOARD_BONUS',commands:['DAMAGE'],predicate,base,bonus,...(key?{[key]:key==='threshold'?Number(match[1]):match[1]}:{}),sharedWording:true};
   }
  }
 }
 const handTrainers=text.match(/^相手の手札を見て、その中にあるトレーナーズの枚数×([1-9]\d{0,2})ダメージ。$/);
 if(handTrainers&&printed===handTrainers[1]+'×')
  return {mechanic:'SCALED_ATTACK_DAMAGE',commands:['REVEAL','DAMAGE'],metric:'opponentHandTrainerCount',type:null,unit:Number(handTrainers[1]),base:0,sharedWording:true};
 const basicMove=text.match(/^このポケモンについている基本エネルギーを1個選び、ベンチポケモンにつけ替える。$/);
 if(basicMove&&/^\d+$/.test(printed))
  return {mechanic:'ATTACK_BASIC_ENERGY_MOVE',commands:['DAMAGE','MOVE_ENERGY'],sharedWording:true};
 // A strict compositional grammar: mill scope, physical-card filter and printed multiplier.
 const millCount=text.match(/^(自分の山札を上から([1-9]\d?)枚|おたがいの山札を上から1枚ずつ)トラッシュし、その中にある(エネルギー|トレーナーズ|「基本\[([草炎水雷超闘悪鋼])\]エネルギー」|「([^「」]{1,40})のポケモン」)の枚数×([1-9]\d{0,2})ダメージ(追加)?。$/);
 if(millCount&&(millCount[7]?base!==null&&printed.endsWith('+'):printed===millCount[6]+'×'))
  return {mechanic:'MASS_MILL_COUNT_DAMAGE',commands:['DISCARD','DAMAGE'],scope:millCount[2]?'own':'both',limit:millCount[2]?Number(millCount[2]):1,filter:millCount[4]?'typedBasic':millCount[5]?'teamPokemon':millCount[3]==='トレーナーズ'?'trainer':'energy',type:millCount[4]||null,team:millCount[5]||null,unit:Number(millCount[6]),base:millCount[7]?base:0,sharedWording:true};
 const numeric=text.match(/^(相手のバトルポケモンのにげるためのエネルギーの数|自分のトラッシュにあるエネルギーの枚数)×([1-9]\d{0,2})ダメージ追加。$/);
 if(numeric&&base!==null&&printed.endsWith('+'))
  return {mechanic:'SCALED_ATTACK_DAMAGE',commands:['DAMAGE'],metric:numeric[1].startsWith('相手')?'opponentRetreat':'ownDiscardEnergy',type:null,unit:Number(numeric[2]),base};
 const prizeBonus=text.match(/^相手がすでにとったサイドの枚数×([1-9]\d{0,2})ダメージ追加。$/);
 if(prizeBonus&&base!==null&&printed.endsWith('+'))
  return {mechanic:'SCALED_ATTACK_DAMAGE',commands:['DAMAGE'],metric:'opponentPrizesTaken',type:null,unit:Number(prizeBonus[1]),base};
 const ownTyped=text.match(/^自分のポケモン全員についている\[(草|炎|水|雷|超|闘|悪|鋼)\](?:と\[(草|炎|水|雷|超|闘|悪|鋼)\])?エネルギーの数×([1-9]\d{0,2})ダメージ。$/);
 if(ownTyped&&printed===ownTyped[3]+'×'&&ownTyped[1]!==ownTyped[2])
  return {mechanic:'SCALED_ATTACK_DAMAGE',commands:['DAMAGE'],metric:'ownTeamEnergy',type:ownTyped[1],
   ...(ownTyped[2]?{secondType:ownTyped[2]}:{}),unit:Number(ownTyped[3]),base:0};
 const prizeRecoil=text.match(/^相手がすでにとったサイドの枚数×([1-9]\d{0,2})ダメージ追加。このポケモンにも([1-9]\d{0,2})ダメージ。$/);
 if(prizeRecoil&&base!==null&&printed.endsWith('+'))
  return {mechanic:'ATTACK_PRIZE_BONUS_RECOIL',commands:['DAMAGE'],base,unit:Number(prizeRecoil[1]),recoil:Number(prizeRecoil[2])};
 const scaled=text.match(/^(相手のバトルポケモンにのっているダメカン|(?:このポケモン|相手のバトルポケモン|相手のポケモン全員)についている(?:\[(?:草|炎|水|雷|超|闘|悪|鋼)\])?エネルギー|自分の場のポケモン)の数×([1-9]\d{0,2})ダメージ(追加)?。$/);
 if(scaled&&(scaled[3]?base!==null&&printed.endsWith('+'):printed===scaled[2]+'×')){
  const source=scaled[1],type=source.match(/\[([^\]]+)\]/)?.[1]||null;
  const metric=source.endsWith('ダメカン')?'opponentCounters':source==='自分の場のポケモン'?'ownPokemon':source.startsWith('このポケモン')?'ownEnergy':source.startsWith('相手のバトルポケモン')?'opponentEnergy':'opponentTeamEnergy';
  return {mechanic:'SCALED_ATTACK_DAMAGE',commands:['DAMAGE'],metric,type,unit:Number(scaled[2]),base:scaled[3]?base:0};
 }
 // Search uses the same physical-card picker for every exact printed filter.
 const searchCount=text.match(/^自分の山札から(ポケモン|グッズ|サポート|基本エネルギー|エネルギー|「ポケモンのどうぐ」|スタジアム)を(1枚|[2-9]枚まで)選び、相手に見せて、手札に加える。そして山札を切る。$/);
 const typedSearch=text.match(/^自分の山札から\[(草|炎|水|雷|超|闘|悪|鋼|竜|無色)\]ポケモンを(1枚|[2-9]枚まで)選び、相手に見せて、手札に加える。そして山札を切る。$/);
 const typedEnergySearch=text.match(/^自分の山札から「基本\[(草|炎|水|雷|超|闘|悪|鋼)\]エネルギー」を(1枚|[2-9]枚まで)選び、相手に見せて、手札に加える。そして山札を切る。$/);
 const mixedSearch=text.match(/^自分の山札から\[(草|炎|水|雷|超|闘|悪|鋼)\]ポケモンと「基本\[(草|炎|水|雷|超|闘|悪|鋼)\]エネルギー」を合計([2-9])枚まで選び、相手に見せて、手札に加える。そして山札を切る。$/);
 const stadiumSearch=text.match(/^自分の山札から\[(草|炎|水|雷|超|闘|悪|鋼|竜|無色)\]ポケモンとスタジアムを合計([2-9])枚まで選び、相手に見せて、手札に加える。そして山札を切る。$/);
 const optionalPrivateSearch=text.match(/^のぞむなら、自分の山札から好きなカードを(1枚|[2-9]枚まで)選び、手札に加える。そして山札を切る。$/);
 const privateSearch=text.match(/^自分の山札から好きなカードを(1枚|[2-9]枚まで)選び、手札に加える。そして山札を切る。$/);
 const typedBench=text.match(/^自分の山札から\[(草|炎|水|雷|超|闘|悪|鋼|竜|無色)\]タイプのたねポケモンを(1枚|[2-5]枚まで|好きなだけ)選び、ベンチに出す。そして山札を切る。$/);
 const basicBench=text.match(/^自分の山札からたねポケモンを(1枚|[2-5]枚まで|好きなだけ)選び、ベンチに出す。そして山札を切る。$/);
 if(/^\d+$/.test(printed)){
  const hand=(filter,limit,extra={})=>({mechanic:'SEARCH_REVEAL_TO_HAND_ATTACK',commands:[...(base?['DAMAGE']:[]),'SEARCH_DECK',...(extra.reveal===false?[]:['REVEAL']),'ADD_TO_HAND','SHUFFLE_DECK'],filter,limit,batchSearch:true,sharedWording:true,...extra});
  if(searchCount&&(Number.parseInt(searchCount[2],10)>2||['エネルギー','「ポケモンのどうぐ」','スタジアム'].includes(searchCount[1])))return hand({'ポケモン':'pokemon','グッズ':'item','サポート':'supporter','基本エネルギー':'basicEnergy','エネルギー':'energy','「ポケモンのどうぐ」':'tool','スタジアム':'stadium'}[searchCount[1]],Number.parseInt(searchCount[2],10));
  if(typedSearch)return hand('typedPokemon',Number.parseInt(typedSearch[2],10),{type:typedSearch[1]});
  if(typedEnergySearch)return hand('typedBasicEnergy',Number.parseInt(typedEnergySearch[2],10),{type:typedEnergySearch[1]});
  if(mixedSearch&&mixedSearch[1]===mixedSearch[2])return hand('typedPokemonOrBasicEnergy',Number(mixedSearch[3]),{type:mixedSearch[1]});
  if(stadiumSearch)return hand('typedPokemonOrStadium',Number(stadiumSearch[2]),{type:stadiumSearch[1]});
  if(optionalPrivateSearch)return hand('any',Number.parseInt(optionalPrivateSearch[1],10),{reveal:false,optional:true});
  if(privateSearch)return hand('any',Number.parseInt(privateSearch[1],10),{reveal:false});
  if(typedBench||basicBench&&['4枚まで','5枚まで','好きなだけ'].includes(basicBench[1])){
   const count=typedBench?typedBench[2]:basicBench[1];
   return {mechanic:'SEARCH_BASIC_TO_BENCH_ATTACK',commands:[...(base?['DAMAGE']:[]),'SEARCH_DECK','BENCH_FROM_ZONE','SHUFFLE_DECK'],limit:count==='好きなだけ'?5:Number.parseInt(count,10),...(typedBench?{type:typedBench[1]}:{}),batchSearch:true,sharedWording:true};
  }
 }
 // Exact team or named basic Pokemon search; physical basic-only entry.
 const teamBench=text.match(/^自分の山札からたねポケモンの「(ロケット団|ヒビキ|ナンジャモ|シロナ|リーリエ|ホップ|N|ペパー|カスミ|ダイゴ)のポケモン」を(1枚|[2-5]枚まで|好きなだけ)選び、ベンチに出す。そして山札を切る。$/);
 const namedBench=text.match(/^自分の山札から「(ケロマツ|アゴジムシ)」を(1枚|[2-5]枚まで)選び、ベンチに出す。そして山札を切る。$/);
 if((teamBench||namedBench)&&/^\d+$/.test(printed)){
  const found=teamBench||namedBench;
  return {mechanic:'SEARCH_BASIC_TO_BENCH_ATTACK',commands:[...(base?['DAMAGE']:[]),'SEARCH_DECK','BENCH_FROM_ZONE','SHUFFLE_DECK'],limit:found[2]==='好きなだけ'?5:parseInt(found[2],10),...(teamBench?{team:found[1]}:{nameExact:found[1]}),batchSearch:true,sharedWording:true};
 }
 // Exact one-holder acceleration; multi-holder distribution is a separate mechanic.
 const acceleration=text.match(/^自分の(山札|トラッシュ)から(基本エネルギー|「基本\[(草|炎|水|雷|超|闘|悪|鋼)\]エネルギー」)を(1枚|[2-9]枚まで)選び、(このポケモン|自分のポケモン1匹|ベンチポケモン1匹|自分のポケモン|ベンチポケモン|自分の\[(草|炎|水|雷|超|闘|悪|鋼|竜|無色)\]ポケモン)につける。(そして山札を切る。)?$/);
 if(acceleration&&/^\d+$/.test(printed)&&Boolean(acceleration[7])===(acceleration[1]==='山札')){
  const [,zone,,type,count,holder,holderType]=acceleration,limit=Number.parseInt(count,10);
  if(limit===1||holder==='このポケモン'||holder.endsWith('1匹')){
   const target=holder==='このポケモン'?'self':holder.startsWith('ベンチ')?'bench':'own';
   return {mechanic:'ATTACK_ACCELERATE_BASIC_ENERGY',commands:[...(base?['DAMAGE']:[]),...(zone==='山札'?['SEARCH_DECK']:[]),'ATTACH_ENERGY',...(zone==='山札'?['SHUFFLE_DECK']:[])],zone:zone==='山札'?'deck':'discard',type:type||null,limit,target,holderType:holderType||null,sharedWording:true};
  }
 }
 // The following exact official patterns use the same board-count calculation.
 const decreasing=text.match(/^(このポケモンにのっているダメカン|相手のバトルポケモンのにげるためのエネルギー|相手のバトルポケモンについているエネルギー)の数×([1-9]\d{0,2})ダメージぶん、このワザのダメージは小さくなる。$/);
 if(decreasing&&/^\d{1,3}-$/.test(printed)){
  const metric=({'このポケモンにのっているダメカン':'ownCounters','相手のバトルポケモンのにげるためのエネルギー':'opponentRetreat','相手のバトルポケモンについているエネルギー':'opponentEnergy'})[decreasing[1]];
  return {mechanic:'SCALED_ATTACK_DAMAGE',commands:['DAMAGE'],metric,type:null,unit:Number(decreasing[2]),base:Number.parseInt(printed,10),subtract:true};
 }
 const boardCount=text.match(/^(自分の手札の枚数|相手の手札の枚数|自分がすでにとったサイドの枚数|自分の場のたねポケモンの数|相手の場のたねポケモンの数|自分の場の1進化ポケモンの数|自分の場の進化ポケモンの数|相手の場の進化ポケモンの数|自分のベンチの2進化ポケモンの数|ダメカンがのっている自分のベンチポケモンの数|相手のポケモン全員にのっているダメカンの数|おたがいのバトルポケモンについているエネルギーの数|おたがいのポケモン全員についているエネルギーの数|相手のバトルポケモンのにげるためのエネルギーの数)×([1-9]\d{0,2})ダメージ(追加)?。$/);
 if(boardCount&&(boardCount[3]?base!==null&&printed.endsWith('+'):printed===boardCount[2]+'×')){
  const metrics={'自分の手札の枚数':'ownHand','相手の手札の枚数':'opponentHand','自分がすでにとったサイドの枚数':'ownPrizesTaken','自分の場のたねポケモンの数':'ownBasicCount','相手の場のたねポケモンの数':'opponentBasicCount','自分の場の1進化ポケモンの数':'ownStageOneCount','自分の場の進化ポケモンの数':'ownEvolvedCount','相手の場の進化ポケモンの数':'opponentEvolvedCount','自分のベンチの2進化ポケモンの数':'ownBenchStageTwoCount','ダメカンがのっている自分のベンチポケモンの数':'ownDamagedBenchCount','相手のポケモン全員にのっているダメカンの数':'opponentTeamCounters','おたがいのバトルポケモンについているエネルギーの数':'bothActiveEnergy','おたがいのポケモン全員についているエネルギーの数':'bothTeamEnergy','相手のバトルポケモンのにげるためのエネルギーの数':'opponentRetreat'};
  return {mechanic:'SCALED_ATTACK_DAMAGE',commands:['DAMAGE'],metric:metrics[boardCount[1]],type:null,unit:Number(boardCount[2]),base:boardCount[3]?base:0};
 }
 // Count only public physical cards and exact registered names/attacks.
 const publicCount=text.match(/^(相手のトラッシュにある基本エネルギーの枚数|相手のトラッシュにあるグッズの枚数|相手の場の「ポケモンex・V」の数|自分の場のダメカンがのっているポケモンの数|相手の場の特性を持つポケモンの数)×([1-9]\d{0,2})ダメージ(追加)?。$/);
 if(publicCount&&(publicCount[3]?base!==null&&printed.endsWith('+'):printed===publicCount[2]+'×')){
  const metric={'相手のトラッシュにある基本エネルギーの枚数':'opponentDiscardBasic','相手のトラッシュにあるグッズの枚数':'opponentDiscardItem','相手の場の「ポケモンex・V」の数':'opponentExVCount','自分の場のダメカンがのっているポケモンの数':'ownDamagedCount','相手の場の特性を持つポケモンの数':'opponentAbilityCount'}[publicCount[1]];
  return {mechanic:'SCALED_ATTACK_DAMAGE',commands:['DAMAGE'],metric,type:null,unit:Number(publicCount[2]),base:publicCount[3]?base:0};
 }
 const namedAttackCount=text.match(/^自分の場の、ワザ「([^「」]{1,40})」を持つポケモンの数×([1-9]\d{0,2})ダメージ。$/);
 if(namedAttackCount&&printed===namedAttackCount[2]+'×')
  return {mechanic:'SCALED_ATTACK_DAMAGE',commands:['DAMAGE'],metric:'ownNamedAttackCount',name:namedAttackCount[1],unit:Number(namedAttackCount[2]),base:0};
 const namedTeamCount=text.match(/^自分の場の「(ロケット団|エリカ|ヒビキ|カスミ|シロナ|リーリエ|ホップ|N|ナンジャモ|ダイゴ|ペパー)のポケモン」の数×([1-9]\d{0,2})ダメージ。$/);
 if(namedTeamCount&&printed===namedTeamCount[2]+'×')
  return {mechanic:'SCALED_ATTACK_DAMAGE',commands:['DAMAGE'],metric:'ownTeamNameCount',name:namedTeamCount[1],unit:Number(namedTeamCount[2]),base:0};
 const discardTyped=text.match(/^自分のトラッシュにある\[([草炎水雷超闘悪鋼竜無色])\]ポケモンの枚数×([1-9]\d{0,2})ダメージ。$/);
 if(discardTyped&&printed===discardTyped[2]+'×')
  return {mechanic:'SCALED_ATTACK_DAMAGE',commands:['DAMAGE'],metric:'ownDiscardTypedPokemon',type:discardTyped[1],unit:Number(discardTyped[2]),base:0};
 const discardNamed=text.match(/^自分のトラッシュにある、ワザ「([^「」]{1,40})」を持つポケモンの枚数×([1-9]\d{0,2})ダメージ。$/);
 if(discardNamed&&printed===discardNamed[2]+'×')
  return {mechanic:'SCALED_ATTACK_DAMAGE',commands:['DAMAGE'],metric:'ownDiscardNamedAttack',name:discardNamed[1],unit:Number(discardNamed[2]),base:0};
 const namedSupporter=text.match(/^自分のトラッシュにある「([^「」]{1,40})」の枚数×([1-9]\d{0,2})ダメージ追加。$/);
 if(namedSupporter&&base!==null&&printed.endsWith('+'))
  return {mechanic:'SCALED_ATTACK_DAMAGE',commands:['DAMAGE'],metric:'ownDiscardNamedCard',name:namedSupporter[1],unit:Number(namedSupporter[2]),base,sharedWording:true};
 const supporterContains=text.match(/^自分のトラッシュにある、名前に「([^「」]{1,40})」とつくサポートの枚数×([1-9]\d{0,2})ダメージ。$/);
 if(supporterContains&&printed===supporterContains[2]+'×')
  return {mechanic:'SCALED_ATTACK_DAMAGE',commands:['DAMAGE'],metric:'ownDiscardSupporterContains',name:supporterContains[1],unit:Number(supporterContains[2]),base:0,sharedWording:true};
 const exactField=text.match(/^自分の場の「([^「」（）]{1,40})（『ポケモンex』をふくむ）」の数×([1-9]\d{0,2})ダメージ。$/);
 if(exactField&&printed===exactField[2]+'×')
  return {mechanic:'SCALED_ATTACK_DAMAGE',commands:['DAMAGE'],metric:'ownNamedOrExCount',name:exactField[1],unit:Number(exactField[2]),base:0,sharedWording:true};
 const bothNames=text.match(/^おたがいの場の、名前に「([^「」]{1,40})」または「([^「」]{1,40})」とつくポケモンの数×([1-9]\d{0,2})ダメージ。$/);
 if(bothNames&&printed===bothNames[3]+'×')
  return {mechanic:'SCALED_ATTACK_DAMAGE',commands:['DAMAGE'],metric:'bothNameContainsCount',name:bothNames[1],secondName:bothNames[2],unit:Number(bothNames[3]),base:0,sharedWording:true};
 const benchNamed=text.match(/^自分のベンチの「([^「」]{1,40})」の数×([1-9]\d{0,2})ダメージ追加。$/);
 if(benchNamed&&base!==null&&printed.endsWith('+'))
  return {mechanic:'SCALED_ATTACK_DAMAGE',commands:['DAMAGE'],metric:'ownBenchNamedCount',name:benchNamed[1],unit:Number(benchNamed[2]),base,sharedWording:true};
 const benchTypedCounters=text.match(/^自分のベンチの\[([草炎水雷超闘悪鋼竜無色])\]ポケモン全員にのっているダメカンの数×([1-9]\d{0,2})ダメージ。$/);
 if(benchTypedCounters&&printed===benchTypedCounters[2]+'×')
  return {mechanic:'SCALED_ATTACK_DAMAGE',commands:['DAMAGE'],metric:'ownBenchTypedCounters',type:benchTypedCounters[1],unit:Number(benchTypedCounters[2]),base:0,sharedWording:true};
 // Exact named-team and attached-energy board counts.
 const teamCounters=text.match(/^自分のベンチの「(ロケット団|エリカ|ヒビキ|カスミ|シロナ|リーリエ|ホップ|N|ナンジャモ|ダイゴ|ペパー)のポケモン」全員にのっているダメカンの数×([1-9]\d{0,2})ダメージ。(このワザのダメージは弱点を計算しない。)?$/);
 if(teamCounters&&printed===teamCounters[2]+'×')
  return {mechanic:'SCALED_ATTACK_DAMAGE',commands:['DAMAGE'],metric:'ownBenchTeamCounters',team:teamCounters[1],unit:Number(teamCounters[2]),base:0,...(teamCounters[3]?{skipWeakness:true}:{}),sharedWording:true};
 const teamEnergy=text.match(/^自分の「(ロケット団|エリカ|ヒビキ|カスミ|シロナ|リーリエ|ホップ|N|ナンジャモ|ダイゴ|ペパー)のポケモン」全員についている\[([草炎水雷超闘悪鋼])\]エネルギーの数×([1-9]\d{0,2})ダメージ追加。$/);
 if(teamEnergy&&base!==null&&printed.endsWith('+'))
  return {mechanic:'SCALED_ATTACK_DAMAGE',commands:['DAMAGE'],metric:'ownNamedTeamEnergy',team:teamEnergy[1],type:teamEnergy[2],unit:Number(teamEnergy[3]),base,sharedWording:true};
 const benchEnergy=text.match(/^\[([草炎水雷超闘悪鋼])\]エネルギーがついている自分のベンチポケモンの数×([1-9]\d{0,2})ダメージ追加。$/);
 if(benchEnergy&&base!==null&&printed.endsWith('+'))
  return {mechanic:'SCALED_ATTACK_DAMAGE',commands:['DAMAGE'],metric:'ownBenchWithTypedEnergy',type:benchEnergy[1],unit:Number(benchEnergy[2]),base,sharedWording:true};
 const benchNamedCounters=text.match(/^自分のベンチの「([^「」]{1,40})」全員にのっているダメカンの数×([1-9]\d{0,2})ダメージ。$/);
 if(benchNamedCounters&&printed===benchNamedCounters[2]+'×')
  return {mechanic:'SCALED_ATTACK_DAMAGE',commands:['DAMAGE'],metric:'ownBenchNamedCounters',name:benchNamedCounters[1],unit:Number(benchNamedCounters[2]),base:0,sharedWording:true};
 const energyCardCounts=[
  ['ownAttachedSpecialCards',/^このポケモンについている特殊エネルギーの枚数×([1-9]\d{0,2})ダメージ。$/],
  ['opponentAttachedSpecialCards',/^相手のポケモン全員についている特殊エネルギーの枚数×([1-9]\d{0,2})ダメージ。$/],
  ['ownAttachedBasicCards',/^このポケモンについている基本エネルギーの数×([1-9]\d{0,2})ダメージ。$/],
  ['ownDistinctBasicTypes',/^自分のポケモン全員についている基本エネルギーのタイプの数×([1-9]\d{0,2})ダメージ。$/]
 ];
 for(const [metric,pattern] of energyCardCounts){
  const match=text.match(pattern);
  if(match&&printed===match[1]+'×')
   return {mechanic:'SCALED_ATTACK_DAMAGE',commands:['DAMAGE'],metric,unit:Number(match[1]),base:0,sharedWording:true};
 }
 const typedCount=text.match(/^自分の場の\[(草|炎|水|雷|超|闘|悪|鋼|無色|竜)\]ポケモンの数×([1-9]\d{0,2})ダメージ。$/);
 if(typedCount&&printed===typedCount[2]+'×')
  return {mechanic:'SCALED_ATTACK_DAMAGE',commands:['DAMAGE'],metric:'ownTypedPokemonCount',type:typedCount[1],unit:Number(typedCount[2]),base:0};
 if(base===null||printed.endsWith('+'))return null;
 const deal=base?['DAMAGE']:[];
 // Physical basic Energy moves from the player's hand, not the once-per-turn
 // manual attachment slot. Other text variants remain unconnected.
 const handEnergy=text.match(/^自分の手札から基本エネルギーを1枚選び、(このポケモン|自分のポケモン)につける。$/);
 if(handEnergy&&base===0)
  return {mechanic:'ATTACK_ATTACH_BASIC_FROM_HAND',commands:['ATTACH_ENERGY'],target:handEnergy[1]==='このポケモン'?'self':'own'};
 // The printed attack is unusable until its Pokemon actually leaves the Active Spot.
 // This is not the ordinary next-turn attack lock and must survive turn changes.
 const untilSwitch=text.match(/^このワザを使ったなら、このポケモンは、バトル場をはなれるまで「([^「」]{1,40})」が使えない。$/);
 if(untilSwitch&&base>0&&untilSwitch[1]===String(entry.name).normalize('NFKC'))
  return {mechanic:'ATTACK_LOCK_UNTIL_SWITCH',commands:['DAMAGE','ADD_STATE'],attackName:untilSwitch[1]};
 const hiddenDiscard=text.match(/^相手の手札からオモテを見ないで([1-9]\d?)枚選び、トラッシュする。$/);
 const hiddenReturn=text.match(/^相手の手札からオモテを見ないで([1-9]\d?)枚選び、そのカードのオモテを見て、相手の山札にもどして切る。$/);
 if(hiddenDiscard||hiddenReturn)
  return {mechanic:'ATTACK_BLIND_HAND_CHOICE',commands:[...deal,...(hiddenReturn?['REVEAL','RETURN_TO_DECK','SHUFFLE_DECK']:['DISCARD'])],
   amount:Number((hiddenDiscard||hiddenReturn)[1]),destination:hiddenReturn?'deck':'discard'};
 const piercingSpread=text.match(/^相手のポケモン([2-5])匹に、それぞれ([1-9]\d{0,2})ダメージ。このワザのダメージは、弱点・抵抗力と、ダメージを受けるポケモンにかかっている効果を計算しない。$/);
 if(piercingSpread&&base===0)
  return {mechanic:'ATTACK_SPREAD_DAMAGE',commands:['DAMAGE'],scope:'opponent',amount:Number(piercingSpread[2]),count:Number(piercingSpread[1]),ignoreDefense:true};
 const benchCounters=text.match(/^ダメカン([1-9]\d?)個を、相手のベンチポケモンに好きなようにのせる。$/);
 if(benchCounters)
  return {mechanic:'PHANTOM',commands:[...deal,'PLACE_DAMAGE_COUNTERS'],counterCount:Number(benchCounters[1]),sharedWording:true};
 if(text==='場にスタジアムが出ていないなら、このワザは失敗。'&&base>0)
  return {mechanic:'FULL_BENCH_REQUIRED_DAMAGE',commands:['DAMAGE'],requiresStadium:true,sharedWording:true};
 const moveBenchCounters=text.match(/^自分のベンチ(?:の「(ロケット団|ナンジャモ|シロナ|ホップ|カスミ|ヒビキ|リーリエ|N)のポケモン」|ポケモン)を1匹選び、選んだポケモンにのっているダメカンをすべて、相手の(ポケモン1匹|バトルポケモン)にのせ替える。$/);
 if(moveBenchCounters&&/^\d+$/.test(printed))
  return {mechanic:'ATTACK_MOVE_BENCH_COUNTERS',commands:[...deal,'MOVE_DAMAGE_COUNTERS'],team:moveBenchCounters[1]||null,targetActive:moveBenchCounters[2]==='バトルポケモン',sharedWording:true};
 const chosenCounters=text.match(/^相手のポケモン1匹に、そのポケモンにのっているダメカンの数×([1-9]\d{0,2})ダメージ。\[ベンチは弱点・抵抗力を計算しない。\]$/);
 if(chosenCounters&&printed==='0')
  return {mechanic:'ATTACK_SPREAD_DAMAGE',commands:['DAMAGE'],scope:'opponent',count:1,counterUnit:Number(chosenCounters[1]),sharedWording:true};
 const benchPrizeSpread=text.match(/^相手のベンチポケモン全員にも、それぞれ、相手がすでにとったサイドの枚数×([1-9]\d{0,2})ダメージ。\[ベンチは弱点・抵抗力を計算しない。\]$/);
 if(benchPrizeSpread&&base>0&&/^\d+$/.test(printed))
  return {mechanic:'ATTACK_SPREAD_DAMAGE',commands:['DAMAGE'],scope:'opponentBench',count:null,prizeUnit:Number(benchPrizeSpread[1]),sharedWording:true};
 const damagedSpread=text.match(/^ダメカンがのっている相手のベンチポケモン([1-5])匹にも、(?:それぞれ)?([1-9]\d{0,2})ダメージ。\[ベンチは弱点・抵抗力を計算しない。\]$/);
 if(damagedSpread&&base>0&&/^\d+$/.test(printed))
  return {mechanic:'ATTACK_SPREAD_DAMAGE',commands:['DAMAGE'],scope:'opponentBench',count:Number(damagedSpread[1]),amount:Number(damagedSpread[2]),requiresDamage:true,sharedWording:true};
 // Exact compound attack: discard attached units, then damage selected targets.
 const discardSpread=text.match(/^このポケモンについているエネルギーを(すべて|[1-9]個(?:選び、)?)(?:トラッシュし、)(相手のポケモン|相手のベンチポケモン)([1-5]匹)(に|にも)、(?:それぞれ)?([1-9]\d{0,2})ダメージ。\[ベンチは弱点・抵抗力を計算しない。\]$/);
 if(discardSpread&&/^\d+$/.test(printed)&&((discardSpread[4]==='にも')===(base>0))&&!(discardSpread[2]==='相手のポケモン'&&base>0))
  return {mechanic:'ATTACK_SPREAD_DAMAGE',commands:[...new Set([...deal,'DISCARD','DAMAGE'])],scope:discardSpread[2]==='相手のポケモン'?'opponent':'opponentBench',count:Number.parseInt(discardSpread[3],10),amount:Number(discardSpread[5]),discardAttached:discardSpread[1]==='すべて'?'all':Number.parseInt(discardSpread[1],10),sharedWording:true};
 // Exact scoped spread effects; do not treat damage counters as damage.
 const conditionalDamagedSpread=text.match(/^ダメカンがのっている(相手の|おたがいの)ベンチポケモン(全員|[1-5]匹)にも、(?:それぞれ)?([1-9]\d{0,2})ダメージ。\[ベンチは弱点・抵抗力を計算しない。\]$/);
 if(conditionalDamagedSpread&&base>0)return {mechanic:'ATTACK_SPREAD_DAMAGE',commands:['DAMAGE'],scope:conditionalDamagedSpread[1]==='相手の'?'opponentBench':'bothBench',filter:'damaged',count:conditionalDamagedSpread[2]==='全員'?null:Number.parseInt(conditionalDamagedSpread[2],10),amount:Number(conditionalDamagedSpread[3]),sharedWording:true};
 const bothSpread=text.match(/^おたがいのベンチポケモン全員にも、それぞれ([1-9]\d{0,2})ダメージ。\[ベンチは弱点・抵抗力を計算しない。\]$/);
 if(bothSpread&&base>0)return {mechanic:'ATTACK_SPREAD_DAMAGE',commands:['DAMAGE'],scope:'bothBench',count:null,amount:Number(bothSpread[1]),sharedWording:true};
 const ruleSpread=text.match(/^相手の「ポケモン(ex|ex・V)」全員に、それぞれ([1-9]\d{0,2})ダメージ。このワザのダメージは弱点・抵抗力を計算しない。$/);
 if(ruleSpread&&base===0)return {mechanic:'ATTACK_SPREAD_DAMAGE',commands:['DAMAGE'],scope:'opponent',count:null,amount:Number(ruleSpread[2]),filter:ruleSpread[1]==='ex'?'ex':'exV',skipWeakness:true,skipResistance:true,sharedWording:true};
 const benchExSpread=text.match(/^このポケモンについているエネルギーをすべてトラッシュし、相手のベンチの「ポケモンex」1匹に、([1-9]\d{0,2})ダメージ。\[ベンチは弱点・抵抗力を計算しない。\]$/);
 if(benchExSpread&&base===0)return {mechanic:'ATTACK_SPREAD_DAMAGE',commands:['DISCARD','DAMAGE'],scope:'opponentBench',count:1,amount:Number(benchExSpread[1]),filter:'ex',discardAttached:'all',sharedWording:true};
 const spread=text.match(/^(相手のポケモン|相手のベンチポケモン|自分のベンチポケモン)(全員|[1-5]匹)(に|にも)、(?:それぞれ)?([1-9]\d{0,2})ダメージ。\[ベンチは弱点・抵抗力を計算しない。\]$/);
 if(spread&&((spread[3]==='にも')===(base>0))&&!(spread[1]==='相手のポケモン'&&(base||spread[2]==='1匹')))
  return {mechanic:'ATTACK_SPREAD_DAMAGE',commands:['DAMAGE'],scope:spread[1]==='相手のポケモン'?'opponent':spread[1].startsWith('自分')?'ownBench':'opponentBench',
   amount:Number(spread[4]),count:spread[2]==='全員'?null:Number.parseInt(spread[2],10)};
 const recycleEnergy=text.match(/^自分のトラッシュにある「基本\[([草炎水雷超闘悪鋼])\]エネルギー」をすべて相手に見せ(?:て|、)、?その枚数×([1-9]\d{0,2})ダメージ。その後、見せたエネルギーを山札にもどして切る。$/);
 const recycleCounters=text.match(/^自分のトラッシュにある「基本\[([草炎水雷超闘悪鋼])\]エネルギー」をすべて相手に見せ、その枚数×([1-9]\d?)個ぶんのダメカンを、相手のポケモン1匹にのせる。その後、見せたエネルギーを山札にもどして切る。$/);
 if(recycleEnergy&&printed===recycleEnergy[2]+'×'||recycleCounters&&printed==='0'){
  const match=recycleEnergy||recycleCounters;
  return {mechanic:'ATTACK_RECYCLE_BASIC_ENERGY',commands:['REVEAL',recycleEnergy?'DAMAGE':'PLACE_DAMAGE_COUNTERS','RETURN_TO_DECK','SHUFFLE_DECK'],type:match[1],unit:Number(match[2]),counters:Boolean(recycleCounters),sharedWording:true};
 }
 const discardOpponentAttachments=text.match(/^相手のポケモン全員についている(「ポケモンのどうぐ」と「特殊エネルギー」|特殊エネルギー)を、すべてトラッシュする。$/);
 if(discardOpponentAttachments&&/^\d+$/.test(printed))
  return {mechanic:'ATTACK_DISCARD_OPPONENT_ATTACHMENTS',commands:[...deal,'DISCARD'],tools:discardOpponentAttachments[1].startsWith('「ポケモンのどうぐ」'),sharedWording:true};
 const optionalDraw=text.match(/^のぞむなら、自分の手札が([1-9]\d?)枚になるように、山札を引く。$/);
 if(optionalDraw)return {mechanic:'ATTACK_OPTIONAL_DRAW_TO_LIMIT',commands:[...deal,'DRAW'],limit:Number(optionalDraw[1])};
 const discardHand=text.match(/^自分の手札をすべてトラッシュし、(?:自分の)?山札を([1-9]\d?)枚引く。$/);
 if(discardHand)return {mechanic:'ATTACK_DISCARD_HAND_DRAW',commands:[...deal,'DISCARD','DRAW'],amount:Number(discardHand[1]),sharedWording:true};
 // Official printings select an exact number of physical attached Energy cards.
 // All energy choices must be resolved by the common engine picker rather than
 // inventing card-specific actions; a zero-attachment case discards zero.
 const typedSelfEnergyDiscard=text.match(/^このポケモンについている\[([草炎水雷超闘悪鋼])\]エネルギーを([1-9])個選び、トラッシュする。$/);
 if(typedSelfEnergyDiscard&&/^\d+$/.test(printed))return {mechanic:'ATTACK_DISCARD_MULTIPLE_SELF_ENERGY',commands:[...deal,'DISCARD'],type:typedSelfEnergyDiscard[1],count:Number(typedSelfEnergyDiscard[2]),sharedWording:true};
 const selfEnergyDiscard=text.match(/^このポケモンについているエネルギーを([2-9])個選び、トラッシュする。$/);
 if(selfEnergyDiscard&&base!==null&&!printed.endsWith('+'))
  return {mechanic:'ATTACK_DISCARD_MULTIPLE_SELF_ENERGY',commands:[...deal,'DISCARD'],count:Number(selfEnergyDiscard[1])};
 const selfEnergyReturn=text.match(/^このポケモンについている(?:\[(草|炎|水|雷|超|闘|悪|鋼)\])?エネルギーを([1-9])個選び、手札にもどす。$/);
 if(selfEnergyReturn&&/^\d+$/.test(printed))
  return {mechanic:'ATTACK_RETURN_SELF_ENERGY',commands:[...deal,'RETURN_TO_HAND'],type:selfEnergyReturn[1]||null,count:Number(selfEnergyReturn[2])};
 if(/^\d+$/.test(printed)&&text==='のぞむなら、このポケモンをベンチポケモンと入れ替える。')
  return {mechanic:'SWITCH_SELF_ATTACK',commands:[...deal,'SWITCH'],optional:true};
 const switchedDamage=text.match(/^相手のベンチポケモンを1匹選び、バトルポケモンと入れ替える。その後、新しく出てきたポケモンに([1-9]\d{0,2})ダメージ。$/);
 if(switchedDamage&&printed==='0')
  return {mechanic:'ATTACK_SWITCH_THEN_DAMAGE',commands:['FORCE_SWITCH','DAMAGE'],amount:Number(switchedDamage[1])};
 // The official coin result determines whether the selected physical Energy
 // is discarded. Always roll through match-owned deterministic RNG.
 const coinDiscard=text.match(/^コインを1回投げオモテなら、相手のバトルポケモンについている(特殊)?エネルギーを1個選び、トラッシュする。$/);
 if(coinDiscard&&base!==null&&!printed.endsWith('+'))
  return {mechanic:'ATTACK_COIN_DISCARD_DEFENDER_ENERGY',commands:[...deal,'COIN_FLIP','DISCARD'],specialOnly:Boolean(coinDiscard[1])};
 const typedDiscard=text.match(/^相手のバトルポケモンについている\[([草炎水雷超闘悪鋼])\]エネルギーを1個選び、トラッシュする。$/);
 if(typedDiscard)return {mechanic:'ATTACK_DISCARD_DEFENDER_ENERGY',commands:[...deal,'DISCARD'],specialOnly:false,type:typedDiscard[1]};
 if(text==='相手のバトル場の「ポケモンex」についているエネルギーを1個選び、トラッシュする。')
  return {mechanic:'ATTACK_DISCARD_DEFENDER_ENERGY',commands:[...deal,'DISCARD'],specialOnly:false,defenderEx:true};
 const discardEnergy=text.match(/^相手のバトルポケモンについている(特殊)?エネルギーを1個選び、トラッシュする。$/);
 if(discardEnergy)return {mechanic:'ATTACK_DISCARD_DEFENDER_ENERGY',commands:[...deal,'DISCARD'],specialOnly:Boolean(discardEnergy[1])};
 const healTarget=text.match(/^自分のポケモン1匹のHPを「([1-9]\d{0,2})」回復する。$/);
 if(healTarget)return {mechanic:'ATTACK_HEAL_OWN_TARGET',commands:[...deal,'HEAL'],amount:Number(healTarget[1])};
 const friendlySplash=text.match(/^自分のベンチポケモン全員にも、それぞれ([1-9]\d{0,2})ダメージ。\[ベンチは弱点・抵抗力を計算しない。\]$/);
 if(friendlySplash&&base>0)return {mechanic:'ATTACK_SPLASH_OWN_BENCH',commands:['DAMAGE'],benchDamage:Number(friendlySplash[1])};
 if(text==='相手のバトルポケモンが持つワザを1つ選ぶ。次の相手の番、このワザを受けたポケモンは、選ばれたワザが使えない。')
  return {mechanic:'ATTACK_DISABLE_SELECTED_MOVE',commands:[...deal,'ADD_STATE']};
 const chosenTarget=text.match(/^相手のポケモン1匹に、([1-9]\d{0,2})ダメージ。(?:\[ベンチは弱点・抵抗力を計算しない。\]|ベンチは弱点・抵抗力を計算しない。)$/);
 if(chosenTarget&&base===0)return {mechanic:'ANY_DAMAGE',commands:['DAMAGE'],amount:Number(chosenTarget[1])};
 const reset=text.match(/^自分の手札をすべて山札にもどして切る。その後、山札を([1-9]\d?)枚引く。$/);
 if(reset)return {mechanic:'ATTACK_RESET_HAND',commands:[...(base?['DAMAGE']:[]),'RETURN_TO_DECK','SHUFFLE_DECK','DRAW'],amount:Number(reset[1])};
 const discard=text.match(/^自分の山札を上から([1-9]\d?)枚トラッシュする。$/);
 if(discard)return {mechanic:'ATTACK_DISCARD_OWN_DECK_TOP',commands:[...(base?['DAMAGE']:[]),'DISCARD'],amount:Number(discard[1])};
 if(text==='次の相手の番、このワザを受けたポケモンは、ワザが使えない。')
  return {mechanic:'ATTACK_DISABLE_DEFENDER',commands:[...(base?['DAMAGE']:[]),'ADD_STATE']};
 const weaken=text.match(/^次の相手の番、このワザを受けたポケモンが使うワザのダメージは「[-−]([1-9]\d{0,2})」される。$/);
 if(weaken)
  return {mechanic:'ATTACK_WEAKEN_DEFENDER',commands:[...(base?['DAMAGE']:[]),'ADD_STATE'],amount:Number(weaken[1])};
 return null;
}
// Exact composable shared effect grammar. Existing approved plans take priority.
// Numeric parameters and known filters generalize across official prints; never
// infer missing clauses, and never compile a partially matched effect.
function energyCountFallback(entry,kind,text){
 if(kind!=='ATTACK')return null;
 const printed=String(entry.damage??'0').normalize('NFKC'),base=/^\d+\+$/.test(printed)?parseInt(printed,10):null;
 const optionalAll=text.match(/^のぞむなら、このポケモンについているエネルギーをすべて(トラッシュし|手札にもどし|山札にもどして切り)、([1-9]\d{0,2})ダメージ追加。$/);
 const optionalTyped=text.match(/^のぞむなら、このポケモンについている\[([草炎水雷超闘悪鋼])\]エネルギーを1個(手札にもどし|選び、トラッシュする。その場合、)(?:、)?([1-9]\d{0,2})ダメージ追加。$/);
 if(base!==null&&(optionalAll||optionalTyped)){
  const destination=optionalAll?({'トラッシュし':'discard','手札にもどし':'hand','山札にもどして切り':'deck'})[optionalAll[1]]:optionalTyped[2]==='手札にもどし'?'hand':'discard';
  return {mechanic:'ATTACK_OPTIONAL_ENERGY_BONUS',commands:[destination==='discard'?'DISCARD':destination==='hand'?'RETURN_TO_HAND':'RETURN_TO_DECK',...(destination==='deck'?['SHUFFLE_DECK']:[]),'DAMAGE'],all:!!optionalAll,type:optionalTyped?.[1]||null,destination,base,bonus:Number(optionalAll?.[2]||optionalTyped?.[3]),sharedWording:true};
 }
 // Printed physical-card discard counts (枚), never energy-unit counts (個).
 const energyCount=text.match(/^(のぞむなら、)?(自分の場のポケモンについている|自分のベンチポケモンについている|このポケモンについている|自分の手札から)(基本エネルギー|エネルギー|\[([草炎水雷超闘悪鋼])\]エネルギー|「基本\[([草炎水雷超闘悪鋼])\]エネルギー」)を(好きなだけ|すべて|[1-9]枚まで)トラッシュし、その枚数×([1-9]\d{0,2})ダメージ(追加)?。$/);
 if(energyCount&&((energyCount[8]&&base!==null&&printed.endsWith('+'))||(!energyCount[8]&&printed===energyCount[7]+'×'))){
  const [,optional,zone,filter,typed,basicTyped,limit,unit,bonus]=energyCount;
  // Basic-typed wording is valid for cards in hand; typed non-basic wording
  // only applies to attached cards, where their provided types are defined.
  if((zone==='自分の手札から'&&!typed)||(zone!=='自分の手札から'&&!basicTyped))
   return {mechanic:'MASS_ENERGY_COUNT_DISCARD',commands:['DISCARD','DAMAGE'],zone:({'自分の場のポケモンについている':'field','自分のベンチポケモンについている':'bench','このポケモンについている':'self','自分の手札から':'hand'})[zone],type:typed||basicTyped||null,basic:filter.includes('基本'),limit:limit==='すべて'||limit==='好きなだけ'?60:parseInt(limit,10),all:limit==='すべて',base:bonus?base:0,unit:Number(unit),sharedWording:true};
 }

 return null;
}
function handAndHealPlan(entry,kind,text){
 const attack=kind==='ATTACK',ability=kind==='ABILITY',trainer=kind==='MAIN'&&['item','supporter'].includes(entry.category),printed=String(entry.damage??'0').normalize('NFKC');
 if(!(attack||ability||trainer)||attack&&!/^\d+$/.test(printed))return null;
 let body=text;
 if(ability){
  const prefix=body.match(/^(?:このポケモンがバトル場にいるなら、)?自分の番に1回使える。/);
  if(!prefix)return null;body=body.slice(prefix[0].length);
 }
 const damage=attack&&Number(printed)>0?['DAMAGE']:[];
 const hand=(mode,amount,extras={})=>({mechanic:'MASS_HAND_FLOW',mode,amount,commands:[...damage,...(mode.includes('reset')?['RETURN_TO_DECK',...(extras.bottom?[]:['SHUFFLE_DECK'])]:[]),...(mode==='revealCount'?['REVEAL']:[]),...(mode==='resetBothCoin'?['COIN_FLIP']:[]),'DRAW'],...extras,sharedWording:true});
 const reset=body.match(/^相手は相手自身の手札をすべて(山札にもどして切る|ウラにして切り、山札の下にもどす)。その後、相手は山札を([1-9])枚引く。$/);
 if(reset)return hand('resetOpponent',Number(reset[2]),{bottom:reset[1].includes('下')});
 const both=body.match(/^おたがいのプレイヤーは、それぞれ山札を([1-9])枚引く。$/);
 if(both)return hand('bothDraw',Number(both[1]));
 if(attack&&body==='自分の手札をすべて山札にもどして切る。その後、相手の手札の枚数ぶん、自分の山札を引く。')return hand('resetOwnMatch',0);
 if(trainer&&body==='相手の手札を見て、その中にあるポケモンの枚数ぶん、自分の山札を引く。')return hand('revealCount',0);
 const bothCoin=body.match(/^おたがいのプレイヤーは、それぞれ自分の手札をすべてウラにして切り、山札の下にもどす。その後、おたがいのプレイヤーは、それぞれコインを1回投げ、オモテなら([1-9])枚、ウラなら([1-9])枚、山札を引く。$/);
 if(trainer&&bothCoin)return hand('resetBothCoin',Number(bothCoin[1]),{tails:Number(bothCoin[2]),bottom:true});
 const team=body.match(/^自分の手札が([1-9])枚になるように、山札を引く。自分の場のポケモン全員が「ロケット団のポケモン」なら、([1-9])枚になるように引く。$/);
 if(trainer&&team&&Number(team[1])<Number(team[2]))return hand('rocketLimit',Number(team[1]),{bonus:Number(team[2])});
 const heal=body.match(/^(自分のベンチ(?:の\[([草炎水雷超闘悪鋼竜無色])\])?ポケモン(1匹|全員)|自分のたねポケモン全員|自分のバトル場の\[([草炎水雷超闘悪鋼竜無色])\]ポケモン|おたがいのポケモン全員)のHPを、?(?:それぞれ)?(すべて|「([1-9]\d{0,2})」)回復する。$/);
 if(heal&&(!heal[1].startsWith('おたがい')||!damage.length))return {mechanic:'MASS_HEAL_SCOPE',commands:[...damage,'HEAL'],scope:heal[1].startsWith('おたがい')?'both':heal[1].startsWith('自分のたね')?'basic':heal[1].startsWith('自分のバトル')?'active':'bench',choice:heal[3]==='1匹',type:heal[2]||heal[4]||null,amount:heal[5]==='すべて'?'all':Number(heal[6]),sharedWording:true};
 return null;
}
function massSharedPlan(entry,kind,text){
 const attack=kind==='ATTACK',ability=kind==='ABILITY',trainer=kind==='MAIN'&&['item','supporter'].includes(entry.category);
 const printed=String(entry.damage??'0').normalize('NFKC');
 const damage=attack&&/^\d+$/.test(printed)?Number(printed):0;
 if(attack&&!/^\d+$/.test(printed)&&!/^\d+\+$/.test(printed))return null;
 let body=text,activeOnly=false,repeated=false;
 if(ability){
  if(body.startsWith('このポケモンがバトル場にいるなら、自分の番に1回使える。')){body=body.slice('このポケモンがバトル場にいるなら、自分の番に1回使える。'.length);activeOnly=true;}
  else if(body.startsWith('自分の番に1回使える。'))body=body.slice('自分の番に1回使える。'.length);
  else if(body.startsWith('自分の番に何回でも使える。')){body=body.slice('自分の番に何回でも使える。'.length);repeated=true;}
  else return null;
 }
 const fixed=!attack||/^\d+$/.test(printed);
 // All holder assignments are explicit dependent selections in the same
 // canonical action; neither the AI nor the browser may infer destinations.
 if(fixed&&(attack||ability||trainer)){
  const attach=body.match(/^自分の(山札|トラッシュ|手札)から(基本エネルギー|「基本\[([草炎水雷超闘悪鋼])\]エネルギー」)を(1枚|[2-9]枚まで|好きなだけ)選び、(このポケモン|自分のポケモン1匹|自分のポケモン|ベンチポケモン1匹|ベンチポケモン|自分の\[[草炎水雷超闘悪鋼竜無色]\]ポケモン|(?:ベンチの|自分の)「(?:ロケット団|ヒビキ|ナンジャモ|シロナ|リーリエ|ホップ|N|ペパー|カスミ|ダイゴ)のポケモン」(?:1匹)?)(に好きなように|に)つける。(そして山札を切る。)?(その後、つけたポケモンのHPを「([1-9]\d{0,2})」回復する。|その後、つけたポケモンのHPをすべて回復する。)?$/);
  if(attach&&Boolean(attach[7])===(attach[1]==='山札')){
   const [,zone,,type,count,holder,distribution,,healing,amount]=attach;
   const multi=distribution==='に好きなように',limit=count==='好きなだけ'?60:parseInt(count,10);
   const self=holder==='このポケモン',bench=holder.startsWith('ベンチ'),team=holder.match(/「(.+)のポケモン」/)?.[1],holderType=holder.match(/\[([^\]]+)\]/)?.[1];
   if((!multi&&(limit===1||self||holder.endsWith('1匹'))||multi&&!self&&!holder.endsWith('1匹'))&&(!healing||!multi))
    return {mechanic:'MASS_ENERGY_ROUTE',commands:[...(damage?['DAMAGE']:[]),...(zone==='山札'?['SEARCH_DECK']:[]),'ATTACH_ENERGY',...(zone==='山札'?['SHUFFLE_DECK']:[]),...(healing?['HEAL']:[])],zone:({'山札':'deck','トラッシュ':'discard','手札':'hand'})[zone],type:type||null,limit,target:self?'self':bench?'bench':'own',holderType:holderType||null,team:team||null,multi,heal:healing?(amount?Number(amount):'all'):null,activeOnly,repeated,sharedWording:true};
  }
 }

 if(repeated)return null;
 if((attack||ability||trainer)&&fixed){
  const namedSupporter=body.match(/^自分の山札から、名前に「([^「」]{1,40})」とつくサポートを(1枚|[2-9]枚まで)選び、相手に見せて、手札に加える。そして山札を切る。$/);
  const teamEnergy=body.match(/^自分の山札から「(ロケット団|ヒビキ|ナンジャモ|シロナ|リーリエ|ホップ|N|ペパー|カスミ|ダイゴ)のポケモン」と「基本\[([草炎水雷超闘悪鋼])\]エネルギー」を合計([2-9])枚まで選び、相手に見せて、手札に加える。そして山札を切る。$/);
  const basicOrEnergy=body.match(/^自分の山札から\[([草炎水雷超闘悪鋼])\]タイプのたねポケモンまたは「基本\[([草炎水雷超闘悪鋼])\]エネルギー」を1枚選び、相手に見せて、手札に加える。そして山札を切る。$/);
  const searchPlan=(category,limit,extra)=>({mechanic:'MASS_ZONE_TRANSFER',commands:[...(damage?['DAMAGE']:[]),'SEARCH_DECK','REVEAL','ADD_TO_HAND','SHUFFLE_DECK'],zone:'deck',destination:'hand',category,type:null,stage:null,team:null,limit,activeOnly,sharedWording:true,...extra});

  const namedExact=body.match(/^自分の(山札|トラッシュ)から「(マコモ|変化の書|ヒビキの冒険|ペパーのサンドウィッチ)」を(1枚|[2-9]枚まで|好きなだけ)選び、相手に見せて、手札に加える。(そして山札を切る。)?$/);
  if(namedExact&&Boolean(namedExact[4])===(namedExact[1]==='山札')){
   const zone=namedExact[1]==='山札'?'deck':'discard';
   return {mechanic:'MASS_ZONE_TRANSFER',commands:[...(damage?['DAMAGE']:[]),...(zone==='deck'?['SEARCH_DECK']:[]),'REVEAL','ADD_TO_HAND',...(zone==='deck'?['SHUFFLE_DECK']:[])],zone,destination:'hand',category:'any',nameExact:namedExact[2],type:null,stage:null,team:null,limit:namedExact[3]==='好きなだけ'?60:parseInt(namedExact[3],10),activeOnly,sharedWording:true};
  }
  const propSearch=body.match(/^自分の山札から、(にげるためのエネルギーが([0-5])個|抵抗力が\[([草炎水雷超闘悪鋼竜無色])\]タイプ)のポケモンを(1枚|[2-9]枚まで)選び、相手に見せて、手札に加える。そして山札を切る。$/);
  if(propSearch)return searchPlan('pokemon',parseInt(propSearch[4],10),propSearch[2]!==undefined?{retreatCost:Number(propSearch[2])}:{resistanceType:propSearch[3]});
  const namedTool=body.match(/^自分の山札から、名前に「([^「」]{1,40})」とつく「ポケモンのどうぐ」を(1枚|[2-9]枚まで)選び、相手に見せて、手札に加える。そして山札を切る。$/);
  if(namedTool)return searchPlan('tool',parseInt(namedTool[2],10),{nameContains:namedTool[1]});
  const mixedRecover=body.match(/^自分のトラッシュからポケモンと基本エネルギーを合計([2-9])枚まで選び、相手に見せて、手札に加える。$/);
  if(mixedRecover)return {mechanic:'MASS_ZONE_TRANSFER',commands:[...(damage?['DAMAGE']:[]),'REVEAL','ADD_TO_HAND'],zone:'discard',destination:'hand',category:'pokemonOrBasicEnergy',type:null,stage:null,team:null,energyType:null,limit:Number(mixedRecover[1]),activeOnly,sharedWording:true};
  const otherTeam=body.match(/^自分の山札から「(エリカ|マリィ)のポケモン」を(1枚|[2-9]枚まで)選び、相手に見せて、手札に加える。そして山札を切る。$/);
  if(otherTeam)return searchPlan('pokemon',parseInt(otherTeam[2],10),{team:otherTeam[1]});
  if(namedSupporter)return searchPlan('supporter',parseInt(namedSupporter[2],10),{nameContains:namedSupporter[1]});
  if(teamEnergy)return searchPlan('pokemonOrBasicEnergy',Number(teamEnergy[3]),{team:teamEnergy[1],energyType:teamEnergy[2]});
  if(basicOrEnergy)return searchPlan('pokemonOrBasicEnergy',1,{type:basicOrEnergy[1],stage:0,energyType:basicOrEnergy[2]});
  const combinedTrainer=body.match(/^自分の山札から(サポートとスタジアム|スタジアムとエネルギー)を(合計([2-9])枚まで|1枚ずつ)選び、相手に見せて、手札に加える。そして山札を切る。$/);
  const differentBasic=body.match(/^自分の山札から、それぞれちがうタイプの基本エネルギーを([2-8]枚まで|好きなだけ)選び、相手に見せて、手札に加える。そして山札を切る。$/);
  const twoBasic=body.match(/^自分の山札から「基本\[([草炎水雷超闘悪鋼])\]エネルギー」と「基本\[([草炎水雷超闘悪鋼])\]エネルギー」を1枚ずつ選び、相手に見せて、手札に加える。そして山札を切る。$/);
  const searchMany=(category,limit,extra)=>({mechanic:'MASS_ZONE_TRANSFER',commands:[...(damage?['DAMAGE']:[]),'SEARCH_DECK','REVEAL','ADD_TO_HAND','SHUFFLE_DECK'],zone:'deck',destination:'hand',category,type:null,stage:null,team:null,limit,activeOnly,sharedWording:true,...extra});
  if(combinedTrainer)return searchMany('categorySet',combinedTrainer[3]?Number(combinedTrainer[3]):2,{categories:combinedTrainer[1]==='サポートとスタジアム'?['supporter','stadium']:['stadium','energy'],...(combinedTrainer[3]?{}:{distinctBy:'category'})});
  if(differentBasic)return searchMany('basicEnergy',differentBasic[1]==='好きなだけ'?8:parseInt(differentBasic[1],10),{distinctBy:'energyType'});
  if(twoBasic&&twoBasic[1]!==twoBasic[2])return searchMany('basicEnergy',2,{energyTypes:[twoBasic[1],twoBasic[2]],distinctBy:'energyType'});
  const transfer=body.match(/^自分の(山札|トラッシュ)から(ポケモン|トレーナーズ|グッズ|サポート|スタジアム|エネルギー|基本エネルギー|「ポケモンのどうぐ」|[12]進化ポケモン|たねポケモン|\[(?:草|炎|水|雷|超|闘|悪|鋼|竜|無色)\](?:タイプの)?(?:たね|進化)?ポケモン|「基本\[(?:草|炎|水|雷|超|闘|悪|鋼)\]エネルギー」|「(?:ロケット団|ヒビキ|ナンジャモ|シロナ|リーリエ|ホップ|N|ペパー|カスミ|ダイゴ)のポケモン」)を(1枚|[2-9]枚まで)選び、相手に見せて、(手札に加える。|山札にもどして切る。)(そして山札を切る。)?$/);
  if(transfer){
   const [,source,filter,count,dest,shuffle]=transfer,zone=source==='山札'?'deck':'discard',destination=dest.startsWith('手札')?'hand':'deck';
   if((zone==='deck'&&destination==='hand'&&shuffle)||(zone==='discard'&&!shuffle)){
    const types=filter.match(/\[([^\]]+)\]/),stage=filter.includes('たね')?0:filter.includes('1進化')?1:filter.includes('2進化')?2:filter.includes('進化')?'evolved':null;
    const team=filter.match(/^「(.+)のポケモン」$/)?.[1];
    const category=({'ポケモン':'pokemon','トレーナーズ':'trainer','グッズ':'item','サポート':'supporter','スタジアム':'stadium','エネルギー':'energy','基本エネルギー':'basicEnergy','「ポケモンのどうぐ」':'tool'})[filter]||(filter.includes('エネルギー')?'basicEnergy':'pokemon');
    return {mechanic:'MASS_ZONE_TRANSFER',commands:[...(damage?['DAMAGE']:[]),...(zone==='deck'?['SEARCH_DECK']:[]),'REVEAL',destination==='hand'?'ADD_TO_HAND':'RETURN_TO_DECK',...(zone==='deck'||destination==='deck'?['SHUFFLE_DECK']:[])],zone,destination,category,type:types?.[1]||null,stage,team:team||null,limit:parseInt(count,10),activeOnly,sharedWording:true};
   }
  }
  const heal=body.match(/^自分の(?:(?:\[([草炎水雷超闘悪鋼竜無色])\](?:タイプの)?)?ポケモン(1匹|全員)|バトルポケモン)のHPを、?(?:それぞれ)?「([1-9]\d{0,2})」回復する。$/);
  if(heal)return {mechanic:'MASS_HEAL_OWN',commands:[...(damage?['DAMAGE']:[]),'HEAL'],type:heal[1]||null,target:heal[2]==='全員'?'all':heal[2]==='1匹'?'choice':'active',amount:Number(heal[3]),activeOnly,sharedWording:true};
  const draw=body.match(/^自分の山札を([1-9])枚引く。相手のサイドの残り枚数が([1-6])枚以下なら、さらに([1-9])枚引く。$/);
  if(draw)return {mechanic:'MASS_PRIZE_DRAW',commands:[...(damage?['DAMAGE']:[]),'DRAW'],amount:Number(draw[1]),threshold:Number(draw[2]),extra:Number(draw[3]),activeOnly,sharedWording:true};
  const scopedCounter=body.match(/^(相手のバトルポケモン|相手のベンチポケモン1匹|ダメカンがのっている相手のポケモン全員|おたがいの特性を持つポケモン全員)に、(?:それぞれ)?ダメカンを([1-9]\d?)個のせる。$/);
  if(attack&&scopedCounter){
   const target={'相手のバトルポケモン':'active','相手のベンチポケモン1匹':'benchChoice','ダメカンがのっている相手のポケモン全員':'damagedOpponent','おたがいの特性を持つポケモン全員':'bothAbility'}[scopedCounter[1]];
   return {mechanic:'MASS_PLACE_COUNTERS',commands:[...(damage?['DAMAGE']:[]),'PLACE_DAMAGE_COUNTERS'],target,amount:Number(scopedCounter[2]),activeOnly,sharedWording:true};
  }
  const counter=body.match(/^相手のポケモン(1匹|全員)に、(?:それぞれ)?ダメカンを([1-9]\d?)個のせる。$/);
  if(counter&&(attack||ability))return {mechanic:'MASS_PLACE_COUNTERS',commands:[...(damage?['DAMAGE']:[]),'PLACE_DAMAGE_COUNTERS'],target:counter[1]==='全員'?'all':'choice',amount:Number(counter[2]),activeOnly,sharedWording:true};
 }
 if(attack&&/^\d+\+$/.test(printed)){
  const bonus=body.match(/^(相手のバトルポケモンが(?:こんらん|やけど|ねむり|マヒ)なら|このポケモンが(?:こんらん|やけど|どくまたはやけど)なら|自分の手札と相手の手札が同じ枚数なら|相手のベンチポケモンの数が[1-5]匹以上なら|自分のベンチに\[[草炎水雷超闘悪鋼竜無色]\](?:タイプの[12]進化)?ポケモンがいるなら)、([1-9]\d{0,2})ダメージ追加。$/);
  if(bonus){
   const clause=bonus[1],status=clause.match(/が(こんらん|やけど|ねむり|マヒ|どくまたはやけど)なら/),bench=clause.match(/数が([1-5])匹以上/),typed=clause.match(/\[([^\]]+)\](?:タイプの([12])進化)?/);
   const states={'こんらん':['CONFUSED'],'やけど':['BURNED'],'ねむり':['ASLEEP'],'マヒ':['PARALYZED'],'どくまたはやけど':['POISONED','BURNED']};
   return {mechanic:'MASS_CONTEXT_BONUS',commands:['DAMAGE'],base:parseInt(printed,10),bonus:Number(bonus[2]),predicate:status?(clause.startsWith('相手')?'opponentStatus':'ownStatus'):bench?'opponentBench':typed?'ownTypedBench':'equalHand',...(status?{statuses:states[status[1]]}:bench?{threshold:Number(bench[1])}:typed?{type:typed[1],stage:typed[2]?Number(typed[2]):null}:{}),sharedWording:true};
  }
 }
 return null;
}
// Compose only complete, anchored, reviewed Japanese clauses. The initial
// damage is resolved once; the ordered instructions never infer omitted text.
function sequencePlan(entry,kind,text,extended=false){
 const attack=kind==='ATTACK',ability=kind==='ABILITY',trainer=kind==='MAIN'&&['item','supporter'].includes(entry.category);
 const printed=String(entry.damage??'0').normalize('NFKC');
 if(!(attack||ability||trainer)||attack&&!/^\d+$/.test(printed))return null;
 let body=text,origin=null,activeOnly=false;
 if(ability){
  const prefixes=[['自分の番に、このカードを手札から出して進化させたとき、1回使える。','evolve'],['自分の番に、このカードを手札からベンチに出したとき、1回使える。','bench'],['このポケモンがバトル場にいるなら、自分の番に1回使える。','active'],['自分の番に1回使える。','field']];
  const found=prefixes.find(([prefix])=>body.startsWith(prefix));if(!found)return null;
  body=body.slice(found[0].length);origin=found[1];activeOnly=origin==='active';
 }
 // Exact two-clause printed effect; preserve the attachment operation before status.
 if(attack){const combo=body.match(/^このポケモンについているエネルギーをすべてトラッシュし、相手のバトルポケモンを(マヒ|ねむり|こんらん|どく|やけど)にする。$/);
  if(combo)return {mechanic:'MASS_EFFECT_SEQUENCE',commands:[...(Number(printed)>0?['DAMAGE']:[]),'DISCARD','STATUS_CONDITION'],steps:[{op:'discardAttached'},{op:'status',side:'opponent',status:({'マヒ':'PARALYZED','ねむり':'ASLEEP','こんらん':'CONFUSED','どく':'POISONED','やけど':'BURNED'})[combo[1]]}],origin:null,activeOnly:false,sharedWording:true};}
 const raw=body.match(/[^。]+。/g);
 const generatedAttack=extended==='attack';
 if(!raw||raw.join('')!==body||raw.length>(generatedAttack?8:3))return null;
 const steps=[];
 // The extended grammar is a fallback only: previously compiled plans keep
 // their exact representation. Every clause must match a reviewed operation.
 if(generatedAttack?!attack:extended&&!trainer)return null;
 for(const [index,original] of raw.entries()){
  const clause=extended&&index>0?original.replace(/^その後、/,''):original;
  let m;
  if(generatedAttack&&index===0&&(m=clause.match(/^自分の手札を([1-9])枚(?:選び、)?トラッシュする。$/)))steps.push({op:'discardOwnHand',amount:Number(m[1])});
  else if(generatedAttack&&index===0&&(m=clause.match(/^相手の手札からオモテを見ないで([1-9])枚選び、トラッシュする。$/)))steps.push({op:'blindDiscardOpponent',amount:Number(m[1]),side:'opponent'});
  else if((m=clause.match(/^自分の山札を([1-9])枚引く。$/)))steps.push({op:'draw',amount:Number(m[1])});
  else if(extended&&!generatedAttack&&index>0&&steps.at(-1)?.op==='draw'&&(m=clause.match(/^自分の手札が([1-9]\d?)枚以上あるなら、さらに([1-9])枚引く。$/)))steps.push({op:'drawIfHand',threshold:Number(m[1]),amount:Number(m[2])});
  else if(extended&&!generatedAttack&&clause==='相手の手札を見る。')steps.push({op:'revealHand',side:'opponent'});
  else if(extended&&!generatedAttack&&(m=clause.match(/^相手の山札を上から([1-9]\d?)枚見て、もとにもどす。$/)))steps.push({op:'peekTop',side:'opponent',amount:Number(m[1])});
  else if((m=clause.match(/^(自分|相手)の山札を上から([1-9]\d?)枚トラッシュする。$/)))steps.push({op:'mill',side:m[1]==='自分'?'own':'opponent',amount:Number(m[2])});
  else if((attack||ability)&&(m=clause.match(/^このポケモンのHPを「([1-9]\d{0,2})」回復する。$/)))steps.push({op:'healSelf',amount:Number(m[1])});
  else if(attack&&clause==='相手のバトルポケモンに与えたダメージぶん、このポケモンのHPを回復する。'&&Number(printed)>0)steps.push({op:'drain'});
  else if(attack&&(m=clause.match(/^(このポケモン|相手のバトルポケモン)を(どく|やけど|ねむり|こんらん|マヒ)にする。$/)))steps.push({op:'status',side:m[1]==='このポケモン'?'own':'opponent',status:({'どく':'POISONED','やけど':'BURNED','ねむり':'ASLEEP','こんらん':'CONFUSED','マヒ':'PARALYZED'})[m[2]]});
  else if(ability&&origin==='active'&&(m=clause.match(/^相手のバトルポケモンを(やけど|ねむり)にする。$/)))steps.push({op:'status',side:'opponent',status:({'やけど':'BURNED','ねむり':'ASLEEP'})[m[1]]});
  else if(attack&&clause==='次の相手の番、このワザを受けたポケモンは、にげられない。')steps.push({op:'retreatLock',side:'opponent',offset:1});
  else if(attack&&clause==='次の自分の番、このポケモンはにげられない。')steps.push({op:'retreatLock',side:'own',offset:2});
  else if(attack&&clause==='次の自分の番、このポケモンはワザが使えない。')steps.push({op:'attackLock',offset:2});
  else if(attack&&(m=clause.match(/^次の相手の番、このポケモンが受けるワザのダメージは「-([1-9]\d{0,2})」される。$/)))steps.push({op:'reduce',amount:Number(m[1])});
  else if(attack&&clause==='このポケモンについているエネルギーを、すべてトラッシュする。')steps.push({op:'discardAttached'});
  else if(attack&&clause==='次の相手の番、相手は手札からグッズを出して使えない。')steps.push({op:'itemLock'});
  else if(attack&&clause==='次の相手の番、このポケモンの弱点は、すべてなくなる。')steps.push({op:'noWeakness'});
  else return null;
 }
 // No combining attack-only effects with unrelated ability/Trainer semantics.
 // A complete sequence or a distinct entry-origin/single-effect pattern only.
 if(steps.length===1&&!['drain','noWeakness','mill','healSelf'].includes(steps[0].op)&&!['bench','evolve','active'].includes(origin))return null;
 if(ability&&steps.some(s=>!['draw','mill','healSelf'].includes(s.op))&&!(origin==='active'&&steps.length===1&&steps[0].op==='status'&&steps[0].side==='opponent'))return null;
 if(trainer&&steps.some(s=>!(extended?['draw','mill','drawIfHand','revealHand','peekTop']:['draw','mill']).includes(s.op)))return null;
 if(generatedAttack){
  // Synthesize a new program only when every clause is recognized and the
  // pre-action choice never depends on a later draw or state mutation.
  if(steps.length<2||!['discardOwnHand','blindDiscardOpponent'].includes(steps[0].op)||steps.slice(1).some(s=>!['draw','mill','healSelf','drain','status','retreatLock','attackLock','reduce','discardAttached','itemLock','noWeakness'].includes(s.op)))return null;
  if(new Set(steps.map(s=>s.op)).size!==steps.length)return null;
 }else{
  if(extended&&(!steps.some(s=>['drawIfHand','revealHand','peekTop'].includes(s.op))&&!raw.some((s,i)=>i>0&&s.startsWith('その後、'))))return null;
  if(extended&&steps[0]?.op!=='draw')return null;
 }
 const commands=[...(attack&&Number(printed)>0?['DAMAGE']:[]),...steps.flatMap(s=>({discardOwnHand:['DISCARD'],blindDiscardOpponent:['DISCARD'],draw:['DRAW'],drawIfHand:['DRAW'],revealHand:['REVEAL'],peekTop:['REVEAL'],mill:['DISCARD'],healSelf:['HEAL'],drain:['HEAL'],status:['STATUS_CONDITION'],retreatLock:['ADD_STATE'],attackLock:['ADD_STATE'],reduce:['ADD_STATE'],discardAttached:['DISCARD'],itemLock:['ADD_STATE'],noWeakness:['ADD_STATE']})[s.op])];
 return {mechanic:'MASS_EFFECT_SEQUENCE',commands:[...new Set(commands)],steps,origin,activeOnly,sharedWording:true};
}
function stadiumUpgradePlan(text){
 if(text==='このカードは、場に出ている「プリズムタワー」をトラッシュしなければ場に出せず、「プリズムタワー」を出した番でも場に出せる。おたがいの場の「メガフラエッテex」全員は、それぞれ最大HPが「+150」される。')return {mechanic:'STADIUM_NAMED_UPGRADE_HP',commands:['DISCARD','MODIFY_MAX_HP'],replaces:'プリズムタワー',name:'メガフラエッテex',amount:150,sharedWording:true};
 return null;
}
function plan(entry,kind){
 const text=kind==='MAIN'?mainText(entry.text):norm(entry.text);
 if(kind==='ATTACK'&&text===''&&/^\d+$/.test(String(entry.damage)))return {mechanic:'VANILLA_DAMAGE',commands:['DAMAGE']};
 if(kind==='ATTACK'&&text==='次の相手の番、このワザを受けたポケモンは、にげられない。'&&/^\d+$/.test(String(entry.damage||'0')))return {mechanic:'RETREAT_LOCK_ATTACK',commands:['DAMAGE','ADD_STATE']};
 const draw=kind==='ATTACK'&&text.match(/^自分の山札を([1-9])枚引く。$/);
 if(draw&&/^\d+$/.test(String(entry.damage||'0')))return {mechanic:'ATTACK_DRAW',commands:['DAMAGE','DRAW'],draw:Number(draw[1])};
 const known=byText.get(text);if(known)return {...known,commands:[...known.commands]};
 const generic=text.normalize('NFKC');
 if(kind==='MAIN'&&entry.category==='tool'&&entry.attacks?.length===1){
  const a=entry.attacks[0],grant='このカードをつけているポケモンは、このカードに書かれているワザを使える。[ワザを使うためのエネルギーは必要。]';
  const named='このカードをつけている「メガジガルデex」は、このカードに書かれているワザを使える。[ワザを使うためのエネルギーは必要。]';
  const expires=grant+'ポケモンについているこのカードは、自分の番の終わりにトラッシュする。';
  const exact=(name,cost,damage,body)=>a.name===name&&JSON.stringify(a.cost)===JSON.stringify(cost)&&String(a.damage)===damage&&norm(a.text)===body;
  if(generic===grant&&entry.name==='メガレックウザキャップ'&&exact('デルタギフト',['無色'],'0','「メガレックウザキャップ」がついている自分のポケモン全員に、山札から基本エネルギーを1枚ずつつける。そして山札を切る。'))return {mechanic:'TOOL_GRANTED_ATTACK',commands:['ADD_STATE'],sharedWording:true};
  if(generic===named&&entry.name==='コアメモリ'&&exact('ジオバスター',['闘','闘','闘','闘'],'350','このポケモンについているエネルギーを、すべてトラッシュする。'))return {mechanic:'TOOL_GRANTED_ATTACK',commands:['ADD_STATE'],holderName:'メガジガルデex',sharedWording:true};
  if(generic===expires&&entry.name==='ワザマシンフローライト'&&exact('フローライト',['草','水','超'],'0','このポケモンについているエネルギーをすべてトラッシュし、自分の「テラスタル」のポケモン全員のHPを、すべて回復する。'))return {mechanic:'TOOL_GRANTED_ATTACK',commands:['ADD_STATE'],endTurnDiscard:true,sharedWording:true};
 }
 if(kind==='ATTACK'&&entry.name==='デルタギフト'&&generic==='「メガレックウザキャップ」がついている自分のポケモン全員に、山札から基本エネルギーを1枚ずつつける。そして山札を切る。')return {mechanic:'MASS_ENERGY_ROUTE',commands:['SEARCH_DECK','ATTACH_ENERGY','SHUFFLE_DECK'],zone:'deck',target:'own',toolName:'メガレックウザキャップ',limit:9,oneEach:true,multi:true,sharedWording:true};
 if(kind==='ATTACK'&&entry.name==='フローライト'&&generic==='このポケモンについているエネルギーをすべてトラッシュし、自分の「テラスタル」のポケモン全員のHPを、すべて回復する。')return {mechanic:'TOOL_ATTACK_TERA_HEAL',commands:['DISCARD','HEAL'],sharedWording:true};
 if(kind==='MAIN'&&entry.category==='stadium'){
  const upgrade=stadiumUpgradePlan(generic);if(upgrade)return upgrade;
  if(generic==='自分の場に「テラスタル」のポケモンがいるプレイヤーが、ベンチに出せるポケモンの数は8匹になる。(このカードがトラッシュされたときか、自分の場に「テラスタル」のポケモンがいなくなったとき、ベンチが5匹になるまでトラッシュする。おたがいにトラッシュするなら、このカードの持ち主から行う。)')return {mechanic:'STADIUM_ZERO_AREA',commands:['ADD_STATE'],sharedWording:true};
  if(generic==='おたがいのどくのポケモン([悪]ポケモンをのぞく)全員は、どくでのせるダメカンの数がそれぞれ2個多くなる。')return {mechanic:'STADIUM_POISON_BOOST',commands:['ADD_STATE'],amount:2,exceptType:'悪',sharedWording:true};
  if(generic==="おたがいのプレイヤーは、自分の番ごとに1回、自分の場のたねポケモン1匹から進化する1進化ポケモンを、自分の山札から1枚選び、そのポケモンにのせて進化させてよい。進化したなら、続けて2進化ポケモンを1枚選び、進化させてよい。そして山札を切る。(最初の自分の番や、出したばかりのたねポケモンは進化させられない。)")return {mechanic:'STADIUM_ACTIVE',mode:'greatTree',commands:['SEARCH_DECK','ADD_STATE','SHUFFLE_DECK'],sharedWording:true};
  if(generic==="おたがいのプレイヤーは、自分の番ごとに1回、手札からエネルギーを1枚トラッシュするなら、自分の手札の枚数が、自分の場の[超]ポケモンの数と同じ枚数になるように、山札を引いてよい。")return {"mechanic":"STADIUM_ACTIVE","mode":"psychicDraw","commands":["DISCARD","DRAW"],"sharedWording":true};
  if(generic==="おたがいのプレイヤーは、自分の番ごとに1回、自分のポケモン全員のHPを、それぞれ「10」回復してよい。その場合、自分の番は終わる。")return {"mechanic":"STADIUM_ACTIVE","mode":"healEnd","commands":["HEAL"],"amount":10,"endTurn":true,"sharedWording":true};
  if(generic==="おたがいのプレイヤーは、自分の番ごとに1回、自分のトラッシュから「基本[雷]エネルギー」を2枚まで選び、相手に見せて、手札に加えてよい。")return {"mechanic":"STADIUM_ACTIVE","mode":"lightningRecover","commands":["REVEAL","ADD_TO_HAND"],"amount":2,"sharedWording":true};
  if(generic==="おたがいのプレイヤーは、自分の番ごとに1回、自分の山札からたねポケモンを1枚選び、ベンチに出してよい。そして山札を切る。この効果を使ったなら、自分の番は終わる。")return {"mechanic":"STADIUM_ACTIVE","mode":"basicBench","commands":["SEARCH_DECK","BENCH_FROM_ZONE","SHUFFLE_DECK"],"amount":1,"endTurn":true,"sharedWording":true};
  if(generic==="この番に、手札から、名前に「ロケット団」とつくサポートを出して使っていたプレイヤーは、自分の番ごとに1回、自分の山札を2枚引いてよい。")return {"mechanic":"STADIUM_ACTIVE","mode":"rocketDraw","commands":["DRAW"],"amount":2,"sharedWording":true};
  if(generic==="おたがいのプレイヤーは、自分の番ごとに1回、自分の手札を2枚トラッシュするなら、自分の山札を1枚引いてよい。")return {"mechanic":"STADIUM_ACTIVE","mode":"discardDraw","commands":["DISCARD","DRAW"],"amount":1,"cost":2,"sharedWording":true};
  if(generic==="おたがいのプレイヤーは、自分の番ごとに1回、自分のバトル場の[水]ポケモンを、ベンチの[水]ポケモンと入れ替えてよい。")return {"mechanic":"STADIUM_ACTIVE","mode":"waterSwitch","commands":["SWITCH"],"sharedWording":true};
  if(generic==="おたがいのプレイヤーは、自分の番ごとに1回、自分のポケモン(「ルールを持つポケモン」をのぞく)全員のHPを、それぞれ「20」回復してよい。")return {"mechanic":"STADIUM_ACTIVE","mode":"nonRuleHeal","commands":["HEAL"],"amount":20,"sharedWording":true};
  if(generic==="おたがいのプレイヤーは、自分の番ごとに1回、自分の山札から「マリィのポケモン」を1枚選び、相手に見せて、手札に加えてよい。そして山札を切る。")return {"mechanic":"STADIUM_ACTIVE","mode":"marnieSearch","commands":["SEARCH_DECK","REVEAL","ADD_TO_HAND","SHUFFLE_DECK"],"amount":1,"sharedWording":true};
  if(generic==="おたがいのプレイヤーは、自分の番ごとに1回、自分の手札を1枚選び、山札の上にもどしてよい。")return {"mechanic":"STADIUM_ACTIVE","mode":"handTop","commands":["RETURN_TO_DECK"],"sharedWording":true};
  if(generic==="この番、手札からサポートを出して使っていたプレイヤーは、自分の番ごとに1回、自分のポケモン全員のHPを、それぞれ「10」回復してよい。")return {"mechanic":"STADIUM_ACTIVE","mode":"supporterHeal","commands":["HEAL"],"amount":10,"sharedWording":true};
  if(generic==='おたがいの[草]ポケモン全員は、出したばかりの番(最初の自分の番をのぞく)でも[草]ポケモンに進化できる。')return {mechanic:'STADIUM_GRASS_EVOLUTION',commands:['ADD_STATE'],sharedWording:true};
  if(generic==='おたがいのこんらんのポケモンは、進化・退化してもこんらんが回復しない。')return {mechanic:'STADIUM_CONFUSION_RETENTION',commands:['STATUS_CONDITION'],sharedWording:true};
  if(generic==='おたがいのポケモン(「ルールを持つポケモン」をのぞく)全員は、相手の「ポケモンex・V」からワザのダメージを受けない。このカードは、トラッシュにあるかぎり、手札に加えられず、山札にもどせない。')return {mechanic:'STADIUM_NEUTRAL_CENTER',commands:['PREVENT_DAMAGE','ADD_STATE'],sharedWording:true};
 }
 if(kind==='MAIN'&&entry.category==='energy'){
  const guard=generic.match(/^このカードは、ポケモンについているかぎり、\[(無色|闘)\]エネルギー1個ぶんとしてはたらく。このカードをつけている(\[闘\])?ポケモンは、相手のポケモンが使うワザの効果を受けない。\(すでに受けている効果は、なくならない。\)$/);
  if(guard&&(guard[1]==='闘')===Boolean(guard[2]))return {mechanic:'ENERGY_ATTACK_EFFECT_GUARD',commands:['ATTACH_ENERGY','ADD_STATE'],energyType:guard[1],holderType:guard[2]?'闘':null,sharedWording:true};
  if(generic==='このカードは、ポケモンについているかぎり、[超]エネルギー1個ぶんとしてはたらく。このカードを手札から[超]ポケモンにつけたとき、自分の山札から[超]タイプのたねポケモンを2枚まで選び、ベンチに出す。そして山札を切る。')return {mechanic:'ENERGY_HAND_ATTACH_BASIC_BENCH',commands:['ATTACH_ENERGY','SEARCH_DECK','BENCH_FROM_ZONE','SHUFFLE_DECK'],energyType:'超',limit:2,sharedWording:true};
  const rainbow=generic.match(/^このカードは、ポケモンについているかぎり、\[無色\]エネルギー1個ぶんとしてはたらく。(たね|2進化)ポケモンについているなら、すべてのタイプのエネルギー([12])個ぶんとしてはたらく。$/);
  if(rainbow&&((rainbow[1]==='たね'&&rainbow[2]==='1')||(rainbow[1]==='2進化'&&rainbow[2]==='2')))return {mechanic:'ENERGY_STAGE_RAINBOW',commands:['ATTACH_ENERGY'],stage:rainbow[1]==='たね'?0:2,units:Number(rainbow[2]),sharedWording:true};
  const typed=generic.match(/^このカードは、ポケモンについているかぎり、\[([草炎水雷超闘悪鋼])\]エネルギー1個ぶんとしてはたらく。このカードをつけている\[\1\]ポケモン(は、最大HPが「\+([1-9]\d{0,2})」される。|は、にげるためのエネルギーが、すべてなくなる。|が使うワザの、相手のバトルポケモンへのダメージは「\+([1-9]\d{0,2})」される。|は、ベンチにいるかぎり、相手のワザのダメージを受けない。)$/);
  if(typed){
   const mode=typed[3]?'hp':typed[4]?'boost':typed[2].includes('にげる')?'retreat':'benchGuard';
   return {mechanic:'ENERGY_TYPED_PASSIVE',commands:['ATTACH_ENERGY',({hp:'MODIFY_MAX_HP',boost:'MODIFY_DAMAGE',retreat:'MODIFY_RETREAT_COST',benchGuard:'PREVENT_DAMAGE'})[mode]],energyType:typed[1],mode,amount:Number(typed[3]||typed[4]||0),sharedWording:true};
  }
 }
 if(kind==='MAIN'&&entry.category==='stadium'){
  const retreatTeam=generic.match(/^おたがいの場の「([^「」]+)のポケモン」全員のにげるためのエネルギーは、すべてなくなる。$/);
  const retreatName=generic.match(/^おたがいの「([^「」]+)」全員のにげるためのエネルギーは、それぞれ([1-9])個ぶん少なくなる。$/);
  if(retreatTeam||retreatName)return {mechanic:'STADIUM_FILTERED_RETREAT',commands:['MODIFY_RETREAT_COST'],team:retreatTeam?.[1]||null,name:retreatName?.[1]||null,free:!!retreatTeam,amount:Number(retreatName?.[2]||0),sharedWording:true};
  const boostTeam=generic.match(/^おたがいの「([^「」]+)のポケモン」が使うワザの、相手のバトルポケモンへのダメージは「\+([1-9]\d{0,2})」される。$/);
  if(boostTeam)return {mechanic:'STADIUM_TEAM_BOOST',commands:['MODIFY_DAMAGE'],team:boostTeam[1],amount:Number(boostTeam[2]),sharedWording:true};
  const reduction=generic.match(/^おたがいの(?:\[([草炎水雷超闘悪鋼竜]|無色)\]ポケモン|「([^「」]+)のポケモン」全員)が、相手のポケモンから受けるワザのダメージは「-([1-9]\d{0,2})」される。$/);
  if(reduction)return {mechanic:'STADIUM_FILTERED_REDUCTION',commands:['MODIFY_DAMAGE'],holderType:reduction[1]||null,team:reduction[2]||null,amount:Number(reduction[3]),sharedWording:true};
 }
 if(kind==='MAIN'&&entry.category==='tool'){
  if(generic==="自分の番ごとに1回、このカードをつけている[無色]ポケモンのワザで自分がコインを投げたとき、そのコインの結果をすべてなくし、はじめからコインを投げなおしてよい。")return {mechanic:'TOOL_RETRY_BADGE',commands:['COIN_FLIP'],holderType:'無色',oncePerTurn:true,sharedWording:true};
  if(generic==='このカードをつけている「メガシンカex」が、相手のポケモンからワザのダメージを受けてきぜつしたとき、自分の山札から好きなカードを1枚選び、手札に加える。そして山札を切る。')return {mechanic:'TOOL_KO_SEARCH',commands:['SEARCH_DECK','ADD_TO_HAND','SHUFFLE_DECK'],megaOnly:true,min:1,limit:1,sharedWording:true};
  if(generic==='このカードをつけているポケモンが、相手のポケモンからワザのダメージを受けてきぜつしたとき、自分の山札から好きなカードを3枚まで選び、手札に加える。そして山札を切る。')return {mechanic:'TOOL_KO_SEARCH',commands:['SEARCH_DECK','ADD_TO_HAND','SHUFFLE_DECK'],megaOnly:false,min:0,limit:3,sharedWording:true};
  if(generic==='このカードをつけているにげるためのエネルギーが4個のポケモンが、バトル場で相手のポケモンからワザのダメージを受けてきぜつしたとき、そのポケモンについている基本エネルギーを3枚まで選び、自分のベンチポケモンに好きなようにつけ替える。')return {mechanic:'TOOL_HEAVY_BATON',commands:['MOVE_ENERGY'],retreat:4,limit:3,sharedWording:true};
  if(generic==='自分の番の終わりに、このカードをつけているポケモンがバトル場にいるなら、自分のトラッシュから基本エネルギーを1枚選び、そのポケモンにつけてよい。')return {mechanic:'TOOL_END_TURN_ENERGY',commands:['ATTACH_ENERGY'],limit:1,sharedWording:true};
  const teamBoost=generic.match(/^このカードをつけている「([^「」]+)のポケモン」は、ワザを使うためのエネルギーが\[無色\]エネルギー([1-9])個ぶん少なくなり、そのポケモンが使うワザの、相手のバトルポケモンへのダメージは「\+([1-9]\d{0,2})」される。$/);
  if(teamBoost)return {mechanic:'TOOL_TEAM_COST_BOOST',commands:['MODIFY_ATTACK_COST','MODIFY_DAMAGE'],team:teamBoost[1],discount:Number(teamBoost[2]),amount:Number(teamBoost[3]),sharedWording:true};
  const namedBoost=generic.match(/^このカードをつけている「([^「」]+)」が使うワザの、相手のバトル場の「ポケモンex」へのダメージは「\+([1-9]\d{0,2})」される。$/);
  if(namedBoost)return {mechanic:'TOOL_NAMED_EX_BOOST',commands:['MODIFY_DAMAGE'],name:namedBoost[1],amount:Number(namedBoost[2]),sharedWording:true};
  const mega=generic.match(/^このカードをつけているポケモン\(「メガシンカex」をのぞく\)が、相手の「メガシンカex」から受けるワザのダメージは「-([1-9]\d{0,2})」される。$/);
  const ability=generic.match(/^このカードをつけているポケモンが、相手の特性を持つポケモンから受けるワザのダメージは「-([1-9]\d{0,2})」される。$/);
  const typed=generic.match(/^このカードをつけている\[([草炎水雷超闘悪鋼竜]|無色)\]ポケモンが、相手の((?:\[(?:[草炎水雷超闘悪鋼竜]|無色)\])+?)ポケモンから受けるワザのダメージは「-([1-9]\d{0,2})」される。$/);
  if(mega||ability||typed)return {mechanic:'TOOL_FILTERED_REDUCTION',commands:['MODIFY_DAMAGE'],mode:mega?'mega':ability?'ability':'types',holderType:typed?.[1]||null,attackerTypes:typed?[...typed[2].matchAll(/\[([^\]]+)\]/g)].map(x=>x[1]):[],amount:Number(mega?.[1]||ability?.[1]||typed[3]),sharedWording:true};
 }
 if(kind==='MAIN'&&['tool','energy'].includes(entry.category)){
  const energyPrefix='このカードは、ポケモンについているかぎり、[無色]エネルギー1個ぶんとしてはたらく。';
  const isEnergy=entry.category==='energy',body=isEnergy&&generic.startsWith(energyPrefix)?generic.slice(energyPrefix.length):generic;
  const hit=body.match(/^(このカードをつけているポケモンの弱点のタイプと、相手のバトルポケモンのタイプが同じなら、)?このカードをつけている(?:\[([草炎水雷超闘悪鋼竜]|無色)\]|「([^「」]+)のポケモン」)?(ポケモン)?が、バトル場で相手のポケモンからワザのダメージを受けたとき、(ワザを使ったポケモンにダメカンを([1-9]\d?)個のせる。|ワザを使ったポケモンをねむりにする。|自分の山札を([1-9])枚引く。)(その後、このカードをトラッシュする。)?$/);
  const mega=body.match(/^このカードをつけているポケモン\(「メガシンカex」をのぞく\)が、バトル場で相手の「メガシンカex」から「([1-9]\d{0,2})」以上のワザのダメージを受けたとき、ワザを使ったポケモンにダメカンを([1-9]\d?)個のせる。その後、このカードをトラッシュする。$/);
  if((hit&&Boolean(hit[3])!==Boolean(hit[4])||mega)&&(!isEnergy||generic.startsWith(energyPrefix)&&hit&&!hit[1]&&!hit[2]&&!hit[3]&&hit[6]&&!hit[8])){
   const counterCount=Number(mega?.[2]||hit?.[6]||0),drawCount=Number(hit?.[7]||0),status=!counterCount&&!drawCount?'ASLEEP':null,consume=!!mega||!!hit?.[8];
   return {mechanic:'ATTACHED_ACTIVE_HIT',commands:[...(isEnergy?['ATTACH_ENERGY']:[]),counterCount?'PLACE_DAMAGE_COUNTERS':drawCount?'DRAW':'STATUS_CONDITION',...(consume?['DISCARD']:[])],holderType:hit?.[2]||null,team:hit?.[3]||null,weakness:!!hit?.[1],megaOnly:!!mega,minDamage:Number(mega?.[1]||1),counterCount,drawCount,status,consume,energyType:isEnergy?'無色':null,sharedWording:true};
  }
  const survive=body.match(/^このカードをつけているポケモンのHPがまんたんの状態で、相手のポケモンからワザのダメージを受けてきぜつするとき、そのポケモンはきぜつせず、残りHPが「([1-9]\d?)」の状態で場に残る。その後、このカードをトラッシュする。$/);
  if(!isEnergy&&survive)return {mechanic:'TOOL_FULL_HP_SURVIVAL',commands:['ADD_STATE','DISCARD'],remainingHp:Number(survive[1]),sharedWording:true};
  const attach=body.match(/^このカードを手札からポケモンにつけたとき、自分の山札を([1-9])枚引く。$/);
  if(isEnergy&&generic.startsWith(energyPrefix)&&attach)return {mechanic:'ENERGY_HAND_ATTACH_DRAW',commands:['ATTACH_ENERGY','DRAW'],amount:Number(attach[1]),sharedWording:true};
 }
 if(kind==='MAIN'&&entry.category==='energy'){
  const status=generic.match(/^このカードは、ポケモンについているかぎり、\[([草炎水雷超闘悪鋼])\]エネルギー1個ぶんとしてはたらく。このカードをつけている\[\1\]ポケモンは、特殊状態にならず、受けている特殊状態は、すべて回復する。$/);
  if(status)return {mechanic:'ENERGY_TYPED_PASSIVE',commands:['ATTACH_ENERGY','STATUS_CONDITION'],energyType:status[1],mode:'statusGuard',amount:0,sharedWording:true};
 }
 if(kind==='MAIN'&&entry.category==='stadium'){
  if(generic==='エネルギーがついているおたがいのポケモン全員は、特殊状態にならず、受けている特殊状態は、すべて回復する。')return {mechanic:'STADIUM_ENERGY_STATUS_GUARD',commands:['STATUS_CONDITION'],sharedWording:true};
  if(generic==='おたがいのベンチポケモン全員は、相手のワザや特性の効果で、ダメカンがのらない。[ワザのダメージは受ける。]')return {mechanic:'STADIUM_BENCH_COUNTER_GUARD',commands:['PLACE_DAMAGE_COUNTERS'],sharedWording:true};
 }
 if(kind==='MAIN'&&entry.category==='tool'){
  const gravity=generic.match(/^このカードをつけているポケモンがバトル場にいるかぎり、おたがいのバトルポケモンのにげるためのエネルギーは、それぞれ([1-9])個ぶん多くなる。$/);
  if(gravity)return {mechanic:'TOOL_BOTH_ACTIVE_RETREAT_INCREASE',commands:['MODIFY_RETREAT_COST'],amount:Number(gravity[1]),sharedWording:true};
  const tera=generic.match(/^このカードをつけている「テラスタル」のポケモンがワザを使うとき、そのワザを使うためのエネルギーは、([1-9])個ぶん少なくなる。\(少なくなるのは、どのタイプのエネルギーでもよい。\)$/);
  if(tera)return {mechanic:'TOOL_TERA_ANY_COST_DISCOUNT',commands:['MODIFY_ATTACK_COST'],amount:Number(tera[1]),sharedWording:true};
 }
 if(kind==='MAIN'&&entry.category==='energy'){
  const recycle=generic.match(/^このカードは、ポケモンについているかぎり、\[([草炎水雷超闘悪鋼]|無色)\]エネルギー1個ぶんとしてはたらく。このカードをつけている(?:\[([草炎水雷超闘悪鋼])\])?ポケモンが使うワザの効果で、このカードがトラッシュされたなら、ワザのダメージや効果のあとに、(手札にもどす|もとのポケモンにつけなおす)。$/);
  if(recycle&&(!recycle[2]||recycle[1]===recycle[2]))return {mechanic:'ENERGY_SELF_ATTACK_RECYCLE',commands:['ATTACH_ENERGY',recycle[3]==='手札にもどす'?'RETURN_TO_HAND':'ATTACH_ENERGY'],energyType:recycle[1],holderType:recycle[2]||null,destination:recycle[3]==='手札にもどす'?'hand':'attached',sharedWording:true};
 }
 if(kind==='MAIN'&&entry.category==='energy'){
  if(generic==='このカードは、ポケモンについているかぎり、すべてのタイプのエネルギー1個ぶんとしてはたらく。このカードをつけているポケモンが、相手のポケモンからワザのダメージを受けてきぜつしたとき、とられるサイドは1枚少なくなる。対戦中、自分の「レガシーエネルギー」のこの効果は、1回しかはたらかない。')return {mechanic:'ENERGY_LEGACY_PRIZE_REDUCTION',commands:['ATTACH_ENERGY','ADD_STATE'],amount:1,oncePerGame:true,sharedWording:true};
 }
 if(kind==='MAIN'&&entry.category==='tool'){
  const pearl=generic.match(/^このカードをつけている「([^「」]+)のポケモン」が、相手のポケモンからワザのダメージを受けてきぜつしたとき、とられるサイドは([1-9])枚少なくなる。$/);
  if(pearl)return {mechanic:'TOOL_TEAM_KO_PRIZE_REDUCTION',commands:['ADD_STATE'],team:pearl[1],amount:Number(pearl[2]),sharedWording:true};
 }
 const guardedSearch=(category,limit,extras)=>({mechanic:'MASS_ZONE_TRANSFER',commands:['SEARCH_DECK',...(extras.privateSearch?[]:['REVEAL']),'ADD_TO_HAND','SHUFFLE_DECK'],zone:'deck',destination:'hand',category,type:null,stage:null,team:null,limit,activeOnly:false,sharedWording:true,...extras});
 if(kind==='MAIN'&&entry.category==='supporter'&&/^このカードは、自分の手札がこのカード1枚だけのときにしか使えない。\s*自分の山札から好きなカードを2枚まで選び、手札に加える。そして山札を切る。$/.test(generic))return guardedSearch('any',2,{onlyHandCard:true,privateSearch:true});
 if(kind==='MAIN'&&entry.category==='supporter'&&/^このカードは、先攻プレイヤーの最初の番でも使える。\s*自分の山札からたねポケモンの「ロケット団のポケモン」を3枚まで選び、相手に見せて、手札に加える。そして山札を切る。$/.test(generic))return guardedSearch('pokemon',3,{firstTurnAllowed:true,team:'ロケット団',stage:0});
 if(kind==='ABILITY'&&generic==='自分の手札が1枚もないなら、自分の番に1回使える。自分の山札からサポートを1枚選び、相手に見せて、手札に加える。そして山札を切る。')return guardedSearch('supporter',1,{emptyHand:true});
 if(kind==='MAIN'&&entry.category==='supporter'&&generic==='自分の山札から好きなカードを2枚選ぶ。残りの山札を切り、選んだカードを好きな順番に入れ替えて、山札の上にもどす。')return {mechanic:'DECK_ORDER_SELECT',commands:['SEARCH_DECK','SHUFFLE_DECK','RETURN_TO_DECK'],side:'own',count:2,search:true,sharedWording:true};
 if(kind==='ABILITY'&&generic==='このポケモンがバトル場にいるなら、自分の番に1回使える。自分の山札から好きなカードを1枚選ぶ。残りの山札を切り、選んだカードを山札の上にもどす。')return {mechanic:'DECK_ORDER_SELECT',commands:['SEARCH_DECK','SHUFFLE_DECK','RETURN_TO_DECK'],side:'own',count:1,search:true,activeOnly:true,sharedWording:true};
 const opponentOrder=generic.match(/^相手の山札を上から([1-9])枚見て、好きな順番に入れ替えて、山札の上にもどす。$/);
 if(kind==='ATTACK'&&opponentOrder&&/^\d+$/.test(String(entry.damage??'0').normalize('NFKC')))return {mechanic:'DECK_ORDER_SELECT',commands:[...(Number(entry.damage)>0?['DAMAGE']:[]),'REVEAL','RETURN_TO_DECK'],side:'opponent',count:Number(opponentOrder[1]),search:false,sharedWording:true};
 const hpPrizes=generic.match(/^相手がすでにとったサイド1枚につき、このポケモンの最大HPは「\+([1-9]\d{0,2})」される。$/);
 const hpEnergy=generic.match(/^このポケモンについている\[([草炎水雷超闘悪鋼])\]エネルギー1個につき、このポケモンの最大HPは「\+([1-9]\d{0,2})」される。$/);
 if(kind==='ABILITY'&&(hpPrizes||hpEnergy))return {mechanic:'PASSIVE_DYNAMIC_MAX_HP',commands:['MODIFY_MAX_HP'],mode:hpPrizes?'opponentPrizes':'energy',type:hpEnergy?.[1]||null,amount:Number(hpPrizes?.[1]||hpEnergy[2]),sharedWording:true};
 if(kind==='MAIN'&&entry.category==='item'){
  const bench=generic.match(/^自分の山札からたねポケモン(?:の「(ホップ)のポケモン」)?を(1枚|[2-5]枚まで|好きなだけ)選び、ベンチに出す。そして山札を切る。$/);
  if(bench)return {mechanic:'SEARCH_BASIC_TO_BENCH_ATTACK',commands:['SEARCH_DECK','BENCH_FROM_ZONE','SHUFFLE_DECK'],limit:bench[2]==='好きなだけ'?5:parseInt(bench[2],10),...(bench[1]?{team:bench[1]}:{}),trainer:true,batchSearch:true,sharedWording:true};
 }
 if(kind==='ABILITY'&&generic==='このポケモンがいるかぎり、自分のたねポケモン全員は、にげるためのエネルギーが、すべてなくなる。')return {mechanic:'SKYLINE',commands:['MODIFY_RETREAT_COST'],sharedWording:true};
 if(kind==='MAIN'&&entry.category==='stadium'){
  const hp=generic.match(/^おたがいの場の(たね|2進化)ポケモン全員の最大HPは、それぞれ「([+-][1-9][0-9]{0,2})」される。$/);
  if(hp)return {mechanic:'STADIUM_STAGE_HP',commands:['MODIFY_MAX_HP'],stage:hp[1]==='たね'?0:2,amount:Number(hp[2]),sharedWording:true};
 }

 if(kind==='ATTACK'&&/^\d+$/.test(String(entry.damage??'0'))){
  const acquire=(mode,amount,extra={})=>({mechanic:'MASS_HAND_ACQUISITION',commands:[...(Number(entry.damage)>0?['DAMAGE']:[]),...(mode==='search'?['SEARCH_DECK','ADD_TO_HAND','SHUFFLE_DECK']:['DRAW'])],mode,amount,sharedWording:true,...extra});
  const optional=generic.match(/^のぞむなら、自分の山札を([1-9]\d?)枚引く。$/);
  if(optional)return acquire('draw',Number(optional[1]));
  const bottom=generic.match(/^自分の山札を下から([1-9]\d?)枚引く。$/);
  if(bottom)return acquire('bottom',Number(bottom[1]));
 }

 // Shared counter operations: exact remaining HP, multiplication, allocation,
 // hand-size scaling and fixed distinct targets. Counters are not damage.
 if(kind==='ATTACK'&&/^\d+$/.test(String(entry.damage??'0'))){
  const cp=(mode,extra)=>({mechanic:'MASS_COUNTER_GRAMMAR',commands:[...(Number(entry.damage)>0?['DAMAGE']:[]),'PLACE_DAMAGE_COUNTERS'],mode,sharedWording:true,...extra});
  const hp=generic.match(/^(相手のバトルポケモン|相手のベンチポケモン全員|相手のポケモン[1-5]匹)(?:の|に、それぞれ)残りHPが「([1-9]\d{0,2})」になるように、ダメカンをのせる。$/);
  if(hp)return cp('remaining',{scope:hp[1]==='相手のバトルポケモン'?'active':hp[1].includes('ベンチ')?'bench':'choice',count:Number(hp[1].match(/[1-5]/)?.[0]||0),remaining:Number(hp[2])});
  const allocated=generic.match(/^ダメカン([1-9]\d?)個を、相手のポケモンに好きなようにのせる。$/);
  if(allocated)return cp('allocation',{amount:Number(allocated[1]),scope:'all'});
  const distinct=generic.match(/^相手のポケモン([2-5])匹に、それぞれダメカンを([1-9]\d?)個のせる。$/);
  if(distinct)return cp('fixed',{scope:'choice',count:Number(distinct[1]),amount:Number(distinct[2])});
  const hand=generic.match(/^自分の手札の枚数×([1-9]\d?)個ぶんのダメカンを、相手のバトルポケモンにのせる。$/);
  if(hand)return cp('hand',{scope:'active',unit:Number(hand[1])});
  const multiply=generic.match(/^相手のポケモン全員に、それぞれのっているダメカンの数が([2-9])倍になるように、ダメカンをのせる。$/);
  if(multiply)return cp('multiply',{scope:'all',unit:Number(multiply[1])-1});
 }

 // Shared, physically selected Energy transfers. Exact source, holder and
 // quantity phrases only; entry/switch/knockout-triggered transfers are separate.
 const movePlan=(source,target,count,extra={})=>({mechanic:'MASS_ATTACHED_ENERGY_MOVE',commands:[...(kind==='ATTACK'&&Number(entry.damage)>0?['DAMAGE']:[]),'MOVE_ENERGY'],source,target,count,optional:false,basic:false,type:null,multi:false,repeated:false,sharedWording:true,...extra});
 if(kind==='ATTACK'&&/^\d+$/.test(String(entry.damage??'0'))){
  const selfMove=generic.match(/^このポケモンについている(?:\[([草炎水雷超闘悪鋼])\])?エネルギーを(?:([1-9])個選び、|すべて、)(ベンチポケモン(?:1匹)?)(に好きなように|に)つけ替える。$/);
  if(selfMove&&(!selfMove[2]||Number(selfMove[2])>1||selfMove[1]))return movePlan('self','ownBench',selfMove[2]?Number(selfMove[2]):null,{type:selfMove[1]||null,multi:selfMove[4]==='に好きなように'});
  if(generic==='のぞむなら、相手のバトルポケモンについているエネルギーを1個選び、相手のベンチポケモンにつけ替える。')return movePlan('opponentActive','opponentBench',1,{optional:true});
  if(generic==='相手の場のポケモンについているエネルギーを1個選び、相手の別のポケモンにつけ替える。')return movePlan('opponentField','opponentOther',1);
 }
 if(kind==='ABILITY'){
  const move=generic.match(/^自分の番に(1回|何回でも)使える。自分の場のポケモンについている(基本エネルギー|「基本\[([草炎水雷超闘悪鋼])\]エネルギー」|エネルギー)を1個選び、(自分の別のポケモン|このポケモン)につけ替える。$/);
  if(move)return movePlan('ownField',move[4]==='このポケモン'?'self':'ownOther',1,{basic:move[2].includes('基本'),type:move[3]||null,repeated:move[1]==='何回でも'});
  const benchMove=generic.match(/^自分の番に何回でも使える。自分のベンチポケモンについている\[([草炎水雷超闘悪鋼])\]エネルギーを1個選び、バトルポケモンにつけ替える。$/);
  if(benchMove)return movePlan('ownBench','ownActive',1,{type:benchMove[1],repeated:true});
 }
 if(kind==='MAIN'&&entry.category==='supporter'&&generic==='自分のベンチポケモンについているエネルギーを2個まで選び、バトルポケモンにつけ替える。')return movePlan('ownBench','ownActive',2,{upTo:true});
 // One physical Energy per selected Pokemon; no duplicated destination.
 const benchEach=generic.match(/^自分のベンチポケモン全員に、(山札|トラッシュ)から「基本\[([草炎水雷超闘悪鋼])\]エネルギー」を1枚ずつつける。(そして山札を切る。)?$/);
 if(kind==='ATTACK'&&benchEach&&Boolean(benchEach[3])===(benchEach[1]==='山札')&&/^\d+$/.test(String(entry.damage??'0')))
  return {mechanic:'MASS_ENERGY_ROUTE',commands:[...(Number(entry.damage)>0?['DAMAGE']:[]),...(benchEach[1]==='山札'?['SEARCH_DECK']:[]),'ATTACH_ENERGY',...(benchEach[1]==='山札'?['SHUFFLE_DECK']:[])],zone:benchEach[1]==='山札'?'deck':'discard',type:benchEach[2],limit:5,target:'bench',holderType:null,team:null,multi:true,oneEach:true,allHolders:true,heal:null,sharedWording:true};
 if(kind==='MAIN'&&entry.category==='supporter'&&generic==='自分の[悪]ポケモンを2匹まで選び、自分の山札から「基本[悪]エネルギー」を1枚ずつつける。そして山札を切る。バトルポケモンにつけた場合、そのポケモンをどくにする。')
  return {mechanic:'MASS_ENERGY_ROUTE',commands:['SEARCH_DECK','ATTACH_ENERGY','SHUFFLE_DECK','STATUS_CONDITION'],zone:'deck',type:'悪',limit:2,target:'own',holderType:'悪',team:null,multi:true,oneEach:true,poisonActive:true,heal:null,sharedWording:true};
 if(kind==='MAIN'&&entry.category==='item'&&generic==='このカードは、自分の場に「テラスタル」のポケモンがいるときにしか使えない。自分のベンチの[無色]ポケモンを2匹まで選び、トラッシュから基本エネルギーを1枚ずつつける。')
  return {mechanic:'MASS_ENERGY_ROUTE',commands:['ATTACH_ENERGY'],zone:'discard',type:null,limit:2,target:'bench',holderType:'無色',team:null,multi:true,oneEach:true,requiresTera:true,heal:null,sharedWording:true};
 if(kind==='ATTACK'&&generic==='自分の山札から「基本[悪]エネルギー」を2枚まで選び、このポケモンにつける。そして山札を切る。つけた場合、このポケモンをどくにする。'&&/^\d+$/.test(String(entry.damage??'0')))
  return {mechanic:'MASS_ENERGY_ROUTE',commands:[...(Number(entry.damage)>0?['DAMAGE']:[]),'SEARCH_DECK','ATTACH_ENERGY','SHUFFLE_DECK','STATUS_CONDITION'],zone:'deck',type:'悪',limit:2,target:'self',holderType:null,team:null,multi:false,poisonActive:true,heal:null,sharedWording:true};
 if(kind==='MAIN'&&entry.category==='supporter'&&generic==='自分の「メガシンカex」1匹のHPを、すべて回復する。その後、回復したポケモンについているエネルギーを、すべて手札にもどす。')
  return {mechanic:'SUPPORTER_MEGA_HEAL_RETURN_ENERGY',commands:['HEAL','RETURN_TO_HAND'],sharedWording:true};

 const coinGuard=generic.match(/^(?:このポケモンに\[([草炎水雷超闘悪鋼])\]エネルギーがついているなら、)?このポケモンがワザのダメージを受けるとき、自分はコインを1回投げる。オモテなら、このポケモンはそのダメージを受けない。$/);
 if(kind==='ABILITY'&&coinGuard)return {mechanic:'PASSIVE_COIN_DAMAGE_GUARD',commands:['COIN_FLIP','PREVENT_DAMAGE'],energyType:coinGuard[1]||null,sharedWording:true};
 if(kind==='ABILITY'&&generic==='このポケモンが、ワザのダメージを受けてきぜつするとき、自分はコインを1回投げる。オモテなら、このポケモンはきぜつせず、残りHPが「10」の状態で場に残る。')return {mechanic:'PASSIVE_COIN_KO_SURVIVAL',commands:['COIN_FLIP','ADD_STATE'],remainingHp:10,sharedWording:true};
 if(kind==='ABILITY'&&generic==='このポケモンのHPがまんたんの状態で、このポケモンがワザのダメージを受けてきぜつするとき、きぜつせず、残りHPが「10」の状態で場に残る。')
  return {mechanic:'PASSIVE_FULL_HP_SURVIVAL',commands:['ADD_STATE'],remainingHp:10,sharedWording:true};
 if(kind==='ABILITY'&&generic==='このポケモンが使うワザのダメージは、相手のバトルポケモンにかかっている効果を計算しない。')
  return {mechanic:'PASSIVE_IGNORE_ACTIVE_DEFENSE',commands:['DAMAGE'],sharedWording:true};
 const retaliation=generic.match(/^このポケモンが、バトル場で相手のポケモンからワザのダメージを受けたとき、ワザを使ったポケモン(?:を(どく|やけど)にする|にダメカンを([1-9]\d?)個のせる)。$/);
 if(kind==='ABILITY'&&retaliation)
  return {mechanic:'PASSIVE_ACTIVE_HIT_RETALIATION',commands:[retaliation[1]?'STATUS_CONDITION':'PLACE_DAMAGE_COUNTERS'],status:retaliation[1]==='どく'?'POISONED':retaliation[1]==='やけど'?'BURNED':null,counterCount:retaliation[2]?Number(retaliation[2]):0,sharedWording:true};
 if(kind==='ABILITY'&&generic==='自分の番に、このカードを手札から出して進化させたとき、自分の場に「テラスタル」のポケモンがいるなら、1回使える。自分の山札からトレーナーズを2枚まで選び、相手に見せて、手札に加える。そして山札を切る。')
  return {mechanic:'MASS_ZONE_TRANSFER',commands:['SEARCH_DECK','REVEAL','ADD_TO_HAND','SHUFFLE_DECK'],zone:'deck',destination:'hand',category:'trainer',type:null,stage:null,team:null,limit:2,origin:'evolve',requiresTera:true,sharedWording:true};
 const evolveEnergy=generic.match(/^自分の番に、このカードを手札から出して進化させたとき、1回使える。自分のトラッシュから「基本\[([草炎水雷超闘悪鋼])\]エネルギー」を([1-9])枚まで選び、自分の\[([草炎水雷超闘悪鋼竜無色])\]ポケモンに好きなようにつける。$/);
 if(kind==='ABILITY'&&evolveEnergy)
  return {mechanic:'MASS_ENERGY_ROUTE',commands:['ATTACH_ENERGY'],zone:'discard',type:evolveEnergy[1],limit:Number(evolveEnergy[2]),target:'own',holderType:evolveEnergy[3],team:null,multi:true,heal:null,origin:'evolve',sharedWording:true};
 const discardBench=generic.match(/^自分のトラッシュから「([^「」]+)」を([1-5])枚まで選び、ベンチに出す。$/);
 if(kind==='ATTACK'&&discardBench&&/^\d+$/.test(String(entry.damage||'0')))
  return {mechanic:'ATTACK_NAMED_DISCARD_BENCH',commands:[...(Number(entry.damage)>0?['DAMAGE']:[]),'BENCH_FROM_ZONE'],name:discardBench[1],limit:Number(discardBench[2]),sharedWording:true};
 const evolveCounters=generic.match(/^自分の番に、このカードを手札から出して進化させたとき、1回使える。相手のポケモン([2-5])匹に、それぞれダメカンを([1-9])個のせる。$/);
 const evolveSingleCounter=generic.match(/^自分の番に、このカードを手札から出して進化させたとき、1回使える。相手のポケモン1匹に、ダメカンを([1-9])個のせる。$/);
 if(kind==='ABILITY'&&evolveSingleCounter)
  return {mechanic:'ABILITY_EVOLVE_MULTI_COUNTERS',commands:['PLACE_DAMAGE_COUNTERS'],origin:'evolve',count:1,amount:Number(evolveSingleCounter[1]),sharedWording:true};
 if(kind==='ABILITY'&&evolveCounters)
  return {mechanic:'ABILITY_EVOLVE_MULTI_COUNTERS',commands:['PLACE_DAMAGE_COUNTERS'],origin:'evolve',count:Number(evolveCounters[1]),amount:Number(evolveCounters[2]),sharedWording:true};
 if(kind==='ATTACK'&&generic==='のぞむなら、このポケモンを手札にもどす。(ポケモン以外のカードは、すべてトラッシュする。)'&&/^\d+$/.test(String(entry.damage||'0')))
  return {mechanic:'ATTACK_OPTIONAL_RETURN_POKEMON',commands:['DAMAGE','RETURN_TO_HAND','DISCARD'],sharedWording:true};
 if(kind==='ABILITY'&&generic==='このポケモンは、相手のたねポケモンの「ポケモンex」からワザのダメージを受けない。')
  return {mechanic:'PASSIVE_TYPED_ATTACK_IMMUNITY',commands:['PREVENT_DAMAGE'],attacker:'basicEx',sharedWording:true};
 const passiveImmune=generic.match(/^このポケモンは、相手の(特性を持つポケモン|「ポケモンex」)からワザのダメージを受けない。$/);
 if(kind==='ABILITY'&&passiveImmune)
  return {mechanic:'PASSIVE_TYPED_ATTACK_IMMUNITY',commands:['PREVENT_DAMAGE'],attacker:passiveImmune[1]==='特性を持つポケモン'?'ability':'ex',sharedWording:true};
 const typedBerry=generic.match(/^このカードをつけているポケモンが、相手の\[([草炎水雷超闘悪鋼竜]|無色)\]ポケモンからワザのダメージを受けるとき、そのダメージは「-([1-9]\d{0,2})」され、このカードをトラッシュする。$/);
 if(kind==='MAIN'&&entry.category==='tool'&&typedBerry)
  return {mechanic:'TOOL_TYPED_DAMAGE_REDUCTION_DISCARD',commands:['MODIFY_DAMAGE','DISCARD'],attackerType:typedBerry[1],amount:Number(typedBerry[2]),sharedWording:true};
 const toolAttackBoost=generic.match(/^このカードをつけているポケモン(\(「ルールを持つポケモン」をのぞく\))?が使うワザの、相手のバトル場の「ポケモンex」へのダメージは「\+([1-9]\d{0,2})」される。$/);
 if(kind==='MAIN'&&entry.category==='tool'&&toolAttackBoost)
  return {mechanic:'TOOL_EX_ATTACK_BOOST',commands:['MODIFY_DAMAGE'],nonRuleOnly:Boolean(toolAttackBoost[1]),amount:Number(toolAttackBoost[2]),sharedWording:true};
 const poisonedTool=generic.match(/^このカードをつけているどくのポケモンが使うワザの、相手のバトルポケモンへのダメージは「\+([1-9]\d{0,2})」される。$/);
 if(kind==='MAIN'&&entry.category==='tool'&&poisonedTool)
  return {mechanic:'TOOL_STATUS_ATTACK_BOOST',commands:['MODIFY_DAMAGE'],holderStatus:'POISONED',amount:Number(poisonedTool[1]),sharedWording:true};
 const prizeDiscount=generic.match(/^自分のサイドの残り枚数が、相手のサイドの残り枚数より多いなら、このカードをつけているポケモンがワザを使うためのエネルギーは、\[無色\]エネルギー([1-9])個ぶん少なくなる。$/);
 if(kind==='MAIN'&&entry.category==='tool'&&prizeDiscount)
  return {mechanic:'TOOL_PRIZE_COST_DISCOUNT',commands:['MODIFY_ATTACK_COST'],amount:Number(prizeDiscount[1]),sharedWording:true};
 // Continuous active-target attack bonuses: exact printed predicates only.
 if(kind==='ABILITY'){
  const aura=generic.match(/^このポケモンがいるかぎり、自分の(ポケモン|「([^「」]+)のポケモン」|\[([草炎水雷超闘悪鋼竜無色])\]ポケモン|\[([草炎水雷超闘悪鋼竜無色])\]または\[([草炎水雷超闘悪鋼竜無色])\]ポケモン|\[([草炎水雷超闘悪鋼竜無色])\]タイプの進化ポケモン)が使うワザの、相手のバトル(ポケモン|場の進化ポケモン)へのダメージは「\+([1-9]\d{0,2})」される。(この効果は、この特性を持つポケモンが何匹いても、重ならない。)?$/);
  if(aura)return {mechanic:'PASSIVE_TEAM_ATTACK_BOOST',commands:['MODIFY_DAMAGE'],amount:Number(aura[8]),team:aura[2]||null,types:[aura[3],aura[4],aura[5],aura[6]].filter(Boolean),evolvedSource:!!aura[6],evolvedTarget:aura[7]==='場の進化ポケモン',nonStack:!!aura[9],sharedWording:true};
 }
 // Exact continuous Colorless cost reductions; typed requirements are never waived.
 if(kind==='ABILITY'){
  const discardCost=generic.match(/^自分のトラッシュにある「([^「」]+)」の枚数ぶん、このポケモンがワザを使うための\[無色\]エネルギーは少なくなる。$/);
  if(discardCost)return {mechanic:'PASSIVE_CONTEXT_COST_DISCOUNT',commands:['MODIFY_ATTACK_COST'],mode:'discardName',name:discardCost[1],sharedWording:true};
  if(generic==='相手のベンチポケモンの数ぶん、このポケモンがワザを使うための[無色]エネルギーは少なくなる。')return {mechanic:'PASSIVE_CONTEXT_COST_DISCOUNT',commands:['MODIFY_ATTACK_COST'],mode:'opponentBench',sharedWording:true};
  const handCost=generic.match(/^相手の手札が([1-9])枚なら、このポケモンはワザを使うための\[無色\]エネルギーが、すべてなくなる。$/);
  if(handCost)return {mechanic:'PASSIVE_CONTEXT_COST_DISCOUNT',commands:['MODIFY_ATTACK_COST'],mode:'opponentHandExact',count:Number(handCost[1]),sharedWording:true};
  if(generic==='自分の場に「トルネロス」「ボルトロス」「ランドロス」「ラブトロス」がいるなら、このポケモンはワザを使うための[無色]エネルギーが、すべてなくなる。')return {mechanic:'PASSIVE_CONTEXT_COST_DISCOUNT',commands:['MODIFY_ATTACK_COST'],mode:'ownAllNames',names:['トルネロス','ボルトロス','ランドロス','ラブトロス'],sharedWording:true};
 }
 const namedDiscount=generic.match(/^相手がすでにとったサイドの枚数ぶん、このポケモンが「([^「」]+)」を使うための\[無色\]エネルギーは少なくなる。$/);
 if(kind==='ABILITY'&&namedDiscount)
  return {mechanic:'PASSIVE_NAMED_PRIZE_DISCOUNT',commands:['MODIFY_ATTACK_COST'],attackName:namedDiscount[1],sharedWording:true};
 const allTypedEnergyBonus=generic.match(/^自分のポケモン全員についている\[([草炎水雷超闘悪鋼])\]エネルギーの数×([1-9]\d{0,2})ダメージ追加。$/);
 if(kind==='ATTACK'&&allTypedEnergyBonus&&/^\d+\+$/.test(String(entry.damage).normalize('NFKC')))
  return {mechanic:'SCALED_ATTACK_DAMAGE',commands:['DAMAGE'],metric:'ownTeamEnergy',type:allTypedEnergyBonus[1],base:Number.parseInt(entry.damage,10),unit:Number(allTypedEnergyBonus[2]),sharedWording:true};
 const twoChoice=generic.replace(/\s+/g,'');
 if(kind==='MAIN'&&entry.category==='supporter'&&twoChoice==='このカードは、2つの効果から1つを選んで使う。◆自分のバトルポケモンをベンチポケモンと入れ替える。◆この番、自分のポケモンが使うワザの、相手のバトル場の「ポケモンex・V」へのダメージは「+30」される。')
  return {mechanic:'TRAINER_SWITCH_OR_EX_V_BOOST',commands:['SWITCH','MODIFY_DAMAGE'],amount:30,sharedWording:true};
 if(kind==='ABILITY'&&generic==='このポケモンがベンチにいるなら、自分の番に1回使える。このポケモンをバトルポケモンと入れ替える。')
  return {mechanic:'ABILITY_SWITCH_OWN',commands:['SWITCH'],selfBenchOnly:true,sharedWording:true};
 const evolveLowHpSwitch=generic.match(/^自分の番に、このカードを手札から出して進化させたとき、1回使える。相手のベンチの残りHPが「([1-9]\d{0,2})」以下のポケモンを1匹選び、バトルポケモンと入れ替える。$/);
 if(kind==='ABILITY'&&evolveLowHpSwitch)
  return {mechanic:'ABILITY_EVOLVE_FORCE_SWITCH',commands:['FORCE_SWITCH'],origin:'evolve',maxRemainingHp:Number(evolveLowHpSwitch[1]),sharedWording:true};
 if(kind==='ABILITY'&&generic==='自分の番に、このカードを手札から出して進化させたとき、1回使える。相手のベンチポケモンを1匹選び、バトルポケモンと入れ替える。')
  return {mechanic:'ABILITY_EVOLVE_FORCE_SWITCH',commands:['FORCE_SWITCH'],origin:'evolve',sharedWording:true};
 if(kind==='ABILITY'&&generic==='自分の番に1回使える。自分のバトルポケモンをベンチポケモンと入れ替える。')
  return {mechanic:'ABILITY_SWITCH_OWN',commands:['SWITCH'],sharedWording:true};
 const typedEvolution=generic.match(/^自分の番に1回使える。自分の山札から\[([草炎水雷超闘悪鋼竜無色])\]タイプの進化ポケモンを(1枚|[2-9]枚まで)選び、相手に見せて、手札に加える。そして山札を切る。$/);
 if(kind==='ABILITY'&&typedEvolution)
  return {mechanic:'ABILITY_SEARCH_TYPED_EVOLUTION',commands:['SEARCH_DECK','REVEAL','ADD_TO_HAND','SHUFFLE_DECK'],type:typedEvolution[1],limit:parseInt(typedEvolution[2],10),sharedWording:true};
 if(kind==='MAIN'&&['item','supporter'].includes(entry.category)&&generic==='自分の山札から「テラスタル」のポケモンを1枚選び、相手に見せて、手札に加える。そして山札を切る。')
  return {mechanic:'TRAINER_SEARCH_TERA',commands:['SEARCH_DECK','REVEAL','ADD_TO_HAND','SHUFFLE_DECK'],limit:1,sharedWording:true};
 const teamReduction=generic.match(/^次の相手の番、自分の(?:(?:\[([草炎水雷超闘悪鋼竜無色])\])?ポケモン)全員が、相手のポケモンから受けるワザのダメージは「-([1-9]\d{0,2})」される。\(新しく場に出したポケモンもふくむ。\)$/);
 if(kind==='MAIN'&&['item','supporter'].includes(entry.category)&&teamReduction)
  return {mechanic:'TRAINER_TEAM_DAMAGE_REDUCTION',commands:['PREVENT_DAMAGE'],type:teamReduction[1]||null,amount:Number(teamReduction[2]),sharedWording:true};
 const typedBoost=generic.match(/^この番、自分の\[([草炎水雷超闘悪鋼竜無色])\]ポケモンが使うワザの、相手のバトルポケモンへのダメージは「\+([1-9]\d{0,2})」される。$/);
 if(kind==='MAIN'&&['item','supporter'].includes(entry.category)&&typedBoost)
  return {mechanic:'TRAINER_TYPED_DAMAGE_BOOST',commands:['MODIFY_DAMAGE'],type:typedBoost[1],amount:Number(typedBoost[2]),sharedWording:true};
 const openingBench=generic.match(/^このワザは、後攻プレイヤーの最初の番には使えない。自分のベンチポケモンの数×([1-9]\d{0,2})ダメージ。$/);
 if(kind==='ATTACK'&&openingBench&&String(entry.damage).normalize('NFKC')===openingBench[1]+'×')
  return {mechanic:'BENCH_COUNT_DAMAGE',commands:['DAMAGE'],side:'own',unit:Number(openingBench[1]),base:0,noSecondPlayerFirstTurn:true,sharedWording:true};
 if(kind==='ATTACK'&&generic==='次の相手の番、このポケモンはたねポケモンからワザのダメージを受けない。'&&/^\d+$/.test(String(entry.damage)))
  return {mechanic:'ATTACK_BASIC_DAMAGE_PROTECTION',commands:['DAMAGE','PREVENT_DAMAGE'],exceptType:null,sharedWording:true};
 if(kind==='ATTACK'&&generic==='次の相手の番、このポケモンはたねポケモン([無色]ポケモンをのぞく)からワザのダメージを受けない。'&&/^\d+$/.test(String(entry.damage)))
  return {mechanic:'ATTACK_BASIC_DAMAGE_PROTECTION',commands:['DAMAGE','PREVENT_DAMAGE'],exceptType:'無色',sharedWording:true};
 if(kind==='MAIN'&&entry.category==='item'&&generic==='相手の場のポケモンについている特殊エネルギーを1個選び、トラッシュする。')
  return {mechanic:'TRAINER_DISCARD_SPECIAL_ENERGY',commands:['DISCARD'],sharedWording:true};
 if(kind==='ABILITY'&&generic==='このポケモンにエネルギーがついていないなら、このポケモンのにげるためのエネルギーは、すべてなくなる。')return {mechanic:'PASSIVE_EMPTY_ENERGY_RETREAT',commands:['MODIFY_RETREAT_COST'],sharedWording:true};
 const opponentRetreat=generic.match(/^このポケモンがいるかぎり、相手のバトルポケモンは、にげるためのエネルギーが([1-9])個ぶん多くなる。$/);
 if(kind==='ABILITY'&&opponentRetreat)return {mechanic:'PASSIVE_OPPONENT_RETREAT_INCREASE',commands:['MODIFY_RETREAT_COST'],amount:Number(opponentRetreat[1]),sharedWording:true};
 const typedRetreat=generic.match(/^このポケモンがいるかぎり、\[([草炎水雷超闘悪鋼])\]エネルギーがついている自分のポケモン全員のにげるためのエネルギーは、すべてなくなる。$/);
 if(kind==='ABILITY'&&typedRetreat)return {mechanic:'PASSIVE_TYPED_TEAM_RETREAT',commands:['MODIFY_RETREAT_COST'],energyType:typedRetreat[1],sharedWording:true};
 const lowRetreat=generic.match(/^このカードをつけているポケモンは、にげるためのエネルギーが([1-9])個ぶん少なくなる。そのポケモンの残りHPが「([1-9]\d{0,2})」以下なら、にげるためのエネルギーは、すべてなくなる。$/);
 if(kind==='MAIN'&&entry.category==='tool'&&lowRetreat)
  return {mechanic:'TOOL_LOW_HP_RETREAT_DISCOUNT',commands:['MODIFY_RETREAT_COST'],amount:Number(lowRetreat[1]),threshold:Number(lowRetreat[2]),sharedWording:true};
 const topDiscard=generic.match(/^自分の山札を上から([1-9]\d?)枚見て、その中からカードを([1-9])枚選び、手札に加える。残りのカードはトラッシュする。$/);
 if(kind==='MAIN'&&['item','supporter'].includes(entry.category)&&topDiscard&&Number(topDiscard[2])<=Number(topDiscard[1]))
  return {mechanic:'TRAINER_TOP_SELECT_DISCARD',commands:['SEARCH_DECK','ADD_TO_HAND','DISCARD'],limit:Number(topDiscard[1]),amount:Number(topDiscard[2]),sharedWording:true};
 const topTyped=generic.match(/^自分の山札を上から([1-9]\d?)枚見て、その中から\[([草炎水雷超闘悪鋼])\]ポケモンと「基本\[([草炎水雷超闘悪鋼])\]エネルギー」を合計([1-9])枚まで選び、相手に見せて、手札に加える。残りのカードは山札にもどして切る。$/);
 if(kind==='MAIN'&&['item','supporter'].includes(entry.category)&&topTyped&&topTyped[2]===topTyped[3]&&Number(topTyped[4])<=Number(topTyped[1]))
  return {mechanic:'TRAINER_TOP_TYPED_SEARCH',commands:['SEARCH_DECK','REVEAL','ADD_TO_HAND','SHUFFLE_DECK'],limit:Number(topTyped[1]),type:topTyped[2],amount:Number(topTyped[4]),sharedWording:true};
 const topDistinct=generic.match(/^自分の山札を上から([1-9]\d?)枚見て、その中からポケモンとトレーナーズを1枚ずつ選び、相手に見せて、手札に加える。残りのカードは山札にもどして切る。$/);
 if(kind==='MAIN'&&['item','supporter'].includes(entry.category)&&topDistinct)
  return {mechanic:'TRAINER_TOP_POKEMON_TRAINER',commands:['SEARCH_DECK','REVEAL','ADD_TO_HAND','SHUFFLE_DECK'],limit:Number(topDistinct[1]),amount:2,sharedWording:true};
 if(kind==='ATTACK'&&generic==='ダメージを与える前に、相手のバトルポケモンについている「ポケモンのどうぐ」をトラッシュする。'&&/^\d+$/.test(String(entry.damage)))
  return {mechanic:'ATTACK_DISCARD_TOOL_BEFORE_DAMAGE',commands:['DISCARD','DAMAGE'],sharedWording:true};
 const recovery=generic.match(/^自分のトラッシュからポケモン\(「ルールを持つポケモン」をのぞく\)と基本エネルギーを合計([1-9])枚まで選び、相手に見せて、手札に加える。$/);
 if(kind==='MAIN'&&['item','supporter'].includes(entry.category)&&recovery)
  return {mechanic:'RECOVER_NON_RULE_AND_ENERGY',commands:['REVEAL','ADD_TO_HAND'],amount:Number(recovery[1]),sharedWording:true};
 const fullHeal=generic.match(/^残りHPが「([1-9]\d{0,2})」以下の自分のポケモン1匹のHPを、すべて回復する。$/);
 if(kind==='MAIN'&&['item','supporter'].includes(entry.category)&&fullHeal)
  return {mechanic:'HEAL_LOW_HP_FULL',commands:['HEAL'],threshold:Number(fullHeal[1]),sharedWording:true};
 const evoDiscard=generic.match(/^相手のバトルポケモンが進化ポケモンなら、([1-9]\d{0,2})ダメージ追加。その場合、このポケモンについているエネルギーを、すべてトラッシュする。$/);
 if(kind==='ATTACK'&&evoDiscard&&/^\d{1,3}\+$/.test(String(entry.damage).normalize('NFKC')))
  return {mechanic:'ATTACK_EVOLUTION_BONUS_DISCARD',commands:['DAMAGE','DISCARD'],base:parseInt(entry.damage,10),bonus:Number(evoDiscard[1]),sharedWording:true};
 const prizeDiscard=generic.match(/^相手がすでにとったサイドの枚数×([1-9]\d{0,2})ダメージ追加。このポケモンについているエネルギーを1個選び、トラッシュする。$/);
 if(kind==='ATTACK'&&prizeDiscard&&/^\d{1,3}\+$/.test(String(entry.damage).normalize('NFKC')))
  return {mechanic:'ATTACK_PRIZE_BONUS_DISCARD',commands:['DAMAGE','DISCARD'],base:parseInt(entry.damage,10),unit:Number(prizeDiscard[1]),sharedWording:true};
 // Cost-paid abilities use physical hand cards, never normal energy attachment.
 const inspectedHand=generic.match(/^相手の手札を見て、その中から(カード|グッズ|エネルギー)を([1-9])(枚|枚まで)選び、(トラッシュする|相手の山札の下にもどす)。$/);
 const inspectedAll=generic==='相手の手札を見て、その中にある「グッズ」と「ポケモンのどうぐ」を、すべてトラッシュする。';
 if((kind==='ATTACK'&&/^\d+$/.test(String(entry.damage))||kind==='MAIN'&&['item','supporter'].includes(entry.category))&&(inspectedHand||inspectedAll)){
  const filter=inspectedAll?'itemTool':{'カード':'any','グッズ':'item','エネルギー':'energy'}[inspectedHand[1]];
  const destination=inspectedAll||inspectedHand[4]==='トラッシュする'?'discard':'bottom';
  return {mechanic:'INSPECTED_OPPONENT_HAND_TRANSFER',commands:[...(kind==='ATTACK'&&Number(entry.damage)>0?['DAMAGE']:[]),'REVEAL',destination==='discard'?'DISCARD':'RETURN_TO_DECK'],filter,destination,all:inspectedAll,limit:inspectedAll?null:Number(inspectedHand[2]),optional:!inspectedAll&&inspectedHand[3]==='枚まで',sharedWording:true};
 }
 const counterCost=generic.match(/^このポケモンがバトル場にいて、自分の番に、自分の手札から「基本\[([草炎水雷超闘悪鋼])\]エネルギー」を1枚トラッシュするなら、1回使える。相手のポケモン1匹に、ダメカンを([1-9]\d?)個のせる。$/);
 if(kind==='ABILITY'&&counterCost)return {mechanic:'ABILITY_TYPED_COST_COUNTER',commands:['DISCARD','PLACE_DAMAGE_COUNTERS'],type:counterCost[1],amount:Number(counterCost[2]),activeOnly:true,sharedWording:true};
 const partnerDraw=generic.match(/^自分の場に「([^「」]{1,40})」がいて、自分の番に、自分の手札から「基本\[([草炎水雷超闘悪鋼])\]エネルギー」を1枚トラッシュするなら、1回使える。自分の山札を([1-9])枚引く。この特性は別の「([^「」]{1,40})」を使った番は使えない。$/);
 if(kind==='ABILITY'&&partnerDraw&&entry.name===partnerDraw[4])
  return {mechanic:'ABILITY_TYPED_COST_DRAW_LIMIT',commands:['DISCARD','DRAW'],zone:'hand',type:partnerDraw[2],amount:Number(partnerDraw[3]),partnerName:partnerDraw[1],sharedUseName:'typed-draw:'+partnerDraw[4],sharedWording:true};
 const filteredCost=generic.match(/^自分の番に、(このポケモンについている|自分の手札から)「基本\[([草炎水雷超闘悪鋼])\]エネルギー」を1(個|枚)トラッシュするなら、1回使える。自分の手札が([1-9])枚になるように、山札を引く。$/);
 if(kind==='ABILITY'&&filteredCost&&((filteredCost[1]==='このポケモンについている')===(filteredCost[3]==='個')))
  return {mechanic:'ABILITY_TYPED_COST_DRAW_LIMIT',commands:['DISCARD','DRAW'],zone:filteredCost[3]==='個'?'attached':'hand',type:filteredCost[2],limit:Number(filteredCost[4]),sharedWording:true};
 const filteredPokemon=generic.match(/^自分の手札からポケモン\(「ルールを持つポケモン」をのぞく\)を([2-9])枚までトラッシュし、その枚数×([1-9])枚ぶん、山札を引く。$/);
 if(kind==='MAIN'&&entry.category==='supporter'&&filteredPokemon)
  return {mechanic:'SUPPORTER_NON_RULE_DISCARD_DRAW',commands:['DISCARD','DRAW'],limit:Number(filteredPokemon[1]),unit:Number(filteredPokemon[2]),sharedWording:true};
 const discardDrawAbility=generic.match(/^自分の番に、自分の手札を([1-9])枚トラッシュするなら、1回使える。自分の山札を([1-9])枚引く。$/);
 if(kind==='ABILITY'&&discardDrawAbility)
  return {mechanic:'ABILITY_DISCARD_DRAW',commands:['DISCARD','DRAW'],cost:Number(discardDrawAbility[1]),amount:Number(discardDrawAbility[2]),sharedWording:true};
 const attachDrawAbility=generic.match(/^自分の番に1回使える。自分の手札から「基本\[([草炎水雷超闘悪鋼])\]エネルギー」を1枚選び、このポケモンにつける。その後、自分の山札を([1-9])枚引く。$/);
 if(kind==='ABILITY'&&attachDrawAbility)
  return {mechanic:'ABILITY_ATTACH_SELF_DRAW',commands:['ATTACH_ENERGY','DRAW'],type:attachDrawAbility[1],amount:Number(attachDrawAbility[2]),sharedWording:true};
 // A switch-triggered ability is a separate exact grammar, never an attack.
 const activeEntryEnergy=generic.match(/^自分の番に、このポケモンがベンチからバトル場に出たとき、1回使える。自分の山札から「基本\[([草炎水雷超闘悪鋼])\]エネルギー」を([2-9])枚まで選び、このポケモンにつける。そして山札を切る。$/);
 if(kind==='ABILITY'&&activeEntryEnergy)
  return {mechanic:'MASS_ENERGY_ROUTE',commands:['SEARCH_DECK','ATTACH_ENERGY','SHUFFLE_DECK'],zone:'deck',type:activeEntryEnergy[1],limit:Number(activeEntryEnergy[2]),target:'self',holderType:null,team:null,multi:false,heal:null,activeOnly:true,origin:'activeEntry',repeated:true,sharedWording:true};
 const additional=kind==='ATTACK'?additionalAttackPlan(entry,generic):null;
 if(kind==='MAIN'&&entry.category==='item'&&/^コインを1回投げ、?オモテなら、自分の山札からポケモンを1枚選び、相手に見せて、手札に加える。そして山札を切る。$/.test(generic))
  return {mechanic:'COIN_SEARCH_POKEMON',commands:['COIN_FLIP','SEARCH_DECK','REVEAL','ADD_TO_HAND','SHUFFLE_DECK']};
 // Exact printed abilities are continuous (not manually activated) and their
 // damage reduction applies after weakness/resistance, unless ignored by an attack.
 // A printed Rocket Team minimum-size condition is a continuous attack gate.
 // It must be checked when an attack is declared, not as a one-time ability.
 // Suppress only the opposing Active Pokemon's abilities, except the named
 // official ability itself. This is continuous and never a manual action.
 if(kind==='ABILITY'&&generic==='このポケモンがバトル場にいるかぎり、相手のバトルポケモンの特性(「あんやのはばたき」をのぞく)は、すべてなくなる。')
  return {mechanic:'ACTIVE_OPPONENT_ABILITY_SUPPRESSION',commands:['ADD_STATE'],exceptAbilityName:'あんやのはばたき'};
 const handAttackGate=generic.match(/^自分の手札が([1-9]\d?)枚以上のときにしか、このポケモンはワザが使えない。$/);
 if(kind==='ABILITY'&&handAttackGate)
  return {mechanic:'PASSIVE_CONTEXT_ATTACK_GATE',commands:['ADD_STATE'],mode:'ownHand',required:Number(handAttackGate[1]),sharedWording:true};
 if(kind==='ABILITY'&&generic==='相手の場に「ポケモンex・V」がいないなら、このポケモンはワザが使えない。')
  return {mechanic:'PASSIVE_CONTEXT_ATTACK_GATE',commands:['ADD_STATE'],mode:'opponentExV',sharedWording:true};
 const rocketGate=generic.match(/^自分の場の「ロケット団のポケモン」が([1-6])匹以上のときにしか、このポケモンはワザが使えない。$/);
 if(kind==='ABILITY'&&rocketGate)
  return {mechanic:'PASSIVE_ROCKET_TEAM_ATTACK_GATE',commands:['ADD_STATE'],required:Number(rocketGate[1])};
 const conditionalReduction=generic.match(/^(このポケモンにエネルギーがついているなら、このポケモンが受ける|このポケモンのHPがまんたんの状態なら、このポケモンが相手のポケモンから受ける)ワザのダメージは「-([1-9][0-9]{0,2})」される。$/);
 if(kind==='ABILITY'&&conditionalReduction)
  return {mechanic:'PASSIVE_INCOMING_ATTACK_DAMAGE_REDUCTION',commands:['PREVENT_DAMAGE'],amount:Number(conditionalReduction[2]),condition:conditionalReduction[1].startsWith('このポケモンにエネルギー')?'hasEnergy':'fullHp',sharedWording:true};
 const incomingReduction=generic.match(/^このポケモンが受けるワザのダメージは「-([1-9][0-9]{0,2})」される。$/);
 if(kind==='ABILITY'&&incomingReduction)
  return {mechanic:'PASSIVE_INCOMING_ATTACK_DAMAGE_REDUCTION',commands:['PREVENT_DAMAGE'],amount:Number(incomingReduction[1])};
 // Some officially printed supporters alone are legal on the first player's
 // first turn. Never relax the restriction for other supporters.
 const firstTurnDraw=generic.match(/^このカードは、先攻プレイヤーの最初の番でも使える。自分の手札をすべてトラッシュし、山札を([1-9][0-9]?)枚引く。$/);
 if(kind==='MAIN'&&entry.category==='supporter'&&firstTurnDraw)
  return {mechanic:'SUPPORTER_FIRST_TURN_DISCARD_HAND_DRAW',commands:['DISCARD','DRAW'],amount:Number(firstTurnDraw[1])};
 if(kind==='ATTACK'&&generic==='のぞむなら、場に出ているスタジアムをトラッシュする。'&&/^\d+$/.test(String(entry.damage||'0')))
  return {mechanic:'ATTACK_DISCARD_STADIUM',commands:[...(Number(entry.damage)>0?['DAMAGE']:[]),'DISCARD'],optional:true};
 if(kind==='ATTACK'&&generic==='場に出ているスタジアムをトラッシュする。'&&/^\d+$/.test(String(entry.damage||'0')))
  return {mechanic:'ATTACK_DISCARD_STADIUM',commands:[...(Number(entry.damage)>0?['DAMAGE']:[]),'DISCARD']};
 if(kind==='MAIN'&&entry.category==='item'&&generic==='このカードは、自分の手札を3枚トラッシュしなければ使えない。自分の山札から「グッズ」「ポケモンのどうぐ」「サポート」「スタジアム」を1枚ずつ選び、相手に見せて、手札に加える。そして山札を切る。')
  return {mechanic:'DISCARD_TO_SEARCH_DISTINCT_CATEGORIES',commands:['DISCARD','SEARCH_DECK','REVEAL','ADD_TO_HAND','SHUFFLE_DECK'],cost:3,categories:['item','tool','supporter','stadium']};
 // Match complete, verified attack text. Printed damage and counter/damage units are separate.
 const printedAmount=/^\d+$/.test(String(entry.damage||'0'));

 // Optional physical-energy discard from any of your Benched Pokemon must
 // select the actual attached cards, not a count or a card-name shortcut.
 const benchEnergyBonus=generic.match(/^のぞむなら、自分のベンチポケモンについているエネルギーを([1-5])枚までトラッシュし、その枚数×([1-9][0-9]{0,2})ダメージ追加。$/);
 const attackDamage=String(entry.damage||'').normalize('NFKC');
 if(kind==='ATTACK'&&benchEnergyBonus&&/^([1-9][0-9]{0,2})\+$/.test(attackDamage))
  return {mechanic:'ATTACK_DISCARD_BENCH_ENERGY_BONUS',commands:['DISCARD','DAMAGE'],
   base:Number.parseInt(attackDamage,10),maxDiscard:Number(benchEnergyBonus[1]),unit:Number(benchEnergyBonus[2])};
 // Lock ONLY the explicitly named attack on the next own turn.
 // This differs from NO_NEXT_ATTACK, which disables all attacks.
 const namedLock=text.normalize('NFKC').match(/^次の自分の番、このポケモンは「([^」]+)」が使えない。$/);
 if(kind==='ATTACK'&&namedLock&&/^\d+$/.test(String(entry.damage||'0'))
    &&String(entry.name||'')===namedLock[1])
  return {mechanic:'ATTACK_NAMED_NEXT_TURN_LOCK',commands:['DAMAGE','ADD_STATE'],attackName:namedLock[1]};
 const namedBoost=generic.match(/^次の自分の番、このポケモンの「([^」]+)」のダメージは「\+([1-9]\d{0,2})」される。$/);
 if(kind==='ATTACK'&&namedBoost&&/^\d+$/.test(String(entry.damage||'0'))&&String(entry.name||'')===namedBoost[1])
  return {mechanic:'ATTACK_NAMED_NEXT_DAMAGE_BOOST',commands:['DAMAGE','ADD_STATE'],attackName:namedBoost[1],amount:Number(namedBoost[2]),sharedWording:true};
 const nextActiveBoost=generic.match(/^次の自分の番、このポケモンが使うワザの、相手のバトルポケモンへのダメージは「\+([1-9]\d{0,2})」される。$/);
 if(kind==='ATTACK'&&nextActiveBoost&&/^\d+$/.test(String(entry.damage||'0')))
  return {mechanic:'ATTACK_NAMED_NEXT_DAMAGE_BOOST',commands:['DAMAGE','ADD_STATE'],attackName:null,amount:Number(nextActiveBoost[1]),sharedWording:true};
 // Match complete printed effect slots only; unknown official text still fails closed.
 const typedStatus=generic.match(/^相手のバトルポケモンが\[([草炎水雷超闘悪鋼竜無色])\]ポケモンなら、そのポケモンを(マヒ|やけど|どく|ねむり|こんらん)にする。$/);
 if(kind==='ATTACK'&&printedAmount&&typedStatus){
  const status={'マヒ':'PARALYZED','やけど':'BURNED','どく':'POISONED','ねむり':'ASLEEP','こんらん':'CONFUSED'}[typedStatus[2]];
  return {mechanic:'ATTACK_APPLY_STATUS',commands:[...(Number(entry.damage)>0?['DAMAGE']:[]),'STATUS_CONDITION'],status,defenderType:typedStatus[1],sharedWording:true};
 }
 const directStatus=generic.match(/^相手のバトルポケモンを(やけど|どく|ねむり|こんらん)にする。$/);
 if(kind==='ATTACK'&&printedAmount&&directStatus){
  const status={'やけど':'BURNED','どく':'POISONED','ねむり':'ASLEEP','こんらん':'CONFUSED'}[directStatus[1]];
  return {mechanic:'ATTACK_APPLY_STATUS',commands:[...(Number(entry.damage)>0?['DAMAGE']:[]),'STATUS_CONDITION'],status};
 }
 const healTeam=generic.match(/^自分のポケモン全員のHPを、それぞれ「([1-9][0-9]{0,2})」回復する。$/);
 if(kind==='ATTACK'&&printedAmount&&healTeam)
  return {mechanic:'ATTACK_HEAL_TEAM',commands:[...(Number(entry.damage)>0?['DAMAGE']:[]),'HEAL'],amount:Number(healTeam[1])};
 const takenPrizes=generic.match(/^相手がすでにとったサイドの枚数×([1-9][0-9]{0,2})ダメージ。$/);
 if(kind==='ATTACK'&&takenPrizes&&String(entry.damage).normalize('NFKC')===takenPrizes[1]+'×')
  return {mechanic:'ATTACK_TAKEN_PRIZES_DAMAGE',commands:['DAMAGE'],unit:Number(takenPrizes[1])};
 const statusBonus=generic.match(/^相手のバトルポケモンが特殊状態なら、([1-9][0-9]{0,2})ダメージ追加。$/);
 const printedBonus=String(entry.damage).normalize('NFKC');
 const undamagedBonus=generic.match(/^このポケモンにダメカンがのっていないなら、([1-9][0-9]{0,2})ダメージ追加。$/);
 if(kind==='ATTACK'&&undamagedBonus&&/^\d{1,3}\+$/.test(printedBonus))
  return {mechanic:'ATTACK_UNDAMAGED_BONUS',commands:['DAMAGE'],base:Number.parseInt(printedBonus,10),bonus:Number(undamagedBonus[1])};
 const attachedToolDamage=generic.match(/^(自分の|おたがいの)ポケモン全員についている「ポケモンのどうぐ」の数×([1-9][0-9]{0,2})ダメージ。$/);
 if(kind==='ATTACK'&&attachedToolDamage&&printedBonus===attachedToolDamage[2]+'×')
  return {mechanic:'ATTACK_ATTACHED_TOOL_COUNT',commands:['DAMAGE'],bothSides:attachedToolDamage[1]==='おたがいの',unit:Number(attachedToolDamage[2])};
 if(kind==='ATTACK'&&statusBonus&&/^\d{1,3}\+$/.test(printedBonus))
  return {mechanic:'ATTACK_STATUS_BONUS_DAMAGE',commands:['DAMAGE'],base:Number.parseInt(printedBonus,10),bonus:Number(statusBonus[1])};

 const benchHit=text.normalize('NFKC').match(/^相手のベンチポケモン1匹にも、([1-9][0-9]{0,2})ダメージ。\[ベンチは弱点・抵抗力を計算しない。\]$/);
 if(kind==='ATTACK'&&printedAmount&&benchHit)
  return {mechanic:'ATTACK_SPLASH_DAMAGE',commands:['DAMAGE'],benchDamage:Number(benchHit[1])};
 const mill=generic.match(/^相手の山札を上から([1-9][0-9]?)枚トラッシュする。$/);
 if(kind==='ATTACK'&&printedAmount&&mill)
  return {mechanic:'ATTACK_DISCARD_OPPONENT_DECK_TOP',commands:['DAMAGE','DISCARD'],amount:Number(mill[1])};
 const damageRules={
  'このワザのダメージは抵抗力を計算しない。':{skipResistance:true},
  'このワザのダメージは弱点・抵抗力を計算しない。':{skipWeakness:true,skipResistance:true},
  'このワザのダメージは、弱点・抵抗力を計算しない。':{skipWeakness:true,skipResistance:true},
  'このワザのダメージは、弱点・抵抗力と、相手のバトルポケモンにかかっている効果を計算しない。':{skipWeakness:true,skipResistance:true,ignore:true},
 };
 if(kind==='ATTACK'&&printedAmount&&Object.hasOwn(damageRules,generic))
  return {mechanic:'ATTACK_IGNORE_DAMAGE_RULES',commands:['DAMAGE'],...damageRules[generic]};
 const discardDraw=generic.match(/^自分の手札をすべてトラッシュし、山札を([1-9][0-9]?)枚引く。$/);
 if(kind==='ATTACK'&&printedAmount&&discardDraw)
  return {mechanic:'ATTACK_DISCARD_HAND_DRAW',commands:['DAMAGE','DISCARD','DRAW'],amount:Number(discardDraw[1])};
 const reduction=generic.match(/^次の相手の番、このポケモンが受けるワザのダメージは「-([1-9][0-9]*)」される。$/);
 if(kind==='ATTACK'&&reduction&&/^\d+$/.test(String(entry.damage||'0'))&&Number.isSafeInteger(Number(reduction[1])))return {mechanic:'ATTACK_DAMAGE_REDUCTION',commands:['DAMAGE','ADD_STATE'],amount:Number(reduction[1])};
 let match=generic.match(/^自分の山札を([1-9][0-9]*)枚引く。$/);
 if(kind==='MAIN'&&['item','supporter'].includes(entry.category)&&match&&Number.isSafeInteger(Number(match[1])))return {mechanic:'DRAW_CARDS',commands:['DRAW'],amount:Number(match[1])};
 match=generic.match(/^自分のポケモン1匹のHPを「([1-9][0-9]*)」回復する。$/);
 if(kind==='MAIN'&&['item','supporter'].includes(entry.category)&&match&&Number.isSafeInteger(Number(match[1])))return {mechanic:'HEAL_DAMAGE',commands:['HEAL'],amount:Number(match[1])};
 if(kind==='MAIN'&&['item','supporter'].includes(entry.category)&&generic==='コインを1回投げオモテなら、相手のベンチポケモンを1匹選び、バトルポケモンと入れ替える。')return {mechanic:'COIN_FORCE_SWITCH',commands:['COIN_FLIP','FORCE_SWITCH']};
 // A Supporter that first discards one other physical hand card draws as many
 // cards as the opponent currently has Benched Pokemon. Exact official text only.
 if(kind==='MAIN'&&entry.category==='supporter'&&generic==='このカードは、自分の手札を1枚トラッシュしなければ使えない。相手のベンチポケモンの数ぶん、自分の山札を引く。')return {mechanic:'DISCARD_ONE_DRAW_OPP_BENCH',commands:['DISCARD','DRAW']};
 // A shuffled hand draw may depend on remaining opposing Prize cards, with the
 // source Supporter itself already removed from the hand by canonical dispatch.
 match=generic.match(/^自分の手札をすべて山札にもどして切る。その後、山札を([1-9][0-9]*)枚引く。相手のサイドの残り枚数が([1-9][0-9]*)枚以下なら、引く枚数は([1-9][0-9]*)枚になる。$/);
 if(kind==='MAIN'&&entry.category==='supporter'&&match&&match.slice(1).every(v=>Number.isSafeInteger(Number(v))))return {mechanic:'RETURN_HAND_PRIZE_DRAW',commands:['RETURN_TO_DECK','SHUFFLE_DECK','DRAW'],normal:Number(match[1]),threshold:Number(match[2]),bonus:Number(match[3])};
 // Coin is flipped only AFTER the returned hand has been shuffled into the deck.
 match=generic.match(/^自分の手札をすべて山札にもどして切る。その後、コインを1回投げ、オモテなら([1-9][0-9]*)枚、ウラなら([1-9][0-9]*)枚、山札を引く。$/);
 if(kind==='MAIN'&&entry.category==='supporter'&&match&&match.slice(1).every(v=>Number.isSafeInteger(Number(v))))return {mechanic:'RETURN_HAND_COIN_DRAW',commands:['RETURN_TO_DECK','SHUFFLE_DECK','COIN_FLIP','DRAW'],heads:Number(match[1]),tails:Number(match[2])};
 // Official H supporters: a single coin decides how many cards to draw.
 match=generic.match(/^コインを1回投げる。オモテなら([1-9][0-9]*)枚、ウラなら([1-9][0-9]*)枚、自分の山札を引く。$/);
 if(kind==='MAIN'&&entry.category==='supporter'&&match&&match.slice(1).every(v=>Number.isSafeInteger(Number(v))))return {mechanic:'COIN_DRAW_CARDS',commands:['COIN_FLIP','DRAW'],heads:Number(match[1]),tails:Number(match[2])};
 // A heal affecting the Active Pokemon only is not an arbitrary-target heal.
 match=generic.match(/^自分のバトルポケモンのHPを「([1-9][0-9]*)」回復する。$/);
 if(kind==='MAIN'&&entry.category==='supporter'&&match&&Number.isSafeInteger(Number(match[1])))return {mechanic:'HEAL_ACTIVE_DAMAGE',commands:['HEAL'],amount:Number(match[1])};
 match=generic.match(/^自分の手札をすべてトラッシュし、山札を([1-9][0-9]*)枚引く。$/);
 if(kind==='MAIN'&&['item','supporter'].includes(entry.category)&&match&&Number.isSafeInteger(Number(match[1])))return {mechanic:'DISCARD_HAND_DRAW',commands:['DISCARD','DRAW'],amount:Number(match[1])};
 match=generic.match(/^自分のトラッシュから基本エネルギーを([1-9][0-9]*)枚まで選び、相手に見せて、手札に加える。$/);
 if(kind==='MAIN'&&['item','supporter'].includes(entry.category)&&match&&Number.isSafeInteger(Number(match[1])))return {mechanic:'RECOVER_BASIC_ENERGY',commands:['REVEAL','ADD_TO_HAND'],amount:Number(match[1])};
 match=generic.match(/^このカードをつけている(たね)?ポケモンの最大HPは「\+([1-9][0-9]*)」される。$/);
 if(kind==='MAIN'&&entry.category==='tool'&&match&&Number.isSafeInteger(Number(match[2])))return {mechanic:'CONDITIONAL_MAX_HP',commands:['MODIFY_MAX_HP'],amount:Number(match[2]),basicOnly:!!match[1]};
 const namedTeamHp=generic.match(/^このカードをつけている「([^」]+)のポケモン」の最大HPは「\+([1-9]\d{0,2})」される。$/);
 if(kind==='MAIN'&&entry.category==='tool'&&namedTeamHp)return {mechanic:'TOOL_NAMED_TEAM_MAX_HP',commands:['MODIFY_MAX_HP'],team:namedTeamHp[1],amount:Number(namedTeamHp[2]),sharedWording:true};
 if(kind==='MAIN'&&entry.category==='stadium'&&generic==='おたがいの場の「ルールを持つポケモン」の特性は、すべてなくなる。')return {mechanic:'SUPPRESS_RULE_ABILITIES',commands:['ADD_STATE'],rulePokemonOnly:true};
 match=generic.match(/^自分の番に1回使える。このポケモンのHPを「([1-9][0-9]*)」回復する。$/);
 if(kind==='ABILITY'&&match&&Number.isSafeInteger(Number(match[1]))&&Number(match[1])<=1000)return {mechanic:'ABILITY_HEAL_SELF',commands:['HEAL'],amount:Number(match[1])};
 match=generic.match(/^自分の番に1回使える。自分の山札を([1-9][0-9]*)枚引く。$/);
 if(kind==='ABILITY'&&match&&Number.isSafeInteger(Number(match[1]))&&Number(match[1])<=100)return {mechanic:'ABILITY_DRAW_CARDS',commands:['DRAW'],amount:Number(match[1])};
 match=generic.match(/^自分の手札が([1-9][0-9]*)枚になるように、山札を引く。$/);
 if(kind==='ATTACK'&&match&&/^\d+$/.test(String(entry.damage))&&Number.isSafeInteger(Number(match[1])))return {mechanic:'HAND_LIMIT_DRAW_ATTACK',commands:[...(Number(entry.damage)>0?['DAMAGE']:[]),'DRAW'],limit:Number(match[1])};
 match=generic.match(/^自分の番に1回使える。自分の手札が([1-9][0-9]*)枚になるように、山札を引く。$/);
 if(kind==='ABILITY'&&match&&Number.isSafeInteger(Number(match[1])))return {mechanic:'HAND_LIMIT_DRAW_ABILITY',commands:['DRAW'],limit:Number(match[1])};
 if(kind==='ATTACK'&&generic==='コインを1回投げウラなら、このワザは失敗。'&&/^\d+$/.test(String(entry.damage)))return {mechanic:'COIN_FAILURE_DAMAGE',commands:['COIN_FLIP','DAMAGE']};
 match=generic.match(/^自分の山札からたねポケモンを(1枚|[23]枚まで)選び、ベンチに出す。そして山札を切る。$/);
 if(kind==='ATTACK'&&match&&/^\d+$/.test(String(entry.damage||'0')))return {mechanic:'SEARCH_BASIC_TO_BENCH_ATTACK',commands:[...(Number(entry.damage)>0?['DAMAGE']:[]),'SEARCH_DECK','BENCH_FROM_ZONE','SHUFFLE_DECK'],limit:Number.parseInt(match[1],10),...(match[1]==='3枚まで'?{sharedWording:true}:{})};
 match=generic.match(/^自分の山札から(ポケモン|グッズ|サポート|基本エネルギー)を(1枚|2枚まで)選び、相手に見せて、手札に加える。そして山札を切る。$/);
 if(kind==='ATTACK'&&match&&/^\d+$/.test(String(entry.damage||'0'))){
  const filter={'ポケモン':'pokemon','グッズ':'item','サポート':'supporter','基本エネルギー':'basicEnergy'}[match[1]];
  return {mechanic:'SEARCH_REVEAL_TO_HAND_ATTACK',commands:[...(Number(entry.damage)>0?['DAMAGE']:[]),'SEARCH_DECK','REVEAL','ADD_TO_HAND','SHUFFLE_DECK'],filter,limit:match[2]==='1枚'?1:2};
 }
 // Only exact official attack wording is eligible; other status variations stay BLOCKED.
 if(kind==='ATTACK'&&/^コインを1回投げ、?オモテなら、相手のバトルポケモンをマヒにする。$/.test(generic)&&/^\d+$/.test(String(entry.damage||'0')))return {mechanic:'COIN_PARALYZE_ATTACK',commands:['DAMAGE','COIN_FLIP','STATUS_CONDITION']};
 if(kind==='ATTACK'&&/^このポケモンについているエネルギーを、?すべてトラッシュする。$/.test(generic)&&/^\d+$/.test(String(entry.damage||'0')))return {mechanic:'DISCARD_ALL_SELF_ENERGY_ATTACK',commands:['DAMAGE','DISCARD']};
 if(kind==='ATTACK'&&generic==='このポケモンについているエネルギーを1個選び、トラッシュする。'&&/^\d+$/.test(String(entry.damage||'0'))&&entry.cost?.length)return {mechanic:'DISCARD_ONE_SELF_ENERGY_ATTACK',commands:['DAMAGE','DISCARD']};
 match=generic.match(/^コインを1回投げオモテなら、([1-9][0-9]*)ダメージ追加。$/);
 const printed=String(entry.damage).normalize('NFKC');
 if(kind==='ATTACK'&&match&&/^\d+\+$/.test(printed)&&Number.isSafeInteger(Number.parseInt(printed,10)+Number(match[1])))return {mechanic:'COIN_BONUS_DAMAGE',commands:['COIN_FLIP','DAMAGE'],base:Number.parseInt(printed,10),bonus:Number(match[1])};
 const repeatCoin=generic.match(/^ウラが出るまでコインを投げ、オモテの数×([1-9][0-9]?)ダメージ(追加)?。$/);
 if(kind==='ATTACK'&&repeatCoin){
  const unit=Number(repeatCoin[1]),additional=Boolean(repeatCoin[2]);
  if(additional?/^\d{1,3}\+$/.test(printed):printed===unit+'×')
   return {mechanic:'COIN_UNTIL_TAILS_DAMAGE',commands:['COIN_FLIP','DAMAGE'],base:additional?Number.parseInt(printed,10):0,unit};
 }
 if(kind==='ATTACK'&&generic==='自分のベンチポケモンが4匹以下なら、このワザは失敗。'&&/^\d+$/.test(printed)&&Number(printed)>0)
  return {mechanic:'FULL_BENCH_REQUIRED_DAMAGE',commands:['DAMAGE'],minimum:5};
 if(kind==='ABILITY'&&generic==='このポケモンがバトル場にいるなら、自分の番に1回使える。自分の山札を上から6枚見て、その中からサポートを1枚選び、相手に見せて、手札に加える。残りのカードは山札にもどして切る。')
  return {mechanic:'ACTIVE_TOP_SUPPORTER_SEARCH',commands:['SEARCH_DECK','REVEAL','ADD_TO_HAND','RETURN_TO_DECK','SHUFFLE_DECK']};
 const benchDamage=generic.match(/^(自分|相手)のベンチポケモンの数×([1-9][0-9]?)ダメージ(追加)?。$/);
 if(kind==='ATTACK'&&benchDamage){
  const unit=Number(benchDamage[2]),additional=Boolean(benchDamage[3]);
  if(additional?/^\d{1,3}\+$/.test(printed):printed===unit+'×')
   return {mechanic:'BENCH_COUNT_DAMAGE',commands:['DAMAGE'],side:benchDamage[1]==='自分'?'own':'opponent',unit,base:additional?Number.parseInt(printed,10):0};
 }
 const counterDamage=generic.match(/^このポケモンにのっているダメカンの数×([1-9][0-9]?)ダメージ(追加)?。$/);
 if(kind==='ATTACK'&&counterDamage){
  const [,multiplier,additional]=counterDamage,perCounter=Number(multiplier);
  const base=Number.parseInt(printed,10);
  if(additional&&/^\d+\+$/.test(printed)&&Number.isSafeInteger(base))
   return {mechanic:'SELF_COUNTER_DAMAGE',commands:['DAMAGE'],base,perCounter};
  if(!additional&&printed===perCounter+'×')
   return {mechanic:'SELF_COUNTER_DAMAGE',commands:['DAMAGE'],base:0,perCounter};
 }
 if(kind==='ABILITY'&&generic==='このポケモンは、ベンチにいるかぎり、ワザのダメージを受けない。')return {mechanic:'BENCH_DAMAGE_PROTECTION',commands:['PREVENT_DAMAGE']};
 match=generic.match(/^このカードは、ポケモンについているかぎり、\[無色\]エネルギー([1-9][0-9]*)個ぶんとしてはたらく。このカードをつけているポケモンが使うワザの、相手のポケモンへのダメージは「-([1-9][0-9]*)」される。$/);
 if(kind==='MAIN'&&entry.category==='energy'&&match&&match.slice(1).every(v=>Number.isSafeInteger(Number(v))))return {mechanic:'COLORLESS_MULTI_ENERGY',commands:['ATTACH_ENERGY','MODIFY_DAMAGE'],units:Number(match[1]),damagePenalty:Number(match[2])};
 match=generic.match(/^このポケモンにも([1-9][0-9]*)ダメージ。$/);
 if(kind==='ATTACK'&&match&&/^\d+$/.test(String(entry.damage))&&Number.isSafeInteger(Number(match[1])))return {mechanic:'RECOIL_DAMAGE',commands:['DAMAGE'],amount:Number(match[1])};
 match=generic.match(/^このポケモンのHPを「([1-9][0-9]*)」回復する。$/);
 if(kind==='ATTACK'&&match&&/^\d+$/.test(String(entry.damage))&&Number.isSafeInteger(Number(match[1])))return {mechanic:'HEAL_SELF_ATTACK',commands:['DAMAGE','HEAL'],amount:Number(match[1])};
 match=generic.match(/^コインを([1-9][0-9]?)回投げ、オモテの数×([1-9][0-9]*)ダメージ。$/);
 if(kind==='ATTACK'&&match&&/^\d+×$/.test(String(entry.damage))&&Number.parseInt(entry.damage,10)===Number(match[2])&&Number.isSafeInteger(Number(match[2])))return {mechanic:'FIXED_COIN_HITS',commands:['COIN_FLIP','DAMAGE'],flips:Number(match[1]),unit:Number(match[2])};
 match=generic.match(/^自分のトラッシュから\[([^\]]+)\]ポケモンと「基本\[([^\]]+)\]エネルギー」を合計([1-9][0-9]*)枚まで選び、相手に見せて、手札に加える。$/);
 if(kind==='MAIN'&&['item','supporter'].includes(entry.category)&&match&&match[1]===match[2]&&['草','炎','水','雷','超','闘','悪','鋼','妖','竜','無色'].includes(match[1])&&Number.isSafeInteger(Number(match[3])))return {mechanic:'RECOVER_TYPED_DISCARD',commands:['REVEAL','ADD_TO_HAND'],type:match[1],amount:Number(match[3])};
 // The active opponent Pokemon ex alone receives this turn's attack bonus, before weakness/resistance.
 if(kind==='MAIN'&&entry.category==='supporter'&&generic==='この番、自分のポケモンが使うワザの、相手のバトル場の「ポケモンex」へのダメージは「+40」される。')return {mechanic:'BOOST_EX_DAMAGE_THIS_TURN',commands:['MODIFY_DAMAGE'],amount:40};
 // Reuse exact official effect bodies across their distinct printings;
 // a near match is intentionally not connected until separately verified.
 if(kind==='MAIN'&&entry.category==='tool'&&generic==='このカードをつけているポケモンは、にげるためのエネルギーが2個ぶん少なくなる。')
  return {mechanic:'TOOL_RETREAT_DISCOUNT_TWO',commands:['MODIFY_RETREAT_COST'],amount:2};
 const orderedBottomDraw=generic.match(/^自分の手札を([1-9])枚選び、好きな順番に入れ替えて、山札の下にもどす。その後、山札を([1-9])枚引く。\(自分の手札を\1枚もどせないなら、このカードは使えない。\)$/);
 if(kind==='MAIN'&&entry.category==='supporter'&&orderedBottomDraw)return {mechanic:'SUPPORTER_ORDERED_BOTTOM_DRAW',commands:['RETURN_TO_DECK','DRAW'],count:Number(orderedBottomDraw[1]),draw:Number(orderedBottomDraw[2]),sharedWording:true};
 if(kind==='MAIN'&&entry.category==='supporter'&&generic==='このカードは、自分の手札を1枚トラッシュしなければ使えない。自分の手札が6枚になるように、山札を引く。')
  return {mechanic:'SUPPORTER_DISCARD_ONE_DRAW_TO_SIX',commands:['DISCARD','DRAW'],limit:6};
 if(kind==='ATTACK'&&generic==='相手の手札を見る。'&&/^\d+$/.test(String(entry.damage||'0')))
  return {mechanic:'ATTACK_REVEAL_OPPONENT_HAND',commands:['DAMAGE','REVEAL']};
 if(kind==='MAIN'&&entry.category==='item'&&generic==='相手のベンチポケモンを1匹選び、バトルポケモンと入れ替える。その後、自分のバトルポケモンをベンチポケモンと入れ替える。')
  return {mechanic:'TRAINER_SWITCH_BOTH',commands:['FORCE_SWITCH','SWITCH']};
 if(kind==='MAIN'&&entry.category==='supporter'&&generic==='自分のバトル場の「ロケット団のポケモン」を、ベンチの「ロケット団のポケモン」と入れ替える。その後、相手のベンチポケモンを1匹選び、バトルポケモンと入れ替える。')
  return {mechanic:'SUPPORTER_ROCKET_SWITCH_BOTH',commands:['SWITCH','FORCE_SWITCH'],sharedWording:true};
 if(kind==='MAIN'&&entry.category==='supporter'&&generic==='相手のベンチのたねポケモンを1匹選び、バトルポケモンと入れ替える。その後、新しく出てきたポケモンをこんらんにする。')
  return {mechanic:'SUPPORTER_BASIC_SWITCH_CONFUSE',commands:['FORCE_SWITCH','STATUS_CONDITION'],sharedWording:true};
 const switchHeal=generic.match(/^自分のバトルポケモンをベンチポケモンと入れ替える。「ポケモンex」をベンチに入れ替えた場合、そのポケモンのHPを「([1-9]\d{0,2})」回復する。$/);
 if(kind==='MAIN'&&entry.category==='supporter'&&switchHeal)
  return {mechanic:'SUPPORTER_SWITCH_EX_HEAL',commands:['SWITCH','HEAL'],amount:Number(switchHeal[1]),sharedWording:true};
 const switchDraw=generic.match(/^自分のバトルポケモンをベンチポケモンと入れ替える。その後、自分の手札が([1-9]\d?)枚になるように、山札を引く。$/);
 if(kind==='MAIN'&&entry.category==='supporter'&&switchDraw)
  return {mechanic:'SUPPORTER_SWITCH_THEN_DRAW_TO_LIMIT',commands:['SWITCH','DRAW'],limit:Number(switchDraw[1])};
 if(kind==='MAIN'&&entry.category==='supporter'&&generic==='自分の山札から「たねポケモン」「1進化ポケモン」「2進化ポケモン」を1枚ずつ選び、相手に見せて、手札に加える。そして山札を切る。')
  return {mechanic:'SUPPORTER_SEARCH_BY_STAGE',commands:['SEARCH_DECK','REVEAL','ADD_TO_HAND','SHUFFLE_DECK']};
 const ij=kind==='MAIN'&&ijMainPlans.get(entry.category+':'+text);
 if(ij)return {...ij,commands:[...ij.commands]};
 if(kind==="MAIN"&&generic==="自分のトラッシュから「基本[鋼]エネルギー」を2枚まで選び、自分の[鋼]ポケモン1匹につける。"&&entry.category==="supporter")return {"mechanic":"MASS_ENERGY_ROUTE","commands":["ATTACH_ENERGY"],"zone":"discard","type":"鋼","limit":2,"target":"own","holderType":"鋼","team":null,"multi":false,"heal":null,"activeOnly":false,"repeated":false,"sharedWording":true};
 if(kind==="MAIN"&&generic==="自分のトラッシュから「基本[超]エネルギー」を1枚選び、ベンチの[超]ポケモンにつける。"&&entry.category==="item")return {"mechanic":"MASS_ENERGY_ROUTE","commands":["ATTACH_ENERGY"],"zone":"discard","type":"超","limit":1,"target":"bench","holderType":"超","team":null,"multi":false,"heal":null,"activeOnly":false,"repeated":false,"sharedWording":true};
 if(kind==="ATTACK"&&generic==="自分のトラッシュからポケモンと基本エネルギーを合計3枚まで選び、相手に見せて、山札にもどして切る。"&&String(entry.damage??"0")==="0")return {"mechanic":"MASS_ZONE_TRANSFER","commands":["REVEAL","RETURN_TO_DECK","SHUFFLE_DECK"],"zone":"discard","destination":"deck","category":"pokemonOrBasicEnergy","type":null,"stage":null,"team":null,"energyType":null,"limit":3,"activeOnly":false,"sharedWording":true};
 const p=byText.get(text);return p?{...p,commands:[...p.commands]}:additional||massSharedPlan(entry,kind,generic)||sequencePlan(entry,kind,generic)||handAndHealPlan(entry,kind,generic)||energyCountFallback(entry,kind,generic)||sequencePlan(entry,kind,generic,true)||evolutionTransferFallback(entry,kind,generic)||sequencePlan(entry,kind,generic,'attack');
}
// Compose an already verified, exact transfer grammar with the canonical
// evolution-entry window. Existing plans always take precedence.
function evolutionTransferFallback(entry,kind,text){
 if(kind!=='ABILITY')return null;
 const prefixes=[['自分の番に、このカードを手札から出して進化させたとき、1回使える。','evolve'],['自分の番に、このカードを手札からベンチに出したとき、1回使える。','bench']];
 const trigger=prefixes.find(([prefix])=>text.startsWith(prefix));if(!trigger)return null;
 const [prefix,origin]=trigger;
 const body=text.slice(prefix.length);
 const regular='自分の番に1回使える。'+body;
 const transfer=massSharedPlan(entry,kind,regular);
 if(transfer&&!transfer.activeOnly&&!transfer.repeated&&((transfer.mechanic==='MASS_ZONE_TRANSFER'&&transfer.destination==='hand')||transfer.mechanic==='MASS_ENERGY_ROUTE'&&(origin==='evolve'||!transfer.heal&&!transfer.oneEach)))return {...transfer,origin};
 if(origin==='bench')return null;
 // The same canonical transfer primitive handles named-team acceleration.
 const team=body.match(/^自分の(山札|トラッシュ|手札)から「基本\[([草炎水雷超闘悪鋼])\]エネルギー」を([1-9])枚まで選び、自分の「(マリィ|エリカ)のポケモン」に好きなようにつける。(そして山札を切る。)?$/);
 if(team&&Boolean(team[5])===(team[1]==='山札'))return {mechanic:'MASS_ENERGY_ROUTE',commands:[...(team[1]==='山札'?['SEARCH_DECK']:[]),'ATTACH_ENERGY',...(team[1]==='山札'?['SHUFFLE_DECK']:[])],zone:({'山札':'deck','トラッシュ':'discard','手札':'hand'})[team[1]],type:team[2],limit:Number(team[3]),target:'own',holderType:null,team:team[4],multi:true,heal:null,origin:'evolve',sharedWording:true};
 const full=body.match(/^自分の(ポケモン1匹|ポケモン全員|バトルポケモン)のHPを、すべて回復する。$/);
 if(full)return {mechanic:'MASS_HEAL_OWN',commands:['HEAL'],type:null,target:full[1]==='ポケモン1匹'?'choice':full[1]==='ポケモン全員'?'all':'active',amount:'all',origin:'evolve',sharedWording:true};
 const healing=transfer?.mechanic==='MASS_HEAL_OWN'?transfer:handAndHealPlan(entry,kind,regular);
 if(healing&&['MASS_HEAL_OWN','MASS_HEAL_SCOPE'].includes(healing.mechanic))return {...healing,origin:'evolve'};
 return null;
}
function compile(catalog){
 return {...catalog,commandExtensions:[{name:'BENCH_FROM_ZONE',purpose:'Move selected physical Pokemon from HAND/DECK to BENCH through canonical entry rules'},{name:'MODIFY_MAX_HP',purpose:'Apply the source-verified continuous maximum-HP modifier; preserve existing damage'}],records:catalog.records.map(r=>({...r,
  attacks:r.attacks.map((a,i)=>({...a,effectId:`reference-${r.officialCardId}-attack-${i}`,plan:plan(a,'ATTACK')})),
  abilities:r.abilities.map((a,i)=>({...a,effectId:`reference-${r.officialCardId}-ability-${i}`,plan:plan(a,'ABILITY')})),
  mainPlan:r.category==='energy'&&(/^基本[炎超悪]エネルギー$/.test(r.name)||
    (/^[草炎水雷超闘悪鋼]$/.test(r.facts?.basicEnergyType)&&r.name===`基本${r.facts.basicEnergyType}エネルギー`))?{mechanic:'BASIC_ENERGY',commands:['ATTACH_ENERGY']}:plan(r,'MAIN')
 }))};
}
module.exports={ijMechanics,compile,norm,mainText};
