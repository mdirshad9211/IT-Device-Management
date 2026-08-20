import { AppUserRole, AuditAction, Prisma } from "@prisma/client";
import { ConflictError, NotFoundError, ValidationError } from "../../shared/kernel/errors";
import type { DomainEventBus } from "../../shared/kernel/events";
import { UNSCOPED_ROLES } from "../../shared/kernel/rbac";
import { toSkipTake, type PaginationQuery } from "../../shared/http/schemas/pagination";
import type { ClientRepository } from "./client.repository";
import type { AssignEngineerBody, CreateClientBody, UpdateLocationBody } from "./client.schemas";

export class ClientService {
  constructor(
    private readonly clientRepository: ClientRepository,
    private readonly eventBus: DomainEventBus,
  ) {}

  /**
   * Creates a site (Client) and the first current SiteLocation row.
   * SRS site-definition — a Client is a physical site, not an account.
   */
  async createClient(input: CreateClientBody, actorUserId: string) {
    try {
      const client = await this.clientRepository.create({
        name: input.name,
        currentLocation: input.currentLocation,
      });
      this.eventBus.emit("client.created", {
        entityType: "Client",
        entityId: client.id,
        action: AuditAction.CREATE,
        performedBy: actorUserId,
        before: null,
        after: { id: client.id, name: client.name, currentLocation: client.currentLocation },
        name: client.name,
      });
      return client;
    } catch (error) {
      throw mapUniqueClientName(error);
    }
  }

  /**
   * Paginated client directory. Unscoped roles see every site. IT_ENGINEER is
   * filtered server-side to active EngineerAssignment client ids. CLIENT_MANAGER
   * and EMPLOYEE do not receive a site directory (empty page).
   */
  async listClients(query: PaginationQuery, actor: { userId: string; role: AppUserRole }) {
    const { skip, take } = toSkipTake(query);
    let clientIds: string[] | undefined;

    if (UNSCOPED_ROLES.has(actor.role)) {
      clientIds = undefined;
    } else if (actor.role === AppUserRole.IT_ENGINEER) {
      clientIds = await this.clientRepository.listActiveAssignedClientIds(actor.userId);
    } else {
      clientIds = [];
    }

    const { items, total } = await this.clientRepository.list(skip, take, clientIds);
    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  /**
   * FR-MOVE-01 — intra-client location change. Updates currentLocation and
   * appends a SiteLocation with isCurrent flipped. Does not touch Device.
   */
  async changeLocation(clientId: string, input: UpdateLocationBody, actorUserId: string) {
    const existing = await this.clientRepository.findById(clientId);
    if (!existing) {
      throw new NotFoundError("Client not found");
    }
    if (existing.currentLocation === input.currentLocation) {
      throw new ValidationError("New location must differ from the current location");
    }

    const previousLocation = existing.currentLocation;
    const client = await this.clientRepository.changeLocation(clientId, input.currentLocation);
    this.eventBus.emit("client.location_changed", {
      entityType: "Client",
      entityId: clientId,
      action: AuditAction.UPDATE,
      performedBy: actorUserId,
      before: { currentLocation: previousLocation },
      after: { currentLocation: input.currentLocation },
      previousLocation,
      newLocation: input.currentLocation,
    });
    return client;
  }

  /**
   * Assigns an existing IT_ENGINEER AppUser to a site. Never creates an AppUser
   * and never writes Device rows.
   */
  async assignEngineer(clientId: string, input: AssignEngineerBody, actorUserId: string) {
    const client = await this.clientRepository.findById(clientId);
    if (!client) {
      throw new NotFoundError("Client not found");
    }

    const user = await this.clientRepository.findAppUserById(input.userId);
    if (!user) {
      throw new NotFoundError("AppUser not found");
    }
    if (user.role !== AppUserRole.IT_ENGINEER) {
      throw new ValidationError("Only IT_ENGINEER accounts can be assigned to a client");
    }
    if (!user.isActive) {
      throw new ValidationError("Cannot assign an inactive engineer");
    }

    const existing = await this.clientRepository.findActiveEngineerAssignment(clientId, input.userId);
    if (existing) {
      throw new ConflictError("Engineer is already assigned to this client");
    }

    const assignment = await this.clientRepository.createEngineerAssignment(clientId, input.userId);
    this.eventBus.emit("client.engineer.assigned", {
      entityType: "EngineerAssignment",
      entityId: assignment.id,
      action: AuditAction.CREATE,
      performedBy: actorUserId,
      before: null,
      after: { id: assignment.id, clientId, engineerUserId: input.userId },
      engineerUserId: input.userId,
      assignmentId: assignment.id,
    });
    return assignment;
  }

  /**
   * Off-boards an engineer: EngineerAssignment.isActive=false and unassignedAt=now.
   * Must not touch AppUser.isActive or any Device record.
   */
  async offboardEngineer(clientId: string, engineerUserId: string, actorUserId: string) {
    const client = await this.clientRepository.findById(clientId);
    if (!client) {
      throw new NotFoundError("Client not found");
    }

    const assignment = await this.clientRepository.findActiveEngineerAssignment(clientId, engineerUserId);
    if (!assignment) {
      throw new NotFoundError("Active engineer assignment not found");
    }

    const closed = await this.clientRepository.offboardEngineerAssignment(assignment.id, new Date());
    this.eventBus.emit("client.engineer.offboarded", {
      entityType: "EngineerAssignment",
      entityId: closed.id,
      action: AuditAction.UPDATE,
      performedBy: actorUserId,
      before: { isActive: true },
      after: { isActive: false, unassignedAt: closed.unassignedAt },
      engineerUserId,
      assignmentId: closed.id,
    });
    return closed;
  }
}

function mapUniqueClientName(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return new ConflictError("A client with this name already exists");
  }
  return error;
}
