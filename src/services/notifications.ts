import nodemailer from 'nodemailer';
import type { Logger } from 'pino';

export async function sendEmail(to: string, subject: string, body: string, log: Logger): Promise<void> {
  const enabled = process.env.EMAIL_ENABLED === 'true';
  if (!enabled) {
    log.warn({ to, subject, bodyPreview: body.slice(0, 200) }, 'notification (email disabled)');
    return;
  }

  const host = process.env.EMAIL_HOST;
  const port = Number(process.env.EMAIL_PORT ?? '587');
  const user = process.env.EMAIL_USER ?? '';
  const pass = process.env.EMAIL_PASS ?? '';
  const from = process.env.ALERT_EMAIL_FROM ?? 'alerts@gateway.local';

  if (!host) {
    log.warn({ to, subject }, 'EMAIL_ENABLED but EMAIL_HOST missing — skipping send');
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user ? { user, pass } : undefined,
  });

  await transporter.sendMail({
    from,
    to,
    subject,
    text: body,
  });
  log.info({ to, subject }, 'notification email sent');
}
