#!/usr/bin/env bash
# Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
# All rights reserved.
# This file is a part of Klinok application

set -euo pipefail
readonly COMPOSE_FILE="${KLINOK_COMPOSE_FILE:-docker-compose-ghrc.yml}"
readonly ENV_FILE="${KLINOK_ENV_FILE:-klinok.env}"
readonly PROJECT_NAME="${COMPOSE_PROJECT_NAME:-klinok}"
readonly COMPOSE=(docker compose --project-name "$PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

"${COMPOSE[@]}" config --quiet
"${COMPOSE[@]}" pull
"${COMPOSE[@]}" up -d postgres-blue
"${COMPOSE[@]}" up -d --no-deps api-blue
"${COMPOSE[@]}" up -d --no-deps ui-blue
"${COMPOSE[@]}" ps
