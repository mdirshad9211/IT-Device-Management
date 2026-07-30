import type { FastifyInstance } from "fastify";

/**
 * Site Inventory: device CRUD, allotment, lifecycle state machine
 *
 * BOILERPLATE PLACEHOLDER — no business logic yet. This route exists only
 * to confirm the module is wired into the app and reachable. Replace with
 * real routes/controller calls as this module is built out.
 */
export default async function deviceRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/", async () => ({
    module: "device",
    status: "not_yet_implemented",
    note: "Site Inventory: device CRUD, allotment, lifecycle state machine",
  }));
}
