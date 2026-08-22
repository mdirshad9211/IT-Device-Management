import { AuditAction } from "@prisma/client";
import { z } from "zod";
import { paginationSchema } from "../../shared/http/schemas/pagination";

export const listAuditLogsQuerySchema = paginationSchema.extend({
  entityType: z.string().min(1).max(100).optional(),
  entityId: z.string().uuid().optional(),
  action: z.nativeEnum(AuditAction).optional(),
});

export const auditLogSchema = z.object({
  id: z.string().uuid(),
  entityType: z.string(),
  entityId: z.string(),
  action: z.nativeEnum(AuditAction),
  performedBy: z.string().uuid().nullable(),
  actor: z
    .object({
      id: z.string().uuid(),
      name: z.string(),
      email: z.string().email(),
    })
    .nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  createdAt: z.coerce.date(),
});

export const listAuditLogsResponseSchema = z.object({
  items: z.array(auditLogSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
