#!/usr/bin/env python3
"""Read-only official M7 JPEG image evidence and review sheet. Does NOT infer J mark."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
from hashlib import sha256
from pathlib import Path
import base64
import json
import os
import urllib.request
from PIL import Image, ImageDraw, ImageOps

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'reports/m7-official-delta.json'
NUMBERS=ROOT/'reports/m7-full-print-number-audit.json'
OUT=ROOT/'reports/m7-regulation-image-audit.json'
ARTIFACT=ROOT/'artifacts/m7-regulation-contact-sheet.png'
PREVIEW=ROOT/'artifacts/m7-regulation-first-full.jpg'

def download(record, number):
    url=record['imageUrl']
    req=urllib.request.Request(url,headers={'User-Agent':'PokecaCatalogAudit/1.0'})
    with urllib.request.urlopen(req,timeout=45) as response:
        raw=response.read()
    if not raw.startswith(b'\xff\xd8'):
        raise RuntimeError('OFFICIAL_CARD_IMAGE_NOT_JPEG:'+str(record['officialCardId']))
    with Image.open(BytesIO(raw)) as original:
        if original.format != 'JPEG':
            raise RuntimeError('OFFICIAL_CARD_IMAGE_FORMAT_MISMATCH:'+str(record['officialCardId']))
        im=original.convert('RGB')
    if im.width<300 or im.height<400:
        raise RuntimeError('OFFICIAL_IMAGE_TOO_SMALL:'+str(record['officialCardId']))
    n=number['number'].split('/')[0]
    return {'officialCardId':str(record['officialCardId']),'imageUrl':url,
            'printedNumber':number['number'],'imageSha256':sha256(raw).hexdigest(),
            'width':im.width,'height':im.height,'format':'JPEG'},im,n

def main():
    source=json.loads(SOURCE.read_text(encoding='utf-8'))
    print_audit=json.loads(NUMBERS.read_text(encoding='utf-8'))
    if source['officialFound']!=78 or print_audit['verifiedPrints']!=78:
        raise RuntimeError('M7_SOURCE_COVERAGE_INCOMPLETE')
    known={str(x['officialCardId']):x for x in print_audit['records']}
    collected=[]
    with ThreadPoolExecutor(max_workers=5) as pool:
        tasks=[pool.submit(download,record,known[str(record['officialCardId'])])
               for record in source['records']]
        for future in as_completed(tasks):
            collected.append(future.result())
    if len(collected)!=78 or len({x[0]['officialCardId'] for x in collected})!=78:
        raise RuntimeError('M7_OFFICIAL_IMAGE_78_UNIQUE_CHECK_FAILED')
    collected.sort(key=lambda x:int(x[2]))
    ARTIFACT.parent.mkdir(parents=True,exist_ok=True)
    cell_w,cell_h,cols=210,133,8
    rows=(len(collected)+cols-1)//cols
    sheet=Image.new('RGB',(cols*cell_w,rows*cell_h),(248,248,248))
    draw=ImageDraw.Draw(sheet)
    for index,(meta,im,num) in enumerate(collected):
        # Evidence crop only; never modifies the full official image or registered URL.
        crop_box=(int(im.width*.025),int(im.height*.84),int(im.width*.37),int(im.height*.989))
        piece=im.crop(crop_box)
        piece.thumbnail((cell_w-8,cell_h-30))
        x=(index%cols)*cell_w+4
        y=(index//cols)*cell_h+4
        sheet.paste(piece,(x,y+21))
        draw.text((x,y),num+' '+meta['officialCardId'],fill=(0,0,0))
        meta['regulationReviewCropFraction']=[.025,.84,.37,.989]
    sheet.save(ARTIFACT,optimize=True)
    sample=collected[0][1].copy()
    sample.thumbnail((650,950))
    sample.save(PREVIEW,format='JPEG',quality=73)
    summary={'schemaVersion':1,'status':'OFFICIAL_IMAGE_HASH_VERIFIED_REGULATION_J_PENDING_VISUAL_REVIEW',
             'verifiedOfficialImages':len(collected),'sourcePack':'M7',
             'contactSheetSha256':sha256(ARTIFACT.read_bytes()).hexdigest(),
             'catalogUnchanged':True,'verificationMode':'source-bytes-and-official-card-page-identity',
             'records':[x[0] for x in collected]}
    OUT.write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('M7_IMAGE_AUDIT '+json.dumps({'images':len(collected),'sheet':str(ARTIFACT),
                   'size':sheet.size,'preview':str(PREVIEW)},ensure_ascii=False),flush=True)
    if os.environ.get('POKECA_EMIT_M7_IMAGE_BASE64')=='1':
        print('M7_OFFICIAL_SAMPLE_BASE64 '+base64.b64encode(PREVIEW.read_bytes()).decode(),flush=True)
        print('M7_OFFICIAL_MARK_CONTACT_BASE64 '+base64.b64encode(ARTIFACT.read_bytes()).decode(),flush=True)
if __name__=='__main__': main()
