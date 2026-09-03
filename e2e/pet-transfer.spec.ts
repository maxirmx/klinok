// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const password = "correct horse battery";
const replicationTimeout = 30_000;
const mailpitUrl = process.env.KLINOK_E2E_MAILPIT_URL ?? "http://localhost:8025";
const execFile = promisify(execFileCallback);

type Role = "owner" | "doctor" | "administrator";
type CommandInput = {
  type: string;
  entityId: string;
  activeRole: Role;
  expectedRevision?: number;
  payload: Record<string, unknown>;
};

async function verificationLink(request: APIRequestContext, email: string): Promise<string> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const list = await request.get(`${mailpitUrl}/api/v1/messages`);
    const messages = (await list.json()).messages as Array<{ ID: string }>;
    for (const summary of messages) {
      const message = await request.get(`${mailpitUrl}/api/v1/message/${summary.ID}`);
      const body = await message.json() as { Text?: string; HTML?: string; To?: Array<{ Address?: string }> };
      if (!body.To?.some((recipient) => recipient.Address?.toLocaleLowerCase() === email.toLocaleLowerCase())) continue;
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
      if (body.To?.some((recipient) => recipient.Address?.toLocaleLowerCase() === email.toLocaleLowerCase())
        && body.Text?.includes(expectedText)) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Email containing "${expectedText}" for ${email} was not captured by Mailpit.`);
}

async function transferConfirmationLink(request: APIRequestContext, email: string): Promise<string> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const list = await request.get(`${mailpitUrl}/api/v1/messages`);
    const messages = (await list.json()).messages as Array<{ ID: string }>;
    for (const summary of messages) {
      const message = await request.get(`${mailpitUrl}/api/v1/message/${summary.ID}`);
      const body = await message.json() as { Text?: string; HTML?: string; To?: Array<{ Address?: string }> };
      if (!body.To?.some((recipient) => recipient.Address?.toLocaleLowerCase() === email.toLocaleLowerCase())) continue;
      const match = `${body.Text ?? ""} ${body.HTML ?? ""}`.match(/https?:\/\/[^\s<]+\/owner\/transfers\?request=[^\s<]+/);
      if (match) return match[0].replace(/&amp;/g, "&");
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Transfer confirmation link for ${email} was not captured by Mailpit.`);
}

async function newPage(context: BrowserContext, label: string): Promise<Page> {
  const page = await context.newPage();
  page.setDefaultTimeout(replicationTimeout);
  page.on("pageerror", (error) => console.error(`[browser:${label}:pageerror] ${error.message}`));
  return page;
}

async function register(page: Page, request: APIRequestContext, input: {
  firstName: string;
  lastName: string;
  email: string;
  role: "owner" | "doctor";
}): Promise<void> {
  await page.goto("/auth/register");
  await page.getByLabel("Имя").fill(input.firstName);
  await page.getByLabel("Фамилия").fill(input.lastName);
  await page.getByLabel("Электронная почта").fill(input.email);
  await page.getByLabel(/Пароль —/).fill(password);
  await page.getByLabel("Повторите пароль").fill(password);
  if (input.role === "doctor") await page.getByLabel("Ветеринар").check();
  await page.getByRole("button", { name: "Продолжить" }).click();
  await page.getByLabel(/регистрируюсь в тестовой системе/).check();
  await page.getByLabel(/не использовать при регистрации/).check();
  await page.getByLabel(/исполнилось 18/).check();
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();
  await expect(page).toHaveURL(/\/auth\/verify-email$/);
  await page.goto(await verificationLink(request, input.email));
  await expect(page.getByText(/Почта подтверждена/)).toBeVisible();
}

async function login(page: Page, email: string, accountPassword = password): Promise<void> {
  await page.goto("/auth/login");
  await page.getByLabel("Электронная почта").fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(accountPassword);
  await page.getByRole("button", { name: "Войти" }).click();
}

async function accountId(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const response = await fetch("/api/auth/session");
    const session = await response.json() as { accountId?: string };
    if (!session.accountId) throw new Error("The authenticated session has no account identifier.");
    return session.accountId;
  });
}

async function apiState<T>(page: Page, role: Role): Promise<T> {
  return page.evaluate(async (selectedRole) => {
    const response = await fetch(`/api/state?role=${encodeURIComponent(selectedRole)}`, { credentials: "include" });
    if (!response.ok) throw new Error(`State request failed: ${response.status}`);
    return response.json();
  }, role) as Promise<T>;
}

