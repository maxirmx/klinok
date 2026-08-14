// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { Buffer } from "node:buffer";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const password = "correct horse battery";
const replicationTimeout = 30_000;
const execFile = promisify(execFileCallback);
const mailpitUrl = process.env.KLINOK_E2E_MAILPIT_URL ?? "http://localhost:8025";

async function verificationLink(request: APIRequestContext, email: string): Promise<string> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const list = await request.get(`${mailpitUrl}/api/v1/messages`);
    const messages = (await list.json()).messages as Array<{ ID: string }>;
    for (const summary of messages) {
      const message = await request.get(`${mailpitUrl}/api/v1/message/${summary.ID}`);
      const body = await message.json() as { Text?: string; HTML?: string; To?: Array<{ Address?: string }> };
      if (body.To?.length && !body.To.some((recipient) => recipient.Address?.toLocaleLowerCase() === email.toLocaleLowerCase())) continue;
      const match = `${body.Text ?? ""} ${body.HTML ?? ""}`.match(/https?:\/\/[^\s<]+\/auth\/verify-email\?token=[^\s<]+/);
      if (match) return match[0].replace(/&amp;/g, "&");
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Verification email for ${email} was not captured by Mailpit.`);
}

async function expectEmailText(request: APIRequestContext, email: string, expectedText: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const list = await request.get(`${mailpitUrl}/api/v1/messages`);
    const messages = (await list.json()).messages as Array<{ ID: string }>;
    for (const summary of messages) {
      const message = await request.get(`${mailpitUrl}/api/v1/message/${summary.ID}`);
      const body = await message.json() as { Text?: string; To?: Array<{ Address?: string }> };
      if (body.To?.some((recipient) => recipient.Address?.toLocaleLowerCase() === email.toLocaleLowerCase()) && body.Text?.includes(expectedText)) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Email containing "${expectedText}" for ${email} was not captured by Mailpit.`);
}

async function register(page: Page, request: APIRequestContext, input: {
  firstName: string;
  lastName: string;
  email: string;
  role: "owner" | "doctor";
}) {
  await page.goto("/auth/register");
  await page.getByLabel("Имя").fill(input.firstName);
  await page.getByLabel("Фамилия").fill(input.lastName);
  await page.getByLabel("Электронная почта").fill(input.email);
  await page.getByLabel(/Пароль —/).fill(password);
  await page.getByLabel("Повторите пароль").fill(password);
  if (input.role === "doctor") {
    await page.getByLabel("Ветеринар").check();
  }
  await page.getByRole("button", { name: "Продолжить" }).click();
  await page.getByLabel(/регистрируюсь в тестовой системе/).check();
  await page.getByLabel(/не использовать при регистрации/).check();
  await page.getByLabel(/исполнилось 18/).check();
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();
  await expect(page).toHaveURL(/\/auth\/verify-email$/);
  await expect(page.getByText(/Перейдите в Вашу программу электронной почты/)).toBeVisible();
  await page.goto(await verificationLink(request, input.email));
  await expect(page.getByText(/Почта подтверждена/)).toBeVisible();
}

async function login(page: Page, email: string, accountPassword = password) {
  await page.goto("/auth/login");
  await page.getByLabel("Электронная почта").fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(accountPassword);
  await page.getByRole("button", { name: "Войти" }).click();
}

async function accountId(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const session = await fetch("/api/auth/session").then((response) => response.json()) as { accountId?: string };
    if (!session.accountId) throw new Error("Authenticated session did not include an account ID.");
    return session.accountId;
  });
}

async function newPage(context: BrowserContext, label: string): Promise<Page> {
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" || message.type() === "warning") {
      console.log(`[browser:${label}:${message.type()}] ${text}`);
    }
  });
  page.on("pageerror", (error) => console.error(`[browser:${label}:pageerror] ${error.message}`));
  page.on("requestfailed", (request) => console.error(`[browser:${label}:requestfailed] ${request.method()} ${request.url()} ${request.failure()?.errorText ?? "unknown"}`));
  return page;
}

