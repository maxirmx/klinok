#!/usr/bin/env bash
# Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
# All rights reserved.
# This file is a part of Klinok application

set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-klinok_local}"
export KLINOK_BOOTSTRAP_EMAIL="${KLINOK_BOOTSTRAP_EMAIL:-administrator@example.ru}"
export KLINOK_BOOTSTRAP_PASSWORD="${KLINOK_BOOTSTRAP_PASSWORD:-bootstrap-password-2026}"
compose=(docker compose -f docker-compose.yml -f docker-compose.mixed-dev.yml)

if [[ "${KLINOK_SKIP_BUILD:-false}" != "true" ]]; then "${compose[@]}" build api; fi
"${compose[@]}" up -d postgres mail
"${compose[@]}" run --rm -T -e KLINOK_BOOTSTRAP_EMAIL -e KLINOK_BOOTSTRAP_PASSWORD api node api-node/dist/provision.js
"${compose[@]}" up -d api

for _ in {1..60}; do curl --fail --silent http://127.0.0.1:8090/readyz >/dev/null && break; sleep 1; done
curl --fail --silent http://127.0.0.1:8090/readyz >/dev/null

printf '\nKlinok v3 backend is ready. Starting Vite at http://localhost:8080\n'
npm run dev
