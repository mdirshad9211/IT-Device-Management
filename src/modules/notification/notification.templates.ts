import { NotificationType } from "@prisma/client";

export type RenderedEmail = {
  subject: string;
  text: string;
  html: string;
};

/**
 * Renders notification email bodies from a typed template + context bag.
 */
export function renderNotificationEmail(
  type: NotificationType,
  context: Record<string, unknown>,
): RenderedEmail {
  switch (type) {
    case NotificationType.DEVICE_ALLOTMENT:
      return allotmentTemplate(context);
    case NotificationType.STORAGE_THRESHOLD:
      return storageTemplate(context);
    case NotificationType.DISCARD_WARNING:
      return discardWarningTemplate(context);
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

function allotmentTemplate(ctx: Record<string, unknown>): RenderedEmail {
  const assetTag = String(ctx.assetTag ?? "unknown");
  const qrValue = ctx.qrValue ? String(ctx.qrValue) : "n/a";
  const subject = `Device allotted: ${assetTag}`;
  const text = `A device has been allotted.\nAsset tag: ${assetTag}\nQR: ${qrValue}\n`;
  const html = `<p>A device has been allotted.</p><ul><li>Asset tag: <strong>${escapeHtml(assetTag)}</strong></li><li>QR: ${escapeHtml(qrValue)}</li></ul>`;
  return { subject, text, html };
}

function storageTemplate(ctx: Record<string, unknown>): RenderedEmail {
  const percent = Number(ctx.storageUsedPercent ?? 0);
  const subject = `Storage threshold breached (${percent}%)`;
  const text = `Device storage usage is at ${percent}% and has reached the configured threshold.\n`;
  const html = `<p>Device storage usage is at <strong>${percent}%</strong> and has reached the configured threshold.</p>`;
  return { subject, text, html };
}

function discardWarningTemplate(ctx: Record<string, unknown>): RenderedEmail {
  const assetTag = String(ctx.assetTag ?? "unknown");
  const due = String(ctx.deletionDueAt ?? "unknown");
  const subject = `Discard warning: ${assetTag} will be deleted soon`;
  const text = `Device ${assetTag} is discarded and scheduled for permanent deletion on ${due}.\n`;
  const html = `<p>Device <strong>${escapeHtml(assetTag)}</strong> is discarded and scheduled for permanent deletion on <strong>${escapeHtml(due)}</strong>.</p>`;
  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
