#!/usr/bin/env python3
"""Read-only handoff for exact quarantine evidence. Never execute generated code."""
import hashlib
import os
import tempfile
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

def verify_reviewed_bytes(selection, patch, base):
    """Reproduce a reviewed candidate from trusted checkout code; never execute its patch."""
    groups = selection.get("groups")
    if not isinstance(groups, list) or not 1 <= len(groups) <= 6:
        raise ValueError("INVALID_REVIEWED_GROUP_COUNT")
    selected = ids(selection["targetIds"])
    covered = set()
    seen = set()
    for group in groups:
        ident = group.get("sharedTaskId", "")
        if not re.fullmatch(r"OFFICIAL_SHARED_MECHANIC_[A-F0-9]{20}", ident) or ident in seen:
            raise ValueError("INVALID_REVIEWED_GROUP_ID")
        seen.add(ident)
        members = ids(group["officialCardIds"]) & selected
        if not members:
            raise ValueError("REVIEWED_GROUP_WITHOUT_SELECTED_PRINT")
        covered.update(members)
    if covered != selected:
        raise ValueError("REVIEWED_TARGET_SCOPE_MISMATCH")
    sources = {name: subprocess.check_output(["git", "show", base + ":" + name]).decode("utf-8") for name in ALLOWED}
    # Load only the verifier's trusted checked-out generator, not a module from
    # the artifact. Returned source is data, not evaluated JavaScript.
    code = """const fs=require('node:fs');const g=require('./scripts/local-unknown-effect-generator.cjs');
const v=JSON.parse(fs.readFileSync(0,'utf8'));const p=g.reviewedProposal(v.groups,v.sources);
if(!p||p.strategy!=='REVIEWED_COMPOSITION')process.exit(2);
const next=g.applyEdits(v.sources,p);g.validateCandidateSyntax(v.sources,next);
process.stdout.write(JSON.stringify(next));"""
    result = subprocess.run(["node", "-e", code], input=json.dumps({"groups":groups,"sources":sources}).encode(), capture_output=True, timeout=30, check=True)
    expected = json.loads(result.stdout)
    changed = [name for name in ALLOWED if expected.get(name) != sources[name]]
    if changed != [ALLOWED[0]]:
        raise ValueError("REVIEWED_UNEXPECTED_PATHS")
    # git apply to a temporary index only. No checkout, no execution, no
    # write to the real index. Refuse mode changes, renames and extra paths.
    raw = subprocess.check_output(["git","apply","--numstat","-z",str(patch)])
    entries = raw.split(b"\0")
    if len(entries) != 2 or entries[-1] != b"":
        raise ValueError("REVIEWED_PATCH_SCOPE")
    added, deleted, name = entries[0].split(b"\t",2)
    if not added.isdigit() or deleted != b"0" or name.decode() != ALLOWED[0]:
        raise ValueError("REVIEWED_NOT_INSERT_ONLY")
    if subprocess.check_output(["git","apply","--summary",str(patch)]).strip():
        raise ValueError("REVIEWED_PATCH_MODE")
    with tempfile.TemporaryDirectory(prefix="reviewed-proof-") as directory:
        env = dict(os.environ, GIT_INDEX_FILE=str(Path(directory)/"index"))
        subprocess.run(["git","read-tree",base],env=env,check=True,capture_output=True)
        subprocess.run(["git","apply","--cached",str(patch)],env=env,check=True,capture_output=True)
        for name in ALLOWED:
            actual = subprocess.check_output(["git","show",":"+name],env=env)
            if actual != expected[name].encode("utf-8"):
                raise ValueError("REVIEWED_REPRODUCTION_MISMATCH:"+name)
    return {"state":"EXACT_REPRODUCTION_MATCH_REVIEW_REQUIRED","groups":len(groups),"selectedPrints":len(selected),"changedPaths":changed}

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
            if selection.get('intendedStrategy') == 'REVIEWED_COMPOSITION':
                row['reviewedReproduction'] = verify_reviewed_bytes(selection, patch, base)
            accepted.append(row)
        except (ValueError, OSError, KeyError, TypeError, subprocess.SubprocessError) as exc:
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
