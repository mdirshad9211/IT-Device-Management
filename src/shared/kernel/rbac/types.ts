import { AppUserRole } from "@prisma/client";

export { AppUserRole };

/** Inventory entities covered by SRS §3.5 (view / edit / delete). */
export const RBAC_ENTITIES = ["Device", "OtherNetworkDevice", "Client"] as const;
export type RbacEntity = (typeof RBAC_ENTITIES)[number];

export const RBAC_ACTIONS = ["view", "edit", "delete"] as const;
export type RbacAction = (typeof RBAC_ACTIONS)[number];

export const UNSCOPED_ROLES: ReadonlySet<AppUserRole> = new Set([
  AppUserRole.SUPER_ADMIN,
  AppUserRole.DGN_IT_MANAGER,
  AppUserRole.SERVICE_MANAGER,
]);

export type CurrentDeviceAssignmentScope = {
  managerUserId: string | null;
  employeeUserId: string | null;
};

/** Shared context for composing the three authorization checks. */
export type AccessContext = {
  actorUserId: string;
  role: AppUserRole;
  entity: RbacEntity;
  action: RbacAction;
  targetClientId?: string;
  activeAssignedClientIds: string[];
  currentAssignment: CurrentDeviceAssignmentScope | null;
};
