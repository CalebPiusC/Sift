# B5 — WhatsApp Cloud API and Selvora helper

## Status and boundaries

Local sandbox acceptance is implemented and tested. **No real Meta approval, Embedded
Signup, number registration, WhatsApp delivery or Gemini transcription has been verified
with live credentials in this workspace.** The sandbox does not send to real numbers.
It uses the **same `Cloud` adapter**, registered beside Gmail, with a fake HTTP transport
at the Meta/media/Gemini boundary; there is no alternative sandbox business logic.

Migration008 extends existing tenant-scoped tables (no new public tables). It adds
WhatsApp routing, last-customer-message time, template context, helper membership and
proposal bindings, and encrypted media/transcripts on server-only webhook envelopes.
Apply migrations001–008 to an existing database with a migration owner; do not reset
production volumes. Compose initializes them only for new volumes. API readiness checks
for the new schema before accepting work. Existing private raw events are not browser
readable or published via realtime.

The API and worker must share stable PIPELINE_KEYS and IDENTITY_PEPPER settings, PostgreSQL
and Redis. Enable PIPELINE_ENABLED. Follow the base startup steps in gmail-pipeline.md.

## Sandbox setup

In api/.env (ignored), configure:

- WHATSAPP_MODE=sandbox (default; no Meta/Gemini network requests)
- META_APP_SECRET and META_VERIFY_TOKEN: locally generated secrets of your choosing;
  sandbox ingress **still requires signatures**, never an authentication bypass.
- WHATSAPP_HELPER_PHONE_ID: a sandbox fixture identifier, e.g. `sandbox-helper`
- WHATSAPP_HELPER_NUMBER: a test number string, clearly labelled sandbox in the app

Configure web DATA_MODE=api, real sign-in and a selected workspace, and API_ORIGIN.
Settings → Channels shows a WhatsApp card even before connection. Connect starts a
member-bound attempt; “Connect sandbox WhatsApp” connects a server-generated fake phone
ID `sandbox-{vendor UUID}`. It never accepts real credentials or claims a real connection.
The helper link screen creates/reads real Redis codes and checks webhook-established state;
API mode has **no simulate-confirm endpoint**.

For a signed sandbox inbound webhook, POST the standard Meta structure to
`/v1/webhooks/whatsapp` (or the web proxy `/api/v1/webhooks/whatsapp`):

```json
{"object":"whatsapp_business_account","entry":[{"changes":[{"field":"messages","value":{"metadata":{"phone_number_id":"sandbox-YOUR_VENDOR_UUID"},"contacts":[{"profile":{"name":"Sandbox customer"}}],"messages":[{"id":"wamid.unique-fixture-id","from":"2348000000001","timestamp":"CURRENT_UNIX_SECONDS","type":"audio","audio":{"id":"sandbox-audio"}}]}}]}]}
```

Set X-Hub-Signature-256 to `sha256=` plus HMAC-SHA256 of the **exact request bytes**
using your locally configured META_APP_SECRET. Replace the vendor UUID/timestamp with
actual values; the example is illustrative, not a runnable credential. Use type text
with text.body for text or type image with image.id=`sandbox-image`. The fake Gemini
fixture returns “black sneakers finished” in English; it never pretends to transcribe
arbitrary bytes. Tests can inject transcript/language fixtures without changing the adapter.

## Live Meta setup (operator action required)

Set WHATSAPP_MODE=live, META_APP_ID, META_APP_SECRET, META_VERIFY_TOKEN,
META_SIGNUP_CONFIG_ID and a supported META_GRAPH_VERSION (default v23.0). Configure
Meta's Facebook Login for Business/WhatsApp Embedded Signup, approved JS SDK domains,
and the required whatsapp_business_management / whatsapp_business_messaging permissions.
Use HTTPS public webhook routing. Verify GET with hub.mode=subscribe, hub.verify_token,
hub.challenge, then subscribe the `messages` field. Do not put app secrets in browser env.
Only app ID/config ID/version are returned to the signup UI.

