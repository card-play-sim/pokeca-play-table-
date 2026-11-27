#!/usr/bin/env python3
"""Approved patch replay entry: validate bytes and paths, never execute source."""
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from importlib import import_module

handoff = import_module("verify-unknown-quarantine-handoff")
ALLOWED = set(handoff.ALLOWED)

def git(repo, *args):
    return subprocess.check_output(["git", "-C", str(repo), *args])

def select(manifest, attempt, approved):
    if manifest.get("state") != "REVIEW_REQUIRED_NOT_RELEASED" or manifest.get("publicBattleVerified") != []:
        raise ValueError("NOT_A_REVIEW_HANDOFF")
    if attempt not in ("attempt-1", "attempt-2") or not re.fullmatch(r"[a-f0-9]{64}", approved):
        raise ValueError("INVALID_APPROVAL")
    candidates = [x for x in manifest["candidates"] if x.get("attempt") == attempt]
    if len(candidates) != 1 or candidates[0].get("patchSha256") != approved:
        raise ValueError("APPROVED_PATCH_MISMATCH")
    return candidates[0]

def check_paths(raw):
    entries = raw.split(b"\0")
    if entries[-1] != b"":
        raise ValueError("INVALID_PATCH_NUMSTAT")
    names = []
    for entry in entries[:-1]:
        added, deleted, name = entry.split(b"\t", 2)
        if not added.isdigit() or not deleted.isdigit() or not name:
            raise ValueError("NON_TEXT_OR_RENAME_PATCH")
        names.append(name.decode("utf-8"))
    if not names or len(names) != len(set(names)) or not set(names) <= ALLOWED:
        raise ValueError("PATCH_PATH_NOT_ALLOWED")
    return sorted(names)

