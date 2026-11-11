#!/usr/bin/env bash
# PGSERVICE/PGSERVICEFILE are configured by the operator. Never put DSNs in argv.
set -euo pipefail
umask 077
: "${PGSERVICE:?Configure a restricted backup service in a protected pg_service.conf}"
: "${BACKUP_DIR:?Use encrypted storage outside the checkout}"
mkdir -p "$BACKUP_DIR"
file="$BACKUP_DIR/selvora-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --file="$file.partial"
pg_restore --list "$file.partial" >/dev/null
mv "$file.partial" "$file"
printf '%s\n' 'Backup completed. Run an isolated restore drill; listing is not a restore test.'
