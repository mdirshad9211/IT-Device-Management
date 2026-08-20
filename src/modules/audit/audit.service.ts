import type { AuditableEvent, DomainEventBus } from "../../shared/kernel/events";
import { toSkipTake, type PaginationQuery } from "../../shared/http/schemas/pagination";
import type { Logger } from "pino";
import type { AuditListFilter, AuditRepository } from "./audit.repository";
import type { AuditAction } from "@prisma/client";
import { enrichAuditableEvent } from "./audit.diff";

/**
 * Persists AuditLog rows from domain mutation events. One code path: every
 * mutation payload is an {@link AuditableEvent}. UPDATE rows are enriched with
 * a field-level `fieldChanges` map so every minor change is explicit.
 */
export class AuditService {
  constructor(
    private readonly auditRepository: AuditRepository,
    private readonly logger: Logger,
  ) {}

  /**
   * Single write path for all mutation events (SRS audit trail).
   */
  async record(event: AuditableEvent): Promise<void> {
    try {
      await this.auditRepository.createFromEvent(enrichAuditableEvent(event));
    } catch (error) {
      this.logger.error({ err: error, entityType: event.entityType, entityId: event.entityId }, "audit write failed");
    }
  }

  async list(
    query: PaginationQuery & { entityType?: string; entityId?: string; action?: AuditAction },
  ) {
    const { skip, take } = toSkipTake(query);
    const filter: AuditListFilter = {
      entityType: query.entityType,
      entityId: query.entityId,
      action: query.action,
    };
    const { items, total } = await this.auditRepository.list(skip, take, filter);
    return { items, page: query.page, pageSize: query.pageSize, total };
  }
}

/**
 * Subscribes to every mutation event via {@link DomainEventBus.onMutation}.
 * Constructed once at process start (container + server bootstrap).
 */
export class AuditListener {
  constructor(
    private readonly eventBus: DomainEventBus,
    private readonly auditService: AuditService,
  ) {
    this.eventBus.onMutation((_event, payload) => this.auditService.record(payload));
  }
}
