import { HardwareChangeType, PollStatus, SoftwareChangeAction } from "@prisma/client";

export const STORAGE_THRESHOLD_PERCENT = 80;

export type DeviceTelemetry = {
  cpu: string | null;
  ram: string | null;
  storageTotal: string | null;
  storageUsedPercent: number | null;
  pciCards: unknown;
  soundCards: unknown;
  connectedDevices: unknown;
  installedSoftware: unknown;
};

export type PollPayload = {
  cpu?: string;
  ram?: string;
  storageTotal?: string;
  storageUsedPercent?: number;
  pciCards?: unknown;
  soundCards?: unknown;
  connectedDevices?: unknown;
  installedSoftware?: unknown;
  error?: { type?: string; code?: string; message?: string };
};

export type SoftwareChange = {
  softwareName: string;
  version: string | null;
  /** Previous version when action is UPDATED */
  previousVersion?: string | null;
  action: SoftwareChangeAction;
};
export type HardwareChange = {
  changeType: HardwareChangeType;
  previousValue: unknown;
  newValue: unknown;
};

export type TelemetryDiff = {
  softwareChanges: SoftwareChange[];
  hardwareChanges: HardwareChange[];
  storageUsedPercent: number | null;
};

/**
 * SRS §3.1 — pure telemetry diff. Omits fields that are absent on the new
 * poll so a partial payload never looks like a mass uninstall / wipe.
 */
export function diffTelemetry(previous: DeviceTelemetry, poll: PollPayload): TelemetryDiff {
  const softwareChanges =
    poll.installedSoftware === undefined
      ? []
      : diffSoftware(previous.installedSoftware, poll.installedSoftware);

  const hardwareChanges: HardwareChange[] = [];
  pushHardware(hardwareChanges, HardwareChangeType.RAM, previous.ram, poll.ram, poll.ram !== undefined);
  pushHardware(
    hardwareChanges,
    HardwareChangeType.STORAGE,
    previous.storageTotal,
    poll.storageTotal,
    poll.storageTotal !== undefined,
  );
  pushHardware(
    hardwareChanges,
    HardwareChangeType.PCI_CARD,
    previous.pciCards,
    poll.pciCards,
    poll.pciCards !== undefined,
  );
  pushHardware(
    hardwareChanges,
    HardwareChangeType.SOUND_CARD,
    previous.soundCards,
    poll.soundCards,
    poll.soundCards !== undefined,
  );
  pushHardware(
    hardwareChanges,
    HardwareChangeType.CONNECTED_DEVICE,
    previous.connectedDevices,
    poll.connectedDevices,
    poll.connectedDevices !== undefined,
  );

  const storageUsedPercent =
    poll.storageUsedPercent !== undefined ? poll.storageUsedPercent : previous.storageUsedPercent;

  return { softwareChanges, hardwareChanges, storageUsedPercent };
}

/**
 * Classifies a poll as OK vs network vs local agent/OS resource failure.
 */
export function classifyPollStatus(payload: PollPayload | null | undefined, error?: unknown): PollStatus {
  if (error != null) {
    return classifyErrorValue(error);
  }

  if (payload == null) {
    return PollStatus.SYSTEM_RESOURCE_FAILURE;
  }

  const reported = payload.error?.type ?? payload.error?.code ?? payload.error?.message;
  if (reported) {
    return classifyErrorValue(reported);
  }

  return PollStatus.OK;
}

export function mergeTelemetry(previous: DeviceTelemetry, poll: PollPayload): Partial<DeviceTelemetry> {
  const next: Partial<DeviceTelemetry> = {};
  if (poll.cpu !== undefined && poll.cpu !== "") next.cpu = poll.cpu;
  if (poll.ram !== undefined && poll.ram !== "") next.ram = poll.ram;
  if (poll.storageTotal !== undefined && poll.storageTotal !== "") next.storageTotal = poll.storageTotal;
  if (poll.storageUsedPercent !== undefined) next.storageUsedPercent = poll.storageUsedPercent;
  if (poll.pciCards !== undefined && poll.pciCards !== null) next.pciCards = poll.pciCards;
  if (poll.soundCards !== undefined && poll.soundCards !== null) next.soundCards = poll.soundCards;
  if (poll.connectedDevices !== undefined && poll.connectedDevices !== null) next.connectedDevices = poll.connectedDevices;
  if (poll.installedSoftware !== undefined && poll.installedSoftware !== null) {
    next.installedSoftware = normalizeSoftwareEntries(poll.installedSoftware);
  }
  return next;
}

export type SoftwareEntry = {
  name: string;
  version: string | null;
  productKey: string | null;
  installedAt: string | null;
  updatedAt: string | null;
};

function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Diff by software **name** (not name+version) so version bumps become UPDATED
 * instead of REMOVED + ADDED noise.
 */
