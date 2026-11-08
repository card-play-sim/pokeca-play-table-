#!/usr/bin/env python3
"""Bulk import verified official print metadata from the immutable formal ZIP.

Usage: python tools/import-formal-image-registry.py formal.zip output.json
No image bytes are downloaded, no rights flag is promoted, and the source ZIP
is never modified. Output is a *review* registry, not a public display allowlist.
"""
import json
import re
import sys
import zipfile
from pathlib import Path

PREFIX = "https://www.pokemon-card.com/assets/images/card_images/"
CATALOG = "pokeca_card_catalog_HIJ/card_catalog.json"

def build(archive):
    with zipfile.ZipFile(archive) as z:
        catalog = json.loads(z.read(CATALOG))
    images = {}
    for item in catalog.get("images", []):
        if item.get("status") != "reference_only":
            continue
        card_id = str(item.get("officialCardId", ""))
        url = item.get("sourceUrl")
        if not re.fullmatch(r"[0-9]+", card_id) or not isinstance(url, str) or not url.startswith(PREFIX):
            raise ValueError("Invalid official image reference: " + card_id)
        if card_id in images:
            raise ValueError("Duplicate image ID: " + card_id)
        images[card_id] = (url, item.get("imageId"), item.get("cardId"), item.get("rightsStatus"))
    cards = []
    seen = set()
    for card in catalog.get("cards", []):
        cid = str(card.get("officialCardId", ""))
        if cid not in images:
            continue
        if cid in seen:
            raise ValueError("Duplicate card ID: " + cid)
        url, image_id, linked_card_id, rights_status = images[cid]
        if image_id != card.get("imageId") or linked_card_id != card.get("cardId"):
            raise ValueError("Image/card identity mismatch: " + cid)
        if rights_status != "not_checked":
            raise ValueError("Unexpected image rights state: " + cid)
        seen.add(cid)
        if card.get("verificationStatus") != "verified":
            raise ValueError("Unverified card: " + cid)
        cards.append({
            "officialCardId": cid,
            "name": card["name"],
            "imageSourceUrl": url,
            "displayPermission": "unconfirmed",
            "renderAllowed": False,
        })
    if len(cards) != 1940 or len(images) != 1940 or len(seen) != len(images):
        raise ValueError("Formal catalog/image one-to-one mismatch: " + str((len(cards), len(images), len(seen))))
    return {
        "schemaVersion": 1,
        "status": "REVIEW_ONLY_NO_PUBLIC_RENDER",
        "source": "immutable formal 1945 ZIP, basic-Pokemon catalog",
        "cards": sorted(cards, key=lambda c: int(c["officialCardId"])),
    }

if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: import-formal-image-registry.py formal.zip output.json")
    result = build(sys.argv[1])
    dest = Path(sys.argv[2])
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("PASS: extracted", len(result["cards"]), "read-only records to", dest)
