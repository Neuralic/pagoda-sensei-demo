---
title: Pagoda Travel — User guides (editable)
tags: pagoda, onboarding, operator, guide, agent
description: Simple role-based guides for global onboarding. Paste into HackMD or Google Docs.
---

# Pagoda Travel — User guides

**Last updated:** June 2026  
**Format:** Markdown (editable). Copy into [HackMD](https://hackmd.io) or Google Docs. Add screenshots where marked 📷.

**Pagoda Pro — full playbooks (John’s onboarding scope):**  
[../pagoda-pro/README.md](../pagoda-pro/README.md) · [Guide playbook](../pagoda-pro/GUIDE-ONBOARDING-PLAYBOOK.md) · [Advisor playbook](../pagoda-pro/ADVISOR-ONBOARDING-PLAYBOOK.md)

---

## Which account should I use?

| I am… | Register / sign up as… | Use this guide |
|--------|-------------------------|----------------|
| A company or DMC that manages tours **and** several guides | **Tour operator** (Guide login) | [01 — Tour operator](./01-tour-operator.md) |
| A guide employed under one operator | **Team guide** (invite link from operator) | [02 — Team guide](./02-team-guide.md) |
| A **self-employed** guide who owns **their own** tours and profile | **Tour operator** (Guide login) — **same signup today** | [01 — Tour operator](./01-tour-operator.md) |
| A **self-employed** guide who only wants to **bid on jobs** (no tour library / no team) | Contact Pagoda — *Independent guide account* (separate setup) | [04 — Independent tour guide](./04-independent-tour-guide.md) |
| A travel advisor booking for clients | **Travel agent** (Agent login) | [03 — Travel agent](./03-travel-agent.md) |

### Do we need a 4th login role for self-employed guides?

**For most self-employed guides who own tours: No.** They should register as a **Tour operator**. On Pagoda today, “Guide” signup creates an operator-capable account (`is_operator`). One person can:

- Upload tours in **Tour Library**
- Publish their **own** public profile
- Link themselves to their tours in **Tour assignments**
- Bid on jobs like any other guide

**A separate “Independent tour guide” type** (job board only, no My Guides, no tour library) exists in the database for special cases but is **not** offered on the public signup form. Pagoda creates those accounts manually when needed.

### Not built yet (do not promise on calls)

- Guides **cannot** change their own **certification badge** (Provisional / Certified / Elite) — Pagoda admin sets this.
- **Team guides** cannot link themselves to tours — the operator does **Tour assignments**.
- **Contact guide** button on public profile / Find Guide (one-click chat) — coming later.

---

## Documents in this folder

| File | Audience | Length |
|------|----------|--------|
| [01-tour-operator.md](./01-tour-operator.md) | Tour companies, DMCs, **self-employed guides with own tours** | ~10 steps + screenshots |
| [02-team-guide.md](./02-team-guide.md) | Guides under an operator | ~6 steps + screenshots |
| [03-travel-agent.md](./03-travel-agent.md) | Travel agents | ~6 steps + screenshots |
| [04-independent-tour-guide.md](./04-independent-tour-guide.md) | Job-only independent guides | Short + current limits |

**For Google Meet:** Walk through one PDF/doc per audience. Add screenshots into the 📷 boxes before sending.

---

## Staging URLs (replace `[your-site]`)

| Page | URL |
|------|-----|
| Guide / operator login | `https://[your-site]/guide/login` |
| Agent login | `https://[your-site]/agent/login` |
| Settings | `https://[your-site]/settings` |
| My Guides | `https://[your-site]/guide/my-guides` |
| Tour Library (guide) | `https://[your-site]/guide/tour-library` |
| Tour assignments | `https://[your-site]/guide/guide-tour-assignments` |
| Find Guide (agent) | `https://[your-site]/agent/find-guide` |
| Agent Tour Library | `https://[your-site]/agent/tour-library` |
| Public profile | `https://[your-site]/g/your-slug` |
