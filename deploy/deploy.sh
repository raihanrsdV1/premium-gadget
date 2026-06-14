#!/usr/bin/env bash
# ============================================================
# Production deploy script (runs ON the droplet).
# Invoked by the GitHub Actions workflow after it syncs the repo,
# or run manually:  bash deploy/deploy.sh
#
# Uses ONLY docker-compose.yml (the production config) — never the dev override.
# ============================================================
set -euo pipefail

# Run from the repo root (this script lives in deploy/).
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.yml"

echo "==> Building images..."
$COMPOSE build

echo "==> Starting database..."
$COMPOSE up -d postgres

echo "==> Waiting for Postgres to be healthy..."
for i in $(seq 1 30); do
  status="$(docker inspect -f '{{.State.Health.Status}}' pg_premium_gadget 2>/dev/null || echo starting)"
  [ "$status" = "healthy" ] && break
  echo "    postgres: $status ..."
  sleep 2
done

echo "==> Running database migrations..."
$COMPOSE run --rm backend npm run migrate

echo "==> Starting backend..."
$COMPOSE up -d backend

echo "==> Pruning dangling images..."
docker image prune -f >/dev/null 2>&1 || true

echo "==> Deploy complete:"
$COMPOSE ps
