// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

export function normalizeRussianSearchText(value: string): string {
  return value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
}
