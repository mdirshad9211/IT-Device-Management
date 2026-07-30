import { createContainer, asValue, AwilixContainer } from "awilix";
import { prisma } from "../shared/kernel/prisma";
import { domainEventBus } from "../shared/kernel/events";
import { logger } from "../shared/kernel/logger";

/**
 * Shared infrastructure singletons only, for now. As each module gets its
 * business logic built out (per the reference Cursor prompts), its
 * service/repository pairs get registered here with asClass(...), e.g.:
 *
 *   container.register({
 *     deviceRepository: asClass(PrismaDeviceRepository).singleton(),
 *     deviceService: asClass(DeviceService).singleton(),
 *   });
 *
 * Controllers resolve what they need via `request.container.resolve(...)`
 * (see the `container` decorator registered in app.ts) rather than importing
 * concrete classes — this is what keeps services swappable/testable.
 */
export function buildContainer(): AwilixContainer {
  const container = createContainer();

  container.register({
    prisma: asValue(prisma),
    eventBus: asValue(domainEventBus),
    logger: asValue(logger),
  });

  return container;
}
