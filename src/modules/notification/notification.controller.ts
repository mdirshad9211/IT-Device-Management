import type { FastifyReply, FastifyRequest } from "fastify";
import { parseQuery } from "../../shared/http/validate";
import { listNotificationsQuerySchema, listNotificationsResponseSchema } from "./notification.schemas";
import type { NotificationService } from "./notification.service";

export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  async list(request: FastifyRequest, reply: FastifyReply) {
    const query = parseQuery(listNotificationsQuerySchema, request);
    const result = await this.notificationService.list(query);
    return reply.status(200).send(listNotificationsResponseSchema.parse(result));
  }
}
