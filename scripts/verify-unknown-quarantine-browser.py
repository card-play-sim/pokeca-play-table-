#!/usr/bin/env python3
"""Trusted exact candidate Chromium slot coverage gate; not release approval."""
import json
import sys
from pathlib import Path
from importlib import import_module
read_json = import_module("verify-unknown-quarantine-receipt").read_json

def expected_slots(records, old_ids):
    slots = set()
    for row in records:
        key = str(row["officialCardId"])
        if key in old_ids:
            continue
        own = ([(key, "attack", i) for i in range(len(row["attacks"]))] +
               [(key, "ability", i) for i in range(len(row["abilities"]))]) if row["category"] == "pokemon" else [(key, row["category"], 0)]
        if not own or slots.intersection(own):
            raise ValueError("BROWSER_EXPECTED_SLOT_INVALID:" + key)
        slots.update(own)
    return slots

def verify(expected, report):
    actual = set()
    if not expected or report.get("browserShard") != 0 or report.get("totalFixtures") != len(expected) or report.get("javascriptErrors") != []:
        raise ValueError("BROWSER_SCOPE_INVALID")
    for case in report["cases"]:
        slot = (str(case["print"]), case["effectKind"], case["effectIndex"])
        if slot in actual or slot not in expected:
            raise ValueError("BROWSER_DUPLICATE_OR_UNEXPECTED_SLOT:" + repr(slot))
        if not all(case.get(k) is True for k in ("domExecuted", "aiParity", "offlineRestoreExact")):
            raise ValueError("BROWSER_SLOT_NOT_PROVEN:" + repr(slot))
        actual.add(slot)
    if actual != expected:
        raise ValueError("BROWSER_MISSING_SLOTS:" + repr(sorted(expected-actual)[:10]))
    return sorted({row[0] for row in actual})

def verify_full_match(expected, report):
    ids = verify(expected, {**report, "browserShard": 0, "totalFixtures": len(expected)})
    match = report.get("expandedAIMatch")
    if not isinstance(match, dict) or match.get("finished") is not True:
        raise ValueError("FULL_AI_MATCH_NOT_FINISHED")
    used = match.get("executedNewPrints")
    if not isinstance(used, list) or not used or len(set(map(str, used))) != len(used) or not set(map(str, used)).issubset(ids):
        raise ValueError("FULL_AI_NEW_PRINT_USE_NOT_PROVEN")
    return sorted(map(str, used))

def main(out, scratch, workspace):
    out, scratch, workspace = map(Path, (out, scratch, workspace))
    try:
        prior = read_json(workspace/"data/effect-extensions/compiled.json", workspace)["records"]
        current = read_json(scratch/"data/effect-extensions/compiled.json", scratch)["records"]
        engine = read_json(out/"quarantine-result.json", out)
        if engine["state"] != "QUARANTINE_ENGINE_CHECK_PASSED_REVIEW_REQUIRED":
            raise ValueError("BROWSER_ENGINE_GATE_NOT_PASSED")
        expected = expected_slots(current, {str(row["officialCardId"]) for row in prior})
        report = read_json(scratch/"artifacts/unknown-quarantine-browser.json", scratch)
        ids = verify(expected, report)
        if not set(engine["sandboxQualified"]).issubset(ids):
            raise ValueError("BROWSER_SELECTED_TARGET_NOT_PROVEN")
        full_report = read_json(scratch/"artifacts/unknown-quarantine-full-ai-browser.json", scratch)
        used = verify_full_match(expected, full_report)
        result = {"state":"QUARANTINE_BROWSER_PASSED_REVIEW_REQUIRED","sandboxBrowserQualified":ids,
                  "slots":len(expected),"publicBattleVerified":[],"fullDeckAIMatchVerified":True,
                  "sandboxFullMatchUsedPrints":used}
    except (ValueError, KeyError, TypeError, OSError) as exc:
        result = {"state":"BROWSER_RECEIPT_REJECTED","reason":str(exc)[:400],"publicBattleVerified":[]}
    (out/"browser-result.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n")
    print("QUARANTINE_BROWSER_FEEDBACK "+json.dumps(result,ensure_ascii=False))
    return 0 if result["state"]=="QUARANTINE_BROWSER_PASSED_REVIEW_REQUIRED" else 1

def self_test():
    expected={("2","attack",0),("2","ability",0)}
    def case(kind):
        return {"print":"2","effectKind":kind,"effectIndex":0,"domExecuted":True,"aiParity":True,"offlineRestoreExact":True}
    a={"browserShard":0,"totalFixtures":2,"javascriptErrors":[],"cases":[case("attack"),case("ability")]}
    assert verify(expected,a)==["2"]
    for bad in [{**a,"cases":[]},{**a,"cases":[case("attack"),case("attack")]},{**a,"cases":[case("attack"),{**case("ability"),"aiParity":False}]},{**a,"javascriptErrors":["error"]}]:
        try:
            verify(expected,bad)
        except ValueError:
            continue
        raise AssertionError("BROWSER_FALSE_PASS")
    full = {**a, "expandedAIMatch":{"finished":True,"executedNewPrints":["2"]}}
    assert verify_full_match(expected, full) == ["2"]
    for bad_match in [{"finished":False,"executedNewPrints":["2"]},
                      {"finished":True,"executedNewPrints":[]},
                      {"finished":True,"executedNewPrints":["999"]},
                      {"finished":True,"executedNewPrints":["2","2"]}]:
        try:
            verify_full_match(expected, {**full,"expandedAIMatch":bad_match})
        except ValueError:
            continue
        raise AssertionError("FULL_AI_FALSE_PASS")
    print("UNKNOWN_QUARANTINE_BROWSER_RECEIPT_SELF_TEST PASS")
if __name__=="__main__":
    if sys.argv[1:]==["--self-test"]:
        self_test()
    else:
        sys.exit(main(*sys.argv[1:]))
