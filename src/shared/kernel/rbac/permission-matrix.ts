import { AppUserRole } from "@prisma/client";
import type { RbacAction, RbacEntity } from "./types";
import { RBAC_ACTIONS, RBAC_ENTITIES } from "./types";

const STAFF_EDIT: AppUserRole[] = [
  AppUserRole.SUPER_ADMIN,
  AppUserRole.DGN_IT_MANAGER,
  AppUserRole.SERVICE_MANAGER,
  AppUserRole.IT_ENGINEER,
];

/** SRS §3.5 — Site Inventory delete is DGN IT Manager (SUPER_ADMIN always bypasses). */
const ADMIN_DELETE: AppUserRole[] = [AppUserRole.DGN_IT_MANAGER];

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

export type PermissionMatrix = Record<RbacEntity, Record<RbacAction, readonly AppUserRole[]>>;

/**
 * Default Role × entity × action grants from SRS §1.4 / §3.5.
 * SUPER_ADMIN may override at runtime via SystemSetting `rbac_matrix`.
 */
export const DEFAULT_PERMISSION_MATRIX: PermissionMatrix = {
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

/** @deprecated alias — prefer DEFAULT_PERMISSION_MATRIX */
export const PERMISSION_MATRIX = DEFAULT_PERMISSION_MATRIX;

let runtimeOverride: PermissionMatrix | null = null;

export function getEffectivePermissionMatrix(): PermissionMatrix {
  return runtimeOverride ?? DEFAULT_PERMISSION_MATRIX;
}

export function setRuntimePermissionMatrix(matrix: PermissionMatrix | null): void {
  runtimeOverride = matrix;
}

export function roleHasPermission(role: AppUserRole, entity: RbacEntity, action: RbacAction): boolean {
  // SUPER_ADMIN always retains full control (including editing the matrix itself).
  if (role === AppUserRole.SUPER_ADMIN) return true;
  return getEffectivePermissionMatrix()[entity][action].includes(role);
}

export function serializePermissionMatrix(matrix: PermissionMatrix = getEffectivePermissionMatrix()) {
  const out: Record<string, Record<string, AppUserRole[]>> = {};
  for (const entity of RBAC_ENTITIES) {
    out[entity] = {};
    for (const action of RBAC_ACTIONS) {
      out[entity][action] = [...matrix[entity][action]];
    }
  }
  return out;
}

export function parsePermissionMatrix(raw: unknown): PermissionMatrix {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid permission matrix");
  }
  const obj = raw as Record<string, Record<string, unknown>>;
  const matrix = {} as PermissionMatrix;
  for (const entity of RBAC_ENTITIES) {
    matrix[entity] = {} as Record<RbacAction, readonly AppUserRole[]>;
    for (const action of RBAC_ACTIONS) {
      const roles = obj[entity]?.[action];
      if (!Array.isArray(roles) || !roles.every((r) => typeof r === "string")) {
        throw new Error(`Invalid roles for ${entity}.${action}`);
      }
      matrix[entity][action] = roles as AppUserRole[];
    }
  }
  return matrix;
}
