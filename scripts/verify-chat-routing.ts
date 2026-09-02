/**
 * Run: npm run test:chat-routing
 *
 * Two production incidents this pins down:
 *
 * 1. An admin using overall access wrote to an advisor from inside their itinerary. The
 *    message stored as sent *by* the advisor, and the notifier emailed the admin team — the
 *    admin received their own message and the advisor heard nothing.
 * 2. The "+" new-thread button returned the existing thread with ok:true, because
 *    ensure-pair fell back to rows[0] when no thread matched the client name.
 *
 * Source-level checks: both live in route handlers that need cookies and a database, so the
 * behaviour is pinned where it is written rather than executed here.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { excludeSelfFromRecipients } from "../lib/chat-recipients.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

let failed = 0;

function assert(name: string, cond: boolean) {
  if (!cond) {
    console.error(`  ✗ ${name}`);
    failed += 1;
  } else {
    console.log(`  ✓ ${name}`);
  }
}

function read(relPath: string): string {
  return readFileSync(join(repoRoot, relPath), "utf8");
}

console.log("\n=== never notify the sender ===\n");

assert(
  "drops the sender's own address",
  JSON.stringify(
    excludeSelfFromRecipients(["a@pagoda.travel", "john@pagoda.travel"], "john@pagoda.travel")
  ) === JSON.stringify(["a@pagoda.travel"])
);
assert(
  "matches case-insensitively and ignores padding",
  excludeSelfFromRecipients(["John@Pagoda.Travel"], "  john@pagoda.travel ").length === 0
);
assert(
  "keeps everyone when the sender has no address",
  excludeSelfFromRecipients(["a@pagoda.travel"], null).length === 1
);
assert(
  "keeps unrelated recipients",
  excludeSelfFromRecipients(["a@pagoda.travel"], "john@pagoda.travel").length === 1
);

console.log("\n=== impersonated messages are attributed to Pagoda ===\n");

const messagesRoute = read("app/api/chats/messages/[chatId]/route.ts");
assert(
  "sender identity is resolved once, from cookies",
  messagesRoute.includes("resolveChatSenderIdentity")
);
assert(
  "the stored sender is the resolved identity, not the session user",
  messagesRoute.includes("sender_id: identity.senderId")
);
assert(
  "admin-ness no longer comes from the role cookie inside the notifier",
  !messagesRoute.includes("const jarRole =") && !messagesRoute.includes("jarRole === 'admin'")
);
assert(
  "the admin fan-out excludes the acting admin",
  messagesRoute.includes("excludeSelfFromRecipients")
);
assert(
  "the WhatsApp mirror is skipped while an admin is acting",
  messagesRoute.includes("!identity.isAdminActing")
);
assert(
  "the duplicated admin-vs-users name lookup is gone",
  !messagesRoute.includes("let senderName = 'You'")
);

const identity = read("lib/chat-sender-identity.ts");
assert(
  "identity reads impersonation through the shared helper",
  identity.includes("readImpersonation")
);
assert(
  "an impersonating admin is the sender",
  identity.includes("impersonation?.adminId")
);

console.log("\n=== the composer says who it sends as ===\n");

const panel = read("components/chat/chat-panel.tsx");
assert("composer warns while impersonating", panel.includes("Sending as Pagoda Support"));

const banner = read("components/shared/impersonation-banner.tsx");
assert(
  "banner no longer tells admins to leave before messaging",
  !banner.includes("not Message Pagoda while")
);

console.log("\n=== an identity change discards client state ===\n");

// Overall access swaps the session cookies. router.push keeps the React tree and every cache
// built for the previous identity, which is why admin screens carried on polling as the
// advisor: 183 silent 403s across 76 minutes in the 27 Aug production logs.
for (const relPath of [
  "app/admin/user/page.tsx",
  "app/admin/users/[id]/page.tsx",
  "components/view_user/view-user-modal.tsx",
  "app/agent/edit-itinerary/page.tsx",
  "components/shared/impersonation-banner.tsx",
]) {
  const src = read(relPath);
  assert(`${relPath}: hard-navigates on account switch`, src.includes("window.location.assign"));
}

assert(
  "identity is read from bootstrap, not a second cached endpoint",
  !read("components/shared/impersonation-banner.tsx").includes("use-impersonation") &&
    !read("components/chat/chat-panel.tsx").includes("use-impersonation")
);
assert(
  "a stale admin tab stops polling instead of 403ing every minute",
  read("components/admin_layout/admin-layout.tsx").includes("sessionChangedElsewhere")
);

console.log("\n=== a named thread is never silently swapped ===\n");

const ensurePair = read("app/api/chats/ensure-pair/route.ts");
assert(
  "no rows[0] fallback for a named thread",
  !/return rows\[0\] \|\| null/.test(ensurePair)
);
assert(
  "a blocked second thread reports the migration instead of reusing one",
  ensurePair.includes("20250223_chats_client_name.sql")
);
assert(
  "the general thread is still matched by emptiness, not by position",
  ensurePair.includes("isGeneralClientName")
);

const sidebar = read("components/chat/conversations-sidebar.tsx");
assert(
  "the sidebar distinguishes a new thread from a reused one",
  sidebar.includes("json?.created")
);

if (failed > 0) {
  console.error(`\n${failed} check(s) failed\n`);
  process.exit(1);
}
console.log("\nAll checks passed\n");
