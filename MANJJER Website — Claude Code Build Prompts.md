# Valzaya Website — Claude Code Build Prompts

Oct 18, 2026 · @Manoj Rajan

## How to use these prompts

Build Valzaya in six gated phases, one Claude Code session per phase. Never paste the whole document at once. Unlike Qasr Al Punjab, where customer, manager and staff screens share one site, Valzaya runs as two separate apps on one shared Supabase backend. A storefront bug can't expose the manager portal, and you can deploy each one independently.

**Method in VS Code:**

1. Create an empty folder `valzaya/`, open it in VS Code, and start Claude Code.
2. Paste the **CLAUDE.md** block as the project file first. Claude Code reads it at the start of every session.
3. Paste one phase prompt. Let Claude plan, review the plan, then let it build.
4. At the end of each phase Claude stops and shows the acceptance checklist. Test it yourself, commit to git, then start the next phase.
5. Database changes only ever happen through migration files, never by clicking in the Supabase dashboard.

**Architecture at a glance:**

| Component | Runs on | Talks to |
| --- | --- | --- |
| `apps/storefront`: customer site (valzaya.com) | Vercel, Next.js | Supabase (anon key + RLS); payment providers' hosted checkout |
| `apps/manager`: manager portal (admin.valzaya.com) | Vercel, Next.js | Supabase (authenticated staff role); server-side admin actions |
| `packages/core`: shared types, pricing/VAT, order state machine, provider interfaces | Library | Both apps |
| Supabase: Postgres, Auth, Storage, Edge Functions | Supabase cloud (migrations in `supabase/migrations`) | Webhooks from card/Tabby/Tamara/3PL; scheduled warehouse sync |
| Payment adapters: card gateway, Tabby, Tamara | Server routes and Edge Functions | Provider APIs; webhook signature checks |
| Warehouse adapter: 3PL | Edge Functions | 3PL REST API: outbound orders, stock, tracking, returns |

| Phase | Goal | Ships to customers? |
| --- | --- | --- |
| 1 | Monorepo, Supabase schema, migrations, row-level security, seed data | No |
| 2 | Storefront: waitlist mode first, then catalogue, drops, pre-orders, cart | Waitlist page goes live in Week 1 |
| 3 | Manager portal: products, drops, orders, inventory, customers | No |
| 4 | Payments: cards, Tabby, Tamara through one adapter | Yes, once providers approve |
| 5 | Warehouse API integration through one adapter | Yes, once the 3PL contract is signed |
| 6 | Hardening, legal pages, Arabic, launch checklist | Launch |

## CLAUDE.md: the master context

Save this block as `CLAUDE.md` in the project root before Phase 1. It holds the rules every phase must follow. Update it when a decision changes, for example the chosen 3PL or card gateway.

