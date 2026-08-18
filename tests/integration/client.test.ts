import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { AppUserRole } from "@prisma/client";
import { buildApp } from "../../src/app";
import { prisma } from "../../src/shared/kernel/prisma";
import { createTestUser, resetClientTestData, uniqueName } from "./helpers/client-fixtures";

describe("client module (postgres-test)", () => {
  let app: FastifyInstance;
  let dbReady = false;
  let adminId: string;
  let engineerId: string;
  let adminToken: string;
  let engineerToken: string;

  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbReady = true;
    } catch {
      console.warn("Skipping client integration tests: postgres-test is not reachable (TEST_DATABASE_URL).");
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
    const engineer = await createTestUser({
      email: `eng-${uniqueName("e")}@inventory.local`,
      name: "Site Engineer",
      role: AppUserRole.IT_ENGINEER,
    });
    adminId = admin.id;
    engineerId = engineer.id;
    adminToken = app.jwt.sign({ userId: adminId, role: AppUserRole.SUPER_ADMIN });
    engineerToken = app.jwt.sign({ userId: engineerId, role: AppUserRole.IT_ENGINEER });
  });

  it("creates a client with an initial current SiteLocation", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/clients",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: uniqueName("CRL"), currentLocation: "CRL Delhi" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.currentLocation).toBe("CRL Delhi");
    expect(body.locations).toHaveLength(1);
    expect(body.locations[0].isCurrent).toBe(true);
  });

  it("lists all clients for SUPER_ADMIN", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v1/clients",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: uniqueName("A"), currentLocation: "Delhi" },
    });
    await app.inject({
      method: "POST",
      url: "/api/v1/clients",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: uniqueName("B"), currentLocation: "Mumbai" },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/clients?page=1&pageSize=20",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(2);
    expect(res.json().items).toHaveLength(2);
  });

  it("does not list a client the engineer is not assigned to", async () => {
    const assigned = await app.inject({
      method: "POST",
      url: "/api/v1/clients",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: uniqueName("Assigned"), currentLocation: "Delhi" },
    });
    const other = await app.inject({
      method: "POST",
      url: "/api/v1/clients",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: uniqueName("Other"), currentLocation: "Mumbai" },
    });
    expect(assigned.statusCode).toBe(201);
    expect(other.statusCode).toBe(201);

    const assignedId = assigned.json().id as string;
    const otherId = other.json().id as string;

    const assignRes = await app.inject({
      method: "POST",
      url: `/api/v1/clients/${assignedId}/engineers`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { userId: engineerId },
    });
    expect(assignRes.statusCode).toBe(201);

    const listRes = await app.inject({
      method: "GET",
      url: "/api/v1/clients",
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    const ids = (listRes.json().items as Array<{ id: string }>).map((item) => item.id);
    expect(ids).toContain(assignedId);
    expect(ids).not.toContain(otherId);
    expect(listRes.json().total).toBe(1);
  });

  it("PATCH location appends SiteLocation and flips isCurrent without Device writes", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/clients",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: uniqueName("Move"), currentLocation: "CRL Delhi" },
    });
    const clientId = created.json().id as string;

    const patched = await app.inject({
      method: "PATCH",
      url: `/api/v1/clients/${clientId}/location`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { currentLocation: "CRL Mumbai" },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().currentLocation).toBe("CRL Mumbai");
    const locations = patched.json().locations as Array<{ locationName: string; isCurrent: boolean }>;
    expect(locations).toHaveLength(2);
    expect(locations.filter((row) => row.isCurrent)).toHaveLength(1);
    expect(locations.find((row) => row.isCurrent)?.locationName).toBe("CRL Mumbai");

    const deviceCount = await prisma.device.count({ where: { clientId } });
    expect(deviceCount).toBe(0);
  });

  it("off-boards an engineer without deactivating the AppUser", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/clients",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: uniqueName("Offboard"), currentLocation: "Delhi" },
    });
    const clientId = created.json().id as string;

    await app.inject({
      method: "POST",
      url: `/api/v1/clients/${clientId}/engineers`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { userId: engineerId },
    });

    const offboard = await app.inject({
      method: "DELETE",
      url: `/api/v1/clients/${clientId}/engineers/${engineerId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(offboard.statusCode).toBe(200);
    expect(offboard.json().isActive).toBe(false);
    expect(offboard.json().unassignedAt).toBeTruthy();

    const user = await prisma.appUser.findUnique({ where: { id: engineerId } });
    expect(user?.isActive).toBe(true);

    const assignment = await prisma.engineerAssignment.findUnique({ where: { id: offboard.json().id } });
    expect(assignment?.isActive).toBe(false);
  });
});
