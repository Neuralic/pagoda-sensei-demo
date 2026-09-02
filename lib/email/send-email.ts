/**
 * The single outbound-mail path.
 *
 * Resend first, SMTP behind it. Which one leads is controlled by EMAIL_PROVIDER so the switch
 * can be made and reversed with an environment variable rather than a deploy — and so this
 * lands inert: with EMAIL_PROVIDER unset, behaviour is exactly what it is today.
 *
 *   EMAIL_PROVIDER=resend   Resend, falling back to SMTP on a retryable failure
 *   EMAIL_PROVIDER=smtp     SMTP only (default)
 *
 * Every send is logged with the provider that carried it and the id it returned, so the
 * question that started all of this — "did the guide actually get the email?" — has an answer
 * in the logs rather than an inference.
 */

import { mailLog } from "@/lib/ops-log";
import { resendProvider } from "@/lib/email/resend-provider";
import { smtpProvider } from "@/lib/email/smtp-provider";
import type { EmailMessage, EmailProvider, SendResult } from "@/lib/email/types";

function providerChain(): EmailProvider[] {
  const preferred = (process.env.EMAIL_PROVIDER || "smtp").trim().toLowerCase();
  const chain = preferred === "resend" ? [resendProvider, smtpProvider] : [smtpProvider];
  return chain.filter((p) => p.isConfigured());
}

function recipientCount(to: string | string[]): number {
  return Array.isArray(to) ? to.length : 1;
}

/** For logs: the domain is useful, the mailbox is not worth writing down. */
function recipientDomains(to: string | string[]): string {
  const list = Array.isArray(to) ? to : [to];
  return [...new Set(list.map((a) => a.split("@")[1] || "?"))].join(",");
}

/**
 * Send one email. Never throws — the caller gets a result and decides what to tell the user.
 *
 * A `false` in `ok` means nothing was delivered and the user should be told so; `fallback`
 * means no provider was configured at all, which is the dev-machine case and not a failure.
 */
export async function sendEmail(
  message: EmailMessage,
  context: Record<string, unknown> = {}
): Promise<SendResult> {
  const chain = providerChain();

  if (chain.length === 0) {
    mailLog.warn("send.no_provider_configured", {
      ...context,
      subject: message.subject,
      recipients: recipientCount(message.to),
    });
    return { ok: true, fallback: true };
  }

  let lastError: unknown = null;
  let firstProvider: EmailProvider["name"] | null = null;

  for (const provider of chain) {
    const outcome = await provider.send(message);

    if (outcome.ok) {
      mailLog.info("send.delivered", {
        ...context,
        provider: provider.name,
        ...(firstProvider ? { fellBackFrom: firstProvider } : {}),
        messageId: outcome.messageId,
        recipients: recipientCount(message.to),
        recipientDomains: recipientDomains(message.to),
        subject: message.subject,
      });
      return {
        ok: true,
        messageId: outcome.messageId,
        provider: provider.name,
        ...(firstProvider ? { fellBackFrom: firstProvider } : {}),
      };
    }

    lastError = outcome.error;
    mailLog.warn("send.provider_failed", {
      ...context,
      provider: provider.name,
      code: outcome.code,
      error: outcome.error,
      retryable: outcome.retryable,
      subject: message.subject,
    });

    // A permanent rejection will be permanent for the next provider too.
    if (!outcome.retryable) break;
    if (!firstProvider) firstProvider = provider.name;
  }

  mailLog.error("send.failed", lastError, {
    ...context,
    subject: message.subject,
    recipients: recipientCount(message.to),
    recipientDomains: recipientDomains(message.to),
    triedProviders: chain.map((p) => p.name).join(","),
  });
  return { ok: false, error: lastError, provider: chain[chain.length - 1]?.name };
}

/** Which provider a send would use right now. For diagnostics and the guard script. */
export function activeProviderNames(): string[] {
  return providerChain().map((p) => p.name);
}
