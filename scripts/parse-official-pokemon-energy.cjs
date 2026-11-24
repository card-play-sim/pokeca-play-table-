'use strict';
// Exact official layout parser. Unknown markup, rules or effect boundaries fail closed.
const icons={none:'無色',dark:'悪',psychic:'超',dragon:'竜',grass:'草',fire:'炎',water:'水',electric:'雷',fighting:'闘',steel:'鋼',fairy:'妖',void:null};
const assert=(v,m)=>{if(!v)throw Error(m);};
function tokens(s){const out=[];for(const m of s.matchAll(/<span\b[^>]*class="([^"]*)"[^>]*>\s*<\/span>/g)){const key=m[1].split(/\s+/).find(x=>x.startsWith('icon-'))?.slice(5);if(!key)continue;assert(Object.hasOwn(icons,key),'UNKNOWN_OFFICIAL_ICON:'+key);if(icons[key])out.push(icons[key]);}return out;}
function text(s){
 s=s.replace(/<span\b[^>]*class="([^"]*)"[^>]*>\s*<\/span>/g,(all,c)=>{const k=c.split(/\s+/).find(x=>x.startsWith('icon-'))?.slice(5);assert(k&&Object.hasOwn(icons,k),'UNSUPPORTED_INLINE_MARKUP');return icons[k]?'['+icons[k]+']':'';}).replace(/<br\s*\/?\s*>/gi,'');
 assert(!/<[^>]+>/.test(s),'UNSUPPORTED_INLINE_MARKUP');return s.replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,'').trim();
}
function label(s){assert(!/<[^>]*>/.test(s),'UNSUPPORTED_NAME_MARKUP');return s.replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').trim();}
function linkedPredecessor(chain,stage,name){
 const start=/<div class="evolution (?:ev_on|ev_off|evbox)">/g;
 const rows=[...chain.matchAll(start)];
 if(!rows.length||chain.slice(0,rows[0].index).trim())return null;
 const entry=/<div class="(?:evolution |evolution in-box |in-box )(ev_on|ev_off)">\s*<a\b[^>]*>([^<]+)<\/a>\s*(?:<div class="arrow_(on|off)"><\/div>)?\s*<\/div>/g;
 const parsed=rows.map((row,index)=>{
  const html=chain.slice(row.index,rows[index+1]?.index??chain.length);
  const boxed=row[0].includes('evbox');
  const body=boxed?html.slice(row[0].length).replace(/<\/div\/?>\s*$/,''):html;
  const linked=[...body.matchAll(entry)];
  if(!linked.length||linked.map(x=>x[0]).join('').replace(/\s/g,'')!==body.replace(/\s/g,''))return null;
  if(linked.some(link=>link[3]&&link[1]!==`ev_${link[3]}`))return null;
  return linked;
 });
 if(parsed.includes(null))return null;
 const selected=parsed.flatMap((row,index)=>row.filter(link=>link[1]==='ev_on').map(link=>({index,name:label(link[2])})));
 if(selected.length!==1||selected[0].name!==name)return null;
 const earlier=parsed.slice(selected[0].index+1).map(row=>row.filter(link=>link[3]==='off')).filter(row=>row.length);
 return earlier.length===stage&&earlier.every(row=>row.length===1)?label(earlier[0][0][2]):null;
}
function predecessor(right,stage,name){
 if(stage===0)return null;
 const evolution=right.match(/<h2[^>]*>進化<\/h2>([\s\S]*?)\n\s*<\/div>\s*<\/div>\s*<div class="clear">/)?.[1]||'';
 const linkedRows=[...evolution.matchAll(/<div class="evolution (ev_on|ev_off)">\s*<a\b[^>]*>([^<]+)<\/a>\s*(<div class="arrow_(on|off)"><\/div>)?\s*<\/div>/g)];
 // An unlinked row above the current Pokémon is an evolution, not its predecessor.
 // Use the official arrow-marked chain only when all three rows have this exact layout.
 if(stage===1&&linkedRows.length===3&&linkedRows.map(r=>r[0]).join('').replace(/\s/g,'')===evolution.replace(/\s/g,'')){
  const [next,current,previous]=linkedRows;
  if(next[1]==='ev_off'&&!next[3]&&current[1]==='ev_on'&&current[4]==='on'&&label(current[2])===name&&previous[1]==='ev_off'&&previous[4]==='off')
   return label(previous[2]);
 }
 // A three-row arrow-linked evolution chain must never fall back to the
 // unmarked-row heuristic: a missing arrow makes the predecessor ambiguous.
 if(stage===1&&linkedRows.length===3&&linkedRows.some(r=>r[3]||r[4])){
  // The official chain may contain a BREAK stage and boxed alternative
  // evolutions above the highlighted stage-1 Pokemon.  Validate every
  // entry/arrow, then use ONLY the row immediately below the current Pokemon.
  // Ambiguous or malformed chains still fail closed rather than guessing.
  const verified=linkedPredecessor(evolution,stage,name);
  if(verified)return verified;
  assert(false,'UNSUPPORTED_EVOLUTION_CHAIN');
 }
 const ordinary=[...right.matchAll(/<div class="evolution ev_off">\s*<a\b[^>]*>([^<]+)<\/a>/g)].map(m=>label(m[1]));
 if(ordinary.length!==stage){
  // Some final evolutions share a display row with alternate print families
  // or a later BREAK evolution. The predecessor is the arrow-linked row
  // below the one marked as current, never an alternate inside the same box.
  const current=[...evolution.matchAll(/<div class="(?:in-box|evolution) ev_on">\s*<a\b[^>]*>([^<]+)<\/a>/g)];
  const boxedCurrent=/<div class="in-box ev_on">\s*<a\b[^>]*>([^<]+)<\/a>\s*<\/div>\s*<\/div>/g;
  const boxed=[...evolution.matchAll(boxedCurrent)];
  if(current.length===1&&boxed.length===1&&label(boxed[0][1])===name){
   const tail=evolution.slice(boxed[0].index+boxed[0][0].length);
   const rows=[...tail.matchAll(/<div class="evolution ev_off">\s*<a\b[^>]*>([^<]+)<\/a>\s*<div class="arrow_off"><\/div>\s*<\/div>/g)];
   if(rows.length===stage&&rows.map(row=>row[0]).join('').replace(/\s/g,'')===tail.replace(/\s/g,''))
    return label(rows[0][1]);
  }
  // An arrow below the highlighted row connects it to its predecessor.
  // Ignore parallel prints within the same row and evolutions above it.
  const highlighted=[...evolution.matchAll(/<div class="(?:in-box|evolution) ev_on">\s*<a\b[^>]*>([^<]+)<\/a>\s*<div class="arrow_on"><\/div>\s*<\/div>/g)];
  if(highlighted.length===1&&label(highlighted[0][1])===name){
   const row=highlighted[0];
   let tail=evolution.slice(row.index+row[0].length);
   if(row[0].includes('in-box ev_on')){
    tail=tail.replace(/^(?:\s*<div class="in-box ev_off">\s*<a\b[^>]*>[^<]+<\/a>\s*<\/div>)*\s*<\/div>/,'');
   }
   const chain=[...tail.matchAll(/<div class="evolution ev_off">\s*<a\b[^>]*>([^<]+)<\/a>\s*<div class="arrow_off"><\/div>\s*<\/div>/g)];
   if(chain.length===stage&&chain.map(link=>link[0]).join('').replace(/\s/g,'')===tail.replace(/\s/g,''))
    return label(chain[0][1]);
  }
  const linked=linkedPredecessor(evolution,stage,name);
  if(linked)return linked;
 }
 assert(ordinary.length===stage,'UNSUPPORTED_EVOLUTION_CHAIN');
 return ordinary[0];
}
function parse(html,{enableTeraRule=false}={}){
 const right=html.slice(html.indexOf('<div class="RightBox-inner">'));assert(right.startsWith('<div'),'OFFICIAL_DETAIL_LAYOUT');
 const first=right.search(/<h2\b/);assert(first>=0,'OFFICIAL_EFFECT_SECTION');
 if(/^<h2[^>]*>基本エネルギー<\/h2>\s*(?:<p>(?:※ロゴあり（専用キャンペーン）)?\s*<\/p>\s*)?<\/div>/.test(right.slice(first))){const name=label(html.match(/<h1[^>]*>(.*?)<\/h1>/s)?.[1]||''),m=name.match(/^基本([草炎水雷超闘悪鋼])エネルギー$/);assert(m,'UNVERIFIED_BASIC_ENERGY_TYPE');return {category:'energy',text:'',attacks:[],abilities:[],rulesText:[],facts:{prizeCount:1,rulePokemon:false,teraBenchProtection:false,basicEnergyType:m[1]}};}
 if(/^<h2[^>]*>特殊エネルギー<\/h2>/.test(right.slice(first))){
  const section=right.slice(first).match(/^<h2[^>]*>特殊エネルギー<\/h2>\s*<p[^>]*>([^]*?)<\/p>\s*(?:<h2[^>]*>特別なルール<\/h2>\s*<p><p>(ACE SPECのカードは、デッキに1枚しか入れられない。)<\/p><\/p>\s*)?<\/div>/);
  assert(section,'UNSUPPORTED_ENERGY_PARAGRAPHS');
  return {category:'energy',text:text(section[1]),attacks:[],abilities:[],rulesText:section[2]?[section[2]]:[],facts:{prizeCount:1,rulePokemon:false,teraBenchProtection:false}};
 }
 // These exact official rules affect prize count, which the battle engine already enforces.
 const special=right.match(/<h2[^>]*>特別なルール<\/h2>\s*<p><p>([^<]*)<\/p><\/p>/);
 const prizeRules=new Map([
  ['ポケモンexがきぜつしたとき、相手はサイドを2枚とる。',2],
  ['メガシンカexがきぜつしたとき、相手はサイドを3枚とる。',3]
 ]);
 const prizeCount=special&&prizeRules.get(special[1].trim());
 if(/<h[234][^>]*>特別なルール<\/h[234]>/.test(right))
  assert(prizeCount,'UNSUPPORTED_POKEMON_RULE_SECTION');
 const rulePokemon=Boolean(prizeCount);
 const top=right.slice(0,first),stageText=text(top.match(/<span class="type">(.*?)<\/span>/s)?.[1]||'').replace(/\s/g,''),stage=stageText==='たね'?0:stageText==='1進化'?1:stageText==='2進化'?2:null;assert(stage!==null,'UNSUPPORTED_POKEMON_STAGE');
 const topParagraphs=[...top.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map(m=>text(m[1]));assert(topParagraphs.every(t=>t==='このポケモンは、ベンチにいるかぎり、ワザのダメージを受けない。'),'UNSUPPORTED_TOP_RULE');const teraBenchProtection=enableTeraRule&&topParagraphs.length>0;
 const hp=Number(top.match(/<span class="hp-num">(\d+)<\/span>/)?.[1]);assert(hp>0&&Number.isSafeInteger(hp),'MISSING_PRINTED_HP');const types=tokens(top);assert(types.length===1,'UNSUPPORTED_POKEMON_TYPES');
 const table=right.match(/<table\b[^>]*>([\s\S]*?)<\/table>/);assert(table,'MISSING_PRINTED_DEFENSE');const cells=[...table[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(m=>m[1]);assert(cells.length===3,'UNSUPPORTED_PRINTED_DEFENSE');
 const defense=(s,kind)=>{if(text(s)==='--')return null;const types=tokens(s),v=text(s.replace(/<span[^>]*><\/span>/g,''));assert(types.length===1&&(kind==='weakness'?v==='×2':/^[-－−](20|30)$/.test(v)),'UNSUPPORTED_'+kind);return {types,value:kind==='resistance'?v.replace(/[－−]/g,'-'):v};};
 assert(tokens(cells[2]).every(t=>t==='無色'),'UNSUPPORTED_RETREAT_SYMBOL');
 const attacks=[],abilities=[],block=right.slice(first,table.index).replace(/<h2[^>]*>特別なルール<\/h2>\s*<p><p>[^<]*<\/p><\/p>/,'');let cursor=0,mode='';const re=/<h2[^>]*>(.*?)<\/h2>|<h4[^>]*>([\s\S]*?)<\/h4>\s*<p[^>]*>([\s\S]*?)<\/p>/g;
 for(const m of block.matchAll(re)){assert(!block.slice(cursor,m.index).trim(),'UNPARSED_EFFECT_BOUNDARY');cursor=m.index+m[0].length;
  if(m[1]!==undefined){mode=text(m[1]);assert(['ワザ','特性'].includes(mode),'UNSUPPORTED_POKEMON_RULE_SECTION');continue;}
  assert(mode,'MISSING_EFFECT_KIND');if(mode==='特性'){abilities.push({name:label(m[2]),text:text(m[3])});continue;}
  const d=m[2].match(/<span class="f_right Text-fjalla">([^<]*)<\/span>/),header=m[2].replace(/<span class="f_right Text-fjalla">[^<]*<\/span>/,'');const cost=tokens(header),name=label(header.replace(/<span[^>]*><\/span>/g,'')),damage=d?text(d[1]).replace(/＋/g,'+').replace(/[－−]/g,'-'):'0';assert(name&&/^\d+[-+×]?$/.test(damage),'UNSUPPORTED_ATTACK_HEADER');attacks.push({name,cost,damage,text:text(m[3])});
 }
 assert(!block.slice(cursor).trim()&&attacks.length,'UNPARSED_EFFECT_BOUNDARY');
 const evolvesFrom=predecessor(right,stage,label(html.match(/<h1[^>]*>(.*?)<\/h1>/s)?.[1]||''));
 return {category:'pokemon',text:'',attacks,abilities,rulesText:[],facts:{hp,evolvesFrom,retreatCost:tokens(cells[2]).length,types,weakness:defense(cells[0],'weakness'),resistance:defense(cells[1],'resistance'),stage,basic:stage===0,prizeCount:prizeCount||1,rulePokemon,teraBenchProtection}};
}
if(require.main===module){try{process.stdout.write(JSON.stringify(parse(require('node:fs').readFileSync(0,'utf8'))));}catch(e){process.stderr.write(e.message);process.exitCode=2;}}
module.exports={parse,text};
