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

async function expectNextFullWidthRow(previous: Locator, row: Locator): Promise<void> {
  await expectSameHorizontalBounds(previous, row);
  const [previousBox, rowBox] = await Promise.all([previous.boundingBox(), row.boundingBox()]);
  expect(previousBox).not.toBeNull();
  expect(rowBox).not.toBeNull();
  expect(rowBox!.y).toBeGreaterThanOrEqual(previousBox!.y + previousBox!.height);
}

async function expectSameHorizontalBoundsForAll(elements: Locator): Promise<void> {
  const bounds = await elements.evaluateAll((items) => items.map((item) => {
    const box = item.getBoundingClientRect();
    return { left: box.left, right: box.right };
  }));
  expect(bounds.length).toBeGreaterThan(1);
  const reference = bounds[0]!;
  expect(bounds.every((bound) => (
    Math.abs(bound.left - reference.left) <= 1 && Math.abs(bound.right - reference.right) <= 1
  )), JSON.stringify(bounds)).toBe(true);
}

async function expectFillsWorkspaceContent(element: Locator): Promise<void> {
  const bounds = await element.evaluate((target) => {
    const workspace = target.closest(".workspace-content");
    if (!workspace) return null;
    const workspaceBox = workspace.getBoundingClientRect();
    const targetBox = target.getBoundingClientRect();
    const style = getComputedStyle(workspace);
    return {
      availableLeft: workspaceBox.left + Number.parseFloat(style.paddingLeft),
      availableRight: workspaceBox.right - Number.parseFloat(style.paddingRight),
      targetLeft: targetBox.left,
      targetRight: targetBox.right,
    };
  });
  expect(bounds).not.toBeNull();
  expect(Math.abs(bounds!.targetLeft - bounds!.availableLeft)).toBeLessThanOrEqual(1);
  expect(Math.abs(bounds!.targetRight - bounds!.availableRight)).toBeLessThanOrEqual(1);
}

async function expectSamePanelBorder(panels: Locator): Promise<void> {
  const styles = await panels.evaluateAll((elements) => elements.map((element) => {
    const style = getComputedStyle(element);
    return {
      borderColor: style.borderColor,
      borderRadius: style.borderRadius,
      borderStyle: style.borderStyle,
      borderWidth: style.borderWidth,
    };
  }));
  expect(styles.length).toBeGreaterThan(1);
  const reference = styles[0]!;
  expect(styles.slice(1)).toEqual(styles.slice(1).map(() => reference));
}

