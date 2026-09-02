---
title: Pagoda — Edits & Issues (John)
tags: pagoda, john, issues, edits
description: Client issues list — paste into HackMD. Update status as items are fixed.
---

# Pagoda — Edits & Issues

**From:** John Bos  
**For:** Tsubasa (platform) · Hiroki (Sensei)  
**Source:** *Edits & Issues.pdf*  
**HackMD:** paste this file as-is · tick boxes / change status as work lands

| Status | Meaning |
|--------|---------|
| `[ ]` Open | Not started / still an issue |
| `[x]` Done | Fixed on production |
| `WIP` | In progress |

---

## Summary

| # | Item | Owner | Status |
|---|------|-------|--------|
| 1 | Most sold / favorite tours list | Tsubasa | `WIP` |
| 2 | USD next to JPY + 3% FX buffer | Tsubasa | `[ ]` |
| 3 | WhatsApp messaging | Tsubasa | `[ ]` |
| 4 | Job closure when guide hired / reopen if removed | Tsubasa | `WIP` |
| 5 | Travel category: Free Time → Pagoda Support | Tsubasa | `WIP` |
| 6 | Guide search: tours must link to actual tours | Tsubasa | `WIP` |
| 7 | LinkedIn follow/connect on registration | Tsubasa | `[ ]` |
| 8 | Guide tour upload: bold / italics / lists | Tsubasa | `[ ]` |
| 9 | Book button → guide confirms price → system markup | Tsubasa | `WIP` |
| 10 | Intake: mandatory client name, email, WhatsApp | Tsubasa | `[ ]` |
| 11 | Admin: delete alert messages | Tsubasa | `[x]` |
| 12 | Intake: Sensei 2–3 alternatives (yes/no) | Tsubasa + Hiroki | `[ ]` |
| 13 | Mixed notes (Sensei, commission, chat, Al, Shinkansen, speed) | — | See §13 |
| 14 | Tour prices must follow admin commission | Tsubasa | `[ ]` |
| 15 | Edit Summary: scroll background itinerary | Tsubasa | `[ ]` |
| 16 | Line pricing: can guide update? Does itinerary update? | Tsubasa | `[ ]` Confirm |
| 17 | Guide price: allow `0` (free service) | Tsubasa | `[x]` |
| 18 | Back button from itinerary → forced admin login | Tsubasa | `[ ]` |
| 19 | Title + login as advisor to check logo/image | Tsubasa | `[ ]` |
| 20 | Archive itinerary if client does not book | Tsubasa | `[ ]` |
| 21 | Auto invoice (guides) + monthly host-agency commission | Tsubasa | `[ ]` |
| 22 | Show purchase price next to guide price | Tsubasa | `[ ]` |
| 23 | Admin page cleanup | Tsubasa | `[ ]` Not urgent |
| 24 | Tour Management: see all columns (location too wide) | Tsubasa | `[ ]` |
| 25 | Commission settings → library prices must adjust | Tsubasa | `[ ]` (same as 14) |
| 26 | Transferz: email when airport transfer booked | Tsubasa | `[ ]` |
| 27 | Support Alerts: delete without Reply | Tsubasa | `[x]` (same as 11) |
| 28 | Job Management search not working | Tsubasa | `[ ]` |
| 29 | Itineraries sorted by travel dates (urgency) | Tsubasa | `[ ]` |
| 30 | Chat: `+` no longer creates a new thread | Tsubasa | `[ ]` |
| 31 | Wrong redirect | Tsubasa | `[ ]` Clarify |

---

## 1. Most sold / favorite tours

We need a list of the **most sold tours**, and/or a **favorite list**.

- [x] Define: most sold = booking/hire count; favorites = advisor stars; Pagoda curated later
- [x] Build list / favorites in Tour Library

---

## 2. USD next to JPY + FX buffer

USD amounts should be listed next to JPY.

- [ ] Show USD beside JPY (API)
- [ ] Add a **3% FX protection buffer**

---

## 3. WhatsApp messaging

- [ ] WhatsApp messaging (scope: in-app ↔ WhatsApp, or links only — confirm)

---

## 4. Job closure

When a **guide is hired**:

- Job automatically **closes**
- Job **disappears** from open listings
- Additional applications are **prevented**

If the **guide is removed**:

- Job automatically **reopens**

- [x] Close job on hire
- [x] Hide from open listings + block new applications
- [x] Reopen job if hired guide is removed