async function executeCommand<T = unknown>(page: Page, input: CommandInput): Promise<T> {
  return page.evaluate(async (commandInput) => {
    const sessionResponse = await fetch("/api/auth/session", { credentials: "include" });
    const session = await sessionResponse.json() as { csrfToken?: string };
    const response = await fetch("/api/commands", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken ?? "" },
      body: JSON.stringify({ commands: [{
        operationId: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        ...commandInput,
      }] }),
    });
    const body = await response.json() as { results?: Array<{ status: string; value?: unknown; error?: { code: string; message: string } }> };
    const result = body.results?.[0];
    if (!response.ok || !result || !["applied", "duplicate"].includes(result.status)) {
      throw new Error(`${result?.error?.code ?? response.status}: ${result?.error?.message ?? "Command failed"}`);
    }
    return result.value as unknown;
  }, input) as Promise<T>;
}

async function queryPostgres(sql: string): Promise<string> {
  const result = await execFile("docker", [
    "compose", "exec", "-T", "postgres", "psql", "-U", "klinok", "-d", "klinok", "-At", "-c", sql,
  ], { cwd: process.cwd(), env: process.env });
  return result.stdout.trim();
}

async function restartApi(): Promise<void> {
  await execFile("docker", ["compose", "restart", "api"], { cwd: process.cwd(), env: process.env });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await execFile("docker", [
        "compose", "exec", "-T", "api", "node", "-e",
        "fetch('http://127.0.0.1:8090/readyz').then(response=>{if(!response.ok)process.exit(1)}).catch(()=>process.exit(1))",
      ], { cwd: process.cwd(), env: process.env });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error("API did not become ready after resetting the E2E rate-limit process.");
}

async function approveDoctors(administratorPage: Page, accountIds: string[]): Promise<void> {
  const state = await apiState<{
    control: { allRoles: Array<{ accountId: string; requestId: string; role: string; status: string; revision: number }> };
  }>(administratorPage, "administrator");
  for (const targetAccountId of accountIds) {
    const request = state.control.allRoles.find((candidate) => candidate.accountId === targetAccountId
      && candidate.role === "doctor" && candidate.status === "pending");
    if (!request) throw new Error(`Pending Doctor request for ${targetAccountId} was not found.`);
    await executeCommand(administratorPage, {
      type: "role.decide",
      entityId: request.requestId,
      activeRole: "administrator",
      expectedRevision: request.revision,
      payload: { accountId: targetAccountId, role: "doctor", status: "approved" },
    });
  }
}

