import type { FastifyInstance } from "fastify";
import { AppUserRole } from "@prisma/client";
import { requireAppUserAuth, requireRoles } from "../../shared/kernel/rbac";
import type { AuditController } from "./audit.controller";

/**
 * Immutable audit log of every create/update/delete across modules.
 */
export default async function auditRoutes(fastify: FastifyInstance): Promise<void> {
  const staff = {
    onRequest: [
      requireAppUserAuth,
      requireRoles(AppUserRole.SUPER_ADMIN, AppUserRole.DGN_IT_MANAGER),
    ],
  };

  fastify.get("/", staff, async (request, reply) => {
    const controller = request.container.resolve<AuditController>("auditController");
    return controller.list(request, reply);
  });
}
