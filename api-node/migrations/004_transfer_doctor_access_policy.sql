-- Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
-- All rights reserved.
-- This file is a part of Klinok application

ALTER TABLE pet_ownership_transfers
  ADD COLUMN retain_doctor_access boolean NOT NULL DEFAULT false;