```markdown
# Valzaya — project context for Claude Code

## Business
Valzaya is a premium natural-fabric apparel brand (men + women: linen, long-staple cotton) based in the UAE,
sold direct-to-consumer in numbered, limited "drops". Stock modes per variant: `stock` (ready to ship),
`preorder` (made against paid orders, delivery date shown), `mto` (made-to-order, measured, prepaid).
No discount codes by design (brand rule); access codes for early drop access are allowed.
Currency AED. All consumer prices are VAT-inclusive (UAE VAT 5%); store net, VAT and gross per line.
Languages: English + Arabic (RTL). Consumer-facing policies, invoices and contracts must exist in Arabic.

## Architecture (do not change without asking me)
- Monorepo: pnpm workspaces + Turborepo.
- apps/storefront  — Next.js (App Router, TypeScript, Tailwind), customer site.
- apps/manager     — Next.js (App Router, TypeScript, Tailwind), manager portal. Separate deployment.
- packages/core    — shared types, zod schemas, pricing/VAT maths, order state machine,
                     PaymentProvider and WarehouseProvider interfaces.
- supabase/        — Supabase CLI project: migrations/, seed.sql, functions/ (Edge Functions).
- Hosting: Vercel (two projects) + Supabase (dev and prod projects).

## Non-negotiable rules
1. Database changes ONLY via `supabase migration new <name>` files. Never edit an applied migration;
   add a new one. Every table has RLS enabled with explicit policies. Include rollback notes.
2. Never store, log or transmit raw card data. Payments use provider-hosted checkout/redirect flows only.
3. Service-role keys and provider secrets live only in server-side env vars / Edge Function secrets.
   Never in client bundles, never committed. Provide `.env.example` files.
4. Every inbound webhook: verify signature, store raw event in `webhook_events` (idempotency key unique),
   process idempotently, return 2xx fast.
5. Do NOT invent third-party API endpoints or fields. For Tabby, Tamara, the card gateway and the 3PL,
   read their official docs first, cite the doc URL in code comments, and build behind the adapter
   interfaces in packages/core. Use a mock provider until real credentials exist.
6. Order lifecycle is a state machine in packages/core; status changes only through it, and every change
   writes `order_events` + `audit_log`.
7. Money as integer fils (1 AED = 100 fils). No floats for money.
8. Accessibility (WCAG 2.1 AA), mobile-first, fast (LCP < 2.5s on 4G for product pages).
9. Work phase by phase. At the end of each phase: run typecheck, lint, tests; list what was built,
   what is mocked, open questions; then STOP and wait for my approval.
10. Never deploy to production, run destructive SQL, or delete data without my explicit approval.

## Roles
- customer: own profile, addresses, orders, waitlist entries.
- staff roles (table `staff_members`): `owner` (me, full access), `ops` (orders, inventory, shipments;
  no settings/finance). Manager portal requires staff role; storefront never exposes staff routes.

## Integrations (adapters)
- Payments: `card` (gateway chosen after underwriting — Stripe/Tap/Checkout.com style hosted checkout),
  `tabby`, `tamara`. One PaymentProvider interface: createSession, handleWebhook, capture (if needed),
  refund, getStatus.
- Warehouse (3PL): WarehouseProvider interface: pushProducts/SKUs, createOutboundOrder, cancelOrder,
  getInventory, getShipment(tracking), createInboundAsn, createReturn, handleWebhook.

## Conventions
- TypeScript strict; zod validation at every boundary; server actions/route handlers for writes.
- Tests: Vitest for core logic, Playwright for critical flows (browse → cart → pay (mock) → order).
- Conventional commits. Small PR-sized steps.
```

## Phase 1: scaffold and Supabase schema

This phase builds the backbone. Nothing is visible to customers yet. It's the phase that makes later migration and scaling cheap, so don't rush it.

```markdown
Read CLAUDE.md. We are in PHASE 1 (scaffold + database). Plan first, show me the plan, then build.

1. Scaffold the monorepo exactly as CLAUDE.md describes (pnpm + Turborepo, apps/storefront,
   apps/manager, packages/core, supabase/). Add ESLint, Prettier, Vitest, strict tsconfig, .env.example
   for each app, and a root README with setup steps for Windows + VS Code.
2. Initialise Supabase CLI locally (supabase init, local stack via Docker). If Docker is not available
   on my machine, tell me and use a linked dev project instead.
3. Create migrations (one concern per file) for:
   - staff_members (user_id -> auth.users, role enum owner|ops), customers (profile linked to auth.users),
     addresses (UAE emirate field + international), consents (marketing email/WhatsApp, timestamped).
   - products (slug, name_en, name_ar, description_en/ar, fabric, care_en/ar, origin_country, status),
     product_variants (sku UNIQUE, barcode, size, colour, price_fils VAT-inclusive, stock_mode
     stock|preorder|mto, preorder_ship_date, active), product_media (Supabase Storage paths, alt_en/ar).
   - drops (number, title, opens_at, early_access_at, closes_at, unit_cap, status), drop_items.
   - inventory_levels (variant_id, location: 'warehouse'|'studio', on_hand, reserved, updated_from: 
     manual|3pl_sync), inventory_movements (ledger, reason).
   - waitlist_signups (email/phone, drop_id nullable, source, consent_id).
   - carts, cart_items (guest + logged in), orders (number VZ-000001, customer, totals in fils:
     subtotal_net, vat, total, currency, status, payment_method, delivery_promise_date),
     order_items (snapshot of name/size/price/vat), order_events (status history).
   - payments (provider card|tabby|tamara, provider_ref, status, amount_fils, raw_ref), refunds.
   - shipments (provider, provider_order_ref, tracking_no, carrier, status, events jsonb),
     returns (rma_no, reason, type refund|exchange, status).
   - measurements (for mto: customer_id, profile json, taken_at) — MTO-ready, not used in UI yet.
   - webhook_events (provider, event_id UNIQUE, signature_ok, payload jsonb, processed_at, error),
     integration_sync_runs (provider, kind, started_at, finished_at, counts, error), audit_log.
   - settings (key/value: store open flag, VAT TRN placeholder, shipping rates, policy versions).
4. RLS on every table. Policies: public read of active products/variants/media/open drops; customers
   read/write only their own rows; staff full access via a `is_staff(role)` SQL function; webhook and
   sync tables writable only by service role. Write SQL tests (pgTAP or a script) proving a customer
   cannot read another customer's order and anon cannot read orders.
5. packages/core: types generated from Supabase (supabase gen types), money helpers (fils, VAT split
   from inclusive price), the order state machine (pending_payment -> paid -> in_production (preorder/mto)
   -> ready_to_ship -> shipped -> delivered; plus cancelled, refunded, partially_refunded, exchange_*),
   with Vitest tests for every allowed and forbidden transition.
6. seed.sql: 4 hero products (men linen set, women linen co-ord, linen shirt, linen scarf), 2 colours,
   sizes XS–XXL, one drop "Drop 01" with cap 60, one owner staff member placeholder.

Acceptance (show me): `supabase db reset` runs clean; RLS tests pass; core tests pass; ERD as a
Mermaid diagram in docs/erd.md; list of open questions. Then STOP.
```

