// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { expect, test, type APIRequestContext, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { Buffer } from "node:buffer";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const password = "correct horse battery";
const replicationTimeout = 30_000;
const longDiagnosisValue = "Подозрение на анафилактическую реакцию после применения лекарственного препарата";
const longInstrumentalValue = "Анэхогенное с эхогенными включениями";
const execFile = promisify(execFileCallback);
const mailpitUrl = process.env.KLINOK_E2E_MAILPIT_URL ?? "http://localhost:8025";

async function expectMedicalActionRail(actions: Locator[]): Promise<void> {
  const measurements = await Promise.all(actions.map(async (action) => {
    const box = await action.boundingBox();
    expect(box).not.toBeNull();
    return { box: box!, name: await action.getAttribute("aria-label") };
  }));
  const boxes = measurements.map(({ box }) => box);
  expect(boxes.every((box) => Math.abs(box.width - 34) <= 0.5 && Math.abs(box.height - 34) <= 0.5)).toBe(true);
  const rightEdges = boxes.map((box) => box.x + box.width);
  expect(
    Math.max(...rightEdges) - Math.min(...rightEdges),
    JSON.stringify(measurements.map(({ box, name }) => ({ name, right: box.x + box.width }))),
  ).toBeLessThanOrEqual(1);
}

async function expectHorizontalGap(left: Locator, right: Locator, gap = 8): Promise<void> {
  const [leftBox, rightBox] = await Promise.all([left.boundingBox(), right.boundingBox()]);
  expect(leftBox).not.toBeNull();
  expect(rightBox).not.toBeNull();
  expect(Math.abs(rightBox!.x - leftBox!.x - leftBox!.width - gap)).toBeLessThanOrEqual(1);
}

async function expectTopAligned(action: Locator, peer: Locator): Promise<void> {
  const [actionBox, peerBox] = await Promise.all([action.boundingBox(), peer.boundingBox()]);
  expect(actionBox).not.toBeNull();
  expect(peerBox).not.toBeNull();
  expect(Math.abs(actionBox!.y - peerBox!.y)).toBeLessThanOrEqual(1);
}

async function expectHierarchyIndent(parent: Locator, child: Locator, minimum = 18): Promise<void> {
  const [parentBox, childBox] = await Promise.all([parent.boundingBox(), child.boundingBox()]);
  expect(parentBox).not.toBeNull();
  expect(childBox).not.toBeNull();
  expect(childBox!.x - parentBox!.x).toBeGreaterThanOrEqual(minimum);
}

async function expectHierarchyTextIndent(parent: Locator, child: Locator, minimum = 18): Promise<void> {
  const textStart = (element: Element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return range.getBoundingClientRect().x;
  };
  const [parentX, childX] = await Promise.all([parent.evaluate(textStart), child.evaluate(textStart)]);
  expect(childX - parentX).toBeGreaterThanOrEqual(minimum);
}

async function expectHierarchyMarker(target: Locator): Promise<void> {
  const marker = await target.evaluate((element) => {
    const style = getComputedStyle(element, "::before");
    return { content: style.content, inlineBorder: style.borderInlineStartWidth };
  });
  expect(marker).toEqual({ content: '""', inlineBorder: "2px" });
}

