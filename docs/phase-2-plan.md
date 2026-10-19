# Phase 2 plan — storefront (`apps/storefront`)

Status: **Step A built (approved 2026-10-19, defaults for decisions 3–6) — awaiting your acceptance.** Step B not started.
Rule: Step A ships alone. Step B starts only after Step A is accepted.

## 0. Pre-work (this PR)
| # | Item | Why |
|---|---|---|
| 0.1 | CLAUDE.md: cloud-session migration + RLS-test workflow, accepted advisor warnings | Done in this PR |
| 0.2 | GitHub Actions CI: `pnpm install --frozen-lockfile`, typecheck, lint, Vitest, Playwright on every PR | Nothing currently checks a PR before merge |
| 0.3 | CLAUDE.md + README: cloud sessions are the primary workspace; local Windows checkout optional | Done in this PR |

## Step A — Waitlist mode (`settings.store.open = false`)
Goal: a page that collects consented sign-ups, deployable on its own.

### A1. Database (new migrations, each with RLS tests added to `rls.test.sql`)
| Migration | Change |
|---|---|
| `waitlist_referrals` | `waitlist_signups.referral_code` (unique, 8 chars, URL-safe, generated), `referred_by` (fk to signup, nullable). Position = rank by `created_at`; referrals are counted, **not** used to jump the queue (no rule given for that). |
| `rate_limits` | `(bucket text, key_hash text, window_start, count)`; service-role only; IPs stored as **salted SHA-256**, never raw (PDPL). Old windows purged by pg_cron daily. |
| `join_waitlist()` | `public.join_waitlist(email, phone, consents, locale, source, ref_code, drop_id)` — one transaction: append `consents` rows (email and WhatsApp **separately**), insert/find the sign-up, return `{position, referral_code}`. `EXECUTE` granted to `service_role` only (revoked from anon/authenticated → no advisor warning). |
| `public_drop_teaser()` | Read-only: next published drop's number/title/`early_access_at`. Drops are already public-readable when `status <> 'draft'`; this may be a plain query instead — decided during build. |

### A2. App
| Area | Detail |
|---|---|
| Routing | `/[locale]` with `en` (default) and `ar`; `<html lang dir>` per locale (`dir="rtl"` for `ar`); toggle stored in a `locale` cookie; Next 16 `proxy.ts` redirects `/` by cookie → `Accept-Language` → `en`. Strings in `messages/en.json` + `messages/ar.json` (no i18n library unless needed). |
| Landing | Brand line; Drop 01 teaser with countdown to `drops.early_access_at` (server-rendered, client tick, accessible text fallback); founder story; fabric story; sign-up form; privacy link. |
| Form | Email and/or WhatsApp (E.164, UAE `+971` default, international allowed); **two unticked consent checkboxes** (email, WhatsApp) — a channel's consent is required only if that contact is given; honeypot field; zod validation shared from `packages/core`. |
| Server action | zod → honeypot (silent fake success) → rate limit (per hashed IP: 5/10 min; per contact: 3/day) → `join_waitlist()` with the service-role client (server-only module) → confirmation. Duplicate sign-up returns the same generic success, so the form can't be used to test whether an email is registered. |
| Confirmation | "You're #N on the list" + personal `?ref=CODE` link with copy/share (WhatsApp share intent). |
| Privacy page | `/[locale]/privacy` placeholder ("PENDING LEGAL REVIEW"), real text in Phase 6. |
| Design | Quiet luxury: sand / ink / linen-white / olive tokens in Tailwind 4 `@theme`; serif display + clean sans + an Arabic face, via `next/font` (self-hosted at build). Proposed: **Cormorant Garamond** + **Inter** + **IBM Plex Sans Arabic** — swap if you have brand fonts. No stock photos: CSS/linen texture placeholders until real imagery exists. |
| A11y / perf | WCAG 2.1 AA (labels, focus, contrast, reduced motion for countdown), mobile-first, no client JS beyond form + countdown. |

