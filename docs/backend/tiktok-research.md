# B6 pre-implementation decision: TikTok messaging

Research date: 10 November 2026. This is a feasibility report, not evidence that
Selvora or any vendor has TikTok approval. No B6 application code has been written.

## Finding

**Yes, an official API can reply to customers on behalf of an authorized, eligible
TikTok business account. It is not universal access.** TikTok's Business Messaging
API includes sending messages, listing conversations/messages and messaging webhooks.
The official overview describes real-time messaging and automated responses, including
an organic-to-paid approach—not a blanket paid-ads-only limitation. [1][2][3]

Ordinary Login Kit / Display API / content-posting access must not be mistaken for
Business Messaging permission. Meta approval does not establish TikTok entitlement.
Until separately approved and verified, Selvora must advertise TikTok as unavailable
for in-app messaging, not connected or AI-reply enabled. [1]

## Eligibility and approvals

Official access documentation states: [1]

- The developer needs an approved app and valid app ID, followed by Business Messaging
  access and the required data security/privacy review.
- Accounts need Advanced Access or Verified Business Account entitlement. General
  TikTok accounts are not eligible merely because they authorize an app.
- Accounts registered in the EEA, Switzerland or UK cannot use these messaging APIs.
- US-registered accounts additionally require US data security review and the USDS
  Addendum.
- For Rest-of-World accounts, the data security/privacy review is required. This is
  the relevant potential path for a Nigeria-registered vendor account, but residence
  in Nigeria does not prove the account's sign-up region or actual eligibility.
- TikTok Shop messages are a separate system; Business Messaging authorization does
  not grant access to Shop customer messages.

Before promising support, verify Selvora's approved product/scopes and each vendor's
actual account entitlement/registration region. The API reference includes an account
capability check; OAuth success alone is not proof that messaging will work. [1][2]

No developer dashboard or approval evidence was available during this research. No
application was submitted, fee accepted or provider account purchased.

## Messaging-window constraints

Partner implementation documentation reports a different policy from Meta's24-hour
window: user-initiated conversations, up to10messages in an initial48-hour window,
unlimited replies within48hours after a subsequent customer reply, and at most three
additional messages after inactivity for non-mutual-follow conversations. [4]

There is a documentation discrepancy worth preserving: respond.io summarizes its
integration as48hours with at most10consecutive messages until the contact replies,
without exposing the same full post-window allowance. [5] Do not copy one generic
WhatsApp/Meta window rule into a TikTok adapter, and do not implement the more permissive
exception from a secondary summary alone. Confirm the exact official limits and
capability responses available to Selvora at integration time; default to blocking
outside a verified permitted window. The current official portal lists the messaging
limits guide, but the full guide's current rules were not independently retrieved in
this research. No TikTok send-policy code is being shipped from these summaries.

## Costs: evidence and unknowns

- The reviewed official access/reference/overview pages do not provide a public
  per-message tariff or a firm commercial quote. **No published price found is not a
  contractual guarantee of free direct API access.** [1][2][3]
- respond.io explicitly says TikTok Business Messaging can be used for free within
  its channel documentation. That is useful partner evidence, not a binding TikTok
  price for Selvora's own integration. [5]
- A partner route may add subscriptions, seats, contact-based usage, integration/API
  plan requirements or a negotiated commercial agreement. Obtain a written quote
  that explicitly permits embedding/reselling in Selvora; a retail team inbox plan
  does not by itself establish that right. No unverified subscription price is used
  as Selvora's budget here.
- Direct integration still has engineering, security-review, hosting, storage,
  monitoring and AI-inference costs. Ads, if used, are a separate budget; the official
  overview does not establish that paid ads are required for all messaging. [3]

Commercial gate before live coding/launch: confirm API pricing and any required
partner/reseller costs in writing, plus processing/subprocessor terms and permissions.
Do not quote zero total cost or any naira conversion on current evidence.

## Options to choose before TikTok coding

### A — Direct API integration after eligibility/access confirmation

Apply/verify Business Messaging approval; verify eligible vendor accounts and current
send rules; obtain commercial terms; then implement official OAuth, webhooks,
conversation capability checks, the sandbox boundary and real acceptance tests.
This gives the best architectural fit with Selvora's adapter/engine but has an
unconfirmed approval timeline. We must not represent the API as unavailable in
principle, or already available to Selvora.

### B — Approved messaging partner

Evaluate a provider with authorized TikTok messaging and an API suitable for Selvora.
Confirm vendor coverage, current limits, commercial/reseller rights, data handling,
export/deletion and account ownership. Obtain a quote before implementation. Approval
and provider support still need verification; this is not a guaranteed shortcut.

### C — Honest manual fallback now; direct integration deferred (recommended)

Build a clearly labelled **Open in TikTok — manual replies only** card while TikTok
access remains unverified. Do not mark it connected or enable in-app sending. Use a
validated HTTPS TikTok profile/inbox destination and label whether it opens a generic
inbox or an exact thread; never manufacture an exact customer-thread URL.

Without authorized inbound events, Selvora cannot detect new TikTok DMs. Therefore:

- Do not fabricate incoming conversations, unread counts, alerts or delivery states.
- The notification part can only be a vendor-created reminder/manual task (or a
  future separately authorized event source), labelled accordingly.
- TikTok's own app notifications remain the real source of new-message alerts.
- No browser scraping, password collection, session-cookie use, unofficial automation
  or bypass of approval/region restrictions.

This fallback is justified by **unverified access for Selvora**, not a false claim
that TikTok has no reply API. It must be an explicit product choice before coding.

## B6 scope after the decision

Instagram/Facebook can share a Meta integration and sandbox while preserving separate
platform/account identities, messaging-window gates, webhook routing, connection/token
health and reconnect prompts. TikTok's selected option must remain separate from the
Meta approval path. The B6 done criterion is not yet met: this phase delivers research
only; Instagram/Facebook sandbox implementation and acceptance remain pending.

## Sources

[1]: https://business-api.tiktok.com/portal/docs/access-to-business-messaging-api/v1.3
[2]: https://business-api.tiktok.com/portal/docs/business-messaging/v1.3
[3]: https://business-api.tiktok.com/portal/docs/business-messaging-api-overview/v1.3
[4]: https://www.sprinklr.com/help/articles/engage-with-tiktok-direct-messages/engage-with-direct-messages-from-tiktok-company-accounts-to-profiles/68317e03c74d2f1a73934077
[5]: https://respond.io/help/tiktok/tiktok-overview
