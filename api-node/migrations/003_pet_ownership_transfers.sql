-- Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
-- All rights reserved.
-- This file is a part of Klinok application

CREATE TABLE pet_ownership_transfers (
  transfer_request_id text PRIMARY KEY,
  pet_id text NOT NULL REFERENCES pets(pet_id),
  pet_revision integer NOT NULL CHECK (pet_revision > 0),
  from_owner_account_id text NOT NULL REFERENCES accounts(account_id),
  from_owner_profile_revision integer NOT NULL CHECK (from_owner_profile_revision > 0),
  to_owner_account_id text NOT NULL REFERENCES accounts(account_id),
  to_owner_profile_revision integer NOT NULL CHECK (to_owner_profile_revision > 0),
  initiated_by_account_id text NOT NULL REFERENCES accounts(account_id),
  status text NOT NULL CHECK (status IN ('pending', 'completed', 'rejected', 'cancelled', 'invalidated')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by text REFERENCES accounts(account_id),
  CHECK (from_owner_account_id <> to_owner_account_id),
  CHECK (initiated_by_account_id IN (from_owner_account_id, to_owner_account_id))
);

CREATE UNIQUE INDEX pet_ownership_transfers_one_pending_idx
  ON pet_ownership_transfers(pet_id) WHERE status = 'pending';
CREATE INDEX pet_ownership_transfers_from_owner_pending_idx
  ON pet_ownership_transfers(from_owner_account_id, created_at DESC) WHERE status = 'pending';
CREATE INDEX pet_ownership_transfers_to_owner_pending_idx
  ON pet_ownership_transfers(to_owner_account_id, created_at DESC) WHERE status = 'pending';
CREATE INDEX pet_ownership_transfers_from_owner_history_idx
  ON pet_ownership_transfers(from_owner_account_id, created_at DESC);
CREATE INDEX pet_ownership_transfers_to_owner_history_idx
  ON pet_ownership_transfers(to_owner_account_id, created_at DESC);
