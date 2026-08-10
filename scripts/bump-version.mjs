// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const target = process.argv[2]?.replace(/^v/, "");
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
if (!target || !semver.test(target)) {
  console.error("Usage: npm run release:bump -- <version>");
  process.exit(1);
}

const manifests = ["package.json", "api-node/package.json", "packages/contracts/package.json"];
async function json(path) { return JSON.parse(await readFile(resolve(root, path), "utf8")); }
const currentVersions = new Set(await Promise.all(manifests.map(async (path) => (await json(path)).version)));
if (currentVersions.size !== 1) throw new Error(`Klinok component versions are inconsistent: ${[...currentVersions].join(", ")}`);

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npm, [
  "version", target, "--no-git-tag-version", "--allow-same-version", "--ignore-scripts",
  "--include-workspace-root", "--workspace", "@klinok/api-node", "--workspace", "@klinok/contracts",
], { cwd: root, stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

for (const path of manifests) {
  const actual = (await json(path)).version;
  if (actual !== target) throw new Error(`${path} has version ${actual}; expected ${target}`);
}
const lock = await json("package-lock.json");
for (const path of ["", "api-node", "packages/contracts"]) {
  if (lock.packages[path]?.version !== target) throw new Error(`package-lock.json entry ${path || "<root>"} was not updated`);
}
console.log(`All Klinok components updated to ${target}`);
