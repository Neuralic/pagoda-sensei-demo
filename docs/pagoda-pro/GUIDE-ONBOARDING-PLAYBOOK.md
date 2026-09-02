---
title: Pagoda Pro — Guide onboarding playbook
tags: pagoda-pro, guide, operator, onboarding
---

# Guide onboarding playbook (Pagoda Pro)

**Audience:** Tour operators, self-employed guides with own tours, team guides.  
**Goal:** A qualified guide joins, completes setup, and handles bookings with **minimal support from Pagoda**.

---

## § 1 — Account type & signup

### Which account should I open?

| Your situation | What to do |
|----------------|------------|
| I run tours and/or manage other guides | **Register as Guide** at `/guide/login` → **Tour operator** account |
| I am self-employed and own my own tours | **Same — register as Guide (Tour operator)**. No separate role needed today. |
| My employer added me to Pagoda | **Do not register.** Use the **invite link** from your operator email. |
| I only want job offers, no tour library | Contact Pagoda for an **Independent guide** account (manual setup). |

### Tour operator — create account

1. Go to `https://[your-site]/guide/login` → **Sign up**.
2. Enter name, email, phone, country, city, password.
3. Accept terms → submit.
4. Verify email with the 6-digit code.
5. Log in. You receive a **Guide number** (keep it for support).

> 📷 Screenshot: Guide registration form  
> 📷 Screenshot: Email verification

### Team guide — create account

1. Open operator’s invite: `/auth/guide-invite?token=...`
2. Add name, email, password, **photo**, video-call yes/no.
3. Verify email → log in at Guide login.

**You cannot self-register as a team guide.**

### After signup — full access

- New operator accounts are approved for full menu access after signup (staging).
- If you only see **Settings**, contact Pagoda — account approval pending.

---

## § 2 — Complete your profile

**Where:** Settings → Profile → **Guide profile** (one form).

### Checklist (all required unless noted)

| Field | Required |
|-------|----------|
| Profile photo | Yes |
| Bio | Yes |
| Languages | Yes (at least one) |
| Destinations (prefectures) | Yes |
| Video call with advisor? | Yes |
| Years of experience / tours completed | Yes |
| Experience tier (Senior / Experienced / Junior) | Yes |
| Certification text (4 fields) | Yes |
| Availability calendar | Yes (save once) |
| Intro video | Optional |

### Publish public profile

1. Save after each change — watch **Profile completeness**.
2. At **100%**, click **Publish profile**.
3. Copy link `/g/g-xxxxxxxx` — test in private browser.

**Certification badge** (Provisional / Certified / Elite) is set by **Pagoda**, not by you. Completing the form does not change the badge.

> 📷 Screenshot: Profile completeness at 100%  
> 📷 Screenshot: Public profile `/g/...`

### Team guides

Operator may pre-fill fields. You add photo, login, and confirm details. Operator usually **publishes** your profile.

---

## § 3 — Upload tours (operators & self-employed)

**Where:** Tour Library → **Add tour**.

### Steps

1. Open **Tour Library** from menu or landing.
2. Create tour: name, location, activity type, times, description, languages, pricing.
3. **Upload at least one image** (required).
4. Set status to **Published** (draft tours are invisible to agents).
5. **Tour assignments:** link yourself (and team guides) to this tour so agents see **Available guides** on the tour.

> 📷 Screenshot: Create tour with images  
> 📷 Screenshot: Tour assignments

### Team guides

You **do not** upload tours. Ask your operator to assign you in **Tour assignments**.

---

## § 4 — Communicate with travel advisors

### Rule: stay on Pagoda

All business communication with advisors must go through **Pagoda messages** until booking rules allow client contact (see Terms). Do not solicit advisors off-platform.

### How messaging works today

| Situation | How to message |
|-----------|----------------|
| You bid on a **job** | Conversation opens with the agent |
| Agent hires you on an **activity** | **Message** on itinerary activity (agent can start chat) |
| Agent finds you on **Find Guide** | **Not yet** — direct contact from profile coming; agent must add job/itinerary first |

### Where to read messages

