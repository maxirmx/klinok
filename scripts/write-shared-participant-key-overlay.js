// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  BUILD_SHARED_PARTICIPANT_KEY_FILE_MODE,
  createSharedParticipantKeyOverlay,
  decodePrivateJwkBase64,
  formatSharedParticipantKeyOverlay,
} from "./shared-participant-key.js";

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const secretFilePath = readArg("--secret-file");
const outputPath = resolve(readArg("--output") ?? "public/shared-participant-key.json");
const optional = process.argv.includes("--optional");

if (!secretFilePath || !existsSync(secretFilePath)) {
  if (optional) {
    console.log("Shared participant key secret was not provided; skipping overlay generation.");
    process.exit(0);
  }

  throw new Error("Missing --secret-file for shared participant key overlay generation.");
}

const secretValue = readFileSync(secretFilePath, "utf8").trim();
if (!secretValue) {
  if (optional) {
    console.log("Shared participant key secret was empty; skipping overlay generation.");
    process.exit(0);
  }

  throw new Error("Shared participant key secret is empty.");
}

const privateKey = decodePrivateJwkBase64(secretValue);
const overlay = await createSharedParticipantKeyOverlay(privateKey);
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, formatSharedParticipantKeyOverlay(overlay), { mode: BUILD_SHARED_PARTICIPANT_KEY_FILE_MODE });
console.log(`Shared participant key overlay written to ${outputPath}`);
