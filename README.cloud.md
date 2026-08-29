# Klinok v3 deployment

The cloud layout is a single API instance backed by PostgreSQL, with an internal nginx UI serving the Vue application and proxying `/api/` to the API. Choose one public-edge overlay: the shared `sw-consulting-edge` network or a dedicated production nginx service. There is no public P2P port or trust-key configuration.

## Host preparation

Install Docker with Compose and prepare:

```text
/srv/klinok/certificate/s.crt
/srv/klinok/certificate/s.key
/srv/klinok/postgres.v3/data
```

For dedicated production, prepare the existing certificate files:

```text
/srv/klinok/certificate/s.crt
/srv/klinok/certificate/s.key
```

Create `klinok.env` with at least:

```dotenv
KLINOK_DOMAIN=klinok.sw.consulting
KLINOK_POSTGRES_PASSWORD=replace-with-a-long-random-password
KLINOK_BOOTSTRAP_EMAIL=administrator@example.ru
KLINOK_BOOTSTRAP_PASSWORD=replace-with-a-long-bootstrap-password
KLINOK_SMTP_HOST=mail.example.ru
KLINOK_SMTP_PORT=465
KLINOK_SMTP_SECURE=true
KLINOK_SMTP_USER=klinok@example.ru
KLINOK_SMTP_PASSWORD=replace-with-the-smtp-password
KLINOK_SMTP_FROM=Клинок <klinok@example.ru>
```

Protect this file with mode `0600`. The database password is used only between the API and PostgreSQL. TLS and encrypted host/database backups are responsible for data-at-rest protection; v3 intentionally does not apply application-level or end-to-end encryption.

## Initial provisioning

From the repository root, select the shared edge or dedicated production target:

```sh
chmod +x scripts/bootstrap-cloud.sh
scripts/bootstrap-cloud.sh edge
scripts/bootstrap-cloud.sh production
```

The `edge` target requires the external `sw-consulting-edge` network and publishes no host ports. The `production` target starts a dedicated nginx service on ports 80 and 443 and requires the certificate files above. Both targets start PostgreSQL, run the idempotent bootstrap Administrator CLI, and then start the private API and UI. Provisioning records the genesis audit block. The bootstrap account and its Administrator role cannot be deleted or revoked.

After the first successful start, remove `KLINOK_BOOTSTRAP_PASSWORD` from persistent shell history and keep it in an approved password manager. It is needed only to sign in, not to start containers.

## Updates

```sh
scripts/update-cloud.sh edge
scripts/update-cloud.sh production
```

The API runs SQL migrations before accepting traffic and verifies the complete audit chain at startup. If verification fails, `/readyz` remains unhealthy and mutations return `LEDGER_INVALID`; diagnostic health and database reads remain available for investigation.

## Backups and ledger checkpoints

Use encrypted PostgreSQL backups and regularly test restoration. Audit blocks contain complete before/after JSON snapshots, including sensitive medical-record revisions, so backup access must be restricted accordingly. Retain the corresponding ledger head (`height` and `block_hash`) as a trusted checkpoint outside the database. The internal chain detects reordered, deleted, or altered audit blocks or state snapshots relative to that checkpoint, but it is not a public blockchain and an attacker able to replace both the database and every trusted backup/checkpoint could rewrite it.

An existing v2 deployment may be kept separately as a read-only archive. Version 3 starts with an empty database and performs no account, pet, grant, or medical-history migration.

## Operations

Useful checks:

```sh
docker compose --env-file klinok.env -f docker-compose-ghrc.yml -f docker-compose.edge.yml ps
docker compose --env-file klinok.env -f docker-compose-ghrc.yml -f docker-compose.edge.yml logs --tail=200 api-blue ui-blue postgres-blue
curl --fail https://klinok.sw.consulting/api/auth/session
```

Only ports 80 and 443 need to be public. PostgreSQL and the API remain on the Compose network. Keep one API instance because rate limiting and the email worker are intentionally designed for the stated single-instance deployment.
