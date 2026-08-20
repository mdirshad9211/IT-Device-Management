import { AppUserRole } from "@prisma/client";
import { NotFoundError, ValidationError } from "../../shared/kernel/errors";
import type { DomainEventBus } from "../../shared/kernel/events";
import { enforceAccess, UNSCOPED_ROLES } from "../../shared/kernel/rbac";
import { toSkipTake, type PaginationQuery } from "../../shared/http/schemas/pagination";
import { effectiveWarrantyStatus, resolveSerialNumber } from "./other-network-device.mapping";
import type {
  OtherNetworkDeviceListFilter,
  OtherNetworkDeviceRecord,
  OtherNetworkDeviceRepository,
  UpdateOtherNetworkDeviceData,
} from "./other-network-device.repository";
import type {
  CreateOtherNetworkDeviceBody,
  LinkOtherNetworkDeviceBody,
  OtherNetworkDeviceSummary,
  UpdateOtherNetworkDeviceBody,
} from "./other-network-device.schemas";
import type { OtherDeviceStatus } from "@prisma/client";

export type Actor = { userId: string; role: AppUserRole };

export type OtherNetworkDeviceView = OtherNetworkDeviceRecord & {
  effectiveWarrantyStatus: ReturnType<typeof effectiveWarrantyStatus>;
};

export class OtherNetworkDeviceService {
  constructor(
    private readonly otherNetworkDeviceRepository: OtherNetworkDeviceRepository,
    private readonly eventBus: DomainEventBus,
  ) {}

  /**
   * Creates an Other Network Device (SRS §3.4, 7-field inventory). Serial is
   * mapped with scanner-over-manual precedence.
   */
  async create(input: CreateOtherNetworkDeviceBody, actor: Actor): Promise<OtherNetworkDeviceView> {
    await this.assertClientAccess(input.clientId, actor, "edit");
    if (!(await this.otherNetworkDeviceRepository.clientExists(input.clientId))) {
      throw new NotFoundError("Client not found");
    }

    const serialNumber = resolveSerialNumber({
      scannedSerialNumber: input.scannedSerialNumber,
      manualSerialNumber: input.manualSerialNumber,
    });

    const created = await this.otherNetworkDeviceRepository.create({
      clientId: input.clientId,
      type: input.type,
      name: input.name,
      serialNumber,
      purchaseDate: input.purchaseDate ?? null,
      status: input.status,
      warrantyStatus: input.warrantyStatus,
      warrantyExpiryDate: input.warrantyExpiryDate ?? null,
    });

    this.eventBus.emit("otherNetworkDevice.created", {
      actorId: actor.userId,
      otherNetworkDeviceId: created.id,
      clientId: created.clientId,
    });

    return this.toView(created);
  }