async function expectSameHorizontalBounds(first: Locator, second: Locator): Promise<void> {
  const [firstBox, secondBox] = await Promise.all([first.boundingBox(), second.boundingBox()]);
  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();
  expect(Math.abs(firstBox!.x - secondBox!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(firstBox!.x + firstBox!.width - secondBox!.x - secondBox!.width)).toBeLessThanOrEqual(1);
}

async function expectWrappedValue(value: Locator, text: string): Promise<void> {
  await expect(value).toHaveText(text);
  const measurement = await value.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      fits: element.scrollWidth <= element.clientWidth + 1,
      height: element.getBoundingClientRect().height,
      lineHeight: Number.parseFloat(style.lineHeight),
    };
  });
  expect(measurement.fits).toBe(true);
  expect(measurement.height).toBeGreaterThan(measurement.lineHeight * 1.5);
}

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
  const addSectionCard = doctorPage.locator(".encounter-add-section");
  const addSectionSelect = addSectionCard.getByLabel("Добавить раздел", { exact: true });
  await expect(addSectionCard).toHaveClass(/encounter-section-card/);
  await expect(addSectionCard.getByRole("heading", { name: "Добавить раздел", exact: true })).toBeVisible();
  await addSectionSelect.selectOption("general-data");
  await doctorPage.getByLabel("Вес, кг", { exact: true }).fill("14.3");
  await addSectionSelect.selectOption("therapeutic-appointment");
  const therapeuticCard = doctorPage.locator(".encounter-section-card").filter({ hasText: "Терапевтический приём" });
  const therapeuticTabs = therapeuticCard.getByRole("tab");
  await expect(therapeuticTabs).toHaveCount(5);
  await therapeuticCard.getByRole("button", { name: "Импортировать из «Что случилось»" }).click();
  await expect(therapeuticCard.getByLabel("Проблема", { exact: true })).toHaveValue("Контрольный осмотр");
  await doctorPage.getByLabel("Взятие анализов", { exact: true }).check();
  await doctorPage.getByLabel("Проведение исследования", { exact: true }).check();
  await therapeuticCard.getByLabel("Как давно началось").selectOption("problem.onset.today");
  await expect(therapeuticCard.getByLabel("Как давно началось")).toHaveValue("problem.onset.today");
  await therapeuticCard.getByRole("tab", { name: "Рекомендации" }).click();
  await therapeuticCard.getByLabel("Текст рекомендаций").fill("Повторный осмотр через неделю");
  await therapeuticCard.getByRole("tab", { name: "Назначения" }).click();
  await therapeuticCard.getByLabel("Текст назначений").fill("Щадящий режим");
  await addSectionSelect.selectOption("diagnosis");
  const diagnosisCard = doctorPage.locator(".encounter-section-card").filter({
    has: doctorPage.getByRole("heading", { name: "Диагноз", exact: true }),
  });
  const diagnosisFields = diagnosisCard.locator("fieldset.diagnosis-field");
  const preliminaryDiagnosis = diagnosisFields.filter({ has: doctorPage.getByText("Предварительный диагноз", { exact: true }) });
  const differentialDiagnosis = diagnosisFields.filter({ has: doctorPage.getByText("Дифференциальные диагнозы", { exact: true }) });
  const confirmedDiagnosis = diagnosisFields.filter({ has: doctorPage.getByText("Подтверждённый диагноз", { exact: true }) });
  const differentialInput = differentialDiagnosis.getByRole("combobox", { name: "Добавить дифференциальный диагноз" });
  const differentialAdd = differentialDiagnosis.locator(".app-catalog-add");
  const differentialToggle = differentialDiagnosis.locator(".app-catalog-toggle");
  const confirmedInput = confirmedDiagnosis.getByRole("combobox", { name: "Подтверждённый диагноз" });
  const confirmedToggle = confirmedDiagnosis.locator(".app-catalog-toggle");
  const diagnosisRightActions = [
    diagnosisCard.getByRole("button", { name: "Удалить раздел", exact: true }),
    preliminaryDiagnosis.getByRole("button", { name: "Назначить предварительный диагноз подтверждённым" }),
  ];
  await expectMedicalActionRail(diagnosisRightActions);
  await preliminaryDiagnosis.getByRole("combobox", { name: "Предварительный диагноз" }).fill(longDiagnosisValue);
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

  await addSectionSelect.selectOption("vaccination");
  const vaccinationCard = doctorPage.locator(".encounter-section-card").filter({
    has: doctorPage.getByRole("heading", { name: "Вакцинация/чипирование", exact: true }),
  });
  await vaccinationCard.getByLabel("Номер чипа", { exact: true }).fill("643094100000003");
  const revaccinationField = vaccinationCard.locator(".vaccination-revaccination-field");
  const revaccinationInput = revaccinationField.getByLabel("Дата следующей ревакцинации", { exact: true });
  const revaccinationToggle = revaccinationField.getByRole("button", { name: "Рассчитать дату следующей ревакцинации" });
  await expectHorizontalGap(revaccinationInput, revaccinationToggle);
  await expectTopAligned(revaccinationToggle, revaccinationInput);

  await addSectionSelect.selectOption("laboratory-tests");
  const laboratoryCard = doctorPage.locator(".encounter-section-card").filter({
    has: doctorPage.getByRole("heading", { name: "Лабораторные исследования", exact: true }),
  });
  const studyType = laboratoryCard.getByRole("combobox", { name: "Тип исследования" });
  await studyType.fill("Общеклинический анализ крови");
  await laboratoryCard.getByRole("option", { name: "Общеклинический анализ крови", exact: true }).click();
  const addStudy = laboratoryCard.getByRole("button", { name: "Добавить исследование" });
  await addStudy.click();
  await laboratoryCard.getByLabel("Лаборатория", { exact: true }).fill("Ветлаб");
  const indicator = laboratoryCard.getByRole("combobox", { name: "Добавить показатель" });
  const indicatorToggle = laboratoryCard.locator(".laboratory-indicator-create .app-catalog-toggle");
  await indicatorToggle.click();
  await laboratoryCard.getByRole("option", { name: /Лейкоциты \(WBC\)/ }).click();
  const addIndicator = laboratoryCard.getByRole("button", { name: "Добавить показатель" });
  await addIndicator.click();
  const resultInput = laboratoryCard.getByLabel("Лейкоциты (WBC), результат", { exact: true });
  await resultInput.fill("7.2");
  const deleteStudy = laboratoryCard.getByRole("button", { name: "Удалить исследование" });
  const deleteResult = laboratoryCard.getByRole("button", { name: /Удалить показатель «Лейкоциты/ });
  const typeToggle = laboratoryCard.locator(".laboratory-study-create .app-catalog-toggle");
  await expectHorizontalGap(studyType, typeToggle);
  await expectHorizontalGap(indicator, indicatorToggle);
  await expectTopAligned(addStudy, studyType);
  await expectTopAligned(addIndicator, indicator);
  await expectTopAligned(deleteResult, resultInput);

  await addSectionSelect.selectOption("instrumental-tests");
  const instrumentalCard = doctorPage.locator(".encounter-section-card").filter({
    has: doctorPage.getByRole("heading", { name: "Инструментальные исследования", exact: true }),
  });
  const instrumentalType = instrumentalCard.getByRole("combobox", { name: "Тип исследования" });
  await instrumentalType.fill("УЗИ органов брюшной полости");
  await instrumentalCard.getByRole("option", { name: "УЗИ органов брюшной полости", exact: true }).click();
  const addInstrumentalStudy = instrumentalCard.getByRole("button", { name: "Добавить исследование" });
  await addInstrumentalStudy.click();
  const addInstrumentalFinding = async (comboboxName: string, findingName: string) => {
    const combobox = instrumentalCard.getByRole("combobox", { name: comboboxName, exact: true });
    await combobox.fill(findingName);
    await instrumentalCard.getByRole("option", { name: findingName, exact: true }).click();
    const createRow = combobox.locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' instrumental-finding-create ')][1]");
    const actionName = comboboxName === "Добавить раздел исследования" ? "Добавить раздел" : "Добавить показатель";
    const add = createRow.getByRole("button", { name: actionName });
    await expectTopAligned(add, createRow.locator(".app-catalog-control"));
    await add.click();
    return add;
  };
  const selectInstrumentalValue = async (indicatorName: string, valueName: string) => {
    const selector = instrumentalCard.getByRole("combobox", {
      name: `Значение показателя «${indicatorName}»`,
      exact: true,
    }).filter({ hasText: valueName });
    await selector.selectOption({ label: valueName });
    return selector;
  };
  const addNestedInstrumentalFinding = async (level: Locator, findingName: string) => {
    const createRow = level.locator(":scope > .instrumental-finding-create");
    const combobox = createRow.getByRole("combobox");
    await combobox.fill(findingName);
    await createRow.getByRole("option", { name: findingName, exact: true }).click();
    const add = createRow.getByRole("button", { name: "Добавить показатель" });
    await expectTopAligned(add, createRow.locator(".app-catalog-control"));
    await add.click();
    return add;
  };
  const addPancreas = await addInstrumentalFinding("Добавить раздел исследования", "Поджелудочная железа");
  const pancreasValueSelector = await selectInstrumentalValue("Поджелудочная железа", "Визуализируется");
  const pancreasRow = pancreasValueSelector.locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' instrumental-root-choice-row ')][1]");
  const pancreasHeading = pancreasRow.locator(":scope > .instrumental-finding-content > .instrumental-finding-name");
  const deletePancreas = pancreasRow.getByRole("button", { name: "Удалить раздел «Поджелудочная железа»", exact: true });
  await expect(pancreasHeading).toHaveText("Поджелудочная железа");
  await expect(pancreasRow.locator(":scope > .instrumental-finding-content .instrumental-result-desktop-name")).toHaveCount(0);
  await expectTopAligned(pancreasValueSelector, pancreasHeading);
  await expectTopAligned(deletePancreas, pancreasHeading);
  const addLiver = await addInstrumentalFinding("Добавить раздел исследования", "Печень");
  const addFocalFindings = await addInstrumentalFinding("Добавить показатель для «Печень»", "Очаговые образования");
  const focalFindingsSelector = await selectInstrumentalValue("Очаговые образования", "Визуализируются");
  const focalFindingsRow = focalFindingsSelector
    .locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' instrumental-finding-row ')][1]");
  const focalContinuationLevel = focalFindingsRow.locator(":scope > .instrumental-finding-level");
  const focalCountSelector = focalContinuationLevel.getByRole("combobox", {
    name: "Значение показателя «Визуализируются»",
    exact: true,
  });
  const focalContinuationRow = focalCountSelector.locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' instrumental-choice-continuation-row ')][1]");
  await expect(focalContinuationRow.locator(".instrumental-result-desktop-name, .instrumental-result-mobile-name")).toHaveCount(0);
  await expect(focalContinuationLevel.locator(":scope > .instrumental-result-headings")).toHaveCount(0);
  await expectSameHorizontalBounds(focalFindingsSelector, focalCountSelector);
  await focalCountSelector.selectOption({ label: "Множественные" });
  await addNestedInstrumentalFinding(focalContinuationLevel, "Эхогенность");
  const focalEchogenicitySelector = focalContinuationLevel.getByRole("combobox", {
    name: "Значение показателя «Эхогенность»",
    exact: true,
  });
  const focalEchogenicityRow = focalEchogenicitySelector
    .locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' instrumental-finding-row ')][1]");
  await expectHierarchyTextIndent(
    focalFindingsRow.locator(":scope > .instrumental-finding-content > .instrumental-result-desktop-name"),
    focalEchogenicityRow.locator(":scope > .instrumental-finding-content > .instrumental-result-desktop-name"),
  );
  await focalEchogenicitySelector.selectOption({ label: "Гипоэхогенные" });
  await addNestedInstrumentalFinding(focalContinuationLevel, "Размер");
  const focalSizeInput = focalContinuationLevel.getByLabel("Размер, мм", { exact: true });
  const focalSizeField = focalSizeInput.locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' instrumental-integer-field ')][1]");
  await focalSizeInput.fill("9");
  await expectSameHorizontalBounds(focalFindingsSelector, focalEchogenicitySelector);
  await expectSameHorizontalBounds(focalFindingsSelector, focalSizeField);
  await focalFindingsSelector.selectOption({ label: "Не визуализируются" });
  await expect(focalContinuationLevel).toHaveCount(0);
  await focalFindingsSelector.selectOption({ label: "Визуализируются" });
  await focalCountSelector.selectOption({ label: "Множественные" });
  await addNestedInstrumentalFinding(focalContinuationLevel, "Эхогенность");
  await focalEchogenicitySelector.selectOption({ label: "Гипоэхогенные" });
  await addNestedInstrumentalFinding(focalContinuationLevel, "Размер");
  await focalSizeInput.fill("9");
  await expect(focalContinuationLevel.locator(":scope > .instrumental-finding-create")).toHaveCount(0);

  const addGallbladder = await addInstrumentalFinding("Добавить раздел исследования", "Желчный пузырь");
  const addGallbladderSediment = await addInstrumentalFinding("Добавить показатель для «Желчный пузырь»", "Осадок");
  const gallbladderSedimentSelector = await selectInstrumentalValue("Осадок", "Визуализируется");
  const gallbladderSedimentRow = gallbladderSedimentSelector
    .locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' instrumental-finding-row ')][1]");
  const gallbladderVisibleLevel = gallbladderSedimentRow.locator(":scope > .instrumental-finding-level");
  const sedimentAmountSelector = gallbladderVisibleLevel.getByRole("combobox", {
    name: "Значение показателя «Визуализируется»",
    exact: true,
  });
  await sedimentAmountSelector.selectOption({ label: "В умеренном количестве" });
  const sedimentCharacterPanel = gallbladderVisibleLevel.getByRole("group", { name: "Характер осадка", exact: true });
  await expect(sedimentCharacterPanel.getByRole("checkbox")).toHaveCount(7);
  await sedimentCharacterPanel.getByRole("checkbox", { name: "Смешанный", exact: true }).check();
  await sedimentCharacterPanel.getByRole("checkbox", { name: "Подвижный", exact: true }).check();
  await expectSameHorizontalBounds(gallbladderSedimentSelector, sedimentCharacterPanel);
  await gallbladderSedimentSelector.selectOption({ label: "Не визуализируется" });
  await expect(sedimentCharacterPanel).toHaveCount(0);
  await gallbladderSedimentSelector.selectOption({ label: "Визуализируется" });
  await sedimentAmountSelector.selectOption({ label: "В умеренном количестве" });
  await sedimentCharacterPanel.getByRole("checkbox", { name: "Смешанный", exact: true }).check();
  await sedimentCharacterPanel.getByRole("checkbox", { name: "Подвижный", exact: true }).check();

  const addSpleen = await addInstrumentalFinding("Добавить раздел исследования", "Селезёнка");
  const addSpleenMasses = await addInstrumentalFinding("Добавить показатель для «Селезёнка»", "Объёмные образования");
  const spleenMassesSelector = await selectInstrumentalValue("Объёмные образования", "Визуализируются");
  const spleenMassesRow = spleenMassesSelector
    .locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' instrumental-finding-row ')][1]");
  const spleenVisibleLevel = spleenMassesRow.locator(":scope > .instrumental-finding-level");
  const spleenCountSelector = spleenVisibleLevel.getByRole("combobox", {
    name: "Значение показателя «Визуализируются»",
    exact: true,
  });
  await spleenCountSelector.selectOption({ label: "Единичные" });
  await addNestedInstrumentalFinding(spleenVisibleLevel, "Размер образований");
  const spleenSizeInput = spleenVisibleLevel.getByLabel("Размер образований, мм", { exact: true });
  const spleenSizeField = spleenSizeInput.locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' instrumental-integer-field ')][1]");
  await spleenSizeInput.fill("11");
  const addSpleenComment = await addInstrumentalFinding("Добавить показатель для «Селезёнка»", "Комментарии");
  const spleenLevel = spleenMassesRow.locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' instrumental-finding-level ')][1]");
  const spleenComment = spleenLevel.getByLabel("Комментарии", { exact: true });
  await spleenComment.fill("Без иных изменений");
  await expectSameHorizontalBounds(spleenMassesSelector, spleenSizeField);
  await spleenMassesSelector.selectOption({ label: "Не визуализируются" });
  await expect(spleenSizeInput).toHaveCount(0);
  await expect(spleenComment).toHaveValue("Без иных изменений");
  await spleenMassesSelector.selectOption({ label: "Визуализируются" });
  await spleenCountSelector.selectOption({ label: "Единичные" });
  await addNestedInstrumentalFinding(spleenVisibleLevel, "Размер образований");
  await spleenSizeInput.fill("11");

  const addProstate = await addInstrumentalFinding("Добавить раздел исследования", "Предстательная железа");
  const addProstateContours = await addInstrumentalFinding("Добавить показатель для «Предстательная железа»", "Контуры");
  const contourRegularity = instrumentalCard.getByRole("combobox", { name: "Ровность контуров", exact: true });
  const contourDefinition = instrumentalCard.getByRole("combobox", { name: "Чёткость контуров", exact: true });
  await contourRegularity.selectOption({ label: "Ровные" });
  await contourDefinition.selectOption({ label: "Нечёткие" });
  const [regularityBox, definitionBox] = await Promise.all([contourRegularity.boundingBox(), contourDefinition.boundingBox()]);
  expect(regularityBox).not.toBeNull();
  expect(definitionBox).not.toBeNull();
  expect(Math.abs(regularityBox!.y - definitionBox!.y)).toBeLessThanOrEqual(1);
  const addBladder = await addInstrumentalFinding("Добавить раздел исследования", "Мочевой пузырь");
  await addInstrumentalFinding("Добавить показатель для «Мочевой пузырь»", "Стенка");
  const deleteBladderWall = instrumentalCard.getByRole("button", { name: "Удалить показатель «Стенка»", exact: true });
  const bladderWallContent = deleteBladderWall
    .locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' instrumental-finding-row ')][1]")
    .locator(":scope > .instrumental-finding-content");
  await expect(bladderWallContent).toHaveAttribute("data-hierarchy-depth", "1");
  await expectHierarchyMarker(bladderWallContent);
  await deleteBladderWall.click();
  await expect(bladderWallContent).toHaveCount(0);
  await expect(doctorPage.getByRole("alertdialog")).toHaveCount(0);
  const addContents = await addInstrumentalFinding("Добавить показатель для «Мочевой пузырь»", "Содержимое");
  const contentsValueSelector = await selectInstrumentalValue("Содержимое", "Визуализируется");
  const contentsValueControl = contentsValueSelector.first()
    .locator("xpath=ancestor::label[contains(concat(' ', normalize-space(@class), ' '), ' instrumental-result-control ')][1]");
  await expect(contentsValueControl).toHaveClass(/instrumental-result-control/);
  await expect(contentsValueSelector).not.toHaveAttribute("multiple");
  await addInstrumentalFinding("Добавить показатель для «Визуализируется»", "Взвесь/осадок");
  const sedimentInput = instrumentalCard.getByLabel("Взвесь/осадок", { exact: true });
  await sedimentInput.fill("Незначительно");
  await addInstrumentalFinding("Добавить показатель для «Визуализируется»", "Конкременты");
  await selectInstrumentalValue("Конкременты", "Множественные");
  await addInstrumentalFinding("Добавить показатель для «Конкременты»", "Размер");
  const concrementSizeInput = instrumentalCard.getByLabel("Размер, мм", { exact: true }).last();
  await expect(concrementSizeInput).toHaveAttribute("type", "number");
  await expect(concrementSizeInput).toHaveAttribute("step", "1");
  await expect(concrementSizeInput.locator("xpath=following-sibling::*[contains(concat(' ', normalize-space(@class), ' '), ' instrumental-integer-unit ')]")).toHaveText("мм");
  await concrementSizeInput.fill("4");
  const addUterus = await addInstrumentalFinding("Добавить раздел исследования", "Матка");
  const uterusValueSelector = await selectInstrumentalValue("Матка", "Визуализируется");
  const uterusRow = uterusValueSelector.locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' instrumental-root-choice-row ')][1]");
  const deleteUterus = uterusRow.getByRole("button", { name: "Удалить раздел «Матка»", exact: true });
  const addUterusContents = await addInstrumentalFinding("Добавить показатель для «Матка»", "Содержимое");
  const uterusContentsSelector = await selectInstrumentalValue("Содержимое", longInstrumentalValue);
  const addConclusion = await addInstrumentalFinding("Добавить раздел исследования", "Заключение");
  await instrumentalCard.getByLabel("Заключение", { exact: true }).fill("Без патологии");
  const deleteInstrumentalStudy = instrumentalCard.getByRole("button", { name: "Удалить исследование" });
  const deleteSediment = instrumentalCard.getByRole("button", { name: "Удалить показатель «Взвесь/осадок»" });
  const deleteConcrementSize = concrementSizeInput
    .locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' instrumental-finding-row ')][1]")
    .getByRole("button", { name: "Удалить показатель «Размер»", exact: true });
  const instrumentalResultHeadings = instrumentalCard.locator(".instrumental-result-headings")
    .filter({ hasText: "ПоказательРезультат" });
  await expectTopAligned(addInstrumentalStudy, instrumentalType);
  await expect(instrumentalResultHeadings.first()).toBeVisible();
  await expectTopAligned(deleteSediment, sedimentInput);
  await expectTopAligned(deleteConcrementSize, concrementSizeInput);

  await therapeuticCard.getByRole("tab", { name: "Анамнез болезни" }).click();
  const therapeuticImport = therapeuticCard.getByRole("button", { name: "Импортировать из «Что случилось»" });
  const therapeuticAdd = therapeuticCard.getByRole("button", { name: "Добавить проблему" });
  const therapeuticDelete = therapeuticCard.getByRole("button", { name: "Удалить проблему 1" });
  await expectHorizontalGap(therapeuticImport, therapeuticAdd);
  await expectTopAligned(therapeuticAdd, therapeuticCard.locator(".therapeutic-panel-heading h4"));
  await expectTopAligned(therapeuticDelete, therapeuticCard.locator(".therapeutic-problem-heading h5"));

  const differentialPromote = differentialDiagnosis.getByRole("button", { name: "Назначить «Отёк Квинке» подтверждённым диагнозом" });
  const differentialRemove = differentialDiagnosis.getByRole("button", { name: "Удалить «Отёк Квинке» из дифференциальных диагнозов" });
  await expectHorizontalGap(differentialPromote, differentialRemove);
  const differentialRemoves = await differentialDiagnosis.locator(".diagnosis-selected-chip > button:last-child").all();
  const editorSave = doctorPage.getByRole("button", { name: "Сохранить запись" });
  const medicalRailActions = [
    editorSave,
    ...diagnosisRightActions,
    ...differentialRemoves,
    vaccinationCard.getByRole("button", { name: "Удалить раздел", exact: true }),
    laboratoryCard.getByRole("button", { name: "Удалить раздел", exact: true }),
    addStudy,
    deleteStudy,
    addIndicator,
    deleteResult,
    instrumentalCard.getByRole("button", { name: "Удалить раздел", exact: true }),
    addInstrumentalStudy,
    deleteInstrumentalStudy,
    addPancreas,
    deletePancreas,
    addLiver,
    addFocalFindings,
    addGallbladder,
    addGallbladderSediment,
    addSpleen,
    addSpleenMasses,
    addSpleenComment,
    addProstate,
    addProstateContours,
    addBladder,
    addContents,
    addUterus,
    deleteUterus,
    addUterusContents,
    addConclusion,
    deleteSediment,
    deleteConcrementSize,
    therapeuticCard.getByRole("button", { name: "Удалить раздел", exact: true }),
    therapeuticAdd,
    therapeuticDelete,
  ];
  await expectMedicalActionRail(medicalRailActions);
  const allMedicalActionSizes = await doctorPage.locator(".encounter-editor .medical-card-action")
    .evaluateAll((actions) => actions.map((action) => {
      const box = action.getBoundingClientRect();
      return [box.width, box.height];
    }));
  expect(allMedicalActionSizes.every(([width, height]) => Math.abs(width! - 34) <= 0.5 && Math.abs(height! - 34) <= 0.5))
    .toBe(true);

  await doctorPage.setViewportSize({ width: 752, height: 1200 });
  await expectMedicalActionRail(medicalRailActions);
  await differentialDiagnosis.getByRole("button", { name: "Назначить «Отёк Квинке» подтверждённым диагнозом" }).click();
  await doctorPage.getByRole("alertdialog", { name: "Заменить подтверждённый диагноз?" })
    .getByRole("button", { name: "Заменить", exact: true }).click();
  await confirmedDiagnosis.getByRole("combobox", { name: "Подтверждённый диагноз" }).fill("");

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
  expect(await diagnosisCard.evaluate((card) => card.scrollWidth <= card.clientWidth + 1)).toBe(true);
  expect(await vaccinationCard.evaluate((card) => card.scrollWidth <= card.clientWidth + 1)).toBe(true);
  expect(await laboratoryCard.evaluate((card) => card.scrollWidth <= card.clientWidth + 1)).toBe(true);
  expect(await instrumentalCard.evaluate((card) => card.scrollWidth <= card.clientWidth + 1)).toBe(true);
  const [encounterHeadingBox, whatHappenedBox] = await Promise.all([
    doctorPage.locator(".doctor-pet-detail > .encounter-editor .encounter-editor-heading").boundingBox(),
    doctorPage.locator(".doctor-pet-detail > .encounter-editor .encounter-what-happened").boundingBox(),
  ]);
  expect(encounterHeadingBox).not.toBeNull();
  expect(whatHappenedBox).not.toBeNull();
  expect(encounterHeadingBox!.y + encounterHeadingBox!.height).toBeLessThanOrEqual(whatHappenedBox!.y + 1);
  await expectMedicalActionRail(medicalRailActions);
  await expectHorizontalGap(differentialInput, differentialAdd);
  await expectHorizontalGap(differentialAdd, differentialToggle);
  await expectHorizontalGap(confirmedInput, confirmedToggle);
  await expectHorizontalGap(studyType, typeToggle);
  await expectHorizontalGap(indicator, indicatorToggle);
  await expectHorizontalGap(revaccinationInput, revaccinationToggle);
  await expectTopAligned(deleteResult, resultInput);
  await expectTopAligned(deletePancreas, pancreasHeading);
  await expectTopAligned(deleteSediment, sedimentInput);
  await expectTopAligned(deleteConcrementSize, concrementSizeInput);
  await expectSameHorizontalBounds(focalFindingsSelector, focalCountSelector);
  await expectHierarchyIndent(focalFindingsSelector, focalEchogenicitySelector);
  await expectHierarchyIndent(focalFindingsSelector, focalSizeField);
  await expectHierarchyIndent(gallbladderSedimentSelector, sedimentCharacterPanel);
  await expectHierarchyIndent(spleenMassesSelector, spleenSizeField);
  const [narrowRegularityBox, narrowDefinitionBox] = await Promise.all([
    contourRegularity.boundingBox(), contourDefinition.boundingBox(),
  ]);
  expect(narrowRegularityBox).not.toBeNull();
  expect(narrowDefinitionBox).not.toBeNull();
  expect(narrowDefinitionBox!.y).toBeGreaterThan(narrowRegularityBox!.y + narrowRegularityBox!.height - 1);
  await expect(instrumentalResultHeadings.first()).toBeHidden();
  await expect(contentsValueControl.locator(".instrumental-result-mobile-name")).toBeVisible();
  await expectWrappedValue(uterusContentsSelector.locator("..").locator(".app-select-value"), longInstrumentalValue);
  await expectWrappedValue(preliminaryDiagnosis.locator(".app-catalog-selected-value"), longDiagnosisValue);
  const narrowTabRows = await therapeuticTabs.evaluateAll((tabs) => tabs.reduce<number[]>((rows, tab) => {
    const top = Math.round(tab.getBoundingClientRect().top);
    if (!rows.some((candidate) => Math.abs(candidate - top) <= 2)) rows.push(top);
    return rows;
  }, []));
  expect(narrowTabRows).toHaveLength(3);
  await doctorPage.setViewportSize({ width: 1280, height: 720 });
  await expectMedicalActionRail(medicalRailActions);
  const wideTabRows = await therapeuticTabs.evaluateAll((tabs) => tabs.reduce<number[]>((rows, tab) => {
    const top = Math.round(tab.getBoundingClientRect().top);
    if (!rows.some((candidate) => Math.abs(candidate - top) <= 2)) rows.push(top);
    return rows;
  }, []));
  expect(wideTabRows).toHaveLength(1);
  await doctorPage.context().setOffline(true);
  await doctorPage.getByRole("button", { name: "Сохранить запись" }).click();
  const doctorRecord = doctorPage.locator(".medical-record-entry-details").filter({ hasText: "Всё хорошо" });
  await expect(doctorRecord).toBeVisible();
  await doctorRecord.locator("summary").click();
  await expect(doctorRecord.getByText("Всё хорошо, необходимо › Взятие анализов", { exact: true })).toBeVisible();
  await expect(doctorRecord.getByText("Всё хорошо, необходимо › Проведение исследования", { exact: true })).toBeVisible();
  await expect(doctorRecord).toContainText("Размер: 4 мм");
  await expect(doctorRecord).toContainText("Гипоэхогенные");
  await expect(doctorRecord).toContainText("Размер: 9 мм");
  await expect(doctorRecord).toContainText("Смешанный");
  await expect(doctorRecord).toContainText("Подвижный");
  await expect(doctorRecord).toContainText("Размер образований: 11 мм");
  await expect(doctorRecord).toContainText("Ровные");
  await expect(doctorRecord).toContainText("Нечёткие");
  await doctorRecord.getByRole("button", { name: "Редактировать запись" }).click();
  const inlineEditor = doctorRecord.locator(".encounter-editor-inline");
  await expect(inlineEditor.getByLabel("Взятие анализов", { exact: true })).toBeChecked();
  await expect(inlineEditor.getByLabel("Проведение исследования", { exact: true })).toBeChecked();
  const inlineEditorHeading = inlineEditor.locator(".encounter-editor-heading");
  const editCancel = inlineEditorHeading.getByRole("button", { name: "Отменить редактирование" });
  const editSave = inlineEditorHeading.getByRole("button", { name: "Сохранить запись" });
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 752, height: 1200 },
    { width: 390, height: 844 },
  ]) {
    await doctorPage.setViewportSize(viewport);
    await expectMedicalActionRail([editSave]);
    await expectHorizontalGap(editCancel, editSave);
    await expectTopAligned(editSave, inlineEditorHeading.getByRole("heading"));
  }
  await doctorPage.setViewportSize({ width: 1280, height: 720 });
  await editCancel.click();
  await expect(inlineEditor).toHaveCount(0);
  await doctorPage.context().setOffline(false);

  await ownerPage.bringToFront();
  await expectEmailText(request, ownerEmail, "Новая медицинская запись о питомце «Ёжик» ожидает Вашего подтверждения.");
  const ownerRecord = ownerPage.locator(".medical-record-entry-details").filter({ hasText: "Всё хорошо" });
  const ownerHistorySearch = ownerPage.getByRole("searchbox", { name: "Поиск по истории" });
  await ownerHistorySearch.fill("Взятие анализов");
  await expect(ownerRecord).toBeVisible({ timeout: replicationTimeout });
  await ownerHistorySearch.fill("Проведение исследования");
  await expect(ownerRecord).toBeVisible({ timeout: replicationTimeout });
  await ownerHistorySearch.fill("");
  const laboratoryComparison = ownerPage.locator(".laboratory-comparison");
  await expect(laboratoryComparison).toBeVisible({ timeout: replicationTimeout });
  await ownerPage.setViewportSize({ width: 1280, height: 720 });
  await laboratoryComparison.locator(".app-catalog-toggle").click();
  await laboratoryComparison.getByRole("option", { name: /Лейкоциты \(WBC\)/ }).click();
  await expect(laboratoryComparison.locator(".laboratory-comparison-desktop")).toBeVisible();
  await expect(laboratoryComparison.locator(".laboratory-comparison-mobile")).toBeHidden();
  await expect(laboratoryComparison.locator(".laboratory-results")).toBeVisible();

  await ownerPage.setViewportSize({ width: 752, height: 1200 });
  const mobileLaboratoryHistory = laboratoryComparison.locator(".laboratory-comparison-mobile");
  await expect(mobileLaboratoryHistory).toBeVisible();
  await expect(laboratoryComparison.locator(".laboratory-comparison-desktop")).toBeHidden();
  expect(await laboratoryComparison.evaluate((panel) => panel.scrollWidth <= panel.clientWidth + 1)).toBe(true);
  const mobileLaboratoryEntry = mobileLaboratoryHistory.locator(".laboratory-mobile-entry").first();
  await expect(mobileLaboratoryEntry.locator("header .laboratory-mobile-study")).toContainText("Общеклинический анализ крови");
  await expect(mobileLaboratoryEntry.locator(".laboratory-mobile-status")).toHaveCount(0);
  const laboratoryMetadata = mobileLaboratoryEntry.locator(".laboratory-mobile-metadata");
  const laboratoryMetadataSummary = laboratoryMetadata.locator("summary");
  const laboratoryValue = mobileLaboratoryEntry.locator(".laboratory-mobile-value");
  const [laboratoryValueBox, laboratorySummaryBox] = await Promise.all([
    laboratoryValue.boundingBox(),
    laboratoryMetadataSummary.boundingBox(),
  ]);
  expect(laboratoryValueBox).not.toBeNull();
  expect(laboratorySummaryBox).not.toBeNull();
  expect(Math.abs(laboratoryValueBox!.y - laboratorySummaryBox!.y)).toBeLessThanOrEqual(1);
  await laboratoryMetadataSummary.focus();
  await laboratoryMetadataSummary.press("Enter");
  await expect(laboratoryMetadata).toHaveAttribute("open", "");
  await expect(laboratoryMetadata).toContainText("Ветлаб");
  await expect(laboratoryMetadata).toContainText("Ожидает подтверждения");

  await ownerPage.setViewportSize({ width: 390, height: 844 });
  await expect(mobileLaboratoryHistory).toBeVisible();
  expect(await laboratoryComparison.evaluate((panel) => panel.scrollWidth <= panel.clientWidth + 1)).toBe(true);
  await ownerPage.setViewportSize({ width: 1280, height: 720 });
  await expect(laboratoryComparison.locator(".laboratory-comparison-desktop")).toBeVisible();
  await expect(mobileLaboratoryHistory).toBeHidden();
  await ownerRecord.locator("summary").click();
  await expect(ownerRecord.getByText("Всё хорошо, необходимо › Взятие анализов", { exact: true })).toBeVisible();
  await expect(ownerRecord.getByText("Всё хорошо, необходимо › Проведение исследования", { exact: true })).toBeVisible();
  await expect(ownerRecord.locator(".encounter-history-comment").getByText("Состояние стабильное", { exact: true })).toBeVisible();
  await expect(ownerRecord.getByText("В стадии наблюдения", { exact: true })).toBeVisible();
  await expect(ownerRecord.getByText("Контроль через неделю", { exact: true })).toBeVisible();
  const ownerInstrumental = ownerRecord.locator(".encounter-history-section").filter({
    has: ownerPage.getByRole("heading", { name: "Инструментальные исследования", exact: true }),
  });
  await expect(ownerInstrumental.getByText("Взвесь/осадок: Незначительно", { exact: true })).toBeVisible();
  await expect(ownerInstrumental.getByText("Заключение: Без патологии", { exact: true })).toBeVisible();
  await expect(ownerInstrumental.getByText("Гипоэхогенные", { exact: true })).toBeVisible();
  await expect(ownerInstrumental.getByText("Размер: 9 мм", { exact: true })).toBeVisible();
  await expect(ownerInstrumental.getByText("Смешанный", { exact: true })).toBeVisible();
  await expect(ownerInstrumental.getByText("Подвижный", { exact: true })).toBeVisible();
  await expect(ownerInstrumental.getByText("Размер образований: 11 мм", { exact: true })).toBeVisible();
  await expect(ownerInstrumental.getByText("Ровные", { exact: true })).toBeVisible();
  await expect(ownerInstrumental.getByText("Нечёткие", { exact: true })).toBeVisible();
  await expect(ownerRecord.locator("summary")).not.toContainText("Диагноз:");
  const ownerDiagnosis = ownerRecord.locator(".encounter-history-section").filter({
    has: ownerPage.getByRole("heading", { name: "Диагноз", exact: true }),
  });
  await expect(ownerDiagnosis.getByText(longDiagnosisValue, { exact: true })).toBeVisible();
  await expect(ownerDiagnosis.getByText("Отёк Квинке", { exact: true })).toHaveCount(1);
  await expect(ownerDiagnosis.getByText("Реакция на корм", { exact: true })).toBeVisible();
  await expect(ownerDiagnosis.getByText("Просто шок", { exact: true })).toBeVisible();
  await expect(ownerDiagnosis.getByText("Подтверждённый диагноз", { exact: true })).toHaveCount(0);
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
    .not.toContainText("Диагноз:");
  expect(await queryPostgres(`SELECT count(*) FROM audit_blocks
    WHERE aggregate_type='medicalRecord' AND aggregate_id='${recordId}' AND action='record.created'
      AND before_state='null'::jsonb AND after_state->>'status'='unconfirmed'
      AND after_state->'record'->>'recordId'='${recordId}'
      AND after_state->'record'->'sections'->'what-happened' IS NOT NULL
      AND after_state->'record'->'sections'->'what-happened'->'value'->'selectedIds' @> '["well.8", "well.9"]'::jsonb
      AND after_state->'record'->'sections'->'diagnosis'->>'templateVersion'='diagnosis-v2'
      AND after_state->'record'->'sections'->'diagnosis'->'value'->'differential'->'customTexts' @> '["Реакция на корм", "Просто шок"]'::jsonb
      AND after_state->'record'->'sections'->'diagnosis'->'value'->'confirmed'='{"customText": ""}'::jsonb`)).toBe("1");
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
