import { describe, expect, it } from "vitest";
import { HardwareChangeType, PollStatus, SoftwareChangeAction } from "@prisma/client";
import {
  classifyPollStatus,
  diffTelemetry,
  mergeTelemetry,
  STORAGE_THRESHOLD_PERCENT,
  type DeviceTelemetry,
  type PollPayload,
} from "../../../src/modules/agent/agent.diff";

const previous: DeviceTelemetry = {
  cpu: "Intel i5",
  ram: "16 GB",
  storageTotal: "512 GB",
  storageUsedPercent: 41,
  pciCards: [{ name: "GPU" }],
  soundCards: ["Realtek"],
  connectedDevices: ["USB Mouse"],
  installedSoftware: ["Chrome", "Zoom"],
};

describe("diffTelemetry", () => {
  it.each([
    {
      name: "detects software added and removed",
      poll: { installedSoftware: ["Chrome", "Slack"] } satisfies PollPayload,
      software: [
        { softwareName: "Slack", version: null, action: SoftwareChangeAction.ADDED },
        { softwareName: "Zoom", version: null, action: SoftwareChangeAction.REMOVED },
      ],
    },
    {
      name: "accepts { name } software objects",
      poll: { installedSoftware: [{ name: "Chrome" }, { name: "Teams" }] } satisfies PollPayload,
      software: [
        { softwareName: "Teams", version: null, action: SoftwareChangeAction.ADDED },
        { softwareName: "Zoom", version: null, action: SoftwareChangeAction.REMOVED },
      ],
    },
    {
      name: "does not treat omitted software as a mass uninstall",
      poll: { cpu: "Intel i7" } satisfies PollPayload,
      software: [],
    },
    {
      name: "dedupes software names",
      poll: { installedSoftware: ["Chrome", "Chrome", { name: "Zoom" }] } satisfies PollPayload,
      software: [],
    },
  ])("$name", ({ poll, software }) => {
    expect(diffTelemetry(previous, poll).softwareChanges).toEqual(software);
  });

  it("treats name-only then versioned as UPDATED once", () => {
    const prev: DeviceTelemetry = {
      ...previous,
      installedSoftware: [{ name: "Brave" }],
    };
    const poll: PollPayload = {
      installedSoftware: [{ name: "Brave", version: "151.1.93.138" }],
    };
    expect(diffTelemetry(prev, poll).softwareChanges).toEqual([
      {
        softwareName: "Brave",
        version: "151.1.93.138",
        previousVersion: null,
        action: SoftwareChangeAction.UPDATED,
      },
    ]);
  });

  it("treats software version upgrades as UPDATED", () => {
    const withVersion: DeviceTelemetry = {
      ...previous,
      installedSoftware: [{ name: "Google Chrome", version: "121.0.0" }],
    };
    const diff = diffTelemetry(withVersion, {
      installedSoftware: [{ name: "Google Chrome", version: "122.0.0" }],
    });
    expect(diff.softwareChanges).toEqual([
      {
        softwareName: "Google Chrome",
        version: "122.0.0",
        previousVersion: "121.0.0",
        action: SoftwareChangeAction.UPDATED,
      },
    ]);
  });

  it.each([
    {
      name: "RAM",
      poll: { ram: "32 GB" } satisfies PollPayload,
      changeType: HardwareChangeType.RAM,
      previousValue: "16 GB",
      newValue: "32 GB",
    },
    {
      name: "STORAGE capacity",
      poll: { storageTotal: "1 TB" } satisfies PollPayload,
      changeType: HardwareChangeType.STORAGE,
      previousValue: "512 GB",
      newValue: "1 TB",
    },
    {
      name: "PCI_CARD",
      poll: { pciCards: [{ name: "NIC" }] } satisfies PollPayload,
      changeType: HardwareChangeType.PCI_CARD,
      previousValue: [{ name: "GPU" }],
      newValue: [{ name: "NIC" }],
    },
    {
      name: "SOUND_CARD",
      poll: { soundCards: ["USB DAC"] } satisfies PollPayload,
      changeType: HardwareChangeType.SOUND_CARD,
      previousValue: ["Realtek"],
      newValue: ["USB DAC"],
    },
    {
      name: "CONNECTED_DEVICE",
      poll: { connectedDevices: ["USB Mouse", "HDMI Monitor"] } satisfies PollPayload,
      changeType: HardwareChangeType.CONNECTED_DEVICE,
      previousValue: ["USB Mouse"],
      newValue: ["USB Mouse", "HDMI Monitor"],
    },
  ])("emits $name hardware change when the field is present and different", ({ poll, changeType, previousValue, newValue }) => {
    expect(diffTelemetry(previous, poll).hardwareChanges).toEqual([{ changeType, previousValue, newValue }]);
  });

  it("ignores cosmetic storage text when GB matches", () => {
    expect(
      diffTelemetry(previous, { storageTotal: "512 GB SSD" }).hardwareChanges.filter(
        (h) => h.changeType === HardwareChangeType.STORAGE,
      ),
    ).toEqual([]);
  });

  it("does not emit hardware changes for omitted fields", () => {
    expect(diffTelemetry(previous, { storageUsedPercent: 50 }).hardwareChanges).toEqual([]);
  });

  it("does not emit hardware changes when values are unchanged", () => {
    expect(diffTelemetry(previous, { ram: "16 GB", pciCards: [{ name: "GPU" }] }).hardwareChanges).toEqual([]);
  });

  it.each([
    { poll: { storageUsedPercent: 80 }, expected: 80 },
    { poll: { cpu: "i7" }, expected: 41 },
    { poll: { storageUsedPercent: 0 }, expected: 0 },
  ])("storageUsedPercent from poll or previous: $expected", ({ poll, expected }) => {
    expect(diffTelemetry(previous, poll).storageUsedPercent).toBe(expected);
  });

  it("treats missing previous software as empty", () => {
    const empty: DeviceTelemetry = { ...previous, installedSoftware: null };
    const diff = diffTelemetry(empty, { installedSoftware: ["Chrome"] });
    expect(diff.softwareChanges).toEqual([
      { softwareName: "Chrome", version: null, action: SoftwareChangeAction.ADDED },
    ]);
  });
});

