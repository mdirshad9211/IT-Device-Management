import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import jwt from "@fastify/jwt";
import { randomUUID } from "node:crypto";

import { logger } from "./shared/kernel/logger";
import { prisma } from "./shared/kernel/prisma";
import errorHandlerPlugin from "./shared/http/plugins/error-handler";
import { registerSwagger } from "./shared/http/plugins/swagger";
import { buildContainer } from "./config/container";
import { env } from "./config/env";

import authRoutes from "./modules/auth/auth.routes";
import clientRoutes from "./modules/client/client.routes";
import deviceRoutes from "./modules/device/device.routes";
import agentRoutes, { agentDeviceRoutes } from "./modules/agent/agent.routes";
import qrRoutes from "./modules/qr/qr.routes";
import otherNetworkDeviceRoutes from "./modules/other-network-device/other-network-device.routes";
import notificationRoutes from "./modules/notification/notification.routes";
import auditRoutes from "./modules/audit/audit.routes";
import userManagementRoutes, {
  userManagementAssignmentRoutes,
} from "./modules/user-management/user-management.routes";
import rbacAdminRoutes from "./modules/admin/rbac-admin.routes";
import reportRoutes from "./modules/reports/report.routes";
import { loadPermissionMatrixFromDb } from "./shared/kernel/rbac/permission-store";

const startedAt = new Date();

/**
 * Builds (but does not start) a Fastify instance. Exported separately from
 * server.ts so integration tests can call buildApp().inject(...) without
 * binding a real port.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger,
    genReqId: () => randomUUID(),
  });

  // --- Core plugins ---
  await app.register(cors, { origin: true });
  await app.register(rateLimit, { max: 200, timeWindow: "1 minute" });
  await app.register(jwt, { secret: env.JWT_SECRET });
  await app.register(errorHandlerPlugin);
  await registerSwagger(app as unknown as FastifyInstance);

  // --- DI container, available on every request as request.container ---
  await loadPermissionMatrixFromDb(prisma);
  const container = buildContainer();
  // Subscribe Audit + Notification listeners once per app instance.
  container.resolve("auditListener");
  container.resolve("notificationListener");
  app.decorate("diContainer", container);
  app.decorateRequest("container", null);
  app.addHook("onRequest", async (request) => {
    request.container = container;
  });

  // --- Health check: DB + process metadata ---
  app.get("/health", async (_request, reply) => {
    const health = {
      status: "ok" as "ok" | "degraded",
      service: "inventory-backend",
      env: env.NODE_ENV,
      uptimeSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
      checkedAt: new Date().toISOString(),
      db: "unknown" as "ok" | "unreachable" | "unknown",
      docs: "/docs",
    };

    try {
      await Promise.race([
        prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error("db ping timeout")), 1000);
        }),
      ]);
      health.db = "ok";
    } catch {
      health.db = "unreachable";
    }

    const isHealthy = health.db === "ok";
    health.status = isHealthy ? "ok" : "degraded";
    reply.status(isHealthy ? 200 : 503).send(health);
  });

  // --- Module routes ---
  await app.register(authRoutes, { prefix: "/api/v1/auth" });
  await app.register(clientRoutes, { prefix: "/api/v1/clients" });
  await app.register(agentDeviceRoutes, { prefix: "/api/v1/devices" });
  await app.register(deviceRoutes, { prefix: "/api/v1/devices" });
  await app.register(agentRoutes, { prefix: "/api/v1/agents" });
  await app.register(qrRoutes, { prefix: "/api/v1/qr" });
  await app.register(otherNetworkDeviceRoutes, { prefix: "/api/v1/other-network-devices" });
  await app.register(notificationRoutes, { prefix: "/api/v1/notifications" });
  await app.register(auditRoutes, { prefix: "/api/v1/audit-logs" });
  await app.register(userManagementRoutes, { prefix: "/api/v1/users" });
  await app.register(userManagementAssignmentRoutes, { prefix: "/api/v1/devices" });
  await app.register(rbacAdminRoutes, { prefix: "/api/v1/admin" });
  await app.register(reportRoutes, { prefix: "/api/v1/reports" });

  return app as unknown as FastifyInstance;
}
