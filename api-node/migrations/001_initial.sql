-- Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
-- All rights reserved.
-- This file is a part of Klinok application

CREATE TABLE accounts (
  account_id text PRIMARY KEY,
  email text NOT NULL,
  email_normalized text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  credential_status text NOT NULL CHECK (credential_status IN ('pending_verification', 'active', 'locked', 'deleted')),
  immutable_bootstrap boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE profiles (
  account_id text PRIMARY KEY REFERENCES accounts(account_id),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  first_name text NOT NULL,
  last_name text NOT NULL,
  patronymic text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE consent_receipts (
  account_id text PRIMARY KEY REFERENCES accounts(account_id),
  accepted_at timestamptz NOT NULL,
  age_confirmed boolean NOT NULL CHECK (age_confirmed),
  personal_data_consent_version text NOT NULL,
  user_agreement_version text NOT NULL
);

CREATE TABLE roles (
  account_id text NOT NULL REFERENCES accounts(account_id),
  role text NOT NULL CHECK (role IN ('administrator', 'doctor', 'owner')),
  request_id text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('not_requested', 'pending', 'approved', 'rejected', 'revoked')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  profile_revision integer NOT NULL,
  requested_at timestamptz NOT NULL,
  decided_at timestamptz,
  decided_by text REFERENCES accounts(account_id),
  reason text,
  PRIMARY KEY (account_id, role)
);

CREATE TABLE sessions (
  session_id text PRIMARY KEY,
  session_digest char(64) NOT NULL UNIQUE,
  csrf_digest char(64) NOT NULL,
  account_id text NOT NULL REFERENCES accounts(account_id),
  device_id text NOT NULL,
  device_name text NOT NULL,
  created_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX sessions_account_active_idx ON sessions(account_id, device_id) WHERE revoked_at IS NULL;

CREATE TABLE auth_tokens (
  token_digest char(64) PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('verification', 'recovery')),
  account_id text NOT NULL REFERENCES accounts(account_id),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

CREATE TABLE pets (
  pet_id text PRIMARY KEY,
  owner_account_id text NOT NULL REFERENCES accounts(account_id),
  revision integer NOT NULL CHECK (revision > 0),
  name text NOT NULL,
  species text NOT NULL,
  breed text NOT NULL,
  sex text,
  photo_data_url text,
  birth_date date,
  birth_year integer,
  color text,
  chip text,
  brand_mark text,
  latest_vaccination jsonb,
  latest_confirmed_vaccination jsonb,
  weight_kg double precision,
  notes text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz
);
CREATE INDEX pets_owner_idx ON pets(owner_account_id) WHERE deleted_at IS NULL;

CREATE TABLE access_requests (
  request_id text PRIMARY KEY,
  pet_id text NOT NULL REFERENCES pets(pet_id),
  owner_account_id text NOT NULL REFERENCES accounts(account_id),
  requester_account_id text NOT NULL REFERENCES accounts(account_id),
  requester_display_name text,
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  revision integer NOT NULL CHECK (revision > 0),
  requested_at timestamptz NOT NULL,
  decided_at timestamptz,
  decided_by text REFERENCES accounts(account_id)
);
CREATE UNIQUE INDEX access_requests_one_pending_idx ON access_requests(pet_id, requester_account_id) WHERE status = 'pending';

CREATE TABLE access_grants (
  grant_id text PRIMARY KEY,
  pet_id text NOT NULL REFERENCES pets(pet_id),
  grantor_account_id text NOT NULL REFERENCES accounts(account_id),
  grantee_account_id text NOT NULL REFERENCES accounts(account_id),
  grantee_display_name text,
  actions text[] NOT NULL,
  request_id text REFERENCES access_requests(request_id),
  parent_grant_id text REFERENCES access_grants(grant_id),
  revision integer NOT NULL CHECK (revision > 0),
  status text NOT NULL CHECK (status IN ('active', 'revoked', 'relinquished')),
  created_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX access_grants_pet_idx ON access_grants(pet_id, grantee_account_id);
CREATE UNIQUE INDEX access_grants_one_active_idx ON access_grants(pet_id, grantee_account_id) WHERE status = 'active';

CREATE TABLE medical_records (
  record_id text PRIMARY KEY,
  pet_id text NOT NULL REFERENCES pets(pet_id),
  revision integer NOT NULL CHECK (revision > 0),
  author_account_id text NOT NULL REFERENCES accounts(account_id),
  author_display_name text NOT NULL,
  encounter_date date NOT NULL,
  title text NOT NULL,
  text text NOT NULL,
  sections jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz
);
CREATE INDEX medical_records_pet_idx ON medical_records(pet_id) WHERE deleted_at IS NULL;

CREATE TABLE medical_record_confirmations (
  confirmation_id text PRIMARY KEY,
  pet_id text NOT NULL REFERENCES pets(pet_id),
  record_id text NOT NULL REFERENCES medical_records(record_id),
  record_revision integer NOT NULL,
  owner_account_id text NOT NULL REFERENCES accounts(account_id),
  confirmed_at timestamptz NOT NULL,
  applied_profile_weight_kg double precision,
  applied_profile_chip text,
  applied_profile_latest_vaccination jsonb,
  UNIQUE(record_id)
);

CREATE TABLE operation_receipts (
  operation_id text PRIMARY KEY,
  actor_account_id text NOT NULL REFERENCES accounts(account_id),
  command_type text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE email_outbox (
  email_id text PRIMARY KEY,
  recipient text NOT NULL,
  subject text NOT NULL,
  text_body text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  terminal_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_outbox_pending_idx ON email_outbox(next_attempt_at) WHERE sent_at IS NULL AND terminal_error IS NULL;

CREATE TABLE ledger_head (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  height bigint NOT NULL,
  block_hash char(64) NOT NULL
);
INSERT INTO ledger_head(singleton, height, block_hash) VALUES (true, 0, repeat('0', 64));

CREATE TABLE audit_blocks (
  height bigint PRIMARY KEY,
  ledger_version integer NOT NULL,
  operation_id text NOT NULL UNIQUE,
  action text NOT NULL,
  actor_account_id text NOT NULL,
  active_role text,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  related_account_id text,
  metadata jsonb NOT NULL,
  before_state jsonb NOT NULL,
  after_state jsonb NOT NULL,
  before_state_hash char(64) NOT NULL,
  after_state_hash char(64) NOT NULL,
  created_at timestamptz NOT NULL,
  previous_hash char(64) NOT NULL,
  block_hash char(64) NOT NULL UNIQUE
);
CREATE INDEX audit_blocks_action_idx ON audit_blocks(action, height DESC);
