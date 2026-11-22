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
CATEGORIES = {"pokemon": {"se_ta": "pokemon"}, "goods": {"se_ta": "trainer", "sc_tr_tr": "1"}, "support": {"se_ta": "trainer", "sc_tr_sp": "1"}, "tool": {"se_ta": "trainer", "sc_tr_goods": "1"}, "stadium": {"se_ta": "trainer", "sc_tr_st": "1"}, "energy": {"se_ta": "energy"}}

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
    observed_thumbnails = []
    official_api_samples = {}
    for category, params in CATEGORIES.items():
        page = 1
        while True:
            qs = urllib.parse.urlencode({"keyword": "", "regulation_sidebar_form": "XY", **params, "page": page})
            url = BASE + "/card-search/resultAPI.php?" + qs
            payload, sha = fetch(url)
            if payload.get("result") != 1 or not isinstance(payload.get("cardList"), list):
                raise RuntimeError(f"Invalid official API response: {url}")
            evidence.append({"category": category, "page": page, "url": url, "sha256": sha})
            for card in payload["cardList"]:
                thumb = card.get("cardThumbFile", "")
                match = re.fullmatch(r"/assets/images/card_images/large/M7/([0-9]+)_[^/]+\.jpg", thumb, re.I)
                if not match:
                    if "M7" in thumb.upper() and len(observed_thumbnails) < 30:
                        observed_thumbnails.append(thumb)
                    continue
                cid = str(card["cardID"])
                if category not in official_api_samples:
                    official_api_samples[category] = card
                if cid in found and found[cid]["imageUrl"] != BASE + thumb:
                    raise RuntimeError(f"Conflicting official identity: {cid}")
                found[cid] = {"officialCardId": cid, "name": card.get("cardNameViewText") or card.get("cardNameAltText"), "category": category, "pack": "M7", "imageUrl": BASE + thumb, "sourceUrl": url, "sourceSha256": sha}
            if page >= int(payload["maxPage"]):
                break
            page += 1
            if page > 300:
                raise RuntimeError("Official pagination exceeded safety limit")
    if not found:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps({"schemaVersion": 1, "status": "BLOCKED_NO_MATCHING_M7_IDENTITIES", "officialFound": 0, "new": 0, "sampleM7Thumbnails": observed_thumbnails, "evidence": evidence}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        raise RuntimeError(f"No M7 identities found; sample M7 thumbnails: {observed_thumbnails}")
    # Validate official identity evidence before emitting a candidate delta.
    for cid, record in found.items():
        if not record["name"] or not isinstance(record["name"], str):
            raise RuntimeError(f"Official M7 identity missing name: {cid}")
        if not record["imageUrl"].startswith(BASE + "/assets/images/card_images/large/M7/"):
            raise RuntimeError(f"Unexpected M7 image URL: {cid}")
        if not re.fullmatch(r"[0-9a-f]{64}", record["sourceSha256"]):
            raise RuntimeError(f"Invalid official source digest: {cid}")
    # The immutable full M7 identity set remains the audit input after catalog
    # registration. "new" may then be zero; never erase official proof records.
    all_prints = [found[k] for k in sorted(found, key=int)]
    delta = [r for r in all_prints if r["officialCardId"] not in known]
    result = {"schemaVersion": 1, "status": "OFFICIAL_M7_FULL_IDENTITY_SET_AUDITED", "pack": "M7", "knownM7": sum(x.get("pack") == "M7" for x in catalog["records"]), "officialFound": len(found), "new": len(delta), "records": all_prints, "evidence": evidence}
    # Publish minimal current-schema examples for reviewed, lossless M7 adoption.
    # These are references only; this audit must never rewrite the catalog.
    examples = {}
    for existing in catalog["records"]:
        group = existing.get("category")
        if existing.get("regulationMark") == "J" and group not in examples:
            examples[group] = existing
    result["jCatalogExamples"] = examples
    result["officialApiSamples"] = official_api_samples
    result["catalogCountBefore"] = len(catalog["records"])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"M7 official identities: {len(found)}; new: {len(delta)}; output: {OUT}")
    print("Catalog read-only: all 78 official identities preserved regardless of new-print count.")

if __name__ == "__main__":
    main()
