# Fixed 120 image inspection: BLOCKED

The fixed deck manifest has 120 copies, 56 deck rows and 45 names. Every row is
still `UNCONFIRMED`: no edition-specific deck export, deck-code mapping, set or
card number was supplied. The original formal 1945 ZIP/catalog was not available
in the workspace or the connected source repositories. Its existing candidate
extracts were read without modification.

All 45 names were queried against the official search's first page, using the
endpoint observed in the official search-page JavaScript. The complete returned
JSON, URL, response digest and stored-content digest are retained under
`data/fixed-deck-search-evidence/`. Pagination is explicitly marked incomplete
when applicable; the first page is not represented as a complete catalog.
Some source names have no exact match. They are retained without silently
renaming them or inventing an official ID.

A single search result does not establish the edition originally intended by a
name-only deck. Identical card text across prints likewise does not identify an
edition. No deck ID was adopted, including for those names with a single result.
The 45-name decision record is `data/fixed-120-print-resolution.json`.

## Verified image-reference work

Twenty existing in-scope registry references missing set/number evidence were
rechecked against official detail HTML. Three additional, unambiguous search
reference candidates were independently checked against their detail pages:

| Official ID | Name | Set | Number |
| --- | --- | --- | --- |
| 45786 | ハンディサーキュレーター | SV6 | 095/101 |
| 47796 | 危ない廃墟 | M1L | 063/063 |
| 48710 | 夜の鉱山 | M2a | 188/193 |

These are verified **reference prints**, not adopted deck editions. All 23 were
passed through the existing automation with its per-record checkpoint, merge,
registry readback, receipt and progress verification. The registry now has 30
references. Every original field of the preceding 27 entries and their evidence
is preserved; `tests/fixtures/original-27-image-registry.json` records that
baseline. No official image bytes were downloaded as files or added to Git.
The bounded manifest and result are `data/fixed-deck-reference-candidates.json`
and `data/fixed-deck-reference-registration.json`.

## Display inspection

`tests/test_fixed_deck_browser_images.py` uses Chromium with the Pixel 5 Android
profile. It loads the actual app and real official images, waits for registry and
session initialization, and scrolls every manifest row into view. It checks HTTP
200/image content type, image decoding, natural dimensions, CSS visibility and
the painted element under the image center. It compares each **deck row's**
ID/name/set/number/URL, never collapsing same-name rows into one result.
No screenshot or image body is saved.

Initial external-image failures in this execution environment were
`ERR_CERT_AUTHORITY_INVALID`: Chromium did not trust the session proxy CA.
The inspection pins only the public key of the inherited `NODE_EXTRA_CA_CERTS`
CA certificate. It does not disable all certificate checks or change the app's
network behavior. A normal Android environment does not need this test setting.

The JSON result is `data/fixed-120-display-inspection.json`. Successfully decoded
candidate previews are separate from exact deck-print display. An unconfirmed
row, placeholder, wrong URL, failed decode or hidden image cannot pass. Exit 2
means the fixed deck remains incomplete; offline regression success does not
turn that result into production success. Physical Android is not verified.

The UI waits for registry loading before opening its list, labels reference
previews, retains an original placeholder on load failure, and exposes separate
confirmed/pending/preview counts. Its JSON export includes print identities and
per-row results. The service-worker version was advanced for the new audit asset.

The fixed decks and match engine are unchanged. To complete exact 120-card
identification, an edition-specific source binding is still required. Until
that exists, the official fixed-deck match/display remains blocked.
