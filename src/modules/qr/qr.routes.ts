import type { FastifyInstance } from "fastify";

/**
 * QR generation (once per device), rendering, scan resolution.
 *
 * `QrService.generateQrForDevice()` is implemented and called from Device
 * allotment (same Prisma transaction). HTTP render/scan endpoints are Prompt 7
 * and are intentionally still a stub here.
 */
export default async function qrRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/", async () => ({
    module: "qr",
    status: "not_yet_implemented",
    note: "QR generation (once per device), rendering, scan resolution",
  }));
}
