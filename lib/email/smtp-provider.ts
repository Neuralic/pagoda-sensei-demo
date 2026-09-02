/**
 * SMTP transport — the original path, now a fallback behind Resend.
 *
 * The env handling is lifted from `smtpTransport()` in lib/mailer.ts unchanged, including
 * stripping a protocol prefix from SMTP_HOST, because the configured value really is
 * `http://mail.privateemail.com/`.
 *
 * A single transporter is cached per process. Every sender used to build its own, which meant
 * a fresh TCP connection and handshake for each email — and, on a slow hop, the `write
 * ETIMEDOUT` that lost an advisor's chat notification on 28 Aug.
 */

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type { EmailMessage, EmailProvider, ProviderSendOutcome } from "@/lib/email/types";

/** Bounded so a hung mail server cannot hold a serverless invocation open. */
const SMTP_TIMEOUT_MS = 10_000;

type SmtpConfig = {
  from: string;
  host: string;
  port: number;
  user: string;
  pass: string;
};

function readConfig(): SmtpConfig | null {
  const env = process.env as Record<string, string | undefined>;
  const from = env.FROM_EMAIL || env.SMTP_FROM;
  const rawHost = env.SMTP_HOST;
  const host = rawHost ? rawHost.replace(/^https?:\/\//, "").replace(/\/+$/, "") : undefined;
  const port = env.SMTP_PORT;
  const user = env.SMTP_USER;
  const pass = env.SMTP_PASS;
  if (!host || !port || !user || !pass || !from) return null;
  return { from, host, port: Number(port), user, pass };
}

let cached: { key: string; transporter: Transporter } | null = null;

function getTransporter(config: SmtpConfig): Transporter {
  const key = `${config.host}:${config.port}:${config.user}`;
  if (cached?.key === key) return cached.transporter;
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  });
  cached = { key, transporter };
  return transporter;
}

export const smtpProvider: EmailProvider = {
  name: "smtp",

  isConfigured() {
    return readConfig() !== null;
  },

  async send(message: EmailMessage): Promise<ProviderSendOutcome> {
    const config = readConfig();
    if (!config) {
      return { ok: false, error: "SMTP is not configured", retryable: false };
    }

    try {
      const info = await getTransporter(config).sendMail({
        from: config.from,
        // nodemailer takes a comma-joined list; the providers differ here, so the join
        // happens at the edge rather than in the senders.
        to: Array.isArray(message.to) ? message.to.join(", ") : message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
        ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      });
      return { ok: true, messageId: info.messageId };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        // Last provider in the chain; nothing reads this, but a timeout genuinely is transient.
        retryable: true,
      };
    }
  },
};
