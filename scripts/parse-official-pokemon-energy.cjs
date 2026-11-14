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
function parse(html){
 const right=html.slice(html.indexOf('<div class="RightBox-inner">'));assert(right.startsWith('<div'),'OFFICIAL_DETAIL_LAYOUT');
 const first=right.search(/<h2\b/);assert(first>=0,'OFFICIAL_EFFECT_SECTION');
 if(/<h2[^>]*>特殊エネルギー<\/h2>/.test(right.slice(first,first+90))){const section=right.slice(first).match(/^<h2[^>]*>特殊エネルギー<\/h2>\s*<p[^>]*>([\s\S]*?)<\/p>\s*<\/div>/);assert(section,'UNSUPPORTED_ENERGY_PARAGRAPHS');return {category:'energy',text:text(section[1]),attacks:[],abilities:[],rulesText:[],facts:{prizeCount:1,rulePokemon:false,teraBenchProtection:false}};}
 assert(!/<h[234][^>]*>特別なルール<\/h[234]>/.test(right),'UNSUPPORTED_POKEMON_RULE_SECTION');
 const top=right.slice(0,first),stageText=text(top.match(/<span class="type">(.*?)<\/span>/s)?.[1]||''),stage=stageText==='たね'?0:stageText==='1進化'?1:stageText==='2進化'?2:null;assert(stage!==null,'UNSUPPORTED_POKEMON_STAGE');
 const hp=Number(top.match(/<span class="hp-num">(\d+)<\/span>/)?.[1]);assert(hp>0&&Number.isSafeInteger(hp),'MISSING_PRINTED_HP');const types=tokens(top);assert(types.length===1,'UNSUPPORTED_POKEMON_TYPES');
 const table=right.match(/<table\b[^>]*>([\s\S]*?)<\/table>/);assert(table,'MISSING_PRINTED_DEFENSE');const cells=[...table[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(m=>m[1]);assert(cells.length===3,'UNSUPPORTED_PRINTED_DEFENSE');
 const defense=(s,kind)=>{if(text(s)==='--')return null;const types=tokens(s),v=text(s.replace(/<span[^>]*><\/span>/g,''));assert(types.length===1&&(kind==='weakness'?v==='×2':/^[-－−](20|30)$/.test(v)),'UNSUPPORTED_'+kind);return {types,value:kind==='resistance'?v.replace(/[－−]/g,'-'):v};};
 assert(tokens(cells[2]).every(t=>t==='無色'),'UNSUPPORTED_RETREAT_SYMBOL');
 const attacks=[],abilities=[],block=right.slice(first,table.index);let cursor=0,mode='';const re=/<h2[^>]*>(.*?)<\/h2>|<h4[^>]*>([\s\S]*?)<\/h4>\s*<p[^>]*>([\s\S]*?)<\/p>/g;
 for(const m of block.matchAll(re)){assert(!block.slice(cursor,m.index).trim(),'UNPARSED_EFFECT_BOUNDARY');cursor=m.index+m[0].length;
  if(m[1]!==undefined){mode=text(m[1]);assert(['ワザ','特性'].includes(mode),'UNSUPPORTED_POKEMON_RULE_SECTION');continue;}
  assert(mode,'MISSING_EFFECT_KIND');if(mode==='特性'){abilities.push({name:label(m[2]),text:text(m[3])});continue;}
  const d=m[2].match(/<span class="f_right Text-fjalla">([^<]*)<\/span>/),header=m[2].replace(/<span class="f_right Text-fjalla">[^<]*<\/span>/,'');const cost=tokens(header),name=label(header.replace(/<span[^>]*><\/span>/g,'')),damage=d?text(d[1]):'0';assert(name&&/^\d+[+×]?$/.test(damage),'UNSUPPORTED_ATTACK_HEADER');attacks.push({name,cost,damage,text:text(m[3])});
 }
 assert(!block.slice(cursor).trim()&&attacks.length,'UNPARSED_EFFECT_BOUNDARY');
 const evo=[...right.matchAll(/<div class="evolution ev_off"><a[^>]*>(.*?)<\/a>/g)].map(m=>label(m[1]));assert(stage===0||evo.length===1,'UNSUPPORTED_EVOLUTION_CHAIN');
 return {category:'pokemon',text:'',attacks,abilities,rulesText:[],facts:{hp,evolvesFrom:stage?evo[0]:null,retreatCost:tokens(cells[2]).length,types,weakness:defense(cells[0],'weakness'),resistance:defense(cells[1],'resistance'),stage,basic:stage===0,prizeCount:1,rulePokemon:false,teraBenchProtection:false}};
}
if(require.main===module){try{process.stdout.write(JSON.stringify(parse(require('node:fs').readFileSync(0,'utf8'))));}catch(e){process.stderr.write(e.message);process.exitCode=2;}}
module.exports={parse,text};
