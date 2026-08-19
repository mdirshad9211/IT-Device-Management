import type { FastifyReply, FastifyRequest } from "fastify";
import { parseBody, parseParams, parseQuery } from "../../shared/http/validate";
import { paginationSchema } from "../../shared/http/schemas/pagination";
import {
  allotDeviceBodySchema,
  assignmentInputSchema,
  assignmentSchema,
  deviceDetailSchema,
  deviceIdParamsSchema,
  hardwareHistoryResponseSchema,
  lifecycleBodySchema,
  listDevicesQuerySchema,
  listDevicesResponseSchema,
  managerLookupQuerySchema,
  managerLookupResponseSchema,
  softwareHistoryResponseSchema,
  updateDeviceBodySchema,
} from "./device.schemas";
import type { DeviceService } from "./device.service";
import type { DeviceLifecycleService } from "./device.lifecycle.service";

function actorOf(request: FastifyRequest) {
  return { userId: request.user.userId, role: request.user.role };
}

export class DeviceController {
  constructor(
    private readonly deviceService: DeviceService,
    private readonly deviceLifecycleService: DeviceLifecycleService,
  ) {}

  async list(request: FastifyRequest, reply: FastifyReply) {
    const query = parseQuery(listDevicesQuerySchema, request);
    const result = await this.deviceService.listDevices(query, actorOf(request));
    return reply.status(200).send(listDevicesResponseSchema.parse(result));
  }

  async lookupManagers(request: FastifyRequest, reply: FastifyReply) {
    const { query } = parseQuery(managerLookupQuerySchema, request);
    const result = await this.deviceService.lookupManagers(query, actorOf(request));
    return reply.status(200).send(managerLookupResponseSchema.parse(result));
  }

  async get(request: FastifyRequest, reply: FastifyReply) {
    const { id } = parseParams(deviceIdParamsSchema, request);
    const device = await this.deviceService.getDevice(id, actorOf(request));
    return reply.status(200).send(deviceDetailSchema.parse(device));
  }

  async allot(request: FastifyRequest, reply: FastifyReply) {
    const body = parseBody(allotDeviceBodySchema, request);
    const device = await this.deviceService.allotDevice(body, actorOf(request));
    return reply.status(201).send(deviceDetailSchema.parse(device));
  }

  async update(request: FastifyRequest, reply: FastifyReply) {
    const { id } = parseParams(deviceIdParamsSchema, request);
    const body = parseBody(updateDeviceBodySchema, request);
    const device = await this.deviceService.updateDevice(id, body, actorOf(request));
    return reply.status(200).send(deviceDetailSchema.parse(device));
  }

  async changeAssignment(request: FastifyRequest, reply: FastifyReply) {
    const { id } = parseParams(deviceIdParamsSchema, request);
    const body = parseBody(assignmentInputSchema, request);
    const assignment = await this.deviceService.changeAssignment(id, body, actorOf(request));
    return reply.status(201).send(assignmentSchema.parse(assignment));
  }

  async transition(request: FastifyRequest, reply: FastifyReply) {
    const { id } = parseParams(deviceIdParamsSchema, request);
    const body = parseBody(lifecycleBodySchema, request);
    const device = await this.deviceLifecycleService.transition(id, body.eventType, actorOf(request));
    return reply.status(200).send(deviceDetailSchema.parse(device));
  }

  async softwareHistory(request: FastifyRequest, reply: FastifyReply) {
    const { id } = parseParams(deviceIdParamsSchema, request);
    const query = parseQuery(paginationSchema, request);
    const result = await this.deviceService.listSoftwareHistory(id, query, actorOf(request));
    return reply.status(200).send(softwareHistoryResponseSchema.parse(result));
  }

  async hardwareHistory(request: FastifyRequest, reply: FastifyReply) {
    const { id } = parseParams(deviceIdParamsSchema, request);
    const query = parseQuery(paginationSchema, request);
    const result = await this.deviceService.listHardwareHistory(id, query, actorOf(request));
    return reply.status(200).send(hardwareHistoryResponseSchema.parse(result));
  }
}
