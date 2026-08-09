// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { describe, expect, it, vi } from "vitest";
import {
  ACCESS_CONTROLLER_TYPES,
  exportUserKeySet,
  generateUserKeySet,
  InMemorySignedEventRepository,
  signEvent,
  type DeviceCertificate,
  type SignedEvent,
} from "@klinok/protocol";
import { createDynamicAccessController } from "../p2p-node/src/accessController";

describe("trusted node access controllers", () => {
  it("uses different OrbitDB access-controller types for control and medical databases", () => {
    const control = createDynamicAccessController({ database: "control" });
    const medical = createDynamicAccessController({ database: "medical" });

    expect(control.type).toBe(ACCESS_CONTROLLER_TYPES.control);
    expect(medical.type).toBe(ACCESS_CONTROLLER_TYPES.medical);
    expect(control.type).not.toBe(medical.type);
  });

  it("reports invalid OrbitDB payloads separately from identity mismatches", async () => {
    const onRejected = vi.fn();
    const factory = createDynamicAccessController({ database: "control", onRejected });
    const controller = await factory();

    await expect(controller.canAppend({ identity: "identity-hash", payload: { value: { op: "ADD", value: { invalid: true } } } })).resolves.toBe(false);
    expect(onRejected).toHaveBeenCalledWith(undefined, "EVENT_PAYLOAD_INVALID", expect.objectContaining({
      entryShape: "payload.value>value>object",
    }));
  });

  it("unwraps OrbitDB Events operations before protocol authorization", async () => {
    const onRejected = vi.fn();
    const event = {
      schemaVersion: 1,
      eventId: "event-1",
      eventType: "profile.updated",
      database: "control",
      orbitIdentityId: "event-orbit",
    } as SignedEvent;
    const factory = createDynamicAccessController({
      database: "control",
      replayQuarantineEventIds: new Set([event.eventId]),
      onRejected,
    });
    const controller = await factory();

    await expect(controller.canAppend({ identity: "identity-hash", payload: { value: { op: "ADD", key: null, value: event } } })).resolves.toBe(false);
    expect(onRejected).toHaveBeenCalledWith(event, "EVENT_SCHEMA_INVALID", expect.objectContaining({
      entryShape: "payload.value>value>signed-event",
      eventOrbitIdentity: "event-orbit",
    }));
  });

  it("defers causal authorization when OrbitDB replays a child before its parent", async () => {
    const onRejected = vi.fn();
    const onDeferred = vi.fn();
    const event = {
      schemaVersion: 1,
      eventId: "child-event",
      eventType: "profile.updated",
      database: "control",
      aggregateId: "account-1",
      resourceId: "account-1",
      operationId: "operation-1",
      actorAccountId: "account-1",
      actorDeviceId: "device-1",
      orbitIdentityId: "klinok-device-1",
      activeRole: "owner",
      parents: ["parent-event"],
      proofIds: [],
      keyVersion: 1,
      createdAt: "2026-07-11T00:00:00.000Z",
      metadata: {},
      keyring: [],
      payload: { algorithm: "AES-GCM-256", iv: "iv", ciphertext: "ciphertext" },
      signature: { algorithm: "ECDSA-P256-SHA256", value: "signature" },
    } satisfies SignedEvent;
    const factory = createDynamicAccessController({ database: "control", onRejected, onDeferred });
    const controller = await factory();

    await expect(controller.canAppend({ identity: "identity-hash", payload: { value: { op: "ADD", value: event } } })).resolves.toBe(true);
    expect(onDeferred).toHaveBeenCalledWith(event, "EVENT_PARENT_MISSING", expect.objectContaining({
      eventOrbitIdentity: "klinok-device-1",
    }));
    expect(onRejected).not.toHaveBeenCalled();
  });

  it("defers authorization when an event is replayed before its device certificate", async () => {
    const onDeferred = vi.fn();
    const event = {
      schemaVersion: 1,
      eventId: "event-before-certificate",
      eventType: "profile.updated",
      database: "control",
      aggregateId: "account-1",
      resourceId: "account-1",
      operationId: "operation-2",
      actorAccountId: "account-1",
      actorDeviceId: "device-1",
      orbitIdentityId: "klinok-device-1",
      activeRole: "owner",
      parents: [],
      proofIds: [],
      keyVersion: 1,
      createdAt: "2026-07-11T00:00:01.000Z",
      metadata: {},
      keyring: [],
      payload: { algorithm: "AES-GCM-256", iv: "iv", ciphertext: "ciphertext" },
      signature: { algorithm: "ECDSA-P256-SHA256", value: "signature" },
    } satisfies SignedEvent;
    const controller = await createDynamicAccessController({ database: "control", onDeferred })();

    await expect(controller.canAppend({ identity: "identity-hash", payload: { value: { op: "ADD", value: event } } })).resolves.toBe(true);
    expect(onDeferred).toHaveBeenCalledWith(event, "DEVICE_UNKNOWN", expect.any(Object));
  });

  it("admits only an explicitly quarantined anchor mismatch into transport replay", async () => {
    const unrelatedKeys = await generateUserKeySet();
    const unrelated = await exportUserKeySet(unrelatedKeys);
    const anchor = await exportUserKeySet(await generateUserKeySet());
    const certificate: DeviceCertificate = {
      deviceId: "bad-bootstrap-device",
      accountId: "bootstrap-administrator",
      orbitIdentityId: "klinok-device-bad-bootstrap-device",
      status: "active",
      userKeyVersion: unrelated.version,
      signingPublicKey: unrelated.signingPublicKey,
      encryptionPublicKey: unrelated.encryptionPublicKey,
      issuedAt: "2026-07-10T00:00:00.000Z",
      attestation: "legacy-attestation",
    };
    const event = await signEvent({
      schemaVersion: 1,
      database: "control",
      eventId: "known-bad-event",
      operationId: "known-bad-operation",
      eventType: "device.attested",
      aggregateId: certificate.accountId,
      resourceId: certificate.deviceId,
      createdAt: certificate.issuedAt,
      actorAccountId: certificate.accountId,
      actorDeviceId: certificate.deviceId,
      orbitIdentityId: certificate.orbitIdentityId,
      activeRole: "administrator",
      parents: [],
      keyVersion: certificate.userKeyVersion,
      proofIds: [],
      metadata: { accountId: certificate.accountId, certificate },
      keyring: [],
      payload: { algorithm: "AES-GCM-256", iv: "iv", ciphertext: "ciphertext" },
    }, unrelatedKeys.signingPrivateKey);
    const entry = { identity: "identity-hash", payload: { value: { op: "ADD", value: event } } };
    const onRejected = vi.fn();
    const regular = await createDynamicAccessController({
      database: "control",
      bootstrapSigningPublicKey: anchor.signingPublicKey,
      onRejected,
    })();
    await expect(regular.canAppend(entry)).resolves.toBe(false);
    expect(onRejected).toHaveBeenCalledWith(event, "BOOTSTRAP_ANCHOR_MISMATCH", expect.any(Object));

    const onQuarantined = vi.fn();
    const quarantined = await createDynamicAccessController({
      database: "control",
      bootstrapSigningPublicKey: anchor.signingPublicKey,
      replayQuarantineEventIds: new Set([event.eventId]),
      onQuarantined,
    })();
    await expect(quarantined.canAppend(entry)).resolves.toBe(true);
    expect(onQuarantined).toHaveBeenCalledWith(event, "BOOTSTRAP_ANCHOR_MISMATCH", expect.any(Object));

    const projector = new InMemorySignedEventRepository("bootstrap-administrator", {
      bootstrapSigningPublicKey: anchor.signingPublicKey,
      replayQuarantineEventIds: new Set([event.eventId]),
    });
    const projection = await projector.import([event]);
    expect(projection.conflicts).toEqual([expect.objectContaining({
      event,
      result: expect.objectContaining({ code: "BOOTSTRAP_ANCHOR_MISMATCH" }),
    })]);
    expect(projector.state.knownEvents.has(event.eventId)).toBe(true);
    expect(projector.state.devices.size).toBe(0);
  });
});
