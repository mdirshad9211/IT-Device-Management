import { EventEmitter2 } from "eventemitter2";

/**
 * Domain event map. Each module extends this as it's implemented (e.g. the
 * Device module adds "device.allotted", "device.discarded", etc.).
 *
 * This is what lets modules stay decoupled: Device never imports Notification
 * or Audit directly. It emits an event; whichever modules care, listen.
 */
export interface DomainEvents {
  "appUser.created": { actorId: string; userId: string; email: string; role: string };
  "appUser.updated": {
    actorId: string;
    userId: string;
    changes: {
      name?: string;
      email?: string;
      role?: string;
      isActive?: boolean;
      passwordChanged: boolean;
    };
  };
  "deviceAssignment.accountLinked": {
    actorId: string;
    deviceId: string;
    assignmentId: string;
    linkedUserId: string;
    linkAs: "employee" | "manager";
  };
  "client.created": { actorId: string; clientId: string; name: string };
  "client.location_changed": {
    actorId: string;
    clientId: string;
    previousLocation: string;
    newLocation: string;
  };
  "client.engineer.assigned": {
    actorId: string;
    clientId: string;
    engineerUserId: string;
    assignmentId: string;
  };
  "client.engineer.offboarded": {
    actorId: string;
    clientId: string;
    engineerUserId: string;
    assignmentId: string;
  };
  "device.allotted": {
    actorId: string;
    deviceId: string;
    clientId: string;
    assetTag: string;
    qrValue: string | null;
  };
  "device.updated": {
    actorId: string;
    deviceId: string;
    changes: Record<string, { from: unknown; to: unknown }>;
  };
  "device.assignment_changed": {
    actorId: string;
    deviceId: string;
    assignmentId: string;
    previousAssignmentId: string | null;
  };
  "device.discarded": DeviceLifecycleEventPayload;
  "device.reactivated": DeviceLifecycleEventPayload;
  "device.deleted": DeviceLifecycleEventPayload;
  "device.retired": DeviceLifecycleEventPayload;
  "device.scrapped": DeviceLifecycleEventPayload;
  "agent.polled": {
    agentId: string;
    deviceId: string;
    pollLogId: string;
    status: string;
  };
  "device.storage.threshold_breached": {
    deviceId: string;
    clientId: string;
    agentId: string;
    storageUsedPercent: number;
  };
  "agent.deregistered": {
    agentId: string;
    deviceId: string;
    clientId: string;
  };
  "agent.download_token.issued": {
    actorId: string;
    clientId: string;
  };
}

export type DeviceLifecycleEventPayload = {
  actorId: string;
  deviceId: string;
  fromStatus: string;
  toStatus: string;
  eventType: string;
};

export class DomainEventBus {
  private readonly emitter = new EventEmitter2({ wildcard: false, maxListeners: 50 });

  emit<K extends keyof DomainEvents>(event: K, payload: DomainEvents[K]): void {
    this.emitter.emit(event as string, payload);
  }

  on<K extends keyof DomainEvents>(event: K, handler: (payload: DomainEvents[K]) => void | Promise<void>): void {
    this.emitter.on(event as string, handler);
  }
}

/**
 * Single shared instance — registered in the awilix container (see
 * config/container.ts) and injected into module services/listeners rather
 * than imported directly, to keep the pattern testable.
 */
export const domainEventBus = new DomainEventBus();
