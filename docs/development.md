# Klinok development

## Architecture

- `src/` — Vue UI, API repository, and the seven-day IndexedDB offline cache.
- `packages/contracts/` — shared domain DTOs and command contracts.
- `api-node/` — Fastify API, handwritten PostgreSQL migration, authentication, authorization, email outbox, and audit ledger.
- `docker-compose.yml` — local UI, API, PostgreSQL, Mailpit, and Adminer.

PostgreSQL is authoritative. Every successful user or domain mutation is committed atomically with an operation receipt and a SHA-256 hash-chained audit block. Audit blocks retain their complete before/after JSON snapshots, and every medical-record revision, deletion, and confirmation stores a complete record state. The chain is tamper-evident relative to trusted backups or checkpoints; it is not independently immutable and has no cryptocurrency, mining, smart contracts, P2P replication, or public-chain anchoring.

The browser may show cached data for seven days. Only pet creates/edits and unconfirmed medical-record creates/edits are queued offline. Authentication, role, grant, confirmation, session, and destructive operations require the API.

## Local development

Requirements: Node.js 24+, Docker with Compose, and Chromium for the E2E suite.

```sh
npm ci
npm run build
npm test
npm run lint:check
```

Run the complete local stack:

```sh
docker compose up -d postgres mail adminer
KLINOK_BOOTSTRAP_EMAIL=administrator@example.ru \
KLINOK_BOOTSTRAP_PASSWORD=bootstrap-password-2026 \
docker compose run --rm -T api node api-node/dist/provision.js
docker compose up -d api ui
```

The UI is at `http://localhost:8080`; Mailpit is at `http://localhost:8025`; Adminer is at `http://localhost:8081`. The bootstrap command is idempotent and creates the undeletable Administrator plus the genesis audit block.

Use these values to connect through Adminer:

- System: `PostgreSQL`
- Server: `postgres`
- Username: `klinok`
- Password: `klinok-local-password`, or the value of `KLINOK_POSTGRES_PASSWORD`
- Database: `klinok`

Set `KLINOK_ADMINER_PORT` to expose Adminer on a different localhost port.

For UI development against the Compose API:

```sh
docker compose -f docker-compose.yml -f docker-compose.mixed-dev.yml up -d postgres mail adminer api
npm run dev
```

## Required validation

```sh
npm test
npm run build
npm run lint:check
npm run test:e2e:compose
```

The Compose E2E suite starts with an empty v3 database and removes its test volume afterward.

## Production

See [deployment](deployment.md).
