"""The visual manifest must remain reproducible from official evidence."""
import importlib.util,json,unittest
from unittest.mock import patch
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('builder',ROOT/'tools/build_fixed_preview.py');builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
class PreviewEvidenceTest(unittest.TestCase):
 def test_replay_and_no_adoption(self):
  expected=json.loads((ROOT/'data/fixed-deck-preview-bindings.json').read_text());actual=builder.build()
  self.assertEqual(actual,expected)
  self.assertEqual(len(actual['bindings']),45)
  self.assertEqual(sum(b['nameAlias'] for b in actual['bindings']),2)
  self.assertEqual(sum(b['numberlessEnergy'] for b in actual['bindings']),3)
  self.assertTrue(all(b['adoptedOfficialCardId'] is None for b in actual['bindings']))
 def test_html_tampering_rejected(self):
  original=builder.read
  def tampered(path):
   data=original(path)
   if 'html' in data:data['html']+='tampered'
   return data
  with patch.object(builder,'read',tampered),self.assertRaises(AssertionError):builder.build()
 def test_number_not_invented(self):
  energies=[b for b in builder.build()['bindings'] if b['numberlessEnergy']]
  self.assertTrue(all(b['preview']['cardNumber'] is None and b['reason']=='OFFICIAL_NUMBER_EMPTY' for b in energies))
if __name__=='__main__':unittest.main()
