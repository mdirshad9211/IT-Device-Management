export { AppUserRole, RBAC_ACTIONS, RBAC_ENTITIES, UNSCOPED_ROLES } from "./types";
export type { AccessContext, CurrentDeviceAssignmentScope, RbacAction, RbacEntity } from "./types";

export { DEFAULT_PERMISSION_MATRIX, PERMISSION_MATRIX, roleHasPermission, getEffectivePermissionMatrix } from "./permission-matrix";

export { assertRolePermission } from "./role-check";
export { assertClientScope } from "./client-scope-check";
export { assertSelfServiceScope } from "./self-service-scope-check";

export {
  clientScopeCheck,
  enforceAccess,
  rolePermissionCheck,
  selfServiceScopeCheck,
} from "./enforce-access";
export type { AccessCheck } from "./enforce-access";

export { requirePermission, requireRoles } from "./require-permission";
export { requireAppUserAuth } from "./require-app-user-auth";
