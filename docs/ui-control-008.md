# UI-CONTROL-008

Base: main 40124dd222aff2720c2fea3b0a3acc07e2f37c37. Branch: feature/ui-control-008. Release: v248.

The existing PWA keeps its UI port, engine, AI and resume format. Presentation helpers in `ui/table-components.js` derive marks only from explicitly legal hand/Pokémon options. Unknown or rejected actions have no mark. Hand-use abilities enter the same action menu, with legal operations first. Physical attached energy cards are grouped by basic type or special name; this does not calculate energy supply.

The portrait board uses white/gray surfaces, separates the two fields and central stadium, reserves rows for controls/hand/log, and uses the actual dynamic viewport rather than subtracting a speculative 72px. Deck/prize backs reuse the existing blue/gold back motif as a local SVG (original app artwork, not an official card image). The canonical prize slot list supplies taken positions; the existing prize dispatch determines ownership and eligibility. The new SVG and presentation module are included in the atomic PWA release.

Long press opens a separate, read-only zoom dialog for field, hand, gallery, opening and stadium artwork. The original image aspect is preserved; movement/cancel aborts the gesture and the following click is suppressed. Tap continues to use existing selection/actions. Details, restrictions, full history, official image provenance and manual seven-card opening remain available. Existing command-based movement/shuffle animations and player-colored logs are reused.

## Boundaries and checks

- No edits to engine source/bundle, AI, official DB, fixed 120 deck list, official image registry or save schema.
- Open common-foundation PRs #18/#22/#23 edit engines/workflows; this branch does not. They were inspected, not merged.
- Owner PR #19 overlaps release headers in index.html/ui/mobile.js/sw.js. Its branch is untouched. Future integration must regenerate the release manifest after resolving the version headers; the image-registry owner retains those changes. PR #28 is untouched.
- Effect matrix groundwork is separately preserved on feat/control-005-effect-evidence-matrix (d028319). Its controlled reference executions are not formal adopted-print verification. All-card completion is not claimed.
- `tests/test_ui_control_008_browser.py`: four portrait sizes (320×568, 360×640, 393×851, 412×915), legal marks against canonical options, deck/prize imagery/counts, long press without mutation, attach/move/discard energy, hand ability through DOM, exact save/reload and gallery zoom. Failures have structured JSON evidence.
- Existing candidate/public workflows also retain both fixed-deck manual opening, searches/switches/counters, evolution/KO/prizes, complete AI matches, byte integrity, v246 persistent-profile upgrade and offline resume tests.
- Chromium Pixel 5 emulation is not physical Android verification.
