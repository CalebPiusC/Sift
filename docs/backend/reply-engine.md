# B3 — fact-backed reply engine

## Status and boundary

Implemented locally with a **deterministic wording adapter**, not a connected generative model.
The swappable `WordingWriter` interface receives a typed detection, fact sheet and vendor tone;
it cannot choose business facts. Customer content is never interpolated into a system prompt or
executed as a tool instruction. There is no external model dependency or invented model output.

**Live Gmail acceptance is still pending.** No user-authorized Google account or hosted runtime
was available in this session. Tests use real PostgreSQL and Redis but fake the Gmail boundary.
This is evidence of tested safeguards, not a guarantee that all possible unsafe natural language
has been solved. Keep the conservative verifier and review unsupported phrasing.

## Modules / flow

- `replies/core.py`: deterministic intent/language/confidence, lane policy, integer-kobo
  negotiation, wording protocol/default templates and conservative claim verifier.
- `replies/facts.py`: **get_product_facts is the only business-fact lookup**. It reads current
  tenant catalogue/variants, unreserved stock, configured delivery fees and customer-owned order
  facts. It derives explicit quantities/totals. Facts are never sourced from customer claims,
  old model replies, offered prices, screenshots or the wording adapter.
- `replies/service.py`: durable inbound processing, stored lane/reason/language/confidence,
  fact snapshots/hashes, once-only outgoing intent, blocked-reply approval and pre-send recheck.
- `replies/api.py`: approval list/decision and safe reply-policy settings.
- Migration006 adds typed columns/triggers to existing tables; no new application tables.
  Inbound jobs are scheduled only for mail dated after vendor activation. History sync does not
  auto-reply to a pre-activation mailbox. No replay of human-handled messages on hand-back.

## Exact policy

Auto allowlist: greeting, price, availability, variants, delivery_info, order_status, alternatives.
Settings may select a subset or restore members of this allowlist. There is no blanket auto or
approve-everything flag. Refunds, complaints, bulk, custom, unknown, confidence below0.75,
unsupported facts and injection/impersonation/payment claims need approval. Discount requests
below floor always need review. Within-floor automatic negotiation is a separate explicit opt-in,
off by default. Per-intent disabling never enables unsafe intents.

Confidence is a transparent **rule score**, not a calibrated model probability: supported
English/Pidgin/mixed patterns score0.98, unknown/other language0.50. Hostile patterns are routed
to approval regardless of confidence. Tone combines vendor preference and detected chat formality;
Pidgin wording is used only for Pidgin/mixed chats with the vendor's Pidgin-friendly setting.
Other languages do not receive an invented translation. Customer voice transcripts use the same
policy; no vendor audio recording UI has been added.

Product identity must match an unambiguous catalogue name (and requested variant, when matched).
No fuzzy guesses from one product to another; ambiguous/missing matches need review. Catalogues
above500 candidates fail closed for product selection. Alternatives use current same-kind
in-stock catalogue facts; absent alternatives need review. Unknown stock is not asserted available.
Active unexpired reservations are subtracted from physical stock. Made-to-order/custom fulfilment
promises are not invented.

Negotiation operates in integer kobo: midpoint of offer/list, nearest₦100 with half-up rounding,
then clamp to floor/list. Neither customer nor wording adapter can set the floor. Approval is
not a licence to fabricate an off-catalogue price: edit using verified facts or change the source
catalogue through an authorized catalogue flow first. This increment does not add missing B1
catalogue mutation HTTP endpoints.

## Verifier and last-mile send

Recognizes ₦15,000, N15,000, NGN2500, 15k, N1.5k and decimal naira, independently of stock counts.
Money spans are removed **before** stock extraction; “₦15,000 available” is never treated as
15,000 units. Each monetary clause must match a supported unit-price/negotiated-price,
city-specific delivery-fee or derived-total grammar. A coincidentally equal number from another
fact does not justify it. Unsupported subjects, unit bases, signs, bare quantities and spelled
stock quantities fail closed. A quantity must equal the explicit request; totals include an
explicit known delivery fee, not an assumed free delivery. Payment assertions require a current
vendor/verified-Paystack payment source, never a customer screenshot.

