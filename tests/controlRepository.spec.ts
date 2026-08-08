// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  exportUserKeySet,
  generateUserKeySet,
  type ActiveRoleContext,
  type DeviceCertificate,
} from "@klinok/protocol";
import { ControlRepository } from "../src/repositories/controlRepository";
import { MemoryEventTransport } from "../src/repositories/eventTransport";
import { storeExportedUserKeys } from "../src/repositories/deviceVault";

async function fixture() {
  const keys = await generateUserKeySet();
  const exported = await exportUserKeySet(keys);
  const context: ActiveRoleContext = {
    accountId: "owner-account", deviceId: "owner-device", orbitIdentityId: "owner-orbit",
    role: "owner", roleProofId: "setup-owner", userKeyVersion: 1,
  };
  const certificate: DeviceCertificate = {
    deviceId: context.deviceId, accountId: context.accountId, orbitIdentityId: context.orbitIdentityId,
    status: "active", userKeyVersion: 1, signingPublicKey: exported.signingPublicKey,
    encryptionPublicKey: exported.encryptionPublicKey, issuedAt: "2026-07-10T10:00:00.000Z", attestation: "auth-attestation",
  };
  const transport = new MemoryEventTransport();
  await transport.initialize();
  const repository = new ControlRepository(transport, context, keys, certificate, "bootstrap-administrator");
  return { repository, transport, context, keys, certificate };
}

async function repositoryFor(
  transport: MemoryEventTransport,
  accountId: string,
  role: ActiveRoleContext["role"],
  bootstrapAccountId = "bootstrap-administrator",
  deviceId = `${accountId}-device`,
) {
  const keys = await generateUserKeySet();
  const exported = await exportUserKeySet(keys);
  const context: ActiveRoleContext = {
    accountId, deviceId, orbitIdentityId: `klinok-device-${deviceId}`, role,
    roleProofId: `setup-${role}`, userKeyVersion: 1,
  };
  const certificate: DeviceCertificate = {
    deviceId: context.deviceId, accountId, orbitIdentityId: context.orbitIdentityId, status: "active", userKeyVersion: 1,
    signingPublicKey: exported.signingPublicKey, encryptionPublicKey: exported.encryptionPublicKey,
    issuedAt: "2026-07-10T10:00:00.000Z", attestation: "auth-attestation",
  };
  return new ControlRepository(transport, context, keys, certificate, bootstrapAccountId);
}

