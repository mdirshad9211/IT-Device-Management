import type { FastifyReply, FastifyRequest } from "fastify";
import { UnauthorizedError } from "../../shared/kernel/errors";
import { parseBody, parseParams, parseQuery } from "../../shared/http/validate";
import {
  agentIdParamsSchema,
  deregisterBodySchema,
  deregisterResponseSchema,
  downloadAgentQuerySchema,
  downloadAgentResponseSchema,
  pollBodySchema,
  pollResponseSchema,
} from "./agent.schemas";
import type { AgentService } from "./agent.service";

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
    const { clientId } = parseQuery(downloadAgentQuerySchema, request);
    const result = await this.agentService.issueDownloadToken(clientId, {
      userId: request.user.userId,
      role: request.user.role,
    });
    return reply.status(200).send(downloadAgentResponseSchema.parse(result));
  }
}
