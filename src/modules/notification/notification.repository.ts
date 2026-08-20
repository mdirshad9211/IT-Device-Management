import type {
  Notification,
  NotificationStatus,
  NotificationType,
  Prisma,
  PrismaClient,
} from "@prisma/client";

export type NotificationRecord = Pick<
  Notification,
  "id" | "deviceId" | "type" | "recipients" | "status" | "sentAt" | "createdAt"
>;

export type NotificationListFilter = {
  type?: NotificationType;
  status?: NotificationStatus;
  deviceId?: string;
};

export interface NotificationRepository {
  create(data: {
    deviceId: string | null;
    type: NotificationType;
    recipients: string[];
  }): Promise<NotificationRecord>;
  markSent(id: string, sentAt: Date): Promise<void>;
  markFailed(id: string): Promise<void>;
  list(
    skip: number,
    take: number,
    filter: NotificationListFilter,
  ): Promise<{ items: NotificationRecord[]; total: number }>;
}

export class PrismaNotificationRepository implements NotificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    deviceId: string | null;
    type: NotificationType;
    recipients: string[];
  }): Promise<NotificationRecord> {
    return this.prisma.notification.create({
      data: {
        deviceId: data.deviceId,
        type: data.type,
        recipients: data.recipients,
        status: "PENDING",
      },
      select: notificationSelect,
    });
  }

  async markSent(id: string, sentAt: Date): Promise<void> {
    await this.prisma.notification.update({
      where: { id },
      data: { status: "SENT", sentAt },
    });
  }

  async markFailed(id: string): Promise<void> {
    await this.prisma.notification.update({
      where: { id },
      data: { status: "FAILED" },
    });
  }

  async list(
    skip: number,
    take: number,
    filter: NotificationListFilter,
  ): Promise<{ items: NotificationRecord[]; total: number }> {
    const where: Prisma.NotificationWhereInput = {};
    if (filter.type) where.type = filter.type;
    if (filter.status) where.status = filter.status;
    if (filter.deviceId) where.deviceId = filter.deviceId;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        select: notificationSelect,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { items, total };
  }
}

const notificationSelect = {
  id: true,
  deviceId: true,
  type: true,
  recipients: true,
  status: true,
  sentAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;
