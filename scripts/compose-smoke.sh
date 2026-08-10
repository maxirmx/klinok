#!/bin/sh
# Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
# All rights reserved.
# This file is a part of Klinok application

set -eu
COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME:-klinok_e2e_${GITHUB_RUN_ID:-local}}
KLINOK_UI_PORT=${KLINOK_UI_PORT:-8080}
KLINOK_MAILPIT_PORT=${KLINOK_MAILPIT_PORT:-8025}
KLINOK_PUBLIC_ORIGIN=${KLINOK_PUBLIC_ORIGIN:-http://localhost:${KLINOK_UI_PORT}}
export COMPOSE_PROJECT_NAME KLINOK_UI_PORT KLINOK_MAILPIT_PORT KLINOK_PUBLIC_ORIGIN

cleanup() {
  status=$?
  trap - EXIT INT TERM
  if [ "$status" -ne 0 ]; then
    mkdir -p test-results/compose
    docker compose ps --all > test-results/compose/containers.txt 2>&1 || true
    docker compose logs --no-color > test-results/compose/compose.log 2>&1 || true
  fi
  docker compose down -v --remove-orphans || true
  exit "$status"
}
trap cleanup EXIT INT TERM

docker compose down -v --remove-orphans
docker compose build
docker compose up -d postgres mail
docker compose run --rm -T \
  -e KLINOK_BOOTSTRAP_EMAIL=administrator@example.ru \
  -e KLINOK_BOOTSTRAP_PASSWORD='bootstrap-password-2026' \
  api node api-node/dist/provision.js
docker compose up -d api ui

attempt=0
until curl --fail --silent "$KLINOK_PUBLIC_ORIGIN/api/auth/session" >/dev/null; do
  attempt=$((attempt + 1)); [ "$attempt" -lt 60 ] || { docker compose logs --no-color; exit 1; }; sleep 1
done

export KLINOK_E2E_BOOTSTRAP_EMAIL=administrator@example.ru
export KLINOK_E2E_BOOTSTRAP_PASSWORD=bootstrap-password-2026
export KLINOK_E2E_RESTART_API=true
export KLINOK_E2E_BASE_URL="$KLINOK_PUBLIC_ORIGIN"
export KLINOK_E2E_MAILPIT_URL="http://localhost:$KLINOK_MAILPIT_PORT"
npx playwright test
