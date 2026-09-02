/**
 * Run: npm run test:itinerary-support-chat
 * Pure-function tests for itinerary support messaging (no DB).
 */
import {
  PAGODA_SUPPORT_PEER_ID,
  buildAdvisorSupportChatOpenUrl,
  buildAdminSupportChatOpenUrl,
  enrichItinerarySupportChatForAdvisorList,
  isItinerarySupportChatKind,
  resolveSupportChatOtherParticipant,
  shouldEmailAdvisorForAdminSupportMessage,
} from "../lib/itinerary-support-chat.ts";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`);
  }
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
  }
}

console.log("\n=== itinerary-support-chat tests ===\n");

console.log("isItinerarySupportChatKind");
assert(isItinerarySupportChatKind("itinerary_support"), "recognizes support kind");
assert(!isItinerarySupportChatKind("marketplace"), "rejects marketplace");
assert(!isItinerarySupportChatKind(null), "rejects null");

console.log("\nenrichItinerarySupportChatForAdvisorList");
const advisorId = "adv-1";
const chatRow = {
  id: "chat-1",
  agency_id: advisorId,
  guide_id: null,
  client_name: "Tokyo Trip",
  chat_kind: "itinerary_support",
  itinerary_id: "itin-1",
  job_id: null,
  application_id: null,
  created_at: "2026-01-01T00:00:00Z",
};
const enriched = enrichItinerarySupportChatForAdvisorList(
  chatRow,
  advisorId,
  { "chat-1": { content: "Hello advisor", created_at: "2026-01-02T00:00:00Z" } }
);
assert(enriched != null, "returns item for owner advisor");
assertEqual(enriched?.otherParticipant.id, PAGODA_SUPPORT_PEER_ID, "peer is Pagoda Support");
assertEqual(enriched?.clientName, "Tokyo Trip", "uses trip label");
assertEqual(enriched?.chatKind, "itinerary_support", "marks chat kind");
assert(
  enrichItinerarySupportChatForAdvisorList(chatRow, "other-advisor", {}) === null,
  "hidden from non-owner advisor"
);
assert(
  enrichItinerarySupportChatForAdvisorList(
    { ...chatRow, chat_kind: "marketplace" },
    advisorId,
    {}
  ) === null,
  "ignores marketplace rows"
);
assert(
  enrichItinerarySupportChatForAdvisorList(
    { ...chatRow, agency_id: null },
    advisorId,
    {}
  ) === null,
  "hidden when agency_id missing"
);
const fallbackLabel = enrichItinerarySupportChatForAdvisorList(
  { ...chatRow, client_name: "   " },
  advisorId,
  {}
);
assertEqual(fallbackLabel?.clientName, "Itinerary", "blank client_name → Itinerary");
const noLastMsg = enrichItinerarySupportChatForAdvisorList(chatRow, advisorId, {});
assertEqual(
  noLastMsg?.lastMessageTime,
  chatRow.created_at,
  "falls back to chat created_at when no messages"
);
assertEqual(noLastMsg?.lastMessage, "", "empty last message when none");

console.log("\nresolveSupportChatOtherParticipant");
const built = (id: string) => ({
  id,
  name: `User ${id}`,
  email: `${id}@test.com`,
  avatarUrl: null,
});
const supportOther = resolveSupportChatOtherParticipant(
  { chat_kind: "itinerary_support", agency_id: advisorId, guide_id: null },
  advisorId,
  "agent",
  built
);
assertEqual(supportOther.name, "Pagoda Support", "advisor sees Pagoda Support");
const adminView = resolveSupportChatOtherParticipant(
  { chat_kind: "itinerary_support", agency_id: advisorId, guide_id: null },
  "admin-1",
  "admin",
  built
);
assertEqual(adminView.id, advisorId, "admin sees advisor as other");
const adminNonOwner = resolveSupportChatOtherParticipant(
  { chat_kind: "itinerary_support", agency_id: advisorId, guide_id: null },
  "other-user",
  "agent",
  built
);
assertEqual(adminNonOwner.id, advisorId, "non-owner sees itinerary owner as other (access gated elsewhere)");
const marketplaceAgent = resolveSupportChatOtherParticipant(
  { chat_kind: "marketplace", agency_id: advisorId, guide_id: "guide-1" },
  advisorId,
  "agent",
  built
);
assertEqual(marketplaceAgent.id, "guide-1", "marketplace: agent sees guide");
const marketplaceGuide = resolveSupportChatOtherParticipant(
  { chat_kind: "marketplace", agency_id: advisorId, guide_id: "guide-1" },
  "guide-1",
  "guide",
  built
);
assertEqual(marketplaceGuide.id, advisorId, "marketplace: guide sees agent");

console.log("\nshouldEmailAdvisorForAdminSupportMessage");
assert(
  shouldEmailAdvisorForAdminSupportMessage({
    senderIsAdmin: true,
    advisorEmail: "a@example.com",
    cooldownAllowed: true,
  }).shouldEmail,
  "admin message always emails when cooldown ok"
);
assert(
  !shouldEmailAdvisorForAdminSupportMessage({
    senderIsAdmin: true,
    advisorEmail: "a@example.com",
    cooldownAllowed: false,
  }).shouldEmail,
  "respects cooldown"
);
assertEqual(
  shouldEmailAdvisorForAdminSupportMessage({
    senderIsAdmin: true,
    advisorEmail: "",
    cooldownAllowed: true,
  }).skipReason,
  "no_recipient_email",
  "missing email skipped"
);
assert(
  !shouldEmailAdvisorForAdminSupportMessage({
    senderIsAdmin: false,
    advisorEmail: "a@example.com",
    cooldownAllowed: true,
  }).shouldEmail,
  "advisor sender does not use admin→advisor path"
);
assertEqual(
  shouldEmailAdvisorForAdminSupportMessage({
    senderIsAdmin: true,
    advisorEmail: "  ",
    cooldownAllowed: true,
  }).skipReason,
  "no_recipient_email",
  "whitespace-only email treated as missing"
);
assertEqual(
  shouldEmailAdvisorForAdminSupportMessage({
    senderIsAdmin: true,
    advisorEmail: "a@example.com",
    cooldownAllowed: false,
  }).skipReason,
  "cooldown",
  "cooldown skip reason set"
);

console.log("\nbuildAdvisorSupportChatOpenUrl");
const advisorUrl = buildAdvisorSupportChatOpenUrl("https://app.example.com", {
  chatId: "c1",
  itineraryId: "i1",
});
assert(
  advisorUrl === "https://app.example.com/agent/conversation?chatId=c1",
  "advisor link goes to conversation inbox"
);
assertEqual(
  buildAdvisorSupportChatOpenUrl("https://app.example.com/", { chatId: "c/1" }),
  "https://app.example.com/agent/conversation?chatId=c%2F1",
  "strips trailing slash and encodes chat id"
);
assertEqual(
  buildAdvisorSupportChatOpenUrl("", { chatId: "c1" }),
  "/agent/conversation?chatId=c1",
  "relative path when base empty"
);

console.log("\nbuildAdminSupportChatOpenUrl");
const adminUrl = buildAdminSupportChatOpenUrl("https://app.example.com", {
  chatId: "c1",
  itineraryId: "i1",
});
assert(
  adminUrl.includes("/admin/itineraries/i1/edit"),
  "admin link goes to itinerary edit with openChat"
);
assertEqual(
  buildAdminSupportChatOpenUrl("https://app.example.com", { chatId: "c1" }),
  "https://app.example.com/admin/conversations?chatId=c1",
  "admin fallback when no itinerary id"
);
assertEqual(
  buildAdminSupportChatOpenUrl("https://app.example.com/", {
    chatId: "c1",
    itineraryId: "trip/with/slash",
  }),
  "https://app.example.com/admin/itineraries/trip%2Fwith%2Fslash/edit?openChat=1",
  "encodes itinerary id in admin deep link"
);

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);
