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
import { PrismaClientRepository } from "../modules/client/client.repository";
import { ClientService } from "../modules/client/client.service";
import { ClientController } from "../modules/client/client.controller";
import { PrismaQrRepository } from "../modules/qr/qr.repository";
import { QrService } from "../modules/qr/qr.service";
import { PrismaDeviceRepository } from "../modules/device/device.repository";
import { DeviceService } from "../modules/device/device.service";
import { DeviceLifecycleService } from "../modules/device/device.lifecycle.service";
import { DeviceController } from "../modules/device/device.controller";
import { PrismaAgentRepository } from "../modules/agent/agent.repository";
import { AgentService } from "../modules/agent/agent.service";
import { AgentController } from "../modules/agent/agent.controller";

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

    clientRepository: asClass(PrismaClientRepository).singleton(),
    clientService: asClass(ClientService).singleton(),
    clientController: asClass(ClientController).singleton(),

    qrRepository: asClass(PrismaQrRepository).singleton(),
    qrService: asClass(QrService).singleton(),

    deviceRepository: asClass(PrismaDeviceRepository).singleton(),
    deviceService: asClass(DeviceService).singleton(),
    deviceLifecycleService: asClass(DeviceLifecycleService).singleton(),
    deviceController: asClass(DeviceController).singleton(),

    agentRepository: asClass(PrismaAgentRepository).singleton(),
    agentService: asClass(AgentService).singleton(),
    agentController: asClass(AgentController).singleton(),
  });

  return container;
}