async function requestIncomingTransfer(page: Page, petId: string): Promise<void> {
  const trigger = page.getByRole("button", { name: "Запросить передачу", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Запросить передачу" });
  await expect(dialog).toBeVisible();
  await expect(page.locator(".confirmation-dialog-backdrop")).toHaveCount(1);
  await dialog.getByRole("searchbox", { name: /^Кличка/ }).fill(petId);
  await dialog.getByRole("button", { name: "Найти питомца" }).click();
  const result = dialog.locator(".doctor-request-result").filter({ hasText: petId });
  await expect(result).toBeVisible();
  await result.getByRole("button", { name: "Выбрать питомца" }).click();
  const review = page.getByRole("dialog", { name: "Подтвердить запрос передачи" });
  await expect(review.locator(".transfer-review dl")).toBeFocused();
  await expect(review.getByRole("checkbox")).toHaveCount(0);
  await review.getByRole("button", { name: "Отправить запрос передачи" }).click();
  await expect(review).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.getByText("Запрос передачи отправлен.")).toBeVisible();
}

test("pet card moves in both directions through one overlay flow", async ({ browser, request }) => {
  test.slow();
  await restartApi();
  const suffix = Date.now();
  const ownerAEmail = `transfer-owner-a-${suffix}@example.ru`;
  const ownerBEmail = `transfer-owner-b-${suffix}@example.ru`;
  const doctorActiveEmail = `transfer-doctor-active-${suffix}@example.ru`;
  const doctorPendingEmail = `transfer-doctor-pending-${suffix}@example.ru`;

  const ownerAPage = await newPage(await browser.newContext(), "transfer-owner-a");
  const ownerBPage = await newPage(await browser.newContext(), "transfer-owner-b");
  const doctorActivePage = await newPage(await browser.newContext(), "transfer-doctor-active");
  const doctorPendingPage = await newPage(await browser.newContext(), "transfer-doctor-pending");
  const administratorPage = await newPage(await browser.newContext(), "transfer-administrator");

  await register(ownerAPage, request, { firstName: "Семён", lastName: "Передающий", email: ownerAEmail, role: "owner" });
  await register(ownerBPage, request, { firstName: "Алёна", lastName: "Принимающая", email: ownerBEmail, role: "owner" });
  await register(doctorActivePage, request, { firstName: "Активный", lastName: "Врач", email: doctorActiveEmail, role: "doctor" });
  await register(doctorPendingPage, request, { firstName: "Ожидающий", lastName: "Врач", email: doctorPendingEmail, role: "doctor" });

  await login(ownerAPage, ownerAEmail);
  await login(ownerBPage, ownerBEmail);
  await login(doctorActivePage, doctorActiveEmail);
  await login(doctorPendingPage, doctorPendingEmail);
  await expect(doctorActivePage).toHaveURL(/\/profile/);
  await expect(doctorPendingPage).toHaveURL(/\/profile/);
  const ownerAId = await accountId(ownerAPage);
  const ownerBId = await accountId(ownerBPage);
  const doctorActiveId = await accountId(doctorActivePage);
  const doctorPendingId = await accountId(doctorPendingPage);
  const administratorEmail = process.env.KLINOK_E2E_BOOTSTRAP_EMAIL ?? "administrator@example.ru";
  await login(administratorPage, administratorEmail, process.env.KLINOK_E2E_BOOTSTRAP_PASSWORD ?? "bootstrap-password-2026");
  await expect(administratorPage).toHaveURL(/\/admin\/home/);
  await approveDoctors(administratorPage, [doctorActiveId, doctorPendingId]);
  for (const page of [doctorActivePage, doctorPendingPage]) {
    await page.bringToFront();
    const role = page.locator(".role-selection-card").filter({ hasText: "Ветеринар" });
    await expect(role.getByText("Одобрена", { exact: true })).toBeVisible({ timeout: replicationTimeout });
    await page.locator(".workspace-sidebar").getByRole("link", { name: "Мед. карты" }).click();
    await expect(page).toHaveURL(/\/doctor\/home/);
  }

  await ownerAPage.locator(".workspace-sidebar").getByRole("link", { name: "Добавить питомца" }).click();
  await ownerAPage.getByLabel("Кличка").fill("Ёжик-путешественник");
  await ownerAPage.getByLabel("Вид").selectOption("Собака");
  await ownerAPage.getByLabel("Порода").fill("Бигль");
  await ownerAPage.getByLabel("Пол").selectOption("Интактный самец");
  await ownerAPage.getByLabel("Точная дата рождения", { exact: true }).fill("2022-06-17");
  await ownerAPage.getByLabel("Окрас", { exact: true }).fill("трёхцветный");
  await ownerAPage.getByLabel("Вес, кг").fill("12.4");
  await ownerAPage.getByLabel("Заметки").fill("Карточка должна пережить обе передачи");
  const savePetAction = ownerAPage.getByRole("button", { name: "Сохранить питомца" });
  const cancelPetAction = ownerAPage.getByRole("link", { name: "Отмена" });
  const [savePetStyle, cancelPetStyle] = await Promise.all([savePetAction, cancelPetAction].map((action) => action.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      boxShadow: style.boxShadow,
      color: style.color,
    };
  })));
  expect(savePetStyle).toEqual(cancelPetStyle);
  await savePetAction.click();
  await expect(ownerAPage).toHaveURL(/\/owner\/pets\/[0-9a-f-]+$/i);
  const petId = new URL(ownerAPage.url()).pathname.split("/").at(-1)!;
  expect(petId).toMatch(/^[0-9a-f-]+$/i);

  const activeRequestId = crypto.randomUUID();
  const pendingRequestId = crypto.randomUUID();
  await executeCommand(doctorActivePage, {
    type: "access.request", entityId: petId, activeRole: "doctor",
    payload: { requestId: activeRequestId, expectedOwnerAccountId: ownerAId },
  });
  await executeCommand(doctorPendingPage, {
    type: "access.request", entityId: petId, activeRole: "doctor",
    payload: { requestId: pendingRequestId, expectedOwnerAccountId: ownerAId },
  });
  const ownerState = await apiState<{
    medical: { accessRequests: Array<{ requestId: string; requesterAccountId: string; revision: number }> };
  }>(ownerAPage, "owner");
  const activeRequest = ownerState.medical.accessRequests.find((candidate) => candidate.requestId === activeRequestId);
  if (!activeRequest) throw new Error("The access request selected for approval is missing.");
  await executeCommand(ownerAPage, {
    type: "access.grant", entityId: crypto.randomUUID(), activeRole: "owner",
    payload: {
      petId, doctorAccountId: doctorActiveId, actions: ["read", "write_unconfirmed"],
      requestId: activeRequest.requestId, expectedRequestRevision: activeRequest.revision,
    },
  });
  const recordId = crypto.randomUUID();
  await executeCommand(doctorActivePage, {
    type: "record.create", entityId: recordId, activeRole: "doctor",
    payload: {
      title: "Передаточная запись",
      input: {
        petId,
        encounterDate: new Date().toISOString().slice(0, 10),
        sections: {
          "what-happened": { selectedIds: [], comment: "История сохраняется при смене владельца" },
          outcome: { selectedIds: ["outcome.observation"], comment: "" },
        },
      },
    },
  });

  await ownerAPage.reload();
  await ownerAPage.setViewportSize({ width: 1800, height: 1000 });
  await ownerAPage.locator(".workspace-sidebar").getByRole("link", { name: /^Передачи/ }).click();
  await expect(ownerAPage).toHaveURL(/\/owner\/transfers$/);
  const transferWidths = await ownerAPage.evaluate(() => {
    const content = document.querySelector<HTMLElement>(".workspace-content")!;
    const manager = document.querySelector<HTMLElement>(".pet-transfer-manager")!;
    const table = document.querySelector<HTMLTableElement>(".transfer-table")!;
    const contentStyle = getComputedStyle(content);
    return {
      available: content.clientWidth - Number.parseFloat(contentStyle.paddingLeft) - Number.parseFloat(contentStyle.paddingRight),
      manager: manager.getBoundingClientRect().width,
      table: table.getBoundingClientRect().width,
      columns: [...table.querySelectorAll("th")].map((heading) => heading.getBoundingClientRect().width),
    };
  });
  expect(Math.abs(transferWidths.available - transferWidths.manager)).toBeLessThanOrEqual(1);
  expect(transferWidths.columns).toHaveLength(6);
  for (const [index, expectedWidth] of [0.2, 0.23, 0.23, 0.12].entries()) {
    expect(transferWidths.columns[index]! / transferWidths.table).toBeCloseTo(expectedWidth, 2);
  }
  expect(transferWidths.columns[5]).toBeLessThanOrEqual(101);
  const outgoingTrigger = ownerAPage.getByRole("button", { name: "Передать питомца", exact: true });
  const incomingTrigger = ownerAPage.getByRole("button", { name: "Запросить передачу", exact: true });
  const [outgoingTriggerStyle, incomingTriggerStyle] = await Promise.all([outgoingTrigger, incomingTrigger].map((action) => action.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      boxShadow: style.boxShadow,
      color: style.color,
    };
  })));
  expect(incomingTriggerStyle).toEqual(outgoingTriggerStyle);
  await expect(outgoingTrigger).toBeEnabled();
  await outgoingTrigger.click();
  const outgoingSearch = ownerAPage.getByRole("dialog", { name: "Передать питомца" });
  await expect(ownerAPage).toHaveURL(/\/owner\/transfers$/);
  await expect(ownerAPage.locator(".confirmation-dialog-backdrop")).toHaveCount(1);
  const outgoingPet = outgoingSearch.getByRole("combobox", { name: "Питомец для передачи" });
  await expect(outgoingPet.locator("option", { hasText: "Ёжик-путешественник" })).toHaveCount(1);
  await outgoingPet.selectOption(petId);
  await outgoingSearch.getByRole("searchbox", { name: /^ФИО принимающего владельца/ }).fill("Алена Принимающая");
  await outgoingSearch.getByRole("button", { name: "Найти владельца" }).click();
  const ownerBResult = outgoingSearch.locator(".directory-dialog-result").filter({ hasText: ownerBId });
  await expect(ownerBResult).toContainText("Алёна Принимающая");
  await ownerBResult.getByRole("button", { name: "Выбрать владельца" }).click();
  const outgoingReview = ownerAPage.getByRole("alertdialog", { name: "Подтвердить передачу питомца" });
  await expect(outgoingReview.locator(".transfer-review dl")).toBeFocused();
  await expect(outgoingReview.locator(".transfer-review > h3")).toHaveCount(0);
  await expect(outgoingReview.locator(".transfer-acknowledgement legend")).toHaveClass("visually-hidden");
  const petNameBox = await outgoingReview.locator(".transfer-review dl > div").nth(0).locator("dd > strong").boundingBox();
  const currentOwnerNameBox = await outgoingReview.locator(".transfer-review dl > div").nth(1).locator(".person-identity-name").boundingBox();
  expect(petNameBox).not.toBeNull();
  expect(currentOwnerNameBox).not.toBeNull();
  expect(Math.abs(petNameBox!.x - currentOwnerNameBox!.x)).toBeLessThanOrEqual(1);
  const acknowledgementCheckboxBox = await outgoingReview.getByRole("checkbox", { name: /потеряю доступ к профилю/ }).boundingBox();
  const acknowledgementTextBox = await outgoingReview.locator(".transfer-acknowledgement .check-row > span").boundingBox();
  expect(acknowledgementCheckboxBox).not.toBeNull();
  expect(acknowledgementTextBox).not.toBeNull();
  expect(Math.abs(acknowledgementCheckboxBox!.y - acknowledgementTextBox!.y)).toBeLessThanOrEqual(3);
  await expect(ownerAPage.locator(".confirmation-dialog-backdrop")).toHaveCount(1);
  const outgoingSubmit = outgoingReview.getByRole("button", { name: "Отправить запрос передачи" });
  await expect(outgoingSubmit).toBeDisabled();
  await outgoingReview.getByRole("checkbox", { name: /потеряю доступ к профилю/ }).check();
  await outgoingSubmit.click();
  await expect(outgoingReview).toBeHidden();
  await expect(ownerAPage.getByText("Запрос передачи отправлен.")).toBeVisible();
  const pendingOutgoingRow = ownerAPage.locator(".transfer-table tbody tr").filter({ hasText: petId });
  await expect(pendingOutgoingRow).toContainText("Ожидает решения");
  await expect(pendingOutgoingRow.locator("td").nth(3)).toHaveCSS("white-space", "nowrap");
  await expect(pendingOutgoingRow.locator("td").nth(4)).toHaveCSS("white-space", "nowrap");
  await expect(pendingOutgoingRow.locator(".transfer-row-actions")).toHaveCSS("flex-wrap", "nowrap");
  await ownerAPage.locator(".workspace-sidebar").getByRole("link", { name: /^Питомцы/ }).click();
  const pendingPetCard = ownerAPage.locator(`.owner-pet-card[href="/owner/pets/${petId}"]`);
  await expect(pendingPetCard.locator(".owner-pet-transfer-status")).toHaveText("Ожидание передачи");
  await pendingPetCard.click();
  await expect(ownerAPage).toHaveURL(new RegExp(`/owner/pets/${petId}$`));
  await expect(ownerAPage.getByRole("button", { name: "Передача уже ожидает решения" })).toBeDisabled();
  await expect(ownerAPage.locator(".owner-pet-profile .owner-pet-transfer-status")).toHaveText("Ожидание передачи");

  await ownerBPage.bringToFront();
  await ownerBPage.reload();
  const blockedIncomingTrigger = ownerBPage.getByRole("button", { name: "Запросить передачу", exact: true });
  await blockedIncomingTrigger.click();
  const blockedIncomingDialog = ownerBPage.getByRole("dialog", { name: "Запросить передачу" });
  await blockedIncomingDialog.getByRole("searchbox", { name: /^Кличка/ }).fill(petId);
  await blockedIncomingDialog.getByRole("button", { name: "Найти питомца" }).click();
  await expect(blockedIncomingDialog.locator(".doctor-request-result")).toHaveCount(0);
  await expect(blockedIncomingDialog).toContainText("Питомцы не найдены.");
  await blockedIncomingDialog.getByRole("button", { name: "Закрыть" }).click();
  const emailedConfirmationLink = await transferConfirmationLink(request, ownerBEmail);
  const emailedConfirmationUrl = new URL(emailedConfirmationLink);
  expect(emailedConfirmationUrl.pathname).toBe("/owner/transfers");
  expect(emailedConfirmationUrl.searchParams.get("request")).toBeTruthy();
  await ownerBPage.locator(".workspace-sidebar").getByRole("button", { name: "Выйти", exact: true }).click();
  await expect(ownerBPage).toHaveURL(/\/auth\/login$/);
  await ownerBPage.goto(emailedConfirmationLink);
  await expect(ownerBPage).toHaveURL(/\/auth\/login\?continue=/);
  await ownerBPage.getByLabel("Электронная почта").fill(ownerBEmail);
  await ownerBPage.getByLabel("Пароль", { exact: true }).fill(password);
  await ownerBPage.getByRole("button", { name: "Войти" }).click();
  await expect(ownerBPage).toHaveURL(new RegExp(`/owner/transfers\\?request=${emailedConfirmationUrl.searchParams.get("request")}$`));
  const firstTransferRow = ownerBPage.locator(".transfer-table tbody tr").filter({ hasText: petId });
  await expect(firstTransferRow).toBeVisible();
  await expect(firstTransferRow).toContainText("Ожидает решения");
  const receiverAcceptance = ownerBPage.getByRole("dialog", { name: "Принять передачу питомца?" });
  await expect(receiverAcceptance).toBeVisible();
  await expect(receiverAcceptance.getByRole("checkbox")).toHaveCount(0);
  await receiverAcceptance.getByRole("button", { name: "Принять передачу" }).click();
  await expect(ownerBPage.getByText("Передача питомца завершена.")).toBeVisible();
  await expect(firstTransferRow).toContainText("Завершена");
  await expect(firstTransferRow.locator("td").last()).toBeEmpty();

  await expectEmailText(request, ownerAEmail, "передано новому владельцу");
  await expectEmailText(request, ownerBEmail, "получили управление");
  await expectEmailText(request, doctorActiveEmail, "отозван");
  await expectEmailText(request, doctorPendingEmail, "отклонён");
  expect(await queryPostgres(`SELECT status FROM access_grants WHERE pet_id='${petId}' ORDER BY created_at LIMIT 1`)).toBe("revoked");
  expect(await queryPostgres(`SELECT status FROM access_requests WHERE request_id='${pendingRequestId}'`)).toBe("rejected");

  await ownerAPage.bringToFront();
  await expect(ownerAPage).toHaveURL(/\/owner\/home$/, { timeout: replicationTimeout });
  await expect(ownerAPage.locator(`a[href="/owner/pets/${petId}"]`)).toHaveCount(0);
  await ownerBPage.locator(`.workspace-sidebar a[href="/owner/pets/${petId}"]`).click();
  await expect(ownerBPage).toHaveURL(new RegExp(`/owner/pets/${petId}$`));
  await expect(ownerBPage.getByText("Карточка должна пережить обе передачи")).toBeVisible();
  await expect(ownerBPage.getByRole("button", { name: /^Открыть приём от/ })
    .filter({ hasText: "История сохраняется при смене владельца" })).toBeVisible();
  await doctorActivePage.bringToFront();
  await doctorActivePage.reload();
  await expect(doctorActivePage.locator(".doctor-access-table tbody tr").filter({ hasText: petId })).toContainText("Отозван");

  await ownerAPage.bringToFront();
  await requestIncomingTransfer(ownerAPage, petId);
  await ownerBPage.bringToFront();
  await ownerBPage.locator(".workspace-sidebar").getByRole("link", { name: /^Передачи/ }).click();
  const incomingRow = ownerBPage.locator(".transfer-table tbody tr").filter({ hasText: petId }).filter({ hasText: "Ожидает решения" });
  await expect(incomingRow).toBeVisible({ timeout: replicationTimeout });
  await ownerBPage.setViewportSize({ width: 390, height: 844 });
  await expect(ownerBPage.locator(".transfer-table thead")).toBeHidden();
  expect(await ownerBPage.locator(".pet-transfer-manager").evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await incomingRow.getByRole("button", { name: "Принять передачу" }).click();
  const staleAcceptance = ownerBPage.getByRole("alertdialog", { name: "Принять передачу питомца?" });
  await expect(staleAcceptance).toBeVisible();
  expect(await staleAcceptance.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await staleAcceptance.getByRole("checkbox", { name: /потеряю доступ к профилю/ }).check();

  await ownerAPage.bringToFront();
  await ownerAPage.locator(".workspace-sidebar").getByRole("link", { name: /^Передачи/ }).click();
  const initiatedRow = ownerAPage.locator(".transfer-table tbody tr").filter({ hasText: petId }).filter({ hasText: "Ожидает решения" });
  await initiatedRow.getByRole("button", { name: "Отменить запрос передачи" }).click();
  const cancelDialog = ownerAPage.getByRole("alertdialog", { name: "Отменить запрос передачи?" });
  const destructiveConfirmation = cancelDialog.getByRole("button", { name: "Отменить запрос" });
  const destructiveConfirmationStyle = await destructiveConfirmation.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      boxShadow: style.boxShadow,
      color: style.color,
    };
  });
  expect(destructiveConfirmationStyle).toEqual({
    backgroundColor: "rgba(0, 0, 0, 0)",
    borderColor: "rgb(199, 54, 47)",
    boxShadow: "none",
    color: "rgb(199, 54, 47)",
  });
  await destructiveConfirmation.click();
  await expect(ownerAPage.getByText("Запрос передачи отменён.")).toBeVisible();

  await ownerBPage.bringToFront();
  await staleAcceptance.getByRole("button", { name: "Принять передачу" }).click();
  await expect(staleAcceptance.getByRole("alert")).toContainText("изменился");
  await expect(staleAcceptance.getByRole("button", { name: "Принять передачу" })).toBeDisabled();
  await staleAcceptance.getByRole("button", { name: "Отмена" }).click();
  await ownerBPage.setViewportSize({ width: 1280, height: 720 });

  await ownerAPage.bringToFront();
  await requestIncomingTransfer(ownerAPage, petId);
  await ownerBPage.bringToFront();
  const finalIncomingRow = ownerBPage.locator(".transfer-table tbody tr").filter({ hasText: petId }).filter({ hasText: "Ожидает решения" });
  await expect(finalIncomingRow).toBeVisible({ timeout: replicationTimeout });
  await finalIncomingRow.getByRole("button", { name: "Принять передачу" }).click();
  const ownerAcceptance = ownerBPage.getByRole("alertdialog", { name: "Принять передачу питомца?" });
  const ownerAcceptanceSubmit = ownerAcceptance.getByRole("button", { name: "Принять передачу" });
  await expect(ownerAcceptanceSubmit).toBeDisabled();
  await ownerAcceptance.getByRole("checkbox", { name: /потеряю доступ к профилю/ }).check();
  await ownerAcceptanceSubmit.click();
  await expect(ownerBPage.getByText("Передача питомца завершена.")).toBeVisible();

  await ownerAPage.bringToFront();
  const returnedPetLink = ownerAPage.locator(`a[href="/owner/pets/${petId}"]`).first();
  await expect(returnedPetLink).toBeVisible({ timeout: replicationTimeout });
  await returnedPetLink.click();
  await expect(ownerAPage.getByRole("button", { name: /^Открыть приём от/ })
    .filter({ hasText: "История сохраняется при смене владельца" })).toBeVisible();
  await expect(ownerAPage.getByText("Карточка должна пережить обе передачи")).toBeVisible();
  await ownerBPage.bringToFront();
  await ownerBPage.locator(".workspace-sidebar").getByRole("link", { name: "Питомцы", exact: true }).click();
  await expect(ownerBPage.locator(`a[href="/owner/pets/${petId}"]`)).toHaveCount(0, { timeout: replicationTimeout });

  expect(await queryPostgres(`SELECT owner_account_id FROM pets WHERE pet_id='${petId}'`)).toBe(ownerAId);
  expect(await queryPostgres(`SELECT count(*) FROM medical_records WHERE pet_id='${petId}' AND record_id='${recordId}'`)).toBe("1");
  expect(await queryPostgres(`SELECT count(*) FROM audit_blocks WHERE action='transfer.completed' AND metadata->>'petId'='${petId}'`)).toBe("2");
  expect(await queryPostgres(
    `SELECT string_agg((before_state->'pet'->>'ownerAccountId')||'>'||(after_state->'pet'->>'ownerAccountId'),',' ORDER BY height) FROM audit_blocks WHERE action='transfer.completed' AND metadata->>'petId'='${petId}'`,
  )).toBe(`${ownerAId}>${ownerBId},${ownerBId}>${ownerAId}`);
});
