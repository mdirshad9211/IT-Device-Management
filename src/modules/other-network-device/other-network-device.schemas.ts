import { z } from "zod";
import { OtherDeviceStatus, OtherDeviceType, WarrantyStatus } from "@prisma/client";
import { paginationSchema } from "../../shared/http/schemas/pagination";

export const otherNetworkDeviceIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const listOtherNetworkDevicesQuerySchema = paginationSchema.extend({
  clientId: z.string().uuid().optional(),
  status: z.nativeEnum(OtherDeviceStatus).optional(),
  attachedDeviceId: z.string().uuid().optional(),
});

/**
 * Create DTO — 7 inventory fields plus clientId. Serial is supplied as
 * scanned and/or manual; mapping applies scanner-over-manual precedence.
 */
export const createOtherNetworkDeviceBodySchema = z.object({
  clientId: z.string().uuid(),
  type: z.nativeEnum(OtherDeviceType),
  name: z.string().min(1).max(200),
  scannedSerialNumber: z.string().max(200).nullable().optional(),
  manualSerialNumber: z.string().max(200).nullable().optional(),
  purchaseDate: z.coerce.date().nullable().optional(),
  status: z.nativeEnum(OtherDeviceStatus).optional().default(OtherDeviceStatus.STOCK),
  warrantyStatus: z.nativeEnum(WarrantyStatus).optional().default(WarrantyStatus.NO_WARRANTY),
  warrantyExpiryDate: z.coerce.date().nullable().optional(),
});

export type CreateOtherNetworkDeviceBody = z.output<typeof createOtherNetworkDeviceBodySchema>;

export const updateOtherNetworkDeviceBodySchema = z
  .object({
    type: z.nativeEnum(OtherDeviceType).optional(),
    name: z.string().min(1).max(200).optional(),
    scannedSerialNumber: z.string().max(200).nullable().optional(),
    manualSerialNumber: z.string().max(200).nullable().optional(),
    purchaseDate: z.coerce.date().nullable().optional(),
    status: z.nativeEnum(OtherDeviceStatus).optional(),
    warrantyStatus: z.nativeEnum(WarrantyStatus).optional(),
    warrantyExpiryDate: z.coerce.date().nullable().optional(),
  })
  .refine(
    (body) =>
      Object.keys(body).some((key) => body[key as keyof typeof body] !== undefined),
    { message: "At least one field is required" },
  );

export type UpdateOtherNetworkDeviceBody = z.output<typeof updateOtherNetworkDeviceBodySchema>;

export const linkOtherNetworkDeviceBodySchema = z.object({
  attachedDeviceId: z.string().uuid().nullable(),
});

export type LinkOtherNetworkDeviceBody = z.output<typeof linkOtherNetworkDeviceBodySchema>;

export const otherNetworkDeviceSchema = z.object({
  id: z.string().uuid(),
  clientId: z.string().uuid(),
  type: z.nativeEnum(OtherDeviceType),
  name: z.string(),
  serialNumber: z.string().nullable(),
  purchaseDate: z.coerce.date().nullable(),
  status: z.nativeEnum(OtherDeviceStatus),
  attachedDeviceId: z.string().uuid().nullable(),
  /** Stored enum from DB (may lag behind expiry). */
  warrantyStatus: z.nativeEnum(WarrantyStatus),
  /** Read-time effective status (EXPIRED when warrantyExpiryDate < today). */
  effectiveWarrantyStatus: z.nativeEnum(WarrantyStatus),
  warrantyExpiryDate: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const otherNetworkDeviceSummarySchema = z.object({
  id: z.string().uuid(),
  type: z.nativeEnum(OtherDeviceType),
  name: z.string(),
  serialNumber: z.string().nullable(),
  status: z.nativeEnum(OtherDeviceStatus),
  warrantyStatus: z.nativeEnum(WarrantyStatus),
  effectiveWarrantyStatus: z.nativeEnum(WarrantyStatus),
  warrantyExpiryDate: z.coerce.date().nullable(),
});

export type OtherNetworkDeviceSummary = z.output<typeof otherNetworkDeviceSummarySchema>;

export const listOtherNetworkDevicesResponseSchema = z.object({
  items: z.array(otherNetworkDeviceSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