### A3. Acceptance (shown to you, then STOP)
- Playwright: sign-up (email only, WhatsApp only, both), consent rules, honeypot, rate limit, duplicate, `?ref=` attribution, EN↔AR toggle + RTL.
- RLS tests updated and green on dev (SQL Editor); Security Advisor re-run.
- Screenshots EN + AR (mobile + desktop); Lighthouse for the landing page.
- typecheck, lint, Vitest, Playwright green in CI.

## Step B — Store mode (behind `store.open = true`)
Step A accepted 2026-10-19. Built in PR-sized slices, each with its own tests, then STOP at the end of B6.

| Slice | Scope | Schema |
|---|---|---|
| **B1 Catalogue** | Store home (replaces the waitlist when `store.open` is true), collections (`men`, `women`, drop slug), product page: colour/size selection without JS, price (VAT-inclusive), stock badge ("Ships in 2 days" / "Pre-order — ships by …" / "Made to order" / "Sold out"), size guide, fabric + care EN/AR, WhatsApp size-advice link (only if `NEXT_PUBLIC_WHATSAPP_NUMBER` is set), product JSON-LD. With the store closed, catalogue routes redirect to the waitlist. | `variant_availability(product_id)`: per-variant in-stock **boolean** only — raw stock numbers stay staff-only. |
| **B2 Reservations + drop accounting** | Never oversell: stock reservations and capped-drop accounting under row locks; 20-min expiry. Units-left counter on the product page. | `inventory_reservations`, `order_items.drop_id`, `drop_units_left(drop_id)`, `reserve_cart()` / `release_expired_reservations()` (pg_cron or on-demand release). |
| **B3 Cart** | Guest cart (hashed token cookie) + signed-in cart, merge on login, line edit/remove, VAT-inclusive totals with VAT line. | Uses existing `carts` / `cart_items`; guest writes via service role. |
| **B4 Checkout (mock payment)** | Contact, address (UAE emirate picker + international), delivery option from `settings.shipping.rates`, server-recomputed totals → reservation → order `pending_payment` → **mock** payment session. | `create_order_from_cart()` (one transaction, prices from DB, never from the client). |
| **B5 Account + early access** | Magic-link login (Supabase Auth), order history, addresses, consents; early-access window: only waitlisted emails can buy. | Auth redirect URLs on valzaya-dev. |
| **B6 SEO + acceptance** | Metadata, Open Graph, sitemap, hreflang; Playwright browse → cart → mock checkout → `pending_payment`; RTL screenshots; Lighthouse home + product. | — |

Defaults used (change any time): size guide is a placeholder table in cm marked for replacement; product imagery is a colour-swatch placeholder until real photos are uploaded to Storage; delivery options = `settings.shipping.rates` (UAE standard free, express AED 35 — seed values).

## What I need from you before building
| # | Decision / input | Default if you don't answer |
|---|---|---|
| 1 | Approve this plan (Step A scope) | — (blocking) |
| 2 | Cloud environment secrets so Playwright can hit valzaya-dev: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (**dev project only**) — add under the session's cloud environment → Edit → environment variables. Same three as GitHub Actions secrets for CI. | Build proceeds; e2e tests run against mocks only until added |
| 3 | Founder story + fabric story copy (EN; AR translation by a human) | Marked placeholders, clearly labelled |
| 4 | Fonts | Cormorant Garamond / Inter / IBM Plex Sans Arabic |
| 5 | Drop 01 early access `2026-11-19 16:00 GST` (from seed) — real date? | Countdown uses the seed date |
| 6 | Deploying Step A: Vercel **preview** URL for review is fine; a production domain needs your explicit "approve deploy" | Preview only |

## Not in Phase 2
Real payments (Phase 4), 3PL (Phase 5), manager portal (Phase 3), legal text (Phase 6), analytics/consent banner (Phase 6).
