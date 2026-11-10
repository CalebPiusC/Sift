# B0 exact schema delta

Generated from actual F0 and B0 migration execution, not hand-counted. Run `npm run docs:backend`.

## approvals — extended existing table

Added columns:

- `confidence` numeric; NOT NULL; default `0`
- `holding_reply_sent_at` timestamp with time zone; nullable
- `decided_at` timestamp with time zone; nullable
- `decided_by` uuid; nullable
- `revision` bigint; NOT NULL; default `1`
- `fact_snapshot` jsonb; nullable
- `fact_hash` text; nullable
- `safety_reason` text; nullable
- `outgoing_message_id` uuid; nullable
- `decision_action` text; nullable

New/changed constraints:

- `approvals_confidence_check`: `CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))`
- `approvals_confidence_not_null`: `NOT NULL confidence`
- `approvals_decision_action_check`: `CHECK ((decision_action = ANY (ARRAY['send'::text, 'edit'::text, 'reject'::text])))`
- `approvals_revision_check`: `CHECK ((revision > 0))`
- `approvals_revision_not_null`: `NOT NULL revision`
- `approvals_vendor_id_conversation_id_message_id_fkey`: `FOREIGN KEY (vendor_id, conversation_id, message_id) REFERENCES messages(vendor_id, conversation_id, id)`
- `approvals_vendor_id_decided_by_fkey`: `FOREIGN KEY (vendor_id, decided_by) REFERENCES vendor_members(vendor_id, id)`
- `approvals_vendor_id_outgoing_message_id_fkey`: `FOREIGN KEY (vendor_id, outgoing_message_id) REFERENCES messages(vendor_id, id)`

Added indexes (including constraint-backed and FK lookup indexes):

- `approval_outgoing_fk`: `CREATE INDEX approval_outgoing_fk ON public.approvals USING btree (vendor_id, outgoing_message_id)`
- `approvals_holding_due`: `CREATE INDEX approvals_holding_due ON public.approvals USING btree (vendor_id, holding_reply_due_at, id) WHERE ((status = 'pending'::text) AND (holding_reply_sent_at IS NULL))`
- `approvals_pending_cursor`: `CREATE INDEX approvals_pending_cursor ON public.approvals USING btree (vendor_id, status, created_at DESC, id DESC)`
- `b0_fk_approvals_vendor_id_conversation_id_fkey_16745`: `CREATE INDEX b0_fk_approvals_vendor_id_conversation_id_fkey_16745 ON public.approvals USING btree (vendor_id, conversation_id)`
- `b0_fk_approvals_vendor_id_conversation_id_message_id_fkey_16745`: `CREATE INDEX b0_fk_approvals_vendor_id_conversation_id_message_id_fkey_16745 ON public.approvals USING btree (vendor_id, conversation_id, message_id)`
- `b0_fk_approvals_vendor_id_decided_by_fkey_16745`: `CREATE INDEX b0_fk_approvals_vendor_id_decided_by_fkey_16745 ON public.approvals USING btree (vendor_id, decided_by)`
- `b0_fk_approvals_vendor_id_message_id_fkey_16745`: `CREATE INDEX b0_fk_approvals_vendor_id_message_id_fkey_16745 ON public.approvals USING btree (vendor_id, message_id)`
- `reply_once_per_inbound`: `CREATE UNIQUE INDEX reply_once_per_inbound ON public.approvals USING btree (vendor_id, message_id) WHERE (fact_snapshot IS NOT NULL)`

## audit_log — extended existing table

Added columns:

- `source_customer_id` uuid; nullable
- `target_customer_id` uuid; nullable

New/changed constraints:

- `audit_log_vendor_id_actor_id_fkey`: `FOREIGN KEY (vendor_id, actor_id) REFERENCES vendor_members(vendor_id, user_id)`
- `audit_log_vendor_id_source_customer_id_fkey`: `FOREIGN KEY (vendor_id, source_customer_id) REFERENCES customers(vendor_id, id)`
- `audit_log_vendor_id_target_customer_id_fkey`: `FOREIGN KEY (vendor_id, target_customer_id) REFERENCES customers(vendor_id, id)`

Added indexes (including constraint-backed and FK lookup indexes):

- `audit_actor_fk`: `CREATE INDEX audit_actor_fk ON public.audit_log USING btree (vendor_id, actor_id)`
- `audit_source_fk`: `CREATE INDEX audit_source_fk ON public.audit_log USING btree (vendor_id, source_customer_id)`
- `audit_target_fk`: `CREATE INDEX audit_target_fk ON public.audit_log USING btree (vendor_id, target_customer_id)`

## billing_accounts — NEW table

Added columns:

- `id` uuid; NOT NULL; default `gen_random_uuid()`
- `vendor_id` uuid; NOT NULL
- `plan` text; NOT NULL; default `'starter'::text`
- `status` text; NOT NULL; default `'trial'::text`
- `trial_ends_at` timestamp with time zone; nullable
- `next_billing_at` timestamp with time zone; nullable
- `monthly_price_kobo` bigint; NOT NULL; default `0`
- `bundle_balance` integer; NOT NULL; default `0`
- `created_at` timestamp with time zone; NOT NULL; default `now()`

New/changed constraints:

- `billing_accounts_bundle_balance_check`: `CHECK ((bundle_balance >= 0))`
- `billing_accounts_bundle_balance_not_null`: `NOT NULL bundle_balance`
- `billing_accounts_created_at_not_null`: `NOT NULL created_at`
- `billing_accounts_id_not_null`: `NOT NULL id`
- `billing_accounts_monthly_price_kobo_check`: `CHECK ((monthly_price_kobo >= 0))`
- `billing_accounts_monthly_price_kobo_not_null`: `NOT NULL monthly_price_kobo`
- `billing_accounts_monthly_price_kobo_safe_integer`: `CHECK ((monthly_price_kobo <= '9007199254740991'::bigint))`
- `billing_accounts_pkey`: `PRIMARY KEY (id)`
- `billing_accounts_plan_check`: `CHECK ((plan = ANY (ARRAY['starter'::text, 'growth'::text])))`
- `billing_accounts_plan_not_null`: `NOT NULL plan`
- `billing_accounts_status_check`: `CHECK ((status = ANY (ARRAY['trial'::text, 'active'::text, 'past_due'::text])))`
- `billing_accounts_status_not_null`: `NOT NULL status`
- `billing_accounts_vendor_id_fkey`: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`
- `billing_accounts_vendor_id_id_key`: `UNIQUE (vendor_id, id)`
- `billing_accounts_vendor_id_key`: `UNIQUE (vendor_id)`
- `billing_accounts_vendor_id_not_null`: `NOT NULL vendor_id`

Added indexes (including constraint-backed and FK lookup indexes):

- `billing_accounts_pkey`: `CREATE UNIQUE INDEX billing_accounts_pkey ON public.billing_accounts USING btree (id)`
- `billing_accounts_vendor_id_id_key`: `CREATE UNIQUE INDEX billing_accounts_vendor_id_id_key ON public.billing_accounts USING btree (vendor_id, id)`
- `billing_accounts_vendor_id_key`: `CREATE UNIQUE INDEX billing_accounts_vendor_id_key ON public.billing_accounts USING btree (vendor_id)`

## billing_offers — NEW table

Added columns:

- `id` uuid; NOT NULL; default `gen_random_uuid()`
- `vendor_id` uuid; NOT NULL
- `offer_key` text; NOT NULL
- `name` text; NOT NULL
- `kind` text; NOT NULL
- `price_kobo` bigint; NOT NULL
- `conversations` integer; NOT NULL
- `description` text; NOT NULL; default `''::text`
- `active` boolean; NOT NULL; default `true`
- `created_at` timestamp with time zone; NOT NULL; default `now()`

New/changed constraints:

- `billing_offers_active_not_null`: `NOT NULL active`
- `billing_offers_conversations_check`: `CHECK ((conversations > 0))`
- `billing_offers_conversations_not_null`: `NOT NULL conversations`
- `billing_offers_created_at_not_null`: `NOT NULL created_at`
- `billing_offers_description_not_null`: `NOT NULL description`
- `billing_offers_id_not_null`: `NOT NULL id`
- `billing_offers_kind_check`: `CHECK ((kind = ANY (ARRAY['monthly'::text, 'yearly'::text, 'volume'::text, 'bundle'::text])))`
- `billing_offers_kind_not_null`: `NOT NULL kind`
- `billing_offers_name_not_null`: `NOT NULL name`
- `billing_offers_offer_key_not_null`: `NOT NULL offer_key`
- `billing_offers_pkey`: `PRIMARY KEY (id)`
- `billing_offers_price_kobo_check`: `CHECK ((price_kobo >= 0))`
- `billing_offers_price_kobo_not_null`: `NOT NULL price_kobo`
- `billing_offers_price_kobo_safe_integer`: `CHECK ((price_kobo <= '9007199254740991'::bigint))`
- `billing_offers_vendor_id_fkey`: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`
- `billing_offers_vendor_id_id_key`: `UNIQUE (vendor_id, id)`
- `billing_offers_vendor_id_not_null`: `NOT NULL vendor_id`
- `billing_offers_vendor_id_offer_key_key`: `UNIQUE (vendor_id, offer_key)`

Added indexes (including constraint-backed and FK lookup indexes):

- `billing_offers_pkey`: `CREATE UNIQUE INDEX billing_offers_pkey ON public.billing_offers USING btree (id)`
- `billing_offers_vendor_id_id_key`: `CREATE UNIQUE INDEX billing_offers_vendor_id_id_key ON public.billing_offers USING btree (vendor_id, id)`
- `billing_offers_vendor_id_offer_key_key`: `CREATE UNIQUE INDEX billing_offers_vendor_id_offer_key_key ON public.billing_offers USING btree (vendor_id, offer_key)`

## billing_selections — NEW table

Added columns:

- `id` uuid; NOT NULL; default `gen_random_uuid()`
- `vendor_id` uuid; NOT NULL
- `offer_id` uuid; NOT NULL
- `created_at` timestamp with time zone; NOT NULL; default `now()`

New/changed constraints:

- `billing_selections_created_at_not_null`: `NOT NULL created_at`
- `billing_selections_id_not_null`: `NOT NULL id`
- `billing_selections_offer_id_not_null`: `NOT NULL offer_id`
- `billing_selections_pkey`: `PRIMARY KEY (id)`
- `billing_selections_vendor_id_fkey`: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`
- `billing_selections_vendor_id_id_key`: `UNIQUE (vendor_id, id)`
- `billing_selections_vendor_id_key`: `UNIQUE (vendor_id)`
- `billing_selections_vendor_id_not_null`: `NOT NULL vendor_id`
- `billing_selections_vendor_id_offer_id_fkey`: `FOREIGN KEY (vendor_id, offer_id) REFERENCES billing_offers(vendor_id, id)`

Added indexes (including constraint-backed and FK lookup indexes):

- `b0_fk_billing_selections_vendor_id_offer_id_fkey_17722`: `CREATE INDEX b0_fk_billing_selections_vendor_id_offer_id_fkey_17722 ON public.billing_selections USING btree (vendor_id, offer_id)`
- `billing_selections_pkey`: `CREATE UNIQUE INDEX billing_selections_pkey ON public.billing_selections USING btree (id)`
- `billing_selections_vendor_id_id_key`: `CREATE UNIQUE INDEX billing_selections_vendor_id_id_key ON public.billing_selections USING btree (vendor_id, id)`
- `billing_selections_vendor_id_key`: `CREATE UNIQUE INDEX billing_selections_vendor_id_key ON public.billing_selections USING btree (vendor_id)`

## blocked_identities — NEW table

Added columns:

- `id` uuid; NOT NULL; default `gen_random_uuid()`
- `vendor_id` uuid; NOT NULL
- `identity_id` uuid; NOT NULL
- `flag_id` uuid; nullable
- `blocked_by` uuid; nullable
- `active` boolean; NOT NULL; default `true`
- `created_at` timestamp with time zone; NOT NULL; default `now()`

New/changed constraints:

- `blocked_identities_active_not_null`: `NOT NULL active`
- `blocked_identities_created_at_not_null`: `NOT NULL created_at`
- `blocked_identities_id_not_null`: `NOT NULL id`
- `blocked_identities_identity_id_not_null`: `NOT NULL identity_id`
- `blocked_identities_pkey`: `PRIMARY KEY (id)`
- `blocked_identities_vendor_id_blocked_by_fkey`: `FOREIGN KEY (vendor_id, blocked_by) REFERENCES vendor_members(vendor_id, id)`
- `blocked_identities_vendor_id_fkey`: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`
- `blocked_identities_vendor_id_flag_id_fkey`: `FOREIGN KEY (vendor_id, flag_id) REFERENCES moderation_flags(vendor_id, id)`
- `blocked_identities_vendor_id_id_key`: `UNIQUE (vendor_id, id)`
- `blocked_identities_vendor_id_identity_id_fkey`: `FOREIGN KEY (vendor_id, identity_id) REFERENCES customer_identities(vendor_id, id)`
- `blocked_identities_vendor_id_identity_id_key`: `UNIQUE (vendor_id, identity_id)`
- `blocked_identities_vendor_id_not_null`: `NOT NULL vendor_id`

Added indexes (including constraint-backed and FK lookup indexes):

- `b0_fk_blocked_identities_vendor_id_blocked_by_fkey_17450`: `CREATE INDEX b0_fk_blocked_identities_vendor_id_blocked_by_fkey_17450 ON public.blocked_identities USING btree (vendor_id, blocked_by)`
- `b0_fk_blocked_identities_vendor_id_flag_id_fkey_17450`: `CREATE INDEX b0_fk_blocked_identities_vendor_id_flag_id_fkey_17450 ON public.blocked_identities USING btree (vendor_id, flag_id)`
- `blocked_identities_pkey`: `CREATE UNIQUE INDEX blocked_identities_pkey ON public.blocked_identities USING btree (id)`
- `blocked_identities_vendor_id_id_key`: `CREATE UNIQUE INDEX blocked_identities_vendor_id_id_key ON public.blocked_identities USING btree (vendor_id, id)`
- `blocked_identities_vendor_id_identity_id_key`: `CREATE UNIQUE INDEX blocked_identities_vendor_id_identity_id_key ON public.blocked_identities USING btree (vendor_id, identity_id)`

## business_hours — NEW table

Added columns:

- `id` uuid; NOT NULL; default `gen_random_uuid()`
- `vendor_id` uuid; NOT NULL
- `day` smallint; NOT NULL
- `closed` boolean; NOT NULL; default `false`
- `opens` time without time zone; NOT NULL; default `'09:00:00'::time without time zone`
- `closes` time without time zone; NOT NULL; default `'18:00:00'::time without time zone`
- `created_at` timestamp with time zone; NOT NULL; default `now()`

New/changed constraints:

