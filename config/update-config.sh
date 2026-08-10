#!/bin/sh
# Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
# All rights reserved.
# This file is a part of Klinok application

set -eu

CONFIG_PATH=${CONFIG_PATH:-/var/www/klinok/config.json}
ENABLE_LOG=${ENABLE_LOG:-false}
BOOTSTRAP_ACCOUNT_ID=${KLINOK_BOOTSTRAP_ACCOUNT_ID:-bootstrap-administrator}
OFFLINE_LEASE_DAYS=${KLINOK_OFFLINE_LEASE_DAYS:-7}
PERSONAL_DATA_VERSION=${KLINOK_PERSONAL_DATA_CONSENT_VERSION:-2026-07-10}
USER_AGREEMENT_VERSION=${KLINOK_USER_AGREEMENT_VERSION:-2026-07-10}

case "$ENABLE_LOG" in true|false) ;; *) ENABLE_LOG=false ;; esac
case "$OFFLINE_LEASE_DAYS" in ''|*[!0-9]*) OFFLINE_LEASE_DAYS=7 ;; esac

cat > "$CONFIG_PATH" <<EOF
{
  "enableLog": $ENABLE_LOG,
  "apiBaseUrl": "",
  "dataGeneration": "v3",
  "bootstrapAccountId": "$BOOTSTRAP_ACCOUNT_ID",
  "offlineLeaseDays": $OFFLINE_LEASE_DAYS,
  "legal": {
    "personalDataConsent": { "version": "$PERSONAL_DATA_VERSION", "href": "/legal/personal-data-consent" },
    "userAgreement": { "version": "$USER_AGREEMENT_VERSION", "href": "/legal/user-agreement" }
  }
}
EOF

echo "Klinok v3 public runtime configuration updated."
