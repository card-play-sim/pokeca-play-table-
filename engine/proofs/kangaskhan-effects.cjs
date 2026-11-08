'use strict';
// Imported unchanged from the locally verified kangaskhan_effect_proof ZIP.
// ISOLATED proof only. Not registered as a public game action.
const VERIFIED_IDS = Object.freeze(['47847','48466','48475']);
const clone = x => JSON.parse(JSON.stringify(x));
function verify(card) {
  if (!VERIFIED_IDS.includes(String(card?.officialCardId))) throw Error('UNVERIFIED_CARD_ID');
  if (card.name !== 'メガガルーラex') throw Error('CARD_ID_NAME_MISMATCH');
}
function getPlayer(game, playerId) {
  const p = game.players?.find(p=>p.id===playerId);
  if (!p || game.turnPlayer!==playerId || game.phase!=='main') throw Error('NOT_YOUR_MAIN_PHASE');
  return p;
}
function useDash(input, playerId) {
  const game=clone(input),p=getPlayer(game,playerId),card=p.active;
  verify(card);
  if (game.status!=='active') throw Error('GAME_NOT_ACTIVE');
  const key='おつかいダッシュ';
  if (p.turnLimits?.abilityNames?.[key]) throw Error('SHARED_ABILITY_ALREADY_USED');
  if (!Array.isArray(p.deck)||!Array.isArray(p.hand)) throw Error('INVALID_ZONES');
  const drawn=p.deck.splice(0,2);
  p.hand.push(...drawn);
  p.turnLimits ||= {};p.turnLimits.abilityNames ||= {};
  p.turnLimits.abilityNames[key]=true;
  return {game,drawn:drawn.map(c=>c.id)};
}
function machineGunCombo(input,playerId,coinFlips) {
  const game=clone(input),p=getPlayer(game,playerId),card=p.active;
  verify(card);
  if(game.status!=='active'||game.attackUsed||game.firstPlayer===playerId&&game.turnNumber===1) throw Error('ATTACK_NOT_ALLOWED');
  // Energy costs require the canonical Rule Engine's type/contribution calculation.
  // Three attached entries alone do not establish that the printed cost is payable.
  throw Error('ATTACK_COST_RULE_ENGINE_NOT_CONNECTED');
  if(!Array.isArray(coinFlips)||!coinFlips.includes(false)||coinFlips.some(x=>typeof x!=='boolean')) throw Error('COIN_SEQUENCE_MUST_END_WITH_TAILS');
  const tails=coinFlips.indexOf(false);
  if(tails!==coinFlips.length-1) throw Error('COIN_SEQUENCE_AFTER_TAILS');
  const opponent=game.players.find(q=>q.id!==playerId);
  if(!opponent?.active) throw Error('NO_OPPONENT_ACTIVE');
  const damage=200+50*tails;
  opponent.active.damage=(opponent.active.damage||0)+damage;
  game.attackUsed=true;
  return {game,damage,heads:tails};
}
module.exports={VERIFIED_IDS,useDash,machineGunCombo};
