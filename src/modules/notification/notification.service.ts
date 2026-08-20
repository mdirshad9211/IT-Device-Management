import type { NotificationStatus, NotificationType } from "@prisma/client";
import { toSkipTake, type PaginationQuery } from "../../shared/http/schemas/pagination";
import type { NotificationListFilter, NotificationRepository } from "./notification.repository";

export class NotificationService {
  constructor(private readonly notificationRepository: NotificationRepository) {}

  /**
   * Paginated notification history for staff (allotment / storage / discard).
   */
  async list(
    query: PaginationQuery & {
      type?: NotificationType;
      status?: NotificationStatus;
      deviceId?: string;
    },
  ) {
    const { skip, take } = toSkipTake(query);
    const filter: NotificationListFilter = {
      type: query.type,
      status: query.status,
      deviceId: query.deviceId,
    };
    const { items, total } = await this.notificationRepository.list(skip, take, filter);
    return {
      items: items.map((item) => ({
        ...item,
        recipients: asStringArray(item.recipients),
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}
