// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

interface UserAgentBrand {
  brand: string;
  version: string;
}

export interface DeviceNavigator {
  platform?: string;
  userAgent?: string;
  maxTouchPoints?: number;
  userAgentData?: {
    platform?: string;
    brands?: readonly UserAgentBrand[];
  };
}

function operatingSystem(source: DeviceNavigator): string {
  const userAgent = source.userAgent ?? "";
  const platform = source.userAgentData?.platform || source.platform || "";
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Mac/i.test(platform) && (source.maxTouchPoints ?? 0) > 1)) return "iOS";
  if (/Android/i.test(userAgent)) return "Android";
  if (/CrOS/i.test(userAgent)) return "ChromeOS";
  if (/Windows|Win32|Win64/i.test(`${platform} ${userAgent}`)) return "Windows";
  if (/Macintosh|MacIntel|MacPPC|Mac68K|macOS/i.test(`${platform} ${userAgent}`)) return "macOS";
  if (/Linux/i.test(`${platform} ${userAgent}`)) return "Linux";
  return "";
}

function browserName(source: DeviceNavigator): string {
  const userAgent = source.userAgent ?? "";
  const brands = (source.userAgentData?.brands ?? []).map((brand) => brand.brand).join(" ");
  const identity = `${brands} ${userAgent}`;
  if (/Microsoft Edge|EdgA|EdgiOS|Edg\//i.test(identity)) return "Edge";
  if (/SamsungBrowser/i.test(identity)) return "Samsung Internet";
  if (/Opera|OPR\//i.test(identity)) return "Opera";
  if (/Firefox|FxiOS/i.test(identity)) return "Firefox";
  if (/Google Chrome|Chrome|CriOS/i.test(identity)) return "Chrome";
  if (/Chromium/i.test(identity)) return "Chromium";
  if (/Safari/i.test(userAgent)) return "Safari";
  return "";
}

export function suggestedDeviceName(source?: DeviceNavigator): string {
  const current = source ?? (typeof navigator === "undefined" ? {} : navigator as DeviceNavigator);
  const parts = [operatingSystem(current), browserName(current)].filter(Boolean);
  return parts.join(" · ") || "Браузер";
}
