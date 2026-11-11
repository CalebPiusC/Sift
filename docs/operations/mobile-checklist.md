# Real-device friend acceptance checklist

Record device/OS/browser versions, network type, date, tester and private evidence.
Run on **Android Chrome** and **iPhone Safari**, latest stable and oldest supported
version chosen by release owner. Desktop responsive/WebKit automation is not a
substitute. Nothing below has been claimed as physically tested in this phase.

For each browser:
- [ ] Sign up, verify email, sign in/out, reset password; expired session recovery.
- [ ] Receive invite; open link; sign in in another tab; accept verified-email invite;
  wrong account rejected. Fragment token never appears in server/access logs.
- [ ] Navigation at 390px; keyboard opens without hiding reply/send; tap targets,
  readable text at 200% zoom; VoiceOver/TalkBack labels and focus order.
- [ ] Portrait/landscape, safe-area/notch, Safari bottom toolbar and Android back.
- [ ] Slow 3G, offline/reconnect, duplicate tap, app background/resume. Unsent drafts
  survive; server truth replaces stale payment state; failures never show success.
- [ ] Real inbound text + voice, permission deny/retry, private media access/expiry.
- [ ] Catalogue sheet, exact variant, stock race, order chat and approval/takeover.
- [ ] Paystack popup/redirect, cancelled payment, verified return; no entitlement
  change just from redirect; paid receipt share/revoke works in another browser.
- [ ] STOP, moderation flag/Not spam/Block and quota-limit vendor reply.
- [ ] Feedback category button, permission-denied safety view for agent, owner
  pause/resume; confirm global operator action works separately.
- [ ] PWA install where supported; service-worker update does not cache authenticated
  API responses/private media/receipt tokens. Refresh, logout and account switching
  expose no previous vendor data.
- [ ] Notification history read-state, system dark/light theme and low-data setting.
- [ ] Record all failures and retest fixes; sign off both device/browser columns.
