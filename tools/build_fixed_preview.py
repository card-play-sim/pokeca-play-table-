"""Build visual-only bindings from observed evidence, never adopted identities."""
import hashlib, importlib.util, json, re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('official_parser',ROOT/'tools/parse-official-image.py')
parser=importlib.util.module_from_spec(spec);spec.loader.exec_module(parser)
def read(path):return json.loads((ROOT/path).read_text())
def digest(path):return hashlib.sha256((ROOT/path).read_bytes()).hexdigest()
def checkpoint(path, expected, numberless=False):
    saved=read(path);html=saved['html'];ident=expected['officialCardId'];name=expected['name']
    assert hashlib.sha256(html.encode()).hexdigest()==saved['detailSha256']
    result=parser.parse(html,ident,name,expected)
    assert result==saved['result']
    if not numberless:
        assert result['status']=='CANDIDATE'
        return {k:result[k] for k in ('officialCardId','name','set','cardNumber','imageSourceUrl')}|{'officialPageUrl':saved['record']['officialPageUrl']}
    assert result=={'status':'HOLD','reason':'PRINT_EMPTY'}
    p=parser.Detail();p.feed(html)
    assert p.names==[name] and len(p.images)==len(p.sets)==len(p.numbers)==1
    assert not p.numbers[0].strip() and p.sets[0]==expected['observedSet']
    url='https://www.pokemon-card.com'+p.images[0] if p.images[0].startswith('/') else p.images[0]
    assert url==expected['imageSourceUrl']
    assert re.fullmatch(r'https://www\.pokemon-card\.com/assets/images/card_images/large/[A-Za-z0-9_-]+/0*'+ident+r'_[A-Za-z0-9_]+\.jpg',url)
    assert all(re.fullmatch(r'https://www\.pokemon-card\.com/card-search/details\.php/card/'+ident+r'(?:/regu/XY)?/?',u) for u in p.canonical)
    return {'officialCardId':ident,'name':name,'set':p.sets[0],'cardNumber':None,'imageSourceUrl':url,'officialPageUrl':expected['officialPageUrl']}
def build():
    rows=read('data/formal-1945-reconciliation/fixed45-final.json')['rows']
    registry={c['officialCardId']:c for c in read('data/official-image-registry.json')['cards']}
    energies=read('data/formal-1945-reconciliation/held-energy-evidence.json')['records']
    aliases=read('data/fixed-preview-evidence/alias-details.json')['cards']
    out=[]
    for row in rows:
        name=row['name']; refs=row['officialReferenceCandidates'];alias=row['nameCorrectionReview'];numberless=False
        if refs:
            ref=sorted(refs,key=lambda c:int(c['officialCardId']))[0];stored=registry[ref['officialCardId']]
            assert all(stored[k]==ref[k] for k in ('officialCardId','name','set','cardNumber','imageSourceUrl'))
            proof={'path':'data/official-image-registry.json','sha256':digest('data/official-image-registry.json')}
        elif alias:
            matches=[r for r in aliases if r['name']==alias['queriedOfficialName']];assert len(matches)==1
            path='data/fixed-preview-evidence/details/'+matches[0]['officialCardId']+'.json'
            ref=checkpoint(path,matches[0]);proof={'path':path,'sha256':digest(path)}
        else:
            matches=[r for r in energies if r['name']==name];assert matches
            observed=sorted(matches,key=lambda c:int(c['officialCardId']))[0];path=observed['checkpointPath']
            assert digest(path)==observed['checkpointSha256']
            ref=checkpoint(path,observed,True);proof={'path':path,'sha256':digest(path)};numberless=True
        out.append({'deckName':name,'mode':'provisional-preview','adoptedOfficialCardId':None,
                    'preview':ref,'nameAlias':bool(alias),'numberlessEnergy':numberless,'evidence':proof,
                    'selectionPolicy':'lowest observed verified reference ID; visual only, not a deck identity',
                    'reason':'NAME_ALIAS_REVIEW' if alias else 'OFFICIAL_NUMBER_EMPTY' if numberless else 'DECK_EDITION_UNSELECTED'})
    assert len(out)==45
    return {'schemaVersion':1,'deckPrintAdopted':False,'bindings':out}
if __name__=='__main__':
    result=build();(ROOT/'data/fixed-deck-preview-bindings.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print('Built 45 visual-only bindings; adopted identities: 0')
