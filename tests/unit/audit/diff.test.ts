import { describe, expect, it } from "vitest";
import { AuditAction } from "@prisma/client";
import { computeFieldChanges, enrichAuditableEvent } from "../../../src/modules/audit/audit.diff";

describe("audit.diff", () => {
  it("lists every changed field for UPDATE enrichment", () => {
    const changes = computeFieldChanges(
      { cpu: "i5", ram: "8 GB", status: "ACTIVE" },
      { cpu: "i7", ram: "8 GB", status: "ACTIVE" },
    );
    expect(changes).toEqual({ cpu: { from: "i5", to: "i7" } });
  });

  it("enriches UPDATE after with fieldChanges + changedAt", () => {
    const enriched = enrichAuditableEvent({
      entityType: "Device",
      entityId: "d1",
      action: AuditAction.UPDATE,
      performedBy: "u1",
      before: { cpu: "i5" },
      after: { cpu: "i7" },
    });
    expect(enriched.after).toMatchObject({
      cpu: "i7",
      fieldChanges: { cpu: { from: "i5", to: "i7" } },
    });
    expect((enriched.after as { changedAt: string }).changedAt).toMatch(/^\d{4}-/);
  });
});
