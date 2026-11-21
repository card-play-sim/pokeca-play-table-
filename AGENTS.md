# Codex instructions — shared Pokémon card effect runtime

This repository is the **existing public Android PWA**. Do not create a second app or ship ZIP files. The image registry is managed separately by Work; never delete, overwrite, or reinterpret its 6,000 reported image references.

## Mandatory automatic card-effect connection — all ChatGPT / Codex / Work agents (2026-11-21)

**P0 / binding project instruction:** Every agent working on H/I/J card effects or battle connectivity MUST reuse the existing official-effect intake, batch compilation, shared Effect Command/Rule Engine, and GitHub Actions pipelines. The user has NOT authorized one-card-at-a-time connection, manual per-print patches, or building a replacement connection system. Do not bypass official identity/evidence verification or mark untested cards as battle-ready.

**Required workflow:** (1) inspect the existing automation, its checkpoint, batch workflow, blockers, and coverage reports; (2) run/reuse the automated H/I/J batch pipeline and diagnose failures by shared cause; (3) fix common collection, parsing, evidence, or effect-command logic once for an entire class of cards; (4) rerun the batch, regression tests, and identity/provenance gates; (5) push, merge only after gates pass, verify Pages deployment and real battle flow. Work on independent steps in parallel. Treat basic energy exception prints as already catalogued, not missing cards. Distinguish catalogued, compiled, engine-connected, execution-tested, and Pages-verified counts.

**Never substitute** cosmetic BLOCKED messaging, a single print fix, or a CI-status-only report for the actual requested batch connection work. If the pipeline is working but evidence or mechanics remain incomplete, say so accurately; do not claim it is broken without proof. Keep the next actionable resume point in GitHub Issue #122 / PR #123. This instruction applies to all future agents reading this repository and overrides conflicting historical one-off task notes.

## Mandatory battle-playability gate — every existing and newly added card (2026-11-21)

**P0 completion criterion:** Collection, official evidence, parsing, compilation, and engine connection are intermediate stages only. A card is NOT complete or battle-ready until its attacks, abilities, trainer effects, energy interactions, targeting, state changes, turn restrictions, and applicable rule interactions actually execute correctly in a battle, with automated gameplay regression coverage and public Pages gameplay verification. Test the applicable effects and interactions, not just that a plan exists or the card can be selected.

**Required continuous loop:** collect official printing -> verify identity/evidence -> parse -> connect through shared Effect Commands -> **execute in actual battle state** -> **assert observable gameplay results** -> diagnose/fix shared mechanics or intake -> rerun automatically until passing -> release -> **verify gameplay on the deployed public app**. Never count CONNECTED_UNTESTED as battle-playable, or use a passing batch compiler/CI alone as evidence of playable cards. New sets follow the exact same gate; new mechanics extend the existing shared engine rather than requiring a new system or one-off print patches. Record separately: catalogued, compiled, connected, battle-execution PASS, deployed-gameplay PASS, blocked, and reason. Do not mark the full H/I/J rollout complete until every in-scope card has met its applicable gameplay gate (or explicitly report remaining exceptions as incomplete).

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
