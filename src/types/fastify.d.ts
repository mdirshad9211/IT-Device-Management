import type { AwilixContainer } from "awilix";
import type { AppUserRole } from "@prisma/client";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { userId: string; role: AppUserRole };
    user: { userId: string; role: AppUserRole };
  }
}

declare module "fastify" {
  interface FastifyRequest {
    /**
     * The awilix DI container, attached on every request in app.ts. Modules
     * resolve their services via `request.container.resolve('deviceService')`
     * once those registrations exist (see config/container.ts).
     */
    container: AwilixContainer;
    /** Set by `requireAgentAuth`. Absent on AppUser JWT requests. */
    agent?: { id: string; deviceId: string; clientId: string };
  }
}
