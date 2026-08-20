import { describe, expect, it } from "vitest";
import { NotificationType } from "@prisma/client";
import { renderNotificationEmail } from "../../../src/modules/notification/notification.templates";

describe("notification templates", () => {
  it("renders allotment email", () => {
    const email = renderNotificationEmail(NotificationType.DEVICE_ALLOTMENT, {
      assetTag: "TAG-1",
      qrValue: "INV:TAG-1",
    });
    expect(email.subject).toContain("TAG-1");
    expect(email.text).toContain("INV:TAG-1");
  });

  it("renders storage threshold email", () => {
    const email = renderNotificationEmail(NotificationType.STORAGE_THRESHOLD, {
      storageUsedPercent: 92,
    });
    expect(email.subject).toContain("92");
    expect(email.html).toContain("92%");
  });

  it("renders discard warning email", () => {
    const email = renderNotificationEmail(NotificationType.DISCARD_WARNING, {
      assetTag: "TAG-2",
      deletionDueAt: "2026-09-01T00:00:00.000Z",
    });
    expect(email.subject).toContain("TAG-2");
    expect(email.text).toContain("2026-09-01");
  });
});
