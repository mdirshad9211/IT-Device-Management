import type { onRequestHookHandler } from "fastify";
import { UnauthorizedError } from "../errors";

/**
 * Verifies the AppUser JWT issued by POST /api/v1/auth/login.
 * Agent traffic must use `requireAgentAuth` instead — different trust boundary.
 */
export const requireAppUserAuth: onRequestHookHandler = async (request) => {
  try {
    await request.jwtVerify();
  } catch {
    throw new UnauthorizedError("Authentication required");
  }

  if (!request.user?.userId || !request.user?.role) {
    throw new UnauthorizedError("Invalid authentication token");
  }
};
