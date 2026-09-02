---
title: Pagoda Pro — Travel advisor onboarding playbook
tags: pagoda-pro, agent, advisor, onboarding
---

# Travel advisor onboarding playbook (Pagoda Pro)

**Audience:** Travel agents / advisors on Pagoda.  
**Goal:** An advisor can search, book, communicate, and handle changes **without calling Pagoda support**.

---

## § 1 — Account & search for tours

### Create account

1. Go to `https://[your-site]/agent/login` → **Sign up**.
2. Complete registration → verify email → log in.
3. Wait for Pagoda **approval** if menu is limited (only Settings).

> 📷 Screenshot: Agent registration  
> 📷 Screenshot: Full agent menu after approval

### Search tours — Tour Library

1. Open **Tour Library** (`/agent/tour-library`).
2. Browse or filter by location / activity type.
3. Open a tour card → see images, pricing, description.
4. Check **Available guides** — only guides the operator assigned to that tour.

**Tip:** If images are missing, refresh or report tour name to Pagoda (known issue being fixed).

> 📷 Screenshot: Tour Library grid  
> 📷 Screenshot: Tour detail + Available guides

### Find a guide by name

1. **Find Guide** (`/agent/find-guide`).
2. Search 2+ characters → **View profile** (`/g/...`).
3. Published profiles only.

**Note:** Direct **Contact guide** from profile is **coming soon**. Today: add tour/job to itinerary first (§ 2).

> 📷 Screenshot: Find Guide results

---

## § 2 — Contact guides

### Platform rule

Contact guides **only through Pagoda** for booking-related business (see Agency Terms). Exception: share logistics with **your client** 1–2 days before tour as allowed in Terms.

### How to contact a guide today

| Goal | Process |
|------|---------|
| Discuss a **specific job** | Create/publish itinerary with job → guides bid → **Conversations** |
| Message **hired guide** on itinerary | Open activity → **Message guide** |
| Message from **Find Guide** without job | **Not live yet** — create itinerary + job or library activity, then message |
| General pair chat | Conversation uses agent–guide pair (from hire/activity flow) |

### Steps — message a guide on an activity

1. Open **Itinerary** → select activity with assigned/hired guide.
2. Click **Message guide**.
3. Chat opens at `/agent/conversation/{chatId}`.

> 📷 Screenshot: Message guide on activity  
> 📷 Screenshot: Conversation thread

### Response expectations (advisors)

| You should… | Target |
|-------------|--------|
| Reply to guide bids | Within **4 business hours** |
| Confirm hire decision | Within **24 hours** of shortlist |
| Send final client details | **≥ 3 days** before tour when possible |
| Day-of issues | Use **Panic** (§ 6) + chat immediately |

---

## § 3 — Request modifications

### Itinerary & activity changes

1. Open **Itinerary** → **Edit**.
2. Change dates, times, participants, notes on activities.
3. **Save** — notify guide in the **same conversation** what changed.
4. For major changes (date, group size, price impact), wait for guide **confirmation** before telling client it is final.

### Transfer / airport booking changes

1. For **Transferz** (Airport Transfers) activities, use **Modify** on the transfer where available.
2. If modify fails, message Pagoda support with booking reference.

### Tour from library — custom requests

- Put special requests in **job notes** and chat when creating from Tour Library.
- Do not assume library description covers custom work — confirm in writing in Pagoda chat.

> 📷 Screenshot: Edit activity sidebar  
> 📷 Screenshot: Transfer modify (if applicable)

---

## § 4 — How to book

### Standard path — tour from library

```
Create itinerary
    → Add activity → Select from Tour Library
    → Choose tour, date, adults/children/infants
    → Job created on itinerary
    → Publish itinerary (when ready for guides)
    → Guides bid
    → You review bids (/agent/bids?jobId=...)
    → Hire / send offer
    → Guide confirmed in conversation
```

### Steps in detail

1. **Itineraries** → create or open itinerary.
2. **Add activity** → **Select from Library** → pick tour.
3. Set date, times, party size → save activity.
4. **Publish** itinerary when you want guides to bid (follow on-screen publish flow).
5. Open **Bids** for the job (from itinerary or job link).
6. Compare proposals → **Hire** or negotiate in chat.
7. Export **PDF** for client when itinerary is ready.

