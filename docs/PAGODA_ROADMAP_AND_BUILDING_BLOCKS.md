---
title: Pagoda — What We Are Building (Simple Overview)
tags: pagoda, roadmap, john
description: Plain-language plan for the next 3–4 months. For John · May 2026.
---

# Pagoda — What We Are Building

**For:** John Bos  
**From:** Tsubasa (platform) + Hiroki (AI)  
**Updated:** 30 May 2026  
**Deadline we are working toward:** Pagoda Pro ready by **6 September 2026** (with ~15 days buffer if needed)

---

## In one minute

We are building **three layers** on the same platform:

| Product | Who uses it | What it is |
|---------|-------------|------------|
| **Pagoda Foundation** | Travel agents & guides today | Marketplace you use now — itineraries, tour library, jobs, messaging |
| **Pagoda Pro** | Host agencies (e.g. Fora) + their advisors | Private “tours supermarket,” better commissions, agency-only guide pools |
| **Pagoda Explorer** | Later phase | Broader explorer product (~4 months after Pro) |

**Two developers**

- **Tsubasa** — website, database, guides/operators, bookings, invoices, Transferz, admin tools  
- **Hiroki** — AI itinerary builder (uses **only your real tours/guides**, not the internet)

**Important rule John asked for**

- Test **new guide system on staging first**. Move to **production in small steps**, not one big switch — so agents, guides, and PDFs keep working.

---

## What is already live (Foundation)

| Feature | Status |
|---------|--------|
| Tour library & itineraries | Live |
| Agent ↔ guide jobs & messaging | Live |
| **Airport Transfers** (Transferz API) | Live in **production** — partners must **not** sell their own airport transfers; menu label is “Airport Transfers” (Transferz only) |
| Admin approval for new agents/guides | Live |
| reCAPTCHA against fake signups | Live |
| PDF export | Live but **needs design polish** |
| Tour images in library | **Problem** — often missing for agents (~50%); fixing after guide work |

---

## What we are building now — Guide & operator system

**Why:** Guides need professional profiles, certification tiers, and operators who manage teams. This is the base for Pro and AI.

**What works on staging today**

- Operator registers and gets approved  
- Operator invites guides by link  
- Operator manages “My Guides” and profiles  
- Public profile link for each guide (share with agents before booking)  
- Guide ↔ tour assignment (operator’s own tours only)

**Still in progress (~1 week on staging)**

- Travel agent can book the right guide for the right tour  
- Tour library shows guide name on each tour  
- Search by guide name → see their tours  
- Connect this to itinerary builder without breaking old data  

**Legacy partners**

- We will **not** force everyone to new accounts and lose their tours  
- Account creators become **operators**; team guides link under them (migration plan in progress)

**When can you tell guides to use it?**

- **Test on staging now** with new signups  
- **Tell the wider guide list only after** you and we pass a short test checklist  
- **Production for everyone** comes later, step by step (see below)

---

## Production — why we go slowly

Finishing the guide screens is **not the same** as switching the whole company to production.

These old flows must still work together:

- Job board & bidding  
- Agent–guide chat  
- Itinerary import from library  
- PDF export & pricing  
- Existing guide/agent accounts  

So: **build on staging → test → integrate one piece → then production.**

---

## Next priorities (order John agreed)

1. **Finish guide/operator system on staging** (~1 week)  
2. **Fix tour library images** (urgent for sales meetings)  
3. **Improve PDF** (professional client-facing layout)  
4. **Admin / destination manager help** without agent passwords (see Pro section)  
5. **Pagoda Pro** features (below)

---

## Pagoda Pro — John’s vision (from Fora deck & messages)

**Business model (simple)**

- Host agency (Fora) gets **free account** — no subscription from agencies  
- Advisors under that agency book **only guides in their pool** (exclusivity — legal/commercial must-have)  
- Advisor who **introduces** a guide earns **3%** of commissionable amount when colleagues book that guide  
- **Pagoda markup** example: guide ¥100,000 → +20% → client ¥120,000; host agency share of markup is **set by you in admin** (e.g. 50% of markup)  
- **Invoicing:** agent requests invoice → only **completed** jobs → agent approves → invoice to you for QuickBooks → client payment  
- **Tours supermarket:** cart, pay online, commissions calculated automatically (goal)  
- **Support tiers:** self-serve free; **$49/itinerary** destination help (Japan); later **$29/month** for multi-destination DM access (paid by agent, not Fora)  
- **Fora payment:** one lump sum per itinerary (agency + agent + referral) — invoice method  