describe("classifyPollStatus", () => {
  it.each([
    { name: "healthy payload", payload: { cpu: "i5" }, error: undefined, status: PollStatus.OK },
    { name: "empty payload", payload: {}, error: undefined, status: PollStatus.OK },
    {
      name: "agent-reported network type",
      payload: { error: { type: "network" } },
      error: undefined,
      status: PollStatus.NETWORK_FAILURE,
    },
    {
      name: "agent-reported NETWORK_FAILURE code",
      payload: { error: { code: "NETWORK_FAILURE" } },
      error: undefined,
      status: PollStatus.NETWORK_FAILURE,
    },
    {
      name: "agent-reported system type",
      payload: { error: { type: "system" } },
      error: undefined,
      status: PollStatus.SYSTEM_RESOURCE_FAILURE,
    },
    {
      name: "transport timeout Error",
      payload: { cpu: "i5" },
      error: new Error("connect timeout"),
      status: PollStatus.NETWORK_FAILURE,
    },
    {
      name: "ECONNREFUSED",
      payload: {},
      error: { code: "ECONNREFUSED" },
      status: PollStatus.NETWORK_FAILURE,
    },
    {
      name: "disk full Error",
      payload: {},
      error: new Error("ENOSPC: no space left"),
      status: PollStatus.SYSTEM_RESOURCE_FAILURE,
    },
    { name: "null payload without error", payload: null, error: undefined, status: PollStatus.SYSTEM_RESOURCE_FAILURE },
    {
      name: "transport error wins over healthy payload",
      payload: { cpu: "i5" },
      error: "network unreachable",
      status: PollStatus.NETWORK_FAILURE,
    },
  ])("$name -> $status", ({ payload, error, status }) => {
    expect(classifyPollStatus(payload, error)).toBe(status);
  });
});

describe("mergeTelemetry", () => {
  it("only copies defined non-blank fields", () => {
    expect(mergeTelemetry(previous, { cpu: "Intel i7", ram: "" })).toEqual({ cpu: "Intel i7" });
  });

  it("keeps storageUsedPercent 0", () => {
    expect(mergeTelemetry(previous, { storageUsedPercent: 0 })).toEqual({ storageUsedPercent: 0 });
  });

  it("normalizes installed software to rich objects", () => {
    expect(
      mergeTelemetry(previous, {
        installedSoftware: [{ name: "Google Chrome", version: "122.0" }, "Zoom"],
      }),
    ).toEqual({
      installedSoftware: [
        {
          name: "Google Chrome",
          version: "122.0",
          productKey: null,
          installedAt: null,
          updatedAt: null,
        },
        { name: "Zoom", version: null, productKey: null, installedAt: null, updatedAt: null },
      ],
    });
  });
});

describe("STORAGE_THRESHOLD_PERCENT", () => {
  it("is 80", () => {
    expect(STORAGE_THRESHOLD_PERCENT).toBe(80);
  });
});
