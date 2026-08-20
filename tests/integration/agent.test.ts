import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { AppUserRole, DeviceStatus } from "@prisma/client";
import { buildApp } from "../../src/app";
import { prisma } from "../../src/shared/kernel/prisma";
import type { DomainEventBus } from "../../src/shared/kernel/events";
import { hashAgentApiKey } from "../../src/modules/auth/agent-api-key";
import { createTestUser, resetClientTestData, uniqueName } from "./helpers/client-fixtures";

const AGENT_KEY = "test-site-agent-key";

describe("agent module (postgres-test)", () => {
  let app: FastifyInstance;
  let dbReady = false;
  let adminToken: string;
  let agentId: string;
  let deviceId: string;

  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbReady = true;
    } catch {
      console.warn("Skipping agent integration tests: postgres-test is not reachable (TEST_DATABASE_URL).");
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
    const device = await prisma.device.create({
      data: {
        clientId: client.id,
        assetTag: uniqueName("TAG"),
        cpu: "Intel i5",
        ram: "16 GB",
        storageUsedPercent: 40,
        status: DeviceStatus.ACTIVE,
        installedSoftware: ["Chrome"],
      },
    });
    const agent = await prisma.agent.create({
      data: {
        deviceId: device.id,
        clientId: client.id,
        version: "1.0.0",
        apiKeyHash: hashAgentApiKey(AGENT_KEY),
      },
    });
    deviceId = device.id;
    agentId = agent.id;
  });

  it("malformed payload does not corrupt Device data and writes zero history rows", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/agents/${agentId}/poll`,
      headers: { "x-agent-api-key": AGENT_KEY },
      payload: { cpu: 12, storageUsedPercent: "full" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");

    const device = await prisma.device.findUniqueOrThrow({ where: { id: deviceId } });
    expect(device.cpu).toBe("Intel i5");
    expect(device.storageUsedPercent).toBe(40);

    expect(await prisma.deviceSoftwareEvent.count({ where: { deviceId } })).toBe(0);
    expect(await prisma.deviceHardwareChangeEvent.count({ where: { deviceId } })).toBe(0);
    expect(await prisma.agentPollLog.count({ where: { agentId } })).toBe(0);
  });

  it("storage breach at exactly 80% triggers device.storage.threshold_breached", async () => {
    const eventBus = app.diContainer.resolve<DomainEventBus>("eventBus");
    const emit = vi.spyOn(eventBus, "emit");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/agents/${agentId}/poll`,
      headers: { "x-agent-api-key": AGENT_KEY },
      payload: { storageUsedPercent: 80 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().storageUsedPercent).toBe(80);

    const device = await prisma.device.findUniqueOrThrow({ where: { id: deviceId } });
    expect(device.cpu).toBe("Intel i5");
    expect(device.storageUsedPercent).toBe(80);

    expect(emit).toHaveBeenCalledWith(
      "device.storage.threshold_breached",
      expect.objectContaining({ entityId: deviceId, agentId, storageUsedPercent: 80 }),
    );
    emit.mockRestore();
  });

  it("deregister without the correct secret returns 403", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/agents/${agentId}/deregister`,
      headers: { "x-agent-api-key": AGENT_KEY },
      payload: { adminSecret: "definitely-not-the-secret" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
    expect(await prisma.agent.findUnique({ where: { id: agentId } })).not.toBeNull();
  });
});
