# Selvora phone demo

> Current capability/release status: [status matrix](status-matrix.md). This guide documents sample/UI procedures, not live-provider acceptance.

## Start

```sh
npm ci
npm run build
DATA_MODE=mock npm run start -w web -- --port 3001
```

Open the port **3001** preview on your phone (or use a 390×844 browser viewport).
Every page says **Sample data**. No login, live messages, charges or external accounts
are involved. Keep the tab open: refresh resets the sample session.

## Main story — about five minutes

1. **Settings → Try sample onboarding.** Enter “Adire Demo Lagos” → Continue →
   Products → Continue → Pidgin-friendly → Continue → Let’s get you settled.
   Explain: photos, taps and typed text; the vendor never has to type a category.
2. **Catalogue → Add products.** Choose one product photo from your phone.
   Continue → Fashion → Get suggestions. Explain that this is **sample extraction**,
   not live AI photo analysis. Edit the item name to “Demo Adire”.
3. Continue → set Price to `20000`, Lowest price to `15000` → Continue →
   review the facts → Confirm item. Open the new product to see saved details.
4. **Inbox → Chidinma Okafor.** Show the original Pidgin message/transcript beside
   its English sample summary. The original audio is not supplied by the sample.
5. Find the gold approval card. Explain its customer message, retrieved facts and
   proposed reply. Tap **Send** to approve the safe holding response. Nothing is sent
   externally; it appears as a sample sent reply.
6. Tap **Take Over**. AI is paused for this chat. The scenario control’s flask button
   can simulate an incoming message: it must not get an AI reply during takeover.
   Tap **Hand Back** to resume AI. Quick replies are drafts until you send them.
7. Tap **Back to inbox → Orders → Draft → order-1** (Chidinma).
   **Mark awaiting payment → Payment received**. Read the screenshot warning.
   Only in this fictional demo, tick “I checked my bank and received the full amount”
   → **Confirm payment received**. In production the vendor must genuinely check.
8. Tap **Issue receipt**. Show **Receipt #0013**, immutable totals and customer details.
   **Download PDF** creates a real sample PDF; Share is a sample preview, not proof
   of payment. The sample Paystack link is non-payable—never try to pay it.

## Extras — another two minutes

9. **Insights → Overview:** change From/To, show the seven chart summaries.
   Stage conversion is a snapshot; AI/vendor is message share, not fully automated chats.
10. **Follow-ups:** enable, choose `72` hours and professional, Save. Simulate send now
    demonstrates queue history only. **Spam & scam:** review reasons; Not spam / Block
    save local decisions. **Restock:** show variant low stock and sample alert requests.
11. **Customers:** search “Chidinma”, open details/history, edit notes, Save customer
    memory. Go back and search a word from the note to prove memory is searchable.
12. **Settings:** show channels/helper, reply lanes, floor-safe negotiation, team and
    placeholder billing. TikTok cannot connect. No live helper number is configured.
13. **Preferences:** enable low-data + dark mode → Save. Catalogue becomes text-first,
    with no thumbnails. Opening details still requires **Load product photos**.
    New uploads are resized locally to 640px in low-data mode (1280px otherwise).

## If something goes wrong

- A loading skeleton is expected while a screen/chunk opens on a slow connection.
- Error cards offer Retry; the screen error boundary offers Try again. Check the
  connection first. Reload only when happy to reset the demo session.
- Refresh to restart with original fixtures, receipts and settings. Sample onboarding
  changes the business profile only; it intentionally keeps existing sample history.

## Repeatable checks

With the mock server running, run `SELVORA_TEST_URL=http://localhost:3001 npm run test:ui`.
This uses real Playwright-controlled Chromium: the complete demo, four regression journeys,
light/dark axe scans, and synthetic slow-network/CPU checks. Unit/release checks:
`npm run test:all && npm run build`. Backend integrations remain paused.
