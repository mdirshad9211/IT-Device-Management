import { describe, expect, it } from "vitest";
import {
  signAgentDownloadToken,
  verifyAgentDownloadToken,
} from "../../../src/modules/agent/agent.download-token";

describe("agent download token", () => {
  it("round-trips a site-scoped token", () => {
    const { token, expiresAt } = signAgentDownloadToken("client-1", 1_700_000_000_000);
    const claims = verifyAgentDownloadToken(token, 1_700_000_000_000);
    expect(claims.clientId).toBe("client-1");
    expect(expiresAt.getTime()).toBe(claims.exp);
  });

  it("rejects a tampered signature", () => {
    const { token } = signAgentDownloadToken("client-1");
    expect(() => verifyAgentDownloadToken(`${token}x`)).toThrow(/Invalid/);
  });

  it("rejects an expired token", () => {
    const now = 1_700_000_000_000;
    const { token } = signAgentDownloadToken("client-1", now);
    expect(() => verifyAgentDownloadToken(token, now + 16 * 60 * 1000)).toThrow(/expired/);
  });
});
