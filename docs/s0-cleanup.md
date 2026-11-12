# S0 cleanup and unresolved work

[Status matrix](status-matrix.md) is the sole capability status authority.

## Completed in this audit

- Inventoried product/cross-cutting capabilities, every original frontend contract
  decision and every additional registered FastAPI route. Live/release columns
  remain no without actual provider evidence and explicit approval.
- Reconciled endpoint decisions against source handlers; removed obsolete proposed
  vendor order/reservation creation HTTP endpoints from the implementation target.
- Documented the full original B1 catalogue/settings gap list and S1 acceptance.
- Archived the old F0–F7 sample contract prose and B0 gap comparison as historical,
  not competing current-status documents. Current contract declarations stay generated.
- Replaced old roadmap sequencing/universal-cursor/universal-idempotency promises
  with current evidence and limitations. Updated phase guides to point to the matrix.
- Fixed hard-coded role-matrix test count generation to use the actual matrix size.
- Fixed editable API package discovery (`app*` only). Previously `pip install -e
  './api[test]'` failed with multiple top-level packages `app`/`evals`.

## Legacy-brand rename audit

Tracked code/docs search before cleanup found only test artifact locations:

- `tests/insights-mobile.mjs`: `/tmp/sift-f6` → `/tmp/selvora-f6`.
- `tests/restore-native.test.mjs`: temporary prefix `sift-restore-` → `selvora-restore-`.

No database/schema identifiers, encryption contexts, provider references, receipts,
customer history or committed historical snapshots were rewritten. Remaining
legacy-name mentions in this document intentionally record this rename audit.

The assigned branch `arena/720fa19c-sift` and checkout directory `/home/user/Sift`
retain the old name: Arena fixes branch identity and the checkout root must not be
renamed. Historical commit objects/PR URLs are immutable evidence, not branding.
The configured GitHub remote is already `CalebPiusC/selvora`.

## Unfinished — not silently included in S0

**S1:** new catalogue photo/storage/extraction/batch/detail/update/archive/variant/
stock endpoints, full settings/preferences and actual API-backed browser coverage.
Only the restricted typed-edit/policy subset exists. See B1 audit.

**S2:** Gemini wording-only writer, multilingual generation under unchanged B3
verifier/lanes, safe fallback, 200-message database-backed-number evaluations and
wording-call token/cost ledger. No such writer was added in S0.

**Existing release blockers:** physical retention/deletion, real provider acceptance,
paging/PITR configuration, actual mobile checks and real signup-to-receipt demo.
The no-go decision is unchanged. Do not remove a truthful Sample data banner merely
to make a sample-only screen look production-connected.
