// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

export type NavIcon = "home" | "bag" | "calendar" | "book" | "user";

export interface NavItem {
  label: string;
  path: string;
  icon: NavIcon;
  match: string[];
}

export const ownerNavigation: NavItem[] = [
  { label: "Главная", path: "/owner/home", icon: "home", match: ["/owner/home"] },
  { label: "Питомцы", path: "/owner/pets", icon: "bag", match: ["/owner/pets"] },
  { label: "Заявки", path: "/owner/booking", icon: "calendar", match: ["/owner/booking", "/owner/visits", "/owner/doctors"] },
  { label: "Справочник", path: "/owner/materials", icon: "book", match: ["/owner/materials", "/owner/analysis"] },
  { label: "Профиль", path: "/owner/profile", icon: "user", match: ["/owner/profile"] },
];
