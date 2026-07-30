import type { FastifyInstance } from "fastify";

/**
 * QR generation (once per device), rendering, scan resolution
 *
 * BOILERPLATE PLACEHOLDER — no business logic yet. This route exists only
 * to confirm the module is wired into the app and reachable. Replace with
 * real routes/controller calls as this module is built out.
 */
export default async function qrRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/", async () => ({
    module: "qr",
    status: "not_yet_implemented",
    note: "QR generation (once per device), rendering, scan resolution",
  }));
}
