#!/usr/bin/env python3
"""Unify the four exact public Chromium receipts without treating a delta as all cards."""
import json
import re
import subprocess
import sys
from pathlib import Path

URL = "https://card-play-sim.github.io/pokeca-play-table-/"
COMPILED = "data/effect-extensions/compiled.json"

def require(ok, reason):
    if not ok:
        raise ValueError(reason)

def slot(row):
    print_id = str(row["print"])
    kind = row["effectKind"]
    index = row["effectIndex"]
    require(re.fullmatch(r"[1-9][0-9]{0,7}", print_id) and isinstance(kind, str)
            and kind and type(index) is int and index >= 0, "INVALID_SLOT")
    return (print_id, kind, index)

def expected_slots(old, new):
    def by_id(data):
        rows = data["records"]
        index = {str(r["officialCardId"]): r for r in rows}
        require(len(rows) == len(index), "DUPLICATE_COMPILED_ID")
        return index
    before, after = by_id(old), by_id(new)
    require(set(before) <= set(after), "PREVIOUS_PRINT_REMOVED")
    changed = {k for k, r in after.items() if before.get(k) != r}
    slots = set()
    for k in changed:
        row = after[k]
        if row["category"] == "pokemon":
            keys = {(k, kind, i) for kind, field in (("attack", "attacks"), ("ability", "abilities"))
                    for i, _ in enumerate(row[field])}
        else:
            keys = {(k, row["category"], 0)}
        require(keys, "CHANGED_PRINT_NO_EFFECT_SLOTS:" + k)
        slots.update(keys)
    return slots

def verify(receipts, expected, head, base):
    require(len(receipts) == 4, "MISSING_PUBLIC_SHARD")
    seen = set()
    release = None
    for row in receipts:
        require(row.get("success") is True and row.get("commit") == head
                and row.get("baseCommit") == base and row.get("publicUrl") == URL,
                "UNVERIFIED_OR_WRONG_RELEASE")
        key = row.get("release")
        require(isinstance(key, str) and bool(key), "MISSING_RELEASE_ID")
        if release is None:
            release = key
        require(release == key, "MIXED_PUBLIC_RELEASES")
        want = [slot(x) for x in row["expectedSlots"]]
        got = [slot(x) for x in row["results"]]
        require(len(want) == len(set(want)) and len(got) == len(set(got))
                and set(want) == set(got) and not seen.intersection(got),
                "DUPLICATE_OR_MISSING_PUBLIC_SLOT")
        require(all(x.get("domExecuted") is True and x.get("aiParity") is True
                    and x.get("offlineRestoreExact") is True for x in row["results"]),
                "PUBLIC_GAMEPLAY_PROOF_MISSING")
        seen.update(got)
    require(seen == expected, "PUBLIC_DELTA_SLOT_MISMATCH")
    return {"state":"PUBLIC_DELTA_VERIFIED", "commit":head, "baseCommit":base,
            "release":release, "publicUrl":URL, "verifiedPrintIds":sorted({x[0] for x in seen}),
            "verifiedSlots":len(seen), "physicalAndroidVerified":False,
            "allCardsComplete":False, "automaticStopAuthorized":False}

def self_test():
    h, b = "a"*40, "b"*40
    print_row = {"print":"2", "effectKind":"attack", "effectIndex":0}
    good = {"success":True, "commit":h, "baseCommit":b, "publicUrl":URL,
            "release":"r", "expectedSlots":[print_row],
            "results":[{**print_row,"domExecuted":True,"aiParity":True,"offlineRestoreExact":True}]}
    empty = {**good,"expectedSlots":[],"results":[]}
    expected = {("2","attack",0)}
    assert verify([good,empty,empty,empty],expected,h,b)["verifiedPrintIds"] == ["2"]
    assert not verify([empty]*4,set(),h,b)["automaticStopAuthorized"]
    for bad in ([good]*4, [empty]*4, [good,empty,empty],
                [{**good,"commit":b},empty,empty,empty],
                [{**good,"release":"other"},empty,empty,empty],
                [{**good,"results":[{**good["results"][0],"aiParity":False}]},empty,empty,empty]):
        try:
            verify(bad,expected,h,b)
        except ValueError:
            continue
        raise AssertionError("FALSE_PUBLIC_UNION_ACCEPTED")
    old = {"records":[]}
    new = {"records":[{"officialCardId":"2","category":"pokemon","attacks":[{}],"abilities":[]}]}
    assert expected_slots(old,new)==expected
    print("PUBLIC_INTAKE_UNION_SELF_TEST PASS")

def main(root, base, head, output):
    require(all(re.fullmatch(r"[a-f0-9]{40}", x) for x in (base,head)), "INVALID_COMMIT")
    subprocess.run(["git","merge-base","--is-ancestor",base,head],check=True)
    read = lambda rev: json.loads(subprocess.check_output(["git","show",rev+":"+COMPILED]))
    root = Path(root)
    names = ["published-mobile-browser-evidence"] + ["published-mobile-browser-evidence-"+str(i) for i in range(1,4)]
    receipts = [json.loads((root / name / "artifacts/published-intake-battles.json").read_text()) for name in names]
    result = verify(receipts,expected_slots(read(base),read(head)),head,base)
    Path(output).write_text(json.dumps(result,indent=2)+"\n")
    print(json.dumps(result))

if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test()
    else:
        main(*sys.argv[1:])
