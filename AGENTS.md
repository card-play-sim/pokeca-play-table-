# Codex instructions — shared Pokémon card effect runtime

This repository is the **existing public Android PWA**. Do not create a second app or ship ZIP files. The image registry is managed separately by Work; never delete, overwrite, or reinterpret its 6,000 reported image references.

## Mandatory first read for every Codex / successor ChatGPT session

**Read [docs/DEVELOPMENT_CONTROL.md](docs/DEVELOPMENT_CONTROL.md) before changing code.** It defines the current GitHub-first operating contract, the exact PR #37 continuation route, responsibility boundaries, release gates, known failure signatures and compact reporting. Treat the document's historical SHAs as examples; always refresh PR head and latest-head Actions. Do not start by rewriting plans, opening a replacement PR, requesting ZIPs, or repeatedly pushing into a runner/approval block.

## Primary goal
Implement attacks, abilities, items, supporters, tools, stadiums and special energy from **verified official card effect text**, as reusable Effect Commands and Rule Engine operations. Never implement one print-specific workaround when the cause is a shared mechanic. Aim for 5,000+ cards by incremental, evidence-gated ingestion rather than one-by-one hand coding.

## Entry points
- GitHub Issue #17: official effect intake and implementation roadmap.
- `data/reference-effects/plans.json`: 89 print-specific **validation references**, not adopted deck prints; treat as read-only.
- `scripts/export-reference-official-effect-evidence.cjs`: exports text-backed effects from those records.
- `scripts/build-official-effect-codex-batch.cjs`: validates official text hashes, rejects conflicting/missing evidence and groups identical patterns.
- `reports/official-effect-codex-batch.json`: generated CI artifact, not checked-in ground truth.
- `engine/reference-effect-plans.cjs`, `engine/pokeca_reference_effect_runtime.cjs`, `engine/pokeca_reference_validation_adapter.cjs`: compiler, shared runtime, adapter.
- `ui/engine.bundle.js`: must remain synchronized with source modules.
- `.github/workflows/reference-effect-provenance.yml`: cross-category tests and evidence artifacts.

## Mandatory implementation sequence
1. Inspect current main and verify provenance, effect text and official print ID. Distinguish image coverage, text coverage, compiler coverage, runtime coverage, and Android device verification.
2. For new H/I/J evidence, acquire official effect text and source URL, calculate text SHA-256, persist each verified record atomically, detect duplicates, and BLOCK uncertain records. Images alone are not proof of text.
3. Group equivalent effect semantics; inspect the approved Effect Command contract before changing runtime behavior. Record unsupported commands as BLOCKED; never guess or fabricate card effects.
4. Implement shared commands and target/choice legality, priority, Rule Order, triggered effects, status and state-based checks. Preserve deterministic RNG and exact rollback on rejected actions.
5. Test every affected category/print: legal action, invalid action, save/replay, conservation, first-turn restrictions, special energy, knockouts and prizes. Run full reference-effect CI and bundle hash/release checks.
6. Update **existing** PWA through verified release workflow. Distinguish CI success, Pages deployment, browser verification and Android physical-device verification; never claim the latter without evidence.

## Hard prohibitions
- Do not mutate formal 1945-card catalog, approved AI Core v0.2, Rule Engine v0.1.2, Effect Integration v0.1 or fixed deck lists without explicit approval.
- Do not modify official image registry, remove existing images or substitute speculative art.
- Do not auto-merge unsafe or unverified effect changes.
- Do not report a green CI check as proof of a playable Android release.
- Do not request repetitive manual ZIP uploads or require a user to confirm every card.

## Deliverables
Reusable command implementation, tests, source-provenance evidence, counts by category and regulation, structured blocked causes, bundle sync and actual deployment evidence. When blocked, report the exact missing source or contract and preserve completed work.
