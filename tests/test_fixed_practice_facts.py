import hashlib,importlib.util,json,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('facts_builder',ROOT/'tools/build_fixed_practice_facts.py');builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
class ReferenceFactsTest(unittest.TestCase):
 def test_reference_identity_isolated(self):
  facts=json.loads((ROOT/'data/fixed-deck-practice-facts.json').read_text());bindings=json.loads((ROOT/'data/fixed-deck-preview-bindings.json').read_text())
  refs={b['deckName']:b['preview'] for b in bindings['bindings']}
  self.assertEqual(len(facts['records']),45)
  for c in facts['records']:
   self.assertIsNone(c['officialCardId']);self.assertIsNone(c['catalogCardId']);self.assertEqual(c['effectStatus'],'UNIMPLEMENTED')
   self.assertEqual(c['referenceOfficialCardId'],refs[c['name']]['officialCardId'])
   self.assertNotIn('attacks',c);self.assertNotIn('commands',c)
 def test_evolution_detail_replay(self):
  facts=json.loads((ROOT/'data/fixed-deck-practice-facts.json').read_text())
  refs={b['deckName']:b['preview'] for b in json.loads((ROOT/'data/fixed-deck-preview-bindings.json').read_text())['bindings']}
  count=0
  for c in facts['records']:
   if c['source'].get('kind')!='official-html-reference':continue
   path=ROOT/c['source']['path'];self.assertEqual(builder.digest(path),c['source']['sha256'])
   extracted=builder.html_facts(path,refs[c['name']]);self.assertEqual(extracted,{k:c[k] for k in extracted});count+=1
  self.assertEqual(count,5)
 def test_source_catalog_fingerprint(self):
  manifest=json.loads((ROOT/'data/formal-1945-reconciliation/input-manifest.json').read_text())
  expected='6a6ba0837d3fc3392bfc41537d6666c19719ab554921d4e64fdb1bbbb615a790'
  facts=json.loads((ROOT/'data/fixed-deck-practice-facts.json').read_text())
  sources=[c['source'] for c in facts['records'] if c['source'].get('kind')=='formal1945-reference']
  self.assertEqual(len(sources),11);self.assertTrue(all(s['sha256']==expected for s in sources))
  self.assertIn(expected,json.dumps(manifest))
if __name__=='__main__':unittest.main()
