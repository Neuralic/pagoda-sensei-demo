/**
 * Structured server logs for support / Vercel grep.
 *
 * Tags: PagodaBooking | PagodaChat | PagodaMail | PagodaTransfer | PagodaAuth
 */

export const OPS_LOG_TAGS = {
  booking: "PagodaBooking",
  chat: "PagodaChat",
  mail: "PagodaMail",
  transfer: "PagodaTransfer",
  auth: "PagodaAuth",
} as const;

type LogLevel = "info" | "warn" | "error";
type OpsTag = (typeof OPS_LOG_TAGS)[keyof typeof OPS_LOG_TAGS];

function write(tag: OpsTag, level: LogLevel, step: string, data: Record<string, unknown> = {}) {
  const line = `[${tag}] ${step} ${JSON.stringify({
    ts: new Date().toISOString(),
    step,
    ...data,
  })}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function makeLogger(tag: OpsTag) {
  return {
    info(step: string, data?: Record<string, unknown>) {
      write(tag, "info", step, data ?? {});
    },
    warn(step: string, data?: Record<string, unknown>) {
      write(tag, "warn", step, data ?? {});
    },
    error(step: string, err: unknown, data: Record<string, unknown> = {}) {
      write(tag, "error", step, {
        ...data,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    },
  };
}

export const bookingLog = makeLogger(OPS_LOG_TAGS.booking);
export const chatLog = makeLogger(OPS_LOG_TAGS.chat);
export const mailLog = makeLogger(OPS_LOG_TAGS.mail);
export const transferLog = makeLogger(OPS_LOG_TAGS.transfer);
export const authLog = makeLogger(OPS_LOG_TAGS.auth);
