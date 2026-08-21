import { NotificationStatus, NotificationType } from "@prisma/client";
import { z } from "zod";
import { paginationSchema } from "../../shared/http/schemas/pagination";

export const listNotificationsQuerySchema = paginationSchema.extend({
  type: z.nativeEnum(NotificationType).optional(),
  status: z.nativeEnum(NotificationStatus).optional(),
  deviceId: z.string().uuid().optional(),
});

export const notificationSchema = z.object({
  id: z.string().uuid(),
  deviceId: z.string().uuid().nullable(),
  type: z.nativeEnum(NotificationType),
  recipients: z.array(z.string()),
  status: z.nativeEnum(NotificationStatus),
  sentAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
});

export const listNotificationsResponseSchema = z.object({
  items: z.array(notificationSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

/** In-process job payload for the notifications queue. */
export type NotificationJobPayload = {
  notificationId: string;
  type: NotificationType;
  deviceId: string | null;
  recipients: string[];
  context: Record<string, unknown>;
};
