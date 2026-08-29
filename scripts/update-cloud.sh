#!/usr/bin/env bash
# Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
# All rights reserved.
# This file is a part of Klinok application

set -euo pipefail

readonly DEPLOYMENT_TARGET="${1:-${KLINOK_DEPLOYMENT_TARGET:-production}}"
readonly ENV_FILE="${KLINOK_ENV_FILE:-klinok.env}"

fail() { printf '%s\n' "$1" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || fail "Environment file not found: $ENV_FILE"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

readonly PROJECT_NAME="${COMPOSE_PROJECT_NAME:-klinok}"
readonly CERTIFICATE_DIR="${KLINOK_CERTIFICATE_DIR:-/srv/klinok/certificate}"

case "$DEPLOYMENT_TARGET" in
  edge)
    readonly OVERLAY_FILE=docker-compose.edge.yml
    docker network inspect "${SW_CONSULTING_EDGE_NETWORK:-sw-consulting-edge}" >/dev/null 2>&1 \
      || fail "Shared edge network does not exist; start sw-consulting-edge first"
    ;;
  production)
    readonly OVERLAY_FILE=docker-compose.production.yml
    [[ -f "$CERTIFICATE_DIR/s.crt" && -f "$CERTIFICATE_DIR/s.key" ]] \
      || fail "TLS certificate files s.crt and s.key are required in $CERTIFICATE_DIR"
    openssl x509 -in "$CERTIFICATE_DIR/s.crt" -noout -checkhost klinok.sw.consulting >/dev/null \
      || fail "Certificate does not cover klinok.sw.consulting: $CERTIFICATE_DIR/s.crt"
    ;;
  *) fail "Deployment target must be 'edge' or 'production'" ;;
esac

readonly COMPOSE=(docker compose --project-name "$PROJECT_NAME" --env-file "$ENV_FILE" -f docker-compose-ghrc.yml -f "$OVERLAY_FILE")
"${COMPOSE[@]}" config --quiet
"${COMPOSE[@]}" pull
"${COMPOSE[@]}" up -d postgres-blue
"${COMPOSE[@]}" up -d --no-deps api-blue
"${COMPOSE[@]}" up -d --no-deps ui-blue
if [[ "$DEPLOYMENT_TARGET" == production ]]; then
  "${COMPOSE[@]}" up -d --no-deps production-edge
fi
"${COMPOSE[@]}" ps
