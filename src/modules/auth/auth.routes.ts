import type { FastifyInstance } from "fastify";
import type { AuthController } from "./auth.controller";

/**
 * AppUser JWT login. Agent API-key verification is `requireAgentAuth` (auth.hooks),
 * not a second JWT issuer.
 */
export default async function authRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post("/login", async (request, reply) => {
    const controller = request.container.resolve<AuthController>("authController");
    return controller.login(request, reply);
  });
}
