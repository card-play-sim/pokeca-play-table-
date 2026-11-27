#!/usr/bin/env python3
"""Trusted host receipt gate: report exact target failures without running candidate code."""
import json
import sys
from pathlib import Path

MAX_BYTES = 64 * 1024 * 1024

def read_json(path, root):
    path, root = Path(path), Path(root).resolve()
    if not path.is_file() or path.is_symlink() or not path.resolve().is_relative_to(root) or path.stat().st_size >= MAX_BYTES:
        raise ValueError("UNSAFE_OR_MISSING_RECEIPT:" + path.name)
    return json.loads(path.read_text(encoding="utf-8"))

def index_records(records):
    indexed = {str(row["officialCardId"]): row for row in records}
    if len(indexed) != len(records):
        raise ValueError("DUPLICATE_COMPILED_PRINT")
    return indexed

def fixture_diagnostics(value):
    """Bound inert worker details; never interpret generated diagnostic data."""
    if not isinstance(value, list):
        return []
    return [item[:100] for item in value[:4] if isinstance(item, str)]

def inspect(prior, current, receipt, selection, gaps):
    old, indexed = index_records(prior), index_records(current)
    changed = sorted(key for key, value in old.items() if indexed.get(key) != value)
    selected = list(dict.fromkeys(map(str, selection["targetIds"])))
    if not selected or len(selected) != len(selection["targetIds"]):
        raise ValueError("INVALID_SELECTED_TARGETS")
    if not isinstance(receipt["qualified"], list) or len(set(map(str, receipt["qualified"]))) != len(receipt["qualified"]):
        raise ValueError("INVALID_QUALIFIED_TARGETS")
    qualified = set(map(str, receipt["qualified"]))
    proved = sorted(set(selected) & qualified)
    missing = [key for key in proved if key not in indexed]
    blockers = {str(row["id"]): str(row.get("reason", "UNKNOWN"))[:100] for row in receipt.get("blockers", [])}
    details = {}
    for gap in gaps.get("gaps", []):
        key = str(gap.get("id"))
        if key not in selected or len(details.get(key, [])) >= 2:
            continue
        details.setdefault(key, []).append({
            "kind": str(gap.get("kind", ""))[:30],
            "index": gap.get("index"),
            "status": str(gap.get("status", ""))[:40],
            "reason": str(gap.get("reason", ""))[:100],
            "details": fixture_diagnostics(gap.get("details")),
        })
    failures = []
    for key in selected:
        if key in proved and key not in missing:
            continue
        reason = ("QUALIFIED_RECORD_MISSING" if key in missing else
                  blockers.get(key, "NO_EXECUTION_RECEIPT" if key in indexed else "TARGET_NOT_COMPILED"))
        failures.append({"id": key, "reason": reason, "gaps": details.get(key, [])})
    required = selection.get("requiredTogether", [])
    if not isinstance(required, list) or len(set(map(str, required))) != len(required) or not set(map(str, required)) <= set(selected):
        raise ValueError("INVALID_DEPENDENCY_SCOPE")
    dependency_missing = set(map(str, required)) - set(proved)
    state = ("PRIOR_RECORD_CHANGED" if changed else
             "QUALIFIED_RECORD_MISSING" if missing else
             "DEPENDENT_EFFECTS_INCOMPLETE" if dependency_missing else
             "NO_SELECTED_PRINT_QUALIFIED" if not proved else
             "QUARANTINE_ENGINE_CHECK_PASSED_REVIEW_REQUIRED")
    return {"state": state, "selected": selected, "sandboxQualified": proved if not changed and not missing and not dependency_missing else [],
            "publicBattleVerified": [], "changedPriorIds": changed[:16], "targetFailures": failures}

