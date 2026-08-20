import type { FastifyReply, FastifyRequest } from "fastify";
import { parseBody, parseParams, parseQuery } from "../../shared/http/validate";
import {
  createOtherNetworkDeviceBodySchema,
  linkOtherNetworkDeviceBodySchema,
  listOtherNetworkDevicesQuerySchema,
  listOtherNetworkDevicesResponseSchema,
  otherNetworkDeviceIdParamsSchema,
  otherNetworkDeviceSchema,
  updateOtherNetworkDeviceBodySchema,
} from "./other-network-device.schemas";
import type { OtherNetworkDeviceService } from "./other-network-device.service";

function actorOf(request: FastifyRequest) {
  return { userId: request.user.userId, role: request.user.role };
}

export class OtherNetworkDeviceController {
  constructor(private readonly otherNetworkDeviceService: OtherNetworkDeviceService) {}

  async list(request: FastifyRequest, reply: FastifyReply) {
    const query = parseQuery(listOtherNetworkDevicesQuerySchema, request);
    const result = await this.otherNetworkDeviceService.list(query, actorOf(request));
    return reply.status(200).send(listOtherNetworkDevicesResponseSchema.parse(result));
  }

  async get(request: FastifyRequest, reply: FastifyReply) {
    const { id } = parseParams(otherNetworkDeviceIdParamsSchema, request);
    const item = await this.otherNetworkDeviceService.getById(id, actorOf(request));
    return reply.status(200).send(otherNetworkDeviceSchema.parse(item));
  }

  async create(request: FastifyRequest, reply: FastifyReply) {
    const body = parseBody(createOtherNetworkDeviceBodySchema, request);
    const item = await this.otherNetworkDeviceService.create(body, actorOf(request));
    return reply.status(201).send(otherNetworkDeviceSchema.parse(item));
  }

  async update(request: FastifyRequest, reply: FastifyReply) {
    const { id } = parseParams(otherNetworkDeviceIdParamsSchema, request);
    const body = parseBody(updateOtherNetworkDeviceBodySchema, request);
    const item = await this.otherNetworkDeviceService.update(id, body, actorOf(request));
    return reply.status(200).send(otherNetworkDeviceSchema.parse(item));
  }

  async link(request: FastifyRequest, reply: FastifyReply) {
    const { id } = parseParams(otherNetworkDeviceIdParamsSchema, request);
    const body = parseBody(linkOtherNetworkDeviceBodySchema, request);
    const item = await this.otherNetworkDeviceService.link(id, body, actorOf(request));
    return reply.status(200).send(otherNetworkDeviceSchema.parse(item));
  }

  async delete(request: FastifyRequest, reply: FastifyReply) {
    const { id } = parseParams(otherNetworkDeviceIdParamsSchema, request);
    await this.otherNetworkDeviceService.delete(id, actorOf(request));
    return reply.status(204).send();
  }
}