The UI loads Meta's SDK only after the vendor begins signup. It validates session
postMessage origins against exact Facebook origins and waits for both the code and
phone/WABA session information. The authenticated initiating member completes a ten-minute,
single-use attempt. The server exchanges the code, debug-validates token validity/app ID
and scopes, checks the number is in the authorized WABA, subscribes the app and registers
the phone. A generated registration PIN and token are encrypted with tenant/account AAD.
This flow needs real Meta acceptance; existing two-step-verification/number-migration
requirements may require provider-specific operator action. Ownership conflicts fail closed.
Token expiry/revocation is surfaced as provider failure; reconnect rather than reuse a
rejected token. There is no claim that arbitrary Meta account migrations were tested.

For Selvora's separate helper number configure WHATSAPP_HELPER_PHONE_ID,
WHATSAPP_HELPER_NUMBER, WHATSAPP_HELPER_TOKEN (server-only) and subscribe that account too.
It is never shown as a vendor-owned customer channel. Customer messages route solely
by provider phone_number_id, not user-supplied vendor IDs. Helper messages route by a
signed sender plus a valid capability / previously verified association.

For real audio configure GEMINI_API_KEY and GEMINI_AUDIO_MODEL. Original audio is sent to
Gemini for transcription; disclose that processor to vendors/customers and apply your
retention/privacy policy before live launch. API keys, bearer tokens, signatures, phone
numbers and content must not be logged. The runtime exposes safe provider error codes.

## Ingress, media and language

GET checks the configured verification token; POST checks HMAC-SHA256 over the exact raw
body using constant-time comparison before parsing. Bodies are capped at256KiB. Text,
audio and image messages are deduplicated by account + provider message ID. The encrypted
envelope and durable ingest job commit before202. Redis wakeups are an optimization;
PostgreSQL leases/retries remain the durable queue. Unknown phone IDs are acknowledged
without leaking business existence. Status receipts update account-scoped delivery state
monotonically rather than generating customer conversations.

The worker downloads media with the account token; no browser/public object URL is stored.
Only HTTPS Meta media hosts are allowed, redirects are refused, MIME types are allowlisted,
metadata/body sizes capped at12MiB and provider hashes checked where supplied. Original
bytes are encrypted with tenant/event AAD in webhook_events. Gemini receives inline audio
with a transcription-only prompt and strict parsed JSON output; the transcript and detected
language are retained separately from the encrypted original. Missing/invalid transcription
fails closed and is retried, never converted into a guessed command. En/pcm are eligible for
the existing B3 reply engine; other languages are retained without invented English claims.
Meta does not provide audio duration, so duration stays null instead of being fabricated.

Authenticated GET `/v1/messages/{id}/media` resolves the private envelope after tenant/member
and conversation-assignment authorization; it returns an attachment with no-store/nosniff.
No unauthenticated media URL is issued. The inbox displays the transcript; an integrated
private audio-player control is follow-up work (the authorized download endpoint is available).
Images are retained privately, not interpreted as payment proof or catalogue commands.
Human review handles their content; no image understanding is claimed.

Media authorization expires after30days. Configure a database maintenance task to delete
expired raw webhook envelopes/media and the associated completed jobs under an authorized
retention role; this increment bounds access but does **not** ship a physical deletion cron.
Do not claim expiry itself securely erases stored bytes or backups.

## Sending and templates

The send worker uses the existing outbox, lease protection, fact verifier, takeover and
fresh-fact checks. Free text is allowed only when this conversation's last inbound customer
message is strictly less than24hours old; another customer's activity never opens its window.
The Cloud adapter checks the clock immediately before POST. Meta's own checks still apply.
If the window is closed, free text fails with WHATSAPP_TEMPLATE_REQUIRED; it is never silently
wrapped in a template. Late events cannot move last-customer time backwards.

