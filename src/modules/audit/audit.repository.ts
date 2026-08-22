import { Prisma, type AuditAction, type AuditLog, type PrismaClient } from "@prisma/client";
import type { AuditableEvent } from "../../shared/kernel/events";

export type AuditLogRecord = Pick<
  AuditLog,
  "id" | "entityType" | "entityId" | "action" | "performedBy" | "before" | "after" | "createdAt"
> & {
  actor: { id: string; name: string; email: string } | null;
};

export type AuditListFilter = {
  entityType?: string;
  entityId?: string;
  action?: AuditAction;
};

export interface AuditRepository {
  createFromEvent(event: AuditableEvent): Promise<AuditLogRecord>;
  list(skip: number, take: number, filter: AuditListFilter): Promise<{ items: AuditLogRecord[]; total: number }>;
}

export class PrismaAuditRepository implements AuditRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createFromEvent(event: AuditableEvent): Promise<AuditLogRecord> {
    return this.prisma.auditLog.create({
      data: {
        entityType: event.entityType,
        entityId: event.entityId,
        action: event.action,
        performedBy: event.performedBy,
        before: toJson(event.before),
        after: toJson(event.after),
      },
      select: {
        id: true,
        entityType: true,
        entityId: true,
        action: true,
        performedBy: true,
        before: true,
        after: true,
        createdAt: true,
        actor: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async list(
    skip: number,
    take: number,
    filter: AuditListFilter,
  ): Promise<{ items: AuditLogRecord[]; total: number }> {
    const where: Prisma.AuditLogWhereInput = {};
    if (filter.entityType) where.entityType = filter.entityType;
    if (filter.entityId) where.entityId = filter.entityId;
    if (filter.action) where.action = filter.action;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          entityType: true,
          entityId: true,
          action: true,
          performedBy: true,
          before: true,
          after: true,
          createdAt: true,
          actor: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total };
  }
}

function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}