## Phase 2: customer storefront

Ship the waitlist mode first, so the page can collect sign-ups from Week 1 while everything else is still being built. The store mode turns on later through a setting, with no redeploy.

```markdown
Read CLAUDE.md. PHASE 1 is approved. We are in PHASE 2 (apps/storefront). Plan, show me, then build.

Brand direction: quiet luxury, editorial, lots of white space, natural-fabric textures, one serif display
font + one clean sans, muted palette (sand, ink, linen white, olive accent). No stock-photo clichés.
English + Arabic with full RTL layout switch; language toggle persists.

Step A — Waitlist mode (settings.store_open = false) — must be shippable on its own:
- Landing page: brand line, Drop 01 teaser (countdown to drops.early_access_at), founder story block,
  fabric story block, sign-up form (email and/or WhatsApp number + explicit marketing consent checkbox,
  separate for email and WhatsApp), stored in waitlist_signups + consents. Honeypot + rate limiting.
- Referral link per sign-up (?ref=code) and a "you are #N on the list" confirmation.
- Privacy notice link (placeholder page now, real text in Phase 6).

Step B — Store mode (settings.store_open = true), built behind the flag:
- Home, collection pages (men / women / drop), product detail page with size guide, fabric + care
  (en/ar), stock mode badge ("Ships in 2 days" / "Pre-order — ships by <date>" / "Made to order"),
  live units-left counter for capped drops, WhatsApp size-advice button.
- Early-access gate: during early_access window only waitlist emails (magic link) can buy.
- Cart (guest + logged in, merge on login), checkout page that collects contact, address (UAE emirate
  picker + international), delivery option, and shows VAT-inclusive totals with VAT line.
  Payment step calls a server action that returns a MOCK payment session for now (real in Phase 4).
- Inventory reservation on checkout start (reserved += qty, auto-release after 20 min via scheduled job),
  never oversell a capped drop (transaction + row lock). Pre-order variants respect drop cap, not stock.
- Customer account: magic-link login (Supabase Auth), order history, addresses, consents.
- SEO: metadata, Open Graph, product JSON-LD, sitemap, hreflang en/ar. Images via Supabase Storage
  with Next/Image.

Acceptance (show me): waitlist page deployable alone; Playwright tests for sign-up, browse → cart →
mock checkout → order created with status pending_payment; RTL screenshots; Lighthouse scores for home
and product page. Then STOP.
```

## Phase 3: manager portal

This is your cockpit, modelled on the manager screens in Qasr Al Punjab but in its own app. Every write is audited, because once there's a second staff member you'll need to know who changed what.

