import { AppUserRole } from "@prisma/client";
import { ForbiddenError } from "../errors";
import type { CurrentDeviceAssignmentScope } from "./types";

/**
 * (c) Self-service scope check (SRS §1.4).
 *
 * CLIENT_MANAGER: the device's *current* DeviceAssignment.managerUserId must equal
 * the requester. EMPLOYEE: must equal employeeUserId. Employees are never
 * cross-visible. Other roles skip this check.
 */
export function assertSelfServiceScope(input: {
  role: AppUserRole;
  actorUserId: string;
  currentAssignment: CurrentDeviceAssignmentScope | null;
}): void {
  if (input.role !== AppUserRole.CLIENT_MANAGER && input.role !== AppUserRole.EMPLOYEE) {
    return;
  }

  if (!input.currentAssignment) {
    throw new ForbiddenError("No current device assignment is available for self-service access");
  }

  if (input.role === AppUserRole.CLIENT_MANAGER) {
    if (input.currentAssignment.managerUserId !== input.actorUserId) {
      throw new ForbiddenError("Client manager may only access devices they currently manage");
    }
    return;
  }

  if (input.currentAssignment.employeeUserId !== input.actorUserId) {
    throw new ForbiddenError("Employee may only access their own currently assigned device");
  }
}
