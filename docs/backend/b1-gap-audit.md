# Original B1 endpoint-by-endpoint audit (S0)

**Authority:** [status matrix](../status-matrix.md). Inspected source, not a claim
of live acceptance. Route declarations are exhaustively generated in
[route audit](route-audit.md). Frontend adapter URLs do not establish server support.
S1 is in progress. The initial draft adds settings read and own-member preference writes only; all remaining gaps below still apply. See [S1 progress](../s1-progress.md).

## What exists and exactly what is missing

All paths below use FastAPI `/v1`; Next's same-origin proxy is `/api/v1`.

| Original capability | Browser target / existing implementation | Exact missing work for S1 |
|---|---|---|
| Catalogue list | `GET /catalogue` is called by `web/lib/data/api.ts`; no route | Tenant-scoped list DTO, product/variant/photo joins, stable pagination, safe role checks and integration/browser tests |
| Catalogue search/category/stock filters | Same absent GET; mock catalogue filters only | Server filtering/search and correct pagination/filter binding; all four stock states; no cross-vendor matches |
| Catalogue detail | `GET /catalogue/{id}` absent | Authorized product details including current revision, variants and private photo resolution |
| Single create | No dedicated POST; UI single creation uses `createMany` | Support one reviewed item through the same durable batch transaction (no need to invent a second form); validate business facts and category fields |
| Batch create | `POST /catalogue/batches` absent; `CreateProductsInput.requestId` is memory dedupe in mock | Atomic 1–10 create, durable request/body binding, deterministic replay, mismatched request conflict, photos and audit/stock rows |
| Photo select/preview | Browser photo utilities/tests exist | Selection/resize is not upload; connect photo ownership and persisted IDs to reviewed drafts/products |
| Photo upload/private storage/read/delete | No catalogue media route/storage adapter; `product_photos` table stores metadata only | Binary validation/size/type, tenant-owned private storage, authenticated read/short-lived capabilities, cleanup/retention, no arbitrary URL fetching or public buckets; reject cross-tenant keys |
| Gemini photo extraction | `POST /catalogue/extractions` absent; mock drafts | Real Gemini vision request conditioned on tapped category, strict schema, untrusted-image/prompt controls, timeout/error handling and vendor token/cost accounting; no invented confirmed price/stock |
| Review extracted drafts | Mock category-specific cards in catalogue UI | Persist/authorize drafts and let vendor correct unknown facts; save only after explicit review; extraction must never mutate catalogue |
| Typed edit proposal | `POST /catalogue/text-proposals` exists in `whatsapp/api.py`, shared `instructions.py` | Currently restricted regex price/stock commands; proposals can be duplicated on retries. Define durable idempotency for app requests and supported complete editing scope |
| Typed confirm | `POST /catalogue/text-proposals/{pid}/confirm` exists | Member-bound ten-minute proposal and revision/once-only checks already exist. Variant edits explicitly 409; extend safely without removing stale/replay/role protection |
| Product update | `PATCH /catalogue/{id}` absent | Validate complete product DTO, immutable ownership, expectedRevision, audit and transaction; conflict on stale price/stock/category/variant edits |
| Variants | SQL data model/constraints and mock UI only | Create/update/remove/reconcile variants through real mutation, exact variant ownership, totals, floors and references; protect reservations/history |
| Stock correction | Non-variant typed edits exist; commerce sale/reservation ledger exists | General/variant stock editor; respect reserved quantities and ledger correctness; conflict handling, no negative stock or silent overwrites |
| Explicit restock | Planned `POST /catalogue/{id}/restock` absent | Choose documented endpoint or existing update action, explicit quantity/variant/revision, audited once-only ledger; trigger only opted-in restock work |
| Archive/unarchive | `PATCH /catalogue/{id}/archive` absent | Revision-checked authorized archive state; preserve historic order/receipt facts; exclude from facts/new selections appropriately |
| General settings read | `GET /settings` now composes persisted business/hours/fees and own-member preferences | Initial native-tested read exists; full API-backed browser acceptance and remaining general business mutation flows are pending |
| General settings update | `PATCH /settings` supports own-member preferences only | Per-field role checks (owner/manager business fields vs own preferences), validation, durable idempotency/conflict handling, atomic hours/fee edits and audit |
| Preferences | `client.settings.update({preferences, expectedPreferencesRevision})` now targets the own-member PATCH | Initial persistence/replay/revision/member-isolation implementation and native tests exist; full API-backed browser test remains pending |
| Reply-policy settings (not missing) | `GET/PATCH /settings/reply-engine` exist in `replies/api.py` | Preserve B3 allowlist/activation/floors. This route does not implement the general settings DTO |
| Every catalogue/settings screen using API | DataProvider selects one whole-app mock/API client; screens call that client | Remove dependency on absent routes; test actual FastAPI-backed UI for every screen. Adapter/mock test is insufficient |
| Sample banner | `provider.tsx` renders it **only when mode=mock** | It already disappears in API mode. Do not hide a sample banner while retaining mock data. If mixing modes is necessary, label each actual source truthfully |
| App input restriction | No vendor voice-recording flow found | Keep catalogue/settings photos, taps and typed text only. Incoming customer voice/WhatsApp helper are distinct from recording vendor voice inside the app |

## Existing partial typed-edit safeguards (do not regress)

`api/app/whatsapp/instructions.py::propose/confirm` validates active membership
through its API caller, binds proposals to the initiating member/vendor, expires
proposals, selects only offered candidates, checks the product revision, refuses
variant changes, enforces price floors and untracked-stock constraints, records
stock correction/audit and makes confirmed proposals once-only. Test evidence:
`api/tests/test_whatsapp.py::test_same_server_typed_parser_for_app_and_helper`
and `tests/helpers/b5_checks.py`. This is NOT a complete catalogue API.

## S1 acceptance contract

Use a new migration only if required; do not edit previously applied migrations.
Prove all of the following before marking matrix rows yes:

- Persistent private photo upload + reload/read/ownership denial + cleanup policy.
- Category-tapped real Gemini adapter with mocked-boundary tests; separately mark
  real-provider acceptance no until credentials/authorized live run are available.
- Batch retries return the original result, different body conflicts and failed
  batches do not partially insert. Test concurrent writes and revision conflicts.
- Owner/manager catalogue authority, agent denial, tenant isolation, per-member
  preferences and granular settings authorization.
- Variant/stock/reservation/archive behavior through actual server endpoints.
- Browser workflow against API data, no fallback to sample after error and no
  hidden sample banner over fictional data. No app voice controls.
- Short executable demo and exact tests, including the currently failing order UI
  regression noted in S0 validation rather than concealing it.

## S2 is a separate subsequent phase

`replies/core.py` has `WordingWriter` and deterministic `TemplateWriter`; the
service does not call a Gemini wording writer. Gemini transcription/translation
are different capabilities. The current evaluator uses a synthetic fact sheet;
it is not a 200-message database-backed Gemini evaluation.

S2 must preserve the current fact lookup, verifier (before queue AND pre-send),
lanes, approval rules and injection defenses. Add wording-only multilingual Gemini,
strict untrusted-conversation handling, deterministic fallback on timeout/failure/
kill switch, vendor token/cost evidence and 200 hostile/tricky evaluations. A
fallback must never bypass a global/vendor send pause. Unsupported claims/languages
must still fail closed; no promise of all-language verification without tests.
