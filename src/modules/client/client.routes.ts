import type { FastifyInstance } from "fastify";
import { requireAppUserAuth, requirePermission } from "../../shared/kernel/rbac";
import type { ClientController } from "./client.controller";

/**
 * Client/Site CRUD, location history (FR-MOVE-01), engineer assignment.
 */
export default async function clientRoutes(fastify: FastifyInstance): Promise<void> {
  const viewClient = {
    onRequest: [requireAppUserAuth, requirePermission("Client", "view")],
  };
  const editClient = {
    onRequest: [requireAppUserAuth, requirePermission("Client", "edit")],
  };

  fastify.get("/", viewClient, async (request, reply) => {
    const controller = request.container.resolve<ClientController>("clientController");
    return controller.list(request, reply);
  });

  fastify.post("/", editClient, async (request, reply) => {
    const controller = request.container.resolve<ClientController>("clientController");
    return controller.create(request, reply);
  });

  fastify.patch("/:id/location", editClient, async (request, reply) => {
    const controller = request.container.resolve<ClientController>("clientController");
    return controller.changeLocation(request, reply);
  });

  fastify.post("/:id/engineers", editClient, async (request, reply) => {
    const controller = request.container.resolve<ClientController>("clientController");
    return controller.assignEngineer(request, reply);
  });

  fastify.delete("/:id/engineers/:userId", editClient, async (request, reply) => {
    const controller = request.container.resolve<ClientController>("clientController");
    return controller.offboardEngineer(request, reply);
  });
}
