import nodemailer, { type Transporter } from "nodemailer";
import type { Logger } from "pino";
import { env } from "../../config/env";
import type { RenderedEmail } from "./notification.templates";

export type MailSendResult = { skipped: boolean };

/**
 * SMTP transport wrapper. When SMTP_HOST is empty (local/test), sends are
 * skipped after a warn log so workers can still mark the row SENT.
 */
export class NotificationMailer {
  private transporter: Transporter | null = null;

  constructor(private readonly logger: Logger) {}

  async send(recipients: string[], email: RenderedEmail): Promise<MailSendResult> {
    if (!env.SMTP_HOST) {
      this.logger.warn({ recipients, subject: email.subject }, "SMTP_HOST unset; skipping email send");
      return { skipped: true };
    }

    if (recipients.length === 0) {
      this.logger.warn({ subject: email.subject }, "No recipients; skipping email send");
      return { skipped: true };
    }

    const transporter = this.getTransporter();
    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: recipients.join(", "),
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
    return { skipped: false };
  }

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      auth: env.SMTP_USER
        ? {
            user: env.SMTP_USER,
            pass: env.SMTP_PASSWORD,
          }
        : undefined,
    });
    return this.transporter;
  }
}