- `business_hours_check`: `CHECK ((closed OR (opens < closes)))`
- `business_hours_closed_not_null`: `NOT NULL closed`
- `business_hours_closes_not_null`: `NOT NULL closes`
- `business_hours_created_at_not_null`: `NOT NULL created_at`
- `business_hours_day_check`: `CHECK (((day >= 0) AND (day <= 6)))`
- `business_hours_day_not_null`: `NOT NULL day`
- `business_hours_id_not_null`: `NOT NULL id`
- `business_hours_opens_not_null`: `NOT NULL opens`
- `business_hours_pkey`: `PRIMARY KEY (id)`
- `business_hours_vendor_id_day_key`: `UNIQUE (vendor_id, day)`
- `business_hours_vendor_id_fkey`: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`
- `business_hours_vendor_id_id_key`: `UNIQUE (vendor_id, id)`
- `business_hours_vendor_id_not_null`: `NOT NULL vendor_id`

Added indexes (including constraint-backed and FK lookup indexes):

- `business_hours_pkey`: `CREATE UNIQUE INDEX business_hours_pkey ON public.business_hours USING btree (id)`
- `business_hours_vendor_id_day_key`: `CREATE UNIQUE INDEX business_hours_vendor_id_day_key ON public.business_hours USING btree (vendor_id, day)`
- `business_hours_vendor_id_id_key`: `CREATE UNIQUE INDEX business_hours_vendor_id_id_key ON public.business_hours USING btree (vendor_id, id)`

## business_settings — NEW table

Added columns:

- `id` uuid; NOT NULL; default `gen_random_uuid()`
- `vendor_id` uuid; NOT NULL
- `auto_intents` ARRAY; NOT NULL; default `ARRAY['greeting'::text, 'price'::text, 'availability'::text, 'variants'::text, 'delivery_info'::text, 'order_status'::text, 'alternatives'::text]`
- `reply_languages` ARRAY; NOT NULL; default `ARRAY['en'::text, 'pcm'::text]`
- `hours_enabled` boolean; NOT NULL; default `false`
- `timezone` text; NOT NULL; default `'Africa/Lagos'::text`
- `away_message` text; NOT NULL; default `''::text`
- `revision` bigint; NOT NULL; default `1`
- `created_at` timestamp with time zone; NOT NULL; default `now()`
- `reply_engine_enabled` boolean; NOT NULL; default `false`
- `reply_engine_enabled_at` timestamp with time zone; nullable

New/changed constraints:

- `business_settings_auto_intents_check`: `CHECK ((auto_intents <@ ARRAY['greeting'::text, 'price'::text, 'availability'::text, 'variants'::text, 'delivery_info'::text, 'order_status'::text, 'alternatives'::text]))`
- `business_settings_auto_intents_not_null`: `NOT NULL auto_intents`
- `business_settings_away_message_check`: `CHECK ((length(away_message) <= 500))`
- `business_settings_away_message_not_null`: `NOT NULL away_message`
- `business_settings_created_at_not_null`: `NOT NULL created_at`
- `business_settings_hours_enabled_not_null`: `NOT NULL hours_enabled`
- `business_settings_id_not_null`: `NOT NULL id`
- `business_settings_pkey`: `PRIMARY KEY (id)`
- `business_settings_reply_engine_enabled_not_null`: `NOT NULL reply_engine_enabled`
- `business_settings_reply_languages_check`: `CHECK (((cardinality(reply_languages) > 0) AND (reply_languages <@ ARRAY['en'::text, 'pcm'::text])))`
- `business_settings_reply_languages_not_null`: `NOT NULL reply_languages`
- `business_settings_revision_check`: `CHECK ((revision > 0))`
- `business_settings_revision_not_null`: `NOT NULL revision`
- `business_settings_timezone_check`: `CHECK ((timezone = 'Africa/Lagos'::text))`
- `business_settings_timezone_not_null`: `NOT NULL timezone`
- `business_settings_vendor_id_fkey`: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`
- `business_settings_vendor_id_id_key`: `UNIQUE (vendor_id, id)`
- `business_settings_vendor_id_key`: `UNIQUE (vendor_id)`
- `business_settings_vendor_id_not_null`: `NOT NULL vendor_id`

Added indexes (including constraint-backed and FK lookup indexes):

- `business_settings_pkey`: `CREATE UNIQUE INDEX business_settings_pkey ON public.business_settings USING btree (id)`
- `business_settings_vendor_id_id_key`: `CREATE UNIQUE INDEX business_settings_vendor_id_id_key ON public.business_settings USING btree (vendor_id, id)`
- `business_settings_vendor_id_key`: `CREATE UNIQUE INDEX business_settings_vendor_id_key ON public.business_settings USING btree (vendor_id)`

## catalogue_drafts — NEW table

Added columns:

- `id` uuid; NOT NULL; default `gen_random_uuid()`
- `vendor_id` uuid; NOT NULL
- `member_id` uuid; NOT NULL
- `request_key` text; NOT NULL
- `drafts` jsonb; NOT NULL
- `expires_at` timestamp with time zone; NOT NULL
- `created_at` timestamp with time zone; NOT NULL; default `now()`

New/changed constraints:

- `catalogue_drafts_created_at_not_null`: `NOT NULL created_at`
- `catalogue_drafts_drafts_check`: `CHECK ((jsonb_typeof(drafts) = 'array'::text))`
- `catalogue_drafts_drafts_not_null`: `NOT NULL drafts`
- `catalogue_drafts_expires_at_not_null`: `NOT NULL expires_at`
- `catalogue_drafts_id_not_null`: `NOT NULL id`
- `catalogue_drafts_member_id_not_null`: `NOT NULL member_id`
- `catalogue_drafts_pkey`: `PRIMARY KEY (id)`
- `catalogue_drafts_request_key_not_null`: `NOT NULL request_key`
- `catalogue_drafts_vendor_id_fkey`: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`
- `catalogue_drafts_vendor_id_id_key`: `UNIQUE (vendor_id, id)`
- `catalogue_drafts_vendor_id_member_id_fkey`: `FOREIGN KEY (vendor_id, member_id) REFERENCES vendor_members(vendor_id, id)`
- `catalogue_drafts_vendor_id_not_null`: `NOT NULL vendor_id`
- `catalogue_drafts_vendor_id_request_key_key`: `UNIQUE (vendor_id, request_key)`

Added indexes (including constraint-backed and FK lookup indexes):

- `b0_fk_catalogue_drafts_vendor_id_member_id_fkey_17166`: `CREATE INDEX b0_fk_catalogue_drafts_vendor_id_member_id_fkey_17166 ON public.catalogue_drafts USING btree (vendor_id, member_id)`
- `catalogue_drafts_pkey`: `CREATE UNIQUE INDEX catalogue_drafts_pkey ON public.catalogue_drafts USING btree (id)`
- `catalogue_drafts_vendor_id_id_key`: `CREATE UNIQUE INDEX catalogue_drafts_vendor_id_id_key ON public.catalogue_drafts USING btree (vendor_id, id)`
- `catalogue_drafts_vendor_id_request_key_key`: `CREATE UNIQUE INDEX catalogue_drafts_vendor_id_request_key_key ON public.catalogue_drafts USING btree (vendor_id, request_key)`

## channel_accounts — extended existing table

Added columns:

- `own_account` boolean; NOT NULL; default `true`
- `updated_at` timestamp with time zone; NOT NULL; default `now()`
- `provider` text; nullable
- `mailbox_hash` text; nullable
- `gmail_history_id` numeric; nullable
- `watch_expires_at` timestamp with time zone; nullable

New/changed constraints:

- `channel_accounts_mailbox_hash_check`: `CHECK ((mailbox_hash ~ '^[0-9a-f]{64}$'::text))`
- `channel_accounts_own_account_check`: `CHECK (own_account)`
- `channel_accounts_own_account_not_null`: `NOT NULL own_account`
- `channel_accounts_provider_check`: `CHECK ((provider = 'gmail'::text))`
- `channel_accounts_status_check`: `CHECK ((status = ANY (ARRAY['connected'::text, 'disconnected'::text, 'expired'::text, 'error'::text])))`
- `channel_accounts_updated_at_not_null`: `NOT NULL updated_at`

Added indexes (including constraint-backed and FK lookup indexes):

- `gmail_mailbox_owner`: `CREATE UNIQUE INDEX gmail_mailbox_owner ON public.channel_accounts USING btree (provider, mailbox_hash) WHERE ((provider = 'gmail'::text) AND (mailbox_hash IS NOT NULL))`

## channel_attempts — NEW table

Added columns:

- `id` uuid; NOT NULL; default `gen_random_uuid()`
- `vendor_id` uuid; NOT NULL
- `channel_account_id` uuid; NOT NULL
- `state_hash` text; NOT NULL
- `status` text; NOT NULL; default `'pending'::text`
- `expires_at` timestamp with time zone; NOT NULL
- `created_at` timestamp with time zone; NOT NULL; default `now()`
- `oauth_context_ciphertext` bytea; nullable
- `oauth_key_version` text; nullable
- `initiating_member_id` uuid; nullable

New/changed constraints:

- `attempt_ttl`: `CHECK (((expires_at > created_at) AND (expires_at <= (created_at + '00:10:00'::interval))))`
- `channel_attempts_channel_account_id_not_null`: `NOT NULL channel_account_id`
- `channel_attempts_created_at_not_null`: `NOT NULL created_at`
- `channel_attempts_expires_at_not_null`: `NOT NULL expires_at`
- `channel_attempts_id_not_null`: `NOT NULL id`
- `channel_attempts_pkey`: `PRIMARY KEY (id)`
- `channel_attempts_state_hash_check`: `CHECK ((state_hash ~ '^[0-9a-f]{64}$'::text))`
- `channel_attempts_state_hash_not_null`: `NOT NULL state_hash`
- `channel_attempts_status_check`: `CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'expired'::text, 'cancelled'::text])))`
- `channel_attempts_status_not_null`: `NOT NULL status`
- `channel_attempts_vendor_id_channel_account_id_fkey`: `FOREIGN KEY (vendor_id, channel_account_id) REFERENCES channel_accounts(vendor_id, id)`
- `channel_attempts_vendor_id_fkey`: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`
- `channel_attempts_vendor_id_id_key`: `UNIQUE (vendor_id, id)`
- `channel_attempts_vendor_id_initiating_member_id_fkey`: `FOREIGN KEY (vendor_id, initiating_member_id) REFERENCES vendor_members(vendor_id, id)`
- `channel_attempts_vendor_id_not_null`: `NOT NULL vendor_id`

Added indexes (including constraint-backed and FK lookup indexes):

- `b0_fk_channel_attempts_vendor_id_channel_account_id_fkey_17597`: `CREATE INDEX b0_fk_channel_attempts_vendor_id_channel_account_id_fkey_17597 ON public.channel_attempts USING btree (vendor_id, channel_account_id)`
- `channel_attempts_pkey`: `CREATE UNIQUE INDEX channel_attempts_pkey ON public.channel_attempts USING btree (id)`
- `channel_attempts_vendor_id_id_key`: `CREATE UNIQUE INDEX channel_attempts_vendor_id_id_key ON public.channel_attempts USING btree (vendor_id, id)`
- `current_channel_attempt`: `CREATE UNIQUE INDEX current_channel_attempt ON public.channel_attempts USING btree (vendor_id, channel_account_id) WHERE (status = 'pending'::text)`
- `gmail_attempt_member_fk`: `CREATE INDEX gmail_attempt_member_fk ON public.channel_attempts USING btree (vendor_id, initiating_member_id)`

## channel_tokens — NEW table

Added columns:

- `id` uuid; NOT NULL; default `gen_random_uuid()`
- `vendor_id` uuid; NOT NULL
- `channel_account_id` uuid; NOT NULL
- `ciphertext` bytea; NOT NULL
- `key_version` text; NOT NULL
- `expires_at` timestamp with time zone; nullable
- `revoked_at` timestamp with time zone; nullable
- `created_at` timestamp with time zone; NOT NULL; default `now()`

New/changed constraints:

- `channel_tokens_channel_account_id_not_null`: `NOT NULL channel_account_id`
- `channel_tokens_ciphertext_check`: `CHECK ((octet_length(ciphertext) > 16))`
- `channel_tokens_ciphertext_not_null`: `NOT NULL ciphertext`
- `channel_tokens_created_at_not_null`: `NOT NULL created_at`
- `channel_tokens_id_not_null`: `NOT NULL id`
- `channel_tokens_key_version_not_null`: `NOT NULL key_version`
- `channel_tokens_pkey`: `PRIMARY KEY (id)`
- `channel_tokens_vendor_id_channel_account_id_fkey`: `FOREIGN KEY (vendor_id, channel_account_id) REFERENCES channel_accounts(vendor_id, id)`
- `channel_tokens_vendor_id_channel_account_id_key`: `UNIQUE (vendor_id, channel_account_id)`
- `channel_tokens_vendor_id_fkey`: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`
- `channel_tokens_vendor_id_id_key`: `UNIQUE (vendor_id, id)`
- `channel_tokens_vendor_id_not_null`: `NOT NULL vendor_id`

Added indexes (including constraint-backed and FK lookup indexes):

- `channel_tokens_pkey`: `CREATE UNIQUE INDEX channel_tokens_pkey ON public.channel_tokens USING btree (id)`
- `channel_tokens_vendor_id_channel_account_id_key`: `CREATE UNIQUE INDEX channel_tokens_vendor_id_channel_account_id_key ON public.channel_tokens USING btree (vendor_id, channel_account_id)`
- `channel_tokens_vendor_id_id_key`: `CREATE UNIQUE INDEX channel_tokens_vendor_id_id_key ON public.channel_tokens USING btree (vendor_id, id)`

## conversation_reads — NEW table

Added columns:

- `id` uuid; NOT NULL; default `gen_random_uuid()`
- `vendor_id` uuid; NOT NULL
- `conversation_id` uuid; NOT NULL
- `member_id` uuid; NOT NULL
- `last_read_at` timestamp with time zone; NOT NULL; default `now()`
- `created_at` timestamp with time zone; NOT NULL; default `now()`

New/changed constraints:

- `conversation_reads_conversation_id_not_null`: `NOT NULL conversation_id`
- `conversation_reads_created_at_not_null`: `NOT NULL created_at`
- `conversation_reads_id_not_null`: `NOT NULL id`
- `conversation_reads_last_read_at_not_null`: `NOT NULL last_read_at`
- `conversation_reads_member_id_not_null`: `NOT NULL member_id`
- `conversation_reads_pkey`: `PRIMARY KEY (id)`
- `conversation_reads_vendor_id_conversation_id_fkey`: `FOREIGN KEY (vendor_id, conversation_id) REFERENCES conversations(vendor_id, id)`
- `conversation_reads_vendor_id_conversation_id_member_id_key`: `UNIQUE (vendor_id, conversation_id, member_id)`
- `conversation_reads_vendor_id_fkey`: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`
- `conversation_reads_vendor_id_id_key`: `UNIQUE (vendor_id, id)`
- `conversation_reads_vendor_id_member_id_fkey`: `FOREIGN KEY (vendor_id, member_id) REFERENCES vendor_members(vendor_id, id)`
- `conversation_reads_vendor_id_not_null`: `NOT NULL vendor_id`

Added indexes (including constraint-backed and FK lookup indexes):

- `b0_fk_conversation_reads_vendor_id_member_id_fkey_17100`: `CREATE INDEX b0_fk_conversation_reads_vendor_id_member_id_fkey_17100 ON public.conversation_reads USING btree (vendor_id, member_id)`
- `conversation_reads_pkey`: `CREATE UNIQUE INDEX conversation_reads_pkey ON public.conversation_reads USING btree (id)`
- `conversation_reads_vendor_id_conversation_id_member_id_key`: `CREATE UNIQUE INDEX conversation_reads_vendor_id_conversation_id_member_id_key ON public.conversation_reads USING btree (vendor_id, conversation_id, member_id)`
- `conversation_reads_vendor_id_id_key`: `CREATE UNIQUE INDEX conversation_reads_vendor_id_id_key ON public.conversation_reads USING btree (vendor_id, id)`

## conversations — extended existing table

Added columns:

- `stage` text; NOT NULL; default `'new'::text`
- `status` text; NOT NULL; default `'open'::text`
- `assigned_member_id` uuid; nullable
- `thread_url` text; nullable
- `suggested_replies` ARRAY; NOT NULL; default `'{}'::text[]`
- `last_message_id` uuid; nullable
- `updated_at` timestamp with time zone; NOT NULL; default `now()`
- `revision` bigint; NOT NULL; default `1`
- `provider_thread_id` text; nullable

New/changed constraints:

- `conversations_revision_check`: `CHECK ((revision > 0))`
- `conversations_revision_not_null`: `NOT NULL revision`
- `conversations_stage_check`: `CHECK ((stage = ANY (ARRAY['new'::text, 'interested'::text, 'ready_to_pay'::text, 'paid'::text, 'cold'::text])))`
- `conversations_stage_not_null`: `NOT NULL stage`
- `conversations_status_check`: `CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text])))`
- `conversations_status_not_null`: `NOT NULL status`
- `conversations_suggested_replies_not_null`: `NOT NULL suggested_replies`
- `conversations_updated_at_not_null`: `NOT NULL updated_at`
- `conversations_vendor_id_assigned_member_id_fkey`: `FOREIGN KEY (vendor_id, assigned_member_id) REFERENCES vendor_members(vendor_id, id)`
- `conversations_vendor_id_customer_id_id_key`: `UNIQUE (vendor_id, customer_id, id)`
- `conversations_vendor_id_id_last_message_id_fkey`: `FOREIGN KEY (vendor_id, id, last_message_id) REFERENCES messages(vendor_id, conversation_id, id)`

Added indexes (including constraint-backed and FK lookup indexes):

- `b0_fk_conversations_vendor_id_id_last_message_id_fkey_16509`: `CREATE INDEX b0_fk_conversations_vendor_id_id_last_message_id_fkey_16509 ON public.conversations USING btree (vendor_id, id, last_message_id)`
- `conversations_vendor_id_customer_id_id_key`: `CREATE UNIQUE INDEX conversations_vendor_id_customer_id_id_key ON public.conversations USING btree (vendor_id, customer_id, id)`
- `gmail_thread_identity`: `CREATE UNIQUE INDEX gmail_thread_identity ON public.conversations USING btree (vendor_id, channel_account_id, provider_thread_id) WHERE (provider_thread_id IS NOT NULL)`
- `inbox_assignee_cursor`: `CREATE INDEX inbox_assignee_cursor ON public.conversations USING btree (vendor_id, assigned_member_id, updated_at DESC, id DESC)`
- `inbox_channel_cursor`: `CREATE INDEX inbox_channel_cursor ON public.conversations USING btree (vendor_id, channel_account_id, updated_at DESC, id DESC)`
- `inbox_cursor`: `CREATE INDEX inbox_cursor ON public.conversations USING btree (vendor_id, updated_at DESC, id DESC)`
- `inbox_stage_cursor`: `CREATE INDEX inbox_stage_cursor ON public.conversations USING btree (vendor_id, stage, updated_at DESC, id DESC)`

