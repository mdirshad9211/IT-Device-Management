import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../../config/env";

const DOWNLOAD_TTL_MS = 15 * 60 * 1000;

export type AgentDownloadClaims = {
  clientId: string;
  exp: number;
};

/**
 * Site-scoped installer token. Signed with AGENT_JWT_SECRET so it is not an
 * AppUser login JWT (different trust boundary).
 */
export function signAgentDownloadToken(clientId: string, now = Date.now()): { token: string; expiresAt: Date } {
  const exp = now + DOWNLOAD_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ clientId, exp } satisfies AgentDownloadClaims)).toString("base64url");
  const sig = createHmac("sha256", env.AGENT_JWT_SECRET).update(payload).digest("base64url");
  return { token: `${payload}.${sig}`, expiresAt: new Date(exp) };
}

export function verifyAgentDownloadToken(token: string, now = Date.now()): AgentDownloadClaims {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) {
    throw new Error("Malformed agent download token");
  }
  const expected = createHmac("sha256", env.AGENT_JWT_SECRET).update(payload).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    throw new Error("Invalid agent download token");
  }
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AgentDownloadClaims;
  if (typeof claims.clientId !== "string" || typeof claims.exp !== "number") {
    throw new Error("Invalid agent download token claims");
  }
  if (now >= claims.exp) {
    throw new Error("Agent download token expired");
  }
  return claims;
}
