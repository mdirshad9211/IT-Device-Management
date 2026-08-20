import type { FastifyInstance } from "fastify";
import { requireAppUserAuth, requirePermission } from "../../shared/kernel/rbac";
import type { QrController } from "./qr.controller";

/**
 * QR generation (allotment-only), rendering, scan resolve, on-demand poll (SRS §3.3).
 */
export default async function qrRoutes(fastify: FastifyInstance): Promise<void> {
  const viewDevice = {
    onRequest: [requireAppUserAuth, requirePermission("Device", "view")],
  };
  const editDevice = {
    onRequest: [requireAppUserAuth, requirePermission("Device", "edit")],
  };

  fastify.get("/resolve/:qrValue", viewDevice, async (request, reply) => {
    const controller = request.container.resolve<QrController>("qrController");
    return controller.resolve(request, reply);
  });

  fastify.get("/:deviceId/image", viewDevice, async (request, reply) => {
    const controller = request.container.resolve<QrController>("qrController");
    return controller.image(request, reply);
  });

  fastify.post("/:deviceId/run-poll", editDevice, async (request, reply) => {
    const controller = request.container.resolve<QrController>("qrController");
    return controller.runPoll(request, reply);
  });
}
