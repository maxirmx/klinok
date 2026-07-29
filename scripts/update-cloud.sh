#!/usr/bin/env bash
# Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
# All rights reserved.
# This file is a part of Klinok application

set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_DIR="$(cd -- "$SCRIPT_DIR" && pwd)"
readonly COMPOSE_FILE="${KLINOK_COMPOSE_FILE:-$PROJECT_DIR/docker-compose-ghrc.yml}"
readonly ENV_FILE="${KLINOK_ENV_FILE:-$PROJECT_DIR/klinok.env}"
readonly COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-klinok_cloud}"
readonly HEALTH_TIMEOUT="${KLINOK_HEALTH_TIMEOUT:-120}"
readonly STOP_TIMEOUT="${KLINOK_STOP_TIMEOUT:-30}"

COMPOSE=(
  docker compose
  --project-name "$COMPOSE_PROJECT_NAME"
  --env-file "$ENV_FILE"
  -f "$COMPOSE_FILE"
)

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

wait_for_service() {
  local service="$1"
  local deadline=$((SECONDS + HEALTH_TIMEOUT))
  local container_id status

  while (( SECONDS < deadline )); do
    container_id=$("${COMPOSE[@]}" ps --all -q "$service")
    if [[ -n "$container_id" ]]; then
      status=$(docker inspect \
        --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
        "$container_id" 2>/dev/null || true)
      case "$status" in
        healthy|running)
          printf 'Service %s is %s.\n' "$service" "$status"
          return 0
          ;;
        unhealthy|exited|dead)
          fail "$service entered the $status state"
          ;;
      esac
    fi
    sleep 2
  done

  fail "Timed out after ${HEALTH_TIMEOUT}s waiting for $service"
}

update_service() {
  local service="$1"

  printf '\nUpdating %s...\n' "$service"
  "${COMPOSE[@]}" up \
    -d \
    --force-recreate \
    --no-deps \
    --timeout "$STOP_TIMEOUT" \
    "$service"
  wait_for_service "$service"
}

diagnose() {
  local status=$?
  trap - ERR

  if (( status != 0 )); then
    printf '\nCloud update failed. Current service state:\n' >&2
    "${COMPOSE[@]}" ps --all >&2 || true
    printf '\nRecent service logs:\n' >&2
    "${COMPOSE[@]}" logs \
      --no-color \
      --tail=100 \
      ui-blue auth-blue p2p-blue >&2 || true
  fi

  exit "$status"
}
trap diagnose ERR

require_command docker
[[ -f "$COMPOSE_FILE" ]] || fail "Compose file not found: $COMPOSE_FILE"
[[ -f "$ENV_FILE" ]] || fail "Compose environment file not found: $ENV_FILE"
[[ "$HEALTH_TIMEOUT" =~ ^[1-9][0-9]*$ ]] \
  || fail "KLINOK_HEALTH_TIMEOUT must be a positive integer"
[[ "$STOP_TIMEOUT" =~ ^[1-9][0-9]*$ ]] \
  || fail "KLINOK_STOP_TIMEOUT must be a positive integer"

compose_version_output=""
if ! compose_version_output=$(docker compose version 2>&1); then
  fail "Docker Compose v2 could not start: $compose_version_output"
fi

"${COMPOSE[@]}" config --quiet
configured_services=$("${COMPOSE[@]}" config --services)
for required_service in p2p-blue auth-blue ui-blue; do
  if ! grep -Fxq "$required_service" <<<"$configured_services"; then
    fail "Required service is missing from the Compose configuration: $required_service"
  fi
done

# Complete every pull before replacing a running container. A registry failure
# therefore leaves the current deployment untouched.
printf 'Pulling configured container images...\n'
"${COMPOSE[@]}" pull

# Keep the public UI available while each backend is replaced and verified.
# The UI is replaced last, after both of its dependencies are healthy.
update_service p2p-blue
update_service auth-blue
update_service ui-blue

trap - ERR
printf '\nKlinok cloud containers are up to date.\n'
"${COMPOSE[@]}" ps
