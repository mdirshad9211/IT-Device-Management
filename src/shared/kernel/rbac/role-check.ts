import { ForbiddenError } from "../errors";
import { roleHasPermission } from "./permission-matrix";
import type { RbacAction, RbacEntity } from "./types";
import { AppUserRole } from "@prisma/client";

/**
 * (a) Role check — PERMISSION_MATRIX lookup (SRS §3.5).
 *
 * Pure: does not inspect client assignments or DeviceAssignment links.
 */
export function assertRolePermission(role: AppUserRole, entity: RbacEntity, action: RbacAction): void {
  if (!roleHasPermission(role, entity, action)) {
    throw new ForbiddenError(`Role ${role} is not permitted to ${action} ${entity}`);
  }
}
