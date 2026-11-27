#!/usr/bin/env python3
"""Read-only handoff for exact quarantine evidence. Never execute generated code."""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path
from importlib import import_module

read_json = import_module("verify-unknown-quarantine-receipt").read_json
ALLOWED = ("engine/reference-effect-plans.cjs",
           "engine/pokeca_reference_effect_runtime.cjs",
           "scripts/lib/shared-effect-engine-worker.cjs")

def sha(data):
    return hashlib.sha256(data).hexdigest()

def ids(value):
    if not isinstance(value, list) or not value:
        raise ValueError("EMPTY_OR_INVALID_IDS")
    result = [str(x) for x in value]
    if any(not re.fullmatch(r"[1-9][0-9]{0,7}", x) for x in result) or len(set(result)) != len(result):
        raise ValueError("INVALID_OR_DUPLICATE_IDS")
    return set(result)

def validate(selection, engine, browser, hashes):
    if selection.get("sourceHashes") != hashes:
        raise ValueError("SOURCE_HASH_MISMATCH")
    fingerprint = sha(json.dumps([[k, hashes[k]] for k in ALLOWED], separators=(",", ":")).encode())
    if selection.get("fingerprint") != fingerprint:
        raise ValueError("SOURCE_FINGERPRINT_MISMATCH")
    selected = ids(selection["targetIds"])
    if engine.get("state") != "QUARANTINE_ENGINE_CHECK_PASSED_REVIEW_REQUIRED" or ids(engine["selected"]) != selected:
        raise ValueError("ENGINE_SCOPE_MISMATCH")
    if engine.get("changedPriorIds") != [] or engine.get("publicBattleVerified") != []:
        raise ValueError("ENGINE_PRIOR_OR_PUBLIC_STATE_INVALID")
    qualified = ids(engine["sandboxQualified"])
    if browser.get("state") != "QUARANTINE_BROWSER_PASSED_REVIEW_REQUIRED" or browser.get("fullDeckAIMatchVerified") is not True or browser.get("publicBattleVerified") != []:
        raise ValueError("BROWSER_OR_FULL_MATCH_UNPROVEN")
    proved = ids(browser["sandboxBrowserQualified"])
    used = ids(browser["sandboxFullMatchUsedPrints"])
    if not qualified <= selected or not qualified <= proved or not used <= proved:
        raise ValueError("QUALIFIED_OR_USED_SCOPE_MISMATCH")
    slots = browser.get("slots")
    if type(slots) is not int or slots < len(proved):
        raise ValueError("INVALID_SLOT_COUNT")
    return {"selected": sorted(selected), "sandboxQualified": sorted(qualified),
            "sandboxBrowserQualified": sorted(proved), "sandboxFullMatchUsedPrints": sorted(used),
            "slots": slots, "sourceFingerprint": fingerprint}

def main(root, base, run_id, destination):
    if not re.fullmatch(r"[a-f0-9]{40}", base) or not re.fullmatch(r"[1-9][0-9]*", run_id):
        raise ValueError("INVALID_ORIGIN")
    root = Path(root).resolve()
    hashes = {k: sha(subprocess.check_output(["git", "show", base + ":" + k])) for k in ALLOWED}
    accepted = []
    for name in ("attempt-1", "attempt-2"):
        folder = root / name
        if not folder.is_dir() or folder.is_symlink():
            continue
        try:
            selection = read_json(folder / "selected.json", root)
            engine = read_json(folder / "quarantine-result.json", root)
            browser = read_json(folder / "browser-result.json", root)
            row = validate(selection, engine, browser, hashes)
            patch = folder / "proposal.patch"
            if not patch.is_file() or patch.is_symlink() or not patch.resolve().is_relative_to(root) or not 0 < patch.stat().st_size <= 256 * 1024:
                raise ValueError("INVALID_PATCH_FILE")
            row.update(attempt=name, patchSha256=sha(patch.read_bytes()))
            accepted.append(row)
        except (ValueError, OSError, KeyError, TypeError) as exc:
            print("HANDOFF_REJECTED", name, str(exc)[:160])
    if not accepted:
        raise ValueError("NO_FULL_MATCH_REVIEW_CANDIDATE")
    result = {"schemaVersion":1, "state":"REVIEW_REQUIRED_NOT_RELEASED", "originRunId":run_id,
              "baseCommit":base, "candidates":accepted, "publicBattleVerified":[],
              "requires":["independent source review","latest-main replay","normal CI","Pages bytes","published Chromium"]}
    Path(destination).write_text(json.dumps(result, indent=2)+"\n", encoding="utf-8")
    print("REVIEW_HANDOFF_CREATED", len(accepted))

def self_test():
    hashes = {k:sha(k.encode()) for k in ALLOWED}
    fingerprint = sha(json.dumps([[k,hashes[k]] for k in ALLOWED],separators=(",",":")).encode())
    selection = {"sourceHashes":hashes,"fingerprint":fingerprint,"targetIds":["2","3"]}
    engine = {"state":"QUARANTINE_ENGINE_CHECK_PASSED_REVIEW_REQUIRED","selected":["2","3"],
              "sandboxQualified":["2"],"changedPriorIds":[],"publicBattleVerified":[]}
    browser = {"state":"QUARANTINE_BROWSER_PASSED_REVIEW_REQUIRED","fullDeckAIMatchVerified":True,
               "sandboxBrowserQualified":["2"],"sandboxFullMatchUsedPrints":["2"],"slots":1,"publicBattleVerified":[]}
    assert validate(selection,engine,browser,hashes)["sandboxQualified"] == ["2"]
    for a,b,c in [({**selection,"fingerprint":"wrong"},engine,browser),
                  (selection,{**engine,"sandboxQualified":["9"]},browser),
                  (selection,engine,{**browser,"fullDeckAIMatchVerified":False}),
                  (selection,engine,{**browser,"sandboxFullMatchUsedPrints":["9"]}),
                  (selection,engine,{**browser,"publicBattleVerified":["2"]})]:
        try:
            validate(a,b,c,hashes)
        except ValueError:
            continue
        raise AssertionError("FALSE_HANDOFF")
    print("UNKNOWN_REVIEW_HANDOFF_SELF_TEST PASS")

if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test()
    else:
        main(*sys.argv[1:])
