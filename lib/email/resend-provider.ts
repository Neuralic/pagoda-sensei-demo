/**
 * Resend transport.
 *
 * Sends from a domain verified in Resend (app-pagoda.org). That is deliberately separate from
 * SMTP_FROM, which is on pagoda.travel: each provider has to send from a domain it is
 * authorised for, or Resend rejects the send with `invalid_from_address` and the fallback
 * would be papering over a misconfiguration.
 */

import { Resend } from "resend";
import { mailLog } from "@/lib/ops-log";
import type { EmailMessage, EmailProvider, ProviderSendOutcome } from "@/lib/email/types";

/**
 * Errors worth handing to the next provider.
 *
 * Transient failures and quota, plus `validation_error` and `invalid_from_address` — those two
 * are how an unverified domain shows up, and during rollout SMTP should keep the mail flowing
 * rather than dropping a booking request on the floor. A bad API key or a malformed recipient
 * is not retried: SMTP fails the same way, and the log should say so plainly.
 */
const RETRYABLE_CODES = new Set<string>([
  "rate_limit_exceeded",
  "daily_quota_exceeded",
  "monthly_quota_exceeded",
  "application_error",
  "internal_server_error",
  "validation_error",
  "invalid_from_address",
  "invalid_region",
]);

let client: Resend | null = null;

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  if (!client) client = new Resend(key);
  return client;
}

/** `"Pagoda Travel <hello@app-pagoda.org>"`. Must be on a domain verified in Resend. */
function fromAddress(): string | null {
  return process.env.RESEND_FROM_EMAIL?.trim() || null;
}

function toTagArray(tags: Record<string, string> | undefined) {
  if (!tags) return undefined;
  // Resend rejects anything outside ASCII letters, digits, underscore and dash.
  const clean = (v: string) => v.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256);
  return Object.entries(tags).map(([name, value]) => ({
    name: clean(name),
    value: clean(value),
  }));
}

export const resendProvider: EmailProvider = {
  name: "resend",

  isConfigured() {
    return Boolean(getClient() && fromAddress());
  },

  async send(message: EmailMessage): Promise<ProviderSendOutcome> {
    const resend = getClient();
    const from = fromAddress();
    if (!resend || !from) {
      return { ok: false, error: "Resend is not configured", retryable: true };
    }

    try {
      const { data, error } = await resend.emails.send(
        {
          from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
          ...(message.replyTo ? { replyTo: message.replyTo } : {}),
          ...(message.tags ? { tags: toTagArray(message.tags) } : {}),
        },
        message.idempotencyKey ? { idempotencyKey: message.idempotencyKey } : undefined
      );

      if (error) {
        mailLog.warn("resend.rejected", {
          code: error.name,
          statusCode: error.statusCode,
          message: error.message,
          retryable: RETRYABLE_CODES.has(error.name),
        });
        return {
          ok: false,
          error: error.message,
          code: error.name,
          retryable: RETRYABLE_CODES.has(error.name),
        };
      }

      return { ok: true, messageId: data?.id };
    } catch (e) {
      // Network failure or SDK throw — the message never reached Resend, so it is worth
      // another provider.
      const messageText = e instanceof Error ? e.message : String(e);
      mailLog.warn("resend.threw", { error: messageText });
      return { ok: false, error: messageText, retryable: true };
    }
  },
};
