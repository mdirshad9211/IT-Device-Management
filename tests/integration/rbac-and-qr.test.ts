import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { AppUserRole, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { buildApp } from "../../src/app";
import { prisma } from "../../src/shared/kernel/prisma";
import { createTestUser, resetClientTestData, uniqueName } from "./helpers/client-fixtures";

/**
 * Mutating endpoints must reject roles outside the permission matrix with 403
 * and the canonical { error: { code: "FORBIDDEN" } } envelope.
 */
describe("RBAC 403 on mutating endpoints (postgres-test)", () => {
  let app: FastifyInstance;
  let dbReady = false;
  let employeeToken: string;
  let engineerToken: string;

  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbReady = true;
    } catch {
      console.warn("Skipping RBAC 403 tests: postgres-test is not reachable.");
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
    const employee = await createTestUser({
      email: `emp-${uniqueName("e")}@inventory.local`,
      name: "Employee",
      role: AppUserRole.EMPLOYEE,
    });
    const engineer = await createTestUser({
      email: `eng-${uniqueName("e")}@inventory.local`,
      name: "Engineer",
      role: AppUserRole.IT_ENGINEER,
    });
    employeeToken = app.jwt.sign({ userId: employee.id, role: AppUserRole.EMPLOYEE });
    engineerToken = app.jwt.sign({ userId: engineer.id, role: AppUserRole.IT_ENGINEER });
  });

  async function expectForbidden(method: "POST" | "PATCH" | "DELETE", url: string, token: string, payload?: object) {
    const res = await app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(res.json().error.message).toBeTruthy();
  }

  it("POST /clients as IT_ENGINEER → 403", async () => {
    await expectForbidden("POST", "/api/v1/clients", engineerToken, {
      name: uniqueName("Site"),
      currentLocation: "CRL Delhi",
    });
  });

  it("POST /devices (allot) as EMPLOYEE → 403", async () => {
    await expectForbidden("POST", "/api/v1/devices", employeeToken, {
      clientId: randomUUID(),
      assetTag: uniqueName("TAG"),
      assignment: {
        userName: "U",
        userPhone: "1",
        userEmail: "u@x.com",
        department: "D",
        managerName: "M",
        managerPhone: "2",
        managerEmail: "m@x.com",
      },
    });
  });

  it("POST /users as IT_ENGINEER → 403", async () => {
    await expectForbidden("POST", "/api/v1/users", engineerToken, {
      name: "X",
      email: `x-${uniqueName("u")}@inventory.local`,
      password: "Password123!",
      role: AppUserRole.EMPLOYEE,
    });
  });

  it("POST /other-network-devices as EMPLOYEE → 403", async () => {
    await expectForbidden("POST", "/api/v1/other-network-devices", employeeToken, {
      clientId: randomUUID(),
      type: "KEYBOARD",
      name: "Screen",
    });
  });

  it("GET /audit-logs as EMPLOYEE → 403", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/audit-logs",
      headers: { authorization: `Bearer ${employeeToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
  });

  it("GET /notifications as EMPLOYEE → 403", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/notifications",
      headers: { authorization: `Bearer ${employeeToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
  });
});

describe("QR one-per-device DB invariant (postgres-test)", () => {
  let dbReady = false;

  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbReady = true;
    } catch {
      console.warn("Skipping QR unique tests: postgres-test is not reachable.");
    }
  });

  beforeEach(async (context) => {
    if (!dbReady) {
      context.skip();
      return;
    }
    await resetClientTestData();
  });

  it("rejects a second QrCode row for the same deviceId at the DB layer", async () => {
    const client = await prisma.client.create({
      data: { name: uniqueName("Site"), currentLocation: "CRL Delhi" },
    });
    const device = await prisma.device.create({
      data: { clientId: client.id, assetTag: uniqueName("TAG") },
    });
    await prisma.qrCode.create({
      data: { deviceId: device.id, qrValue: `INV:${device.assetTag}` },
    });

    await expect(
      prisma.qrCode.create({
        data: { deviceId: device.id, qrValue: `INV:DUP-${device.assetTag}` },
      }),
    ).rejects.toMatchObject({ code: "P2002" } satisfies Partial<Prisma.PrismaClientKnownRequestError>);
  });
});
