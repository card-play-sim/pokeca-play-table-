#!/usr/bin/env python3
"""Fetch official M7 print identities into a reviewed delta, never mutate catalog.

Usage: python scripts/import_m7_official_delta.py
Requires network access to www.pokemon-card.com (e.g. GitHub Actions).
"""
import hashlib
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "data/deck-building/catalog.json"
OUT = ROOT / "reports/m7-official-delta.json"
BASE = "https://www.pokemon-card.com"
CATEGORIES = {"pokemon": "pokemon", "goods": "goods", "support": "support", "tool": "tool", "stadium": "stadium", "energy": "energy"}

def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": "PokecaCatalogAudit/1.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        raw = response.read()
    return json.loads(raw), hashlib.sha256(raw).hexdigest()

def main():
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    known = {str(x["officialCardId"]) for x in catalog["records"]}
    found = {}
    evidence = []
    for category, param in CATEGORIES.items():
        page = 1
        while True:
            qs = urllib.parse.urlencode({"keyword": "", "regulation_sidebar_form": "XY", "se_ta": param, "page": page})
            url = BASE + "/card-search/resultAPI.php?" + qs
            payload, sha = fetch(url)
            if payload.get("result") != 1 or not isinstance(payload.get("cardList"), list):
                raise RuntimeError(f"Invalid official API response: {url}")
            evidence.append({"category": category, "page": page, "url": url, "sha256": sha})
            for card in payload["cardList"]:
                thumb = card.get("cardThumbFile", "")
                match = re.fullmatch(r"/assets/images/card_images/large/M7/([0-9]+)_[^/]+\\.jpg", thumb, re.I)
                if not match:
                    continue
                cid = str(card["cardID"])
                if cid in found and found[cid]["imageUrl"] != BASE + thumb:
                    raise RuntimeError(f"Conflicting official identity: {cid}")
                found[cid] = {"officialCardId": cid, "name": card.get("cardNameViewText") or card.get("cardNameAltText"), "category": category, "pack": "M7", "imageUrl": BASE + thumb, "sourceUrl": url, "sourceSha256": sha}
            if page >= int(payload["maxPage"]):
                break
            page += 1
            if page > 300:
                raise RuntimeError("Official pagination exceeded safety limit")
    if not found:
        raise RuntimeError("No M7 identities found: do not claim import success")
    delta = [found[k] for k in sorted(found, key=int) if k not in known]
    result = {"schemaVersion": 1, "status": "OFFICIAL_IDENTITY_DELTA_REQUIRES_PRINT_AND_MARK_VERIFICATION", "pack": "M7", "knownM7": sum(x.get("pack") == "M7" for x in catalog["records"]), "officialFound": len(found), "new": len(delta), "records": delta, "evidence": evidence}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"M7 official identities: {len(found)}; new: {len(delta)}; output: {OUT}")
    print("Catalog unchanged: official print numbers and J marks must be verified before merge.")

if __name__ == "__main__":
    main()
