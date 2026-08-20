import { AppUserRole, Prisma } from "@prisma/client";
import { ConflictError, NotFoundError } from "../../shared/kernel/errors";
import type { DomainEventBus } from "../../shared/kernel/events";
import { enforceAccess, UNSCOPED_ROLES, type RbacAction } from "../../shared/kernel/rbac";
import { toSkipTake, type PaginationQuery } from "../../shared/http/schemas/pagination";
import { diffShallow } from "./device.audit-diff";
import type { DeviceDetail, DeviceListFilter, DeviceRepository, DeviceUpdateData } from "./device.repository";
import type { AllotDeviceBody, AssignmentInput, UpdateDeviceBody } from "./device.schemas";
import type { QrService } from "../qr/qr.service";
import type { OtherNetworkDeviceService } from "../other-network-device/other-network-device.service";
import type { OtherNetworkDeviceSummary } from "../other-network-device/other-network-device.schemas";
import { DeviceStatus } from "@prisma/client";

export type Actor = { userId: string; role: AppUserRole };

export type DeviceDetailWithLinks = DeviceDetail & {
  linkedOtherNetworkDevices: OtherNetworkDeviceSummary[];
};

export class DeviceService {
  constructor(
    private readonly deviceRepository: DeviceRepository,
    private readonly qrService: QrService,
    private readonly otherNetworkDeviceService: OtherNetworkDeviceService,
    private readonly eventBus: DomainEventBus,
  ) {}

  /**
   * SRS §3.2 allotment form — creates Device + current DeviceAssignment + QR
   * in one transaction. Accounts are never auto-created (free-text only).
   */
  async allotDevice(input: AllotDeviceBody, actor: Actor): Promise<DeviceDetailWithLinks> {
    await this.assertClientWritable(input.clientId, actor);

    const exists = await this.deviceRepository.clientExists(input.clientId);
    if (!exists) {
      throw new NotFoundError("Client not found");
    }

    try {
      const device = await this.deviceRepository.allot(toAllotmentData(input), (tx, deviceId) =>
        this.qrService.generateQrForDevice(deviceId, tx),
      );
      this.eventBus.emit("device.allotted", {
        actorId: actor.userId,
        deviceId: device.id,
        clientId: device.clientId,
        assetTag: device.assetTag,
        qrValue: device.qrCode?.qrValue ?? null,
      });
      return this.withLinkedDevices(device);
    } catch (error) {
      throw mapUniqueAssetTag(error);
    }
  }