def main(out, scratch, workspace):
    out, scratch, workspace = map(Path, (out, scratch, workspace))
    try:
        prior = read_json(workspace / "data/effect-extensions/compiled.json", workspace)["records"]
        current = read_json(scratch / "data/effect-extensions/compiled.json", scratch)["records"]
        receipt = read_json(scratch / "work/model-candidate/candidate.json", scratch)
        selection = read_json(out / "selected.json", out)
        gaps = read_json(scratch / "work/model-candidate/execution-gaps.json", scratch)
        result = inspect(prior, current, receipt, selection, gaps)
    except (ValueError, KeyError, TypeError, OSError) as exc:
        result = {"state": "RECEIPT_REJECTED", "reason": str(exc)[:300], "publicBattleVerified": []}
    (out / "quarantine-result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # A short final line survives the existing 1800-character feedback limit.
    summary = {key: result[key] for key in ("state", "reason", "changedPriorIds") if key in result}
    # Keep complete JSON and the first actionable fixture reason within the
    # generator's 1800-character feedback window. Never truncate JSON mid-field.
    summary["targetFailures"] = []
    for failure in result.get("targetFailures", [])[:4]:
        trial = {**summary, "targetFailures": summary["targetFailures"] + [failure]}
        if len(json.dumps(trial, ensure_ascii=False, separators=(",", ":"))) > 1550:
            break
        summary = trial
    print("QUARANTINE_RECEIPT_FEEDBACK " + json.dumps(summary, ensure_ascii=False, separators=(",", ":")))
    return 0 if result["state"] == "QUARANTINE_ENGINE_CHECK_PASSED_REVIEW_REQUIRED" else 1

def self_test():
    old = [{"officialCardId": "1", "plan": "old"}]
    new = old + [{"officialCardId": "2", "plan": "new"}]
    selection = {"targetIds": ["2", "3"]}
    receipt = {"qualified": [], "blockers": [{"id": "2", "reason": "ENGINE_EXECUTION_FAILED"}]}
    gaps = {"gaps": [{"id": "2", "kind": "attack", "index": 0, "status": "FAILED", "reason": "NO_TARGET"}]}
    result = inspect(old, new, receipt, selection, gaps)
    assert result["state"] == "NO_SELECTED_PRINT_QUALIFIED"
    assert result["targetFailures"][0]["gaps"][0]["reason"] == "NO_TARGET"
    assert result["targetFailures"][1]["reason"] == "TARGET_NOT_COMPILED"
    assert inspect(old, new, {"qualified": ["2"]}, selection, gaps)["state"] == "QUARANTINE_ENGINE_CHECK_PASSED_REVIEW_REQUIRED"
    assert inspect(old, new, {"qualified": ["3"]}, selection, gaps)["state"] == "QUALIFIED_RECORD_MISSING"
    assert inspect(old, [{"officialCardId": "1", "plan": "changed"}] + new[1:], {"qualified": ["2"]}, selection, gaps)["state"] == "PRIOR_RECORD_CHANGED"
    assert inspect(old, new, {"qualified": ["1"]}, selection, gaps)["state"] == "NO_SELECTED_PRINT_QUALIFIED"
    fixture = {"gaps": [{"id": "2", "kind": "attack", "index": 0,
                         "status": "BLOCKED", "reason": "NO_LEGAL_VERIFICATION_FIXTURE",
                         "details": ["ENERGY_COST_UNPAID", "NOT_ACTIVE", {"ignored": True}, "x"*500, "overflow"]}]}
    blocked = inspect(old, new, receipt, selection, fixture)
    gap = blocked["targetFailures"][0]["gaps"][0]
    assert gap["reason"] == "NO_LEGAL_VERIFICATION_FIXTURE"
    assert gap["details"] == ["ENERGY_COST_UNPAID", "NOT_ACTIVE", "x"*100]
    assert blocked["sandboxQualified"] == []
    assert fixture_diagnostics({"fake": "PASS"}) == []
    assert inspect(old, new, {"qualified": ["2"]}, {**selection,"requiredTogether":["2","3"]}, gaps)["state"] == "DEPENDENT_EFFECTS_INCOMPLETE"
    print("UNKNOWN_QUARANTINE_FIXTURE_DIAGNOSTICS PASS")
    print("UNKNOWN_QUARANTINE_RECEIPT_SELF_TEST PASS")

if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test()
    else:
        sys.exit(main(*sys.argv[1:]))