## customer_identities — NEW table

Added columns:

- `id` uuid; NOT NULL; default `gen_random_uuid()`
- `vendor_id` uuid; NOT NULL
- `customer_id` uuid; NOT NULL
- `channel_account_id` uuid; NOT NULL
- `external_identity_hash` text; NOT NULL
- `external_identity_ciphertext` bytea; NOT NULL
- `key_version` text; NOT NULL
- `verified_at` timestamp with time zone; nullable
- `created_at` timestamp with time zone; NOT NULL; default `now()`

New/changed constraints:

- `customer_identities_channel_account_id_not_null`: `NOT NULL channel_account_id`
- `customer_identities_created_at_not_null`: `NOT NULL created_at`
- `customer_identities_customer_id_not_null`: `NOT NULL customer_id`
- `customer_identities_external_identity_ciphertext_check`: `CHECK ((octet_length(external_identity_ciphertext) > 16))`
- `customer_identities_external_identity_ciphertext_not_null`: `NOT NULL external_identity_ciphertext`
- `customer_identities_external_identity_hash_check`: `CHECK ((external_identity_hash ~ '^[0-9a-f]{64}$'::text))`
- `customer_identities_external_identity_hash_not_null`: `NOT NULL external_identity_hash`
- `customer_identities_id_not_null`: `NOT NULL id`
- `customer_identities_key_version_not_null`: `NOT NULL key_version`
- `customer_identities_pkey`: `PRIMARY KEY (id)`
- `customer_identities_vendor_id_channel_account_id_external_i_key`: `UNIQUE (vendor_id, channel_account_id, external_identity_hash)`
- `customer_identities_vendor_id_channel_account_id_fkey`: `FOREIGN KEY (vendor_id, channel_account_id) REFERENCES channel_accounts(vendor_id, id)`
- `customer_identities_vendor_id_customer_id_fkey`: `FOREIGN KEY (vendor_id, customer_id) REFERENCES customers(vendor_id, id)`
- `customer_identities_vendor_id_customer_id_id_key`: `UNIQUE (vendor_id, customer_id, id)`
- `customer_identities_vendor_id_fkey`: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`
- `customer_identities_vendor_id_id_key`: `UNIQUE (vendor_id, id)`
- `customer_identities_vendor_id_not_null`: `NOT NULL vendor_id`

Added indexes (including constraint-backed and FK lookup indexes):

- `b0_fk_customer_identities_vendor_id_customer_id_fkey_17305`: `CREATE INDEX b0_fk_customer_identities_vendor_id_customer_id_fkey_17305 ON public.customer_identities USING btree (vendor_id, customer_id)`
- `customer_identities_pkey`: `CREATE UNIQUE INDEX customer_identities_pkey ON public.customer_identities USING btree (id)`
- `customer_identities_vendor_id_channel_account_id_external_i_key`: `CREATE UNIQUE INDEX customer_identities_vendor_id_channel_account_id_external_i_key ON public.customer_identities USING btree (vendor_id, channel_account_id, external_identity_hash)`
- `customer_identities_vendor_id_customer_id_id_key`: `CREATE UNIQUE INDEX customer_identities_vendor_id_customer_id_id_key ON public.customer_identities USING btree (vendor_id, customer_id, id)`
- `customer_identities_vendor_id_id_key`: `CREATE UNIQUE INDEX customer_identities_vendor_id_id_key ON public.customer_identities USING btree (vendor_id, id)`

## customers — extended existing table

Added columns:

- `notes` text; NOT NULL; default `''::text`
- `tags` ARRAY; NOT NULL; default `'{}'::text[]`
- `flagged` boolean; NOT NULL; default `false`
- `city` text; nullable
- `updated_at` timestamp with time zone; NOT NULL; default `now()`
- `merged_into_id` uuid; nullable

New/changed constraints:

- `customer_city`: `CHECK (((city IS NULL) OR (city = ANY (ARRAY['Lagos'::text, 'Abuja'::text, 'Ibadan'::text]))))`
- `customer_no_self_merge`: `CHECK (((merged_into_id IS NULL) OR (merged_into_id <> id)))`
- `customer_tag_bounds`: `CHECK (valid_customer_tags(tags))`
- `customers_flagged_not_null`: `NOT NULL flagged`
- `customers_notes_check`: `CHECK ((length(notes) <= 2000))`
- `customers_notes_not_null`: `NOT NULL notes`
- `customers_tags_check`: `CHECK ((cardinality(tags) <= 10))`
- `customers_tags_not_null`: `NOT NULL tags`
- `customers_updated_at_not_null`: `NOT NULL updated_at`
- `customers_vendor_id_merged_into_id_fkey`: `FOREIGN KEY (vendor_id, merged_into_id) REFERENCES customers(vendor_id, id)`

Added indexes (including constraint-backed and FK lookup indexes):

- `customer_merge_fk`: `CREATE INDEX customer_merge_fk ON public.customers USING btree (vendor_id, merged_into_id)`
- `customers_cursor`: `CREATE INDEX customers_cursor ON public.customers USING btree (vendor_id, created_at DESC, id DESC)`

## delivery_fees — NEW table

Added columns:

- `id` uuid; NOT NULL; default `gen_random_uuid()`
- `vendor_id` uuid; NOT NULL
- `city` text; NOT NULL
- `fee_kobo` bigint; NOT NULL
- `created_at` timestamp with time zone; NOT NULL; default `now()`

New/changed constraints:

- `delivery_fees_city_check`: `CHECK ((city = ANY (ARRAY['Lagos'::text, 'Abuja'::text, 'Ibadan'::text])))`
- `delivery_fees_city_not_null`: `NOT NULL city`
- `delivery_fees_created_at_not_null`: `NOT NULL created_at`
- `delivery_fees_fee_kobo_check`: `CHECK ((fee_kobo >= 0))`
- `delivery_fees_fee_kobo_not_null`: `NOT NULL fee_kobo`
- `delivery_fees_fee_kobo_safe_integer`: `CHECK ((fee_kobo <= '9007199254740991'::bigint))`
- `delivery_fees_id_not_null`: `NOT NULL id`
- `delivery_fees_pkey`: `PRIMARY KEY (id)`
- `delivery_fees_vendor_id_city_key`: `UNIQUE (vendor_id, city)`
- `delivery_fees_vendor_id_fkey`: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`
- `delivery_fees_vendor_id_id_key`: `UNIQUE (vendor_id, id)`
- `delivery_fees_vendor_id_not_null`: `NOT NULL vendor_id`

Added indexes (including constraint-backed and FK lookup indexes):

- `delivery_fees_pkey`: `CREATE UNIQUE INDEX delivery_fees_pkey ON public.delivery_fees USING btree (id)`
- `delivery_fees_vendor_id_city_key`: `CREATE UNIQUE INDEX delivery_fees_vendor_id_city_key ON public.delivery_fees USING btree (vendor_id, city)`
- `delivery_fees_vendor_id_id_key`: `CREATE UNIQUE INDEX delivery_fees_vendor_id_id_key ON public.delivery_fees USING btree (vendor_id, id)`

## domain_events — NEW table

Added columns:

- `id` uuid; NOT NULL; default `gen_random_uuid()`
- `vendor_id` uuid; NOT NULL
- `event_type` text; NOT NULL
- `occurred_at` timestamp with time zone; NOT NULL; default `now()`
- `recorded_at` timestamp with time zone; NOT NULL; default `now()`
- `actor_member_id` uuid; nullable
- `conversation_id` uuid; nullable
- `message_id` uuid; nullable
- `customer_id` uuid; nullable
- `order_id` uuid; nullable
- `product_id` uuid; nullable
- `from_stage` text; nullable
- `to_stage` text; nullable
- `correlation_id` uuid; NOT NULL; default `gen_random_uuid()`
- `dedupe_key` text; NOT NULL
- `created_at` timestamp with time zone; NOT NULL; default `now()`
- `aggregate_revision` bigint; NOT NULL; default `1`
- `from_status` text; nullable
- `to_status` text; nullable
- `amount_kobo` bigint; nullable
- `payment_source` text; nullable
- `receipt_id` uuid; nullable

New/changed constraints:

- `domain_events_aggregate_revision_check`: `CHECK ((aggregate_revision > 0))`
- `domain_events_aggregate_revision_not_null`: `NOT NULL aggregate_revision`
- `domain_events_amount_kobo_check`: `CHECK ((amount_kobo >= 0))`
- `domain_events_amount_kobo_safe_integer`: `CHECK ((amount_kobo <= '9007199254740991'::bigint))`
- `domain_events_check`: `CHECK (((event_type <> 'lead_stage_changed'::text) OR ((conversation_id IS NOT NULL) AND (to_stage IS NOT NULL) AND (from_stage IS DISTINCT FROM to_stage))))`
- `domain_events_correlation_id_not_null`: `NOT NULL correlation_id`
- `domain_events_created_at_not_null`: `NOT NULL created_at`
- `domain_events_dedupe_key_not_null`: `NOT NULL dedupe_key`
- `domain_events_event_type_check`: `CHECK ((event_type = ANY (ARRAY['message_received'::text, 'reply_sent'::text, 'approval_created'::text, 'approval_decided'::text, 'lead_stage_changed'::text, 'order_created'::text, 'order_paid'::text, 'order_status_changed'::text, 'receipt_issued'::text, 'stock_changed'::text, 'takeover_started'::text, 'takeover_ended'::text, 'followup_sent'::text, 'restock_notified'::text, 'channel_connected'::text, 'customer_identity_linked'::text, 'payment_verified'::text])))`
- `domain_events_event_type_not_null`: `NOT NULL event_type`
- `domain_events_from_stage_check`: `CHECK ((from_stage = ANY (ARRAY['new'::text, 'interested'::text, 'ready_to_pay'::text, 'paid'::text, 'cold'::text])))`
- `domain_events_id_not_null`: `NOT NULL id`
- `domain_events_occurred_at_not_null`: `NOT NULL occurred_at`
- `domain_events_payment_source_check`: `CHECK ((payment_source = ANY (ARRAY['vendor'::text, 'paystack'::text])))`
- `domain_events_pkey`: `PRIMARY KEY (id)`
- `domain_events_recorded_at_not_null`: `NOT NULL recorded_at`
- `domain_events_to_stage_check`: `CHECK ((to_stage = ANY (ARRAY['new'::text, 'interested'::text, 'ready_to_pay'::text, 'paid'::text, 'cold'::text])))`
- `domain_events_vendor_id_actor_member_id_fkey`: `FOREIGN KEY (vendor_id, actor_member_id) REFERENCES vendor_members(vendor_id, id)`
- `domain_events_vendor_id_conversation_id_fkey`: `FOREIGN KEY (vendor_id, conversation_id) REFERENCES conversations(vendor_id, id)`
- `domain_events_vendor_id_customer_id_fkey`: `FOREIGN KEY (vendor_id, customer_id) REFERENCES customers(vendor_id, id)`
- `domain_events_vendor_id_dedupe_key_key`: `UNIQUE (vendor_id, dedupe_key)`
- `domain_events_vendor_id_fkey`: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`
- `domain_events_vendor_id_id_key`: `UNIQUE (vendor_id, id)`
- `domain_events_vendor_id_message_id_fkey`: `FOREIGN KEY (vendor_id, message_id) REFERENCES messages(vendor_id, id)`
- `domain_events_vendor_id_not_null`: `NOT NULL vendor_id`
- `domain_events_vendor_id_order_id_fkey`: `FOREIGN KEY (vendor_id, order_id) REFERENCES orders(vendor_id, id)`
- `domain_events_vendor_id_product_id_fkey`: `FOREIGN KEY (vendor_id, product_id) REFERENCES products(vendor_id, id)`
- `domain_events_vendor_id_receipt_id_fkey`: `FOREIGN KEY (vendor_id, receipt_id) REFERENCES receipts(vendor_id, id)`
- `event_required_entity`: `CHECK ((((event_type <> ALL (ARRAY['message_received'::text, 'reply_sent'::text])) OR (message_id IS NOT NULL)) AND ((event_type <> ALL (ARRAY['order_created'::text, 'order_paid'::text, 'order_status_changed'::text, 'payment_verified'::text])) OR (order_id IS NOT NULL)) AND ((event_type <> ALL (ARRAY['takeover_started'::text, 'takeover_ended'::text, 'approval_created'::text, 'approval_decided'::text, 'followup_sent'::text])) OR (conversation_id IS NOT NULL)) AND ((event_type <> 'stock_changed'::text) OR (product_id IS NOT NULL))))`
- `safe_event_status`: `CHECK ((((from_status IS NULL) OR (from_status = ANY (ARRAY['draft'::text, 'awaiting_payment'::text, 'paid'::text, 'preparing'::text, 'out_for_delivery'::text, 'delivered'::text, 'cancelled'::text, 'pending'::text, 'sent'::text, 'edited'::text, 'rejected'::text, 'scheduled'::text, 'failed'::text, 'waiting'::text, 'notified'::text]))) AND ((to_status IS NULL) OR (to_status = ANY (ARRAY['draft'::text, 'awaiting_payment'::text, 'paid'::text, 'preparing'::text, 'out_for_delivery'::text, 'delivered'::text, 'cancelled'::text, 'pending'::text, 'sent'::text, 'edited'::text, 'rejected'::text, 'scheduled'::text, 'failed'::text, 'waiting'::text, 'notified'::text])))))`

Added indexes (including constraint-backed and FK lookup indexes):

- `b0_fk_domain_events_vendor_id_actor_member_id_fkey_18174`: `CREATE INDEX b0_fk_domain_events_vendor_id_actor_member_id_fkey_18174 ON public.domain_events USING btree (vendor_id, actor_member_id)`
- `b0_fk_domain_events_vendor_id_customer_id_fkey_18174`: `CREATE INDEX b0_fk_domain_events_vendor_id_customer_id_fkey_18174 ON public.domain_events USING btree (vendor_id, customer_id)`
- `b0_fk_domain_events_vendor_id_message_id_fkey_18174`: `CREATE INDEX b0_fk_domain_events_vendor_id_message_id_fkey_18174 ON public.domain_events USING btree (vendor_id, message_id)`
- `b0_fk_domain_events_vendor_id_order_id_fkey_18174`: `CREATE INDEX b0_fk_domain_events_vendor_id_order_id_fkey_18174 ON public.domain_events USING btree (vendor_id, order_id)`
- `b0_fk_domain_events_vendor_id_product_id_fkey_18174`: `CREATE INDEX b0_fk_domain_events_vendor_id_product_id_fkey_18174 ON public.domain_events USING btree (vendor_id, product_id)`
- `domain_events_pkey`: `CREATE UNIQUE INDEX domain_events_pkey ON public.domain_events USING btree (id)`
- `domain_events_vendor_id_dedupe_key_key`: `CREATE UNIQUE INDEX domain_events_vendor_id_dedupe_key_key ON public.domain_events USING btree (vendor_id, dedupe_key)`
- `domain_events_vendor_id_id_key`: `CREATE UNIQUE INDEX domain_events_vendor_id_id_key ON public.domain_events USING btree (vendor_id, id)`
- `event_receipt_fk`: `CREATE INDEX event_receipt_fk ON public.domain_events USING btree (vendor_id, receipt_id)`
- `events_cursor`: `CREATE INDEX events_cursor ON public.domain_events USING btree (vendor_id, recorded_at, id)`
- `events_funnel`: `CREATE INDEX events_funnel ON public.domain_events USING btree (vendor_id, conversation_id, occurred_at, id)`
- `events_type_time`: `CREATE INDEX events_type_time ON public.domain_events USING btree (vendor_id, event_type, occurred_at, id)`

## followup_settings — NEW table

Added columns:

- `id` uuid; NOT NULL; default `gen_random_uuid()`
- `vendor_id` uuid; NOT NULL
- `enabled` boolean; NOT NULL; default `false`
- `after_hours` integer; NOT NULL; default `48`
- `style` text; NOT NULL; default `'friendly'::text`
- `created_at` timestamp with time zone; NOT NULL; default `now()`

New/changed constraints:

- `followup_settings_after_hours_check`: `CHECK (((after_hours >= 24) AND (after_hours <= 720)))`
- `followup_settings_after_hours_not_null`: `NOT NULL after_hours`
- `followup_settings_created_at_not_null`: `NOT NULL created_at`
- `followup_settings_enabled_not_null`: `NOT NULL enabled`
- `followup_settings_id_not_null`: `NOT NULL id`
- `followup_settings_pkey`: `PRIMARY KEY (id)`
- `followup_settings_style_check`: `CHECK ((style = ANY (ARRAY['friendly'::text, 'professional'::text, 'Pidgin-friendly'::text])))`
- `followup_settings_style_not_null`: `NOT NULL style`
- `followup_settings_vendor_id_fkey`: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`
- `followup_settings_vendor_id_id_key`: `UNIQUE (vendor_id, id)`
- `followup_settings_vendor_id_key`: `UNIQUE (vendor_id)`
- `followup_settings_vendor_id_not_null`: `NOT NULL vendor_id`

