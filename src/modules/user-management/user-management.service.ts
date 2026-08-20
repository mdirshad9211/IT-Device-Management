import bcrypt from "bcrypt";
import { AppUserRole, AuditAction, Prisma } from "@prisma/client";
import { ConflictError, NotFoundError, ValidationError } from "../../shared/kernel/errors";
import type { DomainEventBus } from "../../shared/kernel/events";
import { toSkipTake } from "../../shared/http/schemas/pagination";
import type { UserManagementRepository } from "./user-management.repository";
import type { CreateUserBody, LinkAccountBody, UpdateUserBody } from "./user-management.schemas";
import type { PaginationQuery } from "../../shared/http/schemas/pagination";

const BCRYPT_ROUNDS = 10;

export class UserManagementService {
  constructor(
    private readonly userManagementRepository: UserManagementRepository,
    private readonly eventBus: DomainEventBus,
  ) {}

  /**
   * Lists AppUser accounts. SUPER_ADMIN only at the HTTP layer.
   * SRS §1.4 — accounts are provisioned by an Admin, never auto-created from allotment.
   */
  async listUsers(query: PaginationQuery) {
    const { skip, take } = toSkipTake(query);
    const { items, total } = await this.userManagementRepository.list(skip, take);
    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  /**
   * Provisions a new AppUser. Does not create EngineerAssignment or Device rows.
   */
  async createUser(input: CreateUserBody, actorUserId: string) {
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    try {
      const user = await this.userManagementRepository.create({
        name: input.name,
        email: input.email,
        passwordHash,
        role: input.role,
        isActive: input.isActive,
      });
      this.eventBus.emit("appUser.created", {
        entityType: "AppUser",
        entityId: user.id,
        action: AuditAction.CREATE,
        performedBy: actorUserId,
        before: null,
        after: { id: user.id, email: user.email, role: user.role, isActive: user.isActive },
        email: user.email,
        role: user.role,
      });
      return user;
    } catch (error) {
      throw mapUniqueEmail(error);
    }
  }

  /**
   * Edits profile fields and/or `isActive`. Must not mutate EngineerAssignment or Device data.
   */
  async updateUser(id: string, input: UpdateUserBody, actorUserId: string) {
    const existing = await this.userManagementRepository.findById(id);
    if (!existing) {
      throw new NotFoundError("User not found");
    }

    const data: {
      name?: string;
      email?: string;
      passwordHash?: string;
      role?: AppUserRole;
      isActive?: boolean;
    } = {};

    if (input.name !== undefined) data.name = input.name;
    if (input.email !== undefined) data.email = input.email;
    if (input.role !== undefined) data.role = input.role;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.password !== undefined) {
      data.passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    }

    try {
      const user = await this.userManagementRepository.update(id, data);
      this.eventBus.emit("appUser.updated", {
        entityType: "AppUser",
        entityId: user.id,
        action: AuditAction.UPDATE,
        performedBy: actorUserId,
        before: {
          name: existing.name,
          email: existing.email,
          role: existing.role,
          isActive: existing.isActive,
        },
        after: {
          name: user.name,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
          passwordChanged: input.password !== undefined,
        },
        changes: {
          name: input.name,
          email: input.email,
          role: input.role,
          isActive: input.isActive,
          passwordChanged: input.password !== undefined,
        },
      });
      return user;
    } catch (error) {
      throw mapUniqueEmail(error);
    }
  }

  /**
   * Links an *existing* AppUser (by email) onto a DeviceAssignment as employee or manager.
   * Never creates an account. SRS confirmed: Employee/Client Manager logins are Admin-provisioned.
   */
  async linkAssignmentAccount(
    deviceId: string,
    assignmentId: string,
    input: LinkAccountBody,
    actorUserId: string,
  ) {
    const assignment = await this.userManagementRepository.findAssignment(deviceId, assignmentId);
    if (!assignment) {
      throw new NotFoundError("Device assignment not found");
    }

    const user = await this.userManagementRepository.findByEmail(input.email);
    if (!user) {
      throw new ConflictError("No AppUser exists for this email; provision the account before linking");
    }

    if (input.linkAs === "employee" && user.role !== AppUserRole.EMPLOYEE) {
      throw new ValidationError("Linked account must have the EMPLOYEE role");
    }
    if (input.linkAs === "manager" && user.role !== AppUserRole.CLIENT_MANAGER) {
      throw new ValidationError("Linked account must have the CLIENT_MANAGER role");
    }

    const patch =
      input.linkAs === "employee" ? { employeeUserId: user.id } : { managerUserId: user.id };

    const updated = await this.userManagementRepository.linkAssignmentAccount(assignment.id, patch);

    this.eventBus.emit("deviceAssignment.accountLinked", {
      entityType: "DeviceAssignment",
      entityId: updated.id,
      action: AuditAction.UPDATE,
      performedBy: actorUserId,
      before: {
        employeeUserId: assignment.employeeUserId,
        managerUserId: assignment.managerUserId,
      },
      after: {
        employeeUserId: updated.employeeUserId,
        managerUserId: updated.managerUserId,
        linkAs: input.linkAs,
        linkedUserId: user.id,
      },
      deviceId,
      linkedUserId: user.id,
      linkAs: input.linkAs,
    });

    return {
      deviceId: updated.deviceId,
      assignmentId: updated.id,
      employeeUserId: updated.employeeUserId,
      managerUserId: updated.managerUserId,
      linkedUser: user,
      linkAs: input.linkAs,
    };
  }
}

function mapUniqueEmail(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return new ConflictError("An AppUser with this email already exists");
  }
  return error;
}