```markdown
Read CLAUDE.md. PHASE 2 is approved. We are in PHASE 3 (apps/manager). Plan, show me, then build.

- Auth: Supabase Auth (email + password + TOTP 2FA required for owner). Middleware blocks any user
  without a staff_members row. Separate domain/deployment from the storefront.
- Dashboard: today/7d/30d revenue (gross, VAT, net), orders by status, drop sell-through % and units
  left, waitlist size and growth, conversion (waitlist -> buyer), payment mix (card/tabby/tamara),
  low-stock alerts, orders past delivery promise date (red flag).
- Products: create/edit products + variants + media upload (Storage), en/ar fields side by side,
  SKU/barcode generator (pattern VZ-<style>-<colour>-<size>), stock mode per variant, preorder ship date,
  bulk price edit with VAT preview. Archive instead of delete.
- Drops: create drop, assign variants, cap, early-access/open/close times, status; one-click
  "open early access" and "close drop"; export waitlist for that drop (CSV, consent-filtered only).
- Orders: list with filters, detail view (items, payments, shipments, events timeline), actions that go
  through the core state machine only: mark in_production, ready_to_ship, cancel, refund (Phase 4 wires
  the real refund), print bilingual invoice/packing slip (PDF) with TRN placeholder.
- Production board (pre-order/MTO): kanban by status, grouped by style/size, to send cut lists to the
  factory (CSV export: style, colour, size, qty, due date).
- Inventory: levels per variant/location, manual adjustment with mandatory reason (writes
  inventory_movements), reconciliation view vs 3PL (populated in Phase 5).
- Customers: list, detail (orders, consents, notes), GDPR/PDPL-style data export and delete request flow.
- Returns/exchanges: create RMA, status, link to refund or replacement order.
- Settings (owner only): store_open flag, shipping rates by emirate/GCC/international, policy versions,
  staff management (invite ops user), integration status page (placeholders for Phase 4/5).
- Audit log viewer (owner only).

Acceptance (show me): role tests (ops cannot open settings; non-staff blocked); Playwright test: create
product -> add to drop -> appears on storefront; order state actions write order_events + audit_log.
Then STOP.
```

## Phase 4: payments (cards, Tabby, Tamara)

Three providers sit behind one adapter, so the card gateway can change after underwriting without a rewrite. Run this phase only once you hold sandbox credentials for each provider. Until then the mock stays in place. Tabby and Tamara each underwrite you separately, so launch can go ahead on cards alone.

```markdown
Read CLAUDE.md. PHASE 3 is approved. We are in PHASE 4 (payments). Plan, show me, then build.

Before writing code: fetch and read the CURRENT official developer docs for (1) the card gateway I name
in .env (CARD_PROVIDER=stripe|tap|checkoutcom), (2) Tabby, (3) Tamara. Summarise for me, per provider:
session/checkout creation, redirect/return URLs, webhook events + signature verification, whether payment
is authorise-then-capture, refund API, sandbox test data, AED and order-amount limits. Cite doc URLs.
If anything is unclear, ask me — do not guess endpoints.

Build:
- packages/core PaymentProvider interface (createSession, verifyAndParseWebhook, capture?, refund,
  getStatus) + a ProviderRegistry. Implement: MockProvider (kept for tests), CardProvider (hosted
  checkout only — no card fields on our pages), TabbyProvider, TamaraProvider.
- Checkout payment step: show available methods based on provider eligibility (e.g. BNPL min/max amount,
  currency AED, country), display instalment messaging on product page and cart where the provider's
  docs allow (use their official widget/snippet).
- Flow: create order (pending_payment) -> create provider session -> redirect -> return page polls
  status -> webhook is the source of truth -> state machine moves order to paid. Handle cancelled,
  expired, declined; release inventory reservation on failure/expiry.
- If a provider uses authorise-then-capture, capture when the order ships (Phase 5 hook) or per the
  provider's required timeline — implement exactly as their docs specify.
- Webhooks as Supabase Edge Functions or Next route handlers: verify signature, persist to webhook_events
  (unique event_id), idempotent processing, retries safe, alert on failures (email to owner).
- Refunds from the manager portal (full/partial) through the same provider; record refunds rows;
  state machine handles partially_refunded/refunded.
- Reconciliation page in manager: payments per provider per day vs orders; flag mismatches; export CSV
  for bookkeeping (gross, VAT, provider fee if available, net payout expected).
- Security: secrets server-side only; CSRF protection on server actions; amount always recomputed
  server-side from DB prices (never trust client totals).

Acceptance (show me): sandbox payments succeed/fail/cancel for each provider; duplicate webhook delivery
does not double-process; refund works end to end; no secret appears in client bundle (show the check).
Then STOP.
```

## Phase 5: warehouse / 3PL API integration

The adapter is built against a mock warehouse first, then pointed at the real 3PL once its contract and API docs are in hand. Before you sign with a 3PL, ask for its REST API documentation and a sandbox. A 3PL that only offers a Shopify app won't work with a custom site.

