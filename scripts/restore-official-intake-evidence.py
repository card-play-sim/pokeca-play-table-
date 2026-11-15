"""Restore only missing official HTML proofs referenced by a resumed checkpoint.

Never overwrite existing evidence; verify the immutable HTML hash and URL before
writing bytes from the checkpoint commit. Fail closed on missing/conflicting proof.
"""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "data/effect-extensions/evidence"

def recover(commit, checkpoint):
    records = json.loads(checkpoint.read_text(encoding="utf-8"))["records"]
    recovered = 0
    for record in records:
        official_id = str(record["officialCardId"])
        if not official_id.isdigit() or not 4 <= len(official_id) <= 8:
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
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
            recovered += 1
    return recovered

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("commit")
    parser.add_argument("--checkpoint", default="data/official-effect-intake/checkpoint.json")
    args = parser.parse_args()
    print(json.dumps({"recoveredEvidence": recover(args.commit, ROOT / args.checkpoint)}))
