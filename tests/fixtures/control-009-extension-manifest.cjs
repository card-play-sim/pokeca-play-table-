'use strict';
module.exports=function(fixed,records,{catalog=null}={}){
 const manifest=JSON.parse(JSON.stringify(fixed)),category=c=>({goods:'item',support:'supporter'}[c]||c);
 for(const [i,deck]of manifest.decks.entries()){
  deck.id='control-009-reference-'+i;deck.name='共通効果拡張検証 '+(i+1);
  if(catalog){
   const assert=require('node:assert/strict'),protectedNames=new Set(),byName=new Map();
   const legal=catalog.filter(r=>r.category==='pokemon'&&r.attacks?.every(a=>a.plan)&&r.abilities?.every(a=>a.plan));
   for(const row of legal){if(!byName.has(row.name))byName.set(row.name,[]);byName.get(row.name).push(row);}
   const total=name=>deck.cards.filter(c=>c.name===name).reduce((n,c)=>n+c.count,0);
   const add=(row,want)=>{
    protectedNames.add(row.name);
    const existing=total(row.name),basicEnergy=row.category==='energy'&&/^基本.エネルギー$/.test(row.name);
    const exact=deck.cards.find(c=>c.name===row.name&&String(c.referenceOfficialCardId)===String(row.officialCardId));
    if(!exact&&existing&&row.officialCardId){
     const prior=deck.cards.find(c=>c.name===row.name&&c.count>0&&!c.referenceOfficialCardId);
     if(prior){prior.count--;deck.cards.push({name:row.name,category:row.category,count:1,referenceOfficialCardId:row.officialCardId});}
    }
    for(let n=existing;n<want;n++){
     const donor=deck.cards.find(c=>c.count>0&&!protectedNames.has(c.name)&&['item','supporter'].includes(category(c.category)))||deck.cards.find(c=>c.count>0&&!protectedNames.has(c.name)&&category(c.category)===row.category&&c.name!==row.name);
     assert(donor,'MATCH_DECK_DONOR_UNAVAILABLE:'+row.name);
     donor.count--;
     const target=deck.cards.find(c=>c.name===row.name&&String(c.referenceOfficialCardId||'')===String(row.officialCardId||''));
     if(target)target.count++;else deck.cards.push({name:row.name,category:row.category,count:1,...(row.officialCardId?{referenceOfficialCardId:row.officialCardId}:{})});
    }
    assert(basicEnergy||total(row.name)<=4,'MATCH_DECK_NAME_LIMIT:'+row.name);
   };
   for(const row of records)protectedNames.add(row.name);
   for(const row of records){
    const pokemon=row.category==='pokemon',wantsEntry=row.abilities?.some(a=>a.plan?.origin==='activeEntry');
    const wantsRetreat=row.abilities?.some(a=>['PASSIVE_EMPTY_ENERGY_RETREAT','PASSIVE_TYPED_TEAM_RETREAT'].includes(a.plan?.mechanic));
    const wantsMill=row.attacks?.some(a=>['COIN_UNTIL_TAILS_MILL','DECK_ORDER_SELECT'].includes(a.plan?.mechanic));
    const teamTool=row.mainPlan?.mechanic==='TOOL_NAMED_TEAM_MAX_HP'?row.mainPlan:null;
    const statusTool=row.mainPlan?.mechanic==='TOOL_STATUS_ATTACK_BOOST';
    add(row,statusTool?4:wantsEntry||wantsRetreat||wantsMill||teamTool?3:1);
    if(teamTool){
     const suitable=legal.filter(r=>r.facts.basic&&r.name.startsWith(teamTool.team+'の')&&r.attacks.some(a=>a.plan?.mechanic==='VANILLA_DAMAGE'&&Number(a.damage)>0));
     const names=[...new Map(suitable.map(r=>[r.name,r])).values()].slice(0,2);
     assert(names.length,'MATCH_TEAM_TOOL_RECIPIENT_MISSING:'+teamTool.team);
     for(const holder of names){
      add(holder,3);
      const types=new Set(holder.attacks.flatMap(a=>a.cost||[]).filter(t=>['草','炎','水','雷','超','闘','悪','鋼'].includes(t)));
      for(const type of types){
       const energy=catalog.find(r=>r.category==='energy'&&r.name==='基本'+type+'エネルギー'&&r.mainPlan?.mechanic==='BASIC_ENERGY');
       assert(energy,'MATCH_TEAM_TOOL_ENERGY_MISSING:'+type);add(energy,4);
      }
     }
    }
    if(pokemon){
     let child=row;
     while(child.facts?.stage>0){
      const parent=(byName.get(child.facts.evolvesFrom)||[]).find(r=>r.facts?.stage===child.facts.stage-1);
      const fossil=child.facts.stage===1&&!parent?catalog.find(r=>r.category==='item'&&r.name===child.facts.evolvesFrom&&r.mainPlan?.mechanic==='TRAINER_FOSSIL_BASIC'):null;
      if(fossil){add(fossil,2);break;}
      assert(parent,'MATCH_EVOLUTION_PARENT_MISSING:'+child.name);
      add(parent,wantsEntry||wantsRetreat||wantsMill?4:2);child=parent;
     }
     const types=new Set([...row.attacks.flatMap(a=>a.cost||[]),...row.abilities.flatMap(a=>[a.plan?.type,a.plan?.energyType])].filter(t=>['草','炎','水','雷','超','闘','悪','鋼'].includes(t)));
     for(const type of types){
      const energy=catalog.find(r=>r.category==='energy'&&r.name==='基本'+type+'エネルギー'&&r.mainPlan?.mechanic==='BASIC_ENERGY');
      assert(energy?.officialCardId,'MATCH_BASIC_ENERGY_PRINT_MISSING:'+type);
      add(energy,wantsEntry||wantsRetreat||wantsMill?10:4);
     }
     if(wantsEntry){
      const swap=catalog.find(r=>r.category==='item'&&r.mainPlan?.mechanic==='SWITCH');
      assert(swap,'MATCH_SWITCH_ITEM_MISSING');
      add(swap,4);
     }
    }
   }
   deck.cards=deck.cards.filter(c=>c.count);
   continue;
  }
  for(const row of records){
   const source=deck.cards.find(c=>category(c.category)===(row.category==='stadium'?'item':row.category)&&c.count&&!c.referenceOfficialCardId)||deck.cards.find(c=>['item','supporter'].includes(category(c.category))&&c.count&&!c.referenceOfficialCardId);if(!source)throw Error('FIXTURE_CATEGORY_UNAVAILABLE:'+row.category);
   source.count--;deck.cards.push({name:row.name,category:row.category,count:1,referenceOfficialCardId:row.officialCardId});
  }
  deck.cards=deck.cards.filter(c=>c.count);
 }
 return manifest;
};
