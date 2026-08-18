import bcrypt from "bcrypt";
import { UnauthorizedError } from "../../shared/kernel/errors";
import type { AuthRepository } from "./auth.repository";
import type { AppUserWithPassword } from "./auth.repository";
import type { LoginBody } from "./auth.schemas";

export class AuthService {
  constructor(private readonly authRepository: AuthRepository) {}

  /**
   * Authenticates an AppUser by email + password and returns public claims for JWT issuance.
   * Inactive accounts are treated as invalid credentials (no existence leak).
   *
   * SRS §1.4 — AppUser login is a different trust boundary from Agent API keys.
   */
  async login(input: LoginBody): Promise<Omit<AppUserWithPassword, "passwordHash" | "isActive">> {
    const user = await this.authRepository.findActiveByEmail(input.email);
    if (!user) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const passwordOk = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedError("Invalid email or password");
    }

    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }
}
