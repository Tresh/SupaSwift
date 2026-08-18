/**
 * Notifications.
 *
 * MVP: email alerts for persistent failures + optional recovery alerts.
 * The interface is intentionally small so Telegram/Discord/Slack channels
 * can be added later without touching the scheduler.
 */

export interface NotificationPayload {
  to: string;
  subject: string;
  text: string;
}

export async function sendEmail(payload: NotificationPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // No email provider configured - log instead of failing silently.
    console.log(`[notify:email] ${payload.subject} -> ${payload.to}\n${payload.text}`);
    return;
  }

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  const from =
    process.env.RESEND_FROM_EMAIL || "SupaSwift <onboarding@resend.dev>";

  const { error } = await resend.emails.send({
    from,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
  });

  if (error) {
    console.error("[notify:email] failed:", error.message);
  }
}
