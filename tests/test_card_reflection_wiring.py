"""Static guardrails for card-state -> screen reflection. Not a browser E2E test."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
UI = (ROOT / "ui" / "mobile.js").read_text(encoding="utf-8")


class CardReflectionWiringTests(unittest.TestCase):
    def test_engine_change_triggers_render(self):
        self.assertIn("onChange:change=>", UI)
        self.assertIn("render();},onSessionChange:", UI)

    def test_hand_is_rendered_from_current_player_hand(self):
        self.assertIn("you.hand.map(c=>cardHTML(c,s,you,true))", UI)
        self.assertIn("$('hand-count').textContent=you.handCount+'枚'", UI)

    def test_bench_and_active_use_current_snapshot(self):
        self.assertIn("p.bench[i]?cardHTML(p.bench[i],s,p)", UI)
        self.assertIn("p.active?cardHTML(p.active,s,p)", UI)

    def test_attached_energy_uses_card_instance_state(self):
        self.assertIn("card.energyCards?.length", UI)
        self.assertIn("for(const energy of card.energyCards)", UI)

    def test_failed_dispatch_does_not_claim_success(self):
        self.assertIn("if(!result.ok){toast(", UI)
        self.assertIn("if(result.viewError)toast(", UI)

    def test_restore_uses_port_and_rerender_hook(self):
        self.assertIn("port.restoreSession(await store.read(entry.matchId))", UI)
        self.assertIn("onChange:change=>", UI)


if __name__ == "__main__":
    unittest.main()
