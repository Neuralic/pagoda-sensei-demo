---
title: Pagoda Pro — Currency & Pricing Specification
tags: pagoda-pro, currency, fx, pricing, john, tsubasa
description: Client requirements for display currency, payment currency, FX protection, PDF price lock, and partner payout. Spec only — no implementation in this document.
---

# Pagoda Pro — Currency & Pricing Specification

**From:** John Bos  
**For:** Tsubasa (platform)  
**Status:** Requirements capture — **spec only, not yet implemented**  
**Related:** [Edits & Issues §2](./EDITS_AND_ISSUES.md) (USD + 3% FX buffer)  
**Last updated:** 24 August 2026

---

## Purpose

This document records John’s requirements for how Pagoda Pro handles **display currency**, **payment currency**, **FX conversion**, **proposal price lock**, and **partner payout**. It is the source of truth for engineering design and should be agreed with John before build starts.

---

## Executive summary

| Concept | Rule |
|---------|------|
| **Partner source price** | Always stored in **JPY** — never overwritten |
| **Display currency (advisor UI)** | User chooses **USD** or **JPY** — **one currency at a time** |
| **Default display currency** | **USD** (international advisors / host agencies) |
| **Customer-facing (Pro marketplace + PDF)** | **USD only** — partner JPY is not shown to the international client |
| **Payment / invoice currency** | **USD** (initially) — separate from display preference |
| **Partner payout currency** | **JPY** (agreed partner amount) |
| **FX protection** | **3%** buffer on USD conversion — **admin-configurable** |
| **FX rate source** | Agreed reference (e.g. **XE**) — rate + timestamp must be recorded |
| **Proposal validity** | **7 days** from issue — locked USD prices until refresh |

---

## 1. Core concepts (must stay separate)

The system must treat these as **distinct layers**, so additional currencies can be added later without rebuilding pricing.

```
Partner source price (JPY, immutable)
        ↓
   FX conversion + protection buffer (when displaying/charging in USD)
        ↓
Display currency (USD or JPY — user preference in advisor workspace)
        ↓
Payment / invoice currency (USD initially — independent of display toggle)
        ↓
Partner payout (JPY — agreed amount, unaffected by display choice)
```

| Layer | Initial value | Notes |
|-------|---------------|-------|
| Partner source price | JPY | Underlying net/agreed partner amount; **never overwritten** |
| Display currency | USD (default) or JPY | Advisor sees **one** currency at a time |
| Payment / invoice currency | USD | Customer pays Pagoda in USD; invoicing follows payment currency |
| Partner payout currency | JPY | Pagoda converts and pays the partner their agreed JPY amount |
| FX protection | 3% (configurable) | Applied only when deriving **USD** from JPY |

---

## 2. Currency selector (advisor workspace)

**Control:** `USD | JPY` toggle (mutually exclusive — never show both prices at once in the same view).

**Default:** USD.

**Exception:** Admin interfaces may show both currencies or full audit breakdown where operationally required (e.g. reconciliation, partner invoicing). This is the only case where dual display is acceptable.

### When USD is selected

- Show **only** the USD price.
- Calculate USD from the partner’s underlying JPY price.
- Apply the **3% currency protection buffer** to the USD conversion (see §3).
- Do **not** show the JPY partner price alongside USD in the same view.

### When JPY is selected

- Show **only** the **original JPY partner price** (source amount).
- Do **not** apply the 3% buffer to the JPY display price.
- Do **not** show USD alongside JPY in the same view.

---

## 3. USD price calculation

### Formula

Given:

- **Partner net (JPY):** e.g. ¥100,000  
- **Exchange rate:** e.g. ¥150 = US$1 (from reference source)  
- **FX protection:** e.g. 3% (admin-configurable)

```
USD base   = partner_jpy ÷ jpy_per_usd
USD final  = USD base × (1 + fx_protection_pct / 100)
```

### Worked example (John’s numbers)

| Step | Calculation | Result |
|------|-------------|--------|
| Partner net | — | ¥100,000 |
| Convert at ¥150 = $1 | 100,000 ÷ 150 | US$666.67 |
| Add 3% protection | 666.67 × 1.03 | **US$686.67** |

**USD view:** US$686.67  
**JPY view:** ¥100,000  

### FX rate source

- Obtain the current **USD/JPY** rate from an agreed reference source (John suggested **XE**).
- Store the rate used for each conversion (see §6).

### Admin-configurable FX protection

- The **3% buffer** must be editable in the **Admin dashboard** (platform setting).
- Changing the buffer must **not** alter stored partner JPY prices or require a pricing logic rebuild.
- New rate applies to **new** conversions; locked proposals keep their snapshot (see §4).

---

## 4. Customer-facing currency (Pagoda Pro)

John’s **final** direction for international advisors and host agencies:

- **Pagoda Pro marketplace** and **customer-facing proposals** display **USD only**.
- The partner’s underlying JPY price remains in the system as the source of truth but is **not shown to the international client**.
- The advisor workspace may still use the USD | JPY toggle for internal work (§2); exported/client materials use USD.

---

## 5. Proposal / PDF price lock (critical)

When an advisor **creates or exports a PDF proposal** for their client:

1. **Lock** the exact USD prices shown on that PDF.
2. Those locked USD prices must **carry through to booking and invoice** if the client books within the validity window.
3. **Validity period:** **7 days** from the date the proposal is issued.
4. **Within 7 days:** prices on the proposal remain valid for booking.
5. **After 7 days:** the advisor must **refresh / recalculate** the proposal before booking. The new proposal may show different USD prices based on the current exchange rate and settings at refresh time.

