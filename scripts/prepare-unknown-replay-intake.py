#!/usr/bin/env python3
"""Prepare approved replay rows from official evidence, and validate replay results."""
import hashlib
import json
import sys
from pathlib import Path
from importlib import import_module

handoff = import_module("verify-unknown-quarantine-handoff")
read_json = handoff.read_json
ids = handoff.ids

def verified_rows(required, records, proof):
    rows = {}
    for row in records:
        key = str(row["officialCardId"])
        if key not in required:
            continue
        if key in rows:
            raise ValueError("DUPLICATE_OFFICIAL_ROW")
        path = "data/effect-extensions/evidence/" + key + ".json"
        url = "https://www.pokemon-card.com/card-search/details.php/card/" + key
        source = proof(path)
        digest = hashlib.sha256(source["html"].encode()).hexdigest()
        if row["source"]["path"] != path or row["source"]["sha256"] != digest or source["htmlSha256"] != digest or source["url"] != url or row["officialPageUrl"] != url:
            raise ValueError("OFFICIAL_EVIDENCE_MISMATCH:" + key)
        rows[key] = row
    if set(rows) != required:
        raise ValueError("APPROVED_PRINT_MISSING")
    return rows

def prepare(scratch, out):
    scratch, out = Path(scratch).resolve(), Path(out).resolve()
    entry = read_json(out/"replay-entry.json", out)
    required = ids(entry["requiredQualifiedIds"])
    compiled = read_json(scratch/"data/effect-extensions/compiled.json", scratch)
    if required & {str(r["officialCardId"]) for r in compiled["records"]}:
        raise ValueError("APPROVED_PRINT_ALREADY_PUBLISHED_REVIEW_REQUIRED")
    checkpoint = read_json(scratch/"data/official-effect-intake/checkpoint.json", scratch)
    rows = verified_rows(required, checkpoint["records"], lambda p:read_json(scratch/p,scratch))
    target = scratch/"data/effect-extensions/intake.json"
    intake = read_json(target, scratch)
    existing = {str(r["officialCardId"]):r for r in intake["records"]}
    for key, row in rows.items():
        if key in existing and existing[key] != row:
            raise ValueError("INTAKE_ROW_CONFLICT:" + key)
        if key not in existing:
            intake["records"].append(row)
    target.write_text(json.dumps(intake,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    (out/"selected.json").write_text(json.dumps({"targetIds":sorted(required)})+"\n",encoding="utf-8")

def verify_result(out):
    out = Path(out).resolve()
    entry = read_json(out/"replay-entry.json",out)
    engine = read_json(out/"quarantine-result.json",out)
    browser = read_json(out/"browser-result.json",out)
    required = ids(entry["requiredQualifiedIds"])
    if engine["state"] != "QUARANTINE_ENGINE_CHECK_PASSED_REVIEW_REQUIRED" or engine["changedPriorIds"] != [] or engine["publicBattleVerified"] != [] or ids(engine["selected"]) != required or ids(engine["sandboxQualified"]) != required:
        raise ValueError("APPROVED_ENGINE_REPLAY_INCOMPLETE")
    if browser["state"] != "QUARANTINE_BROWSER_PASSED_REVIEW_REQUIRED" or browser["fullDeckAIMatchVerified"] is not True or browser["publicBattleVerified"] != [] or not required <= ids(browser["sandboxBrowserQualified"]) or not ids(browser["sandboxFullMatchUsedPrints"]) <= ids(browser["sandboxBrowserQualified"]):
        raise ValueError("APPROVED_BROWSER_REPLAY_INCOMPLETE")
    result = {**entry,"state":"LATEST_MAIN_REPLAY_VERIFIED_NOT_RELEASED","requiredQualifiedIds":sorted(required),
              "sandboxBrowserQualified":browser["sandboxBrowserQualified"],"fullDeckAIMatchVerified":True,
              "publicBattleVerified":[]}
    (out/"verified-replay.json").write_text(json.dumps(result,indent=2)+"\n",encoding="utf-8")

def self_test():
    digest = hashlib.sha256(b"official").hexdigest()
    path = "data/effect-extensions/evidence/2.json"
    url = "https://www.pokemon-card.com/card-search/details.php/card/2"
    row = {"officialCardId":"2","source":{"path":path,"sha256":digest},"officialPageUrl":url}
    proof = {"html":"official","htmlSha256":digest,"url":url}
    assert verified_rows({"2"},[row],lambda p:proof) == {"2":row}
    for records in ([],[row,row],[{**row,"officialPageUrl":"wrong"}]):
        try:
            verified_rows({"2"},records,lambda p:proof)
        except ValueError:
            continue
        raise AssertionError("INVALID_OFFICIAL_ROW_ACCEPTED")
    print("UNKNOWN_REPLAY_INTAKE_SELF_TEST PASS")

if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test()
    elif sys.argv[1] == "--verify-result":
        verify_result(sys.argv[2])
    else:
        prepare(*sys.argv[1:])
