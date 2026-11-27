#!/usr/bin/env python3
"""Export exact approved replay data; stage only explicit files, never run candidate code."""
import hashlib
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from importlib import import_module

handoff = import_module("verify-unknown-quarantine-handoff")
approval = import_module("verify-unknown-approved-replay")
read_json = handoff.read_json
ids = handoff.ids
FIXED = {"data/effect-extensions/intake.json","data/effect-extensions/compiled.json",
         "data/reference-effects/plans.json","ui/engine.bundle.js","sw.js",
         "reports/ij-effect-coverage.json","reports/ij-effect-executions.json"}
SOURCE = set(handoff.ALLOWED)
LIMIT = 64 * 1024 * 1024

def git(repo,*args):
    return subprocess.check_output(["git","-C",str(repo),*args])

def safe_bytes(root, name):
    root = Path(root).resolve()
    path = root/name
    if not path.is_file() or path.is_symlink() or not path.resolve().is_relative_to(root) or path.stat().st_size >= LIMIT:
        raise ValueError("UNSAFE_FILE:"+name)
    return path.read_bytes()

def digest(data):
    return hashlib.sha256(data).hexdigest()

def index(raw):
    rows = json.loads(raw)["records"]
    out = {str(row["officialCardId"]):row for row in rows}
    if len(out) != len(rows):
        raise ValueError("DUPLICATE_RECORD")
    return out

def unchanged_delta(before, after):
    if any(after.get(k) != v for k,v in before.items()):
        raise ValueError("PRIOR_RECORD_CHANGED")
    return set(after)-set(before)

def verified_intake_delta(before, after, compiled, checkpoint, added):
    # The staging engine may defer a formerly uncompiled intake row. Accept
    # that omission only if the exact row is already in the durable main
    # checkpoint, so retry data cannot disappear when the candidate is merged.
    if any(after[k] != v for k,v in before.items() if k in after):
        raise ValueError("PRIOR_INTAKE_ROW_CHANGED")
    removed = set(before)-set(after)
    for key in removed:
        if key in compiled or checkpoint.get(key) != before[key]:
            raise ValueError("UNSAFE_INTAKE_DEFERRAL:"+key)
    if not (set(after)-set(before)) <= added or not added <= set(after):
        raise ValueError("INTAKE_DELTA_NOT_PROVEN")
    return removed

def evidence_paths(added):
    return {"data/effect-extensions/evidence/"+key+".json" for key in ids(sorted(added))}

def manifest_scope(repo, entry, files):
    if entry.get("reviewOnly") or entry.get("state") != "LATEST_MAIN_REPLAY_VERIFIED_NOT_RELEASED" or entry.get("publicBattleVerified") != [] or entry.get("fullDeckAIMatchVerified") is not True:
        raise ValueError("UNVERIFIED_REPLAY")
    base = git(repo,"rev-parse","HEAD").decode().strip()
    if entry.get("latestMain") != base:
        raise ValueError("STALE_REPLAY_BASE")
    old = index(git(repo,"show",base+":data/effect-extensions/compiled.json"))
    new = index(files["data/effect-extensions/compiled.json"])
    added = unchanged_delta(old,new)
    if not ids(entry["requiredQualifiedIds"]) <= added or added != ids(entry["sandboxBrowserQualified"]):
        raise ValueError("REPLAY_DELTA_NOT_PROVEN")
    old_intake = index(git(repo,"show",base+":data/effect-extensions/intake.json"))
    new_intake = index(files["data/effect-extensions/intake.json"])
    checkpoint = index(git(repo,"show",base+":data/official-effect-intake/checkpoint.json"))
    removed = verified_intake_delta(old_intake,new_intake,old,checkpoint,added)
    for key in removed:
        row = old_intake[key]
        path = "data/effect-extensions/evidence/"+key+".json"
        proof = json.loads(git(repo,"show",base+":"+path))
        url = "https://www.pokemon-card.com/card-search/details.php/card/"+key
        hash_value = digest(proof["html"].encode())
        if row["source"]["path"] != path or row["source"]["sha256"] != hash_value or proof["htmlSha256"] != hash_value or proof["url"] != url or row["officialPageUrl"] != url:
            raise ValueError("DEFERRED_OFFICIAL_PROOF_MISMATCH:"+key)
    expected = FIXED | evidence_paths(added)
    if set(files) != expected:
        raise ValueError("UNEXPECTED_RELEASE_FILES")
    for key in added:
        path = "data/effect-extensions/evidence/"+key+".json"
        proof = json.loads(files[path])
        row = new_intake[key]
        url = "https://www.pokemon-card.com/card-search/details.php/card/"+key
        hash_value = digest(proof["html"].encode())
        if row["source"]["path"] != path or row["source"]["sha256"] != hash_value or proof["htmlSha256"] != hash_value or proof["url"] != url or row["officialPageUrl"] != url:
            raise ValueError("OFFICIAL_PROOF_MISMATCH:"+key)
        try:
            prior = git(repo,"show",base+":"+path)
        except subprocess.CalledProcessError:
            prior = None
        if prior is not None and prior != files[path]:
            raise ValueError("PRIOR_EVIDENCE_CHANGED:"+key)
    return added

