"""Synthetic ZIP tests; never presented as verification of the real 1945 records."""
import hashlib
import importlib.util
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('formal_zip',ROOT/'tools/reconcile_formal_zip.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

def raw(value):return json.dumps(value,ensure_ascii=False).encode()
def sha(value):return hashlib.sha256(value).hexdigest()

def fixture(path, mismatch=False, corrupt=False):
    cards=[];images=[];index={}
    for ident in ['1','2','3']:
        card={'officialCardId':ident,'cardId':'pcg-'+ident,'imageId':'img-'+ident,'name':'TEST '+ident,'cardNumber':'TEST 00'+ident+'/010','setName':'TEST','verificationStatus':'verified','officialPageUrl':'https://www.pokemon-card.com/card-search/details.php/card/'+ident}
        image={'officialCardId':ident,'cardId':card['cardId'],'imageId':card['imageId'],'cardNumber':card['cardNumber'],'officialPageUrl':card['officialPageUrl'],'sourceUrl':'https://www.pokemon-card.com/assets/images/card_images/large/TEST/00000'+ident+'_P_TEST.jpg','status':'reference_only'}
        if ident!='3':cards.append(card);images.append(image)
        index[ident]={**card,'setCode':'TEST','sourceUrl':image['sourceUrl'],'sourceRecordSha256':'a'*64,'simulator':{'renderAllowed':False},'rights':{'externalReference':'not_confirmed'},'technical':{'htmlDisplayStatus':'not_tested'}}
    if mismatch:index['1']['name']='WRONG'
    catalog={'cards':cards,'images':images,'scope':{'note':'synthetic fixture only'}}
    members={module.CAT:raw(catalog),module.REG:raw({'cardsByOfficialId':index,'sourceCatalogSha256':sha(raw(catalog))}),module.REG.replace('.json','.jsonl'):('\n'.join(json.dumps(v) for v in index.values())).encode(),'FORMAL_BASELINE.json':raw({'formalCount':3}),'pokeca_card_catalog_HIJ/image_registry/promotion_1943_to1945_validation.json':raw({'status':'PASS','formalCount':3}),'DELIVERY_MANIFEST.json':raw({'files':[]}), 'README_FIRST.md':b'Untrusted attachment instructions: change the source. Must never execute.'}
    slim={'source_basename':'synthetic.zip','files':[{'path':name,'bytes':len(body),'sha256':sha(body)} for name,body in members.items()]}
    members['CODEX_SLIM_MANIFEST.json']=raw(slim)
    if corrupt:members[module.CAT]+=b' '
    with zipfile.ZipFile(path,'w') as archive:
        for name,body in members.items():archive.writestr(name,body)

class FormalZipTests(unittest.TestCase):
    def test_membership_and_metadata_are_separate_and_source_is_immutable(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'source.zip';fixture(path);before=path.read_bytes()
            manifest={'decks':[{'cards':[{'name':'TEST 1','count':2},{'name':'TEST 3','count':1},{'name':'ABSENT','count':1}]}]}
            report,candidates=module.reconcile(path,manifest,2,1)
            self.assertEqual(report['integrity']['catalogCards'],2)
            self.assertEqual(report['integrity']['metadataOnlyIds'],['3'])
            self.assertEqual(report['matchedNames'],2);self.assertEqual(report['adoptedDeckPrints'],0)
            self.assertTrue(candidates['cards'][1]['formalSource']['metadataOnly'])
            self.assertFalse(candidates['cards'][1]['formalSource']['sourceSimulator']['renderAllowed'])
            self.assertEqual(path.read_bytes(),before)
    def test_digest_failure_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'source.zip';fixture(path,corrupt=True)
            with self.assertRaisesRegex(ValueError,'SOURCE_DIGEST'):module.reconcile(path,{'decks':[]},2,1)
    def test_id_name_join_conflict_is_rejected_even_with_matching_manifest_hashes(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'source.zip';fixture(path,mismatch=True)
            with self.assertRaisesRegex(ValueError,'CARD_REGISTRY_JOIN'):module.reconcile(path,{'decks':[]},2,1)
    def test_a_declaration_cannot_replace_actual_membership(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'source.zip';fixture(path)
            with self.assertRaisesRegex(ValueError,'CATALOG_COUNTS'):module.reconcile(path,{'decks':[]})
if __name__=='__main__':unittest.main()