function diffSoftware(previous: unknown, next: unknown): SoftwareChange[] {
  const prevEntries = normalizeSoftwareEntries(previous);
  const nextEntries = normalizeSoftwareEntries(next);
  const prevByName = new Map(prevEntries.map((e) => [nameKey(e.name), e]));
  const nextByName = new Map(nextEntries.map((e) => [nameKey(e.name), e]));
  const changes: SoftwareChange[] = [];

  for (const [key, entry] of nextByName) {
    const prev = prevByName.get(key);
    if (!prev) {
      changes.push({
        softwareName: entry.name,
        version: entry.version,
        action: SoftwareChangeAction.ADDED,
      });
      continue;
    }
    const sameVersion = (prev.version ?? "") === (entry.version ?? "");
    if (!sameVersion) {
      changes.push({
        softwareName: entry.name,
        version: entry.version,
        previousVersion: prev.version,
        action: SoftwareChangeAction.UPDATED,
      });
    }
  }
  for (const [key, entry] of prevByName) {
    if (!nextByName.has(key)) {
      changes.push({
        softwareName: entry.name,
        version: entry.version,
        action: SoftwareChangeAction.REMOVED,
      });
    }
  }
  return changes.sort(
    (a, b) =>
      a.softwareName.localeCompare(b.softwareName) ||
      (a.version ?? "").localeCompare(b.version ?? "") ||
      a.action.localeCompare(b.action),
  );
}

/** Normalize agent/UI payloads into rich software entries for Device.installedSoftware. */
export function normalizeSoftwareEntries(value: unknown): SoftwareEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const entries: SoftwareEntry[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    let name = "";
    let version: string | null = null;
    let productKey: string | null = null;
    let installedAt: string | null = null;
    let updatedAt: string | null = null;

    if (typeof item === "string" && item.trim() !== "") {
      const match = item.trim().match(/^(.*)\sv(\S+)$/);
      if (match) {
        name = match[1]!.trim();
        version = match[2]!;
      } else {
        name = item.trim();
      }
    } else if (item && typeof item === "object" && "name" in item) {
      const rec = item as Record<string, unknown>;
      const rawName = rec.name;
      if (typeof rawName !== "string" || rawName.trim() === "") continue;
      name = rawName.trim();
      const versionRaw = rec.version;
      version = typeof versionRaw === "string" && versionRaw.trim() ? versionRaw.trim() : null;
      const pk = rec.productKey ?? rec.productId;
      productKey = typeof pk === "string" && pk.trim() ? pk.trim() : null;
      const inst = rec.installedAt ?? rec.installDate;
      installedAt = typeof inst === "string" && inst.trim() ? normalizeDateString(inst.trim()) : null;
      const upd = rec.updatedAt;
      updatedAt = typeof upd === "string" && upd.trim() ? normalizeDateString(upd.trim()) : null;
    } else {
      continue;
    }
    const key = nameKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ name, version, productKey, installedAt, updatedAt });
  }
  return entries;
}

function normalizeDateString(raw: string): string {
  // Windows InstallDate is often YYYYMMDD
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  return raw;
}

function pushHardware(
  target: HardwareChange[],
  changeType: HardwareChangeType,
  previousValue: unknown,
  newValue: unknown,
  present: boolean,
): void {
  if (!present) {
    return;
  }
  if (hardwareValuesEqual(changeType, previousValue ?? null, newValue ?? null)) {
    return;
  }
  target.push({ changeType, previousValue: previousValue ?? null, newValue: newValue ?? null });
}

/** Ignore cosmetic formatting differences for RAM / storage strings. */
function hardwareValuesEqual(changeType: HardwareChangeType, a: unknown, b: unknown): boolean {
  if (changeType === HardwareChangeType.RAM || changeType === HardwareChangeType.STORAGE) {
    const na = extractGb(a);
    const nb = extractGb(b);
    if (na != null && nb != null) {
      return Math.abs(na - nb) < 0.35;
    }
    return normalizeHardwareText(a) === normalizeHardwareText(b);
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

function extractGb(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = value.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*GB/i);
  return m ? Number(m[1]) : null;
}

function normalizeHardwareText(value: unknown): string {
  if (typeof value !== "string") return JSON.stringify(value);
  return value
    .toLowerCase()
    .replace(/,/g, "")
    .replace(/\b(ssd|hdd|nvme)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function classifyErrorValue(error: unknown): PollStatus {
  const text = errorText(error);
  if (/(network|timeout|econnrefused|enotfound|econnreset|NETWORK_FAILURE)/i.test(text)) {
    return PollStatus.NETWORK_FAILURE;
  }
  return PollStatus.SYSTEM_RESOURCE_FAILURE;
}

function errorText(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return `${error.name} ${error.message}`;
  }
  if (error && typeof error === "object") {
    const rec = error as { type?: unknown; code?: unknown; message?: unknown };
    return [rec.type, rec.code, rec.message].filter((part) => typeof part === "string").join(" ");
  }
  return "";
}