### What must be snapshotted per proposal export

For each line item (and optionally trip total):

| Field | Required |
|-------|----------|
| Original JPY partner price | Yes |
| Exchange rate used | Yes |
| Date/time of exchange rate | Yes |
| FX protection % applied | Yes |
| Final USD price (customer-facing) | Yes |
| Proposal issued at (timestamp) | Yes |
| Proposal valid until (issued + 7 days) | Yes |

---

## 6. Audit / system records

For every USD conversion (live display, proposal lock, or booking), the system should record:

| Field | Description |
|-------|-------------|
| `partner_jpy` | Original partner price (source) |
| `exchange_rate` | JPY per USD (or equivalent pair metadata) |
| `exchange_rate_at` | Date/time the rate was obtained |
| `fx_protection_pct` | Buffer % applied (e.g. 3) |
| `usd_base` | JPY ÷ rate, before buffer |
| `usd_final` | Customer-facing USD after buffer |
| `display_currency` | USD or JPY (context of the view) |
| `payment_currency` | USD (initially) |
| `rate_source` | e.g. `xe` |

Partner JPY in the catalog/booking payload must **never** be replaced by converted or display values.

---

## 7. Payment and payout flow

End-to-end money flow (initial model):

```
Local partner
  └── agreed JPY net (source price, stored immutably)

Pagoda Pro
  └── converts JPY → USD + FX protection % for customer display/charge

Advisor / international client
  └── sees USD price only (customer-facing)
  └── pays Pagoda in USD

Pagoda
  └── receives USD
  └── converts required amount to JPY for partner payout

Local partner
  └── receives agreed JPY amount (payout currency)
```

**Important:** Display currency (USD vs JPY toggle) does **not** change payment currency. Payment/invoicing stays **USD** initially, even if the advisor views prices in JPY internally.

---

## 8. Standard message on every customer-facing PDF

John requested a **standard disclaimer** on every exported customer PDF. Section 3 of his email was pasted twice in the source message; below is the **consolidated intent** for approval.

> **Proposed text (confirm wording with John):**
>
> Prices in this proposal are shown in US dollars (USD). USD amounts are calculated from the local partner’s Japanese yen (JPY) net price using the exchange rate and FX protection percentage in effect at the time this proposal was issued. This proposal is valid for **7 days** from the issue date. If you book within that period, the USD prices shown here apply to your booking and invoice. After 7 days, your advisor must refresh this proposal; updated USD prices may apply based on current exchange rates.

Optional shorter footer (if space is limited):

> USD prices include Pagoda’s currency protection. Valid 7 days from issue date. Prices lock at booking within the validity period.

**Action:** John to approve final copy before implementation.

---

## 9. Future extensibility

Design requirements (no implementation detail here):

- [ ] Support additional **display** currencies without changing partner JPY source storage.
- [ ] Support additional **payment** currencies later without rebuilding the pricing stack.
- [ ] Keep `display_currency` and `payment_currency` as explicit fields on proposals, bookings, and invoices.
- [ ] FX settings (rate source, protection %) remain admin-configurable platform settings.

---

## 10. Reconciliation notes (two client messages)

John sent two related messages. They align on source JPY, 3% buffer, admin setting, 7-day PDF lock, and USD payment. One nuance to confirm:

| Topic | Message A | Message B (finalize) |
|-------|-----------|----------------------|
| Advisor UI | USD **or** JPY toggle (one at a time) | — |
| Customer / Pro marketplace | — | **USD only** on marketplace and client PDF |
| Default | USD | USD |

**Working interpretation for build:**

- **Advisor workspace:** USD | JPY selector (internal); default USD.
- **Client PDF / Pro marketplace / customer-facing:** USD only; JPY never shown.
- **Admin:** may show full JPY + USD + audit fields.

**Confirm with John** if the JPY toggle is strictly for advisor internal use only (not on any client-shared link or PDF).

---

## 11. Engineering checklist (when implementation starts)

Not in scope for this document — tracking only:

- [ ] Platform setting: `fx_protection_pct` (default 3%)
- [ ] Platform setting: FX rate source (e.g. XE integration)
- [ ] Immutable `partner_jpy` on line items / partner quotes
- [ ] `display_currency` preference (user or session; default USD)
- [ ] `payment_currency` on booking/invoice (default USD)
- [ ] USD conversion helper: JPY → USD base → USD final with buffer
- [ ] Proposal export: snapshot FX fields + 7-day `valid_until`
- [ ] Booking gate: block or force refresh if proposal expired
- [ ] PDF footer: approved standard message (§8)
- [ ] Admin UI: edit FX protection % without touching partner prices
- [ ] Do **not** overwrite `providerPrice` / partner JPY on Transferz or tour lines

---

## 12. Open questions for John

1. **XE (or other) API:** Do we have credentials / contract, or should engineering propose alternatives?
2. **Rate refresh:** Intraday live rate on every page load, or daily snapshot, or only at proposal export?
3. **Expired proposal UX:** Hard block on “Book”, or warn + allow admin override?
4. **JPY toggle scope:** Advisors only, or also host-agency admin? Hidden on client preview links?
5. **Transferz / tours / guides:** Same FX rules for all line types, or tours first?
6. **PDF message:** Approve final disclaimer text (§8).
7. **Rounding:** USD to 2 decimals; JPY whole yen — confirm.

---

*Spec document only. Update this file when John confirms open items; link from roadmap and Edits & Issues §2 when build begins.*