Direct manual vendor sends also pass the final numeric verifier; the reply API is not a bypass.
Templates are intentionally constrained. Free-form approved wording outside supported factual
grammars may be blocked even if a human could consider it harmless. Edit to supported wording;
do not bypass the verifier. The verifier is not a universal natural-language theorem prover.

Immediately before a new provider POST, the worker:
1. Fences its current lease and locks the conversation.
2. Rechecks takeover, approval cancellation, business hours and automatic-lane eligibility.
3. Calls get_product_facts again; compares snapshots and re-verifies the final text.
4. Blocks stale/unsupported text and creates/refreshes an approval, without calling Gmail.
5. Holds conversation/current-fact locks across the bounded provider send. Catalogue/variant,
   reservation (via the existing product lock), settings and takeover writes serialize around
   that send. This prioritizes safety over write throughput; the bounded501-row catalogue read
   is not a high-volume catalogue search index.

Approval decisions also lock/recheck current facts. A stale card refreshes facts, returns409,
and needs a second explicit decision. Repeated identical decisions do not enqueue twice;
conflicting second decisions return409. A later stale approved outgoing reply becomes a **new**
review without overwriting the original decided approval. Approval status sent/edited describes
the decision, while the outgoing bubble separately shows queued/sending/sent/failed/blocked.

B2 ambiguous-send reconciliation still applies: an uncertain POST is not blindly retried. A
provider-accepted send cannot be recalled by a subsequent takeover, price change or approval
rejection. Hand-back/timeout resumes unsent deferred jobs, not past human-handled inbound work.

## APIs and UI

All user routes require validated Supabase session and active vendor membership:
- GET `/v1/approvals?status=pending&limit=100` (agent thread-assignment restrictions)
- POST `/v1/approvals/{id}/decision`: action send/edit/reject, optional editedReply
- GET/PATCH `/v1/settings/reply-engine`: enabled, autoIntents, autoNegotiation, tone
  (owner/manager writes; unsafe intent names are rejected)
- Existing PATCH `/v1/conversations/{id}/human-mode` and durable timeout jobs are retained.

API mode uses real approval/decision/takeover endpoints. Supabase realtime also invalidates
approvals; local409 mutation conflicts refetch cards. Gmail original-thread links now accept only
`https://mail.google.com` as the email HTTPS host (mailto remains supported). Settings → Replies
has a dedicated real API policy panel, independent of unfinished B1 general settings endpoints.
Other unfinished business/settings screens still honestly show unavailable API errors.

## Run / activate

Apply migrations001–006 with the migration owner (Compose mounts006 for **new** volumes only).
Keep the restricted NOINHERIT runtime login and B2 keyring/Google/Redis configuration documented
in [gmail-pipeline.md](gmail-pipeline.md). Start API/worker/web as there. The engine is **off for
every vendor by default**. In API mode use Settings → Replies to enable it for future enquiries,
choose safe intents/tone and leave auto-negotiation off unless explicitly wanted. Existing
catalogue facts must be populated through an authorized supported path; no sample fallback.

## Evaluation / tests

- `npm run eval:replies`: prints all120 corpus decisions and every blocked automatic/proposed
  reply. Includes English/Pidgin/mixed/other, voice transcripts, hostile role/instruction attempts,
  payment claims and tricky monetary/stock formats. Includes intentionally unsafe drafts that
  must fail verification. Fails on an unbacked emitted price/stock claim or expected-lane regression.
- Both root `npm run build` and workspace `npm run build -w web` run that gate **before**
  Next's production build through the web prebuild script.
- `PATH="$PWD/.venv/bin:$PATH" npm run test:replies`: evaluation + Python + native PostgreSQL/Redis.
- Native integration exercises scheduled reply processing, actual worker fake-Gmail sends,
  once-only send/edit/reject, below-floor approval, stale-card refresh, stale approved/automatic
  reply blocking, holding-job scheduling, queued-send takeover/hand-back and voice transcripts.
  The existing integration also kills/restarts a real worker child process and recovers leases.
- `npm run test:all`, Ruff and production build remain the full regression checks.

Remaining real acceptance: deploy/authorize Gmail, seed genuine vendor facts, enable this vendor's
reply policy, email a price enquiry and a below-floor discount enquiry, observe correct auto reply
and live approval card, verify stale-fact/takeover behavior against the provider. Hosted Supabase
RLS/realtime verification remains separate and pending. No real email claim has been made.