async function attachLargePetPhoto(page: Page): Promise<void> {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable.");
    const pixels = context.createImageData(canvas.width, canvas.height);
    let value = 0x12345678;
    for (let index = 0; index < pixels.data.length; index += 4) {
      value ^= value << 13;
      value ^= value >>> 17;
      value ^= value << 5;
      pixels.data[index] = value & 0xff;
      pixels.data[index + 1] = (value >>> 8) & 0xff;
      pixels.data[index + 2] = (value >>> 16) & 0xff;
      pixels.data[index + 3] = 0xff;
    }
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL("image/png").split(",")[1]!;
  });
  await page.locator('input[type="file"][accept*="image/png"]').setInputFiles({
    name: "pet-photo.png",
    mimeType: "image/png",
    buffer: Buffer.from(base64, "base64"),
  });
  const preview = page.getByAltText("Предпросмотр фотографии питомца");
  await expect(preview).toBeVisible();
  const processedLength = await preview.evaluate((image) => (image as HTMLImageElement).src.length);
  expect(processedLength).toBeGreaterThan(64 * 1024);
}

async function openProfileAndWaitForSync(page: Page) {
  if (new URL(page.url()).pathname !== "/profile") {
    await page.locator(".workspace-sidebar").getByRole("button", { name: "Настройки" }).click();
  }
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.locator(".profile-sync-status .sync-status"))
    .toContainText("Сохранено", { timeout: replicationTimeout });
}

async function clearBrowserStorage(page: Page) {
  await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    const databases = typeof indexedDB.databases === "function" ? await indexedDB.databases() : [];
    for (const database of databases) {
      if (!database.name) continue;
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(database.name!);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error(`IndexedDB ${database.name} is still open.`));
      });
    }
  });
}

async function restartApi() {
  await execFile("docker", ["compose", "restart", "api"], { cwd: process.cwd(), env: process.env });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await execFile("docker", ["compose", "exec", "-T", "api", "node", "-e", "fetch('http://127.0.0.1:8090/readyz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"], {
        cwd: process.cwd(), env: process.env,
      });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error("API did not become ready after restart.");
}

async function queryPostgres(sql: string): Promise<string> {
  const result = await execFile("docker", [
    "compose", "exec", "-T", "postgres", "psql", "-U", "klinok", "-d", "klinok", "-At", "-c", sql,
  ], { cwd: process.cwd(), env: process.env });
  return result.stdout.trim();
}

