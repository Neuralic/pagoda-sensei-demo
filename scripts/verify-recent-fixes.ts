/**
 * Quick verification for conversation portal helpers (no @/ imports).
 * Run: node --experimental-strip-types scripts/verify-recent-fixes.ts
 */

import {
  advisorConversationPathForRole,
  conversationPortalForRole,
  normalizeConversationPathForRole,
} from "../lib/conversation-portal.ts";

let failed = 0;

function assert(name: string, cond: boolean) {
  if (!cond) {
    console.error(`  ✗ ${name}`);
    failed += 1;
  } else {
    console.log(`  ✓ ${name}`);
  }
}

function resolveCommissionUserIdForTour(
  tourId: string,
  tourOwnerUserId: string,
  primaryGuideByTourId: Map<string, string>
): string {
  return primaryGuideByTourId.get(String(tourId)) ?? String(tourOwnerUserId);
}

console.log("\n=== conversation-portal ===\n");

assert("agency portal", conversationPortalForRole("agency") === "agency");
assert("guide portal", conversationPortalForRole("guide") === "guide");
assert(
  "agency email link rewrite",
  advisorConversationPathForRole("/agent/conversation", "?chatId=abc", "agency") ===
    "/agency/conversation?chatId=abc"
);
assert(
  "agent email link no rewrite",
  advisorConversationPathForRole("/agent/conversation", "?chatId=abc", "agent") === null
);
assert(
  "guide opening advisor link",
  normalizeConversationPathForRole("/agent/conversation", "?chatId=abc", "guide") ===
    "/guide/conversation?chatId=abc"
);
assert(
  "agency opening agent link",
  normalizeConversationPathForRole("/agent/conversation", "?chatId=abc", "agency") ===
    "/agency/conversation?chatId=abc"
);

console.log("\n=== commission user id resolution ===\n");

const guideMap = new Map([["tour-1", "guide-assigned"]]);
assert(
  "prefers assigned guide",
  resolveCommissionUserIdForTour("tour-1", "operator-owner", guideMap) === "guide-assigned"
);
assert(
  "falls back to tour owner",
  resolveCommissionUserIdForTour("tour-2", "guide-owner", guideMap) === "guide-owner"
);

console.log(`\n=== Results: ${failed === 0 ? "ALL PASSED" : `${failed} FAILED`} ===\n`);
process.exit(failed === 0 ? 0 : 1);