Added indexes (including constraint-backed and FK lookup indexes):

- `followup_settings_pkey`: `CREATE UNIQUE INDEX followup_settings_pkey ON public.followup_settings USING btree (id)`
- `followup_settings_vendor_id_id_key`: `CREATE UNIQUE INDEX followup_settings_vendor_id_id_key ON public.followup_settings USING btree (vendor_id, id)`
- `followup_settings_vendor_id_key`: `CREATE UNIQUE INDEX followup_settings_vendor_id_key ON public.followup_settings USING btree (vendor_id)`

## followups — NEW table

Added columns:

- `id` uuid; NOT NULL; default `gen_random_uuid()`
- `vendor_id` uuid; NOT NULL
- `conversation_id` uuid; NOT NULL
- `customer_id` uuid; NOT NULL
- `scheduled_at` timestamp with time zone; NOT NULL
- `sent_at` timestamp with time zone; nullable
- `status` text; NOT NULL; default `'scheduled'::text`
- `message_style` text; NOT NULL
- `content` text; NOT NULL
- `consent_at` timestamp with time zone; nullable
- `opt_out_at` timestamp with time zone; nullable
- `dedupe_key` text; NOT NULL
- `created_at` timestamp with time zone; NOT NULL; default `now()`
- `message_id` uuid; nullable

New/changed constraints:

- `followups_check`: `CHECK (((status = 'sent'::text) = (sent_at IS NOT NULL)))`
- `followups_content_check`: `CHECK (((length(content) >= 1) AND (length(content) <= 4000)))`
- `followups_content_not_null`: `NOT NULL content`
- `followups_conversation_id_not_null`: `NOT NULL conversation_id`
- `followups_created_at_not_null`: `NOT NULL created_at`
- `followups_customer_id_not_null`: `NOT NULL customer_id`
- `followups_dedupe_key_not_null`: `NOT NULL dedupe_key`
- `followups_id_not_null`: `NOT NULL id`
- `followups_message_style_check`: `CHECK ((message_style = ANY (ARRAY['friendly'::text, 'professional'::text, 'Pidgin-friendly'::text])))`
- `followups_message_style_not_null`: `NOT NULL message_style`
- `followups_pkey`: `PRIMARY KEY (id)`
- `followups_scheduled_at_not_null`: `NOT NULL scheduled_at`
- `followups_status_check`: `CHECK ((status = ANY (ARRAY['scheduled'::text, 'sent'::text, 'cancelled'::text, 'failed'::text])))`
- `followups_status_not_null`: `NOT NULL status`
- `followups_vendor_id_conversation_id_fkey`: `FOREIGN KEY (vendor_id, conversation_id) REFERENCES conversations(vendor_id, id)`
- `followups_vendor_id_customer_id_conversation_id_fkey`: `FOREIGN KEY (vendor_id, customer_id, conversation_id) REFERENCES conversations(vendor_id, customer_id, id)`
- `followups_vendor_id_customer_id_fkey`: `FOREIGN KEY (vendor_id, customer_id) REFERENCES customers(vendor_id, id)`
- `followups_vendor_id_dedupe_key_key`: `UNIQUE (vendor_id, dedupe_key)`
- `followups_vendor_id_fkey`: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`
- `followups_vendor_id_id_key`: `UNIQUE (vendor_id, id)`
- `followups_vendor_id_message_id_fkey`: `FOREIGN KEY (vendor_id, message_id) REFERENCES messages(vendor_id, id)`
- `followups_vendor_id_not_null`: `NOT NULL vendor_id`

Added indexes (including constraint-backed and FK lookup indexes):

- `b0_fk_followups_vendor_id_conversation_id_fkey_17372`: `CREATE INDEX b0_fk_followups_vendor_id_conversation_id_fkey_17372 ON public.followups USING btree (vendor_id, conversation_id)`
- `b0_fk_followups_vendor_id_customer_id_conversation_id_fkey_1737`: `CREATE INDEX b0_fk_followups_vendor_id_customer_id_conversation_id_fkey_1737 ON public.followups USING btree (vendor_id, customer_id, conversation_id)`
- `followup_message_fk`: `CREATE INDEX followup_message_fk ON public.followups USING btree (vendor_id, message_id)`
- `followups_due`: `CREATE INDEX followups_due ON public.followups USING btree (vendor_id, scheduled_at, id) WHERE (status = 'scheduled'::text)`
- `followups_pkey`: `CREATE UNIQUE INDEX followups_pkey ON public.followups USING btree (id)`
- `followups_vendor_id_dedupe_key_key`: `CREATE UNIQUE INDEX followups_vendor_id_dedupe_key_key ON public.followups USING btree (vendor_id, dedupe_key)`
- `followups_vendor_id_id_key`: `CREATE UNIQUE INDEX followups_vendor_id_id_key ON public.followups USING btree (vendor_id, id)`

## helper_links — NEW table

Added columns:

- `id` uuid; NOT NULL; default `gen_random_uuid()`
- `vendor_id` uuid; NOT NULL
- `code_hash` text; NOT NULL
- `status` text; NOT NULL; default `'pending'::text`
- `expires_at` timestamp with time zone; NOT NULL
- `attempts` smallint; NOT NULL; default `0`
- `linked_at` timestamp with time zone; nullable
- `helper_number_ciphertext` bytea; nullable
- `key_version` text; nullable
- `created_at` timestamp with time zone; NOT NULL; default `now()`

New/changed constraints:

- `helper_linked_time`: `CHECK (((status = 'linked'::text) = (linked_at IS NOT NULL)))`
- `helper_links_attempts_check`: `CHECK (((attempts >= 0) AND (attempts <= 5)))`
- `helper_links_attempts_not_null`: `NOT NULL attempts`
- `helper_links_code_hash_check`: `CHECK ((code_hash ~ '^[0-9a-f]{64}$'::text))`
- `helper_links_code_hash_not_null`: `NOT NULL code_hash`
- `helper_links_created_at_not_null`: `NOT NULL created_at`
- `helper_links_expires_at_not_null`: `NOT NULL expires_at`
- `helper_links_id_not_null`: `NOT NULL id`
- `helper_links_pkey`: `PRIMARY KEY (id)`
- `helper_links_status_check`: `CHECK ((status = ANY (ARRAY['pending'::text, 'linked'::text, 'expired'::text, 'invalidated'::text])))`
- `helper_links_status_not_null`: `NOT NULL status`
- `helper_links_vendor_id_fkey`: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`
- `helper_links_vendor_id_id_key`: `UNIQUE (vendor_id, id)`
- `helper_links_vendor_id_not_null`: `NOT NULL vendor_id`
- `helper_ttl`: `CHECK (((expires_at > created_at) AND (expires_at <= (created_at + '00:10:00'::interval))))`

Added indexes (including constraint-backed and FK lookup indexes):

- `current_helper_link`: `CREATE UNIQUE INDEX current_helper_link ON public.helper_links USING btree (vendor_id) WHERE (status = ANY (ARRAY['pending'::text, 'linked'::text]))`
- `helper_links_pkey`: `CREATE UNIQUE INDEX helper_links_pkey ON public.helper_links USING btree (id)`
- `helper_links_vendor_id_id_key`: `CREATE UNIQUE INDEX helper_links_vendor_id_id_key ON public.helper_links USING btree (vendor_id, id)`

## idempotency_keys — NEW table

Added columns:

- `id` uuid; NOT NULL; default `gen_random_uuid()`
- `vendor_id` uuid; NOT NULL
- `operation` text; NOT NULL
- `actor_scope` text; NOT NULL
- `key_hash` text; NOT NULL
- `request_hash` text; NOT NULL
- `status` text; NOT NULL; default `'in_progress'::text`
- `response_ciphertext` bytea; nullable
- `key_version` text; nullable
- `http_status` integer; nullable
- `expires_at` timestamp with time zone; NOT NULL
- `created_at` timestamp with time zone; NOT NULL; default `now()`
- `order_id` uuid; nullable
- `message_id` uuid; nullable
- `receipt_id` uuid; nullable
- `product_id` uuid; nullable

New/changed constraints:

- `idempotency_keys_actor_scope_not_null`: `NOT NULL actor_scope`
- `idempotency_keys_check`: `CHECK (((status <> 'completed'::text) OR ((response_ciphertext IS NOT NULL) AND (key_version IS NOT NULL) AND (http_status IS NOT NULL))))`
- `idempotency_keys_created_at_not_null`: `NOT NULL created_at`
- `idempotency_keys_expires_at_not_null`: `NOT NULL expires_at`
- `idempotency_keys_http_status_check`: `CHECK (((http_status >= 100) AND (http_status <= 599)))`
- `idempotency_keys_id_not_null`: `NOT NULL id`
- `idempotency_keys_key_hash_check`: `CHECK ((key_hash ~ '^[0-9a-f]{64}$'::text))`
- `idempotency_keys_key_hash_not_null`: `NOT NULL key_hash`
- `idempotency_keys_operation_not_null`: `NOT NULL operation`
- `idempotency_keys_pkey`: `PRIMARY KEY (id)`
- `idempotency_keys_request_hash_check`: `CHECK ((request_hash ~ '^[0-9a-f]{64}$'::text))`
- `idempotency_keys_request_hash_not_null`: `NOT NULL request_hash`
- `idempotency_keys_status_check`: `CHECK ((status = ANY (ARRAY['in_progress'::text, 'completed'::text])))`
- `idempotency_keys_status_not_null`: `NOT NULL status`
- `idempotency_keys_vendor_id_actor_scope_operation_key_hash_key`: `UNIQUE (vendor_id, actor_scope, operation, key_hash)`
- `idempotency_keys_vendor_id_fkey`: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`
- `idempotency_keys_vendor_id_id_key`: `UNIQUE (vendor_id, id)`
- `idempotency_keys_vendor_id_message_id_fkey`: `FOREIGN KEY (vendor_id, message_id) REFERENCES messages(vendor_id, id)`
- `idempotency_keys_vendor_id_not_null`: `NOT NULL vendor_id`
- `idempotency_keys_vendor_id_order_id_fkey`: `FOREIGN KEY (vendor_id, order_id) REFERENCES orders(vendor_id, id)`
- `idempotency_keys_vendor_id_product_id_fkey`: `FOREIGN KEY (vendor_id, product_id) REFERENCES products(vendor_id, id)`
- `idempotency_keys_vendor_id_receipt_id_fkey`: `FOREIGN KEY (vendor_id, receipt_id) REFERENCES receipts(vendor_id, id)`

Added indexes (including constraint-backed and FK lookup indexes):

- `idempotency_expiry`: `CREATE INDEX idempotency_expiry ON public.idempotency_keys USING btree (vendor_id, expires_at, id)`
- `idempotency_keys_pkey`: `CREATE UNIQUE INDEX idempotency_keys_pkey ON public.idempotency_keys USING btree (id)`
- `idempotency_keys_vendor_id_actor_scope_operation_key_hash_key`: `CREATE UNIQUE INDEX idempotency_keys_vendor_id_actor_scope_operation_key_hash_key ON public.idempotency_keys USING btree (vendor_id, actor_scope, operation, key_hash)`
- `idempotency_keys_vendor_id_id_key`: `CREATE UNIQUE INDEX idempotency_keys_vendor_id_id_key ON public.idempotency_keys USING btree (vendor_id, id)`
- `idempotency_message_fk`: `CREATE INDEX idempotency_message_fk ON public.idempotency_keys USING btree (vendor_id, message_id)`
- `idempotency_order_fk`: `CREATE INDEX idempotency_order_fk ON public.idempotency_keys USING btree (vendor_id, order_id)`
- `idempotency_product_fk`: `CREATE INDEX idempotency_product_fk ON public.idempotency_keys USING btree (vendor_id, product_id)`
- `idempotency_receipt_fk`: `CREATE INDEX idempotency_receipt_fk ON public.idempotency_keys USING btree (vendor_id, receipt_id)`

## invitation_secrets — NEW table

Added columns:

- `id` uuid; NOT NULL; default `gen_random_uuid()`
- `vendor_id` uuid; NOT NULL
- `invitation_id` uuid; NOT NULL
- `token_hash` text; NOT NULL
- `created_at` timestamp with time zone; NOT NULL; default `now()`

New/changed constraints:

- `invitation_secrets_created_at_not_null`: `NOT NULL created_at`
- `invitation_secrets_id_not_null`: `NOT NULL id`
- `invitation_secrets_invitation_id_not_null`: `NOT NULL invitation_id`
- `invitation_secrets_pkey`: `PRIMARY KEY (id)`
- `invitation_secrets_token_hash_check`: `CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text))`
- `invitation_secrets_token_hash_not_null`: `NOT NULL token_hash`
- `invitation_secrets_vendor_id_fkey`: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`
- `invitation_secrets_vendor_id_id_key`: `UNIQUE (vendor_id, id)`
- `invitation_secrets_vendor_id_invitation_id_fkey`: `FOREIGN KEY (vendor_id, invitation_id) REFERENCES team_invitations(vendor_id, id)`
- `invitation_secrets_vendor_id_invitation_id_key`: `UNIQUE (vendor_id, invitation_id)`
- `invitation_secrets_vendor_id_not_null`: `NOT NULL vendor_id`

Added indexes (including constraint-backed and FK lookup indexes):

- `invitation_secrets_pkey`: `CREATE UNIQUE INDEX invitation_secrets_pkey ON public.invitation_secrets USING btree (id)`
- `invitation_secrets_vendor_id_id_key`: `CREATE UNIQUE INDEX invitation_secrets_vendor_id_id_key ON public.invitation_secrets USING btree (vendor_id, id)`
- `invitation_secrets_vendor_id_invitation_id_key`: `CREATE UNIQUE INDEX invitation_secrets_vendor_id_invitation_id_key ON public.invitation_secrets USING btree (vendor_id, invitation_id)`

## jobs — NEW table

Added columns:

- `id` uuid; NOT NULL; default `gen_random_uuid()`
- `vendor_id` uuid; NOT NULL
- `kind` text; NOT NULL
- `webhook_event_id` uuid; nullable
- `conversation_id` uuid; nullable
- `message_id` uuid; nullable
- `order_id` uuid; nullable
- `status` text; NOT NULL; default `'queued'::text`
- `run_at` timestamp with time zone; NOT NULL; default `now()`
- `locked_until` timestamp with time zone; nullable
- `attempts` integer; NOT NULL; default `0`
- `max_attempts` integer; NOT NULL; default `5`
- `dedupe_key` text; NOT NULL
- `last_error_code` text; nullable
- `created_at` timestamp with time zone; NOT NULL; default `now()`
- `lease_token` uuid; nullable
- `channel_account_id` uuid; nullable
- `approval_id` uuid; nullable
- `followup_id` uuid; nullable
- `reservation_id` uuid; nullable

New/changed constraints:

