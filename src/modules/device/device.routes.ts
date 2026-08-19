import type { FastifyInstance } from "fastify";
import { requireAppUserAuth, requirePermission } from "../../shared/kernel/rbac";
import type { DeviceController } from "./device.controller";

/**
 * Site Inventory: allotment (SRS §3.2), CRUD, user-on-device change, lifecycle (LLD §4).
 */
export default async function deviceRoutes(fastify: FastifyInstance): Promise<void> {
  const viewDevice = {
    onRequest: [requireAppUserAuth, requirePermission("Device", "view")],
  };
  const editDevice = {
    onRequest: [requireAppUserAuth, requirePermission("Device", "edit")],
  };

  fastify.get("/manager-lookup", editDevice, async (request, reply) => {
    const controller = request.container.resolve<DeviceController>("deviceController");
    return controller.lookupManagers(request, reply);
  });

  fastify.get("/", viewDevice, async (request, reply) => {
    const controller = request.container.resolve<DeviceController>("deviceController");
    return controller.list(request, reply);
  });

  fastify.post("/", editDevice, async (request, reply) => {
    const controller = request.container.resolve<DeviceController>("deviceController");
    return controller.allot(request, reply);
  });

  fastify.get("/:id/history/software", viewDevice, async (request, reply) => {
    const controller = request.container.resolve<DeviceController>("deviceController");
    return controller.softwareHistory(request, reply);
  });

  fastify.get("/:id/history/hardware", viewDevice, async (request, reply) => {
    const controller = request.container.resolve<DeviceController>("deviceController");
    return controller.hardwareHistory(request, reply);
  });

  fastify.get("/:id", viewDevice, async (request, reply) => {
    const controller = request.container.resolve<DeviceController>("deviceController");
    return controller.get(request, reply);
  });

  fastify.patch("/:id", editDevice, async (request, reply) => {
    const controller = request.container.resolve<DeviceController>("deviceController");
    return controller.update(request, reply);
  });

  fastify.post("/:id/assignments", editDevice, async (request, reply) => {
    const controller = request.container.resolve<DeviceController>("deviceController");
    return controller.changeAssignment(request, reply);
  });

  fastify.post("/:id/lifecycle", editDevice, async (request, reply) => {
    const controller = request.container.resolve<DeviceController>("deviceController");
    return controller.transition(request, reply);
  });
}
