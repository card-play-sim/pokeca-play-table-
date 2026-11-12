# G-BASE-008 validation scope

PR #27 started at e40397a with 22 successful checks. Its original Chromium
match runner tapped bench placement, prizes and pending reference choices, but
used direct UI-port dispatch for most ordinary actions. Source-contract regex
checks did not demonstrate search, switch or ability target dialogs.

`tests/test_g_base_008_browser.py` now loads controlled mid-game fixtures made
from unchanged fixed decks and official-text-backed validation references. It
then uses Chromium DOM taps for all tested effects:

- Search: Pokepad, Poffin, Cyrano, Hilda, Brock's Scouting and Akamatsu.
  Checks engine candidate count, cancel without mutation, selected physical IDs
  leaving the deck and arriving in hand/bench/attached energy, trainer discard,
  supporter limit, physical-card conservation and exact reload restoration.
- Switch: Pokemon Switch and Boss's Orders. Checks the selected physical ID
  becoming Active, former Active moving to bench, conservation and exact reload.
- Targeted ability: Munkidori. Selects source, opposing bench target and three
  counters, confirms the ability and verifies damage 40 -> 10 / 0 -> 30,
  conservation and exact reload.

Akamatsu exposed a shared selector race: HTMLDialogElement.close queues its
close event. Resolving the selector Promise synchronously allowed the next
selector to register its cancel listener before that old event fired. Both
shared card selectors now resolve after the close event completes. The new
multi-stage DOM test fails before this fix and passes after it.

The PR workflow runs this focused matrix, the existing two seeded complete
reference matches and service-worker-enabled offline/online save restoration.
The published-mobile workflow runs the same matrix against the existing Pages
URL, as well as release byte verification and the existing browser tests.

Limitations: controlled fixtures are explicitly distinct from naturally reached
match states; complete-match coverage remains the separate seeded test. These
are validation references, not approval of adopted fixed-deck print IDs. Pixel 5
Chromium emulation is not physical Android verification. Browser profiles are
isolated; existing user saves and save schema are untouched. Formal 1945-card
data, fixed deck manifests, image registry and engine contracts are unchanged.

The 64-seed cross-family rejection suite hit the offline runner's 120-second
budget twice on GitHub-hosted runners. It now shares the existing bounded
300-second budget for long seeded workloads; seeds and assertions are unchanged.
