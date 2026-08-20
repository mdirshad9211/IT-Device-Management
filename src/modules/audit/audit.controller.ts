import type { FastifyReply, FastifyRequest } from "fastify";
import { parseQuery } from "../../shared/http/validate";
import { listAuditLogsQuerySchema, listAuditLogsResponseSchema } from "./audit.schemas";
import type { AuditService } from "./audit.service";

export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  async list(request: FastifyRequest, reply: FastifyReply) {
    const query = parseQuery(listAuditLogsQuerySchema, request);
    const result = await this.auditService.list(query);
    return reply.status(200).send(listAuditLogsResponseSchema.parse(result));
  }
}
