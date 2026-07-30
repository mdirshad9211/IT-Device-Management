import type { FastifyInstance } from "fastify";

/**
 * Admin-only AppUser account management (Super Admin only)
 *
 * BOILERPLATE PLACEHOLDER — no business logic yet. This route exists only
 * to confirm the module is wired into the app and reachable. Replace with
 * real routes/controller calls as this module is built out.
 */
export default async function userManagementRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/", async () => ({
    module: "user-management",
    status: "not_yet_implemented",
    note: "Admin-only AppUser account management (Super Admin only)",
  }));
}