- `job_attempt_bounds`: `CHECK ((attempts <= max_attempts))`
- `jobs_attempts_check`: `CHECK ((attempts >= 0))`
- `jobs_attempts_not_null`: `NOT NULL attempts`
- `jobs_created_at_not_null`: `NOT NULL created_at`
- `jobs_dedupe_key_not_null`: `NOT NULL dedupe_key`
- `jobs_id_not_null`: `NOT NULL id`
- `jobs_kind_check`: `CHECK ((kind = ANY (ARRAY['ingest'::text, 'send'::text, 'holding_reply'::text, 'followup'::text, 'restock'::text, 'payment'::text, 'receipt'::text, 'usage'::text, 'invitation_email'::text, 'channel_refresh'::text, 'cleanup'::text, 'gmail_sync'::text, 'gmail_watch'::text, 'reservation_expiry'::text, 'takeover_timeout'::text, 'reply'::text])))`
- `jobs_kind_not_null`: `NOT NULL kind`
- `jobs_max_attempts_check`: `CHECK ((max_attempts > 0))`
- `jobs_max_attempts_not_null`: `NOT NULL max_attempts`
- `jobs_pkey`: `PRIMARY KEY (id)`
- `jobs_run_at_not_null`: `NOT NULL run_at`
- `jobs_status_check`: `CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'dead'::text])))`
- `jobs_status_not_null`: `NOT NULL status`
- `jobs_vendor_id_approval_id_fkey`: `FOREIGN KEY (vendor_id, approval_id) REFERENCES approvals(vendor_id, id)`
- `jobs_vendor_id_channel_account_id_fkey`: `FOREIGN KEY (vendor_id, channel_account_id) REFERENCES channel_accounts(vendor_id, id)`
- `jobs_vendor_id_conversation_id_fkey`: `FOREIGN KEY (vendor_id, conversation_id) REFERENCES conversations(vendor_id, id)`
- `jobs_vendor_id_fkey`: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`
- `jobs_vendor_id_followup_id_fkey`: `FOREIGN KEY (vendor_id, followup_id) REFERENCES followups(vendor_id, id)`
- `jobs_vendor_id_id_key`: `UNIQUE (vendor_id, id)`
- `jobs_vendor_id_kind_dedupe_key_key`: `UNIQUE (vendor_id, kind, dedupe_key)`
- `jobs_vendor_id_message_id_fkey`: `FOREIGN KEY (vendor_id, message_id) REFERENCES messages(vendor_id, id)`
- `jobs_vendor_id_not_null`: `NOT NULL vendor_id`
- `jobs_vendor_id_order_id_fkey`: `FOREIGN KEY (vendor_id, order_id) REFERENCES orders(vendor_id, id)`
- `jobs_vendor_id_reservation_id_fkey`: `FOREIGN KEY (vendor_id, reservation_id) REFERENCES stock_reservations(vendor_id, id)`
- `jobs_vendor_id_webhook_event_id_fkey`: `FOREIGN KEY (vendor_id, webhook_event_id) REFERENCES webhook_events(vendor_id, id)`
- `safe_job_error`: `CHECK (((last_error_code IS NULL) OR (last_error_code ~ '^[A-Z0-9_]{1,64}$'::text)))`

Added indexes (including constraint-backed and FK lookup indexes):

- `b0_fk_jobs_vendor_id_conversation_id_fkey_18056`: `CREATE INDEX b0_fk_jobs_vendor_id_conversation_id_fkey_18056 ON public.jobs USING btree (vendor_id, conversation_id)`
- `b0_fk_jobs_vendor_id_message_id_fkey_18056`: `CREATE INDEX b0_fk_jobs_vendor_id_message_id_fkey_18056 ON public.jobs USING btree (vendor_id, message_id)`
- `b0_fk_jobs_vendor_id_order_id_fkey_18056`: `CREATE INDEX b0_fk_jobs_vendor_id_order_id_fkey_18056 ON public.jobs USING btree (vendor_id, order_id)`
- `b0_fk_jobs_vendor_id_webhook_event_id_fkey_18056`: `CREATE INDEX b0_fk_jobs_vendor_id_webhook_event_id_fkey_18056 ON public.jobs USING btree (vendor_id, webhook_event_id)`
- `job_account_fk`: `CREATE INDEX job_account_fk ON public.jobs USING btree (vendor_id, channel_account_id)`
- `job_approval_fk`: `CREATE INDEX job_approval_fk ON public.jobs USING btree (vendor_id, approval_id)`
- `job_followup_fk`: `CREATE INDEX job_followup_fk ON public.jobs USING btree (vendor_id, followup_id)`
- `job_reservation_fk`: `CREATE INDEX job_reservation_fk ON public.jobs USING btree (vendor_id, reservation_id)`
- `jobs_due`: `CREATE INDEX jobs_due ON public.jobs USING btree (vendor_id, run_at, id) WHERE (status = ANY (ARRAY['queued'::text, 'failed'::text]))`
- `jobs_leases`: `CREATE INDEX jobs_leases ON public.jobs USING btree (vendor_id, locked_until, id) WHERE (status = 'running'::text)`
- `jobs_pkey`: `CREATE UNIQUE INDEX jobs_pkey ON public.jobs USING btree (id)`
- `jobs_vendor_id_id_key`: `CREATE UNIQUE INDEX jobs_vendor_id_id_key ON public.jobs USING btree (vendor_id, id)`
- `jobs_vendor_id_kind_dedupe_key_key`: `CREATE UNIQUE INDEX jobs_vendor_id_kind_dedupe_key_key ON public.jobs USING btree (vendor_id, kind, dedupe_key)`

## member_preferences — NEW table

Added columns:

- `id` uuid; NOT NULL; default `gen_random_uuid()`
- `vendor_id` uuid; NOT NULL
- `member_id` uuid; NOT NULL
- `low_data` boolean; NOT NULL; default `false`
- `dark_mode` boolean; NOT NULL; default `false`
- `language` text; NOT NULL; default `'en'::text`
- `ready_to_pay` boolean; NOT NULL; default `true`
- `needs_you` boolean; NOT NULL; default `true`
- `created_at` timestamp with time zone; NOT NULL; default `now()`

New/changed constraints:

- `member_preferences_created_at_not_null`: `NOT NULL created_at`
- `member_preferences_dark_mode_not_null`: `NOT NULL dark_mode`
- `member_preferences_id_not_null`: `NOT NULL id`
- `member_preferences_language_check`: `CHECK ((language = ANY (ARRAY['en'::text, 'pcm'::text])))`
- `member_preferences_language_not_null`: `NOT NULL language`
- `member_preferences_low_data_not_null`: `NOT NULL low_data`
- `member_preferences_member_id_not_null`: `NOT NULL member_id`
- `member_preferences_needs_you_not_null`: `NOT NULL needs_you`
- `member_preferences_pkey`: `PRIMARY KEY (id)`
- `member_preferences_ready_to_pay_not_null`: `NOT NULL ready_to_pay`
- `member_preferences_vendor_id_fkey`: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`
- `member_preferences_vendor_id_id_key`: `UNIQUE (vendor_id, id)`
- `member_preferences_vendor_id_member_id_fkey`: `FOREIGN KEY (vendor_id, member_id) REFERENCES vendor_members(vendor_id, id)`
- `member_preferences_vendor_id_member_id_key`: `UNIQUE (vendor_id, member_id)`
- `member_preferences_vendor_id_not_null`: `NOT NULL vendor_id`

Added indexes (including constraint-backed and FK lookup indexes):

- `member_preferences_pkey`: `CREATE UNIQUE INDEX member_preferences_pkey ON public.member_preferences USING btree (id)`
- `member_preferences_vendor_id_id_key`: `CREATE UNIQUE INDEX member_preferences_vendor_id_id_key ON public.member_preferences USING btree (vendor_id, id)`
- `member_preferences_vendor_id_member_id_key`: `CREATE UNIQUE INDEX member_preferences_vendor_id_member_id_key ON public.member_preferences USING btree (vendor_id, member_id)`

## message_deliveries — NEW table

Added columns:

- `id` uuid; NOT NULL; default `gen_random_uuid()`
- `vendor_id` uuid; NOT NULL
- `message_id` uuid; NOT NULL
- `channel_account_id` uuid; NOT NULL
- `provider_message_id` text; nullable
- `status` text; NOT NULL; default `'queued'::text`
- `attempt` integer; NOT NULL; default `0`
- `error_code` text; nullable
- `sent_at` timestamp with time zone; nullable
- `delivered_at` timestamp with time zone; nullable
- `read_at` timestamp with time zone; nullable
- `dedupe_key` text; NOT NULL
- `created_at` timestamp with time zone; NOT NULL; default `now()`

New/changed constraints:

- `delivery_time_order`: `CHECK ((((delivered_at IS NULL) OR (sent_at IS NULL) OR (delivered_at >= sent_at)) AND ((read_at IS NULL) OR (delivered_at IS NULL) OR (read_at >= delivered_at))))`
- `message_deliveries_attempt_check`: `CHECK ((attempt >= 0))`
- `message_deliveries_attempt_not_null`: `NOT NULL attempt`
- `message_deliveries_channel_account_id_not_null`: `NOT NULL channel_account_id`
- `message_deliveries_created_at_not_null`: `NOT NULL created_at`
- `message_deliveries_dedupe_key_not_null`: `NOT NULL dedupe_key`
- `message_deliveries_id_not_null`: `NOT NULL id`
- `message_deliveries_message_id_not_null`: `NOT NULL message_id`
- `message_deliveries_pkey`: `PRIMARY KEY (id)`
- `message_deliveries_status_check`: `CHECK ((status = ANY (ARRAY['queued'::text, 'sending'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'failed'::text])))`
- `message_deliveries_status_not_null`: `NOT NULL status`
- `message_deliveries_vendor_id_channel_account_id_fkey`: `FOREIGN KEY (vendor_id, channel_account_id) REFERENCES channel_accounts(vendor_id, id)`
- `message_deliveries_vendor_id_channel_account_id_provider_me_key`: `UNIQUE (vendor_id, channel_account_id, provider_message_id)`
- `message_deliveries_vendor_id_dedupe_key_key`: `UNIQUE (vendor_id, dedupe_key)`
- `message_deliveries_vendor_id_fkey`: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`
- `message_deliveries_vendor_id_id_key`: `UNIQUE (vendor_id, id)`
- `message_deliveries_vendor_id_message_id_fkey`: `FOREIGN KEY (vendor_id, message_id) REFERENCES messages(vendor_id, id)`
- `message_deliveries_vendor_id_not_null`: `NOT NULL vendor_id`
- `safe_delivery_error`: `CHECK (((error_code IS NULL) OR (error_code ~ '^[A-Z0-9_]{1,64}$'::text)))`

Added indexes (including constraint-backed and FK lookup indexes):

- `b0_fk_message_deliveries_vendor_id_message_id_fkey_17975`: `CREATE INDEX b0_fk_message_deliveries_vendor_id_message_id_fkey_17975 ON public.message_deliveries USING btree (vendor_id, message_id)`
- `message_deliveries_pkey`: `CREATE UNIQUE INDEX message_deliveries_pkey ON public.message_deliveries USING btree (id)`
- `message_deliveries_vendor_id_channel_account_id_provider_me_key`: `CREATE UNIQUE INDEX message_deliveries_vendor_id_channel_account_id_provider_me_key ON public.message_deliveries USING btree (vendor_id, channel_account_id, provider_message_id)`
- `message_deliveries_vendor_id_dedupe_key_key`: `CREATE UNIQUE INDEX message_deliveries_vendor_id_dedupe_key_key ON public.message_deliveries USING btree (vendor_id, dedupe_key)`
- `message_deliveries_vendor_id_id_key`: `CREATE UNIQUE INDEX message_deliveries_vendor_id_id_key ON public.message_deliveries USING btree (vendor_id, id)`

## messages — extended existing table

Added columns:

- `kind` text; NOT NULL; default `'text'::text`
- `voice_transcript` text; nullable
- `voice_duration_seconds` integer; nullable
- `audio_storage_key` text; nullable
- `english_summary` text; nullable
- `product_snapshot` jsonb; nullable
- `order_snapshot` jsonb; nullable
- `revision` bigint; NOT NULL; default `1`
- `updated_at` timestamp with time zone; NOT NULL; default `now()`
- `provider_message_id` text; nullable
- `rfc_message_id` text; nullable
- `email_subject` text; nullable
- `reply_to_message_id` uuid; nullable
- `delivery_error_code` text; nullable
- `provider_account_id` uuid; nullable
- `reply_context` jsonb; nullable
- `lane` text; nullable
- `lane_reason` text; nullable
- `detected_language` text; nullable
- `detection_confidence` numeric; nullable

New/changed constraints:

- `messages_delivery_error_code_check`: `CHECK ((delivery_error_code ~ '^[A-Z0-9_]{1,64}$'::text))`
- `messages_detected_language_check`: `CHECK ((detected_language = ANY (ARRAY['en'::text, 'pcm'::text, 'mixed'::text, 'other'::text])))`
- `messages_detection_confidence_check`: `CHECK (((detection_confidence >= (0)::numeric) AND (detection_confidence <= (1)::numeric)))`
- `messages_kind_check`: `CHECK ((kind = ANY (ARRAY['text'::text, 'voice'::text])))`
- `messages_kind_not_null`: `NOT NULL kind`
- `messages_lane_check`: `CHECK ((lane = ANY (ARRAY['auto'::text, 'approval'::text, 'paused'::text])))`
- `messages_revision_check`: `CHECK ((revision > 0))`
- `messages_revision_not_null`: `NOT NULL revision`
- `messages_status_check`: `CHECK ((status = ANY (ARRAY['received'::text, 'draft'::text, 'pending_approval'::text, 'blocked'::text, 'queued'::text, 'sending'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'failed'::text])))`
- `messages_thread_identity`: `UNIQUE (vendor_id, conversation_id, id)`
- `messages_updated_at_not_null`: `NOT NULL updated_at`
- `messages_vendor_id_provider_account_id_fkey`: `FOREIGN KEY (vendor_id, provider_account_id) REFERENCES channel_accounts(vendor_id, id)`
- `messages_vendor_id_reply_to_message_id_fkey`: `FOREIGN KEY (vendor_id, reply_to_message_id) REFERENCES messages(vendor_id, id)`
- `messages_voice_duration_seconds_check`: `CHECK ((voice_duration_seconds > 0))`
- `order_snapshot_shape`: `CHECK (((order_snapshot IS NULL) OR (jsonb_typeof(order_snapshot) = 'object'::text)))`
- `product_snapshot_shape`: `CHECK (((product_snapshot IS NULL) OR (jsonb_typeof(product_snapshot) = 'object'::text)))`
- `voice_shape`: `CHECK (((kind <> 'voice'::text) OR ((voice_duration_seconds IS NOT NULL) AND (voice_transcript IS NOT NULL))))`

Added indexes (including constraint-backed and FK lookup indexes):

- `gmail_message_dedupe`: `CREATE UNIQUE INDEX gmail_message_dedupe ON public.messages USING btree (vendor_id, provider_account_id, provider_message_id) WHERE (provider_message_id IS NOT NULL)`
- `message_provider_account_fk`: `CREATE INDEX message_provider_account_fk ON public.messages USING btree (vendor_id, provider_account_id)`
- `message_reply_fk`: `CREATE INDEX message_reply_fk ON public.messages USING btree (vendor_id, reply_to_message_id)`
- `messages_thread_identity`: `CREATE UNIQUE INDEX messages_thread_identity ON public.messages USING btree (vendor_id, conversation_id, id)`
- `thread_cursor`: `CREATE INDEX thread_cursor ON public.messages USING btree (vendor_id, conversation_id, created_at DESC, id DESC)`

## moderation_flags — NEW table

Added columns:

- `id` uuid; NOT NULL; default `gen_random_uuid()`
- `vendor_id` uuid; NOT NULL
- `message_id` uuid; NOT NULL
- `reason` text; NOT NULL
- `status` text; NOT NULL; default `'flagged'::text`
- `decided_by` uuid; nullable
- `decided_at` timestamp with time zone; nullable
- `created_at` timestamp with time zone; NOT NULL; default `now()`

New/changed constraints:

- `moderation_flags_created_at_not_null`: `NOT NULL created_at`
- `moderation_flags_id_not_null`: `NOT NULL id`
- `moderation_flags_message_id_not_null`: `NOT NULL message_id`
- `moderation_flags_pkey`: `PRIMARY KEY (id)`
- `moderation_flags_reason_check`: `CHECK (((length(reason) >= 1) AND (length(reason) <= 500)))`
- `moderation_flags_reason_not_null`: `NOT NULL reason`
- `moderation_flags_status_check`: `CHECK ((status = ANY (ARRAY['flagged'::text, 'cleared'::text, 'blocked'::text])))`
- `moderation_flags_status_not_null`: `NOT NULL status`
- `moderation_flags_vendor_id_decided_by_fkey`: `FOREIGN KEY (vendor_id, decided_by) REFERENCES vendor_members(vendor_id, id)`
- `moderation_flags_vendor_id_fkey`: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`
- `moderation_flags_vendor_id_id_key`: `UNIQUE (vendor_id, id)`
- `moderation_flags_vendor_id_message_id_fkey`: `FOREIGN KEY (vendor_id, message_id) REFERENCES messages(vendor_id, id)`
- `moderation_flags_vendor_id_not_null`: `NOT NULL vendor_id`

Added indexes (including constraint-backed and FK lookup indexes):

