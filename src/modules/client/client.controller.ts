import type { FastifyReply, FastifyRequest } from "fastify";
import { parseBody, parseParams, parseQuery } from "../../shared/http/validate";
import {
  assignEngineerBodySchema,
  clientIdParamsSchema,
  clientWithLocationsSchema,
  createClientBodySchema,
  engineerAssignmentSchema,
  listClientsQuerySchema,
  listClientsResponseSchema,
  offboardEngineerParamsSchema,
  updateLocationBodySchema,
} from "./client.schemas";
import type { ClientService } from "./client.service";

export class ClientController {
  constructor(private readonly clientService: ClientService) {}

  async list(request: FastifyRequest, reply: FastifyReply) {
    const query = parseQuery(listClientsQuerySchema, request);
    const result = await this.clientService.listClients(query, {
      userId: request.user.userId,
      role: request.user.role,
    });
    return reply.status(200).send(listClientsResponseSchema.parse(result));
  }

  async create(request: FastifyRequest, reply: FastifyReply) {
    const body = parseBody(createClientBodySchema, request);
    const client = await this.clientService.createClient(body, request.user.userId);
    return reply.status(201).send(clientWithLocationsSchema.parse(client));
  }

  async changeLocation(request: FastifyRequest, reply: FastifyReply) {
    const { id } = parseParams(clientIdParamsSchema, request);
    const body = parseBody(updateLocationBodySchema, request);
    const client = await this.clientService.changeLocation(id, body, request.user.userId);
    return reply.status(200).send(clientWithLocationsSchema.parse(client));
  }

  async assignEngineer(request: FastifyRequest, reply: FastifyReply) {
    const { id } = parseParams(clientIdParamsSchema, request);
    const body = parseBody(assignEngineerBodySchema, request);
    const assignment = await this.clientService.assignEngineer(id, body, request.user.userId);
    return reply.status(201).send(engineerAssignmentSchema.parse(assignment));
  }

  async offboardEngineer(request: FastifyRequest, reply: FastifyReply) {
    const { id, userId } = parseParams(offboardEngineerParamsSchema, request);
    const assignment = await this.clientService.offboardEngineer(id, userId, request.user.userId);
    return reply.status(200).send(engineerAssignmentSchema.parse(assignment));
  }
}
