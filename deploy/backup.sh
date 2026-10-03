#!/usr/bin/env bash
# ============================================================
# Postgres backup (runs ON the droplet).
#   bash deploy/backup.sh            # nightly (cron)
#   bash deploy/backup.sh pre-deploy # called by deploy.sh before migrations
#
# Writes a compressed pg_dump to ~/backups and keeps the newest 14 of each
# kind. If R2_BACKUP_BUCKET is set in .env, the file is also copied to
# Cloudflare R2 (off-droplet copy — a droplet-local backup alone doesn't
# survive losing the droplet).
#
# Cron (crontab -e as the deploy user), 03:00 Asia/Dhaka = 21:00 UTC:
#   0 21 * * * cd ~/premium-gadget && bash deploy/backup.sh >> ~/backups/backup.log 2>&1
#
# Restore (⚠️ overwrites the database):
#   gunzip -c ~/backups/<file>.sql.gz | docker exec -i pg_premium_gadget \
#     psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077   # dumps contain customer data — owner-only files

KIND="${1:-nightly}"
case "$KIND" in *[!a-z0-9-]*|"") echo "✖ invalid backup kind"; exit 1 ;; esac

# Read only the keys we need, literally (never `source` .env: a value like
# $(...) would execute, and values Compose accepts can break bash parsing).
env_get() { grep -E "^$1=" .env | tail -n 1 | cut -d= -f2- | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"; }
POSTGRES_USER="$(env_get POSTGRES_USER)"
POSTGRES_DB="$(env_get POSTGRES_DB)"
R2_BACKUP_BUCKET="$(env_get R2_BACKUP_BUCKET)"
R2_ACCOUNT_ID="$(env_get R2_ACCOUNT_ID)"
[ -n "$POSTGRES_USER" ] && [ -n "$POSTGRES_DB" ] || { echo "✖ POSTGRES_USER/POSTGRES_DB missing in .env"; exit 1; }

DIR="${BACKUP_DIR:-$HOME/backups}"
mkdir -p "$DIR"
FILE="$DIR/${POSTGRES_DB}-${KIND}-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"

docker exec pg_premium_gadget pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --clean --if-exists \
  | gzip -9 > "$FILE"
echo "✓ backup written: $FILE ($(du -h "$FILE" | cut -f1))"

# Retention: keep the newest 14 backups of this kind.
ls -1t "$DIR"/"${POSTGRES_DB}-${KIND}-"*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f

if [ -n "$R2_BACKUP_BUCKET" ]; then
  # Credentials go through a private env file, not the command line (which
  # any local user can read via `ps`).
  CREDS="$(mktemp)"
  trap 'rm -f "$CREDS"' EXIT
  printf 'AWS_ACCESS_KEY_ID=%s\nAWS_SECRET_ACCESS_KEY=%s\n' \
    "$(env_get R2_ACCESS_KEY_ID)" "$(env_get R2_SECRET_ACCESS_KEY)" > "$CREDS"
  docker run --rm --env-file "$CREDS" -v "$DIR":/backups:ro \
    amazon/aws-cli s3 cp "/backups/$(basename "$FILE")" "s3://${R2_BACKUP_BUCKET}/db/$(basename "$FILE")" \
    --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" --only-show-errors
  echo "✓ copied to r2://${R2_BACKUP_BUCKET}/db/"
fi
