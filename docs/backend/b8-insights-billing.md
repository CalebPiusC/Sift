# B8 — insights, billing and usage

## Payment authority

`PATCH /v1/billing/selection` records preference only. Owner-only
`POST /v1/billing/checkout {offerId}` snapshots the offer and initializes Paystack.
It does **not** grant entitlements. A signed `charge.success` at the existing
`/v1/webhooks/paystack` endpoint creates durable work. The worker independently
calls Paystack transaction verification and checks reference, integer amount,
NGN currency, customer email, transaction ID and recurring plan. Only then does
an append-only payment entry and entitlement update commit atomically.

Duplicate references/transaction IDs cannot grant twice. Initializations with
uncertain outcomes require reconciliation rather than a blind new charge.
There is no grant endpoint in the browser. Configure `PAYSTACK_SECRET_KEY` only
on the server. No live Paystack requests were made during development.

Offers are operator-managed database rows, not fabricated commercial prices.
Set `paystack_plan_code` for monthly/yearly/volume recurring offers. Checkout
checks the remote plan price/currency/interval. Yearly plans grant 12 months;
volume tiers are separately configured monthly plans. Bundle offers are one-off
payments granting the snapshotted conversation credits. Recurring charges are
routed by previously verified customer code + plan, only if unambiguous across
vendors, then independently verified before renewal. Ambiguous routes fail closed
and require operator reconciliation. Plan changes/overlapping subscriptions and
provider cancellation/self-service management are not implemented: operators
must cancel superseded Paystack subscriptions to avoid overlapping charges.

## Metering definition and limit behaviour

- Default trial: 14 days from business creation, 100 AI-handled conversations per
  UTC calendar month. Existing test/migration rows with no trial end derive it
  from billing-account creation. Trial is not restarted on login.
- One conversation is charged once per vendor/calendar month when AI handling is
  admitted. Worker retries and multiple inbound messages in that conversation do
  not charge again. Failed downstream deliveries can still consume that admission.
- Monthly quota also resets monthly for yearly subscriptions. Expired paid
  periods admit no new quota-backed conversations. Previously admitted
  conversations remain covered through the meter month.
- Once quota is exhausted, one bundle credit admits one new conversation.
  Account/meter row locks serialize concurrent checks and prevent overspend.
- At 80% and 100%, durable manager/owner notifications are deduped per meter.
  At the limit, inbound customer messages are still persisted and visible. The
  reply engine pauses them with `ai_quota_limit_vendor_reply_required`; manual
  vendor replies remain available. Already-queued AI sends also check admission.
  These messages are not automatically replayed after upgrade (avoid stale sends).
- Quota applies to AI conversation handling, not ingestion or vendor replies.
  Media transcription is preprocessing and is cost-tracked, not separately quota
  blocked; add separate media/token abuse budgets before broad live deployment.

## Event-derived insights

`GET /v1/insights?from=YYYY-MM-DD&to=YYYY-MM-DD` is owner/manager-only. Dates
are inclusive Lagos days, at most 367 days. The ledger is `domain_events`.
New events snapshot sender/channel and frozen paid line names/quantities.

Funnel = conversations whose first event falls in the range; each stage counts
conversations that ever reached it by the range end. A later stage never erases
historical stages. Response time = first pending customer event to next actual
reply-sent event, excluding queued drafts; pending messages before the range are
included when their response lands in range. AI/vendor share counts distinct
conversations per responder: shared conversations appear in both groups.
Revenue = gross order-paid ledger amounts (not net refunds); top products use
paid line snapshots; hours count inbound events in two-hour Lagos buckets.
Pre-migration events without snapshots remain unknown rather than fabricated.
Current implementation reads the ledger up to the end date; large tenants need
SQL/materialized aggregation or pagination before scale deployment.

## AI cost visibility

Successful Gemini translation and audio transcription record vendor/model,
operation, prompt/output token usage, estimated USD cost and pricing version.
Configure `AI_INPUT_USD_PER_MILLION`, `AI_OUTPUT_USD_PER_MILLION` and
`AI_PRICING_VERSION` for the configured model using your provider contract.
Missing provider usage/rates remain unknown, never falsely zero. `/v1/billing`
includes estimated totals and unknown-call counts. This is not a provider invoice
or guaranteed margin: failed calls, hidden reasoning tokens, cache/audio tariff
breakdowns, FX, tax and payment fees need reconciliation. Local deterministic
reply generation makes no LLM call. Provider cost import/reconciliation and
cross-model price schedules remain follow-up work.

## Reproducible acceptance/demo

Run `node --test tests/b2-native.test.mjs`. `tests/helpers/b8_checks.py` exercises
real PostgreSQL/Redis, signed webhook ingress and the actual durable worker with
only Paystack verification mocked. It proves selection/ingress alone do not
upgrade, verified processing upgrades, replay grants once, 80/100 warnings,
conversation dedupe, preserved inbound messages at quota and bundle debit.
`pytest api/tests/test_billing.py` checks strict payment matching.

Billing UI in API mode exposes secure checkout; mock mode stays clearly labeled
and never charges. Production provider acceptance, recurring lifecycle sandbox
coverage and broader concurrency/negative-role tests remain required before
turning on commercial billing. B7 unfinished frontend/deletion work and B6
platform approval work are unchanged by this phase.
