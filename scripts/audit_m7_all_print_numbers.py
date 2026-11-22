#!/usr/bin/env python3
"""Verify M7 printed numbers on all official individual card pages; never modify catalog."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from hashlib import sha256
from pathlib import Path
import html
import json
import re
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
INPUT=ROOT/"reports/m7-official-delta.json"
OUTPUT=ROOT/"reports/m7-full-print-number-audit.json"
DETAIL="https://www.pokemon-card.com/card-search/details.php/card/"
NUM=re.compile(r'<img[^>]+src="/assets/images/card/regulation_logo_1/M7\.gif"[^>]*>\s*([0-9]{3})\s*/\s*([0-9]{3})',re.I)

def verify(record):
    cid=str(record["officialCardId"])
    url=DETAIL+cid
    request=urllib.request.Request(url,headers={"User-Agent":"PokecaCatalogAudit/1.0"})
    with urllib.request.urlopen(request,timeout=30) as response:
        raw=response.read()
    body=html.unescape(raw.decode("utf-8",errors="replace"))
    match=NUM.search(body)
    if not match:
        raise RuntimeError("OFFICIAL_PRINT_NUMBER_NOT_FOUND:"+cid)
    if match[2]!="078":
        raise RuntimeError("OFFICIAL_M7_TOTAL_MISMATCH:"+cid)
    image=record["imageUrl"].replace("https://www.pokemon-card.com","")
    if image not in body:
        raise RuntimeError("OFFICIAL_IMAGE_NOT_ON_PRINT_PAGE:"+cid)
    return {"officialCardId":cid,"number":match[1]+"/"+match[2],"name":record["name"],
            "imageUrl":record["imageUrl"],"officialPageUrl":url,
            "officialPageSha256":sha256(raw).hexdigest()}

def main():
    report=json.loads(INPUT.read_text(encoding="utf-8"))
    candidates=report["records"]
    if len(candidates)!=78 or len({c["officialCardId"] for c in candidates})!=78:
        raise RuntimeError("M7_78_IDENTITY_COVERAGE_MISMATCH")
    rows=[]
    with ThreadPoolExecutor(max_workers=4) as pool:
        jobs={pool.submit(verify,row):row["officialCardId"] for row in candidates}
        for future in as_completed(jobs):
            rows.append(future.result())
    rows.sort(key=lambda r:int(r["number"].split("/")[0]))
    numbers={int(r["number"].split("/")[0]) for r in rows}
    if numbers!=set(range(1,79)):
        raise RuntimeError("M7_001_TO_078_INCOMPLETE")
    result={"schemaVersion":1,"status":"OFFICIAL_78_PRINT_NUMBERS_VERIFIED_J_MARK_PENDING",
            "verifiedPrints":len(rows),"catalogUnchanged":True,"records":rows}
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    OUTPUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("PASS 78/78 official M7 printed numbers and exact image identities; J mark pending, catalog unchanged")
if __name__=="__main__": main()
