#!/usr/bin/env bash
# Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
# All rights reserved.
# This file is a part of Klinok application

set -euo pipefail

readonly COMPOSE_FILE="${KLINOK_COMPOSE_FILE:-docker-compose-ghrc.yml}"
readonly ENV_FILE="${KLINOK_ENV_FILE:-klinok.env}"
readonly PROJECT_NAME="${COMPOSE_PROJECT_NAME:-klinok}"
readonly POSTGRES_DATA_DIR="${KLINOK_POSTGRES_DATA_DIR:-/srv/klinok/postgres.v3/data}"
readonly CERTIFICATE_DIR="${KLINOK_CERTIFICATE_DIR:-/srv/klinok/certificate}"

fail() { printf '%s\n' "$1" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || fail "Environment file not found: $ENV_FILE"
[[ -f "$CERTIFICATE_DIR/s.crt" && -f "$CERTIFICATE_DIR/s.key" ]] || fail "TLS certificate files s.crt and s.key are required in $CERTIFICATE_DIR"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
: "${KLINOK_POSTGRES_PASSWORD:?KLINOK_POSTGRES_PASSWORD must be set in $ENV_FILE}"
: "${KLINOK_BOOTSTRAP_EMAIL:?KLINOK_BOOTSTRAP_EMAIL must be set in $ENV_FILE}"
: "${KLINOK_BOOTSTRAP_PASSWORD:?KLINOK_BOOTSTRAP_PASSWORD must be set in $ENV_FILE}"

install -d -m 0700 "$POSTGRES_DATA_DIR"
readonly COMPOSE=(docker compose --project-name "$PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
"${COMPOSE[@]}" config --quiet
"${COMPOSE[@]}" pull
"${COMPOSE[@]}" up -d postgres-blue
"${COMPOSE[@]}" run --rm -T api-blue node api-node/dist/provision.js
"${COMPOSE[@]}" up -d api-blue ui-blue
"${COMPOSE[@]}" ps

printf 'Klinok v3 started. The bootstrap Administrator is %s.\n' "$KLINOK_BOOTSTRAP_EMAIL"
