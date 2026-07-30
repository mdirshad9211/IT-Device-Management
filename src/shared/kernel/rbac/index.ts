import type { AppUserRole } from "@prisma/client";

export type { AppUserRole };

/**
 * BOILERPLATE PLACEHOLDER.
 *
 * The full PERMISSION_MATRIX (which role can do which action on which
 * entity), the requirePermission() Fastify hook, the client-scope check for
 * IT_ENGINEER, and the self-service scope check for CLIENT_MANAGER/EMPLOYEE
 * are business logic and are intentionally NOT implemented yet — they land
 * once the SRS/permissions review is signed off (see the reference backend
 * Cursor prompts, Prompt 3).
 *
 * Do not add authorization checks piecemeal into individual routes ahead of
 * that — every route below currently has NO authorization enforcement.
 * Treat every stub endpoint as unauthenticated/unsafe until this module is
 * built out.
 */
export const RBAC_NOT_YET_IMPLEMENTED = true;
