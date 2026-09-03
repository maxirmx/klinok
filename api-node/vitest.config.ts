// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { defineConfig } from "vitest/config";

export default defineConfig({ test: { environment: "node", include: ["test/**/*.spec.ts"] } });
