#!/usr/bin/env python3
"""Extract fixed-deck basic Pokémon *candidates* from the immutable formal ZIP.

No official print is selected. No files in the archive are modified.
Usage: python tools/extract-fixed-deck-candidates.py formal.zip fixed-test-decks.json output.json
"""
import json
import re
import sys
import zipfile
from pathlib import Path

CATALOG = "pokeca_card_catalog_HIJ/card_catalog.json"
PREFIX = "https://www.pokemon-card.com/assets/images/card_images/"
def main(archive, decks_file, output):
    with zipfile.ZipFile(archive) as z:
        catalog = json.loads(z.read(CATALOG))
    images = {str(i.get("officialCardId")): i for i in catalog.get("images", [])
    if i.get("status") == "reference_only" and isinstance(i.get("sourceUrl"), str)
    and i["sourceUrl"].startswith(PREFIX)}
    decks = json.loads(Path(decks_file).read_text(encoding="utf-8"))["decks"]
    names = {c["name"] for d in decks for c in d["cards"] if c["category"] == "pokemon"}
    candidates = []
    for card in catalog["cards"]:
        if card.get("name") not in names:
            continue
        if card.get("verificationStatus") != "verified" or card.get("pokemonStage") != "たね":
            continue
        cid = str(card.get("officialCardId", ""))
        if not re.fullmatch(r"\d+", cid):
            continue
        if not isinstance(card.get("hp"), int) or not isinstance(card.get("attacks"), list):
            continue
        candidate = {key: card.get(key) for key in (
            "officialCardId", "name", "cardType", "pokemonStage", "hp", "types",
            "abilities", "attacks", "weakness", "resistance", "retreatCost",
            "cardNumber", "regulationMark", "officialPageUrl", "verificationStatus"
        )}
        image = images.get(cid)
        if image and image.get("cardId") == card.get("cardId") and image.get("cardNumber") == card.get("cardNumber"):
            candidate["imageSourceUrl"] = image["sourceUrl"]
            candidate["imageRightsStatus"] = image.get("rightsStatus", "not_checked")
        candidates.append(candidate)
    candidates.sort(key=lambda c: (c["name"], int(c["officialCardId"])))
    result = {
        "status": "CANDIDATES_ONLY_NOT_ENGINE_READY",
        "adoptedPrintIds": [],
        "sourceArchive": Path(archive).name,
        "sourceEntry": CATALOG,
        "requestedPokemonNames": sorted(names),
        "matchedPokemonNames": sorted({c["name"] for c in candidates}),
        "candidateCount": len(candidates),
        "cards": candidates,
    }
    Path(output).write_text(json.dumps(result, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    print(f"Verified basic Pokémon candidates: {len(candidates)}; adopted prints: 0")

if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    main(*sys.argv[1:])
