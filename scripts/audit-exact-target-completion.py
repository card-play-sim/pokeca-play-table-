#!/usr/bin/env python3
"""Audit the original 2775 target against verified public receipt deltas.
A receipt is not trusted merely because it has a success field. Only the
trusted public-workflow collector may pass receipts to this audit.
No operation in this script disables a workflow or a scheduled task.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

SCOPE = "reports/official-effect-continuation/fixed-2775-scope.json"
ORIGIN = "ffb92e6a492944ed1ad0c583d9953a97605a5280"
ORIGIN_PATH = "reports/official-effect-continuation/work-bulk-20261124.json"
ORIGIN_BLOB = "0127d4fa99dd833c55aa955af7bdda50611f7b20"
COMPILED = "data/effect-extensions/compiled.json"
URL = "https://card-play-sim.github.io/pokeca-play-table-/"

def require(value, message):
    if not value:
        raise ValueError(message)

def git(*args):
    return subprocess.check_output(["git", *args])

def checked_ids(values):
    require(isinstance(values, list), "INVALID_PRINT_LIST")
    ids = [str(x) for x in values]
    require(all(re.fullmatch(r"[1-9][0-9]{0,7}", x) for x in ids)
            and len(ids) == len(set(ids)), "INVALID_OR_DUPLICATE_PRINT")
    return set(ids)

def scope_from_original(original):
    ids = original["engineQualified"] + [i for row in original["reasons"] for i in row["officialCardIds"]]
    require(original["selectedExactPrints"] == original["selectedUniquePrints"] == len(ids) == 2775,
            "ORIGINAL_SCOPE_COUNT_MISMATCH")
    return checked_ids(ids)

def validate_scope(saved, original):
    require(saved["sourceCommit"] == ORIGIN and saved["sourcePath"] == ORIGIN_PATH
            and saved["sourceBlob"] == ORIGIN_BLOB, "SCOPE_PROVENANCE_MISMATCH")
    target = checked_ids(saved["officialCardIds"])
    require(target == scope_from_original(original), "FIXED_TARGET_CHANGED")
    return target

def index(data):
    rows = data["records"]
    ids = checked_ids([x["officialCardId"] for x in rows])
    return {str(row["officialCardId"]): row for row in rows if str(row["officialCardId"]) in ids}

def audit(target, current, proven):
    # proven contains full compiled rows from independent, trusted successful
    # public-workflow artifacts. Changed records require fresh public evidence.
    verified = {k for k in target if k in current and any(r == current[k] for r in proven.get(k, []))}
    missing = target - verified
    return {"state": "TARGET_PUBLIC_EVIDENCE_COMPLETE" if not missing else "TARGET_PUBLIC_EVIDENCE_INCOMPLETE",
            "targetCount":len(target), "verifiedByThisAudit":len(verified),
            "remainingByThisAudit":len(missing), "missingIds":sorted(missing),
            "missingCompiledIds":sorted(target-set(current)),
            "allTargetEvidencePresent":not missing,
            "automaticStopAuthorized":False,
            "physicalAndroidVerified":False}

def verify_delta_receipt(receipt, before, after):
    require(receipt.get("state") == "PUBLIC_DELTA_VERIFIED" and receipt.get("publicUrl") == URL,
            "NOT_PUBLIC_DELTA_RECEIPT")
    ids = checked_ids(receipt["verifiedPrintIds"])
    delta = {k for k,v in after.items() if before.get(k) != v}
    require(set(before) <= set(after) and ids == delta, "PUBLIC_DELTA_SCOPE_MISMATCH")
    require(not receipt.get("automaticStopAuthorized") and not receipt.get("allCardsComplete"),
            "INVALID_DELTA_COMPLETION_CLAIM")
    count = sum(len(after[k]["attacks"])+len(after[k]["abilities"]) if after[k]["category"]=="pokemon" else 1 for k in delta)
    require(receipt["verifiedSlots"] == count, "PUBLIC_DELTA_SLOT_COUNT_MISMATCH")
    return {k:after[k] for k in ids}

def self_test():
    x = {"category":"item","v":1}
    y = {"category":"item","v":2}
    assert audit({"2","3"},{"2":x,"3":y},{"2":[x],"3":[y]})["allTargetEvidencePresent"]
    assert not audit({"2","3"},{"2":x,"3":y},{"2":[x],"3":[y]})["automaticStopAuthorized"]
    assert audit({"2","3"},{"2":x,"3":y},{"2":[x],"3":[x]})["missingIds"] == ["3"]
    assert audit({"2"},{"2":x},{"3":[x]})["remainingByThisAudit"] == 1
    receipt = {"state":"PUBLIC_DELTA_VERIFIED","publicUrl":URL,"verifiedPrintIds":["2"],"verifiedSlots":1}
    assert verify_delta_receipt(receipt,{},{"2":x}) == {"2":x}
    for bad in ({**receipt,"verifiedPrintIds":["3"]},{**receipt,"verifiedSlots":0},
                {**receipt,"automaticStopAuthorized":True},{**receipt,"verifiedPrintIds":["2","2"]}):
        try: verify_delta_receipt(bad,{},{"2":x})
        except ValueError: continue
        raise AssertionError("FALSE_COMPLETION_ACCEPTED")
    print("EXACT_TARGET_COMPLETION_SELF_TEST PASS")

def main():
    require(git("rev-parse",ORIGIN+":"+ORIGIN_PATH).decode().strip()==ORIGIN_BLOB,"ORIGINAL_BLOB_MISMATCH")
    target = validate_scope(json.loads(Path(SCOPE).read_text()),json.loads(git("show",ORIGIN+":"+ORIGIN_PATH)))
    current = index(json.loads(Path(COMPILED).read_text()))
    # Until trusted historical public-workflow artifacts are collected, this
    # diagnostic deliberately grants zero public evidence, not zero progress.
    result = audit(target,current,{})
    result["commit"]=git("rev-parse","HEAD").decode().strip()
    result["receiptCollection"]="NOT_PERFORMED"
    print(json.dumps({k:v for k,v in result.items() if not k.endswith("Ids")}))
    Path("target-completion-audit.json").write_text(json.dumps(result,indent=2)+"\n")

if __name__=="__main__":
    if sys.argv[1:]==["--self-test"]: self_test()
    else: main()
