import { z } from "zod";
import { DeviceStatus, HardwareChangeType, LifecycleEventType, SoftwareChangeAction } from "@prisma/client";
import { paginationSchema } from "../../shared/http/schemas/pagination";

const jsonValue = z.unknown().optional();

export const assignmentInputSchema = z.object({
  userName: z.string().min(1).max(200),
  userPhone: z.string().min(1).max(50),
  userEmail: z.string().email(),
  department: z.string().min(1).max(200),
  managerName: z.string().min(1).max(200),
  managerPhone: z.string().min(1).max(50),
  managerEmail: z.string().email(),
});

export type AssignmentInput = z.output<typeof assignmentInputSchema>;

export const allotDeviceBodySchema = z.object({
  clientId: z.string().uuid(),
  assetTag: z.string().min(1).max(80),
  cpu: z.string().max(200).optional(),
  ram: z.string().max(200).optional(),
  storageTotal: z.string().max(200).optional(),
  storageUsedPercent: z.number().int().min(0).max(100).optional(),
  pciCards: jsonValue,
  soundCards: jsonValue,
  connectedDevices: jsonValue,
  installedSoftware: jsonValue,
  assignment: assignmentInputSchema,
});

export type AllotDeviceBody = z.output<typeof allotDeviceBodySchema>;

export const updateDeviceBodySchema = z
  .object({
    cpu: z.string().max(200).nullable().optional(),
    ram: z.string().max(200).nullable().optional(),
    storageTotal: z.string().max(200).nullable().optional(),
    storageUsedPercent: z.number().int().min(0).max(100).nullable().optional(),
    pciCards: z.unknown().nullable().optional(),
    soundCards: z.unknown().nullable().optional(),
    connectedDevices: z.unknown().nullable().optional(),
    installedSoftware: z.unknown().nullable().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: "At least one field is required",
  });

export type UpdateDeviceBody = z.output<typeof updateDeviceBodySchema>;

export const deviceIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const listDevicesQuerySchema = paginationSchema.extend({
  clientId: z.string().uuid().optional(),
  status: z.nativeEnum(DeviceStatus).optional(),
});

export const managerLookupQuerySchema = z.object({
  query: z.string().min(1).max(200),
});

export const lifecycleBodySchema = z.object({
  eventType: z.nativeEnum(LifecycleEventType),
});

export type LifecycleBody = z.output<typeof lifecycleBodySchema>;

export const assignmentSchema = z.object({
  id: z.string().uuid(),
  deviceId: z.string().uuid(),
  userName: z.string(),
  userPhone: z.string(),
  userEmail: z.string(),
  department: z.string(),
  managerName: z.string(),
  managerPhone: z.string(),
  managerEmail: z.string(),
  employeeUserId: z.string().uuid().nullable(),
  managerUserId: z.string().uuid().nullable(),
  managerAcknowledgedAt: z.coerce.date().nullable(),
  isCurrent: z.boolean(),
  assignedAt: z.coerce.date(),
  unassignedAt: z.coerce.date().nullable(),
});

export const qrCodeSchema = z.object({
  id: z.string().uuid(),
  deviceId: z.string().uuid(),
  qrValue: z.string(),
  printCount: z.number().int(),
  createdAt: z.coerce.date(),
});

export const deviceSchema = z.object({
  id: z.string().uuid(),
  clientId: z.string().uuid(),
  assetTag: z.string(),
  cpu: z.string().nullable(),
  ram: z.string().nullable(),
  storageTotal: z.string().nullable(),
  storageUsedPercent: z.number().int().nullable(),
  pciCards: z.unknown().nullable(),
  soundCards: z.unknown().nullable(),
  connectedDevices: z.unknown().nullable(),
  installedSoftware: z.unknown().nullable(),
  status: z.nativeEnum(DeviceStatus),
  discardedAt: z.coerce.date().nullable(),
  deletionDueAt: z.coerce.date().nullable(),
  retiredFlag: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const deviceDetailSchema = deviceSchema.extend({
  qrCode: qrCodeSchema.nullable(),
  currentAssignment: assignmentSchema.nullable(),
});

export const listDevicesResponseSchema = z.object({
  items: z.array(deviceDetailSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export const managerLookupItemSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  phone: z.string().nullable(),
  userId: z.string().uuid().nullable(),
});

export const managerLookupResponseSchema = z.object({
  items: z.array(managerLookupItemSchema),
});

export const softwareHistoryItemSchema = z.object({
  id: z.string().uuid(),
  deviceId: z.string().uuid(),
  pollLogId: z.string().uuid().nullable(),
  softwareName: z.string(),
  action: z.nativeEnum(SoftwareChangeAction),
  detectedAt: z.coerce.date(),
});

export const hardwareHistoryItemSchema = z.object({
  id: z.string().uuid(),
  deviceId: z.string().uuid(),
  pollLogId: z.string().uuid().nullable(),
  changeType: z.nativeEnum(HardwareChangeType),
  previousValue: z.unknown().nullable(),
  newValue: z.unknown().nullable(),
  detectedAt: z.coerce.date(),
});

export const softwareHistoryResponseSchema = z.object({
  items: z.array(softwareHistoryItemSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export const hardwareHistoryResponseSchema = z.object({
  items: z.array(hardwareHistoryItemSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
