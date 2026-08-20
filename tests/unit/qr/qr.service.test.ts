import { describe, expect, it, vi } from "vitest";
import { DeviceStatus, PollStatus } from "@prisma/client";
import { ConflictError } from "../../../src/shared/kernel/errors";
import { QrService } from "../../../src/modules/qr/qr.service";
import type { QrRepository } from "../../../src/modules/qr/qr.repository";
import type { DomainEventBus } from "../../../src/shared/kernel/events";

function mockBus(): DomainEventBus {
  return { emit: vi.fn(), on: vi.fn() } as unknown as DomainEventBus;
}

describe("QrService.generateQrForDevice", () => {
  it("throws ConflictError when called twice for the same device", async () => {
    const createForDevice = vi.fn(
      async (_deviceId: string, _qrValue: string, _tx?: unknown) => ({
        id: "qr-1",
        deviceId: "dev-1",
        qrValue: "INV:TAG-1",
        printCount: 0,
        createdAt: new Date(),
      }),
    );
    let exists = false;
    const repo: QrRepository = {
      findByDeviceId: async () =>
        exists
          ? {
              id: "qr-1",
              deviceId: "dev-1",
              qrValue: "INV:TAG-1",
              printCount: 0,
              createdAt: new Date(),
            }
          : null,
      findByQrValue: vi.fn(),
      findDeviceAssetTag: async () => ({ id: "dev-1", assetTag: "TAG-1" }),
      findAgentByDeviceId: vi.fn(),
      createForDevice: async (deviceId, qrValue, tx) => {
        const created = await createForDevice(deviceId, qrValue, tx);
        exists = true;
        return created;
      },
      incrementPrintCount: vi.fn(),
    };

    const service = new QrService(repo, mockBus());
    await service.generateQrForDevice("dev-1");
    await expect(service.generateQrForDevice("dev-1")).rejects.toBeInstanceOf(ConflictError);
    expect(createForDevice).toHaveBeenCalledTimes(1);
  });

  it("creates INV:{assetTag} on first call", async () => {
    const createForDevice = vi.fn(async (_deviceId: string, qrValue: string) => ({
      id: "qr-1",
      deviceId: "dev-1",
      qrValue,
      printCount: 0,
      createdAt: new Date(),
    }));
    const repo: QrRepository = {
      findByDeviceId: async () => null,
      findByQrValue: vi.fn(),
      findDeviceAssetTag: async () => ({ id: "dev-1", assetTag: "DEL-LN-1" }),
      findAgentByDeviceId: vi.fn(),
      createForDevice,
      incrementPrintCount: vi.fn(),
    };

    const service = new QrService(repo, mockBus());
    const qr = await service.generateQrForDevice("dev-1");
    expect(qr.qrValue).toBe("INV:DEL-LN-1");
    expect(createForDevice).toHaveBeenCalledWith("dev-1", "INV:DEL-LN-1", undefined);
  });
});

describe("QrService.resolve", () => {
  it("returns stale_warning when QR is unknown", async () => {
    const repo: QrRepository = {
      findByDeviceId: vi.fn(),
      findByQrValue: async () => null,
      findDeviceAssetTag: vi.fn(),
      findAgentByDeviceId: vi.fn(),
      createForDevice: vi.fn(),
      incrementPrintCount: vi.fn(),
    };
    const service = new QrService(repo, mockBus());
    const result = await service.resolve("INV:MISSING");
    expect(result).toMatchObject({
      status: "stale_warning",
      stale: true,
      reason: "QR_NOT_FOUND",
    });
  });

  it("returns stale_warning when lastPollAt is beyond the threshold", async () => {
    const now = new Date("2026-08-20T12:00:00.000Z");
    const repo: QrRepository = {
      findByDeviceId: vi.fn(),
      findByQrValue: async () => ({
        qr: {
          id: "qr-1",
          deviceId: "dev-1",
          qrValue: "INV:TAG",
          printCount: 1,
          createdAt: now,
        },
        device: {
          id: "dev-1",
          clientId: "client-1",
          assetTag: "TAG",
          status: DeviceStatus.ACTIVE,
          cpu: null,
          ram: null,
          storageUsedPercent: null,
        },
        agent: {
          id: "agent-1",
          lastPollAt: new Date("2026-08-18T12:00:00.000Z"),
          lastPollStatus: PollStatus.OK,
        },
      }),
      findDeviceAssetTag: vi.fn(),
      findAgentByDeviceId: vi.fn(),
      createForDevice: vi.fn(),
      incrementPrintCount: vi.fn(),
    };

    const service = new QrService(repo, mockBus());
    const result = await service.resolve("INV:TAG", now);
    expect(result).toMatchObject({
      status: "stale_warning",
      reason: "AGENT_POLL_STALE",
      stale: true,
    });
  });
});
