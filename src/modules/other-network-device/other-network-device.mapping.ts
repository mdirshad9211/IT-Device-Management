import { WarrantyStatus } from "@prisma/client";

/**
 * SRS §3.4 — scanner-over-manual serial precedence.
 * A non-empty scanned value always wins; manual is used only when no scan.
 */
export function resolveSerialNumber(input: {
  scannedSerialNumber?: string | null;
  manualSerialNumber?: string | null;
}): string | null {
  const scanned = input.scannedSerialNumber?.trim();
  if (scanned) {
    return scanned;
  }
  const manual = input.manualSerialNumber?.trim();
  if (manual) {
    return manual;
  }
  return null;
}

/**
 * Warranty auto-check at read-time (SRS §3.4): if warrantyExpiryDate is in the
 * past, the effective status is EXPIRED regardless of the stored enum.
 * Not a scheduled job.
 */
export function effectiveWarrantyStatus(
  stored: WarrantyStatus,
  warrantyExpiryDate: Date | null,
  now = new Date(),
): WarrantyStatus {
  if (!warrantyExpiryDate) {
    return stored;
  }
  const expiryDay = utcDateOnly(warrantyExpiryDate);
  const today = utcDateOnly(now);
  if (expiryDay < today) {
    return WarrantyStatus.EXPIRED;
  }
  return stored;
}

function utcDateOnly(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}
