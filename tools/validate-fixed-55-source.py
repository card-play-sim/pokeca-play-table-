#!/usr/bin/env python3
"""Validate an exported 55-card official basic-Pokemon candidate dataset.

This is a source-evidence check, NOT a print-adoption or engine-readiness check.
Usage: python tools/validate-fixed-55-source.py candidate.json formal.zip
"""
import hashlib
import json
import sys
import zipfile
from collections import Counter

FIELDS = ("officialCardId", "name", "cardNumber", "regulationMark",
          "pokemonStage", "hp", "types", "abilities", "attacks",
          "weakness", "resistance", "retreatCost", "officialPageUrl")
CATALOG = "pokeca_card_catalog_HIJ/card_catalog.json"

def main(candidate_path, archive_path):
    raw = open(archive_path, "rb").read()
    data = json.load(open(candidate_path, encoding="utf-8"))
    if hashlib.sha256(raw).hexdigest() != data["sourceArchiveSha256"]:
        raise ValueError("Source archive SHA-256 mismatch")
    with zipfile.ZipFile(archive_path) as archive:
        catalog = json.loads(archive.read(CATALOG))
    source = {str(c["officialCardId"]): c for c in catalog["cards"]}
    if len(source) != len(catalog["cards"]):
        raise ValueError("Duplicate source official IDs")
    if data.get("status") != "VERIFIED_SOURCE_CANDIDATES_NOT_ADOPTED":
        raise ValueError("Unexpected candidate status")
    cards = data["cards"]
    if len(cards) != 55 or data["candidateCount"] != 55:
        raise ValueError("Unexpected candidate count")
    ids = [str(c["officialCardId"]) for c in cards]
    if len(set(ids)) != len(ids):
        raise ValueError("Duplicate candidate IDs")
    for card in cards:
        original = source.get(str(card["officialCardId"]))
        if original is None or original.get("verificationStatus") != "verified":
            raise ValueError("Unverified source: " + str(card["officialCardId"]))
        for field in FIELDS:
            if card.get(field) != original.get(field):
                raise ValueError("Source mismatch: " + str(card["officialCardId"]) + " " + field)
        if card["pokemonStage"] != "たね" or card["regulationMark"] not in "HIJ":
            raise ValueError("Invalid source scope")
        if not card["imageSourceUrl"].startswith("https://www.pokemon-card.com/assets/images/card_images/"):
            raise ValueError("Image URL not from official source")
    counts = Counter(c["name"] for c in cards)
    if len(counts) != 11 or data["adoptedPrintIds"] or data["engineReadable"]:
        raise ValueError("Candidate-only safety invariant failed")
    print("PASS: 55/55 official source records verified; 11 names; 0 prints adopted; 0 engine-ready")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(*sys.argv[1:])
