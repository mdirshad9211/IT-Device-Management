import type { FastifyReply, FastifyRequest } from "fastify";
import { parseBody, parseParams, parseQuery } from "../../shared/http/validate";
import {
  createUserBodySchema,
  linkAccountBodySchema,
  linkAccountParamsSchema,
  linkAccountResponseSchema,
  listUsersQuerySchema,
  listUsersResponseSchema,
  updateUserBodySchema,
  userIdParamsSchema,
  appUserPublicSchema,
} from "./user-management.schemas";
import type { UserManagementService } from "./user-management.service";

export class UserManagementController {
  constructor(private readonly userManagementService: UserManagementService) {}

  async list(request: FastifyRequest, reply: FastifyReply) {
    const query = parseQuery(listUsersQuerySchema, request);
    const result = await this.userManagementService.listUsers(query);
    return reply.status(200).send(listUsersResponseSchema.parse(result));
  }

  async create(request: FastifyRequest, reply: FastifyReply) {
    const body = parseBody(createUserBodySchema, request);
    const user = await this.userManagementService.createUser(body, request.user.userId);
    return reply.status(201).send(appUserPublicSchema.parse(user));
  }

  async update(request: FastifyRequest, reply: FastifyReply) {
    const { id } = parseParams(userIdParamsSchema, request);
    const body = parseBody(updateUserBodySchema, request);
    const user = await this.userManagementService.updateUser(id, body, request.user.userId);
    return reply.status(200).send(appUserPublicSchema.parse(user));
  }

  async linkAccount(request: FastifyRequest, reply: FastifyReply) {
    const { deviceId, assignmentId } = parseParams(linkAccountParamsSchema, request);
    const body = parseBody(linkAccountBodySchema, request);
    const result = await this.userManagementService.linkAssignmentAccount(
      deviceId,
      assignmentId,
      body,
      request.user.userId,
    );
    return reply.status(200).send(linkAccountResponseSchema.parse(result));
  }
}
