#!/usr/bin/env python3
"""Safely append visually verified official M7 J prints to deck catalog using an image sidecar.

Fail closed when any official identity, source, mark-review or source-image SHA differs.
Never modify the existing 23,525-image registry, formal DB or old 4,995 catalog rows.
"""
from __future__ import annotations
from copy import deepcopy
from hashlib import sha256
from pathlib import Path
import json
import re
from urllib.parse import urlparse

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'reports/m7-official-delta.json'
PRINTS=ROOT/'reports/m7-full-print-number-audit.json'
STAGES=ROOT/'reports/m7-pokemon-stage-audit.json'
IMAGES=ROOT/'reports/m7-regulation-image-audit.json'
REVIEW=ROOT/'reports/m7-regulation-mark-review.json'
CATALOG=ROOT/'data/deck-building/catalog.json'
REGISTRY=ROOT/'data/official-image-registry.json'
EXTENSION=ROOT/'data/deck-building/m7-official-image-extension.json'
EXPECTED_CONTACT_SHEET_SHA='7c7ebcf077844987593d4a26257bb55bfa0252818a6d099a23400d90edc3601a'
EXPECTED_BASE_CATALOG_SHA='742782b8bd20cdf621663080271af5b332184edb848260f6d41f77fa3f421545'
EXPECTED_BASE_REGISTRY_SHA='59f39c87e13eecf6d92ad92711a3bd3786b588bb07fd5421fde41f0c986ed9ab'
SHA=re.compile(r'^[a-f0-9]{64}$')
VALID_CATEGORIES={'pokemon','goods','support','tool','stadium','energy'}
HEADINGS={'pokemon':'ポケモン','goods':'グッズ','support':'サポート','tool':'ポケモンのどうぐ','stadium':'スタジアム','energy':'エネルギー'}
SOURCE_CONDITION={
    'pokemon':['カードの種別：ポケモン','レギュレーション：スタンダード'],
    'goods':['カードの種別：トレーナーズ','種類：グッズ','レギュレーション：スタンダード'],
    'support':['カードの種別：トレーナーズ','種類：サポート','レギュレーション：スタンダード'],
    'tool':['カードの種別：トレーナーズ','種類：ポケモンのどうぐ','レギュレーション：スタンダード'],
    'stadium':['カードの種別：トレーナーズ','種類：スタジアム','レギュレーション：スタンダード'],
    'energy':['カードの種別：エネルギー','レギュレーション：スタンダード']}
def read(path):
    return json.loads(path.read_text(encoding='utf-8'))
def require(condition,reason):
    if not condition: raise RuntimeError(reason)
def keyed(rows):
    result={}
    for row in rows:
        ident=str(row['officialCardId'])
        require(ident.isdecimal() and ident not in result,'DUPLICATE_OR_INVALID_ID:'+ident)
        result[ident]=row
    return result
