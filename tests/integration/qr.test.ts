import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { AppUserRole, DeviceStatus } from "@prisma/client";
import { buildApp } from "../../src/app";
import { prisma } from "../../src/shared/kernel/prisma";
import { createTestUser, resetClientTestData, uniqueName } from "./helpers/client-fixtures";

describe("qr module (postgres-test)", () => {
  let app: FastifyInstance;
  let dbReady = false;
  let adminToken: string;
  let deviceId: string;
  let qrValue: string;

  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbReady = true;
    } catch {
      console.warn("Skipping qr integration tests: postgres-test is not reachable (TEST_DATABASE_URL).");
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
    const assetTag = uniqueName("TAG");
    qrValue = `INV:${assetTag}`;
    const device = await prisma.device.create({
      data: {
        clientId: client.id,
        assetTag,
        status: DeviceStatus.ACTIVE,
        qrCode: { create: { qrValue } },
      },
    });
    deviceId = device.id;
  });

  it("renders PNG without regenerating qrValue and increments printCount", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/qr/${deviceId}/image?format=png`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
    expect(res.rawPayload.length).toBeGreaterThan(0);

    const qr = await prisma.qrCode.findUniqueOrThrow({ where: { deviceId } });
    expect(qr.qrValue).toBe(qrValue);
    expect(qr.printCount).toBe(1);
  });

  it("resolve returns stale_warning when agent is missing", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/qr/resolve/${encodeURIComponent(qrValue)}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: "stale_warning",
      stale: true,
      reason: "AGENT_MISSING",
    });
  });
});
