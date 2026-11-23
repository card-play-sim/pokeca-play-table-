"""An official print with cached parser rejection must stay in the SAME work unit."""
import importlib.util
import tempfile
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('atomic_intake',ROOT/'scripts/continue-official-effect-intake.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
class AtomicParserRetry(unittest.TestCase):
 def test_cached_official_print_rechecks_only_after_parser_revision(self):
  with tempfile.TemporaryDirectory() as folder:
   previous=module.ROOT
   try:
    module.ROOT=Path(folder)
    evidence=module.ROOT/'data/effect-extensions/evidence/42945.json'
    evidence.parent.mkdir(parents=True)
    evidence.write_text('{"official":"evidence"}')
    version='f'*64
    self.assertTrue(module.cached_parser_retry('42945',{'reason':'UNSUPPORTED_POKEMON_RULE_SECTION'},version))
    self.assertFalse(module.cached_parser_retry('42945',{'reason':'UNSUPPORTED_POKEMON_RULE_SECTION','parserFingerprint':version},version))
    self.assertFalse(module.cached_parser_retry('42945',{'reason':'COLLECTOR_EXCEPTION'},version))
    self.assertFalse(module.cached_parser_retry('12345',{'reason':'UNSUPPORTED_EVOLUTION_CHAIN'},version))
    self.assertFalse(module.cached_parser_retry('42945',None,version))
   finally:
    module.ROOT=previous
if __name__=='__main__':
 unittest.main()