- `b0_fk_moderation_flags_vendor_id_decided_by_fkey_17415`: `CREATE INDEX b0_fk_moderation_flags_vendor_id_decided_by_fkey_17415 ON public.moderation_flags USING btree (vendor_id, decided_by)`
- `b0_fk_moderation_flags_vendor_id_message_id_fkey_17415`: `CREATE INDEX b0_fk_moderation_flags_vendor_id_message_id_fkey_17415 ON public.moderation_flags USING btree (vendor_id, message_id)`
- `moderation_flags_pkey`: `CREATE UNIQUE INDEX moderation_flags_pkey ON public.moderation_flags USING btree (id)`
- `moderation_flags_vendor_id_id_key`: `CREATE UNIQUE INDEX moderation_flags_vendor_id_id_key ON public.moderation_flags USING btree (vendor_id, id)`

## notifications — NEW table

Added columns:

- `id` uuid; NOT NULL; default `gen_random_uuid()`
- `vendor_id` uuid; NOT NULL
- `member_id` uuid; NOT NULL
- `conversation_id` uuid; nullable
- `approval_id` uuid; nullable
- `kind` text; NOT NULL
- `read_at` timestamp with time zone; nullable
- `dedupe_key` text; NOT NULL
- `created_at` timestamp with time zone; NOT NULL; default `now()`

New/changed constraints:

- `notifications_created_at_not_null`: `NOT NULL created_at`
- `notifications_dedupe_key_not_null`: `NOT NULL dedupe_key`
- `notifications_id_not_null`: `NOT NULL id`
- `notifications_kind_check`: `CHECK ((kind = ANY (ARRAY['ready_to_pay'::text, 'needs_you'::text, 'restock'::text, 'system'::text])))`
- `notifications_kind_not_null`: `NOT NULL kind`
- `notifications_member_id_not_null`: `NOT NULL member_id`
- `notifications_pkey`: `PRIMARY KEY (id)`
- `notifications_vendor_id_approval_id_fkey`: `FOREIGN KEY (vendor_id, approval_id) REFERENCES approvals(vendor_id, id)`
- `notifications_vendor_id_conversation_id_fkey`: `FOREIGN KEY (vendor_id, conversation_id) REFERENCES conversations(vendor_id, id)`
- `notifications_vendor_id_fkey`: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`
- `notifications_vendor_id_id_key`: `UNIQUE (vendor_id, id)`
- `notifications_vendor_id_member_id_dedupe_key_key`: `UNIQUE (vendor_id, member_id, dedupe_key)`
- `notifications_vendor_id_member_id_fkey`: `FOREIGN KEY (vendor_id, member_id) REFERENCES vendor_members(vendor_id, id)`
- `notifications_vendor_id_not_null`: `NOT NULL vendor_id`

Added indexes (including constraint-backed and FK lookup indexes):

- `b0_fk_notifications_vendor_id_approval_id_fkey_17527`: `CREATE INDEX b0_fk_notifications_vendor_id_approval_id_fkey_17527 ON public.notifications USING btree (vendor_id, approval_id)`
- `b0_fk_notifications_vendor_id_conversation_id_fkey_17527`: `CREATE INDEX b0_fk_notifications_vendor_id_conversation_id_fkey_17527 ON public.notifications USING btree (vendor_id, conversation_id)`
- `notifications_cursor`: `CREATE INDEX notifications_cursor ON public.notifications USING btree (vendor_id, member_id, created_at DESC, id DESC)`
- `notifications_pkey`: `CREATE UNIQUE INDEX notifications_pkey ON public.notifications USING btree (id)`
- `notifications_unread`: `CREATE INDEX notifications_unread ON public.notifications USING btree (vendor_id, member_id, created_at DESC, id DESC) WHERE (read_at IS NULL)`
- `notifications_vendor_id_id_key`: `CREATE UNIQUE INDEX notifications_vendor_id_id_key ON public.notifications USING btree (vendor_id, id)`
- `notifications_vendor_id_member_id_dedupe_key_key`: `CREATE UNIQUE INDEX notifications_vendor_id_member_id_dedupe_key_key ON public.notifications USING btree (vendor_id, member_id, dedupe_key)`

## order_items — extended existing table

Added columns:

- `name_snapshot` text; NOT NULL; default `''::text`
- `variant_name_snapshot` text; nullable
- `snapshot_source` text; NOT NULL; default `'order_creation'::text`

New/changed constraints:

- `order_items_name_snapshot_not_null`: `NOT NULL name_snapshot`
- `order_items_snapshot_source_check`: `CHECK ((snapshot_source = ANY (ARRAY['order_creation'::text, 'legacy_migration'::text])))`
- `order_items_snapshot_source_not_null`: `NOT NULL snapshot_source`
- `order_items_unit_price_kobo_safe_integer`: `CHECK ((unit_price_kobo <= '9007199254740991'::bigint))`
- `order_items_vendor_id_order_id_id_key`: `UNIQUE (vendor_id, order_id, id)`
- `order_items_vendor_id_order_id_product_id_id_key`: `UNIQUE (vendor_id, order_id, product_id, id)`

Added indexes (including constraint-backed and FK lookup indexes):

- `b0_fk_order_items_vendor_id_product_id_fkey_16673`: `CREATE INDEX b0_fk_order_items_vendor_id_product_id_fkey_16673 ON public.order_items USING btree (vendor_id, product_id)`
- `b0_fk_order_items_vendor_id_product_id_variant_id_fkey_16673`: `CREATE INDEX b0_fk_order_items_vendor_id_product_id_variant_id_fkey_16673 ON public.order_items USING btree (vendor_id, product_id, variant_id)`
- `order_items_vendor_id_order_id_id_key`: `CREATE UNIQUE INDEX order_items_vendor_id_order_id_id_key ON public.order_items USING btree (vendor_id, order_id, id)`
- `order_items_vendor_id_order_id_product_id_id_key`: `CREATE UNIQUE INDEX order_items_vendor_id_order_id_product_id_id_key ON public.order_items USING btree (vendor_id, order_id, product_id, id)`

## order_timeline — NEW table

Added columns:

- `id` uuid; NOT NULL; default `gen_random_uuid()`
- `vendor_id` uuid; NOT NULL
- `order_id` uuid; NOT NULL
- `label` text; NOT NULL
- `customer_message_id` uuid; nullable
- `occurred_at` timestamp with time zone; NOT NULL; default `now()`
- `created_at` timestamp with time zone; NOT NULL; default `now()`

New/changed constraints:

- `order_timeline_created_at_not_null`: `NOT NULL created_at`
- `order_timeline_id_not_null`: `NOT NULL id`
- `order_timeline_label_not_null`: `NOT NULL label`
- `order_timeline_occurred_at_not_null`: `NOT NULL occurred_at`
- `order_timeline_order_id_not_null`: `NOT NULL order_id`
- `order_timeline_pkey`: `PRIMARY KEY (id)`
- `order_timeline_vendor_id_customer_message_id_fkey`: `FOREIGN KEY (vendor_id, customer_message_id) REFERENCES messages(vendor_id, id)`
- `order_timeline_vendor_id_fkey`: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`
- `order_timeline_vendor_id_id_key`: `UNIQUE (vendor_id, id)`
- `order_timeline_vendor_id_not_null`: `NOT NULL vendor_id`
- `order_timeline_vendor_id_order_id_fkey`: `FOREIGN KEY (vendor_id, order_id) REFERENCES orders(vendor_id, id)`

Added indexes (including constraint-backed and FK lookup indexes):

- `b0_fk_order_timeline_vendor_id_customer_message_id_fkey_17942`: `CREATE INDEX b0_fk_order_timeline_vendor_id_customer_message_id_fkey_17942 ON public.order_timeline USING btree (vendor_id, customer_message_id)`
- `b0_fk_order_timeline_vendor_id_order_id_fkey_17942`: `CREATE INDEX b0_fk_order_timeline_vendor_id_order_id_fkey_17942 ON public.order_timeline USING btree (vendor_id, order_id)`
- `order_timeline_pkey`: `CREATE UNIQUE INDEX order_timeline_pkey ON public.order_timeline USING btree (id)`
- `order_timeline_vendor_id_id_key`: `CREATE UNIQUE INDEX order_timeline_vendor_id_id_key ON public.order_timeline USING btree (vendor_id, id)`

## orders — extended existing table

Added columns:

- `conversation_id` uuid; nullable
- `delivery_address` text; NOT NULL; default `''::text`
- `payment_screenshot_received` boolean; NOT NULL; default `false`
- `payment_link` text; nullable
- `paid_at` timestamp with time zone; nullable
- `revision` bigint; NOT NULL; default `1`
- `updated_at` timestamp with time zone; NOT NULL; default `now()`
- `paid_at_source` text; nullable

New/changed constraints:

- `order_paid_state`: `CHECK (((status <> ALL (ARRAY['paid'::text, 'preparing'::text, 'out_for_delivery'::text, 'delivered'::text])) OR (payment_status = 'paid'::text)))`
- `orders_delivery_address_not_null`: `NOT NULL delivery_address`
- `orders_delivery_fee_kobo_safe_integer`: `CHECK ((delivery_fee_kobo <= '9007199254740991'::bigint))`
- `orders_paid_at_source_check`: `CHECK ((paid_at_source = ANY (ARRAY['verified'::text, 'legacy_creation'::text])))`
- `orders_payment_screenshot_received_not_null`: `NOT NULL payment_screenshot_received`
- `orders_revision_check`: `CHECK ((revision > 0))`
- `orders_revision_not_null`: `NOT NULL revision`
- `orders_status_check`: `CHECK ((status = ANY (ARRAY['draft'::text, 'awaiting_payment'::text, 'paid'::text, 'preparing'::text, 'out_for_delivery'::text, 'delivered'::text, 'cancelled'::text])))`
- `orders_total_kobo_safe_integer`: `CHECK ((total_kobo <= '9007199254740991'::bigint))`
- `orders_updated_at_not_null`: `NOT NULL updated_at`
- `orders_vendor_id_conversation_id_fkey`: `FOREIGN KEY (vendor_id, conversation_id) REFERENCES conversations(vendor_id, id)`
- `orders_vendor_id_customer_id_conversation_id_fkey`: `FOREIGN KEY (vendor_id, customer_id, conversation_id) REFERENCES conversations(vendor_id, customer_id, id)`

Added indexes (including constraint-backed and FK lookup indexes):

- `b0_fk_orders_vendor_id_conversation_id_fkey_16634`: `CREATE INDEX b0_fk_orders_vendor_id_conversation_id_fkey_16634 ON public.orders USING btree (vendor_id, conversation_id)`
- `order_conversation_customer_fk`: `CREATE INDEX order_conversation_customer_fk ON public.orders USING btree (vendor_id, customer_id, conversation_id)`
- `orders_cursor`: `CREATE INDEX orders_cursor ON public.orders USING btree (vendor_id, created_at DESC, id DESC)`
- `orders_customer_cursor`: `CREATE INDEX orders_customer_cursor ON public.orders USING btree (vendor_id, customer_id, created_at DESC, id DESC)`
- `orders_status_cursor`: `CREATE INDEX orders_status_cursor ON public.orders USING btree (vendor_id, status, created_at DESC, id DESC)`
- `payment_reference_unique`: `CREATE UNIQUE INDEX payment_reference_unique ON public.orders USING btree (vendor_id, payment_source, payment_reference) WHERE (payment_reference IS NOT NULL)`

## payments — NEW table

Added columns:

- `id` uuid; NOT NULL; default `gen_random_uuid()`
- `vendor_id` uuid; NOT NULL
- `order_id` uuid; NOT NULL
- `source` text; NOT NULL
- `amount_kobo` bigint; NOT NULL
- `reference` text; NOT NULL
- `verified_at` timestamp with time zone; NOT NULL
- `verified_by` uuid; nullable
- `created_at` timestamp with time zone; NOT NULL; default `now()`

New/changed constraints:

- `payments_amount_kobo_check`: `CHECK ((amount_kobo > 0))`
- `payments_amount_kobo_not_null`: `NOT NULL amount_kobo`
- `payments_amount_kobo_safe_integer`: `CHECK ((amount_kobo <= '9007199254740991'::bigint))`
- `payments_created_at_not_null`: `NOT NULL created_at`
- `payments_id_not_null`: `NOT NULL id`
- `payments_order_id_not_null`: `NOT NULL order_id`
- `payments_pkey`: `PRIMARY KEY (id)`
- `payments_reference_not_null`: `NOT NULL reference`
- `payments_source_check`: `CHECK ((source = ANY (ARRAY['vendor'::text, 'paystack'::text])))`
- `payments_source_not_null`: `NOT NULL source`
- `payments_vendor_id_fkey`: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`
- `payments_vendor_id_id_key`: `UNIQUE (vendor_id, id)`
- `payments_vendor_id_not_null`: `NOT NULL vendor_id`
- `payments_vendor_id_order_id_fkey`: `FOREIGN KEY (vendor_id, order_id) REFERENCES orders(vendor_id, id)`
- `payments_vendor_id_source_reference_key`: `UNIQUE (vendor_id, source, reference)`
- `payments_vendor_id_verified_by_fkey`: `FOREIGN KEY (vendor_id, verified_by) REFERENCES vendor_members(vendor_id, id)`
- `payments_verified_at_not_null`: `NOT NULL verified_at`

Added indexes (including constraint-backed and FK lookup indexes):

- `b0_fk_payments_vendor_id_order_id_fkey_17809`: `CREATE INDEX b0_fk_payments_vendor_id_order_id_fkey_17809 ON public.payments USING btree (vendor_id, order_id)`
- `b0_fk_payments_vendor_id_verified_by_fkey_17809`: `CREATE INDEX b0_fk_payments_vendor_id_verified_by_fkey_17809 ON public.payments USING btree (vendor_id, verified_by)`
- `payments_pkey`: `CREATE UNIQUE INDEX payments_pkey ON public.payments USING btree (id)`
- `payments_vendor_id_id_key`: `CREATE UNIQUE INDEX payments_vendor_id_id_key ON public.payments USING btree (vendor_id, id)`
- `payments_vendor_id_source_reference_key`: `CREATE UNIQUE INDEX payments_vendor_id_source_reference_key ON public.payments USING btree (vendor_id, source, reference)`

## product_photos — NEW table

Added columns:

- `id` uuid; NOT NULL; default `gen_random_uuid()`
- `vendor_id` uuid; NOT NULL
- `product_id` uuid; NOT NULL
- `storage_key` text; NOT NULL
- `name` text; NOT NULL
- `position` smallint; NOT NULL
- `width` integer; nullable
- `height` integer; nullable
- `created_at` timestamp with time zone; NOT NULL; default `now()`

New/changed constraints:

- `product_photos_created_at_not_null`: `NOT NULL created_at`
- `product_photos_height_check`: `CHECK ((height > 0))`
- `product_photos_id_not_null`: `NOT NULL id`
- `product_photos_name_not_null`: `NOT NULL name`
- `product_photos_pkey`: `PRIMARY KEY (id)`
- `product_photos_position_check`: `CHECK ((("position" >= 0) AND ("position" <= 9)))`
- `product_photos_position_not_null`: `NOT NULL "position"`
- `product_photos_product_id_not_null`: `NOT NULL product_id`
- `product_photos_storage_key_not_null`: `NOT NULL storage_key`
- `product_photos_vendor_id_fkey`: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`
- `product_photos_vendor_id_id_key`: `UNIQUE (vendor_id, id)`
- `product_photos_vendor_id_not_null`: `NOT NULL vendor_id`
- `product_photos_vendor_id_product_id_fkey`: `FOREIGN KEY (vendor_id, product_id) REFERENCES products(vendor_id, id)`
- `product_photos_vendor_id_product_id_position_key`: `UNIQUE (vendor_id, product_id, "position")`
- `product_photos_width_check`: `CHECK ((width > 0))`

Added indexes (including constraint-backed and FK lookup indexes):

- `product_photos_pkey`: `CREATE UNIQUE INDEX product_photos_pkey ON public.product_photos USING btree (id)`
- `product_photos_vendor_id_id_key`: `CREATE UNIQUE INDEX product_photos_vendor_id_id_key ON public.product_photos USING btree (vendor_id, id)`
- `product_photos_vendor_id_product_id_position_key`: `CREATE UNIQUE INDEX product_photos_vendor_id_product_id_position_key ON public.product_photos USING btree (vendor_id, product_id, "position")`

## product_variants — extended existing table

Added columns:

- `revision` bigint; NOT NULL; default `1`

New/changed constraints:

- `product_variants_price_kobo_safe_integer`: `CHECK ((price_kobo <= '9007199254740991'::bigint))`
- `product_variants_revision_check`: `CHECK ((revision > 0))`
- `product_variants_revision_not_null`: `NOT NULL revision`

Added indexes (including constraint-backed and FK lookup indexes):



## products — extended existing table

Added columns:

- `category` text; NOT NULL; default `'Custom'::text`
- `details` jsonb; NOT NULL; default `'{"sizes": [], "portion": "", "prepMinutes": null, "durationMinutes": null}'::jsonb`
- `low_stock_threshold` integer; NOT NULL; default `5`
- `archived` boolean; NOT NULL; default `false`
- `revision` bigint; NOT NULL; default `1`
- `updated_at` timestamp with time zone; NOT NULL; default `now()`

New/changed constraints:

- `products_archived_not_null`: `NOT NULL archived`
- `products_category_check`: `CHECK ((category = ANY (ARRAY['Fashion'::text, 'Shoes'::text, 'Beauty'::text, 'Food & drink'::text, 'Home'::text, 'Accessories'::text, 'Services'::text, 'Custom'::text])))`
- `products_category_not_null`: `NOT NULL category`
- `products_details_check`: `CHECK ((jsonb_typeof(details) = 'object'::text))`
- `products_details_not_null`: `NOT NULL details`
- `products_low_stock_threshold_check`: `CHECK ((low_stock_threshold >= 0))`
- `products_low_stock_threshold_not_null`: `NOT NULL low_stock_threshold`
- `products_lowest_price_kobo_safe_integer`: `CHECK ((lowest_price_kobo <= '9007199254740991'::bigint))`
- `products_price_kobo_safe_integer`: `CHECK ((price_kobo <= '9007199254740991'::bigint))`
- `products_revision_check`: `CHECK ((revision > 0))`
- `products_revision_not_null`: `NOT NULL revision`
- `products_updated_at_not_null`: `NOT NULL updated_at`

Added indexes (including constraint-backed and FK lookup indexes):

- `catalogue_cursor`: `CREATE INDEX catalogue_cursor ON public.products USING btree (vendor_id, archived, category, created_at DESC, id DESC)`

## receipt_shares — NEW table

Added columns:

- `id` uuid; NOT NULL; default `gen_random_uuid()`
- `vendor_id` uuid; NOT NULL
- `receipt_id` uuid; NOT NULL
- `token_hash` text; NOT NULL
- `expires_at` timestamp with time zone; NOT NULL
- `revoked_at` timestamp with time zone; nullable
- `created_at` timestamp with time zone; NOT NULL; default `now()`

New/changed constraints:

- `receipt_shares_created_at_not_null`: `NOT NULL created_at`
- `receipt_shares_expires_at_not_null`: `NOT NULL expires_at`
- `receipt_shares_id_not_null`: `NOT NULL id`
- `receipt_shares_pkey`: `PRIMARY KEY (id)`
- `receipt_shares_receipt_id_not_null`: `NOT NULL receipt_id`
- `receipt_shares_token_hash_check`: `CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text))`
- `receipt_shares_token_hash_key`: `UNIQUE (token_hash)`
- `receipt_shares_token_hash_not_null`: `NOT NULL token_hash`
- `receipt_shares_vendor_id_fkey`: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`
- `receipt_shares_vendor_id_id_key`: `UNIQUE (vendor_id, id)`
- `receipt_shares_vendor_id_not_null`: `NOT NULL vendor_id`
- `receipt_shares_vendor_id_receipt_id_fkey`: `FOREIGN KEY (vendor_id, receipt_id) REFERENCES receipts(vendor_id, id)`

Added indexes (including constraint-backed and FK lookup indexes):

- `b0_fk_receipt_shares_vendor_id_receipt_id_fkey_18144`: `CREATE INDEX b0_fk_receipt_shares_vendor_id_receipt_id_fkey_18144 ON public.receipt_shares USING btree (vendor_id, receipt_id)`
- `receipt_shares_pkey`: `CREATE UNIQUE INDEX receipt_shares_pkey ON public.receipt_shares USING btree (id)`
- `receipt_shares_token_hash_key`: `CREATE UNIQUE INDEX receipt_shares_token_hash_key ON public.receipt_shares USING btree (token_hash)`
- `receipt_shares_vendor_id_id_key`: `CREATE UNIQUE INDEX receipt_shares_vendor_id_id_key ON public.receipt_shares USING btree (vendor_id, id)`

## receipts — extended existing table

Added columns:



New/changed constraints:

- `receipts_total_kobo_safe_integer`: `CHECK ((total_kobo <= '9007199254740991'::bigint))`

Added indexes (including constraint-backed and FK lookup indexes):

- `receipts_cursor`: `CREATE INDEX receipts_cursor ON public.receipts USING btree (vendor_id, issued_at DESC, id DESC)`

## restock_requests — NEW table

Added columns:

- `id` uuid; NOT NULL; default `gen_random_uuid()`
- `vendor_id` uuid; NOT NULL
- `product_id` uuid; NOT NULL
- `variant_id` uuid; nullable
- `customer_id` uuid; NOT NULL
- `status` text; NOT NULL; default `'waiting'::text`
- `notified_at` timestamp with time zone; nullable
- `consent_at` timestamp with time zone; nullable
- `created_at` timestamp with time zone; NOT NULL; default `now()`
- `identity_id` uuid; nullable

New/changed constraints:

- `restock_requests_check`: `CHECK (((status = 'notified'::text) = (notified_at IS NOT NULL)))`
- `restock_requests_created_at_not_null`: `NOT NULL created_at`
- `restock_requests_customer_id_not_null`: `NOT NULL customer_id`
- `restock_requests_id_not_null`: `NOT NULL id`
- `restock_requests_pkey`: `PRIMARY KEY (id)`
- `restock_requests_product_id_not_null`: `NOT NULL product_id`
- `restock_requests_status_check`: `CHECK ((status = ANY (ARRAY['waiting'::text, 'notified'::text, 'cancelled'::text])))`
- `restock_requests_status_not_null`: `NOT NULL status`
- `restock_requests_vendor_id_customer_id_fkey`: `FOREIGN KEY (vendor_id, customer_id) REFERENCES customers(vendor_id, id)`
- `restock_requests_vendor_id_customer_id_identity_id_fkey`: `FOREIGN KEY (vendor_id, customer_id, identity_id) REFERENCES customer_identities(vendor_id, customer_id, id)`
- `restock_requests_vendor_id_fkey`: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`
- `restock_requests_vendor_id_id_key`: `UNIQUE (vendor_id, id)`
- `restock_requests_vendor_id_not_null`: `NOT NULL vendor_id`
- `restock_requests_vendor_id_product_id_fkey`: `FOREIGN KEY (vendor_id, product_id) REFERENCES products(vendor_id, id)`
- `restock_requests_vendor_id_product_id_variant_id_fkey`: `FOREIGN KEY (vendor_id, product_id, variant_id) REFERENCES product_variants(vendor_id, product_id, id)`

Added indexes (including constraint-backed and FK lookup indexes):

- `b0_fk_restock_requests_vendor_id_customer_id_fkey_17487`: `CREATE INDEX b0_fk_restock_requests_vendor_id_customer_id_fkey_17487 ON public.restock_requests USING btree (vendor_id, customer_id)`
- `b0_fk_restock_requests_vendor_id_product_id_fkey_17487`: `CREATE INDEX b0_fk_restock_requests_vendor_id_product_id_fkey_17487 ON public.restock_requests USING btree (vendor_id, product_id)`
- `b0_fk_restock_requests_vendor_id_product_id_variant_id_fkey_174`: `CREATE INDEX b0_fk_restock_requests_vendor_id_product_id_variant_id_fkey_174 ON public.restock_requests USING btree (vendor_id, product_id, variant_id)`
- `restock_identity_fk`: `CREATE INDEX restock_identity_fk ON public.restock_requests USING btree (vendor_id, customer_id, identity_id)`
- `restock_requests_pkey`: `CREATE UNIQUE INDEX restock_requests_pkey ON public.restock_requests USING btree (id)`
- `restock_requests_vendor_id_id_key`: `CREATE UNIQUE INDEX restock_requests_vendor_id_id_key ON public.restock_requests USING btree (vendor_id, id)`
- `waiting_restock_product`: `CREATE UNIQUE INDEX waiting_restock_product ON public.restock_requests USING btree (vendor_id, customer_id, product_id) WHERE ((status = 'waiting'::text) AND (variant_id IS NULL))`
- `waiting_restock_variant`: `CREATE UNIQUE INDEX waiting_restock_variant ON public.restock_requests USING btree (vendor_id, customer_id, product_id, variant_id) WHERE ((status = 'waiting'::text) AND (variant_id IS NOT NULL))`

## stock_movements — NEW table

Added columns:

- `id` uuid; NOT NULL; default `gen_random_uuid()`
- `vendor_id` uuid; NOT NULL
- `product_id` uuid; NOT NULL
- `variant_id` uuid; nullable
- `order_id` uuid; nullable
- `requested` integer; NOT NULL
- `delta` integer; NOT NULL
- `shortfall` integer; NOT NULL; default `0`
- `reason` text; NOT NULL
- `dedupe_key` text; NOT NULL
- `created_at` timestamp with time zone; NOT NULL; default `now()`

New/changed constraints:

- `stock_delta_direction`: `CHECK ((((reason = 'sale'::text) AND (delta <= 0) AND (((- delta) + shortfall) = requested)) OR ((reason = ANY (ARRAY['restock'::text, 'release'::text])) AND (delta = requested) AND (shortfall = 0)) OR ((reason = 'correction'::text) AND (delta <> 0) AND (shortfall = 0))))`
- `stock_movements_created_at_not_null`: `NOT NULL created_at`
- `stock_movements_dedupe_key_not_null`: `NOT NULL dedupe_key`
- `stock_movements_delta_not_null`: `NOT NULL delta`
- `stock_movements_id_not_null`: `NOT NULL id`
- `stock_movements_pkey`: `PRIMARY KEY (id)`
- `stock_movements_product_id_not_null`: `NOT NULL product_id`
- `stock_movements_reason_check`: `CHECK ((reason = ANY (ARRAY['sale'::text, 'restock'::text, 'correction'::text, 'release'::text])))`
- `stock_movements_reason_not_null`: `NOT NULL reason`
- `stock_movements_requested_check`: `CHECK ((requested > 0))`
- `stock_movements_requested_not_null`: `NOT NULL requested`
- `stock_movements_shortfall_check`: `CHECK ((shortfall >= 0))`
- `stock_movements_shortfall_not_null`: `NOT NULL shortfall`
- `stock_movements_vendor_id_dedupe_key_key`: `UNIQUE (vendor_id, dedupe_key)`
- `stock_movements_vendor_id_fkey`: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`
- `stock_movements_vendor_id_id_key`: `UNIQUE (vendor_id, id)`
- `stock_movements_vendor_id_not_null`: `NOT NULL vendor_id`
- `stock_movements_vendor_id_order_id_fkey`: `FOREIGN KEY (vendor_id, order_id) REFERENCES orders(vendor_id, id)`
- `stock_movements_vendor_id_product_id_fkey`: `FOREIGN KEY (vendor_id, product_id) REFERENCES products(vendor_id, id)`
- `stock_movements_vendor_id_product_id_variant_id_fkey`: `FOREIGN KEY (vendor_id, product_id, variant_id) REFERENCES product_variants(vendor_id, product_id, id)`

Added indexes (including constraint-backed and FK lookup indexes):

- `b0_fk_stock_movements_vendor_id_order_id_fkey_17895`: `CREATE INDEX b0_fk_stock_movements_vendor_id_order_id_fkey_17895 ON public.stock_movements USING btree (vendor_id, order_id)`
- `b0_fk_stock_movements_vendor_id_product_id_fkey_17895`: `CREATE INDEX b0_fk_stock_movements_vendor_id_product_id_fkey_17895 ON public.stock_movements USING btree (vendor_id, product_id)`
- `b0_fk_stock_movements_vendor_id_product_id_variant_id_fkey_1789`: `CREATE INDEX b0_fk_stock_movements_vendor_id_product_id_variant_id_fkey_1789 ON public.stock_movements USING btree (vendor_id, product_id, variant_id)`
- `stock_movements_pkey`: `CREATE UNIQUE INDEX stock_movements_pkey ON public.stock_movements USING btree (id)`
- `stock_movements_vendor_id_dedupe_key_key`: `CREATE UNIQUE INDEX stock_movements_vendor_id_dedupe_key_key ON public.stock_movements USING btree (vendor_id, dedupe_key)`
- `stock_movements_vendor_id_id_key`: `CREATE UNIQUE INDEX stock_movements_vendor_id_id_key ON public.stock_movements USING btree (vendor_id, id)`

## stock_reservations — NEW table

Added columns:

- `id` uuid; NOT NULL; default `gen_random_uuid()`
- `vendor_id` uuid; NOT NULL
- `order_id` uuid; NOT NULL
- `order_item_id` uuid; NOT NULL
- `product_id` uuid; NOT NULL
- `variant_id` uuid; nullable
- `quantity` integer; NOT NULL
- `status` text; NOT NULL; default `'active'::text`
- `expires_at` timestamp with time zone; NOT NULL
- `created_at` timestamp with time zone; NOT NULL; default `now()`

New/changed constraints:

- `stock_reservations_created_at_not_null`: `NOT NULL created_at`
- `stock_reservations_expires_at_not_null`: `NOT NULL expires_at`
- `stock_reservations_id_not_null`: `NOT NULL id`
- `stock_reservations_order_id_not_null`: `NOT NULL order_id`
- `stock_reservations_order_item_id_not_null`: `NOT NULL order_item_id`
- `stock_reservations_pkey`: `PRIMARY KEY (id)`
- `stock_reservations_product_id_not_null`: `NOT NULL product_id`
- `stock_reservations_quantity_check`: `CHECK ((quantity > 0))`
- `stock_reservations_quantity_not_null`: `NOT NULL quantity`
- `stock_reservations_status_check`: `CHECK ((status = ANY (ARRAY['active'::text, 'committed'::text, 'released'::text, 'expired'::text])))`
- `stock_reservations_status_not_null`: `NOT NULL status`
- `stock_reservations_vendor_id_fkey`: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`
- `stock_reservations_vendor_id_id_key`: `UNIQUE (vendor_id, id)`
- `stock_reservations_vendor_id_not_null`: `NOT NULL vendor_id`
- `stock_reservations_vendor_id_order_id_fkey`: `FOREIGN KEY (vendor_id, order_id) REFERENCES orders(vendor_id, id)`
- `stock_reservations_vendor_id_order_id_order_item_id_fkey`: `FOREIGN KEY (vendor_id, order_id, order_item_id) REFERENCES order_items(vendor_id, order_id, id)`
- `stock_reservations_vendor_id_order_id_product_id_order_ite_fkey`: `FOREIGN KEY (vendor_id, order_id, product_id, order_item_id) REFERENCES order_items(vendor_id, order_id, product_id, id)`
- `stock_reservations_vendor_id_order_item_id_fkey`: `FOREIGN KEY (vendor_id, order_item_id) REFERENCES order_items(vendor_id, id)`
- `stock_reservations_vendor_id_product_id_fkey`: `FOREIGN KEY (vendor_id, product_id) REFERENCES products(vendor_id, id)`
- `stock_reservations_vendor_id_product_id_variant_id_fkey`: `FOREIGN KEY (vendor_id, product_id, variant_id) REFERENCES product_variants(vendor_id, product_id, id)`

Added indexes (including constraint-backed and FK lookup indexes):

- `active_order_reservation`: `CREATE UNIQUE INDEX active_order_reservation ON public.stock_reservations USING btree (vendor_id, order_item_id) WHERE (status = 'active'::text)`
- `b0_fk_stock_reservations_vendor_id_order_id_fkey_17847`: `CREATE INDEX b0_fk_stock_reservations_vendor_id_order_id_fkey_17847 ON public.stock_reservations USING btree (vendor_id, order_id)`
- `b0_fk_stock_reservations_vendor_id_order_id_order_item_id_fkey_`: `CREATE INDEX b0_fk_stock_reservations_vendor_id_order_id_order_item_id_fkey_ ON public.stock_reservations USING btree (vendor_id, order_id, order_item_id)`
- `b0_fk_stock_reservations_vendor_id_order_item_id_fkey_17847`: `CREATE INDEX b0_fk_stock_reservations_vendor_id_order_item_id_fkey_17847 ON public.stock_reservations USING btree (vendor_id, order_item_id)`
- `b0_fk_stock_reservations_vendor_id_product_id_fkey_17847`: `CREATE INDEX b0_fk_stock_reservations_vendor_id_product_id_fkey_17847 ON public.stock_reservations USING btree (vendor_id, product_id)`
- `b0_fk_stock_reservations_vendor_id_product_id_variant_id_fkey_1`: `CREATE INDEX b0_fk_stock_reservations_vendor_id_product_id_variant_id_fkey_1 ON public.stock_reservations USING btree (vendor_id, product_id, variant_id)`
- `reservation_item_product_fk`: `CREATE INDEX reservation_item_product_fk ON public.stock_reservations USING btree (vendor_id, order_id, product_id, order_item_id)`
- `reservations_expiry`: `CREATE INDEX reservations_expiry ON public.stock_reservations USING btree (vendor_id, expires_at, id) WHERE (status = 'active'::text)`
- `stock_reservations_pkey`: `CREATE UNIQUE INDEX stock_reservations_pkey ON public.stock_reservations USING btree (id)`
- `stock_reservations_vendor_id_id_key`: `CREATE UNIQUE INDEX stock_reservations_vendor_id_id_key ON public.stock_reservations USING btree (vendor_id, id)`