async function expectStickyEncounterHeading(
  page: Page,
  heading: Locator,
  targets: Locator[],
  actions: Locator[],
): Promise<void> {
  const topbar = page.locator(".workspace-topbar");
  await page.evaluate(() => window.scrollTo(0, 0));
  const [initialHeadingBox, initialTopbarBox] = await Promise.all([
    heading.boundingBox(),
    topbar.boundingBox(),
  ]);
  expect(initialHeadingBox).not.toBeNull();
  expect(initialTopbarBox).not.toBeNull();
  expect(initialHeadingBox!.y).toBeGreaterThanOrEqual(initialTopbarBox!.y + initialTopbarBox!.height - 1);

  for (const target of targets) {
    await target.evaluate((element) => element.scrollIntoView({ block: "start" }));
    await expect.poll(async () => {
      const [headingBox, topbarBox] = await Promise.all([heading.boundingBox(), topbar.boundingBox()]);
      if (!headingBox || !topbarBox) return Number.POSITIVE_INFINITY;
      return Math.abs(headingBox.y - topbarBox.y - topbarBox.height);
    }).toBeLessThanOrEqual(2);

    const [headingBox, targetBox, layout] = await Promise.all([
      heading.boundingBox(),
      target.boundingBox(),
      heading.evaluate((element) => ({
        fits: element.scrollWidth <= element.clientWidth + 1,
        position: getComputedStyle(element).position,
        viewportWidth: window.visualViewport?.width ?? window.innerWidth,
      })),
    ]);
    expect(headingBox).not.toBeNull();
    expect(targetBox).not.toBeNull();
    expect(layout.position).toBe("sticky");
    expect(layout.fits).toBe(true);
    expect(targetBox!.y).toBeGreaterThanOrEqual(headingBox!.y + headingBox!.height - 1);
    for (const action of actions) {
      const actionBox = await action.boundingBox();
      expect(actionBox).not.toBeNull();
      expect(actionBox!.x).toBeGreaterThanOrEqual(headingBox!.x - 1);
      expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(layout.viewportWidth + 1);
    }
  }
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
  await doctorPage.setViewportSize({ width: 390, height: 844 });
  await doctorPage.goto("/auth/login");
  await doctorPage.getByRole("link", { name: /О программе · Версия/ }).click();
  await expect(doctorPage).toHaveURL(/\/about$/);
  await expect(doctorPage.getByRole("heading", { name: "О программе", level: 1 })).toBeVisible();
  await expect(doctorPage.getByText("Самсонов Максим Станиславович", { exact: true })).toBeVisible();
  expect(await doctorPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await doctorPage.getByRole("link", { name: "Ко входу" }).click();
  await doctorPage.setViewportSize({ width: 1280, height: 720 });
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
  await administratorPage.setViewportSize({ width: 752, height: 1200 });
  const administratorMobileSort = administratorPage.locator(".administrator-mobile-sort");
  await expect(administratorMobileSort).toBeVisible();
  await expectNextFullWidthRow(administratorPage.locator(".administrator-user-filters"), administratorMobileSort);
  await administratorMobileSort.getByLabel("Сортировка пользователей").selectOption("doctor:desc");
  await expect(administratorMobileSort.locator(".app-select-value")).toHaveCSS("white-space", "nowrap");
  await expect(requestRow).toBeVisible({ timeout: replicationTimeout });
  expect(await administratorPage.locator(".administrator-panel").evaluate((panel) => panel.scrollWidth <= panel.clientWidth + 1)).toBe(true);
  await administratorPage.setViewportSize({ width: 1280, height: 720 });
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
  await expect(currentDeviceName).toHaveValue(/^(macOS|Linux|Windows) · Chrome$/);
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
  await therapeuticCard.getByRole("tab", { name: "Осмотр" }).click();
  await therapeuticCard.getByRole("combobox", { name: "Цвет", exact: true })
    .selectOption("exam.mucosa.color.pale-pink");
  await therapeuticCard.getByRole("combobox", { name: "Влажность", exact: true })
    .selectOption("exam.mucosa.moisture.moist");
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
  await expect(differentialDiagnosis.getByText("Выберите диагноз или категорию", { exact: true })).toBeVisible();
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
  const addIndicator = laboratoryCard.getByRole("button", { name: "Добавить показатель" });
  const addLaboratoryIndicator = async (optionName: RegExp, indicatorName: string) => {
    await indicatorToggle.click();
    await laboratoryCard.getByRole("option", { name: optionName }).click();
    await addIndicator.click();
    const input = laboratoryCard.getByLabel(`${indicatorName}, результат`, { exact: true });
    await expect(input).toBeFocused();
    return input;
  };
  const resultInput = await addLaboratoryIndicator(/Лейкоциты \(WBC\)/, "Лейкоциты (WBC)");
  await resultInput.fill("7.2");
  const hematocritInput = await addLaboratoryIndicator(/Гематокрит \(Hct, PCV\)/, "Гематокрит (Hct, PCV)");
  await expect(resultInput).toHaveValue("7.2");
  await hematocritInput.fill("42");
  const hemoglobinInput = await addLaboratoryIndicator(/Гемоглобин \(Hgb\)/, "Гемоглобин (Hgb)");
  await hemoglobinInput.fill("145");
  expect(await laboratoryCard.locator(".laboratory-study-card").evaluate((card) => {
    const results = card.querySelector(".laboratory-panel-results");
    const create = card.querySelector(".laboratory-indicator-create");
    return Boolean(results && create && (results.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING));
  })).toBe(true);
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
  await expect(instrumentalCard.locator(".instrumental-study-list + .instrumental-study-create")).toHaveCount(1);
  const ultrasoundStudy = instrumentalCard.locator(".instrumental-study-card").filter({
    has: doctorPage.getByRole("heading", { name: "УЗИ органов брюшной полости", exact: true }),
  });
  const addInstrumentalFinding = async (comboboxName: string, findingName: string) => {
    const combobox = ultrasoundStudy.getByRole("combobox", { name: comboboxName, exact: true });
    await combobox.fill(findingName);
    await ultrasoundStudy.getByRole("option", { name: findingName, exact: true }).click();
    const createRow = combobox.locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' instrumental-finding-create ')][1]");
    const actionName = comboboxName === "Добавить раздел исследования" ? "Добавить раздел" : "Добавить показатель";
    const add = createRow.getByRole("button", { name: actionName });
    await expectTopAligned(add, createRow.locator(".app-catalog-control"));
    await add.click();
    await expect.poll(async () => instrumentalCard.locator(":focus").evaluateAll((elements, name) =>
      elements.some((element) => element.closest("[data-finding-id]")?.textContent?.includes(name)), findingName))
      .toBe(true);
    if (await createRow.count()) {
      expect(await createRow.locator("..").evaluate((level) => {
        const children = Array.from(level.children);
        const createIndex = children.findIndex((child) => child.classList.contains("instrumental-finding-create"));
        return createIndex >= 0 && children
          .filter((child) => child.hasAttribute("data-finding-id"))
          .every((child) => children.indexOf(child) < createIndex);
      })).toBe(true);
    }
    return add;
  };
  const selectInstrumentalValue = async (indicatorName: string, valueName: string) => {
    const selector = ultrasoundStudy.getByRole("combobox", {
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
    await expect.poll(async () => instrumentalCard.locator(":focus").evaluateAll((elements, name) =>
      elements.some((element) => element.closest("[data-finding-id]")?.textContent?.includes(name)), findingName))
      .toBe(true);
    if (await createRow.count()) {
      expect(await level.evaluate((element) => {
        const children = Array.from(element.children);
        const createIndex = children.findIndex((child) => child.classList.contains("instrumental-finding-create"));
        return createIndex >= 0 && children
          .filter((child) => child.hasAttribute("data-finding-id"))
          .every((child) => children.indexOf(child) < createIndex);
      })).toBe(true);
    }
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
  const deleteInstrumentalStudy = ultrasoundStudy.getByRole("button", { name: "Удалить исследование" });
  const deleteSediment = instrumentalCard.getByRole("button", { name: "Удалить показатель «Взвесь/осадок»" });
  const deleteConcrementSize = concrementSizeInput
    .locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' instrumental-finding-row ')][1]")
    .getByRole("button", { name: "Удалить показатель «Размер»", exact: true });
  await expectTopAligned(addInstrumentalStudy, instrumentalType);
  await expect(instrumentalCard.locator(".instrumental-result-headings")).toHaveCount(0);
  await expectTopAligned(deleteSediment, sedimentInput);
  await expectTopAligned(deleteConcrementSize, concrementSizeInput);

  await instrumentalType.fill("Рентгенография грудной полости");
  await instrumentalCard.getByRole("option", { name: "Рентгенография грудной полости", exact: true }).click();
  await addInstrumentalStudy.click();
  const xrayStudy = instrumentalCard.locator(".instrumental-study-card").filter({
    has: doctorPage.getByRole("heading", { name: "Рентгенография грудной полости", exact: true }),
  });
  const deleteXrayStudy = xrayStudy.getByRole("button", { name: "Удалить исследование" });
  const addXrayFinding = async (findingName: string) => {
    const combobox = xrayStudy.getByRole("combobox", { name: "Добавить раздел исследования", exact: true });
    await combobox.fill(findingName);
    await xrayStudy.getByRole("option", { name: findingName, exact: true }).click();
    const add = combobox.locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' instrumental-finding-create ')][1]")
      .getByRole("button", { name: "Добавить раздел" });
    await add.click();
    return add;
  };
  const addXrayIndicator = async (parentName: string, findingName: string) => {
    const combobox = xrayStudy.getByRole("combobox", {
      name: `Добавить показатель для «${parentName}»`,
      exact: true,
    });
    await combobox.fill(findingName);
    await xrayStudy.getByRole("option", { name: findingName, exact: true }).click();
    const createRow = combobox.locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' instrumental-finding-create ')][1]");
    await createRow.getByRole("button", { name: "Добавить показатель", exact: true }).click();
  };
  const addXrayProjections = await addXrayFinding("Выполненные проекции");
  const projectionsPanel = xrayStudy.getByRole("group", { name: "Проекции", exact: true });
  await projectionsPanel.getByRole("checkbox", { name: "Левая латеролатеральная", exact: true }).check();
  await projectionsPanel.getByRole("checkbox", { name: "Правая латеролатеральная", exact: true }).check();
  const lateralProjections = projectionsPanel.getByRole("checkbox", { name: /латеролатеральная/ });
  await expect(lateralProjections).toHaveCount(2);
  await expect(lateralProjections.nth(0)).toBeChecked();
  await expect(lateralProjections.nth(1)).toBeChecked();

  const addXrayDiaphragm = await addXrayFinding("Купол диафрагмы");
  const diaphragmCharacteristics = xrayStudy.locator(`[data-finding-id="instrumental.finding.xray-thorax.10.0"]`);
  const diaphragmRegularity = diaphragmCharacteristics.getByRole("combobox", { name: "Ровность купола", exact: true });
  const diaphragmDefinition = diaphragmCharacteristics.getByRole("combobox", { name: "Чёткость купола", exact: true });
  const diaphragmProjection = diaphragmCharacteristics.getByRole("combobox", { name: "Проекция", exact: true });
  await expect(diaphragmCharacteristics.getByRole("combobox")).toHaveCount(3);
  await diaphragmRegularity.selectOption({ label: "Неровный" });
  await diaphragmDefinition.selectOption({ label: "Чёткий" });
  await diaphragmProjection.selectOption({ label: "На LL-проекции в области межреберья" });
  const xrayIntercostal = diaphragmCharacteristics.getByLabel("Межреберье на LL-проекции", { exact: true });
  await expect(xrayIntercostal).toBeVisible();
  await xrayIntercostal.fill("7");
  const verifyCheckboxConflict = async (leftPanel: Locator, left: string, rightPanel: Locator, right: string) => {
    const leftChoice = leftPanel.getByRole("checkbox", { name: left, exact: true });
    const rightChoice = rightPanel.getByRole("checkbox", { name: right, exact: true });
    await leftChoice.check();
    await rightChoice.check();
    await expect(leftChoice).not.toBeChecked();
    await expect(rightChoice).toBeChecked();
    await rightChoice.uncheck();
  };
  const addXrayHeart = await addXrayFinding("Сердечный силуэт");
  const heartBorders = xrayStudy.locator(`[data-finding-id="instrumental.finding.xray-thorax.12.2"]`);
  const heartBorderDefinition = heartBorders.getByRole("combobox", { name: "Чёткость границ", exact: true });
  const heartBorderRegularity = heartBorders.getByRole("combobox", { name: "Ровность границ", exact: true });
  await expect(heartBorders.getByRole("checkbox")).toHaveCount(0);
  await expect(heartBorders.getByRole("combobox")).toHaveCount(2);
  await heartBorderDefinition.selectOption({ label: "Чёткие" });
  await heartBorderRegularity.selectOption({ label: "Ровные" });

  const addXrayVenaCava = await addXrayFinding("Каудальная полая вена");
  await addXrayIndicator("Каудальная полая вена", "Выявляется");
  const venaCavaVisibility = xrayStudy.getByRole("combobox", {
    name: "Значение показателя «Выявляется»",
    exact: true,
  });
  await venaCavaVisibility.selectOption({ label: "Чётко" });
  await addXrayIndicator("Каудальная полая вена", "Положение");
  const venaCavaPosition = xrayStudy.getByRole("combobox", {
    name: "Значение показателя «Положение»",
    exact: true,
  });
  await venaCavaPosition.selectOption({ label: "Не изменено" });
  await venaCavaVisibility.selectOption({ label: "Не визуализируется" });
  await expect(venaCavaPosition).toHaveCount(0);
  await expect(xrayStudy.getByRole("combobox", {
    name: "Добавить показатель для «Каудальная полая вена»",
    exact: true,
  })).toHaveCount(0);

  const addXrayLungs = await addXrayFinding("Лёгочные поля");
  const lungPatternPanel = xrayStudy.getByRole("group", { name: "Лёгочный рисунок", exact: true });
  const absentChanges = lungPatternPanel.getByRole("group", { name: "Отсутствие признаков", exact: true });
  const detectedChanges = lungPatternPanel.getByRole("group", { name: "Выявленные изменения", exact: true });
  const locations = lungPatternPanel.getByRole("group", { name: "Изменения отмечаются в", exact: true });
  await expect(lungPatternPanel.getByRole("combobox")).toHaveCount(0);
  await expect(absentChanges.getByRole("checkbox")).toHaveCount(4);
  await expect(detectedChanges.getByRole("checkbox")).toHaveCount(8);
  await expect(locations.getByRole("checkbox")).toHaveCount(2);
  await expect(absentChanges.locator("legend")).toHaveClass(/visually-hidden/);
  await expect(locations.locator("legend")).not.toHaveClass(/visually-hidden/);
  const locationRow = lungPatternPanel.locator(`[data-finding-id="instrumental.finding.xray-thorax.17.3.13"]`);
  await expect(locationRow.locator(".instrumental-result-desktop-name")).toHaveCount(0);
  await expect(locationRow.locator("fieldset")).toHaveClass(/instrumental-panel-label/);
  await expect(detectedChanges.getByRole("checkbox", { name: "Имеет усиление альвеолярного рисунка", exact: true })).toBeVisible();
  await expect(detectedChanges.getByRole("checkbox", { name: "Имеет картину альвеолярных поражений", exact: true })).toBeVisible();
  await expect(detectedChanges.getByRole("checkbox", { name: "Имеет картину заворота", exact: true })).toBeVisible();
  await expect(lungPatternPanel.getByText("Очаговые множественные поражения", { exact: false })).toHaveCount(0);
  const patternOptionMetrics = await detectedChanges.locator("label.check-row").evaluateAll((labels) => labels.map((label) => {
    const checkbox = label.querySelector('input[type="checkbox"]')!.getBoundingClientRect();
    const text = label.querySelector("span")!.getBoundingClientRect();
    return {
      checkboxWidth: checkbox.width,
      checkboxHeight: checkbox.height,
      checkboxTop: checkbox.top,
      textTop: text.top,
      textWidth: text.width,
    };
  }));
  expect(patternOptionMetrics.every(({ checkboxWidth, checkboxHeight, checkboxTop, textTop, textWidth }) =>
    Math.abs(checkboxWidth - 18) <= 0.5
    && Math.abs(checkboxHeight - 18) <= 0.5
    && Math.abs(checkboxTop - textTop) <= 1
    && textWidth >= 40)).toBe(true);
  for (const positive of [
    "Имеет усиление бронхиального рисунка",
    "Имеет усиление интерстициального неструктурированного рисунка",
    "Имеет усиление интерстициального структурированного рисунка",
    "Имеет усиление альвеолярного рисунка",
  ]) {
    await verifyCheckboxConflict(absentChanges, "Без признаков усиления", detectedChanges, positive);
  }
  await verifyCheckboxConflict(
    absentChanges,
    "Без признаков очаговых изменений",
    detectedChanges,
    "Имеет картину очаговых единичных поражений",
  );
  const noDeformation = absentChanges.getByRole("checkbox", { name: "Без признаков деформации", exact: true });
  const noDiffuse = absentChanges.getByRole("checkbox", { name: "Без признаков диффузных изменений", exact: true });
  const alveolarLesions = detectedChanges.getByRole("checkbox", { name: "Имеет картину альвеолярных поражений", exact: true });
  const torsion = detectedChanges.getByRole("checkbox", { name: "Имеет картину заворота", exact: true });
  const atelectasis = detectedChanges.getByRole("checkbox", { name: "Имеет картину ателектаза", exact: true });
  await noDeformation.check();
  await noDiffuse.check();
  await alveolarLesions.check();
  await torsion.check();
  await atelectasis.check();
  await expect(noDeformation).toBeChecked();
  await expect(noDiffuse).toBeChecked();
  await expect(alveolarLesions).toBeChecked();
  await expect(torsion).toBeChecked();
  await expect(atelectasis).toBeChecked();

  await locations.getByRole("checkbox", { name: "Краниальных долях лёгкого", exact: true }).check();
  await locations.getByRole("checkbox", { name: "Каудальных долях лёгкого", exact: true }).check();
  await absentChanges.getByRole("checkbox", { name: "Без признаков усиления", exact: true }).check();
  await absentChanges.getByRole("checkbox", { name: "Без признаков очаговых изменений", exact: true }).check();
  await expect(locations).toHaveCount(0);
  await expect(alveolarLesions).toBeChecked();
  await expect(torsion).toBeChecked();
  await expect(atelectasis).toBeChecked();
  await noDiffuse.uncheck();
  await expect(locations).toBeVisible();
  await expect(locations.getByRole("checkbox", { name: "Краниальных долях лёгкого", exact: true })).not.toBeChecked();
  await expect(locations.getByRole("checkbox", { name: "Каудальных долях лёгкого", exact: true })).not.toBeChecked();

  await addXrayIndicator("Лёгочные поля", "Крупные бронхи");
  const largeBronchi = xrayStudy.locator(`[data-finding-id="instrumental.finding.xray-thorax.17.5"]`);
  const largeBronchiState = largeBronchi.getByRole("combobox", {
    name: "Значение показателя «Крупные бронхи»",
    exact: true,
  });
  const addLargeBronchiDetail = largeBronchi.getByRole("combobox", {
    name: "Добавить показатель для «Крупные бронхи»",
    exact: true,
  });
  await expect(addLargeBronchiDetail).toBeVisible();
  await largeBronchiState.selectOption({ label: "Не изменены" });
  await expect(addLargeBronchiDetail).toBeVisible();
  await addXrayIndicator("Крупные бронхи", "Просвет");
  const largeBronchiLumen = largeBronchi.getByRole("combobox", {
    name: "Значение показателя «Просвет»",
    exact: true,
  });
  await largeBronchiLumen.selectOption({ label: "Сужен" });
  await addXrayIndicator("Крупные бронхи", "Положение");
  const largeBronchiPosition = largeBronchi.getByRole("combobox", {
    name: "Значение показателя «Положение»",
    exact: true,
  });
  await largeBronchiPosition.selectOption({ label: "Правильное" });
  await largeBronchiState.selectOption({ label: "Изменены" });
  await expect(largeBronchiLumen).toHaveValue("instrumental.finding.xray-thorax.17.5.1.2");
  await expect(largeBronchiPosition).toHaveValue("instrumental.finding.xray-thorax.17.5.2.1");

  const addXrayConclusion = await addXrayFinding("Заключение");
  const xrayConclusion = xrayStudy.getByLabel("Заключение", { exact: true });
  await xrayConclusion.fill("Очаговых и диффузных изменений в лёгочных полях не выявлено");

  await instrumentalType.fill("Рентгенография брюшной полости");
  await instrumentalCard.getByRole("option", { name: "Рентгенография брюшной полости", exact: true }).click();
  await addInstrumentalStudy.click();
  const abdominalXrayStudy = instrumentalCard.locator(".instrumental-study-card").filter({
    has: doctorPage.getByRole("heading", { name: "Рентгенография брюшной полости", exact: true }),
  });
  const deleteAbdominalXrayStudy = abdominalXrayStudy.getByRole("button", { name: "Удалить исследование" });
  const addAbdominalXrayFinding = async (findingName: string) => {
    const combobox = abdominalXrayStudy.getByRole("combobox", { name: "Добавить раздел исследования", exact: true });
    await combobox.fill(findingName);
    await abdominalXrayStudy.getByRole("option", { name: findingName, exact: true }).click();
    const add = combobox.locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' instrumental-finding-create ')][1]")
      .getByRole("button", { name: "Добавить раздел" });
    await add.click();
    return add;
  };
  const addAbdominalXrayIndicator = async (parentName: string, findingName: string) => {
    const combobox = abdominalXrayStudy.getByRole("combobox", {
      name: `Добавить показатель для «${parentName}»`,
      exact: true,
    });
    await combobox.fill(findingName);
    await abdominalXrayStudy.getByRole("option", { name: findingName, exact: true }).click();
    const add = combobox.locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' instrumental-finding-create ')][1]")
      .getByRole("button", { name: "Добавить показатель", exact: true });
    await add.click();
    return add;
  };

  const addAbdominalProjections = await addAbdominalXrayFinding("Выполненные проекции");
  const abdominalProjections = abdominalXrayStudy.getByRole("group", { name: "Проекции", exact: true });
  await abdominalProjections.getByRole("checkbox", { name: "Левая латеролатеральная", exact: true }).check();
  await abdominalProjections.getByRole("checkbox", { name: "Правая латеролатеральная", exact: true }).check();
  await abdominalProjections.getByRole("checkbox", { name: "Вентродорсальная", exact: true }).check();

  const addAbdominalSkeleton = await addAbdominalXrayFinding("Костно-суставной аппарат");
  await abdominalXrayStudy.getByRole("combobox", {
    name: "Значение показателя «Костно-суставной аппарат»",
    exact: true,
  }).selectOption({ label: "Имеет признаки патологий" });
  const abdominalPathologies = abdominalXrayStudy.getByRole("group", { name: "Признаки патологий", exact: true });
  await abdominalPathologies.getByRole("checkbox", { name: "Остеофиты", exact: true }).check();
  await abdominalPathologies.getByRole("checkbox", { name: "Перелом", exact: true }).check();
  await abdominalXrayStudy.getByLabel("Описание перелома", { exact: true }).fill("Перелом таза");

  const addAbdominalDiaphragm = await addAbdominalXrayFinding("Купол диафрагмы");
  const addAbdominalDiaphragmCharacteristics = await addAbdominalXrayIndicator(
    "Купол диафрагмы",
    "Характеристики купола",
  );
  const abdominalDiaphragm = abdominalXrayStudy.locator(
    '[data-finding-id="instrumental.finding.xray-abdomen.9.0"]',
  );
  const abdominalDiaphragmRegularity = abdominalDiaphragm.getByRole("combobox", {
    name: "Ровность купола", exact: true,
  });
  const abdominalDiaphragmDefinition = abdominalDiaphragm.getByRole("combobox", {
    name: "Чёткость купола", exact: true,
  });
  const abdominalDiaphragmProjection = abdominalDiaphragm.getByRole("combobox", {
    name: "Проекция измерения", exact: true,
  });
  await abdominalDiaphragmRegularity.selectOption({ label: "Ровный" });
  await abdominalDiaphragmDefinition.selectOption({ label: "Чёткий" });
  await abdominalDiaphragmProjection.selectOption({ label: "На LL-проекции в области межреберья" });
  await abdominalDiaphragm.getByLabel("Межреберье на LL-проекции", { exact: true }).fill("8");
  await abdominalDiaphragmRegularity.selectOption({ label: "Неровный" });
  await expect(abdominalDiaphragmDefinition).toHaveValue("instrumental.finding.xray-abdomen.9.0.3");
  await expect(abdominalDiaphragmProjection).toHaveValue("instrumental.finding.xray-abdomen.9.0.5");

  const addAbdominalWall = await addAbdominalXrayFinding("Брюшная стенка");
  const addAbdominalWallCharacteristics = await addAbdominalXrayIndicator(
    "Брюшная стенка",
    "Характеристики брюшной стенки",
  );
  const abdominalWall = abdominalXrayStudy.locator(
    '[data-finding-id="instrumental.finding.xray-abdomen.11.0"]',
  );
  await abdominalWall.getByRole("combobox", { name: "Ровность стенки", exact: true })
    .selectOption({ label: "Ровная" });
  await abdominalWall.getByRole("combobox", { name: "Чёткость стенки", exact: true })
    .selectOption({ label: "Нечёткая" });

  const addAbdominalLiver = await addAbdominalXrayFinding("Печень");
  const addAbdominalLiverBorders = await addAbdominalXrayIndicator("Печень", "Границы");
  const abdominalLiverBorders = abdominalXrayStudy.locator(
    '[data-finding-id="instrumental.finding.xray-abdomen.12.3"]',
  );
  await abdominalLiverBorders.getByRole("combobox", { name: "Чёткость границ", exact: true })
    .selectOption({ label: "Чёткие" });
  await abdominalLiverBorders.getByRole("combobox", {
    name: "Положение относительно рёберной дуги", exact: true,
  }).selectOption({ label: "Вровень с рёберной дугой" });

  const addAbdominalSpleen = await addAbdominalXrayFinding("Селезёнка");
  const addAbdominalSpleenShadow = await addAbdominalXrayIndicator("Селезёнка", "Тень");
  const abdominalSpleenShadow = abdominalXrayStudy.locator(
    '[data-finding-id="instrumental.finding.xray-abdomen.13.1"]',
  );
  await abdominalSpleenShadow.getByRole("combobox", { name: "Размер тени", exact: true })
    .selectOption({ label: "Не увеличена" });
  await abdominalSpleenShadow.getByRole("combobox", { name: "Однородность тени", exact: true })
    .selectOption({ label: "Однородная" });

  const addSmallIntestine = await addAbdominalXrayFinding("Тонкий отдел кишечника");
  const addSmallIntestineContents = await addAbdominalXrayIndicator("Тонкий отдел кишечника", "Содержимое");
  const smallIntestineContents = abdominalXrayStudy.locator(
    '[data-finding-id="instrumental.finding.xray-abdomen.21.3"]',
  );
  await smallIntestineContents.getByRole("combobox", { name: "Значение показателя «Содержимое»", exact: true })
    .selectOption({ label: "Визуализируется" });
  const smallIntestineContentsPanel = abdominalXrayStudy.getByRole("group", {
    name: "Содержимое тонкого кишечника", exact: true,
  });
  await smallIntestineContentsPanel.getByRole("checkbox", { name: "Жидкость", exact: true }).check();
  await smallIntestineContentsPanel.getByRole("checkbox", { name: "Газ", exact: true }).check();

  const addLargeIntestine = await addAbdominalXrayFinding("Толстый отдел кишечника");
  const addLargeIntestineContents = await addAbdominalXrayIndicator("Толстый отдел кишечника", "Содержимое");
  const largeIntestineContents = abdominalXrayStudy.locator(
    '[data-finding-id="instrumental.finding.xray-abdomen.22.3"]',
  );
  await largeIntestineContents.getByRole("combobox", { name: "Значение показателя «Содержимое»", exact: true })
    .selectOption({ label: "Визуализируется" });
  const largeIntestineContentsPanel = abdominalXrayStudy.getByRole("group", {
    name: "Содержимое толстого кишечника", exact: true,
  });
  await largeIntestineContentsPanel.getByRole("checkbox", { name: "Жидкость", exact: true }).check();
  await largeIntestineContentsPanel.getByRole("checkbox", { name: "Газ", exact: true }).check();
  await largeIntestineContentsPanel.getByRole("checkbox", { name: "Каловые массы", exact: true }).check();

  const addReproductiveSystem = await addAbdominalXrayFinding("Репродуктивная система");
  const addPenis = await addAbdominalXrayIndicator("Репродуктивная система", "Половой член");
  const addOsPenis = await addAbdominalXrayIndicator("Половой член", "Os penis");
  const osPenis = abdominalXrayStudy.locator('[data-finding-id="instrumental.finding.xray-abdomen.23.3.1"]');
  const osPenisVisibility = osPenis.getByRole("combobox", { name: "Значение показателя «Os penis»", exact: true });
  await osPenisVisibility.selectOption({ label: "Визуализируется" });
  let osPenisCharacteristics = abdominalXrayStudy.locator(
    '[data-finding-id="instrumental.finding.xray-abdomen.23.3.1.2.characteristics"]',
  );
  await osPenisCharacteristics.getByRole("combobox", { name: "Чёткость", exact: true })
    .selectOption({ label: "Чётко" });
  await osPenisCharacteristics.getByRole("checkbox", { name: "Имеет перелом", exact: true }).check();
  await expect(osPenisCharacteristics.locator(":scope > .instrumental-finding-content"))
    .toHaveAttribute("data-hierarchy-depth", "3");
  await osPenisVisibility.selectOption({ label: "Не визуализируется" });
  await expect(osPenisCharacteristics).toHaveCount(0);
  await osPenisVisibility.selectOption({ label: "Визуализируется" });
  osPenisCharacteristics = abdominalXrayStudy.locator(
    '[data-finding-id="instrumental.finding.xray-abdomen.23.3.1.2.characteristics"]',
  );
  await osPenisCharacteristics.getByRole("combobox", { name: "Чёткость", exact: true })
    .selectOption({ label: "Нечётко" });
  await osPenisCharacteristics.getByRole("checkbox", { name: "Имеет перелом", exact: true }).check();

  const addAbdominalConclusion = await addAbdominalXrayFinding("Заключение");
  const abdominalConclusion = abdominalXrayStudy.getByLabel("Заключение", { exact: true });
  await abdominalConclusion.fill("Признаки кишечной непроходимости");

  await addSectionSelect.selectOption("recommendations");
  const recommendationsCard = doctorPage.locator(".encounter-section-card").filter({
    has: doctorPage.getByRole("heading", { name: "Рекомендации", exact: true, level: 3 }),
  });
  await recommendationsCard.getByRole("textbox", { name: "Рекомендации", exact: true })
    .fill("Повторный приём через семь дней");
  await expect(recommendationsCard).not.toContainText("Временный универсальный шаблон");
  await addSectionSelect.selectOption("procedures");
  const proceduresCard = doctorPage.locator(".encounter-section-card").filter({
    has: doctorPage.getByRole("heading", { name: "Манипуляции", exact: true, level: 3 }),
  });
  await proceduresCard.getByRole("textbox", { name: "Манипуляции", exact: true })
    .fill("Обработка послеоперационной раны");
  await expect(proceduresCard).not.toContainText("Временный универсальный шаблон");

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
    addXrayProjections,
    addXrayDiaphragm,
    addXrayHeart,
    addXrayVenaCava,
    addXrayLungs,
    addXrayConclusion,
    deleteXrayStudy,
    addAbdominalProjections,
    addAbdominalSkeleton,
    addAbdominalDiaphragm,
    addAbdominalDiaphragmCharacteristics,
    addAbdominalWall,
    addAbdominalWallCharacteristics,
    addAbdominalLiver,
    addAbdominalLiverBorders,
    addAbdominalSpleen,
    addAbdominalSpleenShadow,
    addSmallIntestine,
    addSmallIntestineContents,
    addLargeIntestine,
    addLargeIntestineContents,
    addReproductiveSystem,
    addPenis,
    addOsPenis,
    addAbdominalConclusion,
    deleteAbdominalXrayStudy,
    deleteSediment,
    deleteConcrementSize,
    therapeuticCard.getByRole("button", { name: "Удалить раздел", exact: true }),
    recommendationsCard.getByRole("button", { name: "Удалить раздел", exact: true }),
    proceduresCard.getByRole("button", { name: "Удалить раздел", exact: true }),
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

  const createEditorHeading = doctorPage.locator(".doctor-pet-detail > .encounter-editor .encounter-editor-heading");
  await expect(createEditorHeading.getByRole("heading", { name: "Сегодняшний приём", exact: true })).toBeVisible();
  const createStickyTargets = [
    therapeuticDelete,
    hemoglobinInput,
    ultrasoundStudy.getByLabel("Заключение", { exact: true }),
  ];
  await expectStickyEncounterHeading(doctorPage, createEditorHeading, createStickyTargets, [editorSave]);
  await doctorPage.evaluate(() => { document.documentElement.style.zoom = "1.5"; });
  await expectStickyEncounterHeading(doctorPage, createEditorHeading, createStickyTargets, [editorSave]);
  await doctorPage.evaluate(() => { document.documentElement.style.removeProperty("zoom"); });
  await doctorPage.setViewportSize({ width: 390, height: 844 });
  await expectStickyEncounterHeading(doctorPage, createEditorHeading, createStickyTargets, [editorSave]);

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
  const whatHappenedCard = doctorPage.locator(".encounter-what-happened");
  const problemTree = doctorPage.getByRole("tree", { name: "Не всё хорошо с", exact: true });
  await problemTree.locator(":scope > li > details > summary").click();
  const laboratorySummary = problemTree.locator("summary").filter({ hasText: /^Лабораторными анализами$/ });
  await laboratorySummary.click();
  const laboratoryOptions = laboratorySummary.locator("..").locator("fieldset");
  await expect(laboratoryOptions.getByLabel("Повышена глюкоза в крови", { exact: true })).toBeVisible();
  await expect(laboratoryOptions.getByLabel("Есть кристаллы в моче", { exact: true })).toBeVisible();
  await expect(whatHappenedCard.locator(".encounter-chips .selection-chip")).toHaveCount(3);
  expect(await laboratoryOptions.evaluate((panel) => panel.scrollWidth <= panel.clientWidth + 1)).toBe(true);
  expect(await whatHappenedCard.evaluate((card) => card.scrollWidth <= card.clientWidth + 1)).toBe(true);
  await doctorPage.evaluate(() => window.scrollTo(0, 0));
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

  await therapeuticAdd.click();
  const invalidProblem = therapeuticCard.locator(".therapeutic-problem-card").nth(1);
  await invalidProblem.getByLabel("Как давно началось").selectOption("problem.onset.today");
  await therapeuticCard.getByRole("tab", { name: "Рекомендации" }).click();
  await hemoglobinInput.fill("");
  await ultrasoundStudy.getByLabel("Заключение", { exact: true })
    .evaluate((element) => element.scrollIntoView({ block: "end" }));
  await editorSave.click();

  const invalidProblemTitle = invalidProblem.locator(".therapeutic-problem-title input");
  await expect(therapeuticCard.getByRole("tab", { name: "Анамнез болезни" }))
    .toHaveAttribute("aria-selected", "true");
  await expect(invalidProblemTitle).toBeFocused();
  await expect(invalidProblemTitle).toHaveAttribute("aria-invalid", "true");
  const problemErrorId = await invalidProblemTitle.getAttribute("aria-describedby");
  expect(problemErrorId).not.toBeNull();
  await expect(doctorPage.locator(`[id="${problemErrorId}"]`)).toBeVisible();
  await expect.poll(async () => {
    const [heading, target] = await Promise.all([
      createEditorHeading.boundingBox(),
      invalidProblemTitle.boundingBox(),
    ]);
    return Boolean(heading && target
      && target.y >= heading.y + heading.height - 1
      && target.y + target.height <= 720);
  }).toBe(true);

  await invalidProblem.getByRole("button", { name: "Удалить проблему 2" }).click();
  await doctorPage.evaluate(() => window.scrollTo(0, 0));
  await editorSave.click();
  await expect(hemoglobinInput).toBeFocused();
  await expect(hemoglobinInput).toHaveAttribute("aria-invalid", "true");
  const hemoglobinErrorId = await hemoglobinInput.getAttribute("aria-describedby");
  expect(hemoglobinErrorId).not.toBeNull();
  await expect(doctorPage.locator(`[id="${hemoglobinErrorId}"]`)).toBeVisible();
  await expect.poll(async () => {
    const [heading, target] = await Promise.all([
      createEditorHeading.boundingBox(),
      hemoglobinInput.boundingBox(),
    ]);
    return Boolean(heading && target
      && target.y >= heading.y + heading.height - 1
      && target.y + target.height <= 720);
  }).toBe(true);
  await hemoglobinInput.fill("145");

  await doctorPage.context().setOffline(true);
  await doctorPage.getByRole("button", { name: "Сохранить запись" }).click();
  const doctorRecord = doctorPage.locator(".medical-record-entry-details").filter({ hasText: "Всё хорошо" });
  await expect(doctorRecord).toBeVisible();
  await expectFillsWorkspaceContent(doctorPage.locator(".doctor-pet-detail"));
  await expectSameHorizontalBoundsForAll(doctorPage.locator(".doctor-pet-detail > .panel"));
  await expectSamePanelBorder(doctorPage.locator(
    ".doctor-pet-detail > :is(.owner-epicrisis, .encounter-editor, .laboratory-comparison, .doctor-medical-record)",
  ));
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
  await expect(doctorRecord).toContainText("Рентгенография грудной полости");
  await expect(doctorRecord).toContainText("Межреберье на LL-проекции: 7");
  await expect(doctorRecord).toContainText("Очаговых и диффузных изменений в лёгочных полях не выявлено");
  await expect(doctorRecord).toContainText("Рентгенография брюшной полости");
  await expect(doctorRecord).toContainText("Межреберье на LL-проекции: 8");
  await expect(doctorRecord).toContainText("Перелом таза");
  await expect(doctorRecord).toContainText("Признаки кишечной непроходимости");
  await doctorRecord.getByRole("button", { name: "Редактировать запись" }).click();
  const inlineEditor = doctorRecord.locator(".encounter-editor-inline");
  await expect(inlineEditor.getByLabel("Взятие анализов", { exact: true })).toBeChecked();
  await expect(inlineEditor.getByLabel("Проведение исследования", { exact: true })).toBeChecked();
  const inlineEditorHeading = inlineEditor.locator(".encounter-editor-heading");
  const editCancel = inlineEditorHeading.getByRole("button", { name: "Отменить редактирование" });
  const editSave = inlineEditorHeading.getByRole("button", { name: "Сохранить запись" });
  const inlineStickyTargets = [
    inlineEditor.getByRole("tab", { name: "Рекомендации" }),
    inlineEditor.getByLabel("Гемоглобин (Hgb), результат", { exact: true }),
    inlineEditor.getByLabel("Заключение", { exact: true }).first(),
  ];
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 752, height: 1200 },
    { width: 390, height: 844 },
  ]) {
    await doctorPage.setViewportSize(viewport);
    await expectMedicalActionRail([editSave]);
    await expectHorizontalGap(editCancel, editSave);
    await expectTopAligned(editSave, inlineEditorHeading.getByRole("heading"));
    await expectStickyEncounterHeading(doctorPage, inlineEditorHeading, inlineStickyTargets, [editCancel, editSave]);
  }
  await doctorPage.setViewportSize({ width: 1280, height: 720 });
  const inlineXrayStudy = inlineEditor.locator(".instrumental-study-card").filter({
    has: doctorPage.getByRole("heading", { name: "Рентгенография грудной полости", exact: true }),
  });
  await expect(inlineXrayStudy.getByLabel("Межреберье на LL-проекции", { exact: true })).toHaveValue("7");
  await expect(inlineXrayStudy.getByLabel("Заключение", { exact: true }))
    .toHaveValue("Очаговых и диффузных изменений в лёгочных полях не выявлено");
  const inlineAbdominalXrayStudy = inlineEditor.locator(".instrumental-study-card").filter({
    has: doctorPage.getByRole("heading", { name: "Рентгенография брюшной полости", exact: true }),
  });
  await expect(inlineAbdominalXrayStudy.getByRole("checkbox", { name: "Левая латеролатеральная", exact: true }))
    .toBeChecked();
  await expect(inlineAbdominalXrayStudy.getByRole("checkbox", { name: "Правая латеролатеральная", exact: true }))
    .toBeChecked();
  await expect(inlineAbdominalXrayStudy.getByRole("checkbox", { name: "Вентродорсальная", exact: true }))
    .toBeChecked();
  await expect(inlineAbdominalXrayStudy.getByRole("combobox", { name: "Ровность купола", exact: true }))
    .toHaveValue("instrumental.finding.xray-abdomen.9.0.2");
  await expect(inlineAbdominalXrayStudy.getByRole("combobox", { name: "Чёткость купола", exact: true }))
    .toHaveValue("instrumental.finding.xray-abdomen.9.0.3");
  await expect(inlineAbdominalXrayStudy.getByLabel("Межреберье на LL-проекции", { exact: true })).toHaveValue("8");
  await expect(inlineAbdominalXrayStudy.getByRole("combobox", { name: "Чёткость", exact: true }))
    .toHaveValue("instrumental.finding.xray-abdomen.23.3.1.4");
  await expect(inlineAbdominalXrayStudy.getByRole("checkbox", { name: "Имеет перелом", exact: true })).toBeChecked();
  await expect(inlineAbdominalXrayStudy.getByLabel("Заключение", { exact: true }))
    .toHaveValue("Признаки кишечной непроходимости");
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
  await ownerHistorySearch.fill("диффузных изменений");
  await expect(ownerRecord).toBeVisible({ timeout: replicationTimeout });
  await ownerHistorySearch.fill("кишечной непроходимости");
  await expect(ownerRecord).toBeVisible({ timeout: replicationTimeout });
  await ownerHistorySearch.fill("");
  const laboratoryComparison = ownerPage.locator(".laboratory-comparison");
  await expect(laboratoryComparison).toBeVisible({ timeout: replicationTimeout });
  await ownerPage.setViewportSize({ width: 1800, height: 1000 });
  await expectFillsWorkspaceContent(ownerPage.locator(".owner-pet-detail"));
  await expectSameHorizontalBoundsForAll(ownerPage.locator(".owner-pet-detail > .panel"));
  await ownerPage.getByRole("button", { name: "Копировать идентификатор питомца" }).click();
  const ownerAlert = ownerPage.locator(".workspace-alert");
  await expect(ownerAlert).toBeVisible();
  await expectSameHorizontalBounds(ownerAlert, ownerPage.locator(".owner-pet-detail"));
  const epicrisisDateHeader = ownerPage.locator('.owner-epicrisis [role="columnheader"]');
  const epicrisisDateSort = epicrisisDateHeader.getByRole("button", { name: "Дата" });
  await expect(epicrisisDateHeader).toHaveAttribute("aria-sort", "descending");
  await expectTopAligned(epicrisisDateSort, ownerPage.locator(".epicrisis-table-header > span").nth(1));
  await epicrisisDateSort.click();
  await expect(epicrisisDateHeader).toHaveAttribute("aria-sort", "ascending");
  await expectSamePanelBorder(ownerPage.locator(
    ".owner-pet-detail > :is(.owner-epicrisis, .laboratory-comparison, .owner-medical-record)",
  ));
  await ownerPage.setViewportSize({ width: 1280, height: 720 });
  await laboratoryComparison.locator(".app-catalog-toggle").click();
  await laboratoryComparison.getByRole("option", { name: /Лейкоциты \(WBC\)/ }).click();
  await laboratoryComparison.locator(".app-catalog-toggle").click();
  await laboratoryComparison.getByRole("option", { name: /Гематокрит \(Hct, PCV\)/ }).click();
  await expect(laboratoryComparison.locator(
    ".laboratory-results thead .laboratory-comparison-column-heading",
  )).toHaveCount(2);
  await expect(laboratoryComparison.locator(".laboratory-comparison-selections")).toHaveCount(0);
  await expect(laboratoryComparison.locator(".laboratory-comparison-table")).toBeVisible();
  await expect(laboratoryComparison.locator(".laboratory-results-scroll")).toHaveClass(/owner-access-table-wrap/);
  await expect(laboratoryComparison.locator(".laboratory-results")).toHaveClass(/owner-access-table/);
  await expect(laboratoryComparison.locator(".laboratory-results")).toBeVisible();
  const laboratoryDateHeader = laboratoryComparison.locator(".laboratory-results th").first();
  await expect(laboratoryDateHeader).toHaveAttribute("aria-sort", "descending");
  await expectTopAligned(
    laboratoryDateHeader.getByRole("button", { name: "Дата" }),
    laboratoryComparison.locator(".laboratory-results th").nth(1).locator(".laboratory-comparison-column-label"),
  );
  await laboratoryDateHeader.getByRole("button", { name: "Дата" }).click();
  await expect(laboratoryDateHeader).toHaveAttribute("aria-sort", "ascending");
  await ownerPage.reload();
  await expect(laboratoryComparison).toBeVisible({ timeout: replicationTimeout });
  await expect(laboratoryComparison.locator(
    ".laboratory-results thead .laboratory-comparison-column-heading",
  )).toHaveCount(2);
  const removeLeukocytes = laboratoryComparison.getByRole("button", { name: /Удалить показатель «Лейкоциты \(WBC\),/ });
  const removeHematocrit = laboratoryComparison.getByRole("button", { name: /Удалить показатель «Гематокрит \(Hct, PCV\), %»/ });
  await expect(removeLeukocytes).toBeVisible();
  await expect(removeHematocrit).toBeVisible();
  await expect(removeLeukocytes).toHaveCSS("border-top-width", "0px");
  const removeControlMetrics = await removeLeukocytes.evaluate((button) => {
    const icon = button.querySelector(".app-icon")!;
    const label = button.parentElement!.querySelector(".laboratory-comparison-column-label")!;
    return {
      fontSize: Number.parseFloat(getComputedStyle(label).fontSize),
      iconHeight: icon.getBoundingClientRect().height,
      iconWidth: icon.getBoundingClientRect().width,
    };
  });
  expect(Math.abs(removeControlMetrics.iconHeight - removeControlMetrics.fontSize)).toBeLessThanOrEqual(1);
  expect(Math.abs(removeControlMetrics.iconWidth - removeControlMetrics.fontSize)).toBeLessThanOrEqual(1);
  await removeLeukocytes.click();
  await expect(removeLeukocytes).toHaveCount(0);
  await expect(removeHematocrit).toBeVisible();
  await expect(laboratoryComparison.getByRole("columnheader", { name: /Лейкоциты \(WBC\)/ })).toHaveCount(0);
  await expect(laboratoryComparison.getByRole("columnheader", { name: /Гематокрит \(Hct, PCV\)/ })).toBeVisible();
  await ownerPage.reload();
  await expect(laboratoryComparison).toBeVisible({ timeout: replicationTimeout });
  await expect(laboratoryComparison.getByRole("button", { name: /Удалить показатель «Лейкоциты \(WBC\),/ })).toHaveCount(0);
  await expect(laboratoryComparison.getByRole("button", { name: /Удалить показатель «Гематокрит \(Hct, PCV\), %»/ })).toBeVisible();

  await ownerPage.setViewportSize({ width: 752, height: 1200 });
  const epicrisisMobileSort = ownerPage.locator(".owner-epicrisis-heading .app-table-sort");
  const epicrisisMobileSelector = epicrisisMobileSort.getByLabel("Сортировка эпикриза");
  await expect(epicrisisMobileSort).toBeVisible();
  await expect(epicrisisMobileSort.locator(".app-select-value")).toHaveText("Сначала новые");
  await expect(epicrisisMobileSort.locator(".app-select")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(epicrisisMobileSort.locator(".app-select-value")).toHaveCSS("white-space", "nowrap");
  expect(await ownerPage.locator(".owner-epicrisis-heading").evaluate((heading) => {
    const style = getComputedStyle(heading);
    return style.display === "flex" && style.flexWrap === "nowrap";
  })).toBe(true);
  await epicrisisMobileSelector.selectOption("date:asc");
  await expect(epicrisisDateHeader).toHaveAttribute("aria-sort", "ascending");
  const laboratoryMobileSort = laboratoryComparison.locator(".app-table-sort");
  const laboratoryMobileColumns = laboratoryComparison.locator(".laboratory-results-mobile-columns");
  await expect(laboratoryMobileSort).toBeVisible();
  await expect(laboratoryMobileColumns).toBeVisible();
  await expectNextFullWidthRow(laboratoryMobileColumns, laboratoryMobileSort);
  await expectSameHorizontalBounds(laboratoryMobileSort, laboratoryComparison.locator(".laboratory-results-scroll"));
  await expect(laboratoryMobileSort.locator(".app-select-value")).toHaveText("Сначала новые");
  await laboratoryMobileSort.getByLabel("Сортировка истории лабораторных показателей").selectOption("date:asc");
  await expect(laboratoryDateHeader).toHaveAttribute("aria-sort", "ascending");
  const laboratoryTable = laboratoryComparison.locator(".laboratory-results");
  await expect(laboratoryTable).toBeVisible();
  await expect(removeHematocrit).toBeVisible();
  expect(await laboratoryComparison.evaluate((panel) => panel.scrollWidth <= panel.clientWidth + 1)).toBe(true);
  const laboratoryComparisonCard = laboratoryTable.locator("tbody tr").first();
  await expect(laboratoryComparisonCard.locator('td[data-label="Исследование"]')).toContainText("Общеклинический анализ крови");
  await expect(laboratoryComparisonCard.locator('td[data-label="Лаборатория"]')).toHaveCount(0);
  await expect(laboratoryComparisonCard.locator('td[data-label="Статус"]')).toHaveCount(0);
  await expect(laboratoryComparisonCard.locator('td[data-label^="Гематокрит"]')).toBeVisible();
  expect(await laboratoryComparisonCard.locator('td[data-label="Исследование"]').evaluate((cell) =>
    getComputedStyle(cell, "::before").content.replaceAll('"', "")
  )).toBe("Исследование");

  await ownerPage.setViewportSize({ width: 390, height: 844 });
  await expect(laboratoryTable).toBeVisible();
  expect(await laboratoryComparison.evaluate((panel) => panel.scrollWidth <= panel.clientWidth + 1)).toBe(true);
  await ownerPage.setViewportSize({ width: 1280, height: 720 });
  await expect(laboratoryComparison.locator(".laboratory-comparison-table")).toBeVisible();
  await ownerRecord.locator("summary").click();
  await expect(ownerRecord.getByText("Всё хорошо, необходимо › Взятие анализов", { exact: true })).toBeVisible();
  await expect(ownerRecord.getByText("Всё хорошо, необходимо › Проведение исследования", { exact: true })).toBeVisible();
  await expect(ownerRecord.locator(".encounter-history-comment").getByText("Состояние стабильное", { exact: true })).toBeVisible();
  await expect(ownerRecord.getByText("В стадии наблюдения", { exact: true })).toBeVisible();
  await expect(ownerRecord.getByText("Контроль через неделю", { exact: true })).toBeVisible();
  const ownerRecommendations = ownerRecord.locator(".encounter-history-section").filter({
    has: ownerPage.getByRole("heading", { name: "Рекомендации", exact: true, level: 3 }),
  });
  await expect(ownerRecommendations.getByText("Повторный приём через семь дней", { exact: true })).toBeVisible();
  const ownerProcedures = ownerRecord.locator(".encounter-history-section").filter({
    has: ownerPage.getByRole("heading", { name: "Манипуляции", exact: true, level: 3 }),
  });
  await expect(ownerProcedures.getByText("Обработка послеоперационной раны", { exact: true })).toBeVisible();
  const ownerInstrumental = ownerRecord.locator(".encounter-history-section").filter({
    has: ownerPage.getByRole("heading", { name: "Инструментальные исследования", exact: true }),
  });
  const ownerUltrasoundStudy = ownerInstrumental.locator(".instrumental-history-study")
    .filter({ hasText: "УЗИ органов брюшной полости" });
  await expect(ownerUltrasoundStudy.getByText("Взвесь/осадок: Незначительно", { exact: true })).toBeVisible();
  await expect(ownerUltrasoundStudy.getByText("Заключение: Без патологии", { exact: true })).toBeVisible();
  await expect(ownerUltrasoundStudy.getByText("Гипоэхогенные", { exact: true })).toBeVisible();
  await expect(ownerUltrasoundStudy.getByText("Размер: 9 мм", { exact: true })).toBeVisible();
  await expect(ownerUltrasoundStudy.getByText("Смешанный", { exact: true })).toBeVisible();
  await expect(ownerUltrasoundStudy.getByText("Подвижный", { exact: true })).toBeVisible();
  await expect(ownerUltrasoundStudy.getByText("Размер образований: 11 мм", { exact: true })).toBeVisible();
  await expect(ownerUltrasoundStudy.getByText("Ровные", { exact: true })).toBeVisible();
  await expect(ownerUltrasoundStudy.getByText("Нечёткие", { exact: true })).toBeVisible();
  const ownerXrayStudy = ownerInstrumental.locator(".instrumental-history-study")
    .filter({ hasText: "Рентгенография грудной полости" });
  await expect(ownerXrayStudy.getByText("Межреберье на LL-проекции: 7", { exact: true })).toBeVisible();
  await expect(ownerXrayStudy.getByText("Заключение: Очаговых и диффузных изменений в лёгочных полях не выявлено", { exact: true })).toBeVisible();
  const ownerAbdominalXrayStudy = ownerInstrumental.locator(".instrumental-history-study")
    .filter({ hasText: "Рентгенография брюшной полости" });
  await expect(ownerAbdominalXrayStudy.getByText("Левая латеролатеральная", { exact: true })).toBeVisible();
  await expect(ownerAbdominalXrayStudy.getByText("Правая латеролатеральная", { exact: true })).toBeVisible();
  await expect(ownerAbdominalXrayStudy.getByText("Вентродорсальная", { exact: true })).toBeVisible();
  await expect(ownerAbdominalXrayStudy.getByText("Описание перелома: Перелом таза", { exact: true })).toBeVisible();
  await expect(ownerAbdominalXrayStudy.getByText("Межреберье на LL-проекции: 8", { exact: true })).toBeVisible();
  await expect(ownerAbdominalXrayStudy.getByText("Жидкость", { exact: true })).toHaveCount(2);
  await expect(ownerAbdominalXrayStudy.getByText("Газ", { exact: true })).toHaveCount(2);
  await expect(ownerAbdominalXrayStudy.getByText("Нечётко", { exact: true })).toBeVisible();
  await expect(ownerAbdominalXrayStudy.getByText("Имеет перелом", { exact: true })).toBeVisible();
  await expect(ownerAbdominalXrayStudy.getByText(
    "Заключение: Признаки кишечной непроходимости",
    { exact: true },
  )).toBeVisible();
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
  await expect(ownerTherapeutic.getByRole("tablist")).toHaveCount(0);
  await expect(ownerTherapeutic.locator(".therapeutic-history-block > h4")).toHaveText([
    "Анамнез болезни",
    "Осмотр",
    "Рекомендации",
    "Назначения",
  ]);
  await expect(ownerTherapeutic.getByText("Проблема 1: Контрольный осмотр", { exact: true })).toBeVisible();
  const ownerProblem = ownerTherapeutic.locator(".therapeutic-history-problems article").filter({ hasText: "Контрольный осмотр" });
  await expect(ownerProblem.getByText("Как давно началось", { exact: true })).toBeVisible();
  await expect(ownerProblem.getByText("Сегодня", { exact: true })).toBeVisible();
  const ownerMucosa = ownerTherapeutic.locator(".therapeutic-history-finding-group").filter({
    has: ownerPage.getByText("Видимые слизистые оболочки (ВСО)", { exact: true }),
  });
  await expect(ownerMucosa.locator(".therapeutic-history-finding-detail > span")).toHaveText([
    "Цвет: Бледно-розовые",
    "Влажность: Влажные",
  ]);
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
  await expect(ownerTherapeutic.getByText("Повторный осмотр через неделю", { exact: true })).toBeVisible();
  await expect(ownerTherapeutic.getByText("Щадящий режим", { exact: true })).toBeVisible();
  await expect(ownerRecord.getByText("14.3 кг", { exact: true })).toBeVisible();
  const profileWeight = ownerPage.locator(".pet-profile-view-fields > div").filter({ hasText: "Вес" });
  await expect(profileWeight).toContainText("12.4 кг");
  const recordElementId = await ownerRecord.getAttribute("id");
  if (!recordElementId?.startsWith("encounter-")) throw new Error("Medical record element has no record identifier.");
  const recordId = recordElementId.slice("encounter-".length);
  expect(recordId).toMatch(/^[0-9a-f-]{36}$/i);
  await ownerRecord.getByRole("button", { name: "Подтвердить запись" }).click();
  const recordConfirmationDialog = ownerPage.getByRole("dialog", { name: "Подтвердить медицинскую запись?" });
  await expect(recordConfirmationDialog).toContainText("Подтверждаю правильность внесения данных. Вопросов к заполнению документа не имею.");
  await recordConfirmationDialog.getByRole("button", { name: "Отмена" }).click();
  await expect(recordConfirmationDialog).toBeHidden();
  await expect(ownerRecord.getByText("Ожидает подтверждения", { exact: true })).toBeVisible();
  expect(await queryPostgres(`SELECT count(*) FROM audit_blocks
    WHERE aggregate_type='medicalRecord' AND aggregate_id='${recordId}' AND action='record.confirmed'`)).toBe("0");
  await ownerRecord.getByRole("button", { name: "Подтвердить запись" }).click();
  await ownerPage.getByRole("dialog", { name: "Подтвердить медицинскую запись?" })
    .getByRole("button", { name: "Подтвердить запись" }).click();
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

  await doctorPage.bringToFront();
  await doctorPage.locator(".workspace-sidebar").getByRole("link", { name: "Мед. карты" }).click();
  await expect(doctorPage).toHaveURL(/\/doctor\/home/);
  await doctorPage.setViewportSize({ width: 752, height: 1200 });
  const doctorAccessMobileSort = doctorPage.locator(".doctor-access-mobile-sort");
  await expect(doctorAccessMobileSort).toBeVisible();
  await expectNextFullWidthRow(doctorPage.locator(".doctor-access-filters"), doctorAccessMobileSort);
  await doctorAccessMobileSort.getByLabel("Сортировка доступов к медицинским картам").selectOption("pet:desc");
  await expect(doctorPage.locator(".doctor-access-table th").first()).toHaveAttribute("aria-sort", "descending");
  expect(await doctorPage.locator(".doctor-page").evaluate((panel) => panel.scrollWidth <= panel.clientWidth + 1)).toBe(true);

  await administratorPage.bringToFront();
  await administratorPage.locator(".workspace-sidebar").getByRole("link", { name: "Журнал" }).click();
  await expect(administratorPage).toHaveURL(/\/admin\/audit/);
  await expect(administratorPage.getByText(/Блокчейн проверен · блок/)).toBeVisible();
  await expect(administratorPage.locator(".administrator-audit-table tbody tr").first()).toBeVisible();
  await expect(administratorPage.locator(".administrator-audit-table th").first()).toHaveAttribute("aria-sort", "descending");
  await administratorPage.setViewportSize({ width: 752, height: 1200 });
  const auditMobileSort = administratorPage.locator(".administrator-mobile-sort");
  await expect(auditMobileSort).toBeVisible();
  await expectNextFullWidthRow(administratorPage.locator(".administrator-audit-filters"), auditMobileSort);
  await auditMobileSort.getByLabel("Сортировка журнала действий").selectOption("date:asc");
  await expect(administratorPage.locator(".administrator-audit-table th").first()).toHaveAttribute("aria-sort", "ascending");
  expect(await administratorPage.locator(".administrator-panel").evaluate((panel) => panel.scrollWidth <= panel.clientWidth + 1)).toBe(true);

  if (process.env.KLINOK_E2E_RESTART_API === "true") {
    const auditHashesBeforeMigration = await queryPostgres(`SELECT coalesce(string_agg(block_hash, ',' ORDER BY height), '')
      FROM audit_blocks WHERE aggregate_type='medicalRecord' AND aggregate_id='${recordId}'`);
    await queryPostgres(`UPDATE medical_records
      SET sections=jsonb_set(
        sections,
        '{what-happened,value,selectedIds}',
        '["problem.eyes.11", "removed.option", "problem.eyes.1", "problem.eyes.10", "problem.eyes.1"]'::jsonb,
        true
      )
      WHERE record_id='${recordId}';
      DELETE FROM schema_migrations WHERE version='002_what_happened_catalog';`);
    await restartApi();
    expect(await queryPostgres(`SELECT sections #>> '{what-happened,value,selectedIds}'
      FROM medical_records WHERE record_id='${recordId}'`))
      .toBe('["problem.eyes.1", "problem.eyes.12", "problem.eyes.10"]');
    expect(await queryPostgres("SELECT count(*) FROM schema_migrations WHERE version='002_what_happened_catalog'"))
      .toBe("1");
    expect(await queryPostgres(`SELECT coalesce(string_agg(block_hash, ',' ORDER BY height), '')
      FROM audit_blocks WHERE aggregate_type='medicalRecord' AND aggregate_id='${recordId}'`))
      .toBe(auditHashesBeforeMigration);
  }
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
