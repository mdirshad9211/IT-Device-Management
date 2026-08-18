import type { FastifyInstance } from "fastify";
import { AppUserRole } from "@prisma/client";
import { requireAppUserAuth, requireRoles } from "../../shared/kernel/rbac";
import type { UserManagementController } from "./user-management.controller";

/**
 * Admin-only AppUser account management (GET/POST/PATCH /api/v1/users).
 */
export default async function userManagementRoutes(fastify: FastifyInstance): Promise<void> {
  const superAdminOnly = {
    onRequest: [requireAppUserAuth, requireRoles(AppUserRole.SUPER_ADMIN)],
  };

  fastify.get("/", superAdminOnly, async (request, reply) => {
    const controller = request.container.resolve<UserManagementController>("userManagementController");
    return controller.list(request, reply);
  });

  fastify.post("/", superAdminOnly, async (request, reply) => {
    const controller = request.container.resolve<UserManagementController>("userManagementController");
    return controller.create(request, reply);
  });

  fastify.patch("/:id", superAdminOnly, async (request, reply) => {
    const controller = request.container.resolve<UserManagementController>("userManagementController");
    return controller.update(request, reply);
  });
}

/**
 * Assignment account-linking lives under /api/v1/devices (owned by user-management,
 * not the Device module) so allotment never auto-creates logins.
 */
export async function userManagementAssignmentRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.patch(
    "/:deviceId/assignments/:assignmentId/link-account",
    {
      onRequest: [
        requireAppUserAuth,
        requireRoles(AppUserRole.SUPER_ADMIN, AppUserRole.DGN_IT_MANAGER),
      ],
    },
    async (request, reply) => {
      const controller = request.container.resolve<UserManagementController>("userManagementController");
      return controller.linkAccount(request, reply);
    },
  );
}