  async list(
    query: PaginationQuery & {
      clientId?: string;
      status?: OtherDeviceStatus;
      attachedDeviceId?: string;
    },
    actor: Actor,
  ) {
    const { skip, take } = toSkipTake(query);
    const filter = await this.listFilter(actor, query);
    const { items, total } = await this.otherNetworkDeviceRepository.list(skip, take, filter);
    return {
      items: items.map((item) => this.toView(item)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async getById(id: string, actor: Actor): Promise<OtherNetworkDeviceView> {
    const row = await this.require(id);
    await this.assertClientAccess(row.clientId, actor, "view");
    return this.toView(row);
  }

  /**
   * Updates the 7 inventory fields. Serial still uses scanner-over-manual when
   * either serial field is present on the PATCH body.
   */
  async update(id: string, input: UpdateOtherNetworkDeviceBody, actor: Actor): Promise<OtherNetworkDeviceView> {
    const existing = await this.require(id);
    await this.assertClientAccess(existing.clientId, actor, "edit");

    const data: UpdateOtherNetworkDeviceData = {};
    if (input.type !== undefined) data.type = input.type;
    if (input.name !== undefined) data.name = input.name;
    if (input.purchaseDate !== undefined) data.purchaseDate = input.purchaseDate;
    if (input.status !== undefined) data.status = input.status;
    if (input.warrantyStatus !== undefined) data.warrantyStatus = input.warrantyStatus;
    if (input.warrantyExpiryDate !== undefined) data.warrantyExpiryDate = input.warrantyExpiryDate;

    if (input.scannedSerialNumber !== undefined || input.manualSerialNumber !== undefined) {
      data.serialNumber = resolveSerialNumber({
        scannedSerialNumber: input.scannedSerialNumber,
        manualSerialNumber: input.manualSerialNumber,
      });
    }

    const updated = await this.otherNetworkDeviceRepository.update(id, data);
    this.eventBus.emit("otherNetworkDevice.updated", {
      actorId: actor.userId,
      otherNetworkDeviceId: id,
      clientId: updated.clientId,
    });
    return this.toView(updated);
  }

  /**
   * Sets or clears attachedDeviceId (link to a Site Inventory Device). Both
   * must belong to the same client.
   */
  async link(id: string, input: LinkOtherNetworkDeviceBody, actor: Actor): Promise<OtherNetworkDeviceView> {
    const existing = await this.require(id);
    await this.assertClientAccess(existing.clientId, actor, "edit");

    if (input.attachedDeviceId) {
      const device = await this.otherNetworkDeviceRepository.deviceExists(input.attachedDeviceId);
      if (!device) {
        throw new NotFoundError("Device not found");
      }
      if (device.clientId !== existing.clientId) {
        throw new ValidationError("Linked device must belong to the same client");
      }
    }

    const updated = await this.otherNetworkDeviceRepository.setAttachedDevice(id, input.attachedDeviceId);
    this.eventBus.emit("otherNetworkDevice.linked", {
      actorId: actor.userId,
      otherNetworkDeviceId: id,
      clientId: updated.clientId,
      attachedDeviceId: updated.attachedDeviceId,
      previousAttachedDeviceId: existing.attachedDeviceId,
    });
    return this.toView(updated);
  }

  async delete(id: string, actor: Actor): Promise<void> {
    const existing = await this.require(id);
    await this.assertClientAccess(existing.clientId, actor, "delete");
    await this.otherNetworkDeviceRepository.delete(id);
    this.eventBus.emit("otherNetworkDevice.deleted", {
      actorId: actor.userId,
      otherNetworkDeviceId: id,
      clientId: existing.clientId,
    });
  }

  /**
   * Summaries for Device read enrichment. Warranty status is effective
   * (read-time). Device must not reimplement OND mapping.
   */
  async listLinkedSummariesForDevice(deviceId: string): Promise<OtherNetworkDeviceSummary[]> {
    const rows = await this.otherNetworkDeviceRepository.listByAttachedDeviceId(deviceId);
    return rows.map((row) => this.toSummary(row));
  }

  async listLinkedSummariesForDevices(
    deviceIds: string[],
  ): Promise<Map<string, OtherNetworkDeviceSummary[]>> {
    const rows = await this.otherNetworkDeviceRepository.listByAttachedDeviceIds(deviceIds);
    const map = new Map<string, OtherNetworkDeviceSummary[]>();
    for (const id of deviceIds) {
      map.set(id, []);
    }
    for (const row of rows) {
      if (!row.attachedDeviceId) continue;
      const list = map.get(row.attachedDeviceId) ?? [];
      list.push(this.toSummary(row));
      map.set(row.attachedDeviceId, list);
    }
    return map;
  }

  private async require(id: string): Promise<OtherNetworkDeviceRecord> {
    const row = await this.otherNetworkDeviceRepository.findById(id);
    if (!row) {
      throw new NotFoundError("Other network device not found");
    }
    return row;
  }

  private toView(row: OtherNetworkDeviceRecord): OtherNetworkDeviceView {
    return {
      ...row,
      effectiveWarrantyStatus: effectiveWarrantyStatus(row.warrantyStatus, row.warrantyExpiryDate),
    };
  }

  private toSummary(row: OtherNetworkDeviceRecord): OtherNetworkDeviceSummary {
    return {
      id: row.id,
      type: row.type,
      name: row.name,
      serialNumber: row.serialNumber,
      status: row.status,
      warrantyStatus: row.warrantyStatus,
      effectiveWarrantyStatus: effectiveWarrantyStatus(row.warrantyStatus, row.warrantyExpiryDate),
      warrantyExpiryDate: row.warrantyExpiryDate,
    };
  }

  private async assertClientAccess(
    clientId: string,
    actor: Actor,
    action: "view" | "edit" | "delete",
  ): Promise<void> {
    const activeAssignedClientIds =
      actor.role === AppUserRole.IT_ENGINEER
        ? await this.otherNetworkDeviceRepository.listActiveAssignedClientIds(actor.userId)
        : [];
    enforceAccess({
      actorUserId: actor.userId,
      role: actor.role,
      entity: "OtherNetworkDevice",
      action,
      targetClientId: clientId,
      activeAssignedClientIds,
      currentAssignment: null,
    });
  }

  private async listFilter(
    actor: Actor,
    query: { clientId?: string; status?: OtherDeviceStatus; attachedDeviceId?: string },
  ): Promise<OtherNetworkDeviceListFilter> {
    const filter: OtherNetworkDeviceListFilter = {
      clientId: query.clientId,
      status: query.status,
      attachedDeviceId: query.attachedDeviceId,
    };

    if (UNSCOPED_ROLES.has(actor.role)) {
      return filter;
    }

    if (actor.role === AppUserRole.IT_ENGINEER) {
      filter.clientIds = await this.otherNetworkDeviceRepository.listActiveAssignedClientIds(actor.userId);
      return filter;
    }

    // CLIENT_MANAGER / EMPLOYEE: no site-wide OND directory (self-service is Device-scoped).
    filter.clientIds = [];
    return filter;
  }
}
