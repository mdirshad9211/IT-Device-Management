import { createContainer, asValue, asClass, asFunction, AwilixContainer, InjectionMode } from "awilix";
import { prisma } from "../shared/kernel/prisma";
import { createDomainEventBus } from "../shared/kernel/events";
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
import { QrController } from "../modules/qr/qr.controller";
import { PrismaDeviceRepository } from "../modules/device/device.repository";
import { DeviceService } from "../modules/device/device.service";
import { DeviceLifecycleService } from "../modules/device/device.lifecycle.service";
import { DeviceController } from "../modules/device/device.controller";
import { PrismaAgentRepository } from "../modules/agent/agent.repository";
import { AgentService } from "../modules/agent/agent.service";
import { AgentController } from "../modules/agent/agent.controller";
import { PrismaOtherNetworkDeviceRepository } from "../modules/other-network-device/other-network-device.repository";
import { OtherNetworkDeviceService } from "../modules/other-network-device/other-network-device.service";
import { OtherNetworkDeviceController } from "../modules/other-network-device/other-network-device.controller";
import { PrismaAuditRepository } from "../modules/audit/audit.repository";
import { AuditService, AuditListener } from "../modules/audit/audit.service";
import { AuditController } from "../modules/audit/audit.controller";
import { PrismaNotificationRepository } from "../modules/notification/notification.repository";
import { NotificationService } from "../modules/notification/notification.service";
import { NotificationController } from "../modules/notification/notification.controller";
import { NotificationListener } from "../modules/notification/notification.listener";
import { NotificationMailer } from "../modules/notification/notification.mailer";
import { LifecycleSweepService } from "../jobs/lifecycle-sweep.job";

/**
 * Shared infrastructure singletons plus module service/repository pairs.
 * Controllers resolve via `request.container.resolve(...)` (see app.ts).
 *
 * CLASSIC injection so constructors can use injected deps immediately
 * (PROXY treats unknown property access like `onMutation` as resolve tokens).
 */
export function buildContainer(): AwilixContainer {
  const container = createContainer({ injectionMode: InjectionMode.CLASSIC });

  container.register({
    prisma: asValue(prisma),
    eventBus: asFunction(createDomainEventBus).singleton(),
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
    qrController: asClass(QrController).singleton(),

    otherNetworkDeviceRepository: asClass(PrismaOtherNetworkDeviceRepository).singleton(),
    otherNetworkDeviceService: asClass(OtherNetworkDeviceService).singleton(),
    otherNetworkDeviceController: asClass(OtherNetworkDeviceController).singleton(),

    deviceRepository: asClass(PrismaDeviceRepository).singleton(),
    deviceService: asClass(DeviceService).singleton(),
    deviceLifecycleService: asClass(DeviceLifecycleService).singleton(),
    deviceController: asClass(DeviceController).singleton(),

    agentRepository: asClass(PrismaAgentRepository).singleton(),
    agentService: asClass(AgentService).singleton(),
    agentController: asClass(AgentController).singleton(),

    auditRepository: asClass(PrismaAuditRepository).singleton(),
    auditService: asClass(AuditService).singleton(),
    auditController: asClass(AuditController).singleton(),
    auditListener: asClass(AuditListener).singleton(),

    notificationRepository: asClass(PrismaNotificationRepository).singleton(),
    notificationService: asClass(NotificationService).singleton(),
    notificationController: asClass(NotificationController).singleton(),
    notificationMailer: asClass(NotificationMailer).singleton(),
    notificationListener: asClass(NotificationListener).singleton(),

    lifecycleSweepService: asClass(LifecycleSweepService).singleton(),
  });

  return container;
}