def write(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def main():
    source,prints,stages,images,review=map(read,(SOURCE,PRINTS,STAGES,IMAGES,REVIEW))
    require(source['pack']=='M7' and source['officialFound']==78 and source['new'] in (0,78) and len(source['records'])==78,'M7_OFFICIAL_FULL_SET_MISSING')
    require(prints['verifiedPrints']==78,'M7_OFFICIAL_NUMBER_PROOF_MISSING')
    require(stages['expectedPokemon']==73 and stages['verifiedPokemon']==73 and stages['blockedPokemon']==0,'M7_POKEMON_STAGE_INCOMPLETE')
    require(images['verifiedOfficialImages']==78 and images['contactSheetSha256']==EXPECTED_CONTACT_SHEET_SHA,'M7_OFFICIAL_IMAGE_HASH_OR_CONTACT_SHEET_DRIFT')
    require(review['status']=='VERIFIED_J_FROM_OFFICIAL_CARD_IMAGE_VISUAL_REVIEW' and review['reviewedPrints']==78 and
            review['contactSheetSha256']==EXPECTED_CONTACT_SHEET_SHA,'M7_J_MARK_VISUAL_REVIEW_MISSING')
    proofs=[keyed(src) for src in [source['records'],prints['records'],images['records'],review['reviewed']]]
    ids=set(proofs[0])
    require(len(ids)==78 and all(set(p)==ids for p in proofs),'M7_OFFICIAL_ID_JOIN_INCOMPLETE')
    stages_by_id=keyed(stages['verified'])
    require(len(stages_by_id)==73 and set(stages_by_id).issubset(ids),'M7_STAGE_ID_JOIN_MISMATCH')
    original=read(CATALOG)
    already_staged=(len(original['records'])==5073 and EXTENSION.exists())
    if not already_staged:
        require(sha256(CATALOG.read_bytes()).hexdigest()==EXPECTED_BASE_CATALOG_SHA,'CATALOG_BASELINE_CONTENT_SHA_DRIFT')
        require(len(original['records'])==4995,'CATALOG_BASELINE_CHANGED_REVIEW_REQUIRED')
    require(len(original.get('blocked',[]))==0,'EXISTING_CATALOG_BLOCKED_CHANGED')
    existing=keyed(original['records'][:4995])
    require(not(ids & set(existing)),'M7_OFFICIAL_PRINT_COLLIDES_WITH_LEGACY')
    require(sha256(REGISTRY.read_bytes()).hexdigest()==EXPECTED_BASE_REGISTRY_SHA,'OFFICIAL_IMAGE_REGISTRY_SHA_DRIFT')
    registry=read(REGISTRY)
    require(len(registry['cards'])==23525,'IMAGE_REGISTRY_IMMUTABILITY_BASELINE_CHANGED')
    by_image=keyed(registry['cards'])
    additions=[]; sidecar=[]
    for number in range(1,79):
        found=[p for p in source['records'] if proofs[1][str(p['officialCardId'])]['number']==f'{number:03d}/078']
        require(len(found)==1,'M7_PRINTED_NUMBER_MISSING_OR_DUPLICATE:'+str(number))
        row=found[0]
        ident=str(row['officialCardId'])
        printed,image,mark=proofs[1][ident],proofs[2][ident],proofs[3][ident]
        require(row['pack']=='M7' and row['category'] in VALID_CATEGORIES,'M7_OFFICIAL_CATEGORY_MISMATCH:'+ident)
        require(row['name'] and row['imageUrl']==image['imageUrl']==mark['imageUrl']==printed['imageUrl'],'M7_OFFICIAL_IMAGE_IDENTITY_MISMATCH:'+ident)
        require(printed['name']==row['name'],'M7_OFFICIAL_NAME_MISMATCH:'+ident)
        require(image['imageSha256']==mark['imageSha256'] and SHA.fullmatch(image['imageSha256']),'M7_OFFICIAL_MARK_IMAGE_SHA_MISMATCH:'+ident)
        require(printed['number']==image['printedNumber']==mark['printedNumber'],'M7_OFFICIAL_NUMBER_MISMATCH:'+ident)
        require(mark['mark']=='J','M7_OFFICIAL_MARK_NOT_J:'+ident)
        require(SHA.fullmatch(row['sourceSha256']),'M7_SOURCE_HTML_SHA_MISSING:'+ident)
        require(printed['officialPageSha256'] and SHA.fullmatch(printed['officialPageSha256']),'M7_PRINT_PAGE_SHA_MISSING:'+ident)
        require(printed['officialPageUrl']==f'https://www.pokemon-card.com/card-search/details.php/card/{ident}','M7_OFFICIAL_DETAIL_URL_MISMATCH:'+ident)
        require(urlparse(row['imageUrl']).hostname=='www.pokemon-card.com' and
                row['imageUrl'].startswith('https://www.pokemon-card.com/assets/images/card_images/large/M7/'),
                'M7_OFFICIAL_SOURCE_URL_NOT_APPROVED:'+ident)
        if row['category']=='pokemon':
            require(ident in stages_by_id,'M7_POKEMON_STAGE_ID_MISSING:'+ident)
            stage=stages_by_id[ident]
            require(stage['status'] in ('VERIFIED_OFFICIAL_STAGE','VERIFIED_OFFICIAL_STAGE_ONLY') and
                    stage['officialPageSha256']==printed['officialPageSha256'] and
                    type(stage['pokemonStage'])==int and stage['pokemonStage'] in (0,1,2),
                    'M7_OFFICIAL_STAGE_PROVENANCE_MISMATCH:'+ident)
            pokemon_stage=stage['pokemonStage']
        else:
            require(ident not in stages_by_id,'M7_TRAINER_MISCLASSIFIED_AS_POKEMON:'+ident)
            pokemon_stage=None
        proof={
            'officialCardId':ident,'category':row['category'],'basicEnergy':False,'aceSpec':False,
            'pokemonStage':pokemon_stage,'pack':'M7','number':printed['number'],
            'regulationMark':'J','legality':'printed-hij',
            'source':{'kind':'official-filtered-search','url':row['sourceUrl'],
                'sha256':row['sourceSha256'],'path':'reports/m7-official-delta.json',
                'searchCondition':SOURCE_CONDITION[row['category']], 'heading':HEADINGS[row['category']],
                'identityName':row['name'],'identityImageUrl':row['imageUrl']},
            'markEvidence':{'mark':'J','imageSha256':image['imageSha256'],
                'evidencePath':'reports/m7-regulation-mark-review.json'}
        }
        additions.append(proof)
        image_record={
            'officialCardId':ident,'name':row['name'],'set':'M7','cardNumber':printed['number'],
            'officialPageUrl':printed['officialPageUrl'],'imageSourceUrl':row['imageUrl'],
            'verified':True
        }
        # Preserve the original registry's record if the print already exists, and
        # never add a sidecar duplicate that would poison collision detection.
        if ident in by_image:
            old=by_image[ident]
            require(all(old.get(k)==image_record[k] for k in
                        ('officialCardId','name','set','cardNumber','officialPageUrl','imageSourceUrl')),
                    'M7_IMAGE_REGISTRY_EXISTING_IDENTITY_CONFLICT:'+ident)
        else:
            sidecar.append(image_record)
    require(len(additions)==78,'M7_INCOMPLETE_78_ADD')
    extension={'schemaVersion':1,'source':'official-M7-exact-visual-J-review',
        'catalogBaselineCount':4995,'sourcePack':'M7','cards':sidecar}
    if already_staged:
        require(original['records'][4995:]==additions,'STAGED_M7_OFFICIAL_PROOFS_DRIFT')
        require(read(EXTENSION)==extension,'STAGED_M7_IMAGE_SIDECAR_DRIFT')
    else:
        before=deepcopy(original['records'])
        original['records'].extend(additions)
        require(original['records'][:4995]==before and len(original['records'])==5073,
                'EXISTING_CATALOG_ROW_MUTATION_OR_NEW_TOTAL_MISMATCH')
        write(CATALOG,original)
        write(EXTENSION,extension)
    print(json.dumps({'result':'PASS_M7_EXACT_OFFICIAL_78',
        'preservedBaselineCatalog':4995,'totalClassified':len(original['records']),
        'newM7':len(additions),'imageRegistryPreserved':len(by_image),
        'imageSidecar':len(sidecar),'regulation':'J','stageVerified':len(stages_by_id),
        'officialImageHashesVerified':len(proofs[2])},ensure_ascii=False))
if __name__=='__main__': main()
