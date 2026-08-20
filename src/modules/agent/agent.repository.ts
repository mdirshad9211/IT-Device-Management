import { Prisma, type Agent, type PrismaClient } from "@prisma/client";
import { PollStatus, type HardwareChangeType, type SoftwareChangeAction } from "@prisma/client";
import type { DeviceTelemetry, HardwareChange, SoftwareChange } from "./agent.diff";

export type AgentRecord = Pick<
  Agent,
  "id" | "deviceId" | "clientId" | "version" | "lastPollAt" | "lastPollStatus"
>;

export type PollCommitInput = {
  agentId: string;
  deviceId: string;
  payload: Prisma.InputJsonValue;
  status: PollStatus;
  telemetryPatch: Partial<DeviceTelemetry>;
  softwareChanges: SoftwareChange[];
  hardwareChanges: HardwareChange[];
  now: Date;
};

export interface AgentRepository {
  findById(id: string): Promise<AgentRecord | null>;
  findDeviceTelemetry(deviceId: string): Promise<(DeviceTelemetry & { id: string; clientId: string }) | null>;
  clientExists(clientId: string): Promise<boolean>;
  listActiveAssignedClientIds(appUserId: string): Promise<string[]>;
  listDeviceContactEmails(deviceId: string): Promise<string[]>;
  commitPoll(input: PollCommitInput): Promise<{ pollLogId: string }>;
  deregister(agentId: string): Promise<void>;
}

export class PrismaAgentRepository implements AgentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<AgentRecord | null> {
    return this.prisma.agent.findUnique({
      where: { id },
      select: { id: true, deviceId: true, clientId: true, version: true, lastPollAt: true, lastPollStatus: true },
    });
  }

  async findDeviceTelemetry(deviceId: string): Promise<(DeviceTelemetry & { id: string; clientId: string }) | null> {
    return this.prisma.device.findUnique({
      where: { id: deviceId },
      select: {
        id: true,
        clientId: true,
        cpu: true,
        ram: true,
        storageTotal: true,
        storageUsedPercent: true,
        pciCards: true,
        soundCards: true,
        connectedDevices: true,
        installedSoftware: true,
      },
    });
  }

  async clientExists(clientId: string): Promise<boolean> {
    const row = await this.prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    return row !== null;
  }

  async listActiveAssignedClientIds(appUserId: string): Promise<string[]> {
    const rows = await this.prisma.engineerAssignment.findMany({
      where: { appUserId, isActive: true },
      select: { clientId: true },
    });
    return rows.map((row) => row.clientId);
  }

  async listDeviceContactEmails(deviceId: string): Promise<string[]> {
    const assignment = await this.prisma.deviceAssignment.findFirst({
      where: { deviceId, isCurrent: true },
      select: { userEmail: true, managerEmail: true },
    });
    if (!assignment) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const value of [assignment.userEmail, assignment.managerEmail]) {
      const email = value.trim().toLowerCase();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      out.push(email);
    }
    return out;
  }

  /**
   * SRS §3.1 poll ingest — one transaction: poll log, Device merge, Agent
   * lastPoll*, structured software/hardware history linked by pollLogId.
   */
  async commitPoll(input: PollCommitInput): Promise<{ pollLogId: string }> {
    return this.prisma.$transaction(async (tx) => {
      const log = await tx.agentPollLog.create({
        data: {
          agentId: input.agentId,
          payload: input.payload,
          status: input.status,
          isStale: false,
          polledAt: input.now,
        },
        select: { id: true },
      });

      const patch = toDeviceUpdate(input.telemetryPatch);
      if (Object.keys(patch).length > 0) {
        await tx.device.update({ where: { id: input.deviceId }, data: patch });
      }

      await tx.agent.update({
        where: { id: input.agentId },
        data: { lastPollAt: input.now, lastPollStatus: input.status },
      });

      if (input.softwareChanges.length > 0) {
        await tx.deviceSoftwareEvent.createMany({
          data: input.softwareChanges.map((change) => ({
            deviceId: input.deviceId,
            pollLogId: log.id,
            softwareName: change.softwareName,
            action: change.action as SoftwareChangeAction,
            detectedAt: input.now,
          })),
        });
      }

      if (input.hardwareChanges.length > 0) {
        await tx.deviceHardwareChangeEvent.createMany({
          data: input.hardwareChanges.map((change) => ({
            deviceId: input.deviceId,
            pollLogId: log.id,
            changeType: change.changeType as HardwareChangeType,
            previousValue: toJson(change.previousValue),
            newValue: toJson(change.newValue),
            detectedAt: input.now,
          })),
        });
      }

      return { pollLogId: log.id };
    });
  }

  /**
   * Removes the Agent. History rows stay on the Device; pollLogId is nulled
   * so AgentPollLog can be deleted without FK failures.
   */
  async deregister(agentId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const logs = await tx.agentPollLog.findMany({ where: { agentId }, select: { id: true } });
      const logIds = logs.map((row) => row.id);
      if (logIds.length > 0) {
        await tx.deviceSoftwareEvent.updateMany({ where: { pollLogId: { in: logIds } }, data: { pollLogId: null } });
        await tx.deviceHardwareChangeEvent.updateMany({
          where: { pollLogId: { in: logIds } },
          data: { pollLogId: null },
        });
        await tx.agentPollLog.deleteMany({ where: { agentId } });
      }
      await tx.agent.delete({ where: { id: agentId } });
    });
  }
}

function toDeviceUpdate(patch: Partial<DeviceTelemetry>): Prisma.DeviceUpdateInput {
  const data: Prisma.DeviceUpdateInput = {};
  if (patch.cpu !== undefined) data.cpu = patch.cpu;
  if (patch.ram !== undefined) data.ram = patch.ram;
  if (patch.storageTotal !== undefined) data.storageTotal = patch.storageTotal;
  if (patch.storageUsedPercent !== undefined) data.storageUsedPercent = patch.storageUsedPercent;
  if (patch.pciCards !== undefined) data.pciCards = patch.pciCards as Prisma.InputJsonValue;
  if (patch.soundCards !== undefined) data.soundCards = patch.soundCards as Prisma.InputJsonValue;
  if (patch.connectedDevices !== undefined) data.connectedDevices = patch.connectedDevices as Prisma.InputJsonValue;
  if (patch.installedSoftware !== undefined) data.installedSoftware = patch.installedSoftware as Prisma.InputJsonValue;
  return data;
}

function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined) {
    return Prisma.JsonNull;
  }
  return value as Prisma.InputJsonValue;
}
