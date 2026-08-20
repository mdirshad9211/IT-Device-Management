import type { FastifyReply, FastifyRequest } from "fastify";
import { parseParams, parseQuery } from "../../shared/http/validate";
import {
  deviceIdParamsSchema,
  qrImageQuerySchema,
  qrResolveOkSchema,
  qrResolveStaleSchema,
  qrValueParamsSchema,
  runPollResponseSchema,
} from "./qr.schemas";
import type { QrService } from "./qr.service";

export class QrController {
  constructor(private readonly qrService: QrService) {}

  async image(request: FastifyRequest, reply: FastifyReply) {
    const { deviceId } = parseParams(deviceIdParamsSchema, request);
    const { format } = parseQuery(qrImageQuerySchema, request);
    const { body, contentType } = await this.qrService.renderImage(deviceId, format);
    return reply.status(200).header("Content-Type", contentType).send(body);
  }

  async resolve(request: FastifyRequest, reply: FastifyReply) {
    const { qrValue } = parseParams(qrValueParamsSchema, request);
    const result = await this.qrService.resolve(decodeURIComponent(qrValue));
    if (result.stale) {
      return reply.status(200).send(qrResolveStaleSchema.parse(result));
    }
    return reply.status(200).send(qrResolveOkSchema.parse(result));
  }

  async runPoll(request: FastifyRequest, reply: FastifyReply) {
    const { deviceId } = parseParams(deviceIdParamsSchema, request);
    const result = await this.qrService.requestOnDemandPoll(deviceId, request.user.userId);
    return reply.status(202).send(runPollResponseSchema.parse(result));
  }
}
