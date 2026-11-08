"""Static guard against AI diagnostics overflowing the fixed-height mobile header.

Run: python3 -m unittest discover -s tests -p 'test_mobile_header_layout.py'
This checks source contracts, not Android visual rendering.
"""
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class MobileHeaderLayoutTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = (ROOT / "index.html").read_text(encoding="utf-8")
        cls.css = (ROOT / "ui/mobile.css").read_text(encoding="utf-8")
        cls.js = (ROOT / "ui/mobile.js").read_text(encoding="utf-8")

    def test_turnbar_is_fixed_height(self):
        self.assertIn('class="turnbar"', self.html)
        self.assertIn('grid-template-rows:58px 28px', self.css)

    def test_diagnostics_do_not_append_multiline_report(self):
        start = self.js.index("function showAiPerformance(message)")
        end = self.js.index("async function runOpponentPracticeTurn()", start)
        section = self.js[start:end]
        self.assertIn("button.dataset.report=message", section)
        self.assertIn("button.title=message", section)
        self.assertIn("button.textContent='AI計測'", section)
        self.assertNotIn("el.textContent=message", section)
        self.assertNotIn("appendChild(container)", section)

    def test_service_worker_and_html_build_match(self):
        import re
        sw = (ROOT / "sw.js").read_text(encoding="utf-8")
        html_versions = set(re.findall(r"\?build=(\d+)", self.html))
        cache_versions = set(re.findall(r"pokeca-first-playable-v(\d+)", sw))
        sw_versions = set(re.findall(r"\\?build=(\\d+)", sw))
        self.assertEqual(len(html_versions), 1, "HTML assets must share one build")
        self.assertEqual(html_versions, cache_versions, "SW cache must match HTML build")
        self.assertEqual(html_versions, sw_versions, "SW assets must match HTML build")

    def test_header_overflow_guards_exist(self):
        self.assertIn(".turnbar{display:flex", self.css)
        self.assertIn(".turnbar #game-note{display:none}", self.css)
        self.assertIn(".topbar .brand{min-width:0", self.css)
        self.assertIn(".topbar .top-actions{flex:0 0 auto", self.css)


if __name__ == "__main__":
    unittest.main()
