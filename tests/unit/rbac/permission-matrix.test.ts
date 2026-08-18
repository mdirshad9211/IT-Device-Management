import { describe, expect, it, vi } from "vitest";
import { AppUserRole } from "@prisma/client";
import { ForbiddenError } from "../../../src/shared/kernel/errors";
import {
  PERMISSION_MATRIX,
  RBAC_ACTIONS,
  RBAC_ENTITIES,
  assertClientScope,
  assertRolePermission,
  assertSelfServiceScope,
  clientScopeCheck,
  enforceAccess,
  roleHasPermission,
  rolePermissionCheck,
  selfServiceScopeCheck,
  type AccessContext,
} from "../../../src/shared/kernel/rbac";

const STAFF_ROLES = [
  AppUserRole.SUPER_ADMIN,
  AppUserRole.DGN_IT_MANAGER,
  AppUserRole.SERVICE_MANAGER,
  AppUserRole.IT_ENGINEER,
] as const;

const SELF_SERVICE_ROLES = [AppUserRole.CLIENT_MANAGER, AppUserRole.EMPLOYEE] as const;

describe("PERMISSION_MATRIX (SRS §3.5)", () => {
  it("grants CLIENT_MANAGER and EMPLOYEE view only on every entity", () => {
    for (const role of SELF_SERVICE_ROLES) {
      for (const entity of RBAC_ENTITIES) {
        expect(roleHasPermission(role, entity, "view")).toBe(true);
        expect(roleHasPermission(role, entity, "edit")).toBe(false);
        expect(roleHasPermission(role, entity, "delete")).toBe(false);
      }
    }
  });

  it("never lists CLIENT_MANAGER or EMPLOYEE under edit or delete", () => {
    for (const entity of RBAC_ENTITIES) {
      for (const action of ["edit", "delete"] as const) {
        expect(PERMISSION_MATRIX[entity][action]).not.toContain(AppUserRole.CLIENT_MANAGER);
        expect(PERMISSION_MATRIX[entity][action]).not.toContain(AppUserRole.EMPLOYEE);
      }
    }
  });

  it("allows staff to view and edit Device and OtherNetworkDevice", () => {
    for (const role of STAFF_ROLES) {
      expect(roleHasPermission(role, "Device", "view")).toBe(true);
      expect(roleHasPermission(role, "Device", "edit")).toBe(true);
      expect(roleHasPermission(role, "OtherNetworkDevice", "view")).toBe(true);
      expect(roleHasPermission(role, "OtherNetworkDevice", "edit")).toBe(true);
    }
  });

  it("restricts delete to SUPER_ADMIN and DGN_IT_MANAGER", () => {
    for (const entity of RBAC_ENTITIES) {
      expect(roleHasPermission(AppUserRole.SUPER_ADMIN, entity, "delete")).toBe(true);
      expect(roleHasPermission(AppUserRole.DGN_IT_MANAGER, entity, "delete")).toBe(true);
      expect(roleHasPermission(AppUserRole.SERVICE_MANAGER, entity, "delete")).toBe(false);
      expect(roleHasPermission(AppUserRole.IT_ENGINEER, entity, "delete")).toBe(false);
    }
  });

  it("covers every entity/action pair in the matrix", () => {
    for (const entity of RBAC_ENTITIES) {
      for (const action of RBAC_ACTIONS) {
        expect(PERMISSION_MATRIX[entity][action].length).toBeGreaterThan(0);
      }
    }
  });
});

describe("composable authorization checks", () => {
  const employeeEditDevice: AccessContext = {
    actorUserId: "emp-1",
    role: AppUserRole.EMPLOYEE,
    entity: "Device",
    action: "edit",
    targetClientId: "client-1",
    activeAssignedClientIds: [],
    currentAssignment: { managerUserId: "mgr-1", employeeUserId: "emp-1" },
  };

  it("rejects EMPLOYEE PATCH (edit) at the role-check layer before self-service runs", () => {
    const client = vi.fn(clientScopeCheck);
    const selfService = vi.fn(selfServiceScopeCheck);

    expect(() =>
      enforceAccess(employeeEditDevice, [rolePermissionCheck, client, selfService]),
    ).toThrow(ForbiddenError);

    expect(client).not.toHaveBeenCalled();
    expect(selfService).not.toHaveBeenCalled();
  });

  it("still invokes self-service after a passing EMPLOYEE view role check", () => {
    const selfService = vi.fn(selfServiceScopeCheck);
    const ctx: AccessContext = { ...employeeEditDevice, action: "view" };

    enforceAccess(ctx, [rolePermissionCheck, clientScopeCheck, selfService]);
    expect(selfService).toHaveBeenCalledOnce();
  });

  it("treats SUPER_ADMIN, DGN_IT_MANAGER, and SERVICE_MANAGER as unscoped", () => {
    for (const role of [
      AppUserRole.SUPER_ADMIN,
      AppUserRole.DGN_IT_MANAGER,
      AppUserRole.SERVICE_MANAGER,
    ]) {
      expect(() =>
        assertClientScope({ role, targetClientId: "other-client", activeAssignedClientIds: [] }),
      ).not.toThrow();
    }
  });

  it("allows IT_ENGINEER when any active assignment matches the target client", () => {
    expect(() =>
      assertClientScope({
        role: AppUserRole.IT_ENGINEER,
        targetClientId: "client-b",
        activeAssignedClientIds: ["client-a", "client-b", "client-c"],
      }),
    ).not.toThrow();
  });

  it("rejects IT_ENGINEER when no active assignment matches the target client", () => {
    expect(() =>
      assertClientScope({
        role: AppUserRole.IT_ENGINEER,
        targetClientId: "client-z",
        activeAssignedClientIds: ["client-a", "client-b"],
      }),
    ).toThrow(ForbiddenError);
  });

  it("allows CLIENT_MANAGER only when managerUserId matches the actor", () => {
    expect(() =>
      assertSelfServiceScope({
        role: AppUserRole.CLIENT_MANAGER,
        actorUserId: "mgr-1",
        currentAssignment: { managerUserId: "mgr-1", employeeUserId: "emp-1" },
      }),
    ).not.toThrow();

    expect(() =>
      assertSelfServiceScope({
        role: AppUserRole.CLIENT_MANAGER,
        actorUserId: "mgr-1",
        currentAssignment: { managerUserId: "mgr-2", employeeUserId: "mgr-1" },
      }),
    ).toThrow(ForbiddenError);
  });

  it("never lets an EMPLOYEE see another employee's assignment", () => {
    expect(() =>
      assertSelfServiceScope({
        role: AppUserRole.EMPLOYEE,
        actorUserId: "emp-1",
        currentAssignment: { managerUserId: "mgr-1", employeeUserId: "emp-2" },
      }),
    ).toThrow(ForbiddenError);
  });

  it("throws ForbiddenError from the role check for EMPLOYEE edit without needing assignment data", () => {
    expect(() => assertRolePermission(AppUserRole.EMPLOYEE, "Device", "edit")).toThrow(ForbiddenError);
  });
});
