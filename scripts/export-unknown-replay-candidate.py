#!/usr/bin/env python3
"""Export exact approved replay data; stage only explicit files, never run candidate code."""
import hashlib
import json
import os
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

AUTO_POLICY = "reviewed-composition-v1"

def require_replay_authorization(entry, policy):
    if entry.get("publicBattleVerified") != [] or entry.get("fullDeckAIMatchVerified") is not True:
        raise ValueError("UNVERIFIED_REPLAY")
    if not entry.get("reviewOnly") and entry.get("state") == "LATEST_MAIN_REPLAY_VERIFIED_NOT_RELEASED":
        return "EXPLICIT_APPROVAL"
    # Repository-owner opt-in permits only an independently reproduced,
    # exact-scope, compiler-only preview to become a DRAFT candidate.
    # It is not release approval and may not change the preview receipt.
    if policy != AUTO_POLICY or entry.get("reviewOnly") is not True or entry.get("state") != "LATEST_MAIN_PREVIEW_VERIFIED_NOT_RELEASED":
        raise ValueError("UNVERIFIED_REPLAY")
    scope = entry.get("independentOfficialScope", {})
    required = ids(entry["requiredQualifiedIds"])
    if (scope.get("state") != "OFFICIAL_SOURCE_BOUND_REVIEW_REQUIRED"
            or ids([p["id"] for p in scope["proofs"]]) != required
            or ids(entry["sandboxBrowserQualified"]) != required
            or entry.get("paths") != [handoff.ALLOWED[0]]):
        raise ValueError("POLICY_CANDIDATE_SCOPE_MISMATCH")
    return "OWNER_POLICY_DRAFT_ONLY"

def manifest_scope(repo, entry, files):
    require_replay_authorization(entry, os.environ.get("UNKNOWN_EFFECT_CANDIDATE_POLICY", ""))
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

RELEASE_CHECKS = {
    "Shared effect batch processing", "Complete offline regression",
    "G-BASE-008 UI effect contract", "Reference effect provenance gate",
    "Consolidated release print preservation gate",
    "DECK-WORK-002 classification and mobile deck checks",
    "Deck code import regression", "Card reflection runtime checks",
    "Refresh verified PWA release manifest", "Cross-category effect regression",
}

def release_checks(payload, head, repository):
    if not re.fullmatch(r"[a-f0-9]{40}", head):
        raise ValueError("INVALID_RELEASE_HEAD")
    latest = {}
    for run in payload["workflow_runs"]:
        if (run.get("head_sha") != head or run.get("event") != "pull_request"
                or (run.get("head_repository") or {}).get("full_name") != repository):
            continue
        if not isinstance(run.get("id"), int) or not isinstance(run.get("run_attempt"), int):
            raise ValueError("INVALID_RELEASE_RUN")
        name = run["name"]
        old = latest.get(name)
        if old is None or (run["id"], run["run_attempt"]) > (old["id"], old["run_attempt"]):
            latest[name] = run
    if not RELEASE_CHECKS <= set(latest):
        raise ValueError("REQUIRED_RELEASE_CHECK_MISSING")
    if any(run.get("status") != "completed" or run.get("conclusion") != "success" for run in latest.values()):
        raise ValueError("RELEASE_CHECK_NOT_SUCCESS")
    return True

def self_test():
    head, repo = "a"*40, "owner/repo"
    runs = [{"name":name,"id":i+1,"run_attempt":1,"head_sha":head,"event":"pull_request",
             "head_repository":{"full_name":repo},"status":"completed","conclusion":"success"}
            for i,name in enumerate(sorted(RELEASE_CHECKS))]
    assert release_checks({"workflow_runs":runs},head,repo)
    for bad in [runs[:-1], runs[:-1]+[{**runs[-1],"conclusion":"failure"}],
                runs[:-1]+[{**runs[-1],"head_sha":"b"*40}],
                runs[:-1]+[{**runs[-1],"head_repository":{"full_name":"other/repo"}}],
                runs+[{**runs[0],"id":1000,"status":"queued","conclusion":None}]]:
        try:
            release_checks({"workflow_runs":bad},head,repo)
        except ValueError:
            continue
        raise AssertionError("UNVERIFIED_RELEASE_ALLOWED")
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
    preview = {"reviewOnly":True,"state":"LATEST_MAIN_PREVIEW_VERIFIED_NOT_RELEASED",
               "publicBattleVerified":[],"fullDeckAIMatchVerified":True,
               "requiredQualifiedIds":["2"],"sandboxBrowserQualified":["2"],
               "paths":[handoff.ALLOWED[0]],
               "independentOfficialScope":{"state":"OFFICIAL_SOURCE_BOUND_REVIEW_REQUIRED","proofs":[{"id":"2"}]}}
    assert require_replay_authorization(preview,AUTO_POLICY) == "OWNER_POLICY_DRAFT_ONLY"
    assert require_replay_authorization({**preview,"reviewOnly":False,"state":"LATEST_MAIN_REPLAY_VERIFIED_NOT_RELEASED"},"") == "EXPLICIT_APPROVAL"
    for row, policy in [(preview,""),(preview,"true"),
                        ({**preview,"fullDeckAIMatchVerified":False},AUTO_POLICY),
                        ({**preview,"sandboxBrowserQualified":["2","3"]},AUTO_POLICY),
                        ({**preview,"paths":[handoff.ALLOWED[1]]},AUTO_POLICY),
                        ({**preview,"independentOfficialScope":{"state":"OFFICIAL_SOURCE_BOUND_REVIEW_REQUIRED","proofs":[{"id":"3"}]}},AUTO_POLICY)]:
        try:
            require_replay_authorization(row,policy)
        except ValueError:
            continue
        raise AssertionError("UNAUTHORIZED_POLICY_CANDIDATE")
    print("UNKNOWN_REPLAY_CANDIDATE_SELF_TEST PASS")

if __name__=="__main__":
    if sys.argv[1:]==["--self-test"]:
        self_test()
    elif sys.argv[1]=="export":
        export(*sys.argv[2:])
    elif sys.argv[1]=="stage":
        stage(*sys.argv[2:])
    elif sys.argv[1]=="release-checks":
        release_checks(json.loads(Path(sys.argv[2]).read_text()),sys.argv[3],sys.argv[4])
        print("EXACT_HEAD_RELEASE_CHECKS_PASS")
    else:
        raise ValueError("UNKNOWN_MODE")
