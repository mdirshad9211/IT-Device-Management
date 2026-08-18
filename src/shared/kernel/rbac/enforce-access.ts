import { assertClientScope } from "./client-scope-check";
import { assertRolePermission } from "./role-check";
import { assertSelfServiceScope } from "./self-service-scope-check";
import type { AccessContext } from "./types";

export type AccessCheck = (ctx: AccessContext) => void;

export const rolePermissionCheck: AccessCheck = (ctx) => {
  assertRolePermission(ctx.role, ctx.entity, ctx.action);
};

export const clientScopeCheck: AccessCheck = (ctx) => {
  assertClientScope({
    role: ctx.role,
    targetClientId: ctx.targetClientId,
    activeAssignedClientIds: ctx.activeAssignedClientIds,
  });
};

export const selfServiceScopeCheck: AccessCheck = (ctx) => {
  assertSelfServiceScope({
    role: ctx.role,
    actorUserId: ctx.actorUserId,
    currentAssignment: ctx.currentAssignment,
  });
};

/**
 * Runs the three SRS checks in order and stops at the first failure.
 * Default order: role → client scope → self-service. Callers may pass a
 * subset (e.g. HTTP `requirePermission` only needs the role check).
 */
export function enforceAccess(
  ctx: AccessContext,
  checks: readonly AccessCheck[] = [rolePermissionCheck, clientScopeCheck, selfServiceScopeCheck],
): void {
  for (const check of checks) {
    check(ctx);
  }
}
