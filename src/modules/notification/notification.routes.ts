import type { FastifyInstance } from "fastify";
import { AppUserRole } from "@prisma/client";
import { requireAppUserAuth, requireRoles } from "../../shared/kernel/rbac";
import type { NotificationController } from "./notification.controller";

/**
 * Email notifications for allotment, storage alerts, discard warnings.
 */
export default async function notificationRoutes(fastify: FastifyInstance): Promise<void> {
  const staff = {
    onRequest: [
      requireAppUserAuth,
      requireRoles(AppUserRole.SUPER_ADMIN, AppUserRole.DGN_IT_MANAGER),
    ],
  };

  fastify.get("/", staff, async (request, reply) => {
    const controller = request.container.resolve<NotificationController>("notificationController");
    return controller.list(request, reply);
  });
}
