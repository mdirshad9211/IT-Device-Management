import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { AppUserRole, DeviceStatus, LifecycleEventType } from "@prisma/client";
import { buildApp } from "../../src/app";
import { prisma } from "../../src/shared/kernel/prisma";
import { createTestUser, resetClientTestData, uniqueName } from "./helpers/client-fixtures";

function assignmentPayload() {
  return {
    userName: "Priya Nair",
    userPhone: "+91 9800000000",
    userEmail: "priya.nair@client.local",
    department: "Engineering",
    managerName: "Sameer Kapoor",
    managerPhone: "+91 9800000001",
    managerEmail: "sameer.kapoor@client.local",
  };
}

describe("device module (postgres-test)", () => {
  let app: FastifyInstance;
  let dbReady = false;
  let adminToken: string;
  let serviceToken: string;
  let engineerToken: string;
  let engineerId: string;

  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbReady = true;
    } catch {
      console.warn("Skipping device integration tests: postgres-test is not reachable (TEST_DATABASE_URL).");
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
    const service = await createTestUser({
      email: `svc-${uniqueName("s")}@inventory.local`,
      name: "Service Manager",
      role: AppUserRole.SERVICE_MANAGER,
    });
    const engineer = await createTestUser({
      email: `eng-${uniqueName("e")}@inventory.local`,
      name: "Site Engineer",
      role: AppUserRole.IT_ENGINEER,
    });
    engineerId = engineer.id;
    adminToken = app.jwt.sign({ userId: admin.id, role: AppUserRole.SUPER_ADMIN });
    serviceToken = app.jwt.sign({ userId: service.id, role: AppUserRole.SERVICE_MANAGER });
    engineerToken = app.jwt.sign({ userId: engineer.id, role: AppUserRole.IT_ENGINEER });
  });

  async function createClient(name: string): Promise<string> {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/clients",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name, currentLocation: "CRL Delhi" },
    });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  async function allot(clientId: string, assetTag: string, token = adminToken) {
    return app.inject({
      method: "POST",
      url: "/api/v1/devices",
      headers: { authorization: `Bearer ${token}` },
      payload: { clientId, assetTag, assignment: assignmentPayload() },
    });
  }

  it("allotment creates exactly one QR in the same transaction", async () => {
    const clientId = await createClient(uniqueName("Site"));
    const res = await allot(clientId, uniqueName("TAG"));
    expect(res.statusCode).toBe(201);
    const deviceId = res.json().id as string;
    expect(res.json().qrCode).toBeTruthy();
    expect(res.json().qrCode.qrValue).toMatch(/^INV:/);
    expect(res.json().currentAssignment.isCurrent).toBe(true);

    const qrCount = await prisma.qrCode.count({ where: { deviceId } });
    expect(qrCount).toBe(1);
    const deviceCount = await prisma.device.count({ where: { id: deviceId } });
    expect(deviceCount).toBe(1);
  });

  it("rejects reactivation on or after day 90", async () => {
    const clientId = await createClient(uniqueName("Site"));
    const created = await allot(clientId, uniqueName("TAG"));
    const deviceId = created.json().id as string;

    const discarded = await app.inject({
      method: "POST",
      url: `/api/v1/devices/${deviceId}/lifecycle`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { eventType: LifecycleEventType.DISCARD },
    });
    expect(discarded.statusCode).toBe(200);
    expect(discarded.json().status).toBe(DeviceStatus.DISCARDED);

    await prisma.device.update({
      where: { id: deviceId },
      data: { deletionDueAt: new Date(Date.now() - 60_000) },
    });

    const reactivated = await app.inject({
      method: "POST",
      url: `/api/v1/devices/${deviceId}/lifecycle`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { eventType: LifecycleEventType.REACTIVATE },
    });
    expect(reactivated.statusCode).toBe(409);
    expect(reactivated.json().error.code).toBe("CONFLICT");
  });

  it("SERVICE_MANAGER attempting permanent delete gets 403", async () => {
    const clientId = await createClient(uniqueName("Site"));
    const created = await allot(clientId, uniqueName("TAG"));
    const deviceId = created.json().id as string;

    const discarded = await app.inject({
      method: "POST",
      url: `/api/v1/devices/${deviceId}/lifecycle`,
      headers: { authorization: `Bearer ${serviceToken}` },
      payload: { eventType: LifecycleEventType.DISCARD },
    });
    expect(discarded.statusCode).toBe(200);

    const deleted = await app.inject({
      method: "POST",
      url: `/api/v1/devices/${deviceId}/lifecycle`,
      headers: { authorization: `Bearer ${serviceToken}` },
      payload: { eventType: LifecycleEventType.MANUAL_DELETE },
    });
    expect(deleted.statusCode).toBe(403);
    expect(deleted.json().error.code).toBe("FORBIDDEN");
  });

  it("engineer assigned to two clients can access devices in both", async () => {
    const clientA = await createClient(uniqueName("A"));
    const clientB = await createClient(uniqueName("B"));

    const assignA = await app.inject({
      method: "POST",
      url: `/api/v1/clients/${clientA}/engineers`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { userId: engineerId },
    });
    const assignB = await app.inject({
      method: "POST",
      url: `/api/v1/clients/${clientB}/engineers`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { userId: engineerId },
    });
    expect(assignA.statusCode).toBe(201);
    expect(assignB.statusCode).toBe(201);

    const deviceA = await allot(clientA, uniqueName("A"), engineerToken);
    const deviceB = await allot(clientB, uniqueName("B"), engineerToken);
    expect(deviceA.statusCode).toBe(201);
    expect(deviceB.statusCode).toBe(201);

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/devices",
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    expect(list.statusCode).toBe(200);
    const ids = (list.json().items as Array<{ id: string }>).map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining([deviceA.json().id, deviceB.json().id]));
    expect(list.json().total).toBe(2);

    const getA = await app.inject({
      method: "GET",
      url: `/api/v1/devices/${deviceA.json().id}`,
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    const getB = await app.inject({
      method: "GET",
      url: `/api/v1/devices/${deviceB.json().id}`,
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    expect(getA.statusCode).toBe(200);
    expect(getB.statusCode).toBe(200);
  });
});
