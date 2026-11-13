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
function plan(entry,kind){
 const text=kind==='MAIN'?mainText(entry.text):norm(entry.text);
 if(kind==='ATTACK'&&text===''&&/^\d+$/.test(String(entry.damage)))return {mechanic:'VANILLA_DAMAGE',commands:['DAMAGE']};
 const draw=kind==='ATTACK'&&text.match(/^自分の山札を([1-9])枚引く。$/);
 if(draw&&/^\d+$/.test(String(entry.damage||'0')))return {mechanic:'ATTACK_DRAW',commands:['DAMAGE','DRAW'],draw:Number(draw[1])};
 const generic=text.normalize('NFKC');
 let match=generic.match(/^自分の山札を([1-9][0-9]*)枚引く。$/);
 if(kind==='MAIN'&&['item','supporter'].includes(entry.category)&&match&&Number.isSafeInteger(Number(match[1])))return {mechanic:'DRAW_CARDS',commands:['DRAW'],amount:Number(match[1])};
 match=generic.match(/^自分のポケモン1匹のHPを「([1-9][0-9]*)」回復する。$/);
 if(kind==='MAIN'&&['item','supporter'].includes(entry.category)&&match&&Number.isSafeInteger(Number(match[1])))return {mechanic:'HEAL_DAMAGE',commands:['HEAL'],amount:Number(match[1])};
 if(kind==='MAIN'&&['item','supporter'].includes(entry.category)&&generic==='コインを1回投げオモテなら、相手のベンチポケモンを1匹選び、バトルポケモンと入れ替える。')return {mechanic:'COIN_FORCE_SWITCH',commands:['COIN_FLIP','FORCE_SWITCH']};
 const p=byText.get(text);return p?{...p}:null;
}
function compile(catalog){
 return {...catalog,commandExtensions:[{name:'BENCH_FROM_ZONE',purpose:'Move selected physical Pokemon from HAND/DECK to BENCH through canonical entry rules'},{name:'MODIFY_MAX_HP',purpose:'Apply the source-verified continuous maximum-HP modifier; preserve existing damage'}],records:catalog.records.map(r=>({...r,
  attacks:r.attacks.map((a,i)=>({...a,effectId:`reference-${r.officialCardId}-attack-${i}`,plan:plan(a,'ATTACK')})),
  abilities:r.abilities.map((a,i)=>({...a,effectId:`reference-${r.officialCardId}-ability-${i}`,plan:plan(a,'ABILITY')})),
  mainPlan:r.category==='energy'&&r.name.match(/^基本[炎超悪]エネルギー$/)?{mechanic:'BASIC_ENERGY',commands:['ATTACH_ENERGY']}:plan(r,'MAIN')
 }))};
}
module.exports={compile,norm,mainText};
