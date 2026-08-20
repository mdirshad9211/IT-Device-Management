import type { Job, Worker } from "bullmq";
import type { Logger } from "pino";
import { createWorker } from "../../shared/kernel/queue";
import type { NotificationMailer } from "./notification.mailer";
import type { NotificationRepository } from "./notification.repository";
import type { NotificationJobPayload } from "./notification.schemas";
import { renderNotificationEmail } from "./notification.templates";

/**
 * Processes the `notifications` BullMQ queue: render template → SMTP send →
 * mark Notification SENT/FAILED. Retries use the job's exponential backoff.
 */
export function startNotificationWorker(deps: {
  notificationRepository: NotificationRepository;
  notificationMailer: NotificationMailer;
  logger: Logger;
}): Worker<NotificationJobPayload> {
  return createWorker<NotificationJobPayload>(
    "notifications",
    async (job: Job<NotificationJobPayload>) => {
      const { notificationId, type, recipients, context } = job.data;
      try {
        const email = renderNotificationEmail(type, context);
        await deps.notificationMailer.send(recipients, email);
        await deps.notificationRepository.markSent(notificationId, new Date());
      } catch (error) {
        deps.logger.error({ err: error, notificationId, jobId: job.id }, "notification job failed");
        if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
          await deps.notificationRepository.markFailed(notificationId);
        }
        throw error;
      }
    },
  );
}