def main(root, origin, run_id, attempt, approved, repo, out):
    root, repo, out = Path(root).resolve(), Path(repo).resolve(), Path(out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    manifest_path = out / "review-handoff.json"
    handoff.main(root, origin, run_id, manifest_path)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    row = select(manifest, attempt, approved)
    patch = (root / attempt / "proposal.patch").resolve()
    if not patch.is_relative_to(root) or hashlib.sha256(patch.read_bytes()).hexdigest() != approved:
        raise ValueError("APPROVED_BYTES_MISMATCH")
    current = git(repo, "rev-parse", "HEAD").decode().strip()
    for name in ALLOWED:
        if git(repo, "show", origin + ":" + name) != git(repo, "show", current + ":" + name):
            raise ValueError("STALE_SOURCE_REVIEW_REQUIRED:" + name)
    if git(repo, "status", "--porcelain"):
        raise ValueError("REPLAY_TREE_NOT_CLEAN")
    changed = check_paths(git(repo, "apply", "--numstat", "-z", str(patch)))
    if git(repo, "apply", "--summary", str(patch)).strip():
        raise ValueError("PATCH_MODE_OR_FILE_OPERATION")
    git(repo, "apply", "--check", str(patch))
    (out / "approved.patch").write_bytes(patch.read_bytes())
    result = {"schemaVersion":1,"state":"APPROVED_PATCH_APPLIES_REPLAY_REQUIRED",
              "originRunId":run_id,"originCommit":origin,"latestMain":current,
              "approvedPatchSha256":approved,"attempt":attempt,"paths":changed,
              "requiredQualifiedIds":row["sandboxQualified"],"publicBattleVerified":[]}
    (out / "replay-entry.json").write_text(json.dumps(result,indent=2)+"\n",encoding="utf-8")
    print("APPROVED_PATCH_APPLIES_REPLAY_REQUIRED", len(changed))

def resolve_event(event, event_name, owner, dispatch):
    if event_name == "workflow_dispatch":
        values = dispatch
    elif event_name == "issue_comment":
        issue, comment = event["issue"], event["comment"]
        if (event.get("action") != "created" or issue["number"] != 122 or "pull_request" in issue or
                comment["author_association"] != "OWNER" or comment["user"]["login"] != owner or
                event.get("repository", {}).get("owner", {}).get("login") != owner):
            raise ValueError("UNAUTHORIZED_REVIEW_COMMENT")
        match = re.fullmatch(r"APPROVE_UNKNOWN_REPLAY ([1-9][0-9]{0,19}) (attempt-[12]) ([a-f0-9]{64})", comment["body"])
        if not match:
            raise ValueError("INVALID_REVIEW_COMMENT_FORMAT")
        values = match.groups()
    else:
        raise ValueError("UNSUPPORTED_APPROVAL_EVENT")
    run, attempt, digest = values
    if not re.fullmatch(r"[1-9][0-9]{0,19}", run) or attempt not in ("attempt-1", "attempt-2") or not re.fullmatch(r"[a-f0-9]{64}", digest):
        raise ValueError("INVALID_APPROVAL_INPUTS")
    return {"origin_run":run, "attempt":attempt, "approved_patch_sha256":digest}

def emit_approval(event_file, output_file):
    event = json.loads(Path(event_file).read_text(encoding="utf-8"))
    dispatch = tuple(os.environ.get(name,"") for name in ("DISPATCH_RUN","DISPATCH_ATTEMPT","DISPATCH_SHA"))
    values = resolve_event(event, os.environ["APPROVAL_EVENT"], os.environ["OWNER"], dispatch)
    with Path(output_file).open("a", encoding="utf-8") as stream:
        for key, value in values.items():
            stream.write(key+"="+value+"\n")

def self_test():
    digest = "a" * 64
    manifest = {"state":"REVIEW_REQUIRED_NOT_RELEASED","publicBattleVerified":[],
                "candidates":[{"attempt":"attempt-1","patchSha256":digest}]}
    assert select(manifest,"attempt-1",digest)["patchSha256"] == digest
    good = b"1\t2\tengine/reference-effect-plans.cjs\0"
    assert check_paths(good) == ["engine/reference-effect-plans.cjs"]
    for bad in (b"1\t2\t.github/workflows/x.yml\0", b"-\t-\tengine/reference-effect-plans.cjs\0",
                b"1\t2\t\0", good+good):
        try:
            check_paths(bad)
        except ValueError:
            continue
        raise AssertionError("INVALID_PATCH_ACCEPTED")
    try:
        select(manifest,"attempt-1","b"*64)
    except ValueError:
        pass
    else:
        raise AssertionError("WRONG_APPROVAL_ACCEPTED")
    event = {"action":"created","issue":{"number":122},"repository":{"owner":{"login":"owner"}},
             "comment":{"author_association":"OWNER","user":{"login":"owner"},
                        "body":"APPROVE_UNKNOWN_REPLAY 123 attempt-1 "+digest}}
    expected = {"origin_run":"123","attempt":"attempt-1","approved_patch_sha256":digest}
    assert resolve_event(event,"issue_comment","owner",()) == expected
    assert resolve_event({},"workflow_dispatch","owner",("123","attempt-1",digest)) == expected
    for wrong in [
        {**event,"action":"edited"},
        {**event,"issue":{"number":123}},
        {**event,"issue":{"number":122,"pull_request":{}}},
        {**event,"comment":{**event["comment"],"author_association":"CONTRIBUTOR"}},
        {**event,"comment":{**event["comment"],"user":{"login":"other"}}},
        {**event,"comment":{**event["comment"],"body":event["comment"]["body"]+"\nextra=bad"}},
    ]:
        try:
            resolve_event(wrong,"issue_comment","owner",())
        except ValueError:
            continue
        raise AssertionError("UNAUTHORIZED_OR_MALFORMED_APPROVAL_ACCEPTED")
    print("UNKNOWN_APPROVED_REPLAY_SELF_TEST PASS")

if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test()
    elif len(sys.argv)==4 and sys.argv[1]=="--resolve-event":
        emit_approval(*sys.argv[2:])
    else:
        main(*sys.argv[1:])
