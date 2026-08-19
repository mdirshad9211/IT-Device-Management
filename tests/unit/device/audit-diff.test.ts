import { describe, expect, it } from "vitest";
import { diffShallow } from "../../../src/modules/device/device.audit-diff";

describe("diffShallow", () => {
  it("returns only changed keys", () => {
    expect(diffShallow({ cpu: "i5", ram: "16 GB" }, { cpu: "i7", ram: "16 GB" })).toEqual({
      cpu: { from: "i5", to: "i7" },
    });
  });
});
