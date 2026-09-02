---
title: Pagoda Travel — Guide Marketplace (reference)
tags: pagoda, marketplace, reference
description: Technical reference. For onboarding calls, use the simple role guides in docs/guides/.
---

# Pagoda Travel — Guide Marketplace

> **For onboarding PDFs / Google Meet:** use the **simple role guides** in [`docs/guides/`](./guides/README.md) — one editable document per audience, with screenshot placeholders.  
> **Last updated:** June 2026

---

## Documentation layers (Pagoda Pro)

| Layer | Purpose | Location |
|-------|---------|----------|
| **Onboarding program** | Strategy, coverage map, video plan | [docs/pagoda-pro/README.md](./pagoda-pro/README.md) |
| **Full playbooks** | Every process (bookings, SLAs, reviews, pricing) | [Guide](./pagoda-pro/GUIDE-ONBOARDING-PLAYBOOK.md) · [Advisor](./pagoda-pro/ADVISOR-ONBOARDING-PLAYBOOK.md) |
| **Quick guides** | Short steps + screenshot placeholders for Meet/PDF | [docs/guides/](./guides/README.md) |

Copy any file into **HackMD** or **Google Docs**, add screenshots at each 📷 marker, export to PDF if needed.

---

## Four roles — who does what?

| Role | Account type | Who they are | Main job on Pagoda |
|------|----------------|--------------|-------------------|
| **Tour operator** | Guide login, `is_operator` | Company or DMC; also **self-employed guide with own tours** | Tour Library, My Guides, Tour assignments, own public profile, job bids |
| **Team guide** | Guide login, invite from operator | Guide under one operator | Complete profile from invite; jobs; operator assigns tours |
| **Independent tour guide** | Guide login, Pagoda-created | Self-employed, **job board only** | Profile + respond to job offers (no tour library / no team) |
| **Travel agent** | Agent login | Advisor for clients | Tour Library, Find Guide, itineraries, PDF |

### Self-employed guide — register as Tour operator?

**Yes — recommended today.** Public “Guide” signup creates an operator-capable account. You do **not** need a separate app role if you own your tours and want Tour Library + profile + assignments.

Use **Independent tour guide** only when Pagoda sets up a job-focused account (no My Guides, no tour upload).

### Not built yet

- Guide **self-links** to tours (operators use **Tour assignments**).
- Guide changes own **certification badge** (admin only).
- **Contact guide** from public profile / Find Guide without a job.

---

## Big picture — how a guide appears on a tour (for agents)

```
Operator (or self-employed operator) publishes profile
         ↓
Operator links guide ↔ tour  (Tour assignments)
         ↓
Travel agent sees guide on that tour  (Tour Library)  or  Find Guide  or  /g/slug
```

Team guides do **not** self-assign. Independent job-only guides are not shown on tour library assignments unless product changes.

---

## URL quick reference

Replace `[your-site]` with your staging or production host.

| Page | Path |
|------|------|
| Operator / guide login | `/guide/login` |
| Agent login | `/agent/login` |
| Settings | `/settings` |
| My Guides | `/guide/my-guides` |
| Tour Library (operator) | `/guide/tour-library` |
| Tour assignments | `/guide/guide-tour-assignments` |
| Find Guide (agent) | `/agent/find-guide` |
| Agent Tour Library | `/agent/tour-library` |
| Public profile | `/g/{slug}` |
| Team guide invite | `/auth/guide-invite?token=...` |

---

## Profile completeness (guides)

Required for 100%: bio, photo, languages, video-call yes/no, destinations, experience fields, certification text (4 fields), availability calendar saved once. Intro video optional.

---

## Troubleshooting (short)

| Issue | Fix |
|-------|-----|
| Only Settings visible | `guide_approved` — admin approves account |
| Public link 404 | Profile must be **published** |
| Agent sees no tour images | Re-test after image fix deploy; report tour name |
| Team guide empty after invite | Operator re-saves in My Guides |

---

*Full step-by-step content lives in `docs/guides/`. This file is the index and reference.*