> 📷 Screenshot: Add from Tour Library  
> 📷 Screenshot: Bids page with hire button  
> 📷 Screenshot: PDF export with images

### Airport transfers

- Add activity type **Airport Transfers** → Transferz panel → quote → book → attaches to itinerary.

---

## § 5 — Manage client changes

| Client change | What you do on Pagoda |
|---------------|------------------------|
| Change date/time | Edit activity → notify guide in chat |
| Change group size | Edit participants → may affect price → request new bid or agree in chat |
| Cancel activity | Remove or cancel per itinerary tools → notify guide immediately |
| Replace guide | End/rehire flow per job rules → message both parties professionally |
| Client special request | Add to notes + chat; don’t promise until guide confirms |

### Best practice

**One source of truth:** the itinerary on Pagoda + the conversation thread. After verbal agreement with client, update the platform and confirm with the guide in writing.

---

## § 6 — Destination support (Panic)

### When to use

- Emergency on tour day (safety, lost client, serious delay).
- Situation requiring **Pagoda ops** attention, not just guide chat.

### How

1. Use **Panic alert** in the agent header (when available on your account).
2. Describe issue clearly: itinerary name, job, location, phone reachability.
3. Pagoda ops monitors admin panic queue.

**Also:** message the guide in parallel for immediate ground response.

> 📷 Screenshot: Panic alert entry  
> 📷 Screenshot: Timezone converter (planning calls across regions)

### Timezone tool

- Agents have **Timezone converter** in header — use when scheduling with guides/clients in Japan vs home market.

---

## § 7 — Price changes & bids

### How pricing works (tour library)

- Tour Library shows **agent-facing price** (includes commissions/VAT per operator settings).
- Guide bids may propose **guide price** / total — review on **Bids** page.

### Request a price change

| Stage | Action |
|-------|--------|
| Before hire | Ask guide in **chat** to revise bid, or reject and wait for new bid |
| After hire | Message guide — agree in chat; major changes may need itinerary edit + Pagoda support |
| Library tour base price | You cannot edit operator’s library price — negotiate custom job or different tour |

### Reviewing bids

1. Go to job **Bids** view.
2. Compare: price, languages, guide profile link, message quality.
3. **Hire** one guide — others notified per platform rules.

> 📷 Screenshot: Bid comparison with prices

---

## § 8 — Reviews & feedback

After a completed job, you may be prompted to **leave a review** for the guide (1–5 stars + comment).

- Reviews appear on guide **public profile**.
- Be factual and professional — disputes go to Pagoda, not public arguments.

> 📷 Screenshot: Leave review modal

---

## § 9 — Common mistakes (and fixes)

| Mistake | Why it happens | Fix |
|---------|----------------|-----|
| “No guides on this tour” | Operator didn’t assign guides | Pick another tour or ask operator |
| Messaged guide on WhatsApp first | Process unclear | Use Pagoda chat; Terms require platform contact |
| Published without checking bids | Rushed booking | Review bids before telling client guide is confirmed |
| Wrong participant count | Client changed later | Edit activity + confirm price in chat |
| Profile link doesn’t work | Guide not published | Ask guide/operator to publish at 100% |
| Images missing in PDF | Storage/signing issue | Re-export after fix; report if persistent |

**If advisors keep making the same mistake → we simplify UX and update this doc.**

---

## § 10 — Advisor onboarding checklist (Pagoda ops)

- [ ] Account approved (`guide_approved`)
- [ ] Walkthrough: Tour Library + Find Guide
- [ ] Walkthrough: create itinerary → library activity → publish → bids → hire
- [ ] Walkthrough: message guide + PDF export
- [ ] Explain Panic + timezone tool
- [ ] Send [03-travel-agent quick guide](../guides/03-travel-agent.md) with screenshots
- [ ] Pilot booking with real operator before go-live

---

*Pagoda Pro — Travel advisor onboarding playbook. Pair with [03-travel-agent quick guide](../guides/03-travel-agent.md).*