## team_invitations — NEW table

Added columns:

- `id` uuid; NOT NULL; default `gen_random_uuid()`
- `vendor_id` uuid; NOT NULL
- `email` text; NOT NULL
- `name` text; NOT NULL
- `role` text; NOT NULL
- `invited_by` uuid; NOT NULL
- `accepted_member_id` uuid; nullable
- `status` text; NOT NULL; default `'pending'::text`
- `expires_at` timestamp with time zone; NOT NULL
- `created_at` timestamp with time zone; NOT NULL; default `now()`

New/changed constraints:

- `team_invitations_created_at_not_null`: `NOT NULL created_at`
- `team_invitations_email_check`: `CHECK ((email = lower(btrim(email))))`
- `team_invitations_email_not_null`: `NOT NULL email`
- `team_invitations_expires_at_not_null`: `NOT NULL expires_at`
- `team_invitations_id_not_null`: `NOT NULL id`
- `team_invitations_invited_by_not_null`: `NOT NULL invited_by`
- `team_invitations_name_check`: `CHECK (((length(name) >= 1) AND (length(name) <= 80)))`
- `team_invitations_name_not_null`: `NOT NULL name`
- `team_invitations_pkey`: `PRIMARY KEY (id)`
- `team_invitations_role_check`: `CHECK ((role = ANY (ARRAY['manager'::text, 'agent'::text])))`
- `team_invitations_role_not_null`: `NOT NULL role`
- `team_invitations_status_check`: `CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'revoked'::text, 'expired'::text])))`
- `team_invitations_status_not_null`: `NOT NULL status`
- `team_invitations_vendor_id_accepted_member_id_fkey`: `FOREIGN KEY (vendor_id, accepted_member_id) REFERENCES vendor_members(vendor_id, id)`
- `team_invitations_vendor_id_fkey`: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`
- `team_invitations_vendor_id_id_key`: `UNIQUE (vendor_id, id)`
- `team_invitations_vendor_id_invited_by_fkey`: `FOREIGN KEY (vendor_id, invited_by) REFERENCES vendor_members(vendor_id, id)`
- `team_invitations_vendor_id_not_null`: `NOT NULL vendor_id`

Added indexes (including constraint-backed and FK lookup indexes):

- `active_invitation_email`: `CREATE UNIQUE INDEX active_invitation_email ON public.team_invitations USING btree (vendor_id, email) WHERE (status = 'pending'::text)`
- `b0_fk_team_invitations_vendor_id_accepted_member_id_fkey_17236`: `CREATE INDEX b0_fk_team_invitations_vendor_id_accepted_member_id_fkey_17236 ON public.team_invitations USING btree (vendor_id, accepted_member_id)`
- `b0_fk_team_invitations_vendor_id_invited_by_fkey_17236`: `CREATE INDEX b0_fk_team_invitations_vendor_id_invited_by_fkey_17236 ON public.team_invitations USING btree (vendor_id, invited_by)`
- `team_invitations_pkey`: `CREATE UNIQUE INDEX team_invitations_pkey ON public.team_invitations USING btree (id)`
- `team_invitations_vendor_id_id_key`: `CREATE UNIQUE INDEX team_invitations_vendor_id_id_key ON public.team_invitations USING btree (vendor_id, id)`

## typed_proposals — NEW table

Added columns:

- `id` uuid; NOT NULL; default `gen_random_uuid()`
- `vendor_id` uuid; NOT NULL
- `member_id` uuid; NOT NULL
- `input_text` text; NOT NULL
- `candidates` jsonb; NOT NULL
- `selected_product_id` uuid; nullable
- `expected_revision` bigint; nullable
- `status` text; NOT NULL; default `'pending'::text`
- `expires_at` timestamp with time zone; NOT NULL
- `created_at` timestamp with time zone; NOT NULL; default `now()`

New/changed constraints:

- `typed_proposals_candidates_check`: `CHECK ((jsonb_typeof(candidates) = 'array'::text))`
- `typed_proposals_candidates_not_null`: `NOT NULL candidates`
- `typed_proposals_created_at_not_null`: `NOT NULL created_at`
- `typed_proposals_expected_revision_check`: `CHECK ((expected_revision > 0))`
- `typed_proposals_expires_at_not_null`: `NOT NULL expires_at`
- `typed_proposals_id_not_null`: `NOT NULL id`
- `typed_proposals_input_text_check`: `CHECK (((length(input_text) >= 1) AND (length(input_text) <= 4000)))`
- `typed_proposals_input_text_not_null`: `NOT NULL input_text`
- `typed_proposals_member_id_not_null`: `NOT NULL member_id`
- `typed_proposals_pkey`: `PRIMARY KEY (id)`
- `typed_proposals_status_check`: `CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'expired'::text])))`
- `typed_proposals_status_not_null`: `NOT NULL status`
- `typed_proposals_vendor_id_fkey`: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`
- `typed_proposals_vendor_id_id_key`: `UNIQUE (vendor_id, id)`
- `typed_proposals_vendor_id_member_id_fkey`: `FOREIGN KEY (vendor_id, member_id) REFERENCES vendor_members(vendor_id, id)`
- `typed_proposals_vendor_id_not_null`: `NOT NULL vendor_id`
- `typed_proposals_vendor_id_selected_product_id_fkey`: `FOREIGN KEY (vendor_id, selected_product_id) REFERENCES products(vendor_id, id)`

Added indexes (including constraint-backed and FK lookup indexes):

- `b0_fk_typed_proposals_vendor_id_member_id_fkey_17197`: `CREATE INDEX b0_fk_typed_proposals_vendor_id_member_id_fkey_17197 ON public.typed_proposals USING btree (vendor_id, member_id)`
- `b0_fk_typed_proposals_vendor_id_selected_product_id_fkey_17197`: `CREATE INDEX b0_fk_typed_proposals_vendor_id_selected_product_id_fkey_17197 ON public.typed_proposals USING btree (vendor_id, selected_product_id)`
- `typed_proposals_pkey`: `CREATE UNIQUE INDEX typed_proposals_pkey ON public.typed_proposals USING btree (id)`
- `typed_proposals_vendor_id_id_key`: `CREATE UNIQUE INDEX typed_proposals_vendor_id_id_key ON public.typed_proposals USING btree (vendor_id, id)`

## usage_entries — NEW table

Added columns:

- `id` uuid; NOT NULL; default `gen_random_uuid()`
- `vendor_id` uuid; NOT NULL
- `meter_id` uuid; NOT NULL
- `conversation_id` uuid; nullable
- `quantity` integer; NOT NULL
- `dedupe_key` text; NOT NULL
- `created_at` timestamp with time zone; NOT NULL; default `now()`

New/changed constraints:

- `usage_entries_created_at_not_null`: `NOT NULL created_at`
- `usage_entries_dedupe_key_not_null`: `NOT NULL dedupe_key`
- `usage_entries_id_not_null`: `NOT NULL id`
- `usage_entries_meter_id_not_null`: `NOT NULL meter_id`
- `usage_entries_pkey`: `PRIMARY KEY (id)`
- `usage_entries_quantity_check`: `CHECK ((quantity > 0))`
- `usage_entries_quantity_not_null`: `NOT NULL quantity`
- `usage_entries_vendor_id_conversation_id_fkey`: `FOREIGN KEY (vendor_id, conversation_id) REFERENCES conversations(vendor_id, id)`
- `usage_entries_vendor_id_dedupe_key_key`: `UNIQUE (vendor_id, dedupe_key)`
- `usage_entries_vendor_id_fkey`: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`
- `usage_entries_vendor_id_id_key`: `UNIQUE (vendor_id, id)`
- `usage_entries_vendor_id_meter_id_fkey`: `FOREIGN KEY (vendor_id, meter_id) REFERENCES usage_meters(vendor_id, id)`
- `usage_entries_vendor_id_not_null`: `NOT NULL vendor_id`

Added indexes (including constraint-backed and FK lookup indexes):

- `b0_fk_usage_entries_vendor_id_conversation_id_fkey_17774`: `CREATE INDEX b0_fk_usage_entries_vendor_id_conversation_id_fkey_17774 ON public.usage_entries USING btree (vendor_id, conversation_id)`
- `b0_fk_usage_entries_vendor_id_meter_id_fkey_17774`: `CREATE INDEX b0_fk_usage_entries_vendor_id_meter_id_fkey_17774 ON public.usage_entries USING btree (vendor_id, meter_id)`
- `usage_entries_pkey`: `CREATE UNIQUE INDEX usage_entries_pkey ON public.usage_entries USING btree (id)`
- `usage_entries_vendor_id_dedupe_key_key`: `CREATE UNIQUE INDEX usage_entries_vendor_id_dedupe_key_key ON public.usage_entries USING btree (vendor_id, dedupe_key)`
- `usage_entries_vendor_id_id_key`: `CREATE UNIQUE INDEX usage_entries_vendor_id_id_key ON public.usage_entries USING btree (vendor_id, id)`

## usage_meters — NEW table

Added columns:

- `id` uuid; NOT NULL; default `gen_random_uuid()`
- `vendor_id` uuid; NOT NULL
- `period_start` timestamp with time zone; NOT NULL
- `period_end` timestamp with time zone; NOT NULL
- `conversations` integer; NOT NULL; default `0`
- `conversation_limit` integer; NOT NULL
- `created_at` timestamp with time zone; NOT NULL; default `now()`

New/changed constraints:

- `usage_meters_check`: `CHECK ((period_end > period_start))`
- `usage_meters_conversation_limit_check`: `CHECK ((conversation_limit >= 0))`
- `usage_meters_conversation_limit_not_null`: `NOT NULL conversation_limit`
- `usage_meters_conversations_check`: `CHECK ((conversations >= 0))`
- `usage_meters_conversations_not_null`: `NOT NULL conversations`
- `usage_meters_created_at_not_null`: `NOT NULL created_at`
- `usage_meters_id_not_null`: `NOT NULL id`
- `usage_meters_period_end_not_null`: `NOT NULL period_end`
- `usage_meters_period_start_not_null`: `NOT NULL period_start`
- `usage_meters_pkey`: `PRIMARY KEY (id)`
- `usage_meters_vendor_id_fkey`: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`
- `usage_meters_vendor_id_id_key`: `UNIQUE (vendor_id, id)`
- `usage_meters_vendor_id_not_null`: `NOT NULL vendor_id`
- `usage_meters_vendor_id_period_start_key`: `UNIQUE (vendor_id, period_start)`

Added indexes (including constraint-backed and FK lookup indexes):

- `usage_meters_pkey`: `CREATE UNIQUE INDEX usage_meters_pkey ON public.usage_meters USING btree (id)`
- `usage_meters_vendor_id_id_key`: `CREATE UNIQUE INDEX usage_meters_vendor_id_id_key ON public.usage_meters USING btree (vendor_id, id)`
- `usage_meters_vendor_id_period_start_key`: `CREATE UNIQUE INDEX usage_meters_vendor_id_period_start_key ON public.usage_meters USING btree (vendor_id, period_start)`

## vendor_members — extended existing table

Added columns:

- `name` text; NOT NULL; default `''::text`
- `status` text; NOT NULL; default `'active'::text`

New/changed constraints:

- `vendor_members_name_not_null`: `NOT NULL name`
- `vendor_members_status_check`: `CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text])))`
- `vendor_members_status_not_null`: `NOT NULL status`

Added indexes (including constraint-backed and FK lookup indexes):

- `b0_fk_vendor_members_user_id_fkey_16428`: `CREATE INDEX b0_fk_vendor_members_user_id_fkey_16428 ON public.vendor_members USING btree (user_id)`
- `one_owner_per_vendor`: `CREATE UNIQUE INDEX one_owner_per_vendor ON public.vendor_members USING btree (vendor_id) WHERE (role = 'owner'::text)`

## vendors — extended existing table

Added columns:



New/changed constraints:



Added indexes (including constraint-backed and FK lookup indexes):



## webhook_events — NEW table

Added columns:

- `id` uuid; NOT NULL; default `gen_random_uuid()`
- `vendor_id` uuid; NOT NULL
- `channel_account_id` uuid; nullable
- `provider` text; NOT NULL
- `provider_event_id` text; NOT NULL
- `payload_ciphertext` bytea; NOT NULL
- `key_version` text; NOT NULL
- `payload_hash` text; NOT NULL
- `signature_verified` boolean; NOT NULL
- `received_at` timestamp with time zone; NOT NULL; default `now()`
- `processed_at` timestamp with time zone; nullable
- `expires_at` timestamp with time zone; NOT NULL
- `created_at` timestamp with time zone; NOT NULL; default `now()`

New/changed constraints:

- `webhook_events_created_at_not_null`: `NOT NULL created_at`
- `webhook_events_expires_at_not_null`: `NOT NULL expires_at`
- `webhook_events_id_not_null`: `NOT NULL id`
- `webhook_events_key_version_not_null`: `NOT NULL key_version`
- `webhook_events_payload_ciphertext_check`: `CHECK ((octet_length(payload_ciphertext) > 16))`
- `webhook_events_payload_ciphertext_not_null`: `NOT NULL payload_ciphertext`
- `webhook_events_payload_hash_check`: `CHECK ((payload_hash ~ '^[0-9a-f]{64}$'::text))`
- `webhook_events_payload_hash_not_null`: `NOT NULL payload_hash`
- `webhook_events_pkey`: `PRIMARY KEY (id)`
- `webhook_events_provider_check`: `CHECK ((provider = ANY (ARRAY['whatsapp'::text, 'instagram'::text, 'facebook'::text, 'tiktok'::text, 'email'::text, 'paystack'::text])))`
- `webhook_events_provider_event_id_not_null`: `NOT NULL provider_event_id`
- `webhook_events_provider_not_null`: `NOT NULL provider`
- `webhook_events_received_at_not_null`: `NOT NULL received_at`
- `webhook_events_signature_verified_check`: `CHECK (signature_verified)`
- `webhook_events_signature_verified_not_null`: `NOT NULL signature_verified`
- `webhook_events_vendor_id_channel_account_id_fkey`: `FOREIGN KEY (vendor_id, channel_account_id) REFERENCES channel_accounts(vendor_id, id)`
- `webhook_events_vendor_id_fkey`: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`
- `webhook_events_vendor_id_id_key`: `UNIQUE (vendor_id, id)`
- `webhook_events_vendor_id_not_null`: `NOT NULL vendor_id`

Added indexes (including constraint-backed and FK lookup indexes):

- `b0_fk_webhook_events_vendor_id_channel_account_id_fkey_18017`: `CREATE INDEX b0_fk_webhook_events_vendor_id_channel_account_id_fkey_18017 ON public.webhook_events USING btree (vendor_id, channel_account_id)`
- `webhook_account_dedupe`: `CREATE UNIQUE INDEX webhook_account_dedupe ON public.webhook_events USING btree (vendor_id, provider, channel_account_id, provider_event_id) WHERE (channel_account_id IS NOT NULL)`
- `webhook_events_pkey`: `CREATE UNIQUE INDEX webhook_events_pkey ON public.webhook_events USING btree (id)`
- `webhook_events_vendor_id_id_key`: `CREATE UNIQUE INDEX webhook_events_vendor_id_id_key ON public.webhook_events USING btree (vendor_id, id)`
- `webhook_merchant_dedupe`: `CREATE UNIQUE INDEX webhook_merchant_dedupe ON public.webhook_events USING btree (vendor_id, provider, provider_event_id) WHERE (channel_account_id IS NULL)`
- `webhook_retention`: `CREATE INDEX webhook_retention ON public.webhook_events USING btree (vendor_id, expires_at, id)`

## Removed/replaced F0 constraints

- channel_accounts.`channel_accounts_status_check`: old `CHECK ((status = ANY (ARRAY['connected'::text, 'disconnected'::text, 'error'::text])))`
- messages.`messages_status_check`: old `CHECK ((status = ANY (ARRAY['received'::text, 'draft'::text, 'pending_approval'::text, 'blocked'::text, 'sent'::text, 'failed'::text])))`
- orders.`orders_status_check`: old `CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'fulfilled'::text, 'cancelled'::text])))`
