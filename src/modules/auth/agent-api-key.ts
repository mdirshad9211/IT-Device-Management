import { createHmac } from "node:crypto";
import { env } from "../../config/env";

/**
 * Digests a per-site Agent API key. Peppered with AGENT_JWT_SECRET so the
 * stored hash is not a raw SHA-256 of the key, without minting an AppUser JWT.
 */
export function hashAgentApiKey(apiKey: string): string {
  return createHmac("sha256", env.AGENT_JWT_SECRET).update(apiKey).digest("hex");
}
