// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  createSharedParticipantKeyOverlay,
  encodePrivateJwkBase64,
  formatSharedParticipantKeyOverlay,
  generateSharedParticipantPrivateKey,
  LOCAL_SHARED_PARTICIPANT_KEY_FILE_MODE,
} from "./shared-participant-key.js";

const outputArgIndex = process.argv.indexOf("--output");
const outputPath = resolve(
  outputArgIndex >= 0 && process.argv[outputArgIndex + 1]
    ? process.argv[outputArgIndex + 1]
    : "public/shared-participant-key.local.json",
);

const privateKey = await generateSharedParticipantPrivateKey();
const overlay = await createSharedParticipantKeyOverlay(privateKey);
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, formatSharedParticipantKeyOverlay(overlay), { mode: LOCAL_SHARED_PARTICIPANT_KEY_FILE_MODE });

console.log(`Shared participant key written to ${outputPath}`);
console.log("Repository secret value for KLINOK_DEMO_PARTICIPANT_PRIVATE_KEY_B64:");
console.log(encodePrivateJwkBase64(privateKey));
