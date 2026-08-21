import type { FastifyInstance } from "fastify";
import { AppUserRole } from "@prisma/client";
import { z } from "zod";
import { requireAppUserAuth, requireRoles } from "../../shared/kernel/rbac";
import { RBAC_ACTIONS, RBAC_ENTITIES } from "../../shared/kernel/rbac/types";
import {
  DEFAULT_PERMISSION_MATRIX,
  getEffectivePermissionMatrix,
  parsePermissionMatrix,
  serializePermissionMatrix,
  setRuntimePermissionMatrix,
} from "../../shared/kernel/rbac/permission-matrix";
import { RBAC_MATRIX_SETTING_KEY, savePermissionMatrixToDb } from "../../shared/kernel/rbac/permission-store";
import { parseBody } from "../../shared/http/validate";
import { prisma } from "../../shared/kernel/prisma";

const matrixSchema = z.record(z.record(z.array(z.nativeEnum(AppUserRole))));

/**
 * Super Admin (and DGN IT Manager for read) permission matrix management.
 */
export default async function rbacAdminRoutes(fastify: FastifyInstance): Promise<void> {
  const read = {
    onRequest: [
      requireAppUserAuth,
      requireRoles(AppUserRole.SUPER_ADMIN, AppUserRole.DGN_IT_MANAGER, AppUserRole.SERVICE_MANAGER),
    ],
  };
  const write = {
    onRequest: [requireAppUserAuth, requireRoles(AppUserRole.SUPER_ADMIN)],
  };

  fastify.get("/permissions", read, async (_request, reply) => {
    const effective = getEffectivePermissionMatrix();
    return reply.status(200).send({
      entities: [...RBAC_ENTITIES],
      actions: [...RBAC_ACTIONS],
      roles: Object.values(AppUserRole),
      defaults: serializePermissionMatrix(DEFAULT_PERMISSION_MATRIX),
      matrix: serializePermissionMatrix(effective),
      isCustomized: JSON.stringify(serializePermissionMatrix(effective)) !== JSON.stringify(serializePermissionMatrix(DEFAULT_PERMISSION_MATRIX)),
    });
  });

  fastify.put("/permissions", write, async (request, reply) => {
    const body = parseBody(z.object({ matrix: matrixSchema }), request);
    const matrix = parsePermissionMatrix(body.matrix);
    await savePermissionMatrixToDb(prisma, matrix, request.user.userId);
    return reply.status(200).send({
      matrix: serializePermissionMatrix(matrix),
      isCustomized: true,
    });
  });

  fastify.post("/permissions/reset", write, async (_request, reply) => {
    await prisma.systemSetting.deleteMany({ where: { key: RBAC_MATRIX_SETTING_KEY } });
    setRuntimePermissionMatrix(null);
    return reply.status(200).send({
      matrix: serializePermissionMatrix(DEFAULT_PERMISSION_MATRIX),
      isCustomized: false,
    });
  });
}
