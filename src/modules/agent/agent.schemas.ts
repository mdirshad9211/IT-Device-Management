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
});

export const softwareChangeSchema = z.object({
  softwareName: z.string(),
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
  token: z.string().min(1),
  expiresAt: z.string().min(1),
  tokenType: z.literal("agent-download"),
});

export const deregisterResponseSchema = z.object({
  agentId: z.string().uuid(),
  deregistered: z.literal(true),
});
