#!/usr/bin/env python3
"""Keep bounded, inert repair diagnostics without breaking Japanese UTF-8 or JSON."""
import json
import sys
from pathlib import Path

LIMIT = 1800
PREFIXES = ("QUARANTINE_RECEIPT_FEEDBACK ", "QUARANTINE_BROWSER_FEEDBACK ")

def units(text):
    return len(text.encode("utf-16-le", errors="replace")) // 2

def tail(text, limit=LIMIT):
    # JavaScript's repair input is limited in UTF-16 units, not UTF-8 bytes.
    result = []
    used = 0
    for char in reversed(text):
        n = units(char)
        if used + n > limit:
            break
        result.append(char)
        used += n
    return "".join(reversed(result))

def feedback(text):
    text = text.rstrip()
    lines = text.splitlines()
    # A trusted receipt is already bounded JSON. Prefer the latest complete
    # failure receipt unless a later browser failure supersedes it.
    for line in reversed(lines):
        if line == "BROWSER_EXECUTION_FAILED":
            break
        for prefix in PREFIXES:
            if not line.startswith(prefix):
                continue
            try:
                row = json.loads(line[len(prefix):])
            except ValueError:
                continue
            if not isinstance(row, dict) or not isinstance(row.get("state"), str):
                continue
            if row["state"].endswith("PASSED_REVIEW_REQUIRED"):
                continue
            compact = prefix + json.dumps(row, ensure_ascii=False, separators=(",", ":"))
            if units(compact) <= LIMIT:
                return compact
    return tail(text)

def self_test():
    reason = "進化元の物理カードが不足" * 85
    value = {"state":"RECEIPT_REJECTED","reason":reason}
    line = PREFIXES[0] + json.dumps(value, ensure_ascii=False)
    assert len(line.encode("utf-8")) > LIMIT and units(line) < LIMIT
    got = feedback("old log\n" + line + "\ntrailing wrapper")
    assert json.loads(got[len(PREFIXES[0]):]) == value
    browser = PREFIXES[1] + json.dumps({"state":"BROWSER_RECEIPT_REJECTED","reason":"不足"})
    assert feedback(line + "\nBROWSER_EXECUTION_FAILED\n" + browser).startswith(PREFIXES[1])
    assert feedback(line + "\nBROWSER_EXECUTION_FAILED\nmissing DOM").endswith("missing DOM")
    assert units(feedback("😀" * 2000)) == LIMIT
    assert feedback("simple failure\n") == "simple failure"
    print("UNKNOWN_REPAIR_FEEDBACK_SELF_TEST PASS")

if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test()
    else:
        # The log is untrusted diagnostic text, never executed.
        path = Path(sys.argv[1])
        with path.open("rb") as f:
            f.seek(max(0, path.stat().st_size - 65536))
            print(feedback(f.read().decode("utf-8", errors="replace")))
