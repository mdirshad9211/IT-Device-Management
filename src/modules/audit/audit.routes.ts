import type { FastifyInstance } from "fastify";

/**
 * Immutable audit log of every create/update/delete across modules
 *
 * BOILERPLATE PLACEHOLDER — no business logic yet. This route exists only
 * to confirm the module is wired into the app and reachable. Replace with
 * real routes/controller calls as this module is built out.
 */
export default async function auditRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/", async () => ({
    module: "audit",
    status: "not_yet_implemented",
    note: "Immutable audit log of every create/update/delete across modules",
  }));
}
