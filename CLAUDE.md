# Valzaya — project context for Claude Code

## Current mode: PROTOTYPE (change this section only when I say we are moving to production)
- Mock payment and warehouse providers only. No real payment or 3PL credentials.
- Development Supabase project only (`valzaya-dev`, cloud). Test data only — no real customer data.
- No Docker on this machine: use the linked cloud Supabase dev project for migrations
  (`supabase link` + `supabase db push`), never a local Docker stack.
- Never deploy to production. Ask me before installing anything system-wide.
- Machine: Windows. Project lives at D:\Valzaya. Keep caches/SDKs off C: (npm cache is D:\npm-cache).

## Business
Valzaya is a premium natural-fabric apparel brand (men + women: linen, long-staple cotton) based in the UAE,
sold direct-to-consumer in numbered, limited "drops". Stock modes per variant: `stock` (ready to ship),
`preorder` (made against paid orders, delivery date shown), `mto` (made-to-order, measured, prepaid).
No discount codes by design (brand rule); access codes for early drop access are allowed.
Currency AED. All consumer prices are VAT-inclusive (UAE VAT 5%); store net, VAT and gross per line.
Languages: English + Arabic (RTL). Consumer-facing policies, invoices and contracts must exist in Arabic.
Order numbers use the prefix VZ- (e.g. VZ-000001). SKU pattern: VZ-<style>-<colour>-<size>.

## Architecture (do not change without asking me)
- Monorepo: pnpm workspaces + Turborepo.
- apps/storefront  — Next.js (App Router, TypeScript, Tailwind), customer site (valzaya.com).
- apps/manager     — Next.js (App Router, TypeScript, Tailwind), manager portal (admin.valzaya.com).
                     Separate deployment.
- packages/core    — shared types, zod schemas, pricing/VAT maths, order state machine,
                     PaymentProvider and WarehouseProvider interfaces.
- supabase/        — Supabase CLI project: migrations/, seed.sql, functions/ (Edge Functions).
- Hosting: Vercel (two projects) + Supabase (dev and prod projects).

## Non-negotiable rules
1. Database changes ONLY via `supabase migration new <name>` files. Never edit an applied migration;
   add a new one. Every table has RLS enabled with explicit policies. Include rollback notes.
2. Never store, log or transmit raw card data. Payments use provider-hosted checkout/redirect flows only.
3. Service-role keys and provider secrets live only in server-side env vars / Edge Function secrets.
   Never in client bundles, never committed. Provide `.env.example` files. `.env*` files are git-ignored.
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
