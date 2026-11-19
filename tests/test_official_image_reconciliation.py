"""Regression for distinct official IDs sharing numbers and numberless prints."""
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('reconcile', ROOT / 'tools/reconcile-official-image-search.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class Network:
    def __init__(self, body):
        self.body = body

    def fetch(self, url, mime):
        return self.body.encode()


def candidate(ident):
    return {'candidate': {'cardID': ident, 'cardNameAltText': 'カード',
                         'cardThumbFile': f'/assets/images/card_images/large/M-P/{ident.zfill(6)}_T_CARD.jpg'},
            'searchEvidence': {'url': 'official', 'sha256': 'a' * 64}}


def html(ident, number='001 / M-P', image_ident=None):
    target = image_ident or ident
    return (f'<meta property="og:url" content="https://www.pokemon-card.com/card-search/details.php/card/{ident}/regu/XY">'
            '<h1 class="Heading1 mt20">カード</h1><div class="LeftBox">'
            f'<img class="fit" src="/assets/images/card_images/large/M-P/{target.zfill(6)}_T_CARD.jpg">'
            f'<div class="subtext"><img class="img-regulation" alt="M-P">{number}</div></div>')


class OfficialImageReconciliation(unittest.TestCase):
    def test_equal_numbers_preserve_distinct_ids(self):
        first = MODULE.verify(candidate('1'), Network(html('1')))['record']
        second = MODULE.verify(candidate('2'), Network(html('2')))['record']
        self.assertEqual(first['cardNumber'], second['cardNumber'])
        self.assertNotEqual(first['officialCardId'], second['officialCardId'])
        self.assertNotEqual(first['imageSourceUrl'], second['imageSourceUrl'])

    def test_numberless_card_preserves_observed_identity(self):
        row = MODULE.verify(candidate('1'), Network(html('1', 'M-P')))
        self.assertNotIn('cardNumber', row['record'])
        self.assertEqual(row['evidence']['officialNumberLabels'], ['M-P'])

    def test_missing_expansion_logo_is_not_invented(self):
        body = html('1', '').replace('<img class="img-regulation" alt="M-P">', '')
        row = MODULE.verify(candidate('1'), Network(body))['record']
        self.assertNotIn('set', row)
        self.assertNotIn('cardNumber', row)

    def test_mismatched_image_rejected(self):
        with self.assertRaisesRegex(ValueError, 'SEARCH_DETAIL_IMAGE_MISMATCH'):
            MODULE.verify(candidate('1'), Network(html('1', image_ident='2')))

    def test_ambiguous_name_rejected(self):
        with self.assertRaisesRegex(ValueError, 'NAME_OR_IMAGE_AMBIGUOUS'):
            MODULE.verify(candidate('1'), Network(html('1') + '<h1 class="Heading1">別のカード</h1>'))


if __name__ == '__main__':
    unittest.main()