describe("control repository", () => {
  it("isolates certificates for two accounts that share one installation ID", async () => {
    const transport = new MemoryEventTransport();
    await transport.initialize();
    const sharedDeviceId = "shared-browser-device";
    const first = await repositoryFor(transport, "first-account", "owner", "bootstrap-administrator", sharedDeviceId);
    const second = await repositoryFor(transport, "second-account", "owner", "bootstrap-administrator", sharedDeviceId);

    await first.initialize({ profile: { firstName: "Первый", lastName: "Владелец" }, requestedRoles: ["owner"] });
    await second.initialize({ profile: { firstName: "Второй", lastName: "Владелец" }, requestedRoles: ["owner"] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const attestations = (await transport.list("control")).filter((event) => event.eventType === "device.attested");
    expect(attestations).toEqual(expect.arrayContaining([
      expect.objectContaining({ aggregateId: "first-account", resourceId: sharedDeviceId }),
      expect.objectContaining({ aggregateId: "second-account", resourceId: sharedDeviceId }),
    ]));
    expect((await first.snapshot()).devices).toEqual([
      expect.objectContaining({ accountId: "first-account", deviceId: sharedDeviceId, status: "active" }),
    ]);
    expect((await second.snapshot()).devices).toEqual([
      expect.objectContaining({ accountId: "second-account", deviceId: sharedDeviceId, status: "active" }),
    ]);

    await first.revokeDevice(sharedDeviceId);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((await first.snapshot()).devices[0]?.status).toBe("revoked");
    expect((await second.snapshot()).devices[0]?.status).toBe("active");
  });

  it("rotates only the matching account certificate when installation IDs are shared", async () => {
    const transport = new MemoryEventTransport();
    await transport.initialize();
    const sharedDeviceId = "shared-browser-device";
    const first = await repositoryFor(transport, "first-account", "owner", "bootstrap-administrator", sharedDeviceId);
    const second = await repositoryFor(transport, "second-account", "owner", "bootstrap-administrator", sharedDeviceId);
    await first.initialize({ profile: { firstName: "Первый", lastName: "Владелец" }, requestedRoles: ["owner"] });
    await second.initialize({ profile: { firstName: "Второй", lastName: "Владелец" }, requestedRoles: ["owner"] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const firstCertificate = (await first.snapshot()).devices[0]!;
    await first.rotateCurrentDevice({ ...firstCertificate, userKeyVersion: 2, issuedAt: "2026-07-20T10:00:00.000Z" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const rotatedCertificate = (await first.snapshot()).devices[0]!;
    await first.rotateCurrentDevice(rotatedCertificate);

    expect((await first.snapshot()).devices[0]?.userKeyVersion).toBe(2);
    expect((await second.snapshot()).devices[0]?.userKeyVersion).toBe(1);
    expect((await transport.list("control")).filter((event) => event.eventType === "device.rotated"))
      .toHaveLength(1);
  });

  it("repairs an auth-side rotation by signing the transition with the retained previous key", async () => {
    const transport = new MemoryEventTransport();
    await transport.initialize();
    const accountId = `rotation-repair-${crypto.randomUUID()}`;
    const oldKeys = await generateUserKeySet(1);
    const oldExported = await exportUserKeySet(oldKeys);
    const oldContext: ActiveRoleContext = {
      accountId,
      deviceId: "surviving-device",
      orbitIdentityId: "surviving-orbit",
      role: "owner",
      roleProofId: "setup-owner",
      userKeyVersion: 1,
    };
    const oldCertificate: DeviceCertificate = {
      deviceId: oldContext.deviceId,
      accountId,
      orbitIdentityId: oldContext.orbitIdentityId,
      status: "active",
      userKeyVersion: 1,
      signingPublicKey: oldExported.signingPublicKey,
      encryptionPublicKey: oldExported.encryptionPublicKey,
      issuedAt: "2026-07-10T10:00:00.000Z",
      attestation: "old-attestation",
    };
    const oldRepository = new ControlRepository(
      transport,
      oldContext,
      oldKeys,
      oldCertificate,
      "bootstrap-administrator",
    );
    await oldRepository.initialize({
      profile: { firstName: "Ольга", lastName: "Владелец" },
      requestedRoles: ["owner"],
    });

    const nextKeys = await generateUserKeySet(2);
    const nextExported = await exportUserKeySet(nextKeys);
    await storeExportedUserKeys(accountId, oldExported);
    await storeExportedUserKeys(accountId, nextExported);
    const nextCertificate: DeviceCertificate = {
      ...oldCertificate,
      userKeyVersion: 2,
      signingPublicKey: nextExported.signingPublicKey,
      encryptionPublicKey: nextExported.encryptionPublicKey,
      issuedAt: "2026-07-11T10:00:00.000Z",
      attestation: "new-attestation",
    };
    const repairedRepository = new ControlRepository(
      transport,
      { ...oldContext, userKeyVersion: 2 },
      nextKeys,
      nextCertificate,
      "bootstrap-administrator",
    );
    await repairedRepository.initialize();

    await repairedRepository.rotateCurrentDevice(nextCertificate);

    expect((await repairedRepository.snapshot()).devices[0]).toMatchObject({
      deviceId: "surviving-device",
      status: "active",
      userKeyVersion: 2,
    });
    expect((await transport.list("control")).findLast((event) => event.eventType === "device.rotated"))
      .toMatchObject({ keyVersion: 1 });
  });

  it("keeps profile revisions monotonic and ignores repeated device revocation", async () => {
    const { repository, transport } = await fixture();
    await repository.initialize({
      profile: { firstName: "Иван", lastName: "Иванов" },
      requestedRoles: ["owner"],
    });
    await repository.updateProfile({
      accountId: "owner-account",
      revision: 2,
      firstName: "Пётр",
      lastName: "Иванов",
      updatedAt: "2026-07-11T10:00:00.000Z",
    });

    expect(await repository.nextProfileRevision()).toBe(3);
    await expect(repository.updateProfile({
      accountId: "owner-account",
      revision: 2,
      firstName: "Устаревшее",
      lastName: "Имя",
      updatedAt: "2026-07-12T10:00:00.000Z",
    })).rejects.toMatchObject({ code: "PROFILE_REVISION_STALE" });
    expect((await repository.snapshot()).profile).toMatchObject({ revision: 2, firstName: "Пётр" });

    await repository.revokeDevice("owner-device");
    await repository.revokeDevice("owner-device");
    expect((await transport.list("control")).filter((event) => event.eventType === "device.revoked"))
      .toHaveLength(1);
    const revokedCertificate = (await repository.snapshot()).devices[0]!;
    await expect(repository.rotateCurrentDevice({
      ...revokedCertificate,
      status: "active",
      userKeyVersion: revokedCertificate.userKeyVersion + 1,
    })).rejects.toMatchObject({ code: "DEVICE_ROTATION_SOURCE_UNAVAILABLE" });
  });

  it("resolves concurrent equal profile revisions by their update timestamp", async () => {
    const { repository, transport, context, keys, certificate } = await fixture();
    await repository.initialize({
      profile: { firstName: "Иван", lastName: "Иванов" },
      requestedRoles: ["owner"],
    });
    const sibling = new ControlRepository(
      transport,
      context,
      keys,
      certificate,
      "bootstrap-administrator",
    );
    await sibling.initialize();

    await Promise.all([
      repository.updateProfile({
        accountId: "owner-account",
        revision: 2,
        firstName: "Раннее",
        lastName: "Имя",
        updatedAt: "2026-07-11T10:00:00.000Z",
      }),
      sibling.updateProfile({
        accountId: "owner-account",
        revision: 2,
        firstName: "Позднее",
        lastName: "Имя",
        updatedAt: "2026-07-12T10:00:00.000Z",
      }),
    ]);
    await repository.refreshProjection();

    expect((await repository.snapshot()).profile).toMatchObject({
      revision: 2,
      firstName: "Позднее",
      updatedAt: "2026-07-12T10:00:00.000Z",
    });
    await repository.updateProfile({
      accountId: "owner-account",
      revision: 3,
      firstName: "Следующее",
      lastName: "Имя",
      updatedAt: "2026-07-13T10:00:00.000Z",
    });
    await repository.deleteAccount("concurrent-delete-operation");
    expect((await transport.list("control")).find((event) =>
      event.eventType === "account.deleted" && event.operationId === "concurrent-delete-operation",
    )).toBeDefined();
  });

  it("rejects rotation repair when the previous device key is unavailable", async () => {
    const transport = new MemoryEventTransport();
    await transport.initialize();
    const accountId = `rotation-missing-key-${crypto.randomUUID()}`;
    const oldKeys = await generateUserKeySet(1);
    const oldExported = await exportUserKeySet(oldKeys);
    const oldContext: ActiveRoleContext = {
      accountId,
      deviceId: "surviving-device",
      orbitIdentityId: "surviving-orbit",
      role: "owner",
      roleProofId: "setup-owner",
      userKeyVersion: 1,
    };
    const oldCertificate: DeviceCertificate = {
      deviceId: oldContext.deviceId,
      accountId,
      orbitIdentityId: oldContext.orbitIdentityId,
      status: "active",
      userKeyVersion: 1,
      signingPublicKey: oldExported.signingPublicKey,
      encryptionPublicKey: oldExported.encryptionPublicKey,
      issuedAt: "2026-07-10T10:00:00.000Z",
      attestation: "old-attestation",
    };
    const oldRepository = new ControlRepository(
      transport,
      oldContext,
      oldKeys,
      oldCertificate,
      "bootstrap-administrator",
    );
    await oldRepository.initialize({
      profile: { firstName: "Ольга", lastName: "Владелец" },
      requestedRoles: ["owner"],
    });

    const nextKeys = await generateUserKeySet(2);
    const nextExported = await exportUserKeySet(nextKeys);
    const nextCertificate: DeviceCertificate = {
      ...oldCertificate,
      userKeyVersion: 2,
      signingPublicKey: nextExported.signingPublicKey,
      encryptionPublicKey: nextExported.encryptionPublicKey,
      issuedAt: "2026-07-11T10:00:00.000Z",
      attestation: "new-attestation",
    };
    const repairedRepository = new ControlRepository(
      transport,
      { ...oldContext, userKeyVersion: 2 },
      nextKeys,
      nextCertificate,
      "bootstrap-administrator",
    );
    await repairedRepository.initialize();

    await expect(repairedRepository.rotateCurrentDevice(nextCertificate))
      .rejects.toMatchObject({ code: "DEVICE_ROTATION_KEY_UNAVAILABLE" });
  });

  it("attests the device, encrypts the profile, and immediately approves Owner", async () => {
    const { repository, transport } = await fixture();
    await repository.initialize({
      profile: { firstName: "Иван", lastName: "Иванов" },
      requestedRoles: ["owner", "doctor"],
    });
    const snapshot = await repository.snapshot();
    expect(snapshot.profile).toMatchObject({ firstName: "Иван", lastName: "Иванов", revision: 1 });
    expect(snapshot.roles).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "owner", status: "approved" }),
      expect.objectContaining({ role: "doctor", status: "pending" }),
    ]));
    const cleartext = JSON.stringify(await transport.list("control"));
    expect(cleartext).not.toContain("Иванов");
  });

  it("automatically approves a Doctor role requested by an Administrator", async () => {
    const transport = new MemoryEventTransport();
    await transport.initialize();
    const administrator = await repositoryFor(transport, "bootstrap-administrator", "administrator");

    await administrator.initialize({
      profile: { firstName: "Начальный", lastName: "Администратор" },
      requestedRoles: ["administrator", "doctor"],
    });

    const snapshot = await administrator.snapshot();
    expect(snapshot.roles).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "administrator", status: "approved" }),
      expect.objectContaining({ role: "doctor", status: "approved" }),
    ]));
    expect(snapshot.pendingQueue).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ accountId: "bootstrap-administrator", role: "doctor" }),
    ]));
    const doctorApproval = (await transport.list("control")).find((event) =>
      event.aggregateId === "bootstrap-administrator" && event.eventType === "role.approved" && event.metadata.role === "doctor",
    );
    expect(doctorApproval?.proofIds).toContain("bootstrap-administrator-role");
  });

  it("lets the bootstrap Administrator approve a pending Doctor and emits companions", async () => {
    const transport = new MemoryEventTransport();
    await transport.initialize();
    const administrator = await repositoryFor(transport, "bootstrap-administrator", "administrator");
    await administrator.initialize({ profile: { firstName: "Начальный", lastName: "Администратор" }, requestedRoles: ["administrator"] });
    const doctor = await repositoryFor(transport, "doctor-account", "doctor");
    await doctor.initialize({ profile: { firstName: "Анна", lastName: "Врач" }, requestedRoles: ["doctor"] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const pending = (await administrator.snapshot()).pendingQueue.find((request) => request.accountId === "doctor-account")!;
    expect(pending).toMatchObject({ role: "doctor", status: "pending" });
    await administrator.decideRole({ accountId: pending.accountId, role: pending.role, status: "approved" });
    await administrator.decideRole({ accountId: pending.accountId, role: pending.role, status: "approved" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((await doctor.snapshot()).roles).toEqual(expect.arrayContaining([expect.objectContaining({ role: "doctor", status: "approved" })]));
    const decision = (await transport.list("control")).find((event) =>
      event.eventType === "role.approved" && event.aggregateId === "doctor-account",
    )!;
    expect((await transport.list("control")).filter((event) =>
      event.eventType === "role.approved" && event.aggregateId === "doctor-account",
    )).toHaveLength(1);
    const operationEvents = (await transport.list("control")).filter((event) => event.operationId === decision.operationId);
    expect(operationEvents.map((event) => event.eventType)).toEqual(expect.arrayContaining([
      "role.approved", "audit.role-transition", "notification.role-transition", "email.role-transition",
    ]));
    expect(new Set(operationEvents.map((event) => event.operationId)).size).toBe(1);
  });

  it("publishes bootstrap profile edits for the target and approved administrators", async () => {
    const transport = new MemoryEventTransport();
    await transport.initialize();
    const administrator = await repositoryFor(transport, "bootstrap-administrator", "administrator");
    const target = await repositoryFor(transport, "owner-account", "owner");
    await administrator.initialize({
      profile: { firstName: "Начальный", lastName: "Администратор" },
      requestedRoles: ["administrator"],
    });
    await target.initialize({ profile: { firstName: "Старое", lastName: "Имя" }, requestedRoles: ["owner"] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    await administrator.updateProfile({
      accountId: "owner-account",
      revision: 2,
      firstName: "Новое",
      patronymic: "Отчество",
      lastName: "Имя",
      updatedAt: "2026-07-12T10:00:00.000Z",
    }, "bootstrap-profile-operation");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const event = (await transport.list("control")).find((candidate) =>
      candidate.eventType === "profile.updated" && candidate.operationId === "bootstrap-profile-operation",
    )!;
    expect(event).toMatchObject({
      aggregateId: "owner-account",
      resourceId: "owner-account",
      actorAccountId: "bootstrap-administrator",
      activeRole: "administrator",
      metadata: { accountId: "owner-account", revision: 2 },
    });
    expect(new Set(event.keyring.map((envelope) => envelope.recipientId))).toEqual(new Set([
      "owner-account",
      "bootstrap-administrator",
    ]));
    expect((await target.snapshot()).profile).toMatchObject({
      accountId: "owner-account",
      revision: 2,
      firstName: "Новое",
      patronymic: "Отчество",
      lastName: "Имя",
    });

    await administrator.updateProfile({
      accountId: "owner-account",
      revision: 2,
      firstName: "Новое",
      lastName: "Имя",
      updatedAt: "2026-07-12T10:00:00.000Z",
    }, "bootstrap-profile-operation");
    expect((await transport.list("control")).filter((candidate) =>
      candidate.eventType === "profile.updated" && candidate.operationId === "bootstrap-profile-operation",
    )).toHaveLength(1);
  });

  it("rewraps the latest profiles when a new Administrator is approved", async () => {
    const transport = new MemoryEventTransport();
    await transport.initialize();
    const bootstrap = await repositoryFor(transport, "bootstrap-administrator", "administrator");
    const owner = await repositoryFor(transport, "rewrap-owner", "owner");
    const administrator = await repositoryFor(transport, "next-administrator", "administrator");
    await bootstrap.initialize({
      profile: { firstName: "Начальный", lastName: "Администратор" },
      requestedRoles: ["administrator"],
    });
    await owner.initialize({ profile: { firstName: "Старое", lastName: "Имя" }, requestedRoles: ["owner"] });
    await owner.updateProfile({
      accountId: "rewrap-owner",
      revision: 2,
      firstName: "Новое",
      lastName: "Имя",
      updatedAt: "2026-07-12T10:00:00.000Z",
    });
    await administrator.initialize({
      profile: { firstName: "Следующий", lastName: "Администратор" },
      requestedRoles: ["administrator"],
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const pending = (await bootstrap.snapshot()).pendingQueue.find((request) =>
      request.accountId === "next-administrator" && request.role === "administrator",
    )!;

    await bootstrap.decideRole({
      accountId: pending.accountId,
      role: pending.role,
      status: "approved",
    });

    const decision = (await transport.list("control")).find((event) =>
      event.eventType === "role.approved" && event.aggregateId === "next-administrator",
    )!;
    const rewrapped = (await transport.list("control")).filter((event) =>
      event.eventType === "profile.key.rewrapped" && event.operationId === decision.operationId,
    );
    expect(rewrapped.map((event) => event.aggregateId)).toEqual(expect.arrayContaining([
      "bootstrap-administrator",
      "rewrap-owner",
      "next-administrator",
    ]));
    expect(rewrapped.find((event) => event.aggregateId === "rewrap-owner"))
      .toMatchObject({ metadata: { revision: 2, newAdministratorAccountId: "next-administrator" } });
  });

  it("links account deletion to the latest profile revision and remains idempotent", async () => {
    const { repository, transport } = await fixture();
    await repository.initialize({
      profile: { firstName: "Иван", lastName: "Иванов" },
      requestedRoles: ["owner"],
    });
    await repository.updateProfile({
      accountId: "owner-account",
      revision: 2,
      firstName: "Пётр",
      lastName: "Иванов",
      updatedAt: "2026-07-11T10:00:00.000Z",
    });
    await repository.updateProfile({
      accountId: "owner-account",
      revision: 3,
      firstName: "Анна",
      lastName: "Иванова",
      updatedAt: "2026-07-12T10:00:00.000Z",
    });
    const latestProfile = (await transport.list("control")).findLast((event) =>
      event.eventType === "profile.updated" && event.metadata.revision === 3,
    )!;

    await repository.deleteAccount("delete-operation");
    await repository.deleteAccount("delete-operation");

    const deletions = (await transport.list("control")).filter((event) => event.eventType === "account.deleted");
    expect(deletions).toEqual([expect.objectContaining({
      operationId: "delete-operation",
      parents: [latestProfile.eventId],
    })]);
  });

  it("records a direct restoration and its audit companion", async () => {
    const transport = new MemoryEventTransport();
    await transport.initialize();
    const administrator = await repositoryFor(transport, "bootstrap-administrator", "administrator");
    await administrator.initialize({ profile: { firstName: "Начальный", lastName: "Администратор" }, requestedRoles: ["administrator"] });
    const doctor = await repositoryFor(transport, "doctor-account", "doctor");
    await doctor.initialize({ profile: { firstName: "Анна", lastName: "Врач" }, requestedRoles: ["doctor"] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const pending = (await administrator.snapshot()).pendingQueue.find((request) => request.accountId === "doctor-account")!;
    await administrator.decideRole({ accountId: pending.accountId, role: pending.role, status: "rejected", reason: "Проверка не пройдена" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const rejected = (await administrator.snapshot()).allRoles.find((request) =>
      request.accountId === "doctor-account" && request.role === "doctor",
    )!;

    await expect(administrator.decideRole({
      accountId: rejected.accountId,
      role: rejected.role,
      status: "approved",
      expectedStatus: "pending",
    })).rejects.toMatchObject({ code: "ROLE_STATUS_CHANGED" });
    await administrator.decideRole({
      accountId: rejected.accountId,
      role: rejected.role,
      status: "approved",
      expectedStatus: "rejected",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const events = await transport.list("control");
    const restoration = events.find((event) =>
      event.eventType === "role.restored" && event.aggregateId === "doctor-account",
    )!;
    expect(restoration).toBeDefined();
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        eventType: "audit.role-transition",
        operationId: restoration.operationId,
        parents: [restoration.eventId],
      }),
    ]));
    expect((await doctor.snapshot()).roles).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "doctor", status: "approved" }),
    ]));
  });
});
