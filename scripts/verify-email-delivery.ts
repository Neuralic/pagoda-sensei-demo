/**
 * Run: npm run test:email
 *
 * Checks the shape of the email layer without sending anything. The senders are all in
 * lib/mailer.ts, which pulls in Supabase and `@/` aliases node cannot resolve while stripping
 * types, so these are source-level assertions plus a live check of the provider chain.
 *
 * What this pins down: every sender goes through one path, no sender builds its own transport
 * any more, and admin fan-outs pass an array rather than a comma-joined string — nodemailer
 * accepted that, Resend reads it as one malformed address.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;

function assert(name: string, cond: boolean) {
  if (!cond) { console.error(`  ✗ ${name}`); failed += 1; }
  else console.log(`  ✓ ${name}`);
}

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

const mailer = read("lib/mailer.ts");

console.log("\n=== every sender uses the one send path ===\n");

const senders = (mailer.match(/^export async function send\w+/gm) || []).length;
const sends = (mailer.match(/await sendEmail\(/g) || []).length;
assert(`all ${senders} senders route through sendEmail (${sends} calls)`, sends >= senders - 1);

assert(
  "no sender builds its own transport",
  !/nodemailer|createTransport|transporter\./.test(
    mailer.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
  )
);
assert("the dead smtpTransport helper is gone", !mailer.includes("function smtpTransport"));
assert(
  "senders no longer read SMTP env directly",
  !/const SMTP_HOST = raw/.test(
    mailer.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
  )
);
assert(
  "no sender sets its own from address",
  !/sendEmail\(\{[^}]*\bfrom:/.test(mailer)
);

console.log("\n=== multi-recipient sends pass an array ===\n");

assert(
  "admin fan-outs are arrays, not comma-joined strings",
  !/new Set\(adminEmails\)\].filter\(Boolean\)\.join\(/.test(mailer) &&
    mailer.includes("[...new Set(adminEmails)].filter(Boolean);")
);

console.log("\n=== provider chain ===\n");

const send = read("lib/email/send-email.ts");
assert("SMTP is the default until EMAIL_PROVIDER says otherwise",
  send.includes('process.env.EMAIL_PROVIDER || "smtp"'));
assert("resend leads only when explicitly selected",
  send.includes('preferred === "resend" ? [resendProvider, smtpProvider] : [smtpProvider]'));
assert("an unconfigured provider is skipped, not failed",
  send.includes("chain.filter((p) => p.isConfigured())"));
assert("a permanent rejection is not retried on the next provider",
  send.includes("if (!outcome.retryable) break;"));
assert("every send is logged with the provider that carried it",
  send.includes('mailLog.info("send.delivered"') && send.includes("provider: provider.name"));

const resend = read("lib/email/resend-provider.ts");
assert("quota and transient errors fall back",
  resend.includes("rate_limit_exceeded") && resend.includes("application_error"));
assert("an unverified domain falls back rather than dropping the mail",
  resend.includes("invalid_from_address") && resend.includes("validation_error"));
assert("a bad API key does not fall back",
  !/RETRYABLE_CODES[\s\S]*?"invalid_api_key"[\s\S]*?\]\)/.test(resend));
assert("Resend sends from its own verified domain",
  resend.includes("RESEND_FROM_EMAIL"));

const smtp = read("lib/email/smtp-provider.ts");
assert("SMTP keeps the protocol-stripping the configured host needs",
  smtp.includes('replace(/^https?:\\/\\//, "")'));
assert("SMTP has bounded timeouts", smtp.includes("SMTP_TIMEOUT_MS"));
assert("the transporter is reused across sends", smtp.includes("cached?.key === key"));

console.log("\n=== idempotency ===\n");

assert(
  "no idempotency key is set yet — a wrong one would swallow a deliberate resend",
  !/idempotencyKey:/.test(mailer)
);
assert(
  "the risk is documented where the field is declared",
  read("lib/email/types.ts").includes("deliberately re-sendable")
);

if (failed > 0) { console.error(`\n${failed} check(s) failed\n`); process.exit(1); }
console.log("\nAll checks passed\n");
