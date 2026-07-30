import type { FastifyInstance } from "fastify";

/**
 * Client/Site CRUD, location history, engineer assignment
 *
 * BOILERPLATE PLACEHOLDER — no business logic yet. This route exists only
 * to confirm the module is wired into the app and reachable. Replace with
 * real routes/controller calls as this module is built out.
 */
export default async function clientRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/", async () => ({
    module: "client",
    status: "not_yet_implemented",
    note: "Client/Site CRUD, location history, engineer assignment",
  }));
}
