// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import PendingCountBadge from "../src/components/PendingCountBadge.vue";
import { administratorPendingRequestCount, ownerPendingApprovals, ownerPendingTransferCount } from "../src/pendingApprovals";

describe("pending approval selectors", () => {
  it("caps the visible badge while hiding zero values", async () => {
    const badge = mount(PendingCountBadge, { props: { count: 100 } });
    expect(badge.text()).toBe("99+");
    expect(badge.get(".pending-count-badge").attributes("aria-hidden")).toBe("true");
    await badge.setProps({ count: 0 });
    expect(badge.find(".pending-count-badge").exists()).toBe(false);
  });

  it("counts only pending advanced-role requests for administrators", () => {
    expect(administratorPendingRequestCount({
      allRoles: [
        { role: "doctor", status: "pending" },
        { role: "administrator", status: "pending" },
        { role: "owner", status: "pending" },
        { role: "doctor", status: "approved" },
      ],
    })).toBe(2);
    expect(administratorPendingRequestCount({})).toBe(0);
  });

  it("groups owner access and medical approvals by current pet", () => {
    const result = ownerPendingApprovals({
      pets: [{ petId: "pet-1" }, { petId: "pet-2" }],
      accessRequests: [
        { petId: "pet-1", requesterAccountId: "doctor-1", status: "pending" },
        { petId: "pet-1", requesterAccountId: "doctor-1", status: "pending" },
        { petId: "pet-1", requesterAccountId: "doctor-2", status: "pending" },
        { petId: "pet-2", requesterAccountId: "doctor-3", status: "rejected" },
        { petId: "missing-pet", requesterAccountId: "doctor-4", status: "pending" },
      ],
      records: [
        { petId: "pet-1", recordId: "record-1" },
        { petId: "pet-1", recordId: "record-1" },
        { petId: "pet-1", recordId: "record-2" },
        { petId: "pet-2", recordId: "record-3" },
        { petId: "missing-pet", recordId: "record-4" },
      ],
      confirmedRecordIds: ["record-2"],
    });

    expect(result).toEqual({
      accessRequests: 2,
      medicalRecords: 2,
      total: 4,
      byPet: {
        "pet-1": { accessRequests: 2, medicalRecords: 1, total: 3 },
        "pet-2": { accessRequests: 0, medicalRecords: 1, total: 1 },
      },
    });
    expect(ownerPendingApprovals({})).toEqual({
      accessRequests: 0,
      medicalRecords: 0,
      total: 0,
      byPet: {},
    });
  });

  it("counts actionable transfer requests separately from pet approvals", () => {
    expect(ownerPendingTransferCount({
      transferRequests: [
        { transferRequestId: "transfer-1", initiatedByAccountId: "owner-2", status: "pending" },
        { transferRequestId: "transfer-1", initiatedByAccountId: "owner-2", status: "pending" },
        { transferRequestId: "transfer-2", initiatedByAccountId: "owner-1", status: "pending" },
        { transferRequestId: "transfer-3", initiatedByAccountId: "owner-2", status: "completed" },
      ],
    }, "owner-1")).toBe(1);
    expect(ownerPendingTransferCount({}, "owner-1")).toBe(0);
  });
});
