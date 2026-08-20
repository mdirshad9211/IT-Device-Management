import { AuditAction } from "@prisma/client";
import type { AuditableEvent } from "../../shared/kernel/events";

/**
 * Shallow field-level diff for audit enrichment. Every UPDATE audit row gets a
 * `fieldChanges` map so consumers can see exactly what changed without
 * diffing `before`/`after` themselves. Nested objects are compared by
 * JSON equality (good enough for inventory JSON blobs).
 */
export function computeFieldChanges(
  before: unknown,
  after: unknown,
): Record<string, { from: unknown; to: unknown }> {
  if (!isPlainObject(before) || !isPlainObject(after)) {
    return {};
  }

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (key === "fieldChanges" || key === "changedAt") continue;
    const from = before[key];
    const to = after[key];
    if (!valuesEqual(from, to)) {
      changes[key] = { from: from ?? null, to: to ?? null };
    }
  }
  return changes;
}

/**
 * Enriches AuditableEvent payloads before persistence:
 * - UPDATE: attaches `fieldChanges` + `changedAt` onto `after`
 * - CREATE/DELETE: attaches `changedAt` onto the non-null snapshot
 */
export function enrichAuditableEvent(event: AuditableEvent): AuditableEvent {
  const changedAt = new Date().toISOString();

  if (event.action === AuditAction.UPDATE) {
    const fieldChanges = computeFieldChanges(event.before, event.after);
    const afterBase = isPlainObject(event.after) ? event.after : { value: event.after };
    return {
      ...event,
      after: {
        ...afterBase,
        fieldChanges,
        changedAt,
      },
    };
  }

  if (event.action === AuditAction.CREATE && event.after !== null && event.after !== undefined) {
    const afterBase = isPlainObject(event.after) ? event.after : { value: event.after };
    return { ...event, after: { ...afterBase, changedAt } };
  }

  if (event.action === AuditAction.DELETE && event.before !== null && event.before !== undefined) {
    const beforeBase = isPlainObject(event.before) ? event.before : { value: event.before };
    return { ...event, before: { ...beforeBase, changedAt } };
  }

  return event;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
