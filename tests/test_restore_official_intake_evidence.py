"""Offline proof recovery regression: integrity, no overwrite and path safety."""
import importlib.util
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/restore-official-intake-evidence.py"
spec = importlib.util.spec_from_file_location("restore_intake_evidence", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class RecoveryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        old = module.ROOT
        module.ROOT = self.root
        self.addCleanup(setattr, module, "ROOT", old)
        self.rel = "data/effect-extensions/evidence/45944.json"
        self.proof = {"html": "<p>official</p>", "url": "https://www.pokemon-card.com/card-search/details.php/card/45944"}
        self.proof["htmlSha256"] = hashlib.sha256(self.proof["html"].encode()).hexdigest()
        self.raw = json.dumps(self.proof).encode()
        self.record = {"officialCardId": "45944", "officialPageUrl": self.proof["url"], "source": {"path": self.rel, "sha256": self.proof["htmlSha256"]}}
        self.checkpoint = self.root / "checkpoint.json"
        self.checkpoint.write_text(json.dumps({"records": [self.record]}))

    def test_missing_restored_and_existing_not_overwritten(self):
        with patch.object(module.subprocess, "check_output", return_value=self.raw) as fetch:
            self.assertEqual(module.recover("test-ref", self.checkpoint), 1)
            self.assertEqual(module.recover("test-ref", self.checkpoint), 0)
            fetch.assert_called_once()
        self.assertEqual((self.root / self.rel).read_bytes(), self.raw)

    def test_bad_proof_fails_without_write(self):
        bad = json.dumps({**self.proof, "html": "tampered"}).encode()
        with patch.object(module.subprocess, "check_output", return_value=bad):
            with self.assertRaisesRegex(ValueError, "EVIDENCE_INTEGRITY_CONFLICT"):
                module.recover("test-ref", self.checkpoint)
        self.assertFalse((self.root / self.rel).exists())

    def test_later_conflict_does_not_partially_restore_earlier_proof(self):
        second = {**self.record, "officialCardId": "45945",
                  "source": {**self.record["source"],
                             "path": "data/effect-extensions/evidence/45945.json"}}
        self.checkpoint.write_text(json.dumps({"records": [self.record, second]}))
        corrupt = json.dumps({**self.proof, "html": "tampered"}).encode()
        with patch.object(module.subprocess, "check_output", side_effect=[self.raw, corrupt]):
            with self.assertRaisesRegex(ValueError, "EVIDENCE_INTEGRITY_CONFLICT"):
                module.recover("test-ref", self.checkpoint)
        self.assertFalse((self.root / self.rel).exists())
        self.assertFalse((self.root / second["source"]["path"]).exists())

    def test_merge_retains_current_proofs_and_resolves_obsolete_blockers(self):
        current = {"schemaVersion": 1, "records": [self.record],
                   "blocked": [{"officialCardId": "45946", "reason": "COLLECTOR_EXCEPTION", "attempts": 1}]}
        self.checkpoint.write_text(json.dumps(current))
        target = self.root / self.rel
        target.parent.mkdir(parents=True)
        target.write_bytes(self.raw)
        saved = {"schemaVersion": 1, "records": [],
                 "blocked": [{"officialCardId": "45944", "reason": "COLLECTOR_EXCEPTION"},
                             {"officialCardId": "45946", "reason": "COLLECTOR_EXCEPTION", "attempts": 2}]}
        with patch.object(module.subprocess, "check_output", return_value=json.dumps(saved)):
            self.assertEqual(module.merge_checkpoint("test-ref", self.checkpoint), 0)
        self.assertEqual(json.loads(self.checkpoint.read_text()), {
            **current, "blocked": [saved["blocked"][1]]})
        self.assertEqual(target.read_bytes(), self.raw)

    def test_merge_fails_closed_on_disagreeing_official_record(self):
        current = {"schemaVersion": 1, "records": [self.record], "blocked": []}
        self.checkpoint.write_text(json.dumps(current))
        saved = {**current, "records": [{**self.record, "name": "conflict"}]}
        with patch.object(module.subprocess, "check_output", return_value=json.dumps(saved)):
            with self.assertRaisesRegex(ValueError, "CHECKPOINT_RECORD_CONFLICT"):
                module.merge_checkpoint("test-ref", self.checkpoint)
        self.assertEqual(json.loads(self.checkpoint.read_text()), current)

    def test_path_substitution_rejected(self):
        self.record["source"]["path"] = "../../data/official-image-registry.json"
        self.checkpoint.write_text(json.dumps({"records": [self.record]}))
        with self.assertRaisesRegex(ValueError, "UNSAFE_EVIDENCE_PATH"):
            module.recover("test-ref", self.checkpoint)

if __name__ == "__main__":
    unittest.main()
