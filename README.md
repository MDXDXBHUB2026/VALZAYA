# Valzaya

Monorepo for the Valzaya storefront (valzaya.com) and manager portal (admin.valzaya.com).
Project rules live in [CLAUDE.md](CLAUDE.md). Current mode: **prototype** (mock payment and
warehouse providers only, Supabase dev project only).

```
apps/storefront   Next.js customer site            http://localhost:3000
apps/manager      Next.js manager portal           http://localhost:3001
packages/core     shared types, money/VAT, order state machine, zod schemas
supabase/         migrations, seed.sql, pgTAP tests (supabase/tests/database)
docs/erd.md       ERD (Mermaid) + RLS summary
```

## Setup on Windows + VS Code

Prerequisites: Node 24+, Git for Windows, VS Code. No Docker needed — we use the cloud
`valzaya-dev` Supabase project.

1. **pnpm via Corepack (no admin needed)** — keeps the shim and cache on D:

   ```powershell
   [Environment]::SetEnvironmentVariable('COREPACK_HOME', 'D:\corepack', 'User')
   New-Item -ItemType Directory -Force D:\corepack\bin | Out-Null
   corepack enable --install-directory D:\corepack\bin pnpm
   # add D:\corepack\bin to your *user* PATH (Settings → Environment Variables), then reopen the terminal
   pnpm -v   # 10.34.7 (pinned by "packageManager" in package.json)
   ```

   Keep the pnpm store on D: with a **user-level** setting (not in the repo, so Linux CI and cloud
   sessions are unaffected): `pnpm config set store-dir D:\pnpm-store`. The npm cache is `D:\npm-cache`.

2. **Install**

   ```powershell
   cd D:\Valzaya
   pnpm install
   ```

   The Supabase CLI is a project dev dependency — run it as `pnpm supabase …`.

3. **Link the Supabase dev project** (once per machine; you'll be asked for the DB password):

   ```powershell
   pnpm supabase login
   pnpm supabase link --project-ref <valzaya-dev ref>
   ```

4. **Database**

   ```powershell
   pnpm db:push     # apply new migrations to valzaya-dev
   pnpm db:reset    # DESTRUCTIVE: wipe valzaya-dev, re-run all migrations + seed.sql
   pnpm db:test     # pgTAP RLS + state-machine tests (run in a rolled-back transaction)
   pnpm db:types    # regenerate packages/core/src/db/database.types.ts
   ```

   New schema change: `pnpm supabase migration new <name>`, write SQL (with rollback notes and
   RLS), `pnpm db:push`, `pnpm db:types`. Never edit an applied migration.

5. **Env files** — copy `apps/storefront/.env.example` and `apps/manager/.env.example` to
   `.env.local` in the same folder and fill in values from the Supabase dashboard
   (Project Settings → API). `.env*` files are git-ignored. `SUPABASE_SERVICE_ROLE_KEY` is
   server-only — never prefix it with `NEXT_PUBLIC_`.

6. **Run**

   ```powershell
   pnpm dev          # both apps
   pnpm typecheck
   pnpm lint
   pnpm test         # Vitest (packages/core)
   ```

### VS Code

Open the folder and install the recommended extensions when prompted (ESLint, Prettier,
Tailwind CSS IntelliSense, Vitest, Supabase). Format-on-save and ESLint fix-on-save are set in
`.vscode/settings.json`, and VS Code uses the workspace TypeScript version.

## Conventions

- Money is integer **fils** everywhere (`packages/core/src/money.ts`); consumer prices are
  VAT-inclusive (5%), and net/VAT/gross are stored per order line.
- Order status changes only via the state machine (`@valzaya/core` + `apply_order_transition()`).
- Conventional commits, small PR-sized steps.
