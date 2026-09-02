# Messaging UX Improvement Plan

Status: proposed
Owner: engineering
Created: 2026-08-27
Trigger: Aug 2026 production incident (advisor ↔ guide messages appearing "unanswered")

---

## 1. Background

An advisor (John) sent messages to a guide and to Nancy Bertschy through Pagoda.
The messages were stored successfully (HTTP 200 in production logs), but the
advisor believed they were never delivered, and the issue escalated to a client
complaint days later.

Log review showed no delivery failure. The problem was **silence in the UI**, not
a broken pipeline.

## 2. Failure chain

| Step | What happened | What the user saw |
|------|---------------|-------------------|
| 1 | Advisor sends message | Message appears in thread |
| 2 | Recipient may or may not be emailed (presence skip + 30-min cooldown) | Nothing |
| 3 | No delivery / read feedback for sender | No idea if it landed |
| 4 | Recipient taps email link on iPhone → login form | Drops off |
| 5 | No retry, no escalation | Issue surfaces days later as a complaint |

Root cause category: **missing feedback for the sender** and **dead ends for the
recipient** — not email infrastructure.

## 3. Already fixed (Aug 2026)

- Chat notification emails no longer skipped when the recipient appears "online".
- Email links use a login URL that returns the user to the correct thread.
- Login pages preserve `?redirect=` when a session already exists.
- Agency vs agent conversation URLs are rewritten to the correct portal.
- Structured logging added: `PagodaChat`, `PagodaMail`, `PagodaAuth`.

Remaining work is described below.

---

## 4. Phase 1 — Sender-side delivery visibility

**Goal:** the sender always knows whether a message was notified and read.

**Why first:** highest impact, lowest cost. The data already exists — it is
returned by the unread API and never rendered.

Existing data sources:

- `chat_participants.last_read_at` — returned by `GET /api/chats/unread` as `lastReadAt`
- `users.presence_state` / `presence_updated_at` — used today only for badges
- `PagodaChat email.sent` / `email.skip_cooldown` — logged, not surfaced

Deliverables:

1. Status line under the last outgoing message:
   - `Sent 10:30 · Emailed 10:30 · Seen 12:45`
   - `Sent 10:30 · Emailed · Not seen yet`
2. Recipient activity hint in the thread header: `Last active Aug 19`.
3. Conversation list: subtle "awaiting reply" marker on threads where the last
   outgoing message is unread by the counterparty.

Files in scope: `components/chat/chat-panel.tsx`,
`components/chat/conversations-sidebar.tsx`,
`app/api/chats/[chatId]/route.ts` (expose counterparty `last_read_at`).

Acceptance: an advisor can tell, without contacting support, whether the guide
has opened the thread.

---

## 5. Phase 2 — Remove the mobile dead end

**Goal:** a notification link never ends on a login form.

Deliverables:

1. One-tap sign-in token in chat notification emails:
   - short-lived (15 min), single-use, signed
   - authenticates and lands directly in the thread
   - reuse the existing verify / password-reset token pattern
2. Fallback to the current `?redirect=` login flow if the token is expired.

Files in scope: `lib/mailer.ts`, `lib/conversation-deep-link.ts`,
new route under `app/api/auth/` for token exchange, `middleware.ts`.

Acceptance: opening a chat email on a logged-out phone reaches the thread in one
tap.

---

## 6. Phase 3 — Explicit notification preferences

**Goal:** replace invisible heuristics with user-controlled behaviour.

Today the decision is presence-based and undiscoverable
(`recipientIsActiveInApp` in `lib/chat-email-notify.ts`), which is what caused
the missed notifications.

Deliverables:

1. Per-user setting: **Always email / Only when I'm away / Daily digest**.
2. Rule: always email the **first message in a thread**, then apply the 30-minute
   cooldown to follow-ups.
3. Settings UI for guides and advisors.

Files in scope: `lib/chat-email-notify.ts`,
`app/api/chats/messages/[chatId]/route.ts`, settings pages, new
`user_notification_preferences` table.

---

## 7. Phase 4 — Unread nudge

**Goal:** an unread message is retried once instead of going silent forever.

Today the cooldown prevents a second email and nothing ever retries.

Deliverables:

1. Scheduled job (Vercel cron — none exists in the project yet) that finds
   messages unread for more than 24 hours and sends a single reminder.
2. Reminder capped at one per thread per recipient.
3. Advisor-facing "Nudge" action that forces a notification, rate-limited.

Files in scope: `vercel.json` (new cron), new route under
`app/api/chats/`, `lib/chat-email-notify.ts`.

---

## 8. Phase 5 — Admin notification visibility

**Goal:** support answers "did they get it?" without exporting logs.

Deliverables:

1. Per-message notification status in `/admin/conversations`:
   emailed / skipped (reason) / seen, with timestamps.
2. Backed by the `PagodaChat` events, persisted to a lightweight
   `chat_notification_events` table so it survives log retention.

Files in scope: `app/admin/conversations/page.tsx`,
`app/api/admin/chats/[chatId]/route.ts`, new table + write path in
`app/api/chats/messages/[chatId]/route.ts`.

---

## 9. Phase 6 — WhatsApp as a first-class guide channel

Many guides check messaging apps rather than email. The mirror already exists
(`mirrorOutboundChatMessageToWhatsApp` in `lib/chat-whatsapp-sync.ts`) but is not
promoted.

Deliverables:

1. Prompt guides to connect WhatsApp during onboarding.
2. Show `Also sent to WhatsApp` in the thread when the mirror succeeds.
3. Include WhatsApp delivery in the Phase 1 status line.

---

## 10. Sequencing and effort

| Phase | Work | Effort | Depends on |
|-------|------|--------|------------|
| 1 | Read receipts, "not seen yet", last-active | Small | — |
| 2 | One-tap login token in emails | Medium | — |
| 3 | Notification preferences + first-message rule | Medium | — |
| 5 | Admin notification-status view | Small | logging (done) |
| 6 | WhatsApp promotion | Small | — |
| 4 | 24h unread nudge | Medium | new cron infra |

Phases 1 and 2 together would have prevented the Aug 2026 incident.

---

## 11. Operational notes

Grep tags available in production logs after the Aug 2026 deploy:

- `PagodaChat message.stored`
- `PagodaChat email.sent`
- `PagodaChat email.skip_cooldown`
- `PagodaChat email.skip_no_recipient_email`
- `PagodaMail chat.sent` / `PagodaMail chat.failed`
- `PagodaAuth auth.redirect_login`
- `PagodaAuth auth.conversation_portal_rewrite`

## 12. Known limitations

- Unread counts are computed with a 5000-row query cap in
  `app/api/chats/unread/route.ts`; will need pagination or a materialised counter
  as volume grows.
- Notification logging is stdout-only until Phase 5 adds persistence.
