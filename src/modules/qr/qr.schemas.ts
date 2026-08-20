import { z } from "zod";
import { DeviceStatus, PollStatus } from "@prisma/client";

export const deviceIdParamsSchema = z.object({
  deviceId: z.string().uuid(),
});

export const qrValueParamsSchema = z.object({
  qrValue: z.string().min(1).max(200),
});

export const qrImageQuerySchema = z.object({
  format: z.enum(["png", "svg"]).default("png"),
});

export type QrImageFormat = z.output<typeof qrImageQuerySchema>["format"];

export const qrCodeSchema = z.object({
  id: z.string().uuid(),
  deviceId: z.string().uuid(),
  qrValue: z.string(),
  printCount: z.number().int(),
  createdAt: z.coerce.date(),
});

export const qrResolveOkSchema = z.object({
  status: z.literal("ok"),
  stale: z.literal(false),
  qrValue: z.string(),
  device: z.object({
    id: z.string().uuid(),
    clientId: z.string().uuid(),
    assetTag: z.string(),
    status: z.nativeEnum(DeviceStatus),
    cpu: z.string().nullable(),
    ram: z.string().nullable(),
    storageUsedPercent: z.number().int().nullable(),
  }),
  agent: z
    .object({
      id: z.string().uuid(),
      lastPollAt: z.coerce.date().nullable(),
      lastPollStatus: z.nativeEnum(PollStatus).nullable(),
    })
    .nullable(),
});

/**
 * Distinct shape for the frontend stale-warning pop-up (missing QR, missing
 * agent, or lastPollAt beyond QR_STALE_POLL_THRESHOLD_MS).
 */
export const qrResolveStaleSchema = z.object({
  status: z.literal("stale_warning"),
  stale: z.literal(true),
  reason: z.enum(["QR_NOT_FOUND", "AGENT_MISSING", "AGENT_POLL_STALE"]),
  message: z.string(),
  qrValue: z.string(),
  device: z
    .object({
      id: z.string().uuid(),
      clientId: z.string().uuid(),
      assetTag: z.string(),
      status: z.nativeEnum(DeviceStatus),
    })
    .nullable(),
  agent: z
    .object({
      id: z.string().uuid(),
      lastPollAt: z.coerce.date().nullable(),
      lastPollStatus: z.nativeEnum(PollStatus).nullable(),
      staleThresholdMs: z.number().int(),
    })
    .nullable(),
});

export const runPollResponseSchema = z.object({
  deviceId: z.string().uuid(),
  agentId: z.string().uuid(),
  requested: z.literal(true),
  requestedAt: z.string().min(1),
});
