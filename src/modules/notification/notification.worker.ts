import type { Logger } from "pino";
import { createWorker } from "../../shared/kernel/queue";
import type { NotificationMailer } from "./notification.mailer";
import type { NotificationRepository } from "./notification.repository";
import type { NotificationJobPayload } from "./notification.schemas";
import { renderNotificationEmail } from "./notification.templates";

/**
 * Processes the in-process `notifications` queue: render → SMTP → mark SENT/FAILED.
 */
export function startNotificationWorker(deps: {
  notificationRepository: NotificationRepository;
  notificationMailer: NotificationMailer;
  logger: Logger;
}) {
  return createWorker<NotificationJobPayload>("notifications", async (data, meta) => {
    const { notificationId, type, recipients, context } = data;
    try {
      const email = renderNotificationEmail(type, context);
      await deps.notificationMailer.send(recipients, email);
      await deps.notificationRepository.markSent(notificationId, new Date());
    } catch (error) {
      deps.logger.error(
        { err: error, notificationId, jobId: meta.id },
        "notification job failed",
      );
      if (meta.attemptsMade + 1 >= meta.attempts) {
        await deps.notificationRepository.markFailed(notificationId);
      }
      throw error;
    }
  });
}
