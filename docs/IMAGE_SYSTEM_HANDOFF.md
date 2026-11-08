# Official image reference importer — verified handoff
Updated: 2026-11-08

## Scope and protection
Existing app: card-play-sim/pokeca-play-table-; PR #3; tracking issue #2.
Formal 1945-record card dataset remains READ-ONLY. Fixed 120-card decks are smoke tests, NOT the project scope. Never infer officialCardId or sourceUrl. Image references only; do not redistribute image binaries.

## Implemented
- tools/import-image-registry.mjs: imports existing evidence-backed records from JSON; atomic per-record files, readback, idempotent re-run, conflict/invalid quarantine, summary and compiled registry.
- tests/image-registry-import.test.mjs: 5001 synthetic records, idempotency, conflict.
- tests/image-registry-existing.test.mjs: existing verified registry import and re-run.
- tests/image-registry-invalid.test.mjs: invalid URL quarantine, deterministic re-run, recovery.
- .github/workflows/image-registry-capacity.yml: runs tests and uploads generated candidate registry/report as artifact.
- Existing mobile.js already calls PokecaImageResolver.loadRegistry('./data/official-image-registry.json'). Do not rebuild this connection without investigating existing behavior.

## Evidence
- GitHub Actions run 42472505937: SUCCESS for tests through commit 57acef57e314f9a3d1ecadb0d612b53e5361c3b1.
- 5001 is SYNTHETIC test capacity, not real official records.
- Browser image load and Android Chrome not verified by these tests.
- Official 1945 ZIP was not found in current conversation/Library search, so it has NOT been imported or modified.
- CI output is a review artifact, not deployed automatically.

## Remaining work (priority)
1. Obtain original verified 1945 dataset through accessible Project attachment/connector; inspect its actual schema, official provenance and image reference fields. Never invent missing source URLs.
2. Map only verified image references into importer input, preserving original evidence and IDs.
3. Automate incremental permitted official discovery for broader 5000+ coverage, with durable cursor and rate limits; block if endpoint/permissions unavailable.
4. Add end-to-end browser image loading tests and Android Chrome verification, with exact actual verified/displayed counts.
5. Only after green gates, merge reviewed PR and deploy; update issue #2 with run/commit IDs.

## Status
Importer implementation: CI PASS (run 42472505937).
Real official 5000+ image ingestion: NOT DONE.
Android browser display of 5000+: NOT VERIFIED.
Public production deployment: UNCHANGED.
