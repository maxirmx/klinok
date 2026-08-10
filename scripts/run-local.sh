#!/usr/bin/env bash
# Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
# All rights reserved.
# This file is a part of Klinok application

set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

for command in docker curl; do command -v "$command" >/dev/null || { printf 'Missing required command: %s\n' "$command" >&2; exit 1; }; done
docker compose version >/dev/null

export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-klinok_local}"
export KLINOK_BOOTSTRAP_EMAIL="${KLINOK_BOOTSTRAP_EMAIL:-administrator@example.ru}"
export KLINOK_BOOTSTRAP_PASSWORD="${KLINOK_BOOTSTRAP_PASSWORD:-bootstrap-password-2026}"
export KLINOK_PUBLIC_ORIGIN="${KLINOK_PUBLIC_ORIGIN:-http://localhost:8080}"

diagnose() {
  status=$?
  if (( status != 0 )); then docker compose ps --all >&2 || true; docker compose logs --no-color --tail=100 >&2 || true; fi
  exit "$status"
}
trap diagnose EXIT

if [[ "${KLINOK_SKIP_BUILD:-false}" != "true" ]]; then docker compose build; fi
docker compose up -d postgres mail
docker compose run --rm -T -e KLINOK_BOOTSTRAP_EMAIL -e KLINOK_BOOTSTRAP_PASSWORD api node api-node/dist/provision.js
docker compose up -d api ui

for _ in {1..60}; do curl --fail --silent "$KLINOK_PUBLIC_ORIGIN/api/auth/session" >/dev/null && break; sleep 1; done
curl --fail --silent "$KLINOK_PUBLIC_ORIGIN/api/auth/session" >/dev/null

trap - EXIT
printf '\nKlinok v3 is running:\n  Application: %s\n  Test email: %s\n  Test password: %s\n  Mailpit: http://localhost:8025\n\n' "$KLINOK_PUBLIC_ORIGIN" "$KLINOK_BOOTSTRAP_EMAIL" "$KLINOK_BOOTSTRAP_PASSWORD"
printf 'Stop it with: COMPOSE_PROJECT_NAME=%s docker compose down\n' "$COMPOSE_PROJECT_NAME"
