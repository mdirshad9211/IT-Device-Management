import { EventEmitter2 } from "eventemitter2";

/**
 * Domain event map. Each module extends this as it's implemented (e.g. the
 * Device module adds "device.allotted", "device.discarded", etc.). Kept
 * empty here in the boilerplate phase — do not invent event names ahead of
 * the module that owns them.
 *
 * This is what lets modules stay decoupled: Device never imports Notification
 * or Audit directly. It emits an event; whichever modules care, listen.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface DomainEvents {}

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
