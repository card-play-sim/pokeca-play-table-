# Codex instructions — shared Pokémon card effect runtime

This repository is the **existing public Android PWA**. Do not create a second app or ship ZIP files. The image registry is managed separately by Work; never delete, overwrite, or reinterpret its 6,000 reported image references.

## Mandatory automatic card-effect connection — all ChatGPT / Codex / Work agents (2026-11-21)

**P0 / binding project instruction:** Every agent working on H/I/J card effects or battle connectivity MUST reuse the existing official-effect intake, batch compilation, shared Effect Command/Rule Engine, and GitHub Actions pipelines. The user has NOT authorized one-card-at-a-time connection, manual per-print patches, or building a replacement connection system. Do not bypass official identity/evidence verification or mark untested cards as battle-ready.

**Required workflow:** (1) inspect the existing automation, its checkpoint, batch workflow, blockers, and coverage reports; (2) run/reuse the automated H/I/J batch pipeline and diagnose failures by shared cause; (3) fix common collection, parsing, evidence, or effect-command logic once for an entire class of cards; (4) rerun the batch, regression tests, and identity/provenance gates; (5) push, merge only after gates pass, verify Pages deployment and real battle flow. Work on independent steps in parallel. Treat basic energy exception prints as already catalogued, not missing cards. Distinguish catalogued, compiled, engine-connected, execution-tested, and Pages-verified counts.

**Never substitute** cosmetic BLOCKED messaging, a single print fix, or a CI-status-only report for the actual requested batch connection work. If the pipeline is working but evidence or mechanics remain incomplete, say so accurately; do not claim it is broken without proof. Keep the next actionable resume point in GitHub Issue #122 / PR #123. This instruction applies to all future agents reading this repository and overrides conflicting historical one-off task notes.

## Single end-to-end automatic card-to-playable pipeline — binding completion contract (2026-11-21)

**P0: ONE system, ONE completion gate.** Automatic card connection means automatically making each card genuinely usable in battle, not merely producing a parsed plan or connecting an engine command. Collection, official evidence, parsing, shared engine connection, real battle execution, regression testing, and deployment verification are INTERNAL STEPS of one continuous automated pipeline. Do not split these into independently 'complete' systems, separate deliverables, or success claims. A card is processed successfully ONLY when its applicable attacks, abilities, trainer effects, energy interactions, targeting, game-state changes and rules work correctly in real battle and the deployed app is verified. Until then the entire automatic processing of that card remains INCOMPLETE.

**Required unified workflow for every existing H/I/J card and every future addition:** detect/import printing -> verify official identity/evidence -> parse effects -> map to existing shared Effect Commands/Rule Engine -> execute real battle scenarios and assert observable state changes -> automatically identify and fix shared intake/mechanic blockers -> rerun full batch and battle tests -> release through verified GitHub Pages -> verify public gameplay. Treat all steps as ONE card-to-playable operation. Any failure blocks completion and stays in the same pipeline's retry/remediation queue. Never mark CONNECTED_UNTESTED, compiler success, or CI success alone as card completion. New mechanics extend the shared engine; never build a replacement system or manually patch cards one by one.

Progress diagnostics may show internal failure reasons, but they must not become separate completion criteria. The only user-facing finished result is **card playable in the published battle app**; report unfinished cards as unfinished. Do not call the H/I/J rollout complete while in-scope cards remain unplayable.

## Non-negotiable execution cadence (Issue #92)

A user message `ｇ` means **continue working**, not "check one CI run and report again". Do not end a turn after a single queued/in-progress Actions status check. Parallelize independent investigation, diagnosis, shared code fixes, push/retest, and merge/Pages verification, observing real dependencies and release gates. Work on other independent tasks while CI runs. After two repetitions of the same blocker, change method instead of repeating status reports. Report consolidated *actual changes and verified outcomes*, distinguishing CI, Pages, browser, and physical Android. See [Issue #92](https://github.com/card-play-sim/pokeca-play-table-/issues/92) and `docs/DEVELOPMENT_CONTROL.md`.

## Mandatory first read for every Codex / successor ChatGPT session

**Read [docs/DEVELOPMENT_CONTROL.md](docs/DEVELOPMENT_CONTROL.md) before changing code.** It defines the current GitHub-first operating contract, the latest merged baseline, responsibility boundaries, release gates, historical failure signatures and compact reporting. PR #37 and #38 are already merged; never resume work on their closed branches. Treat the document's historical SHAs as examples; always refresh PR head and latest-head Actions. Do not start by rewriting plans, opening a replacement PR, requesting ZIPs, or repeatedly pushing into a runner/approval block.

## Primary goal
Implement attacks, abilities, items, supporters, tools, stadiums and special energy from **verified official card effect text**, as reusable Effect Commands and Rule Engine operations. Never implement one print-specific workaround when the cause is a shared mechanic. Aim for 6,000+ cards by evidence-gated ingestion and shared-mechanic expansion rather than one-by-one hand coding. New shared effect implementation is the primary work; bug fixes are supporting work.

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
