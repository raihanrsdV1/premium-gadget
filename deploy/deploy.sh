#!/usr/bin/env bash
# ============================================================
# Production deploy script (runs ON the droplet).
# Invoked by the GitHub Actions workflow after it syncs the repo,
# or run manually:  bash deploy/deploy.sh
#
# Uses ONLY docker-compose.yml (the production config) — never the dev override.
# Order: check env → build → DB up → backup → migrate → API + proxy up.
# ============================================================
set -euo pipefail

# Run from the repo root (this script lives in deploy/).
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.yml"

echo "==> Checking .env..."
[ -f .env ] || { echo "✖ .env missing (see .env.example)"; exit 1; }
for var in POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB JWT_SECRET CORS_ORIGIN \
           SERVER_PUBLIC_URL STOREFRONT_URL API_DOMAIN SSLCOMMERZ_STORE_ID SSLCOMMERZ_STORE_PASSWORD \
           SSLCOMMERZ_IS_SANDBOX; do
  grep -qE "^${var}=.+" .env || { echo "✖ ${var} is not set in .env"; exit 1; }
done
if grep -qiE '^(POSTGRES_PASSWORD|JWT_SECRET|INTERNAL_API_KEY)=.*(change[_-]?me|your[_-]|placeholder|example)' .env; then
  echo "✖ .env still contains placeholder secrets — generate real ones (openssl rand -hex 32)"; exit 1
fi
if grep -qE '^SSLCOMMERZ_IS_SANDBOX=true' .env; then
  echo "⚠️  SSLCOMMERZ_IS_SANDBOX=true — payments are FAKE. Set it to false before taking real orders."
fi

echo "==> Building images..."
$COMPOSE build --pull

echo "==> Starting database..."
$COMPOSE up -d postgres

echo "==> Waiting for Postgres to be healthy..."
for i in $(seq 1 30); do
  status="$(docker inspect -f '{{.State.Health.Status}}' pg_premium_gadget 2>/dev/null || echo starting)"
  [ "$status" = "healthy" ] && break
  echo "    postgres: $status ..."
  sleep 2
done

echo "==> Pre-migration backup..."
bash deploy/backup.sh pre-deploy

echo "==> Running database migrations..."
$COMPOSE run --rm backend npm run migrate

echo "==> Starting backend + HTTPS proxy..."
$COMPOSE up -d backend caddy

echo "==> Pruning dangling images..."
docker image prune -f >/dev/null 2>&1 || true

echo "==> Deploy complete:"
$COMPOSE ps