---

## 5. Travel categories — Pagoda Support

Replace **Free Time** with **Pagoda Support**.

John: *Right now I am helping people with their itineraries. When Sensei goes live, it will take over from me. Plenty of people will pay for itinerary help — I will charge a fee.*

- [x] Rename Free Time → Pagoda Support everywhere (UI, PDF, types)
- [ ] Fee / commercial model for Pagoda Support (later)

---

## 6. Guide search — tours must be linked

When you search for a guide and their tours show up, those tours should be **linked to the actual tours**.

- [x] Tour names/cards in guide search open the real tour

---

## 7. LinkedIn on registration (Guide + Advisor)

Add to **Guide** and **Advisor** registration forms, something like:

> If you are not already following us on LinkedIn, please do so using the links below as we will be sharing major feature updates, news, and insights on our company page.
>
> 👉 Follow Pagoda Travel  
> 👉 Connect with John

- [ ] Add copy + links on both registration forms  
- [ ] Confirm final LinkedIn URLs with John / Al

---

## 8. Guide uploading tours — text support

Support in tour descriptions:

- Bold
- Italics
- Bullet points
- Numbered lists

- [ ] Rich text (or markdown) on tour upload / edit

---

## 9. Book button → guide confirms price

When someone books a guide, the guide should automatically be requested to **confirm the price**, then the system should **automatically update the price for the consumer**.

When an advisor is ready to book a tour or service there should be a **Book** button, which will then force the guide to confirm the price.

- [x] Book / Confirm booking button on tour/service
- [x] Guide must confirm (or amend) the live price
- [x] System applies Pagoda markup + advisor commission (see also §13)
- [x] Guide is instructed to send Pagoda an invoice for the confirmed price

---

## 10. Intake form — client contact (mandatory)

Make it **mandatory** that the advisor enters:

- Client **name**
- Client **email**
- Client **WhatsApp number** *(add this field)*

This information should be shared with the **guide after payment has been received**, so the guide can contact the client and give them their WhatsApp number.

- [ ] Mandatory name + email + WhatsApp on intake
- [ ] Share with guide **only after payment**

---

## 11. Admin — delete alert messages

I should be able to **delete alert messages** in admin.

- [x] Delete alerts without going through Reply *(see also §27)*

---

## 12. Intake — Sensei alternatives (yes/no)

Additional **yes/no** question on the intake form:

> Does the advisor want Sensei to upload **two or three alternatives** instead of just one, if they are available?

So clients can choose which tours they like best and inform the advisor.

- [ ] Add yes/no on intake
- [ ] Hiroki: Sensei generates 2–3 options when requested

---

## 13. Already discussed (mixed)

### Sensei / Hiroki

- [ ] Hiroki — testing Sensei

### Commission per tour (advisor)

- [ ] Can the advisor adjust commission **for each individual tour**?

When an advisor books a tour or service:

1. Guide **confirms the price**
2. System applies **our markup + 15%**
3. Advisor decides **how much commission** they take on each tour/service

John: *What do you think?*

- [ ] Confirm commercial rule with John, then implement

### Messaging in itinerary builder

- [ ] Messaging inside the itinerary builder **does not work**

### Al (operations)

Al (short for Alison) — American, potential operations manager. He has set up Facebook and LinkedIn and will start approaching travel advisors through LinkedIn campaigns.

- [ ] No product ticket — FYI / ops

### Shinkansen tickets (Eriko)

Eriko takes care of Shinkansen tickets. She needs to be able to **add ticket prices**. Almost every advisor books this — **please give this special attention**.

- [ ] Eriko can add / update Shinkansen ticket prices

### Performance

Preview and loading tours into the itinerary is taking **much longer than before**. Please speed this up like it was a few days ago.

- [ ] Restore itinerary tour preview / load speed

---

## 14. Tour prices ↔ admin commission

Tour prices should be linked to **commissions in admin**. When I increase the commission for a provider, **all prices in the system should increase**. That is not the case right now and this is costing money.

- [ ] Provider commission change updates all related prices *(same theme as §25)*

---

## 15. Edit Summary — scroll background

When editing the summary, I can no longer move the page in the background up and down, so I cannot see what is planned for that day. That was possible before. Please bring that back.

- [ ] Allow scrolling the itinerary behind Edit Summary modal

---

## 16. Line pricing

Is the guide able to **update their price here**? And will the updated price **show up on the itinerary**?