**Advisor vs today’s “agent”**

- Host agency = **admin of their advisors** (you stay super-admin)  
- “Advisor” = Pro user under Fora; today’s “agent” = Foundation user  
- You and future **destination managers** need to see advisor↔guide chats **without** their login  

**AI (Hiroki) must work on Foundation, Pro, and Explorer** — same verified database.

**Hiroki plan corrections (from your review)**

- Remove **SmartRyde** (no longer used)  
- **Guide exclusivity** in database from month 1  
- **3% referral** in database, not only in AI  

**Timeline:** ~**3.5 months** for Pro (+15 days buffer). Explorer ~**4 months after** Pro (~8 months total if both full scope).

---

## AI itinerary builder (Hiroki · ~3.5 months)

**What the client brief says**

- Advisor fills a short form → AI builds **3 options** (Classic / Off the beaten track / Luxury)  
- **Only real Pagoda tours, guides, and prices** — no invented trips (RAG = search your database only)  
- Includes **Transferz airport transfers** in the plan (already live on platform)  
- Advisor can edit, then export **white-label PDF**  
- Needs **good tags/options** on 250+ tours — first weeks are mostly **data work** (little to see on screen for 1–2 months)

**Monthly shape (Hiroki roadmap)**

| Month | Focus |
|-------|--------|
| 1 | Database tags, exclusivity, 3% referral tracking, search/RAG setup |
| 2 | AI builds itineraries from your inventory only; smart routing between cities |
| 3 | Advisor editing, pricing, PDF proposals |
| 4 | Testing, speed, quality, ready for Pro launch |

**Updates:** Short message every ~2 weeks while data work is invisible.

---

## Timeline — what John can plan externally

| When | What you can say |
|------|------------------|
| **Now** | Transferz airport transfers live; staging guide/operator testing |
| **~1 week** | Staging ready for operator + invite + profiles + shareable guide links |
| **Before webinar / guide cohort** | We confirm checklist together — don’t mass-email until then |
| **After staging OK** | Phased production integration (weeks, not one button) |
| **Foundation fixes** | Images + PDF in parallel right after guide staging milestone |
| **6 Sep 2026** | Pro target (buffer to ~21 Sep if needed) |
| **Hiroki** | Visible AI demos from ~month 2; must finish in **3.5 months** per agreement |

---

## Agreements & communication (from our chats)

- **Payments:** Hiroki prefers **23rd of each month**; you prefer pay after a month of work — align on Slack/Line  
- **Hiroki:** weekends off OK  
- **Line group:** still blocked on invites — Slack used for AI project; you + Hiroki direct Line OK  
- **Two dates for every promise:** (1) ready on **staging**, (2) ready on **production**  
- **Jotform survey** = ideas for **in-app** questions later, not a separate integration  

---

## Decisions we need from John

1. Confirm **3% referral** vs **$20 per booking** in deck — use one rule in the system  
2. List of **existing guides** → who becomes operator vs team member (for migration)  
3. OK to keep **guide certification on staging** until production integration checklist is done?  
4. Send **latest Pro deck + Foundation edits** to Hiroki when payment/Fora terms change  

---

## Short checklist — staging test (guides)

- [ ] Operator signup + admin approval  
- [ ] Invite guide → guide completes profile  
- [ ] Assign tours to guide  
- [ ] Agent sees guide on tour / searches by guide name  
- [ ] Images show when importing tour to itinerary  
- [ ] Message guide / book flow  
- [ ] Public profile link works for agents  

---

## Reference documents

- **Fora Pro Final** — economics, certification, founding partner terms  
- **Edits 29.5** — Foundation fixes (invoicing, images, admin, jobs)  
- **Pagoda AI Developer Brief v2** — Hiroki scope (May 2026)  
- **Pagoda AI Integration Roadmap** — Hiroki 4-month technical milestones  

---

*Questions → message Tsubasa on Line. This file is also viewable in **Admin → Product Roadmap**.*