- **Conversations** in the header (guide side).
- Replies from job board / bid notifications.

> 📷 Screenshot: Conversation thread with agent

---

## § 5 — Response times & best practices

### Pagoda Pro service standards (recommended SLAs)

| Channel | Target response | Notes |
|---------|-----------------|-------|
| New **job bid** request | Within **4 hours** (business hours JST) | Faster wins more work |
| Agent message in active booking | Within **2 hours** | Same day minimum |
| Urgent / day-of tour | Within **30 minutes** | Monitor notifications |
| Profile / invite setup | Within **48 hours** of invite | Operator can chase |

*Pagoda may formalize these in Pro terms; treat as professional minimum.*

### Best practices when you receive a request

1. **Read the full job** — date, group size, language, location, special requests.
2. **Reply in Pagoda chat** — confirm availability before bidding.
3. **Bid accurately** — price, inclusions, meeting point; do not underbid then change later.
4. **One thread per agent** — keep logistics in the same conversation.
5. **Decline clearly** if unavailable — do not ghost; agents plan client trips on your answer.
6. **Pre-tour:** share logistics only per platform rules (typically 1–2 days before, client-facing WhatsApp allowed per Terms).

### What not to do

- Do not move the booking off Pagoda to avoid commission.
- Do not accept a job you cannot staff.
- Do not change price after hire without agent agreement in chat.

---

## § 6 — How bookings are managed

### Flow (simplified)

```
Agent publishes itinerary with job(s)
        ↓
Guide sees job on board / notification
        ↓
Guide submits bid (application)
        ↓
Agent reviews bids → sends offer or hires
        ↓
Guide accepts / confirms in conversation
        ↓
Tour delivered → job marked complete
```

### Your actions

| Step | You do |
|------|--------|
| See open jobs | Guide **Landing** / job board |
| Apply | Submit bid with price and message |
| Hired | Confirm details in chat; prepare tour |
| During tour | Client logistics per Terms |
| After tour | Guide may receive **end request** — confirm job completion when prompted |
| Payment | Per Pagoda Pro commercial terms (payout engine — follow finance comms) |

### Tour library jobs

- Owner of the tour may bid immediately; other guides often have a **24-hour** window after itinerary publish (check job details).

> 📷 Screenshot: Bid submission  
> 📷 Screenshot: Hired job on landing

---

## § 7 — Reviews & feedback

### Who reviews whom

| Reviewer | Reviewed | When |
|----------|----------|------|
| **Travel agent** | **Guide** | After job completed / closed |
| Guide | Agent | **Not available** on platform today |

### What agents see

- Star rating and comments on your **public profile** (`/g/...`) when visible.
- Ratings affect trust — respond professionally to feedback offline via Pagoda if needed.

### Your responsibilities

1. Deliver the service described in the bid.
2. If agent leaves a review, you **cannot** edit it — escalate disputes to Pagoda support.
3. Maintain profile accuracy so reviews match client expectations.

> 📷 Screenshot: Reviews on public profile

---

## § 8 — Quick troubleshooting

| Problem | Action |
|---------|--------|
| Only Settings visible | Contact Pagoda for approval |
| Photo won’t preview | Save profile after upload; refresh |
| Agent can’t see me on tour | Operator: publish tour + **Tour assignments** |
| Can’t message agent | Use conversation from **job/bid**, not personal email |
| Invite wiped my profile | Operator re-saves in My Guides (fixed on latest staging) |

---

## § 9 — Onboarding completion checklist (for Pagoda ops)

Use this when certifying a guide for Pro:

- [ ] Correct account type (operator / team / independent)
- [ ] Email verified, full menu access
- [ ] Profile 100% and **published**
- [ ] At least one **published** tour (operators)
- [ ] Tour assignments set (operators)
- [ ] Team guide invite completed (if applicable)
- [ ] Test bid or test message with pilot agent
- [ ] Playbook + quick guide PDF sent with screenshots

---

*Pagoda Pro — Guide onboarding playbook. Pair with [01-tour-operator quick guide](../guides/01-tour-operator.md) for screenshots.*
