# CODEX-CONTROL-006 (Issue #34)

Base public main: 30c94e9e / v248. Development main: 115cf809. PR #33's portrait components, seven-card manual opening and persistent update path are retained. Development PR #3 is marked not integration-ready and its main CI remains failed; no unreviewed development core is copied. Image-owner PRs #19/#28 are untouched. Open runtime PRs #6/#18/#22/#23 are not merged: this change is limited to ability presentation, dependent requests, passive detail state and regression evidence.

## Shared repair

The quick ability entry previously inspected only field Pokémon, hiding hand-use abilities. Both the button's availability and its menu now use the same field/hand option collector from the existing canonical UI port. Repeated names are distinguished by hand/Active/Bench position. No independent card-name rule is introduced.

Selection dependencies are declared in engine requests and resolved by `pokeca_selection_constraints.resolve` in UI, canonical validation and AI completion. Subsets, selection-dependent cardinality, exclusion of a selected attachment's holder, and a source-dependent counter maximum share one resolver. Counter movement no longer offers zero (the existing MOVE_DAMAGE_COUNTERS gateway requires 1–3) or more counters than the chosen source owns. Energy transfer does not offer the original holder. Optional typed searches derive subsequent hand/attachment choices from the actual first selection. Invalid actions retain rollback and existing diagnostic codes. Passive ability details now show whether the source is in play and enabled, rather than an unknown active flag.

Official effect/command meanings and the approved core, AI policy, formal DB, fixed 120 list, image ledger and save format are unchanged. UI layout is not redesigned. Canonical runtime/bundle and v249 atomic release are synchronized.

## Evidence and limits

- `scripts/recheck-control-006-official.py`: fetch official pages, retain raw HTML/hash atomically, check canonical print URL and heading, parse common type icons, compare exact normalized ability text/name. Nine priority ability reference prints match. `--saved` checks already-fetched bytes without repeat network access. No deck-print adoption is performed.
- `tests/control-006-abilities.test.cjs`: all seven declarable default abilities, AI/UI gateway parity, reuse rejection after save/restore, multiple shared turn-limit resets, multi-card suppression/re-enabling, both continuous-source lifecycles, dependent choices and unknown-rule rejection. Continuous removal fixtures are declared state transitions, not claims of naturally reached full matches.
- `tests/test_control_006_browser.py`: actual DOM quick abilities for seven sources, both continuous ability entries/details, counter/source selection, energy transfer, typed search, Phantom Dive allocation, exact save/reload, offline restart after hand-use and deck-inspection abilities. Self-return promotion is resolved through the existing choice UI.
- `tests/control-005-effect-matrix.test.cjs`: 63 cases / 60 effect slots / 45 names / 120 physical cards, expected zone/energy/damage/turn transitions, canonical AI action matching and save round trips. 59 effect slots execute; the Grass-cost Shaymin attack remains blocked by energy unavailable in the unchanged fixed decks.
- `scripts/report-control-006-connections.cjs`: per-slot original text, URL/hash, formal binding, commands, runtime, AI, UI, outcome and causes. `reports/control-006-connections.json` is the controlled candidate snapshot. CI artifacts contain fresh candidate/public evidence, with the tested URL explicitly recorded.

Printed damage-only attacks and basic energies without an effect body are distinguished from missing effect evidence; no effect text is invented for those records.

Formal final status remains **VERIFIED 0 / FAILED 0 / BLOCKED 60 / NOT_IMPLEMENTED 0** because the protected fixed manifest contains no confirmed adopted print IDs. Reference execution is not formal deck verification. Identity must be confirmed by the responsible source/owner; names or artwork cannot authorize adopting a reference print. Remaining full lifecycle/per-effect branch coverage is explicit in each row, so a connected command is never claimed as all-effects completion.

Candidate and published workflows retain the existing complete fixed-deck matches, search/switch/counter/evolution/KO/prize checks, protected v246-save upgrade and offline tests. Public deployment requires byte equality and public Chromium interaction; physical Android remains unverified.
