import type { onRequestHookHandler } from "fastify";
import { ForbiddenError, UnauthorizedError } from "../errors";
import { assertRolePermission } from "./role-check";
import type { RbacAction, RbacEntity } from "./types";
import { AppUserRole } from "@prisma/client";

/**
 * Fastify `onRequest` hook: 403 if the authenticated AppUser's role is not in
 * PERMISSION_MATRIX for `(entity, action)`. Must run *after* `requireAppUserAuth`.
 *
 * Client-scope and self-service checks are intentionally not inside this hook —
 * they need a loaded resource and stay composable at the service layer.
 */
export function requirePermission(entity: RbacEntity, action: RbacAction): onRequestHookHandler {
  return async (request) => {
    const role = request.user?.role;
    if (!role) {
      throw new UnauthorizedError("Authentication required");
    }
    assertRolePermission(role, entity, action);
  };
}

/**
 * Role allow-list for endpoints that are not Device/OtherNetworkDevice/Client
 * (e.g. AppUser administration — SUPER_ADMIN only).
 */
export function requireRoles(...allowed: AppUserRole[]): onRequestHookHandler {
  return async (request) => {
    const role = request.user?.role;
    if (!role) {
      throw new UnauthorizedError("Authentication required");
    }
    if (!allowed.includes(role)) {
      throw new ForbiddenError(`Role ${role} is not permitted to access this resource`);
    }
  };
}
