import type { FastifyInstance } from "fastify";

/**
 * Client-owned peripherals/network gear CRUD + device linking
 *
 * BOILERPLATE PLACEHOLDER — no business logic yet. This route exists only
 * to confirm the module is wired into the app and reachable. Replace with
 * real routes/controller calls as this module is built out.
 */
export default async function otherNetworkDeviceRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/", async () => ({
    module: "other-network-device",
    status: "not_yet_implemented",
    note: "Client-owned peripherals/network gear CRUD + device linking",
  }));
}
