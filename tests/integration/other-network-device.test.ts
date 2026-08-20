import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { AppUserRole, DeviceStatus, OtherDeviceType, WarrantyStatus } from "@prisma/client";
import { buildApp } from "../../src/app";
import { prisma } from "../../src/shared/kernel/prisma";
import { createTestUser, resetClientTestData, uniqueName } from "./helpers/client-fixtures";

describe("other-network-device module (postgres-test)", () => {
  let app: FastifyInstance;
  let dbReady = false;
  let adminToken: string;
  let clientId: string;
  let deviceId: string;

  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbReady = true;
    } catch {
      console.warn(
        "Skipping other-network-device integration tests: postgres-test is not reachable (TEST_DATABASE_URL).",
      );
      return;
    }
    app = await buildApp();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(async (context) => {
    if (!dbReady) {
      context.skip();
      return;
    }
    await resetClientTestData();
    const admin = await createTestUser({
      email: `admin-${uniqueName("a")}@inventory.local`,
      name: "Super Admin",
      role: AppUserRole.SUPER_ADMIN,
    });
    adminToken = app.jwt.sign({ userId: admin.id, role: AppUserRole.SUPER_ADMIN });

    const client = await prisma.client.create({
      data: { name: uniqueName("Site"), currentLocation: "CRL Delhi" },
    });
    clientId = client.id;
    const device = await prisma.device.create({
      data: {
        clientId,
        assetTag: uniqueName("TAG"),
        status: DeviceStatus.ACTIVE,
      },
    });
    deviceId = device.id;
  });

  it("enforces scanner-over-manual serial precedence on create", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/other-network-devices",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        clientId,
        type: OtherDeviceType.MONITOR,
        name: "Dell Monitor",
        scannedSerialNumber: "SCAN-SER-99",
        manualSerialNumber: "MANUAL-SER-11",
        warrantyStatus: WarrantyStatus.UNDER_WARRANTY,
        warrantyExpiryDate: "2030-01-01",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().serialNumber).toBe("SCAN-SER-99");
    expect(res.json().effectiveWarrantyStatus).toBe(WarrantyStatus.UNDER_WARRANTY);
  });

  it("linking is visible from both OND and Device endpoints", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/other-network-devices",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        clientId,
        type: OtherDeviceType.KEYBOARD,
        name: "Logitech K120",
        manualSerialNumber: "KB-001",
      },
    });
    expect(created.statusCode).toBe(201);
    const ondId = created.json().id as string;

    const linked = await app.inject({
      method: "PATCH",
      url: `/api/v1/other-network-devices/${ondId}/link`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { attachedDeviceId: deviceId },
    });
    expect(linked.statusCode).toBe(200);
    expect(linked.json().attachedDeviceId).toBe(deviceId);

    const fromOnd = await app.inject({
      method: "GET",
      url: `/api/v1/other-network-devices/${ondId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(fromOnd.statusCode).toBe(200);
    expect(fromOnd.json().attachedDeviceId).toBe(deviceId);

    const fromDevice = await app.inject({
      method: "GET",
      url: `/api/v1/devices/${deviceId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(fromDevice.statusCode).toBe(200);
    const linkedList = fromDevice.json().linkedOtherNetworkDevices as Array<{ id: string; name: string }>;
    expect(linkedList).toEqual(expect.arrayContaining([expect.objectContaining({ id: ondId, name: "Logitech K120" })]));

    const cleared = await app.inject({
      method: "PATCH",
      url: `/api/v1/other-network-devices/${ondId}/link`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { attachedDeviceId: null },
    });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().attachedDeviceId).toBeNull();

    const fromDeviceAfterClear = await app.inject({
      method: "GET",
      url: `/api/v1/devices/${deviceId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(fromDeviceAfterClear.statusCode).toBe(200);
    expect(fromDeviceAfterClear.json().linkedOtherNetworkDevices).toEqual([]);
  });

  it("computes effectiveWarrantyStatus as EXPIRED at read-time when expiry is past", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/other-network-devices",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        clientId,
        type: OtherDeviceType.MOUSE,
        name: "Expired Mouse",
        warrantyStatus: WarrantyStatus.UNDER_WARRANTY,
        warrantyExpiryDate: "2020-01-01",
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().warrantyStatus).toBe(WarrantyStatus.UNDER_WARRANTY);
    expect(created.json().effectiveWarrantyStatus).toBe(WarrantyStatus.EXPIRED);
  });
});
