#!/usr/bin/env python3
"""Read only: find directly displayed M7 print-number/regulation evidence in official card HTML."""
import hashlib
import html
import json
import re
import urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
INDEX=ROOT/"reports/m7-official-delta.json"
OUTPUT=ROOT/"reports/m7-print-metadata-check.json"
BASE="https://www.pokemon-card.com/card-search/details.php/card/"
def sample(page_id):
    url=BASE+page_id
    request=urllib.request.Request(url,headers={"User-Agent":"PokecaCatalogAudit/1.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        body=response.read()
    decoded=html.unescape(body.decode("utf-8",errors="replace"))
    patterns={"printedNumber":r"(?<![0-9])[0-9]{3}/078(?![0-9])",
              "regulationText":r"レギュレーション.{0,120}",
              "markField":r"(?:regulation|regMark|reguMark)[^\n]{0,100}"}
    excerpts={}
    for name,pattern in patterns.items():
        items=[]
        for match in re.finditer(pattern,decoded,re.I):
            if len(items)>=8:break
            items.append(decoded[max(0,match.start()-40):min(len(decoded),match.end()+40)].replace("\r"," ").replace("\n"," "))
        excerpts[name]=items
    mark_at=decoded.find('class="img-regulation"')
    printed_region=decoded[max(0,mark_at-160):mark_at+700] if mark_at>=0 else ""
    return {"officialCardId":page_id,"url":url,"htmlSha256":hashlib.sha256(body).hexdigest(),
            "excerpts":excerpts,"printedRegion":printed_region.replace("\\r"," ").replace("\\n"," ")}
def main():
    index=json.loads(INDEX.read_text(encoding="utf-8"))
    ids=[str(r["officialCardId"]) for r in index["records"]]
    if index["officialFound"]!=78 or len(ids)!=len(set(ids)):
        raise SystemExit("M7_IDENTITY_AUDIT_NOT_COMPLETE")
    check=[ids[0],ids[len(ids)//2],ids[-1]]
    rows=[sample(card_id) for card_id in check]
    # An image URL alone cannot prove its printed number or regulation mark.
    OUTPUT.write_text(json.dumps({"schemaVersion":1,"status":"DIAGNOSTIC_ONLY_NOT_MARK_VERIFICATION",
        "idsChecked":check,"officialPageSamples":rows},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("M7 print metadata evidence diagnostic saved, catalog untouched")
if __name__=="__main__":main()
