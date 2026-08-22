import { z } from "zod";
import { HardwareChangeType, PollStatus, SoftwareChangeAction } from "@prisma/client";

export const pollErrorSchema = z
  .object({
    type: z.string().optional(),
    code: z.string().optional(),
    message: z.string().optional(),
  })
  .optional();

export const pollBodySchema = z.object({
  cpu: z.string().max(200).optional(),
  ram: z.string().max(200).optional(),
  storageTotal: z.string().max(200).optional(),
  storageUsedPercent: z.number().int().min(0).max(100).optional(),
  pciCards: z.unknown().optional(),
  soundCards: z.unknown().optional(),
  connectedDevices: z.unknown().optional(),
  installedSoftware: z
    .array(z.union([z.string(), z.object({ name: z.string() })]))
    .optional(),
  error: pollErrorSchema,
});

export type PollBody = z.output<typeof pollBodySchema>;

export const agentIdParamsSchema = z.object({
  agentId: z.string().uuid(),
});

export const deregisterBodySchema = z.object({
  adminSecret: z.string().min(1),
});

export type DeregisterBody = z.output<typeof deregisterBodySchema>;

export const downloadAgentQuerySchema = z.object({
  clientId: z.string().uuid(),
  /** zip (default) = installer package download; json = token metadata only */
  format: z.enum(["zip", "json"]).default("zip"),
});

export const softwareChangeSchema = z.object({
  softwareName: z.string(),
  version: z.string().nullable(),
  previousVersion: z.string().nullable().optional(),
  action: z.nativeEnum(SoftwareChangeAction),
});

export const hardwareChangeSchema = z.object({
  changeType: z.nativeEnum(HardwareChangeType),
  previousValue: z.unknown().nullable(),
  newValue: z.unknown().nullable(),
});

export const pollResponseSchema = z.object({
  pollLogId: z.string().uuid(),
  status: z.nativeEnum(PollStatus),
  softwareChanges: z.array(softwareChangeSchema),
  hardwareChanges: z.array(hardwareChangeSchema),
  storageUsedPercent: z.number().int().nullable(),
});

export const downloadAgentResponseSchema = z.object({
  clientId: z.string().uuid(),
  clientName: z.string().optional(),
  token: z.string().min(1),
  expiresAt: z.string().min(1),
  tokenType: z.literal("agent-download"),
  fileName: z.string().optional(),
});

export const deregisterResponseSchema = z.object({
  agentId: z.string().uuid(),
  deregistered: z.literal(true),
});

export const pollLogSchema = z.object({
  id: z.string().uuid(),
  agentId: z.string().uuid(),
  status: z.nativeEnum(PollStatus),
  isStale: z.boolean(),
  polledAt: z.coerce.date(),
  payload: z.unknown(),
  softwareChanges: z.array(softwareChangeSchema).default([]),
  hardwareChanges: z.array(hardwareChangeSchema).default([]),
});

export const listPollLogsResponseSchema = z.object({
  items: z.array(pollLogSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export const deviceIdForPollsParamsSchema = z.object({
  deviceId: z.string().uuid(),
});

export const scanDeviceResponseSchema = z.object({
  deviceId: z.string().uuid(),
  agentId: z.string().uuid(),
  scannedAt: z.string().min(1),
  source: z.literal("ui-local-scan"),
  pollLogId: z.string().uuid(),
  status: z.nativeEnum(PollStatus),
  softwareChanges: z.array(softwareChangeSchema),
  hardwareChanges: z.array(hardwareChangeSchema),
  storageUsedPercent: z.number().int().nullable(),
});
