import { EventEmitter2 } from "eventemitter2";
import { AuditAction } from "@prisma/client";

/**
 * Shared shape required on every domain event payload so Audit can record
 * mutations with a single code path (no per-event switch).
 */
export type AuditableEvent = {
  entityType: string;
  entityId: string;
  action: AuditAction;
  performedBy: string | null;
  before: unknown;
  after: unknown;
};

/**
 * Domain event map. Every value extends {@link AuditableEvent}.
 *
 * Modules stay decoupled: producers emit; Audit / Notification listen.
 */
export interface DomainEvents {
  "appUser.created": AuditableEvent & { email: string; role: string };
  "appUser.updated": AuditableEvent & {
    changes: {
      name?: string;
      email?: string;
      role?: string;
      isActive?: boolean;
      passwordChanged: boolean;
    };
  };
  "deviceAssignment.accountLinked": AuditableEvent & {
    deviceId: string;
    linkedUserId: string;
    linkAs: "employee" | "manager";
  };
  "client.created": AuditableEvent & { name: string };
  "client.location_changed": AuditableEvent & {
    previousLocation: string;
    newLocation: string;
  };
  "client.engineer.assigned": AuditableEvent & {
    engineerUserId: string;
    assignmentId: string;
  };
  "client.engineer.offboarded": AuditableEvent & {
    engineerUserId: string;
    assignmentId: string;
  };
  "device.allotted": AuditableEvent & {
    clientId: string;
    assetTag: string;
    qrValue: string | null;
    recipients: string[];
  };
  "device.updated": AuditableEvent & {
    changes: Record<string, { from: unknown; to: unknown }>;
  };
  "device.assignment_changed": AuditableEvent & {
    assignmentId: string;
    previousAssignmentId: string | null;
  };
  "device.discarded": DeviceLifecycleEventPayload;
  "device.reactivated": DeviceLifecycleEventPayload;
  "device.deleted": DeviceLifecycleEventPayload;
  "device.retired": DeviceLifecycleEventPayload;
  "device.scrapped": DeviceLifecycleEventPayload;
  /** Fired by the lifecycle sweep ~15 days before deletionDueAt. */
  "device.discard.warning": AuditableEvent & {
    clientId: string;
    assetTag: string;
    deletionDueAt: string;
    recipients: string[];
  };
  "agent.polled": AuditableEvent & {
    agentId: string;
    pollLogId: string;
    status: string;
  };
  "device.storage.threshold_breached": AuditableEvent & {
    clientId: string;
    agentId: string;
    storageUsedPercent: number;
    recipients: string[];
  };
  "agent.deregistered": AuditableEvent & {
    agentId: string;
    clientId: string;
  };
  "agent.download_token.issued": AuditableEvent & {
    clientId: string;
  };
  "qr.generated": AuditableEvent & {
    qrValue: string;
  };
  "qr.printed": AuditableEvent & {
    qrValue: string;
    printCount: number;
  };
  "agent.poll.requested": AuditableEvent & {
    agentId: string;
    source: "qr";
    requestedAt: string;
  };
  "otherNetworkDevice.created": AuditableEvent & {
    clientId: string;
  };
  "otherNetworkDevice.updated": AuditableEvent & {
    clientId: string;
  };
  "otherNetworkDevice.linked": AuditableEvent & {
    clientId: string;
    attachedDeviceId: string | null;
    previousAttachedDeviceId: string | null;
  };
  "otherNetworkDevice.deleted": AuditableEvent & {
    clientId: string;
  };
}

export type DeviceLifecycleEventPayload = AuditableEvent & {
  fromStatus: string;
  toStatus: string;
  eventType: string;
};

/**
 * Events that persist an AuditLog row. High-frequency / notify-only events are
 * excluded (polls, storage alerts, discard warnings, on-demand poll requests).
 */
export const MUTATION_EVENTS = [
  "appUser.created",
  "appUser.updated",
  "deviceAssignment.accountLinked",
  "client.created",
  "client.location_changed",
  "client.engineer.assigned",
  "client.engineer.offboarded",
  "device.allotted",
  "device.updated",
  "device.assignment_changed",
  "device.discarded",
  "device.reactivated",
  "device.deleted",
  "device.retired",
  "device.scrapped",
  "agent.deregistered",
  "agent.download_token.issued",
  "qr.generated",
  "qr.printed",
  "otherNetworkDevice.created",
  "otherNetworkDevice.updated",
  "otherNetworkDevice.linked",
  "otherNetworkDevice.deleted",
] as const satisfies ReadonlyArray<keyof DomainEvents>;

export type MutationEventName = (typeof MUTATION_EVENTS)[number];

export class DomainEventBus {
  private readonly emitter = new EventEmitter2({ wildcard: false, maxListeners: 50 });

  emit<K extends keyof DomainEvents>(event: K, payload: DomainEvents[K]): void {
    this.emitter.emit(event as string, payload);
  }

  on<K extends keyof DomainEvents>(
    event: K,
    handler: (payload: DomainEvents[K]) => void | Promise<void>,
  ): void {
    this.emitter.on(event as string, handler);
  }

  /**
   * Registers one handler for every mutation event. Payload is always
   * {@link AuditableEvent} — Audit uses this exclusively.
   */
  onMutation(handler: (event: MutationEventName, payload: AuditableEvent) => void | Promise<void>): void {
    for (const event of MUTATION_EVENTS) {
      this.emitter.on(event, (payload: AuditableEvent) => {
        void Promise.resolve(handler(event, payload)).catch(() => {
          /* listener errors must not crash the emitter */
        });
      });
    }
  }
}

/**
 * Factory for the process-local bus. Prefer resolving `eventBus` from the
 * awilix container so each app instance (and test) gets an isolated bus.
 */
export function createDomainEventBus(): DomainEventBus {
  return new DomainEventBus();
}

/** @deprecated Prefer container-scoped `eventBus`; kept for scripts that need a bus without DI. */
export const domainEventBus = createDomainEventBus();
