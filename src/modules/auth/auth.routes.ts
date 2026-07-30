import type { FastifyInstance } from "fastify";

/**
 * Login (AppUser JWT) and Agent API-key authentication
 *
 * BOILERPLATE PLACEHOLDER — no business logic yet. This route exists only
 * to confirm the module is wired into the app and reachable. Replace with
 * real routes/controller calls as this module is built out.
 */
export default async function authRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/", async () => ({
    module: "auth",
    status: "not_yet_implemented",
    note: "Login (AppUser JWT) and Agent API-key authentication",
  }));
}
