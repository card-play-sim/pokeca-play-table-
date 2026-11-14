"""New Pokemon/energy families through the existing app, not a separate demo."""
import asyncio,os,json,traceback
from pathlib import Path
os.environ['POKECA_INTAKE_PATTERNS']='COIN_BONUS_DAMAGE,DAMAGE_BY_OWN_COUNTERS,DAMAGE_BY_ACTIVE_ENERGY,ATTACK_DISCARD_DECK_TOP,ATTACK_BENCH_BASICS,ABILITY_ATTACH_SELF_DRAW,CONDITIONAL_EVOLVED_ENERGY,BASIC_ENERGY'
os.environ['POKECA_INTAKE_PER_PATTERN']='2'
os.environ['POKECA_INTAKE_PREFIX']='work/final-browser'
os.environ['POKECA_INTAKE_ARTIFACT']='final-shared-effects'
from test_control_013_browser import main
if __name__=='__main__':
 try:asyncio.run(main())
 except Exception:
  Path('artifacts').mkdir(exist_ok=True);Path('artifacts/final-shared-effects-browser-failure.json').write_text(json.dumps({'traceback':traceback.format_exc()}));raise
