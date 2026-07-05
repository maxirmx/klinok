#!/bin/sh
# Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
# All rights reserved.
# This file is a part of Klinok ui application

set -eu

# This script updates the runtime configuration with environment variables.

CONFIG_PATH=${CONFIG_PATH:-/var/www/klinok/config.json}
ENABLE_LOG=${ENABLE_LOG:-false}

case "$ENABLE_LOG" in
  true|false) ;;
  *) ENABLE_LOG=false ;;
esac

cat > "$CONFIG_PATH" <<EOF
{
  "enableLog": $ENABLE_LOG
}
EOF

echo "Runtime configuration updated:"
echo "Enable Log: ${ENABLE_LOG}"