GET `/v1/channels/whatsapp/{account}/templates` lists approved provider templates.
POST `/v1/channels/whatsapp/templates/send` takes conversationId/name/language as an explicit
owner/manager action and queues a template message. The worker freshly fetches approved
status at send time. This increment supports **fixed, parameter-free templates**; parameterized
templates fail closed until their parameter bindings are separately reviewed. Results beyond
the provider's first100template page are not silently assumed approved. No opt-in marketing
campaigns, automatic outside-window AI templates or template creation/approval UI is claimed.

Meta send has no client-id lookup. A timeout/crash after a possible POST becomes
DELIVERY_UNCERTAIN and is not blindly retried. Provider acceptance is sent, not delivery;
signed delivered/read receipts update actual delivery state.

## Helper security and typed instructions

Only active signed-in owners/managers can create a code. A Lua transaction in Redis reserves
a global collision-checked4-digit capability, replaces that member's previous one and limits
it to600seconds/single consumption. Values are HMAC-hashed; the app's display copy is encrypted
in Redis. A per-sender counter locks after five wrong tries for900seconds, independent of
code replacement and other senders. All rule times come from an injectable clock. A signed
webhook retry uses a message-bound consumption receipt, so Redis→DB recovery does not consume
an extra attempt or allow another sender to redeem a used code. Redis loss invalidates pending
capabilities; the vendor must create a new one. Established links are stored in scoped SQL.

A linked sender's authority is rechecked against current active membership for every message
and mutation. New codes invalidate the old association and its pending change. A sender
already linked elsewhere cannot silently overwrite that association. As specified, four-digit
codes are short-lived bearer capabilities: five tries per sender is not a global anti-Sybil
proof. Do not share codes/screenshots or expose the helper token. Network/provider abuse
controls and rate limits remain required for a public launch.

Helper text and voice transcripts call the **same server functions** as API-mode
`catalogue/text-proposals` and its confirm endpoint. Supported grammar: “black sneakers
finished”, “set sneakers stock to8”, “raise bag price to20k”, “mark Black sneakers as out of
stock”. Product matching is literal and conservative. Ambiguous items ask for the exact name;
variant-specific changes require app review. No model output is executed as a mutation.

A proposal only records a candidate/change/revision. The response says e.g. “Mark Black
sneakers as out of stock? Reply YES to confirm, or NO to cancel.” Only an explicit YES from
the same linked sender confirms the current unexpired proposal. NO/cancel or a different
instruction clears it. Confirm takes a commerce lock, verifies revision/current membership,
rejects below-floor prices, applies once and writes audit/stock-correction ledgers. Duplicate
webhooks cannot repeat the mutation. A stale catalogue/proposal fails closed.

“How many orders today” returns an actual tenant-scoped count of orders created since midnight
Africa/Lagos, not an AI estimate or revenue claim. It never mutates the catalogue.
Helper prompts/replies have a persisted send-start/provider-ID marker; an ambiguous send is
not replayed. The confirmed catalogue mutation and its audit remain durable even if its
acknowledgment cannot be delivered. Review HELPER_DELIVERY_UNCERTAIN jobs before manual resend.

## Verification

```sh
PATH="$PWD/.venv/bin:$PATH" npm run test:whatsapp
npm run test:all
npm run build
```

Native integration uses real PostgreSQL, Redis, authorization routes and worker jobs. It
covers sandbox signup; exact signature/GET checks; text/audio/image ingestion; duplicate IDs;
private encrypted audio/transcript/download; B3 verified text reply through the WhatsApp outbox;
approved-template sends outside the window; rejected unapproved templates/free text; helper
voice→proposal→YES with no early mutation; duplicate YES; shared app parser/confirm; actual
today-order count; code replacement/600s expiry/single use/eight concurrent consumers/five-try
900s lockout and sender isolation. Python tests cover unsafe media URLs/MIME/size, signatures,
parser rejection, exact24-hour boundary and fake Gemini language output. Frontend tests cover
API-mode sandbox signup, origin validation and webhook-only helper confirmation.

Remaining live acceptance: approved Meta app + real vendor number Embedded Signup, signed
reachable webhooks, real Gemini audio, permitted in-window reply/template, private original
retrieval and actual delivery receipts. Sandbox success is **not** evidence these happened.
