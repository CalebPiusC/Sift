# B0 table role matrix

Authoritative executable permissions: `role-matrix.json`; enforced by SQL policies AND grants. R=SELECT, I=INSERT, U=UPDATE, D=DELETE; —=denied. Every table × role × operation has a real SQL test (768 cases). All roles are tenant scoped; anonymous access is denied. Service means `selvora_service`, NOT Supabase `service_role`.

| Table | Owner | Manager | Agent | Service | Notes |
|---|---|---|---|---|---|
| vendors | RU | R | R | RU | Tenant creation remains onboard_vendor RPC. |
| vendor_members | R | R | R | RIU | Membership writes require the future owner-authorized service transaction; no direct self-escalation. |
| customers | RIU | RIU | RIU | RIU |  |
| conversations | R | R | R | RIU | Operational truth is service-owned. Human APIs authorize takeover/assignment; read markers use conversation_reads. |
| products | RIU | RIU | R | RIU |  |
| product_variants | RIU | RIU | R | RIU |  |
| orders | R | R | R | RIU | Human writes go through role-authorized API/service transactions, not browser DML. |
| order_items | R | R | R | RIU | Human writes go through role-authorized API/service transactions, not browser DML. |
| messages | R | R | R | RIU | Human writes go through role-authorized API/service transactions, not browser DML. |
| approvals | R | R | R | RIU | Human writes go through role-authorized API/service transactions, not browser DML. |
| channel_accounts | R | R | R | RIU | Human writes go through role-authorized API/service transactions, not browser DML. |
| receipts | R | R | R | RI | Immutable; human issuance only via guarded issue_receipt RPC. |
| audit_log | R | R | — | RI | Append-only safe metadata. |
| business_settings | RIU | RIU | R | RIU |  |
| business_hours | RIU | RIU | R | RIU |  |
| delivery_fees | RIU | RIU | R | RIU |  |
| followup_settings | RIU | RIU | R | RIU |  |
| member_preferences | RIU | RIU | RIU | RIUD | Human users access only their own membership preferences. |
| conversation_reads | RIU | RIU | RIU | RIUD | Human users access only their own read marker. |
| product_photos | RIUD | RIUD | R | RIUD |  |
| catalogue_drafts | RIUD | RIUD | R | RIUD |  |
| typed_proposals | RIUD | RIUD | R | RIUD |  |
| team_invitations | R | — | — | RIU | Owner-only API invitations; hashes never exposed to humans by table reads (no hash column here). |
| followups | R | R | R | RIU |  |
| moderation_flags | R | R | R | RIU |  |
| blocked_identities | R | R | R | RIU |  |
| restock_requests | R | R | R | RIU |  |
| customer_identities | R | R | R | RIU |  |
| notifications | RU | RU | RU | RIU | Human users see/update only notifications addressed to their membership. |
| billing_accounts | R | — | — | RIU |  |
| billing_offers | R | — | — | RIU |  |
| billing_selections | R | — | — | RIU |  |
| usage_meters | R | — | — | RIU |  |
| payments | R | R | — | RI | Append-only; future trusted transaction writes facts, no arbitrary metadata. |
| stock_movements | R | R | — | RI | Append-only; future trusted transaction writes facts, no arbitrary metadata. |
| usage_entries | R | R | — | RI | Append-only; future trusted transaction writes facts, no arbitrary metadata. |
| domain_events | R | R | R | RI | Append-only; future trusted transaction writes facts, no arbitrary metadata. |
| stock_reservations | R | R | R | RIU |  |
| order_timeline | R | R | R | RIU |  |
| message_deliveries | R | R | R | RIU |  |
| channel_tokens | — | — | — | RIUD | Service-only; encrypted secrets / hashed codes, never browser SELECT. |
| channel_attempts | — | — | — | RIUD | Service-only; encrypted secrets / hashed codes, never browser SELECT. |
| helper_links | — | — | — | RIUD | Service-only; encrypted secrets / hashed codes, never browser SELECT. |
| invitation_secrets | — | — | — | RIUD | Service-only; encrypted secrets / hashed codes, never browser SELECT. |
| webhook_events | — | — | — | RIUD | Service-only; encrypted secrets / hashed codes, never browser SELECT. |
| jobs | — | — | — | RIUD | Service-only; encrypted secrets / hashed codes, never browser SELECT. |
| idempotency_keys | — | — | — | RIUD | Service-only; encrypted secrets / hashed codes, never browser SELECT. |
| receipt_shares | — | — | — | RIUD | Service-only; encrypted secrets / hashed codes, never browser SELECT. |
| billing_checkouts | — | — | — | RIU | Owner-authorized API only; selection/initialization never grants entitlements. |
| billing_payments | — | — | — | RI | Append-only verified webhook payment evidence. |
| ai_cost_entries | — | — | — | RI | Append-only per-vendor provider usage estimates; unknown costs remain null. |

Human roles are active vendor_members resolved from auth.uid(), never editable JWT role claims. Member preferences/read markers/notifications are restricted to the caller’s own membership. A table write denied to a human may be performed by a future authorized API transaction under the scoped service role; that is not a direct browser grant. Endpoint authorization is a separate required layer, specified in backend-roadmap.md.

Existing controlled RPC exceptions: onboard_vendor creates a tenant/owner/config atomically; legacy confirm_vendor_payment and issue_receipt browser execution is revoked by B4 migration007; use the authorized payment-confirmation and receipt APIs instead. Receipt, event, payment, stock ledger, usage ledger and audit rows reject UPDATE/DELETE even for the bounded service role. DELETE is intentionally absent on core business records; use status/archive/retention design instead.

Do not give authenticated, anon or service_role membership in selvora_service. A dedicated server login must be NOINHERIT/NOBYPASSRLS and explicitly SET LOCAL ROLE selvora_service plus SET LOCAL app.vendor_id per transaction after authorization. SQL validates the selected tenant on every row. Supabase’s bypass key has table privileges revoked; hosted owner/superuser can always alter security and is not an application role.
