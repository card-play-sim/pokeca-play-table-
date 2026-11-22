#!/usr/bin/env python3
"""Audit exact official deck-print references and generate hash-bound catalog evidence.

Never treats out-of-scope prints as H/I/J; never stores official JPEGs in Git.
"""
from hashlib import sha256
from html import unescape
from io import BytesIO
from pathlib import Path
import json
import re
import urllib.request
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SEED = ROOT / "data/deck-building/official-import-print-evidence.json"
OUTPUT = ROOT / "data/deck-building/official-import-verified-extension.json"
OFFICIAL_PAGE = re.compile(r"^https://www\.pokemon-card\.com/card-search/details\.php/card/([1-9]\d*)$")
OFFICIAL_IMAGE = re.compile(r"^https://www\.pokemon-card\.com/assets/images/card_images/large/[A-Za-z0-9]+/[A-Za-z0-9_]+\.jpg$")
CATEGORIES = {"goods": "グッズ", "support": "サポート"}
STANDARD_RULES = "https://www.pokemon-card.com/rules/regulation/"


def download(url):
    request = urllib.request.Request(url, headers={"User-Agent": "PokecaDeckPrintAudit/1.0"})
    with urllib.request.urlopen(request, timeout=45) as response:
        if response.status != 200:
            raise RuntimeError("OFFICIAL_FETCH_FAILED")
        return response.read()


def official_legacy_exception(name):
    raw = download(STANDARD_RULES)
    official = unescape(raw.decode("utf-8"))
    plain = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", official))
    first = plain.find("過去のシリーズで使用できるカード")
    end = plain.find("同じ効果の過去のシリーズ", first)
    # Only the first explicit standard-format exception list qualifies.
    if first < 0 or end < first or name not in plain[first:end]:
        raise RuntimeError("STANDARD_LEGACY_EXCEPTION_NOT_VERIFIED:" + name)
    return {"rulePageUrl": STANDARD_RULES, "rulePageSha256": sha256(raw).hexdigest(),
            "ruleName": name, "method": "official-standard-older-print-list"}


def audit(row):
    card_id = str(row["officialCardId"])
    name = row["name"]
    category = row["category"]
    page_url = row["officialPageUrl"]
    image_url = row["imageSourceUrl"]
    mark = row["regulationMark"]
    if not OFFICIAL_PAGE.fullmatch(page_url) or OFFICIAL_PAGE.fullmatch(page_url).group(1) != card_id:
        raise RuntimeError("UNVERIFIED_PAGE_ID:" + card_id)
    if not OFFICIAL_IMAGE.fullmatch(image_url) or "/" + card_id.zfill(6) + "_" not in image_url:
        raise RuntimeError("UNVERIFIED_OFFICIAL_IMAGE_URL:" + card_id)
    if mark not in ("G", "H", "I", "J") or category not in CATEGORIES:
        raise RuntimeError("UNKNOWN_MARK_OR_CATEGORY:" + card_id)
    html_bytes = download(page_url)
    html = unescape(html_bytes.decode("utf-8"))
    plain = re.sub(r"<[^>]+>", " ", html)
    plain = re.sub(r"\s+", " ", plain)
    number = row["cardNumber"]
    number_left, number_right = number.split("/")
    if name not in plain or CATEGORIES[category] not in plain:
        raise RuntimeError("OFFICIAL_PAGE_NAME_OR_CATEGORY_MISMATCH:" + card_id)
    if not re.search(r"\b0*" + re.escape(str(int(number_left))) + r"\s*/\s*0*" + re.escape(str(int(number_right))) + r"\b", plain):
        raise RuntimeError("OFFICIAL_PAGE_PRINT_NUMBER_MISMATCH:" + card_id)
    if image_url not in html and image_url.split("www.pokemon-card.com", 1)[1] not in html:
        raise RuntimeError("OFFICIAL_PAGE_IMAGE_MISMATCH:" + card_id)
    raw = download(image_url)
    if not raw.startswith(b"\xff\xd8"):
        raise RuntimeError("OFFICIAL_IMAGE_NOT_JPEG:" + card_id)
    with Image.open(BytesIO(raw)) as image:
        if image.format != "JPEG" or image.width < 300 or image.height < 400:
            raise RuntimeError("OFFICIAL_IMAGE_DIMENSION_OR_FORMAT_MISMATCH:" + card_id)
        width, height = image.size
    # Mark was visually read from the full official image. Bind that review to
    # this exact JPEG digest; do not infer a mark from its package code.
    page_sha = sha256(html_bytes).hexdigest()
    image_sha = sha256(raw).hexdigest()
    exception = (mark == "G" and category == "support" and name == "ボスの指令")
    exception_proof = official_legacy_exception(name) if exception else None
    return {
        **row,
        "verified": True,
        "pack": row["set"],
        "number": number,
        "legality": ("printed-hij" if mark in ("H", "I", "J") else
                     "official-legacy-reprint-exception" if exception else "archival-out-of-scope"),
        **({"exceptionEvidence": exception_proof} if exception_proof else {}),
        "markEvidence": {
            "imageSha256": image_sha,
            "method": "full-official-JPEG-manual-mark-review",
            "reviewedMark": mark,
            "width": width,
            "height": height
        },
        "source": {
            "kind": "official-import-verified-print",
            "url": page_url,
            "sha256": page_sha,
            "identityName": name,
            "identityImageUrl": image_url
        }
    }


def main():
    source = json.loads(SEED.read_text(encoding="utf-8"))
    records = source["records"]
    if len(records) != len({str(x["officialCardId"]) for x in records}):
        raise RuntimeError("DUPLICATE_PRINT_ID")
    result = [audit(row) for row in records]
    OUTPUT.write_text(json.dumps({
        "schemaVersion": 1,
        "status": "VERIFIED_OFFICIAL_PRINT_AND_IMAGE_HASH",
        "sourceEvidence": SEED.relative_to(ROOT).as_posix(),
        "records": result
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("OFFICIAL_IMPORT_IMAGE_AUDIT", json.dumps({
        "verified": len(result),
        "cards": [{"id": x["officialCardId"], "mark": x["regulationMark"],
                   "imageSha256": x["markEvidence"]["imageSha256"]} for x in result]
    }, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
