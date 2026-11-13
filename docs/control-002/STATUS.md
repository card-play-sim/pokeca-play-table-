# CODEX-CONTROL-002

Baseline: main cf72f537 (PR #27). Work is isolated from image-owner PRs #19/#28.

## Opening repair
The primary fixed-deck entry previously called the reference match factory with
automatic placement and loaded the match immediately. The manual picker existed
only for the synthetic demo. Both real fixed-deck choices now open a preview of
all seven opening cards. Only Basics have enabled placement buttons. The human
chooses Active and optional 0–5 Bench, changes Active, cancels individual Bench
choices or clears all placement. Start stays disabled without Active.

Preview and commit recreate the same deterministic shuffle from a private seed,
including full-deck mulligan retries, prizes, effect RNG and automatic AI setup.
Explicit human starting choices flow through the existing setup validator. No
candidate game is loaded or saved until confirmation; cancelling preserves the
previous game. AI placement and the existing mulligan compensation action remain
in place. No snapshot schema or stored user data is migrated.

A genuine new pointer-down now clears confirmation's compatibility-click guard;
phantom click events without a new pointer-down remain suppressed. This prevents
the newly opened preparation dialog from swallowing real player taps.

## Shared effect work
Three source-backed selection families now declare constraints consumed by both
Rule Engine validation and the shared Chromium selector:

- distinct energy types (Akamatsu);
- distinct card categories (Hilda);
- maximum one selection when an evolution is chosen (Brock's Scouting).

The helper contains no card names or mutable game state, rejects unknown rule
kinds and is bundled from its source module. Existing AI legal-action checks use
the same authoritative validation. Rule error codes and existing AI policy are
preserved. Current official pages for all three source records were fetched and
corroborated; original text, URLs and hashes are recorded alongside this file.

This improves shared selection legality, not the count of adopted card prints.
The existing verified corpus remains 89 reference prints (60 Pokemon, 10 items,
8 supporters, 5 energy, 4 stadiums, 2 tools); no source records are reclassified.
Cards outside verified effect intake remain BLOCKED rather than inferred from
images. The common helper supports future evidence-gated cards without adding
card-specific UI code. Special evolution remains subject to its existing
unapproved-contract boundary; ordinary evolution restrictions are retained.

## Verification
- Node: both decks, alternate Active, empty/nonempty Bench, real mulligans,
  invalid Active/evolution/duplicate/overlap rejection, 60 physical IDs per side,
  unchanged AI setup, exact save/restore, declarative constraints.
- Chromium actual entry: both decks, seven visible cards, Basic-only selection,
  no Active/start rejection, selection change/cancel, optional Bench 0/1,
  whole-preparation cancellation, real mulligan seeds 64/9, AI setup and reload.
- Chromium controlled effect fixtures: illegal search combinations disabled,
  attach/move physical energy, item discard, tool HP, stadium triggered damage,
  first-turn/entered-turn evolution rejection, legal evolution, first-turn attack
  rejection, attack knockout, prize choice, victory and exact restoration.
- Existing G-BASE-008 DOM matrix remains intact. Complete-match tests now play
  each fixed deck as the human deck, using real DOM setup and normal AI replies.
- PR and published workflows run these tests plus service-worker-enabled offline
  and online restoration. Published bytes and deployment are checked separately.

Formal 1945 DB, fixed decks, image registry, approved core modules and save schema
are unchanged. Chromium Pixel 5 emulation is not physical Android verification.

Selection candidate stage flags are projected from the verified reference facts,
not editable snapshot hints. A regression test changes a deck evolution's Basic
hint and verifies that a forbidden two-card selection is rejected atomically and
the UI candidate still carries the official stage. This guards both the shared
selector and authoritative runtime checks without modifying the saved card.
