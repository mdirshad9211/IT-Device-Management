import { describe, expect, it } from "vitest";
import { buildZip } from "../../../src/modules/agent/agent.zip";
import { agentPackageFileName, buildAgentInstallerPackage } from "../../../src/modules/agent/agent.package";

describe("agent installer package", () => {
  it("builds a zip with expected entries", () => {
    const zip = buildAgentInstallerPackage({
      clientId: "11111111-1111-1111-1111-111111111111",
      clientName: "CRL Delhi",
      apiBaseUrl: "http://localhost:4000",
      downloadToken: "tok.sig",
      expiresAt: "2026-08-21T12:00:00.000Z",
      credentials: [
        {
          deviceId: "22222222-2222-2222-2222-222222222222",
          assetTag: "DEL-LN-001",
          agentId: "33333333-3333-3333-3333-333333333333",
          apiKey: "dcn_test_key",
        },
      ],
    });
    expect(zip.subarray(0, 4).toString("binary")).toBe("PK\u0003\u0004");
    expect(zip.includes(Buffer.from("run-agent.ps1"))).toBe(true);
    expect(zip.includes(Buffer.from("list-software.ps1"))).toBe(true);
    expect(zip.includes(Buffer.from("AGENTS.md"))).toBe(true);
    expect(zip.includes(Buffer.from("dcn_test_key"))).toBe(true);
    expect(zip.includes(Buffer.from("config.json"))).toBe(true);
    expect(agentPackageFileName("CRL Delhi")).toBe("dcn-agent-CRL-Delhi.zip");
  });

  it("stores uncompressed entries", () => {
    const zip = buildZip([{ name: "hello.txt", data: "hello" }]);
    expect(zip.includes(Buffer.from("hello"))).toBe(true);
  });
});