  /**
   * Paginated inventory. Engineers see devices for every active assigned client.
   * CLIENT_MANAGER / EMPLOYEE are limited to current assignment links.
   */
  async listDevices(
    query: PaginationQuery & { clientId?: string; status?: DeviceStatus },
    actor: Actor,
  ) {
    const { skip, take } = toSkipTake(query);
    const filter = await this.listFilter(actor, query.clientId, query.status);
    const { items, total } = await this.deviceRepository.list(skip, take, filter);
    const linked = await this.otherNetworkDeviceService.listLinkedSummariesForDevices(
      items.map((item) => item.id),
    );
    return {
      items: items.map((item) => ({
        ...item,
        linkedOtherNetworkDevices: linked.get(item.id) ?? [],
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async getDevice(id: string, actor: Actor): Promise<DeviceDetailWithLinks> {
    const device = await this.requireDevice(id);
    await this.assertDeviceAccess(device, actor, "view");
    return this.withLinkedDevices(device);
  }

  /**
   * Autofill for the allotment form manager fields (SRS §3.2). Looks up
   * provisioned CLIENT_MANAGER accounts and historical assignment contacts.
   */
  async lookupManagers(query: string, actor: Actor) {
    this.assertStaffEdit(actor);
    const items = await this.deviceRepository.lookupManagers(query);
    return { items };
  }

  /**
   * PATCH inventory attributes. Emits `device.updated` with a before/after diff
   * for Audit. Does not change assignment, QR, or lifecycle status.
   */
  async updateDevice(id: string, input: UpdateDeviceBody, actor: Actor): Promise<DeviceDetailWithLinks> {
    const existing = await this.requireDevice(id);
    await this.assertDeviceAccess(existing, actor, "edit");

    const updated = await this.deviceRepository.update(id, toUpdateData(input));
    const changes = diffShallow(inventorySnapshot(existing), inventorySnapshot(updated));
    this.eventBus.emit("device.updated", {
      actorId: actor.userId,
      deviceId: id,
      changes,
    });
    return this.withLinkedDevices(updated);
  }

  /**
   * User-on-device change: new current DeviceAssignment. Device.id and QrCode
   * are not modified.
   */
  async changeAssignment(deviceId: string, input: AssignmentInput, actor: Actor) {
    const device = await this.requireDevice(deviceId);
    await this.assertDeviceAccess(device, actor, "edit");
    const assignment = await this.deviceRepository.changeAssignment(deviceId, input);
    this.eventBus.emit("device.assignment_changed", {
      actorId: actor.userId,
      deviceId,
      assignmentId: assignment.id,
      previousAssignmentId: device.currentAssignment?.id ?? null,
    });
    return assignment;
  }

  async listSoftwareHistory(deviceId: string, query: PaginationQuery, actor: Actor) {
    const device = await this.requireDevice(deviceId);
    await this.assertDeviceAccess(device, actor, "view");
    const { skip, take } = toSkipTake(query);
    const { items, total } = await this.deviceRepository.listSoftwareHistory(deviceId, skip, take);
    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  async listHardwareHistory(deviceId: string, query: PaginationQuery, actor: Actor) {
    const device = await this.requireDevice(deviceId);
    await this.assertDeviceAccess(device, actor, "view");
    const { skip, take } = toSkipTake(query);
    const { items, total } = await this.deviceRepository.listHardwareHistory(deviceId, skip, take);
    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  async requireDevice(id: string): Promise<DeviceDetail> {
    const device = await this.deviceRepository.findById(id);
    if (!device) {
      throw new NotFoundError("Device not found");
    }
    return device;
  }

  async assertClientWritable(clientId: string, actor: Actor): Promise<void> {
    const activeAssignedClientIds =
      actor.role === AppUserRole.IT_ENGINEER
        ? await this.deviceRepository.listActiveAssignedClientIds(actor.userId)
        : [];
    enforceAccess({
      actorUserId: actor.userId,
      role: actor.role,
      entity: "Device",
      action: "edit",
      targetClientId: clientId,
      activeAssignedClientIds,
      currentAssignment: null,
    });
  }

  async assertDeviceAccess(device: DeviceDetail, actor: Actor, action: RbacAction): Promise<void> {
    const activeAssignedClientIds =
      actor.role === AppUserRole.IT_ENGINEER
        ? await this.deviceRepository.listActiveAssignedClientIds(actor.userId)
        : [];
    enforceAccess({
      actorUserId: actor.userId,
      role: actor.role,
      entity: "Device",
      action,
      targetClientId: device.clientId,
      activeAssignedClientIds,
      currentAssignment: device.currentAssignment,
    });
  }

  private async withLinkedDevices(device: DeviceDetail): Promise<DeviceDetailWithLinks> {
    const linkedOtherNetworkDevices =
      await this.otherNetworkDeviceService.listLinkedSummariesForDevice(device.id);
    return { ...device, linkedOtherNetworkDevices };
  }

  private assertStaffEdit(actor: Actor): void {
    enforceAccess({
      actorUserId: actor.userId,
      role: actor.role,
      entity: "Device",
      action: "edit",
      activeAssignedClientIds: [],
      currentAssignment: null,
    });
  }

  private async listFilter(
    actor: Actor,
    clientId: string | undefined,
    status: DeviceStatus | undefined,
  ): Promise<DeviceListFilter> {
    const filter: DeviceListFilter = { clientId, status };

    if (UNSCOPED_ROLES.has(actor.role)) {
      return filter;
    }

    if (actor.role === AppUserRole.IT_ENGINEER) {
      filter.clientIds = await this.deviceRepository.listActiveAssignedClientIds(actor.userId);
      return filter;
    }

    if (actor.role === AppUserRole.CLIENT_MANAGER) {
      filter.managerUserId = actor.userId;
      return filter;
    }

    filter.employeeUserId = actor.userId;
    return filter;
  }
}

function inventorySnapshot(device: DeviceDetail): Record<string, unknown> {
  return {
    cpu: device.cpu,
    ram: device.ram,
    storageTotal: device.storageTotal,
    storageUsedPercent: device.storageUsedPercent,
    pciCards: device.pciCards,
    soundCards: device.soundCards,
    connectedDevices: device.connectedDevices,
    installedSoftware: device.installedSoftware,
  };
}

function toAllotmentData(input: AllotDeviceBody) {
  return {
    clientId: input.clientId,
    assetTag: input.assetTag,
    cpu: input.cpu,
    ram: input.ram,
    storageTotal: input.storageTotal,
    storageUsedPercent: input.storageUsedPercent,
    pciCards: input.pciCards as Prisma.InputJsonValue | undefined,
    soundCards: input.soundCards as Prisma.InputJsonValue | undefined,
    connectedDevices: input.connectedDevices as Prisma.InputJsonValue | undefined,
    installedSoftware: input.installedSoftware as Prisma.InputJsonValue | undefined,
    assignment: input.assignment,
  };
}

function toUpdateData(input: UpdateDeviceBody): DeviceUpdateData {
  const data: DeviceUpdateData = {};
  if (input.cpu !== undefined) data.cpu = input.cpu;
  if (input.ram !== undefined) data.ram = input.ram;
  if (input.storageTotal !== undefined) data.storageTotal = input.storageTotal;
  if (input.storageUsedPercent !== undefined) data.storageUsedPercent = input.storageUsedPercent;
  if (input.pciCards !== undefined) {
    data.pciCards = input.pciCards === null ? Prisma.JsonNull : (input.pciCards as Prisma.InputJsonValue);
  }
  if (input.soundCards !== undefined) {
    data.soundCards = input.soundCards === null ? Prisma.JsonNull : (input.soundCards as Prisma.InputJsonValue);
  }
  if (input.connectedDevices !== undefined) {
    data.connectedDevices =
      input.connectedDevices === null ? Prisma.JsonNull : (input.connectedDevices as Prisma.InputJsonValue);
  }
  if (input.installedSoftware !== undefined) {
    data.installedSoftware =
      input.installedSoftware === null ? Prisma.JsonNull : (input.installedSoftware as Prisma.InputJsonValue);
  }
  return data;
}

function mapUniqueAssetTag(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return new ConflictError("A device with this asset tag already exists");
  }
  return error;
}