def approved_patch(repo,out,entry):
    patch = safe_bytes(out,"approved.patch")
    if digest(patch) != entry["approvedPatchSha256"]:
        raise ValueError("APPROVED_PATCH_CHANGED")
    path = Path(out)/"approved.patch"
    changed = approval.check_paths(git(repo,"apply","--numstat","-z",str(path)))
    if set(changed) != set(entry["paths"]) or not set(changed) <= SOURCE or git(repo,"apply","--summary",str(path)).strip():
        raise ValueError("PATCH_SCOPE_CHANGED")
    git(repo,"apply","--check",str(path))
    return path

def export(repo,scratch,out):
    repo,scratch,out = map(lambda p:Path(p).resolve(),(repo,scratch,out))
    entry = read_json(out/"verified-replay.json",out)
    patch = approved_patch(repo,out,entry)
    added = ids(entry["sandboxBrowserQualified"])
    files = {p:safe_bytes(scratch,p) for p in FIXED|evidence_paths(added)}
    manifest_scope(repo,entry,files)
    # Reapply reviewed bytes in a fresh trusted checkout, not sandbox .git.
    with tempfile.TemporaryDirectory() as tmp:
        clean = Path(tmp)/"repo"
        git(repo,"clone","--local","--no-hardlinks",str(repo),str(clean))
        git(clean,"checkout","--detach",entry["latestMain"])
        git(clean,"apply",str(patch))
        for path in SOURCE:
            if safe_bytes(clean,path) != safe_bytes(scratch,path):
                raise ValueError("SANDBOX_SOURCE_DRIFT:"+path)
    bundle = out/"release-files"
    for name,data in files.items():
        target = bundle/name
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(data)
    (out/"candidate-files.json").write_text(json.dumps({"files":{k:digest(v) for k,v in sorted(files.items())}},indent=2)+"\n")

def stage(repo,out):
    repo,out = Path(repo).resolve(),Path(out).resolve()
    entry = read_json(out/"verified-replay.json",out)
    if git(repo,"status","--porcelain"):
        raise ValueError("CANDIDATE_TREE_NOT_CLEAN")
    patch = approved_patch(repo,out,entry)
    hashes = read_json(out/"candidate-files.json",out)["files"]
    expected = FIXED|evidence_paths(ids(entry["sandboxBrowserQualified"]))
    if set(hashes) != expected:
        raise ValueError("UNEXPECTED_CANDIDATE_PATH")
    files = {name:safe_bytes(out/"release-files",name) for name in expected}
    if any(digest(value)!=hashes[name] for name,value in files.items()):
        raise ValueError("CANDIDATE_BYTES_CHANGED")
    manifest_scope(repo,entry,files)
    git(repo,"apply",str(patch))
    for name,data in files.items():
        target=repo/name
        if target.is_symlink() or not target.resolve().is_relative_to(repo):
            raise ValueError("UNSAFE_DESTINATION")
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(data)
    git(repo,"add","--",*sorted(set(entry["paths"])|expected))

def self_test():
    assert unchanged_delta({"1":{"x":1}},{"1":{"x":1},"2":{}})=={"2"}
    for after in ({},{"1":{"x":2}}):
        try:
            unchanged_delta({"1":{"x":1}},after)
        except ValueError:
            continue
        raise AssertionError("PRIOR_CHANGE_ALLOWED")
    assert evidence_paths({"2"})=={"data/effect-extensions/evidence/2.json"}
    try:
        evidence_paths({"../x"})
    except ValueError:
        pass
    else:
        raise AssertionError("UNSAFE_EVIDENCE_ID")
    before = {"1":{"x":1},"2":{"x":2}}
    after = {"1":{"x":1},"3":{"x":3}}
    assert verified_intake_delta(before,after,{"1":{}},{"2":{"x":2}},{"3"}) == {"2"}
    for bad_after,bad_compiled,bad_checkpoint,bad_added in (
        (after,{"1":{},"2":{}},{"2":{"x":2}},{"3"}),
        (after,{"1":{}},{},{"3"}),
        (after,{"1":{}},{"2":{"x":9}},{"3"}),
        ({"1":{"x":9},"3":{}},{"1":{}},{"2":{"x":2}},{"3"}),
        (after,{"1":{}},{"2":{"x":2}},set()),
    ):
        try:
            verified_intake_delta(before,bad_after,bad_compiled,bad_checkpoint,bad_added)
        except ValueError:
            continue
        raise AssertionError("UNSAFE_DEFERRAL_ALLOWED")
    print("UNKNOWN_REPLAY_CANDIDATE_SELF_TEST PASS")

if __name__=="__main__":
    if sys.argv[1:]==["--self-test"]:
        self_test()
    elif sys.argv[1]=="export":
        export(*sys.argv[2:])
    elif sys.argv[1]=="stage":
        stage(*sys.argv[2:])
    else:
        raise ValueError("UNKNOWN_MODE")
