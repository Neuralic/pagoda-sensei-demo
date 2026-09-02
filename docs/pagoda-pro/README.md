---
title: Pagoda Pro — Onboarding & documentation program
tags: pagoda-pro, onboarding, documentation, john
description: Core documentation program for scalable guide and advisor onboarding. Treat as part of the build, not an afterthought.
---

# Pagoda Pro — Onboarding & documentation program

**From:** John Bos · **Build owner:** Tsubasa  
**Status:** Living program — updated as product and UX simplify  
**Principle:** *If users make mistakes, simplify the workflow and improve the instructions.*

---

## Why this exists

Pagoda Pro succeeds only if **guides** and **travel advisors** can become productive **without manual support**. The software, documentation, onboarding flow, and videos are **one system**.

| Layer | Purpose |
|-------|---------|
| **Product UX** | Fewer steps, obvious next action, prevent mistakes in-app |
| **Playbooks** | Complete process for every action (this folder) |
| **Quick guides** | Short role guides with screenshots → [`../guides/`](../guides/) |
| **Videos** | Google Meet walkthroughs + recorded clips per playbook section |
| **Admin** | Approval, certification, escalation |

---

## Documents (send to users)

| Audience | Complete playbook | Quick start (screenshots) |
|----------|-------------------|---------------------------|
| **Tour operators & self-employed guides** | [GUIDE-ONBOARDING-PLAYBOOK.md](./GUIDE-ONBOARDING-PLAYBOOK.md) | [../guides/01-tour-operator.md](../guides/01-tour-operator.md) |
| **Team guides** | [GUIDE-ONBOARDING-PLAYBOOK.md](./GUIDE-ONBOARDING-PLAYBOOK.md) § Team guide | [../guides/02-team-guide.md](../guides/02-team-guide.md) |
| **Travel advisors** | [ADVISOR-ONBOARDING-PLAYBOOK.md](./ADVISOR-ONBOARDING-PLAYBOOK.md) | [../guides/03-travel-agent.md](../guides/03-travel-agent.md) |
| **Which account to open?** | [../guides/README.md](../guides/README.md) | — |

**Format:** Markdown — paste into HackMD or Google Docs, add screenshots, export PDF for email.

---

## Guide onboarding — coverage map (John’s list)

| Requirement | Playbook section | Product status |
|-------------|------------------|----------------|
| How to create an account | § 1 Account type & signup | Live |
| Which account to open | § 1 + [roles README](../guides/README.md) | Live |
| Complete profile | § 2 Profile | Live |
| Upload tours | § 3 Tour library | Live |
| Communicate with advisors | § 4 Messaging | Live (via job/itinerary) |
| Response time expectations | § 5 SLAs & best practices | **Policy** (documented; enforce via ops) |
| Best practices on requests | § 5 | Policy |
| How bookings are managed | § 6 Bookings & hire | Live |
| Reviews & feedback | § 7 Reviews | Live (agents review guides) |

---

## Advisor onboarding — coverage map (John’s list)

| Requirement | Playbook section | Product status |
|-------------|------------------|----------------|
| Search for tours | § 1 Tour library | Live |
| Contact guides | § 2 Contact & messaging | Partial — job/itinerary live; profile “Contact guide” planned |
| Request modifications | § 3 Changes & modifications | Live (itinerary/activity edit; transfer modify) |
| How to book | § 4 Booking & hire | Live |
| Manage client changes | § 5 Client changes | Live (edit itinerary) |
| Destination support | § 6 Panic & support | Live (panic alert) |
| Request price changes | § 7 Pricing & bids | Live (bids/offers; guide proposes price) |

---

## Video & Meet plan (recommended)

| Session | Doc to screen-share | Duration |
|---------|---------------------|----------|
| Operator / self-employed guide | 01-tour-operator + Playbook §1–3 | 30 min |
| Team guide | 02-team-guide + Playbook § Team | 15 min |
| Travel advisor | 03-travel-agent + Advisor Playbook §1–4 | 30 min |
| Bookings & reviews (guides) | Playbook §5–7 | 20 min |
| Booking & changes (advisors) | Advisor Playbook §3–7 | 25 min |

Record each session → cut into 2–3 min clips per section for self-serve onboarding.

---

## UX simplification backlog (documentation follows product)

When these ship, update playbooks and re-record videos:

- [x] **Contact guide** from Find Guide / public profile (no job required)
- [ ] **Self-link** tour assignments for independent guides (if product decision)
- [ ] **In-app onboarding checklist** (profile %, first tour, first bid)
- [ ] **Certification** admin UI + guide-visible status explainer
- [ ] **Advisor wizard:** search tour → add to itinerary → message guide (one path)

---

## Maintenance rule

**Every release that changes a user-facing flow** → update the matching playbook section + screenshot within one sprint. Documentation is a **definition of done** for Pagoda Pro features.
