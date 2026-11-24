"""Restore only missing official HTML proofs referenced by a resumed checkpoint.

Never overwrite existing evidence; verify the immutable HTML hash and URL before
writing bytes from the checkpoint commit. Fail closed on missing/conflicting proof.
"""
import argparse
import hashlib
import re
import json
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "data/effect-extensions/evidence"

def recover(commit, checkpoint):
    return recover_records(commit, json.loads(checkpoint.read_text(encoding="utf-8"))["records"])

def recover_records(commit, records):
    # Validate the complete checkpoint before creating any new evidence files.
    pending = []
    for record in records:
        official_id = str(record["officialCardId"])
        if not re.fullmatch(r"[1-9][0-9]{0,7}", official_id):
            raise ValueError("INVALID_OFFICIAL_ID")
        rel = f"data/effect-extensions/evidence/{official_id}.json"
        if record["source"]["path"] != rel:
            raise ValueError("UNSAFE_EVIDENCE_PATH:" + official_id)
        target = ROOT / rel
        if target.exists():
            raw = target.read_bytes()
        else:
            raw = subprocess.check_output(["git", "show", f"{commit}:{rel}"], cwd=ROOT)
        proof = json.loads(raw)
        if (
            hashlib.sha256(proof["html"].encode()).hexdigest() != proof["htmlSha256"]
            or proof["htmlSha256"] != record["source"]["sha256"]
            or proof["url"] != record["officialPageUrl"]
        ):
            raise ValueError("EVIDENCE_INTEGRITY_CONFLICT:" + official_id)
        if not target.exists():
            pending.append((target, raw))
    recovered = 0
    for target, raw in pending:
        target.parent.mkdir(parents=True, exist_ok=True)
        # Exclusive creation prevents a concurrent recovery from overwriting proof.
        try:
            with target.open("xb") as output:
                output.write(raw)
            recovered += 1
        except FileExistsError:
            if target.read_bytes() != raw:
                raise ValueError("EVIDENCE_INTEGRITY_CONFLICT:" + target.stem)
    return recovered

def merge_checkpoint(commit, checkpoint):
    rel = checkpoint.relative_to(ROOT).as_posix()
    saved = json.loads(subprocess.check_output(["git", "show", f"{commit}:{rel}"], cwd=ROOT))
    current = json.loads(checkpoint.read_text(encoding="utf-8"))
    if current.get("schemaVersion") != 1 or saved.get("schemaVersion") != 1:
        raise ValueError("INVALID_CHECKPOINT_VERSION")
    records = {}
    blocked = {}
    for source in (current, saved):
        for row in source["records"]:
            ident = row["officialCardId"]
            if ident in records and records[ident] != row:
                previous = records[ident]
                # Permit only a derived-facts repair verified against the same
                # immutable official HTML. Everything else is still a conflict.
                if {k:v for k,v in previous.items() if k != "facts"} != {k:v for k,v in row.items() if k != "facts"}:
                    raise ValueError("CHECKPOINT_RECORD_CONFLICT:" + ident)
                try:
                    rel = previous["source"]["path"]
                    if not re.fullmatch(r"[1-9][0-9]{0,7}", str(ident)) or rel != f"data/effect-extensions/evidence/{ident}.json":
                        raise ValueError("UNSAFE_EVIDENCE_PATH")
                    target = ROOT / rel
                    proof = json.loads(target.read_bytes() if target.exists() else subprocess.check_output(["git", "show", f"{commit}:{rel}"], cwd=ROOT))
                    resolved = subprocess.run(["node", "scripts/refresh-uncompiled-official-facts.cjs", "--verify-pair"],
                        input=json.dumps({"a":previous,"b":row,"proof":proof}, ensure_ascii=False),
                        cwd=ROOT, text=True, capture_output=True, check=True)
                    row = json.loads(resolved.stdout)
                except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as exc:
                    raise ValueError("CHECKPOINT_RECORD_CONFLICT:" + ident) from exc
            records[ident] = row
        for row in source["blocked"]:
            ident = row["officialCardId"]
            previous = blocked.get(ident)
            if previous is None or (
                previous.get("reason") == row.get("reason") == "COLLECTOR_EXCEPTION"
                and row.get("attempts", 1) > previous.get("attempts", 1)
            ):
                blocked[ident] = row
    recovered = recover_records(commit, records.values())
    combined = {
        **current,
        "records": list(records.values()),
        "blocked": [row for ident, row in blocked.items() if ident not in records],
    }
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=checkpoint.parent,
                                     delete=False) as output:
        json.dump(combined, output, ensure_ascii=False, indent=2)
        output.write("\n")
    temporary = Path(output.name)
    try:
        temporary.replace(checkpoint)
    finally:
        temporary.unlink(missing_ok=True)
    return recovered

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("commit")
    parser.add_argument("--checkpoint", default="data/official-effect-intake/checkpoint.json")
    parser.add_argument("--merge", action="store_true")
    args = parser.parse_args()
    restore = merge_checkpoint if args.merge else recover
    print(json.dumps({"recoveredEvidence": restore(args.commit, ROOT / args.checkpoint)}))