- [ ] Confirm current behaviour
- [ ] If not: guide update → itinerary price updates

---

## 17. Guide price — allow zero

If I want to offer a service **free of charge**, I should be able to enter **0**. Right now that is not possible — I have to enter a number even if it’s 1.

- [x] Allow price `0` for free services

---

## 18. Back button → admin login again

When I am in an itinerary and click **Back**, I have to log in as admin again. Annoying.

- [ ] Stay logged in / don’t dump admin to login on Back

---

## 19. Title + check advisor logo/image

The title needs a little work.

It would be great if I can **log into their account** so I can check if they uploaded a logo or image.

- [ ] Clarify which “title” (PDF cover / itinerary / profile?)
- [ ] Overall access already exists — confirm John can open advisor account and see logo/image, or improve this flow

---

## 20. Archive itinerary

Is there a possibility to **save an itinerary to archive** if the travel advisor has been working on it and the client decides not to book?

- [ ] Archive itinerary (and restore if needed)

---

## 21. Invoices & monthly host payouts

When guides are booked by advisors, the system should create an **invoice**, so we don’t have to ask the guide to send us one.

Same for **commission to advisors / host agency**: on a monthly basis the system should tell us:

- How much we pay the **guide**
- How much money is **coming in**
- How much goes to the **host agency**

Then we can transfer payouts into one account and revenue into a separate account.

- [ ] Auto-generate guide invoices on booking
- [ ] Monthly host-agency / advisor commission report

---

## 22. Purchase price next to guide price

Please add our **purchase price** next to “guide price”, so I can see the price I am being charged. Guides make mistakes.

- [ ] Show Pagoda purchase / cost price beside guide price (admin / advisor view as agreed)

---

## 23. Admin page cleanup *(not urgent)*

Admin page needs cleaning up. Certain functions are not working properly or maybe should not even be there.

- [ ] Audit Admin nav & broken features
- [ ] Remove or fix unused items *(not urgent)*

---

## 24. Tour Management (Admin) — view everything

Create a **view** where I can see everything. Right now **Location** takes an enormous amount of real estate and I cannot see anything on the right-hand side.

- [ ] Horizontal scroll / tighter columns / hide Location width so all columns are visible

---

## 25. Commission settings → library prices

If I change commission settings here, then the price automatically in the library should adjust.

- [ ] Same as §14 — library prices follow commission changes

---

## 26. Transferz — booking email

Is it possible to get an **email notification** as soon as someone has booked an airport transfer? Sometimes I simply forget.

- [ ] Email Pagoda (John / ops) on Transferz booking

---

## 27. Support Alerts — delete without Reply

It would be nice if we can simply **delete an alert**, without hitting the Reply button.

- [x] Delete alert action *(same as §11)*

---

## 28. Job Management — search broken

Not working properly. I entered the name of an advisor and it just showed up *(search/filter does not find the right jobs)*.

- [ ] Fix Job Management search by advisor name

If more issues are found, they will be posted here.

---

## 29. Itineraries — sort by travel dates

Please re-organize these itineraries based on **travel dates** instead of the date the advisor uploaded the itinerary, so I can see which upcoming itineraries are most urgent.

- [ ] Default sort: start date / upcoming first (admin + advisor lists as needed)

---

## 30. Chat — new thread (`+`) broken

I no longer can add another thread. Normally I click the **+** icon on the left and it would create a separate thread. This no longer works.

- [ ] Restore `+` → new conversation thread

---

## 31. Wrong redirect

- [ ] Clarify: which page, after which action, where it should go
- [ ] Fix redirect

---

## Notes for engineering

- **§11 + §27** — same feature: delete support alerts in admin.
- **§14 + §25** — same feature: admin commission → all tour/library prices update.
- **§9 + §13 commission flow** — Book → guide confirm price → Pagoda markup + 15% → advisor commission per tour.
- **§5** — Free Time → Pagoda Support: canonical type + display; leftover DB labels mapped.
- **§18 / §20** — Back-to-login and archive may already be partially done; verify production.
- **§1** — Tour Library: Favorites (heart) + Most sold (hire count). Pagoda curated list not built.
- **§4** — Hire hides job + blocks applications; remove-guide reopens the board (was stuck hidden by closed hiring history).
- **§6** — Find a guide tour names link to Tour Library (`?tourId=`).

---

*Living list — update checkboxes after each release. John: add new issues at the bottom or under §28.*
