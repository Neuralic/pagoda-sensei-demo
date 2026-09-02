/**
 * One shape for outbound mail, whichever provider carries it.
 *
 * The mailer grew 27 senders that each built their own nodemailer transport from the same five
 * environment variables, so there was no single place to swap a provider in, retry, or even
 * count what was sent. These types are that place.
 */

export type EmailMessage = {
  /** One address, or several for an internal fan-out (Resend caps a single send at 50). */
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  /**
   * Stable key for a logically-identical send, so a retry cannot duplicate the email.
   * Resend remembers it for 24 hours.
   *
   * Leave undefined for anything deliberately re-sendable — a booking reminder the advisor
   * pressed again is a new send, and silently swallowing it is the exact bug that had advisors
   * re-uploading tours to reach a guide.
   */
  idempotencyKey?: string;
  /** Grouping for the Resend dashboard, e.g. `{ category: "booking" }`. ASCII only. */
  tags?: Record<string, string>;
};

export type EmailProviderName = "resend" | "smtp";

/**
 * Kept assignable to what the 27 senders already return, because 24 call sites branch on
 * `ok` and `fallback` — `lib/booking-confirmed-notifications` and the confirm-booking route
 * decide what to tell the advisor from exactly those fields.
 */
export type SendResult =
  | {
      ok: true;
      messageId?: string;
      /** True when nothing was actually sent — no provider configured. */
      fallback?: boolean;
      skipped?: boolean;
      provider?: EmailProviderName;
      /** Set when the primary provider failed and another one carried the message. */
      fellBackFrom?: EmailProviderName;
    }
  | {
      ok: false;
      error: unknown;
      provider?: EmailProviderName;
    };

export type ProviderSendOutcome =
  | { ok: true; messageId?: string }
  /** `retryable` decides whether the next provider is worth trying. */
  | { ok: false; error: string; code?: string; retryable: boolean };

export type EmailProvider = {
  name: EmailProviderName;
  /** False when the provider has no configuration; the caller skips it without an error. */
  isConfigured(): boolean;
  send(message: EmailMessage): Promise<ProviderSendOutcome>;
};
