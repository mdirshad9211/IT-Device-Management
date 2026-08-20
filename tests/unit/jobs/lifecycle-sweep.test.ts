import { describe, expect, it, vi } from "vitest";
import { AuditAction, DeviceStatus, LifecycleEventType } from "@prisma/client";
import {
  DISCARD_WARNING_LEAD_DAYS,
  LifecycleSweepService,
} from "../../../src/jobs/lifecycle-sweep.job";
import type { DeviceRepository, SweepDeviceRow } from "../../../src/modules/device/device.repository";
import type { DomainEventBus } from "../../../src/shared/kernel/events";
import type { Logger } from "pino";

function sweepRow(overrides: Partial<SweepDeviceRow> = {}): SweepDeviceRow {
  return {
    id: "dev-1",
    clientId: "client-1",
    assetTag: "TAG-1",
    status: DeviceStatus.DISCARDED,
    deletionDueAt: new Date("2026-08-20T00:00:00.000Z"),
    discardWarningSentAt: null,
    userEmail: "user@example.com",
    managerEmail: "mgr@example.com",
    ...overrides,
  };
}

describe("LifecycleSweepService", () => {
  it("emits device.deleted then hard-deletes due devices", async () => {
    const due = sweepRow({ id: "due-1", deletionDueAt: new Date("2026-08-01T00:00:00.000Z") });
    const hardDeleteDevice = vi.fn().mockResolvedValue(undefined);
    const emit = vi.fn();
    const repo = {
      listDueForHardDelete: vi.fn().mockResolvedValue([due]),
      listDueForDiscardWarning: vi.fn().mockResolvedValue([]),
      hardDeleteDevice,
      claimDiscardWarning: vi.fn(),
    } as unknown as DeviceRepository;

    const service = new LifecycleSweepService(
      repo,
      { emit } as unknown as DomainEventBus,
      { info: vi.fn(), error: vi.fn() } as unknown as Logger,
    );

    const result = await service.run(new Date("2026-08-20T12:00:00.000Z"));
    expect(result.deleted).toBe(1);
    expect(emit).toHaveBeenCalledWith(
      "device.deleted",
      expect.objectContaining({
        entityId: "due-1",
        action: AuditAction.DELETE,
        eventType: LifecycleEventType.AUTO_DELETE,
        performedBy: null,
      }),
    );
    expect(hardDeleteDevice).toHaveBeenCalledWith("due-1");
  });

  it("warns only when claimDiscardWarning wins (idempotent)", async () => {
    const candidate = sweepRow({
      id: "warn-1",
      deletionDueAt: new Date("2026-09-01T00:00:00.000Z"),
    });
    const emit = vi.fn();
    const claimDiscardWarning = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const repo = {
      listDueForHardDelete: vi.fn().mockResolvedValue([]),
      listDueForDiscardWarning: vi.fn().mockResolvedValue([candidate]),
      hardDeleteDevice: vi.fn(),
      claimDiscardWarning,
    } as unknown as DeviceRepository;

    const service = new LifecycleSweepService(
      repo,
      { emit } as unknown as DomainEventBus,
      { info: vi.fn(), error: vi.fn() } as unknown as Logger,
    );

    const first = await service.run(new Date("2026-08-20T12:00:00.000Z"));
    expect(first.warned).toBe(1);
    expect(emit).toHaveBeenCalledWith(
      "device.discard.warning",
      expect.objectContaining({
        entityId: "warn-1",
        recipients: ["user@example.com", "mgr@example.com"],
      }),
    );

    // Second run: claim fails → no second emit
    emit.mockClear();
    const second = await service.run(new Date("2026-08-20T12:00:00.000Z"));
    expect(second.warned).toBe(0);
    expect(emit).not.toHaveBeenCalled();
    expect(DISCARD_WARNING_LEAD_DAYS).toBe(15);
  });
});
