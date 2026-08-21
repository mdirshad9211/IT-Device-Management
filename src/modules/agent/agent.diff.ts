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
 * `error` is an out-of-band transport/runtime error; `payload.error` is
 * agent-reported. Transport errors win.
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

type SoftwareEntry = { name: string; version: string | null };

function softwareKey(entry: SoftwareEntry): string {
  return `${entry.name}@@${entry.version ?? ""}`;
}

function diffSoftware(previous: unknown, next: unknown): SoftwareChange[] {
  const prevEntries = normalizeSoftwareEntries(previous);
  const nextEntries = normalizeSoftwareEntries(next);
  const prevMap = new Map(prevEntries.map((e) => [softwareKey(e), e]));
  const nextMap = new Map(nextEntries.map((e) => [softwareKey(e), e]));
  const changes: SoftwareChange[] = [];

  for (const [key, entry] of nextMap) {
    if (!prevMap.has(key)) {
      changes.push({
        softwareName: entry.name,
        version: entry.version,
        action: SoftwareChangeAction.ADDED,
      });
    }
  }
  for (const [key, entry] of prevMap) {
    if (!nextMap.has(key)) {
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

/** Normalize agent/UI payloads into `{ name, version }` for Device.installedSoftware. */
export function normalizeSoftwareEntries(value: unknown): SoftwareEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const entries: SoftwareEntry[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    let name = "";
    let version: string | null = null;
    if (typeof item === "string" && item.trim() !== "") {
      const match = item.trim().match(/^(.*)\sv(\S+)$/);
      if (match) {
        name = match[1]!.trim();
        version = match[2]!;
      } else {
        name = item.trim();
      }
    } else if (item && typeof item === "object" && "name" in item) {
      const rawName = (item as { name: unknown }).name;
      if (typeof rawName !== "string" || rawName.trim() === "") continue;
      name = rawName.trim();
      const versionRaw = (item as { version?: unknown }).version;
      version = typeof versionRaw === "string" && versionRaw.trim() ? versionRaw.trim() : null;
    } else {
      continue;
    }
    const key = softwareKey({ name, version });
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ name, version });
  }
  return entries;
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
  if (jsonEqual(previousValue ?? null, newValue ?? null)) {
    return;
  }
  target.push({ changeType, previousValue: previousValue ?? null, newValue: newValue ?? null });
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
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
