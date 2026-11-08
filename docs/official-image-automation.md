# Official image reference automation

This pipeline saves official **HTML evidence and image URLs**, never image files.
It does not adopt deck print identities, modify the formal card database or engine,
or claim successful browser/physical Android image display.

## Scope and bounded operation

The default sources are the existing
`data/fixed-deck-official-image-candidates.json` and
`data/official-image-candidates-reviewed.json`. Currently they select only the two
already confirmed detail-page candidates, IDs 50400 and 50537. No name-based
search, ID enumeration, or image-path generation is performed.

Each candidate must supply its ID, exact name, set, card number and observed
official detail-page URL. An optional `officialSearchUrl` must be an official
search page containing an actual link to that same ID; details still must match
all four identity fields. Search-page links alone never authorize registration.

```
node scripts/automate-official-images.cjs
node scripts/automate-official-images.cjs --refresh
```

The first command resumes verified checkpoints. `--refresh` fetches the current
bounded batch again, archiving the preceding checkpoint before replacing it.
Prior registry metadata and evidence hashes remain intact; the receipt binds the
new observation. Actions uses refresh. HTTP redirects, access challenges,
non-HTML content and bodies above 4 MB are rejected. No image request is issued.

`--candidates <json-file>`, `--batch-size <count>` and `--max-requests <count>` allow
explicit future manifests beyond the fixed decks. Defaults are 50 candidates and
50 HTML requests with at least three seconds between requests. The implementation
caps each invocation at 500 candidates / 1,000 requests; it never follows search
pagination automatically. A 5,001-candidate test covers two bounded batches.
A plan hash and cursor in `data/image-automation/progress.json` resume the next
batch. Changing the manifest resets the plan; a conflicting checkpoint stops
rather than being silently reused. No schedule or unbounded continuation runs.

## One-record transaction

Before the next network request, the current record completes:

1. Fetch HTML, check exact ID/name/set/number and observe its image URL.
2. Atomically save the HTML checkpoint; reread, verify hashes and reparse it.
3. Merge through the shared image-validation rules; reject identity/print conflicts.
4. Atomically save and reread the complete registry, including existing evidence.
5. Save and reread a receipt binding checkpoint hash to registry-record hash.
6. Save and reread progress.

An exclusive writer lock rejects concurrent local runs. Registry content hashes
reject concurrent external writes. An interrupted registry/receipt boundary is
replayed without duplicating the entry. Locks left by a killed process require
operator inspection before removal; they are not automatically broken.

HTTP errors stop subsequent requests. Identity/print mismatch is quarantined and
never registered; other independently verified candidates may finish. A blocked
cursor stays at the earliest unresolved candidate. Cached holds remain blocked;
use an explicit refresh after resolving the source problem. Disk, replay and
registry conflicts stop the run immediately. Existing data is never overwritten
to resolve a conflict.

## Audit and GitHub publication

`latest.json` separates `registrationPass` from `productionPass` (always false
here) and `imageDisplayStatus: NOT_VERIFIED`. A truncated batch, hold, missing
reference, protected-file change or integrity error cannot pass registration.
`records/`, `records/history/`, `receipts/`, `quarantine/` and content-addressed
`runs/` audits retain evidence.
The older `collection.json` and `browser-result.json` are historical artifacts,
not inputs to the new success gate.

Actions runs regression tests before collection. Collection failure is not
ignored. After successful regressions, `persist-official-image-results.cjs`
rechecks evidence, protected hashes, current run ID and an output-file allowlist,
then stages only registry/evidence outputs and makes a fast-forward push to the
existing branch. A concurrent branch change is rejected; there is no force push.
The bot commit includes `[skip ci]` to prevent recursion. No PR comment is posted.

A safely completed prefix or quarantined batch can be checkpointed to GitHub
with a **BLOCKED** audit; the collection step and final Actions gate still fail.
An integrity or protected-data failure blocks publication entirely. Failure
artifacts are uploaded even if no commit is allowed. Fixed-120 image display is
reported separately as NOT_VERIFIED, rather than disabling registration because
deck identities are still unknown.

## Tests

```
node tests/official-image-collector.test.js
node tests/official-image-automation.test.cjs
node scripts/run-offline-tests.cjs
python -m unittest discover -s tests -p 'test_official_image_workflow.py' -v
```

The transaction tests use synthetic HTML, temporary registries and a local bare
Git remote. They cover actual commit/push, duplicate execution, archived refresh,
receipt/checkpoint tampering, HTTP failure, print conflicts, disk failure recovery,
protected data, request limits, writer locking and 5,001 explicit candidates.
They never contact the official site or publish fixture records to GitHub.
