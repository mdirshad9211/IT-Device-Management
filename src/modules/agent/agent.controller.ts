import type { FastifyReply, FastifyRequest } from "fastify";
import { UnauthorizedError } from "../../shared/kernel/errors";
import { parseBody, parseParams, parseQuery } from "../../shared/http/validate";
import {
  agentIdParamsSchema,
  deregisterBodySchema,
  deregisterResponseSchema,
  deviceIdForPollsParamsSchema,
  downloadAgentQuerySchema,
  downloadAgentResponseSchema,
  listPollLogsResponseSchema,
  pollBodySchema,
  pollResponseSchema,
  scanDeviceResponseSchema,
} from "./agent.schemas";
import type { AgentService } from "./agent.service";
import { paginationSchema } from "../../shared/http/schemas/pagination";

function requireCaller(request: FastifyRequest) {
  if (!request.agent) {
    throw new UnauthorizedError("Agent authentication required");
  }
  return request.agent;
}

export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  async poll(request: FastifyRequest, reply: FastifyReply) {
    const { agentId } = parseParams(agentIdParamsSchema, request);
    const body = parseBody(pollBodySchema, request);
    const result = await this.agentService.ingestPoll(agentId, requireCaller(request), body);
    return reply.status(200).send(pollResponseSchema.parse(result));
  }

  async deregister(request: FastifyRequest, reply: FastifyReply) {
    const { agentId } = parseParams(agentIdParamsSchema, request);
    const body = parseBody(deregisterBodySchema, request);
    const result = await this.agentService.deregister(agentId, requireCaller(request), body.adminSecret);
    return reply.status(200).send(deregisterResponseSchema.parse(result));
  }

  async downloadAgent(request: FastifyRequest, reply: FastifyReply) {
    const { clientId, format } = parseQuery(downloadAgentQuerySchema, request);
    const proto = String(request.headers["x-forwarded-proto"] ?? "http");
    const host = String(request.headers["x-forwarded-host"] ?? request.headers.host ?? "localhost:4000");
    const apiBaseUrl = `${proto}://${host}`;

    const result = await this.agentService.issueDownloadToken(
      clientId,
      {
        userId: request.user.userId,
        role: request.user.role,
      },
      { apiBaseUrl },
    );

    if (format === "json") {
      const { zip: _zip, ...json } = result;
      return reply.status(200).send(downloadAgentResponseSchema.parse(json));
    }

    return reply
      .status(200)
      .header("Content-Type", "application/zip")
      .header("Content-Disposition", `attachment; filename="${result.fileName}"`)
      .header("X-Agent-Download-Expires-At", result.expiresAt)
      .send(result.zip);
  }

  async listPollLogs(request: FastifyRequest, reply: FastifyReply) {
    const { deviceId } = parseParams(deviceIdForPollsParamsSchema, request);
    const query = parseQuery(paginationSchema, request);
    const result = await this.agentService.listPollLogs(deviceId, query, {
      userId: request.user.userId,
      role: request.user.role,
    });
    return reply.status(200).send(listPollLogsResponseSchema.parse(result));
  }

  async scanDevice(request: FastifyRequest, reply: FastifyReply) {
    const { deviceId } = parseParams(deviceIdForPollsParamsSchema, request);
    const result = await this.agentService.scanDeviceNow(deviceId, {
      userId: request.user.userId,
      role: request.user.role,
    });
    return reply.status(200).send(scanDeviceResponseSchema.parse(result));
  }
}
