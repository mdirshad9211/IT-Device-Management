import { createContainer, asValue, asClass, AwilixContainer } from "awilix";
import { prisma } from "../shared/kernel/prisma";
import { domainEventBus } from "../shared/kernel/events";
import { logger } from "../shared/kernel/logger";
import { PrismaAuthRepository } from "../modules/auth/auth.repository";
import { AuthService } from "../modules/auth/auth.service";
import { AuthController } from "../modules/auth/auth.controller";
import { PrismaUserManagementRepository } from "../modules/user-management/user-management.repository";
import { UserManagementService } from "../modules/user-management/user-management.service";
import { UserManagementController } from "../modules/user-management/user-management.controller";

/**
 * Shared infrastructure singletons plus module service/repository pairs.
 * Controllers resolve via `request.container.resolve(...)` (see app.ts).
 */
export function buildContainer(): AwilixContainer {
  const container = createContainer();

  container.register({
    prisma: asValue(prisma),
    eventBus: asValue(domainEventBus),
    logger: asValue(logger),

    authRepository: asClass(PrismaAuthRepository).singleton(),
    authService: asClass(AuthService).singleton(),
    authController: asClass(AuthController).singleton(),

    userManagementRepository: asClass(PrismaUserManagementRepository).singleton(),
    userManagementService: asClass(UserManagementService).singleton(),
    userManagementController: asClass(UserManagementController).singleton(),
  });

  return container;
}
