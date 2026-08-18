import type { FastifyReply, FastifyRequest } from "fastify";
import { parseBody } from "../../shared/http/validate";
import { loginBodySchema, loginResponseSchema } from "./auth.schemas";
import type { AuthService } from "./auth.service";

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /api/v1/auth/login — issues an AppUser JWT (`userId`, `role`).
   */
  async login(request: FastifyRequest, reply: FastifyReply) {
    const body = parseBody(loginBodySchema, request);
    const user = await this.authService.login(body);
    const token = await reply.jwtSign({ userId: user.id, role: user.role });
    const payload = loginResponseSchema.parse({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
    return reply.status(200).send(payload);
  }
}
