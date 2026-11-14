"""Parameterized official prints through the existing DOM/save/offline/AI suite."""
import asyncio,os
os.environ['POKECA_INTAKE_PATTERNS']='RECOIL_DAMAGE,HEAL_SELF_ATTACK,FIXED_COIN_HITS,RECOVER_TYPED_DISCARD'
os.environ['POKECA_INTAKE_PER_PATTERN']='2'
os.environ['POKECA_INTAKE_PREFIX']='work/control014-browser'
os.environ['POKECA_INTAKE_ARTIFACT']='control-014'
from test_control_013_browser import main
if __name__=='__main__':
 import json,traceback
 from pathlib import Path
 try:asyncio.run(main())
 except Exception:
  Path('artifacts').mkdir(exist_ok=True)
  Path('artifacts/control-014-browser-failure.json').write_text(json.dumps({'traceback':traceback.format_exc()}))
  raise
