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

export type SoftwareChange = { softwareName: string; action: SoftwareChangeAction };
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
    next.installedSoftware = normalizeSoftware(poll.installedSoftware);
  }
  return next;
}

function diffSoftware(previous: unknown, next: unknown): SoftwareChange[] {
  const prevSet = new Set(normalizeSoftware(previous));
  const nextSet = new Set(normalizeSoftware(next));
  const changes: SoftwareChange[] = [];

  for (const name of nextSet) {
    if (!prevSet.has(name)) {
      changes.push({ softwareName: name, action: SoftwareChangeAction.ADDED });
    }
  }
  for (const name of prevSet) {
    if (!nextSet.has(name)) {
      changes.push({ softwareName: name, action: SoftwareChangeAction.REMOVED });
    }
  }
  return changes.sort((a, b) => a.softwareName.localeCompare(b.softwareName) || a.action.localeCompare(b.action));
}

function normalizeSoftware(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const names: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim() !== "") {
      names.push(item.trim());
      continue;
    }
    if (item && typeof item === "object" && "name" in item) {
      const name = (item as { name: unknown }).name;
      if (typeof name === "string" && name.trim() !== "") {
        names.push(name.trim());
      }
    }
  }
  return [...new Set(names)];
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
