#!/usr/bin/env python3
"""Compare newly downloaded M7 official images to the committed 78-print hashes.

Only verifies source bytes, identities and image properties. It deliberately
does not claim the J regulation symbol was visually reviewed.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "reports/m7-official-delta.json"
PRINTS = ROOT / "reports/m7-full-print-number-audit.json"
EXPECTED_STATUS = "OFFICIAL_IMAGE_HASH_VERIFIED_REGULATION_J_PENDING_VISUAL_REVIEW"
VISUAL_REVIEW = ROOT / "reports/m7-regulation-mark-visual-review.json"
HASH = re.compile(r"[0-9a-f]{64}\Z")
IMAGE = re.compile(r"https://www\.pokemon-card\.com/assets/images/card_images/large/M7/[A-Za-z0-9_]+\.jpg\Z")


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def keyed(rows):
    ids = [str(row["officialCardId"]) for row in rows]
    if len(ids) != 78 or len(set(ids)) != 78:
        raise AssertionError("M7_ID_SET_NOT_78_UNIQUE")
    return {str(row["officialCardId"]): row for row in rows}


def verify(previous_path, next_path):
    previous = read(previous_path)
    current = read(next_path)
    source = read(SOURCE)
    prints = read(PRINTS)
    if source.get("officialFound") != 78 or prints.get("verifiedPrints") != 78:
        raise AssertionError("M7_OFFICIAL_SOURCE_COVERAGE_NOT_78")
    if current.get("status") != EXPECTED_STATUS or previous.get("status") != EXPECTED_STATUS:
        raise AssertionError("M7_J_MARK_STILL_REQUIRES_VISUAL_REVIEW")
    if current.get("verifiedOfficialImages") != 78 or current.get("catalogUnchanged") is not True:
        raise AssertionError("M7_IMAGE_AUDIT_COVERAGE_OR_CATALOG_MUTATED")
    if not HASH.fullmatch(current.get("contactSheetSha256", "")):
        raise AssertionError("M7_CONTACT_SHEET_HASH_MISSING")
    original = keyed(previous["records"])
    rebuilt = keyed(current["records"])
    delta = keyed(source["records"])
    numbers = keyed(prints["records"])
    if set(original) != set(rebuilt) or set(rebuilt) != set(delta) or set(delta) != set(numbers):
        raise AssertionError("M7_OFFICIAL_PRINT_IDENTITY_SET_DRIFT")
    review = read(VISUAL_REVIEW)
    if (review.get("status") != "AI_VISUAL_REVIEW_J_GLYPH_VISIBLE_78_OF_78_HUMAN_FINAL_SIGNOFF_PENDING"
            or review.get("humanFinalApproval") is not False
            or review.get("observedJMarks") != 78):
        raise AssertionError("M7_VISUAL_MARK_EVIDENCE_INCOMPLETE")
    if review.get("sourceContactSheetSha256") != previous["contactSheetSha256"]:
        raise AssertionError("M7_VISUAL_REVIEW_SHEET_HASH_MISMATCH")
    observations = keyed(review["observations"])
    if set(observations) != set(rebuilt):
        raise AssertionError("M7_VISUAL_MARK_ID_SET_MISMATCH")
    for card_id, observation in observations.items():
        if (observation["observedMark"] != "J"
                or observation["imageSha256"] != rebuilt[card_id]["imageSha256"]
                or observation["printedNumber"] != rebuilt[card_id]["printedNumber"]):
            raise AssertionError("M7_VISUAL_MARK_BINDING_MISMATCH:" + card_id)
    for card_id, row in rebuilt.items():
        before, src, number = original[card_id], delta[card_id], numbers[card_id]
        url = row["imageUrl"]
        if not IMAGE.fullmatch(url) or url != src["imageUrl"] or url != number["imageUrl"]:
            raise AssertionError("M7_OFFICIAL_IMAGE_URL_MISMATCH:" + card_id)
        if row["printedNumber"] != number["number"] or row["printedNumber"] != before["printedNumber"]:
            raise AssertionError("M7_PRINTED_NUMBER_MISMATCH:" + card_id)
        if not HASH.fullmatch(row.get("imageSha256", "")) or row["imageSha256"] != before["imageSha256"]:
            raise AssertionError("M7_ORIGINAL_JPEG_BYTES_CHANGED:" + card_id)
        if row["format"] != "JPEG" or row["width"] < 300 or row["height"] < 400:
            raise AssertionError("M7_ORIGINAL_JPEG_FORMAT_INVALID:" + card_id)
        if (row["width"], row["height"]) != (before["width"], before["height"]):
            raise AssertionError("M7_ORIGINAL_JPEG_DIMENSIONS_CHANGED:" + card_id)
        if row["regulationReviewCropFraction"] != before["regulationReviewCropFraction"]:
            raise AssertionError("M7_MARK_REVIEW_CROP_CHANGED:" + card_id)
    print("PASS M7 official source JPEG SHA-256: 78/78 identities and printed numbers")
    print("J mark remains pending separate visual review; no catalog files were modified")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: verify_m7_image_audit.py baseline.json regenerated.json")
    verify(sys.argv[1], sys.argv[2])
