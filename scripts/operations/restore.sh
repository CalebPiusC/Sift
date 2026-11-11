#!/usr/bin/env bash
set -euo pipefail
umask 077
: "${PGSERVICE:?Configure the isolated restore target, NOT production}"
: "${BACKUP_FILE:?Select a backup file}"
: "${CONFIRM_ISOLATED_RESTORE:?Set exactly RESTORE_TO_ISOLATED_DATABASE}"
[ "$CONFIRM_ISOLATED_RESTORE" = RESTORE_TO_ISOLATED_DATABASE ] || exit 2
# No --clean: refuse populated targets, do not destroy live data. Roles/extensions
# must be provisioned compatibly; hosted Supabase also needs platform procedures.
pg_restore --exit-on-error --single-transaction --dbname="service=$PGSERVICE" "$BACKUP_FILE"
printf '%s\n' 'Restore finished. Keep network egress blocked; inspect RLS, receipts, decryption and outbox before enabling any workers.'
