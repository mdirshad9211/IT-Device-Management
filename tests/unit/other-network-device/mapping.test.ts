import { describe, expect, it } from "vitest";
import { WarrantyStatus } from "@prisma/client";
import {
  effectiveWarrantyStatus,
  resolveSerialNumber,
} from "../../../src/modules/other-network-device/other-network-device.mapping";

describe("resolveSerialNumber (scanner-over-manual)", () => {
  it.each([
    {
      name: "prefers scanned when both are present",
      input: { scannedSerialNumber: "SCAN-001", manualSerialNumber: "MANUAL-001" },
      expected: "SCAN-001",
    },
    {
      name: "uses manual when scanned is absent",
      input: { manualSerialNumber: "MANUAL-001" },
      expected: "MANUAL-001",
    },
    {
      name: "uses scanned when manual is absent",
      input: { scannedSerialNumber: "SCAN-001" },
      expected: "SCAN-001",
    },
    {
      name: "trims whitespace",
      input: { scannedSerialNumber: "  SCAN-002  ", manualSerialNumber: "MANUAL" },
      expected: "SCAN-002",
    },
    {
      name: "falls back to manual when scanned is blank",
      input: { scannedSerialNumber: "   ", manualSerialNumber: "MANUAL-002" },
      expected: "MANUAL-002",
    },
    {
      name: "returns null when both are empty",
      input: { scannedSerialNumber: "", manualSerialNumber: null },
      expected: null,
    },
  ])("$name", ({ input, expected }) => {
    expect(resolveSerialNumber(input)).toBe(expected);
  });
});

describe("effectiveWarrantyStatus (read-time)", () => {
  const now = new Date("2026-08-20T12:00:00.000Z");

  it("forces EXPIRED when warrantyExpiryDate is before today", () => {
    expect(
      effectiveWarrantyStatus(WarrantyStatus.UNDER_WARRANTY, new Date("2026-08-19T00:00:00.000Z"), now),
    ).toBe(WarrantyStatus.EXPIRED);
  });

  it("keeps stored status when expiry is today or in the future", () => {
    expect(
      effectiveWarrantyStatus(WarrantyStatus.UNDER_WARRANTY, new Date("2026-08-20T00:00:00.000Z"), now),
    ).toBe(WarrantyStatus.UNDER_WARRANTY);
    expect(
      effectiveWarrantyStatus(WarrantyStatus.UNDER_WARRANTY, new Date("2026-12-01T00:00:00.000Z"), now),
    ).toBe(WarrantyStatus.UNDER_WARRANTY);
  });

  it("keeps stored status when there is no expiry date", () => {
    expect(effectiveWarrantyStatus(WarrantyStatus.NO_WARRANTY, null, now)).toBe(WarrantyStatus.NO_WARRANTY);
  });
});
