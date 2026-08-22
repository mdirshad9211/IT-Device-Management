import type { FastifyInstance } from "fastify";
import { requireAgentAuth } from "../auth/auth.hooks";
import { requireAppUserAuth, requirePermission } from "../../shared/kernel/rbac";
import type { AgentController } from "./agent.controller";

/**
 * Agent poll ingestion, telemetry history, deregister (SRS §3.1).
 */
export default async function agentRoutes(fastify: FastifyInstance): Promise<void> {
  const agentAuth = { onRequest: [requireAgentAuth] };

  fastify.post("/:agentId/poll", agentAuth, async (request, reply) => {
    const controller = request.container.resolve<AgentController>("agentController");
    return controller.poll(request, reply);
  });

  fastify.post(
    "/:agentId/deregister",
    {
      ...agentAuth,
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "15 minutes",
        },
      },
    },
    async (request, reply) => {
      const controller = request.container.resolve<AgentController>("agentController");
      return controller.deregister(request, reply);
    },
  );
}

/**
 * Installer download token lives under /api/v1/devices (allotment/ops UI)
 * but is owned by the Agent module.
 */
export async function agentDeviceRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    "/download-agent",
    { onRequest: [requireAppUserAuth, requirePermission("Device", "edit")] },
    async (request, reply) => {
      const controller = request.container.resolve<AgentController>("agentController");
      return controller.downloadAgent(request, reply);
    },
  );

  fastify.post(
    "/:deviceId/scan",
    { onRequest: [requireAppUserAuth, requirePermission("Device", "edit")] },
    async (request, reply) => {
      const controller = request.container.resolve<AgentController>("agentController");
      return controller.scanDevice(request, reply);
    },
  );

  fastify.get(
    "/:deviceId/poll-logs",
    { onRequest: [requireAppUserAuth, requirePermission("Device", "view")] },
    async (request, reply) => {
      const controller = request.container.resolve<AgentController>("agentController");
      return controller.listPollLogs(request, reply);
    },
  );
}
