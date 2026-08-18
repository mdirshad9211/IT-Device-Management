import { AppUserRole } from "@prisma/client";
import { ForbiddenError } from "../errors";
import { UNSCOPED_ROLES } from "./types";

/**
 * (b) Client scope check (SRS §1.4 / engineer assignment).
 *
 * SUPER_ADMIN, DGN_IT_MANAGER, and SERVICE_MANAGER are unscoped.
 * IT_ENGINEER must have at least one *active* EngineerAssignment whose clientId
 * matches the target (an engineer may have several active assignments).
 * CLIENT_MANAGER / EMPLOYEE are not constrained here — they use the self-service check.
 *
 * Callers pass already-loaded active client ids so this function stays pure (no I/O).
 */
export function assertClientScope(input: {
  role: AppUserRole;
  targetClientId?: string;
  activeAssignedClientIds: string[];
}): void {
  if (UNSCOPED_ROLES.has(input.role)) {
    return;
  }

  if (input.role !== AppUserRole.IT_ENGINEER) {
    return;
  }

  if (!input.targetClientId || !input.activeAssignedClientIds.includes(input.targetClientId)) {
    throw new ForbiddenError("IT engineer has no active assignment to the target client");
  }
}
