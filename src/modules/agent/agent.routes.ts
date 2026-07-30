import type { FastifyInstance } from "fastify";

/**
 * Agent poll ingestion, telemetry diffing, storage-threshold alerts
 *
 * BOILERPLATE PLACEHOLDER — no business logic yet. This route exists only
 * to confirm the module is wired into the app and reachable. Replace with
 * real routes/controller calls as this module is built out.
 */
export default async function agentRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/", async () => ({
    module: "agent",
    status: "not_yet_implemented",
    note: "Agent poll ingestion, telemetry diffing, storage-threshold alerts",
  }));
}
