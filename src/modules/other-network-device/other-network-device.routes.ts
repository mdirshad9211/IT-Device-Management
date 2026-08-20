import type { FastifyInstance } from "fastify";
import { requireAppUserAuth, requirePermission } from "../../shared/kernel/rbac";
import type { OtherNetworkDeviceController } from "./other-network-device.controller";

/**
 * Other Network Devices — SRS §3.4 (7-field inventory, link to Site Device).
 */
export default async function otherNetworkDeviceRoutes(fastify: FastifyInstance): Promise<void> {
  const view = {
    onRequest: [requireAppUserAuth, requirePermission("OtherNetworkDevice", "view")],
  };
  const edit = {
    onRequest: [requireAppUserAuth, requirePermission("OtherNetworkDevice", "edit")],
  };
  const remove = {
    onRequest: [requireAppUserAuth, requirePermission("OtherNetworkDevice", "delete")],
  };

  fastify.get("/", view, async (request, reply) => {
    const controller = request.container.resolve<OtherNetworkDeviceController>("otherNetworkDeviceController");
    return controller.list(request, reply);
  });

  fastify.post("/", edit, async (request, reply) => {
    const controller = request.container.resolve<OtherNetworkDeviceController>("otherNetworkDeviceController");
    return controller.create(request, reply);
  });

  fastify.get("/:id", view, async (request, reply) => {
    const controller = request.container.resolve<OtherNetworkDeviceController>("otherNetworkDeviceController");
    return controller.get(request, reply);
  });

  fastify.patch("/:id", edit, async (request, reply) => {
    const controller = request.container.resolve<OtherNetworkDeviceController>("otherNetworkDeviceController");
    return controller.update(request, reply);
  });

  fastify.patch("/:id/link", edit, async (request, reply) => {
    const controller = request.container.resolve<OtherNetworkDeviceController>("otherNetworkDeviceController");
    return controller.link(request, reply);
  });

  fastify.delete("/:id", remove, async (request, reply) => {
    const controller = request.container.resolve<OtherNetworkDeviceController>("otherNetworkDeviceController");
    return controller.delete(request, reply);
  });
}