```markdown
Read CLAUDE.md. PHASE 4 is approved. We are in PHASE 5 (warehouse integration). Plan, show me, then build.

The 3PL is: <NAME> — API docs: <URL>. Read the docs first and summarise: auth method, SKU/product
sync, outbound order creation, cancellation, inventory endpoint, shipment/tracking, inbound ASN, returns,
webhooks + signature, rate limits, sandbox. Map their fields to ours in docs/3pl-mapping.md. If the docs
are missing something, list questions for the 3PL instead of guessing.

Build:
- packages/core WarehouseProvider interface + MockWarehouse (simulates pick/pack/ship with delays) +
  the real provider adapter.
- Routing rule: only order lines with stock_mode = 'stock' (or pre-order/MTO items once marked
  ready_to_ship after arriving at the warehouse) are pushed to the 3PL. MTO orders shipped direct by the
  tailor get a manual shipment entry with tracking number.
- Outbound: when an order becomes ready_to_ship, push to 3PL (Edge Function), store provider_order_ref,
  retry with exponential backoff, dead-letter after N failures with owner alert.
- Inbound: create ASN when a production batch is dispatched from the factory (from the manager
  Production board); on 3PL receipt confirmation, increase on_hand via inventory_movements.
- Status sync: webhook receiver (verified, idempotent via webhook_events) + scheduled polling fallback
  every 30 min (pg_cron or scheduled Edge Function) for orders without updates; update shipments,
  move orders shipped/delivered via the state machine; trigger payment capture if Phase 4 requires it.
- Inventory reconciliation: nightly pull of 3PL stock; compare to our on_hand; write
  integration_sync_runs; show differences in manager Inventory page; never auto-overwrite without a
  setting allowing it.
- Returns: create return in 3PL from an RMA; on receipt + grading, trigger refund or exchange flow.
- Customer notifications (email now; WhatsApp template hook later): order confirmed, in production
  (with promised date), shipped (tracking link), delivered.

Acceptance (show me): full mock lifecycle test (paid -> 3PL order -> shipped -> delivered) and a failure
test (3PL API down -> retries -> alert -> manual resend button works); reconciliation report sample.
Then STOP.
```

## Phase 6: hardening, compliance pages and launch

This phase turns a working site into one you can legally and safely take money on. The policy texts need your lawyer's review. Claude drafts them; it doesn't approve them.

```markdown
Read CLAUDE.md. PHASE 5 is approved. We are in PHASE 6 (hardening + launch). Plan, show me, then build.

Compliance pages (English + Arabic, versioned in settings, linked in footer and checkout):
- Terms of sale, Privacy notice (UAE PDPL-aligned: purposes, retention, rights, contact),
  Returns & exchanges policy, Pre-order & made-to-order terms (delivery promise, what happens if late),
  Shipping policy, Cookie notice. Mark every draft "PENDING LEGAL REVIEW" in the manager portal.
- Invoice/receipt: bilingual, dated, VAT line, TRN field (shown only once settings has a TRN).
- Checkout: explicit acceptance checkbox for terms + pre-order terms when cart has pre-order/MTO items.

Security & reliability:
- Re-run RLS tests; add tests for every new table. Supabase security advisors clean.
- Rate limiting on auth, waitlist, checkout; bot protection on forms; security headers (CSP, HSTS).
- Secrets audit; dependency audit; error monitoring (e.g. Sentry) without logging PII or payment data.
- Backups: confirm Supabase backup/PITR plan; document restore steps in docs/runbook.md.
- Migration discipline: dev -> prod via `supabase db push` only after review; document in runbook.

Performance, SEO, analytics:
- Lighthouse >= 90 on mobile for home, collection, product. Image optimisation.
- Analytics with consent banner; events: view_item, add_to_cart, begin_checkout, purchase,
  waitlist_signup (with ref code) — so CAC per channel can be measured.

Launch checklist (generate docs/launch-checklist.md and walk me through it):
- Domain + DNS + email (SPF/DKIM/DMARC), two Vercel projects, prod Supabase project, env vars set.
- Real payment credentials live and a real AED 1 test order refunded, per provider.
- 3PL live: test outbound order to my own address.
- Policies approved by a lawyer; trademark filing number in footer if available.
- store_open flag plan for Drop 01 early access.

Acceptance: checklist complete except items needing me; list them. Do NOT deploy to production
without my explicit "approve deploy". Then STOP.
```

**Before Phase 1, decide:** the domain you'll use (valzaya.com and valzaya.ae, registered as soon as the trademark search is clear), whether Docker Desktop is installed for the local Supabase stack, and which card gateway you'll apply to first.