test("fresh provisioning, Doctor approval, grant, draft, and confirmation", async ({ browser, request }) => {
  test.slow();
  const suffix = Date.now();
  const doctorEmail = `doctor-${suffix}@example.ru`;
  const ownerEmail = `owner-${suffix}@example.ru`;
  const doctorPage = await newPage(await browser.newContext(), "doctor");
  await register(doctorPage, request, { firstName: "Алёна", lastName: "Врач", email: doctorEmail, role: "doctor" });
  await login(doctorPage, doctorEmail);
  await expect(doctorPage).toHaveURL(/\/profile/, { timeout: replicationTimeout });
  const doctorAccountId = await accountId(doctorPage);
  await expect(doctorPage.getByText("Ожидает решения")).toBeVisible();
  const administratorEmail = process.env.KLINOK_E2E_BOOTSTRAP_EMAIL ?? "administrator@example.ru";
  await expectEmailText(request, administratorEmail, "запросил роль «Ветеринар»");

  const administratorPage = await newPage(await browser.newContext(), "administrator");
  await login(administratorPage, administratorEmail, process.env.KLINOK_E2E_BOOTSTRAP_PASSWORD ?? "bootstrap-password-2026");
  await expect(administratorPage).toHaveURL(/\/admin\/home/);
  await administratorPage.getByLabel("ФИО или идентификатор").fill("Алена");
  const requestRow = administratorPage.locator(".administrator-table tbody tr").filter({ hasText: doctorAccountId });
  await expect(requestRow).toBeVisible({ timeout: replicationTimeout });
  await requestRow.getByRole("button", { name: "Одобрить роль «Ветеринар»", exact: true }).click();
  const approvalDialog = administratorPage.getByRole("dialog", { name: "Одобрить роль «Ветеринар»?" });
  await expect(approvalDialog).toBeVisible();
  await approvalDialog.getByRole("button", { name: "Одобрить", exact: true }).click();
  await expect(approvalDialog).toBeHidden();
  await expectEmailText(request, doctorEmail, "Роль «Ветеринар» одобрена.");

  await doctorPage.bringToFront();
  const approvedDoctorRole = doctorPage.locator(".role-selection-card").filter({ hasText: "Ветеринар" });
  await expect(approvedDoctorRole.getByText("Одобрена", { exact: true })).toBeVisible({ timeout: replicationTimeout });
  const doctorHome = doctorPage.locator(".workspace-sidebar").getByRole("link", { name: "Мед. карты" });
  await expect(doctorHome).toBeVisible({ timeout: replicationTimeout });
  await doctorHome.click();
  await expect(doctorPage).toHaveURL(/\/doctor\/home/);

  const ownerPage = await newPage(await browser.newContext(), "owner");
  await register(ownerPage, request, { firstName: "Семен", lastName: "Владелец", email: ownerEmail, role: "owner" });
  await login(ownerPage, ownerEmail);
  await expect(ownerPage).toHaveURL(/\/owner\/home/);
  await ownerPage.locator(".workspace-sidebar").getByRole("link", { name: "Добавить питомца" }).click();
  await expect(ownerPage).toHaveURL(/\/owner\/pets\/new/);
  await ownerPage.getByLabel("Кличка").fill("Ёжик");
  await ownerPage.getByLabel("Вид").selectOption("Собака");
  await ownerPage.getByLabel("Порода").fill("Бигль");
  await ownerPage.getByLabel("Пол").selectOption("Интактный самец");
  await ownerPage.getByLabel("Точная дата рождения", { exact: true }).fill("2022-06-17");
  await ownerPage.getByLabel("Окрас", { exact: true }).fill("трёхцветный");
  await ownerPage.getByLabel("Вес, кг").fill("12.4");
  await ownerPage.getByLabel("Заметки").fill("Первичная заметка");
  await attachLargePetPhoto(ownerPage);
  await ownerPage.getByRole("button", { name: "Сохранить питомца" }).click();
  await expect(ownerPage).toHaveURL(/\/owner\/pets\/[0-9a-f-]+$/i);
  const petId = new URL(ownerPage.url()).pathname.split("/").at(-1)!;
  await expect(ownerPage.getByText("Первичная заметка")).toBeVisible();
  await ownerPage.getByRole("link", { name: "Редактировать" }).click();
  await ownerPage.getByLabel("Заметки").fill("Наблюдать за аппетитом");
  await ownerPage.getByRole("button", { name: "Сохранить изменения" }).click();
  await expect(ownerPage.getByText("Наблюдать за аппетитом")).toBeVisible();
  await openProfileAndWaitForSync(ownerPage);
  const currentDeviceRow = ownerPage.locator(".device-security .device-row").filter({ hasText: "Текущий сеанс" });
  const currentDeviceName = currentDeviceRow.getByRole("textbox", { name: "Название устройства", exact: true });
  await expect(currentDeviceName).toHaveValue(/^(macOS|Linux) · Chrome$/);
  await currentDeviceName.fill("Основной браузер");
  await currentDeviceRow.getByRole("button", { name: "Сохранить название устройства" }).click();
  await expect(ownerPage.getByText("Название устройства сохранено.")).toBeVisible();
  await expect(currentDeviceName).toHaveValue("Основной браузер");
  await ownerPage.locator(".workspace-sidebar").getByRole("link", { name: "Ёжик", exact: true }).click();
  await expect(ownerPage).toHaveURL(new RegExp(`/owner/pets/${petId}$`));

  await doctorPage.bringToFront();
  await doctorPage.getByRole("button", { name: "Запросить доступ", exact: true }).click();
  const accessDialog = doctorPage.getByRole("dialog", { name: "Запросить доступ" });
  await accessDialog.getByRole("searchbox", { name: /^ФИО владельца/ }).fill("Семён Владелец");
  await accessDialog.getByRole("searchbox", { name: /^Кличка/ }).fill("Ежик");
  await accessDialog.getByRole("button", { name: "Найти питомца" }).click();
  const requestResult = accessDialog.locator(".doctor-request-result").filter({ hasText: petId });
  await expect(requestResult).toBeVisible({ timeout: replicationTimeout });
  await requestResult.getByRole("button", { name: "Отправить запрос" }).click();
  await expect(doctorPage.getByText("Запрос отправлен владельцу.")).toBeVisible();
  await expectEmailText(request, ownerEmail, "запросил доступ к питомцу «Ёжик»");

  await ownerPage.bringToFront();
  await ownerPage.getByRole("link", { name: "Доступ врачей" }).click();
  await expect(ownerPage).toHaveURL(new RegExp(`/owner/pets/${petId}/access$`));
  const accessRequest = ownerPage.locator(".owner-access-table tbody tr").filter({ hasText: doctorAccountId });
  await expect(accessRequest).toBeVisible({ timeout: replicationTimeout });
  await accessRequest.getByRole("button", { name: "Предоставить доступ", exact: true }).click();
  await expectEmailText(request, doctorEmail, "Доступ к питомцу «Ёжик» предоставлен.");
  await ownerPage.getByRole("link", { name: "Назад к информации о питомце" }).click();
  await expect(ownerPage).toHaveURL(new RegExp(`/owner/pets/${petId}$`));

  await doctorPage.bringToFront();
  await openProfileAndWaitForSync(doctorPage);
  await doctorPage.locator(".workspace-sidebar").getByRole("link", { name: "Мед. карты" }).click();
  await expect(doctorPage).toHaveURL(/\/doctor\/home/);
  await doctorPage.getByLabel("ФИО владельца, кличка, вид или полный идентификатор").fill("Ежик");
  const medicalCard = doctorPage.locator(".doctor-access-table tbody tr").filter({ hasText: petId });
  await expect(medicalCard).toBeVisible({ timeout: replicationTimeout });
  await medicalCard.getByRole("link", { name: "Открыть медицинскую карту" }).click();
  await expect(doctorPage).toHaveURL(new RegExp(
    `/doctor/pets/${petId}\\?grantId=[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$`,
    "i",
  ));
  await doctorPage.getByRole("tree", { name: "Всё хорошо, необходимо", exact: true })
    .locator("summary").click();
  await doctorPage.getByLabel("Контрольный осмотр", { exact: true }).check();
  await doctorPage.locator(".encounter-what-happened").getByLabel("Комментарий").fill("Состояние стабильное");
  await doctorPage.getByLabel("В стадии наблюдения", { exact: true }).check();
  await doctorPage.locator(".encounter-outcome").getByLabel("Комментарий").fill("Контроль через неделю");
  await doctorPage.locator(".encounter-add-section select").selectOption("general-data");
  await doctorPage.getByLabel("Вес, кг", { exact: true }).fill("14.3");
  await doctorPage.locator(".encounter-add-section select").selectOption("therapeutic-appointment");
  const therapeuticCard = doctorPage.locator(".encounter-section-card").filter({ hasText: "Терапевтический приём" });
  const therapeuticTabs = therapeuticCard.getByRole("tab");
  await expect(therapeuticTabs).toHaveCount(5);
  await therapeuticCard.getByRole("button", { name: "Импортировать из «Что случилось»" }).click();
  await expect(therapeuticCard.getByLabel("Проблема", { exact: true })).toHaveValue("Контрольный осмотр");
  await therapeuticCard.getByLabel("Как давно началось").selectOption("problem.onset.today");
  await expect(therapeuticCard.getByLabel("Как давно началось")).toHaveValue("problem.onset.today");
  await therapeuticCard.getByRole("tab", { name: "Рекомендации" }).click();
  await therapeuticCard.getByLabel("Текст рекомендаций").fill("Повторный осмотр через неделю");
  await therapeuticCard.getByRole("tab", { name: "Назначения" }).click();
  await therapeuticCard.getByLabel("Текст назначений").fill("Щадящий режим");
  await doctorPage.locator(".encounter-add-section select").selectOption("diagnosis");
  const diagnosisCard = doctorPage.locator(".encounter-section-card").filter({
    has: doctorPage.getByRole("heading", { name: "Диагноз", exact: true }),
  });
  const diagnosisFields = diagnosisCard.locator("fieldset.diagnosis-field");
  const preliminaryDiagnosis = diagnosisFields.filter({ has: doctorPage.getByText("Предварительный диагноз", { exact: true }) });
  const differentialDiagnosis = diagnosisFields.filter({ has: doctorPage.getByText("Дифференциальные диагнозы", { exact: true }) });
  const confirmedDiagnosis = diagnosisFields.filter({ has: doctorPage.getByText("Подтверждённый диагноз", { exact: true }) });
  const diagnosisRightActions = [
    diagnosisCard.getByRole("button", { name: "Удалить раздел" }),
    preliminaryDiagnosis.getByRole("button", { name: "Назначить предварительный диагноз подтверждённым" }),
    differentialDiagnosis.getByRole("button", { name: "Показать варианты диагнозов" }),
    confirmedDiagnosis.getByRole("button", { name: "Показать варианты диагнозов" }),
  ];
  const diagnosisActionCenters = await Promise.all(diagnosisRightActions.map(async (action) => {
    const box = await action.boundingBox();
    expect(box).not.toBeNull();
    return box!.x + box!.width / 2;
  }));
  expect(Math.max(...diagnosisActionCenters) - Math.min(...diagnosisActionCenters)).toBeLessThanOrEqual(1);
  await preliminaryDiagnosis.getByRole("combobox", { name: "Предварительный диагноз" }).fill("Подозрение на анафилаксию");
  await preliminaryDiagnosis.getByRole("button", { name: "Назначить предварительный диагноз подтверждённым" }).click();
  await differentialDiagnosis.getByRole("button", { name: "Показать варианты диагнозов" }).click();
  await expect(differentialDiagnosis.getByText("Выберите категорию", { exact: true })).toBeVisible();
  await differentialDiagnosis.getByRole("option", { name: "Патологии общего состояния", exact: true }).click();
  await differentialDiagnosis.getByRole("option", { name: "Отёк Квинке", exact: true }).click();
  await differentialDiagnosis.getByRole("combobox", { name: "Добавить дифференциальный диагноз" }).fill("Реакция на корм");
  await differentialDiagnosis.getByRole("button", { name: "Добавить диагноз в свободной форме" }).click();
  await differentialDiagnosis.getByRole("combobox", { name: "Добавить дифференциальный диагноз" }).fill("Просто шок");
  await differentialDiagnosis.getByRole("button", { name: "Добавить диагноз в свободной форме" }).click();
  const differentialChipWidths = await differentialDiagnosis.locator(".diagnosis-selected-chip")
    .evaluateAll((chips) => chips.map((chip) => chip.getBoundingClientRect().width));
  expect(differentialChipWidths).toHaveLength(3);
  expect(Math.max(...differentialChipWidths) - Math.min(...differentialChipWidths)).toBeLessThanOrEqual(1);
  const differentialRemoveOffsets = await differentialDiagnosis.locator(".diagnosis-selected-chip")
    .evaluateAll((chips) => chips.map((chip) => {
      const remove = chip.querySelector<HTMLElement>("button:last-child")!;
      return Math.abs(chip.getBoundingClientRect().right - remove.getBoundingClientRect().right);
    }));
  expect(differentialRemoveOffsets).toHaveLength(3);
  expect(Math.max(...differentialRemoveOffsets)).toBeLessThanOrEqual(1);
  await doctorPage.setViewportSize({ width: 752, height: 1200 });
  const narrowDiagnosisRightActionCenters = await Promise.all([
    ...diagnosisRightActions,
    ...await differentialDiagnosis.locator(".diagnosis-selected-chip > button:last-child").all(),
  ].map(async (action) => {
    const box = await action.boundingBox();
    expect(box).not.toBeNull();
    return box!.x + box!.width / 2;
  }));
  expect(Math.max(...narrowDiagnosisRightActionCenters) - Math.min(...narrowDiagnosisRightActionCenters)).toBeLessThanOrEqual(1);
  await differentialDiagnosis.getByRole("button", { name: "Назначить «Отёк Квинке» подтверждённым диагнозом" }).click();
  await doctorPage.getByRole("alertdialog", { name: "Заменить подтверждённый диагноз?" })
    .getByRole("button", { name: "Заменить", exact: true }).click();

  await doctorPage.setViewportSize({ width: 900, height: 800 });
  const mediumTabRows = await therapeuticTabs.evaluateAll((tabs) => tabs.reduce<number[]>((rows, tab) => {
    const top = Math.round(tab.getBoundingClientRect().top);
    const row = rows.findIndex((candidate) => Math.abs(candidate - top) <= 2);
    if (row < 0) rows.push(top);
    return rows;
  }, []));
  expect(mediumTabRows).toHaveLength(2);
  await doctorPage.setViewportSize({ width: 390, height: 844 });
  await expect(therapeuticTabs).toHaveCount(5);
  expect(await therapeuticCard.evaluate((card) => card.scrollWidth <= card.clientWidth + 1)).toBe(true);
  const narrowTabRows = await therapeuticTabs.evaluateAll((tabs) => tabs.reduce<number[]>((rows, tab) => {
    const top = Math.round(tab.getBoundingClientRect().top);
    if (!rows.some((candidate) => Math.abs(candidate - top) <= 2)) rows.push(top);
    return rows;
  }, []));
  expect(narrowTabRows).toHaveLength(3);
  await doctorPage.setViewportSize({ width: 1280, height: 720 });
  const wideTabRows = await therapeuticTabs.evaluateAll((tabs) => tabs.reduce<number[]>((rows, tab) => {
    const top = Math.round(tab.getBoundingClientRect().top);
    if (!rows.some((candidate) => Math.abs(candidate - top) <= 2)) rows.push(top);
    return rows;
  }, []));
  expect(wideTabRows).toHaveLength(1);
  await doctorPage.context().setOffline(true);
  await doctorPage.getByRole("button", { name: "Сохранить запись" }).click();
  await expect(doctorPage.locator(".medical-record-entry-details").filter({ hasText: "Всё хорошо" })).toBeVisible();
  await doctorPage.context().setOffline(false);

  await ownerPage.bringToFront();
  await expectEmailText(request, ownerEmail, "Новая медицинская запись о питомце «Ёжик» ожидает Вашего подтверждения.");
  const ownerRecord = ownerPage.locator(".medical-record-entry-details").filter({ hasText: "Всё хорошо" });
  await expect(ownerRecord).toBeVisible({ timeout: replicationTimeout });
  await ownerRecord.locator("summary").click();
  await expect(ownerRecord.locator(".encounter-history-comment").getByText("Состояние стабильное", { exact: true })).toBeVisible();
  await expect(ownerRecord.getByText("В стадии наблюдения", { exact: true })).toBeVisible();
  await expect(ownerRecord.getByText("Контроль через неделю", { exact: true })).toBeVisible();
  await expect(ownerRecord.locator("summary")).toContainText("Диагноз: Отёк Квинке");
  const ownerDiagnosis = ownerRecord.locator(".encounter-history-section").filter({
    has: ownerPage.getByRole("heading", { name: "Диагноз", exact: true }),
  });
  await expect(ownerDiagnosis.getByText("Подозрение на анафилаксию", { exact: true })).toBeVisible();
  await expect(ownerDiagnosis.getByText("Отёк Квинке", { exact: true })).toHaveCount(2);
  await expect(ownerDiagnosis.getByText("Реакция на корм", { exact: true })).toBeVisible();
  await expect(ownerDiagnosis.getByText("Просто шок", { exact: true })).toBeVisible();
  const ownerTherapeutic = ownerRecord.locator(".encounter-history-section").filter({
    has: ownerPage.getByRole("heading", { name: "Терапевтический приём", exact: true }),
  });
  await expect(ownerTherapeutic.getByRole("tab")).toHaveCount(5);
  await expect(ownerTherapeutic.getByText("Проблема 1: Контрольный осмотр", { exact: true })).toBeVisible();
  const ownerProblem = ownerTherapeutic.locator(".therapeutic-history-problems article").filter({ hasText: "Контрольный осмотр" });
  await expect(ownerProblem.getByText("Как давно началось", { exact: true })).toBeVisible();
  await expect(ownerProblem.getByText("Сегодня", { exact: true })).toBeVisible();
  const ownerWhatHappened = ownerRecord.locator(".encounter-history-section").filter({
    has: ownerPage.getByRole("heading", { name: "Что случилось", exact: true }),
  });
  const historyFont = async (locator: ReturnType<Page["locator"]>) => locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      family: style.fontFamily,
      size: style.fontSize,
      weight: style.fontWeight,
      lineHeight: style.lineHeight,
    };
  });
  expect(await historyFont(ownerProblem.locator("dd").first()))
    .toEqual(await historyFont(ownerWhatHappened.locator("li").first()));
  expect(await ownerProblem.locator("dd").first().evaluate((element) => getComputedStyle(element).textAlign)).toBe("left");
  await ownerTherapeutic.getByRole("tab", { name: "Рекомендации" }).click();
  await expect(ownerTherapeutic.getByText("Повторный осмотр через неделю", { exact: true })).toBeVisible();
  await ownerTherapeutic.getByRole("tab", { name: "Назначения" }).click();
  await expect(ownerTherapeutic.getByText("Щадящий режим", { exact: true })).toBeVisible();
  await expect(ownerRecord.getByText("14.3 кг", { exact: true })).toBeVisible();
  const profileWeight = ownerPage.locator(".pet-profile-view-fields > div").filter({ hasText: "Вес" });
  await expect(profileWeight).toContainText("12.4 кг");
  const recordElementId = await ownerRecord.getAttribute("id");
  if (!recordElementId?.startsWith("encounter-")) throw new Error("Medical record element has no record identifier.");
  const recordId = recordElementId.slice("encounter-".length);
  expect(recordId).toMatch(/^[0-9a-f-]{36}$/i);
  await ownerRecord.getByRole("button", { name: "Подтвердить запись" }).click();
  await expect(ownerRecord.getByText("Подтверждена", { exact: true })).toBeVisible();
  await expectEmailText(request, doctorEmail, "Медицинская запись о питомце «Ёжик» подтверждена владельцем.");
  await expect(profileWeight).toContainText("14.3 кг");
  await ownerPage.reload();
  await expect(ownerPage.locator(".medical-record-entry-details").filter({ hasText: "Всё хорошо" }).locator("summary"))
    .toContainText("Диагноз: Отёк Квинке");
  expect(await queryPostgres(`SELECT count(*) FROM audit_blocks
    WHERE aggregate_type='medicalRecord' AND aggregate_id='${recordId}' AND action='record.created'
      AND before_state='null'::jsonb AND after_state->>'status'='unconfirmed'
      AND after_state->'record'->>'recordId'='${recordId}'
      AND after_state->'record'->'sections'->'what-happened' IS NOT NULL
      AND after_state->'record'->'sections'->'diagnosis'->>'templateVersion'='diagnosis-v2'
      AND after_state->'record'->'sections'->'diagnosis'->'value'->'differential'->'customTexts' @> '["Реакция на корм", "Просто шок"]'::jsonb
      AND after_state->'record'->'sections'->'diagnosis'->'value'->'confirmed'->>'selectedId'='diagnosis.general.012'`)).toBe("1");
  expect(await queryPostgres(`SELECT count(*) FROM audit_blocks
    WHERE aggregate_type='medicalRecord' AND aggregate_id='${recordId}' AND action='record.confirmed'
      AND before_state->>'status'='unconfirmed' AND after_state->>'status'='confirmed'
      AND after_state->'record'->>'recordId'='${recordId}'
      AND after_state->'confirmation'->>'recordId'='${recordId}'`)).toBe("1");
  await openProfileAndWaitForSync(ownerPage);
  await ownerPage.locator(".workspace-sidebar").getByRole("link", { name: "Ёжик", exact: true }).click();
  await expect(ownerPage).toHaveURL(new RegExp(`/owner/pets/${petId}$`));
  await ownerPage.getByRole("link", { name: "Доступ врачей" }).click();
  const activeAccess = ownerPage.locator(".owner-access-table tbody tr").filter({ hasText: "Алёна Врач" });
  await activeAccess.getByRole("button", { name: "Отозвать доступ" }).click();
  await expect(ownerPage.getByText("Доступ отозван.")).toBeVisible();
  await expectEmailText(request, doctorEmail, "Доступ к питомцу «Ёжик» отозван.");
  await openProfileAndWaitForSync(ownerPage);

  await administratorPage.bringToFront();
  await administratorPage.locator(".workspace-sidebar").getByRole("link", { name: "Журнал" }).click();
  await expect(administratorPage).toHaveURL(/\/admin\/audit/);
  await expect(administratorPage.getByText(/Блокчейн проверен · блок/)).toBeVisible();
  await expect(administratorPage.locator(".administrator-audit-table tbody tr").first()).toBeVisible();

  if (process.env.KLINOK_E2E_RESTART_API === "true") await restartApi();
  await ownerPage.getByRole("button", { name: "Выйти", exact: true }).click();
  await expect(ownerPage).toHaveURL(/\/auth\/login/);
  await expect(ownerPage.getByLabel("Название этого устройства")).toHaveValue("Основной браузер");
  await clearBrowserStorage(ownerPage);
  await login(ownerPage, ownerEmail);
  await expect(ownerPage).toHaveURL(/\/(?:profile|owner\/home)/, { timeout: replicationTimeout });
  if (new URL(ownerPage.url()).pathname === "/profile") {
    const ownerRole = ownerPage.locator(".role-selection-card").filter({ hasText: "Владелец животного" });
    await expect(ownerRole.getByText("Одобрена", { exact: true })).toBeVisible({ timeout: replicationTimeout });
  }
  await openProfileAndWaitForSync(ownerPage);
  await ownerPage.locator(".workspace-sidebar").getByRole("link", { name: "Питомцы" }).click();
  await expect(ownerPage).toHaveURL(/\/owner\/home/);
  await expect(ownerPage.locator(".owner-pet-card strong").filter({ hasText: "Ёжик" })).toBeVisible({ timeout: replicationTimeout });
});
