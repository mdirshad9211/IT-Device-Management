import { AppUserRole } from "@prisma/client";
import type { RbacAction, RbacEntity } from "./types";

const STAFF_EDIT: AppUserRole[] = [
  AppUserRole.SUPER_ADMIN,
  AppUserRole.DGN_IT_MANAGER,
  AppUserRole.SERVICE_MANAGER,
  AppUserRole.IT_ENGINEER,
];

const ADMIN_DELETE: AppUserRole[] = [AppUserRole.SUPER_ADMIN, AppUserRole.DGN_IT_MANAGER];

const ALL_ROLES: AppUserRole[] = [
  AppUserRole.SUPER_ADMIN,
  AppUserRole.DGN_IT_MANAGER,
  AppUserRole.SERVICE_MANAGER,
  AppUserRole.IT_ENGINEER,
  AppUserRole.CLIENT_MANAGER,
  AppUserRole.EMPLOYEE,
];

const CLIENT_MUTATORS: AppUserRole[] = [
  AppUserRole.SUPER_ADMIN,
  AppUserRole.DGN_IT_MANAGER,
  AppUserRole.SERVICE_MANAGER,
];

/**
 * Role × entity × action grants from SRS §1.4 / §3.5.
 *
 * CLIENT_MANAGER and EMPLOYEE are view-only at this layer. Scoped visibility
 * (own device vs. managed devices) is enforced by the self-service check, not
 * by extra matrix rows.
 */
export const PERMISSION_MATRIX: Record<RbacEntity, Record<RbacAction, readonly AppUserRole[]>> = {
  Device: {
    view: ALL_ROLES,
    edit: STAFF_EDIT,
    delete: ADMIN_DELETE,
  },
  OtherNetworkDevice: {
    view: ALL_ROLES,
    edit: STAFF_EDIT,
    delete: ADMIN_DELETE,
  },
  Client: {
    view: ALL_ROLES,
    edit: CLIENT_MUTATORS,
    delete: ADMIN_DELETE,
  },
};

export function roleHasPermission(role: AppUserRole, entity: RbacEntity, action: RbacAction): boolean {
  return PERMISSION_MATRIX[entity][action].includes(role);
}
