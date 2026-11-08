"""Regression guards for failure propagation and bounded publication in Actions."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]

class OfficialImageWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.workflow = (ROOT / '.github/workflows/official-image-registry.yml').read_text()

    def test_collection_failure_is_not_ignored(self):
        self.assertNotIn('continue-on-error', self.workflow)
        self.assertNotIn('|| true', self.workflow)
        self.assertIn('run: node scripts/automate-official-images.cjs', self.workflow)

    def test_publication_requires_regressions_and_executed_collection(self):
        gate = next(line for line in self.workflow.splitlines() if 'steps.offline.outcome' in line)
        self.assertIn("steps.offline.outcome == 'success'", gate)
        self.assertIn("steps.functional.outcome == 'success'", gate)
        self.assertIn("steps.collect.outcome != 'skipped'", gate)
        self.assertIn('!cancelled()', gate)
        self.assertIn('node scripts/persist-official-image-results.cjs', self.workflow)

    def test_reference_success_does_not_claim_display_success(self):
        self.assertIn('report.runId===process.env.GITHUB_RUN_ID', self.workflow)
        self.assertIn('if(!current||!report.registrationPass)process.exit(2)', self.workflow)
        self.assertIn('Fixed 120 official image display: NOT_VERIFIED', self.workflow)
        self.assertNotIn('productionPass', self.workflow)

    def test_one_branch_serial_execution_and_failure_artifacts(self):
        self.assertIn('ref: feature/official-image-registry-automation', self.workflow)
        self.assertIn('cancel-in-progress: false', self.workflow)
        self.assertNotIn('pull-requests: write', self.workflow)
        self.assertNotIn('gh pr comment', self.workflow)
        self.assertIn('uses: actions/upload-artifact@v4\n        if: always()', self.workflow)
        self.assertNotIn('schedule:', self.workflow)

if __name__ == '__main__':
    unittest.main()
