# Handover Document — OPH-KI

**From:** Michael Mollath (IDS.online)
**To:** Philip Steen & Team
**Date:** 2026-04-14
**Model:** Phased transition — co-development initially, gradual handover of full ownership

---

## 1. What This Project Is

**OPH-KI** (Order Intelligence Platform) is a multi-tenant SaaS platform for dental product manufacturers. It automates the processing of incoming purchase orders from emails into structured, ERP-ready export files.

**The problem it solves:** Dental manufacturers receive 50-200 order emails per day from dealers (Henry Schein, Dental Depot, etc.) with PDF/Excel attachments. Today these are manually typed into ERP systems — slow, error-prone, and expensive. OPH-KI automates this with AI extraction.

**The key insight:** Dealers like Henry Schein always send orders in the same format, regardless of which manufacturer receives them. So we maintain dealer extraction rules globally and reuse them across all tenants. Set up once, works for everyone.

### Core Flow

```
Email arrives at tenant inbox (e.g. meisinger@oph.ids.online)
    → Postmark inbound webhook parses the email
    → Platform identifies the dealer (domain matching or AI content analysis)
    → Claude API extracts structured order data from PDF/Excel attachments
    → Tenant user reviews and corrects the extraction
    → Download ERP-compatible export (CSV, XML, JSON)
```

### Users

| Role | Who | What they do |
|------|-----|-------------|
| **Platform Admin** | Us (IDS.online) | Manage tenants, dealers, extraction rules, platform settings |
| **Tenant Admin** | Customer employees | Manage their team, article/customer catalogs, review orders |
| **Tenant User** | Customer employees | Upload orders, review extractions, download exports |

---

## 2. Current State

### Feature Status (64 features tracked)

| Status | Count | Details |
|--------|-------|---------|
| **Deployed** | 47 | Core platform is fully functional and in production |
| **In Progress** | 6 | OPH-48, OPH-53, OPH-55, OPH-56, OPH-58, OPH-59 |
| **In Review** | 9 | OPH-33, OPH-36, OPH-37, OPH-43, OPH-44, OPH-52, OPH-54, OPH-57, OPH-60, OPH-62 |
| **Planned** | 2 | OPH-61, OPH-64 |

Full feature list with specs: `features/INDEX.md`
Product roadmap: `docs/PRD.md`

### What's Deployed and Working

- Multi-tenant auth with role-based access (platform_admin, tenant_admin, tenant_user)
- Order upload via web (PDF, Excel, EML) and email forwarding
- AI extraction using Claude API with dealer-specific hints and column mappings
- Dealer recognition (domain matching + AI content analysis)
- Order review UI with inline editing
- ERP export (CSV, XML, JSON) with configurable field mapping
- Article catalog and customer catalog per tenant (with CSV import/export)
- AI article number matching and customer number matching during extraction
- Admin panel: tenant management, dealer management, ERP config, user management
- Email notifications (order confirmation, results, error alerts, forwarding)
- Trial/demo mode for prospects
- Per-tenant email forwarding addresses

### What's In Progress

| Feature | What it is |
|---------|-----------|
| OPH-48 | Platform team user management actions |
| OPH-53 | Platform admin KPI dashboard |
| OPH-55 | Sidebar navigation redesign |
| OPH-56 | Collapsible sub-groups in platform sidebar |
| OPH-58 | Split multi-file ERP export (header + lines CSV) |
| OPH-59 | Split CSV output format sample upload |

### Known Technical Debt

- No automated test suite (unit tests, integration tests) — all QA is done via code review and manual testing through the `/qa` skill
- Rate limiting is not implemented on API endpoints (low priority, auth is required)

---

## 3. Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Framework** | Next.js 16 (App Router), TypeScript | Full-stack React framework |
| **Styling** | Tailwind CSS + shadcn/ui | Component library (35+ components installed) |
| **Database** | Supabase (PostgreSQL) | Data storage with Row Level Security |
| **Auth** | Supabase Auth | JWT-based auth with custom access token hook for roles |
| **Storage** | Supabase Storage | Order file uploads (PDFs, Excel) |
| **AI** | Anthropic Claude API | Order data extraction from documents |
| **Email In** | Postmark Inbound | Webhook-based email ingestion |
| **Email Out** | Postmark Transactional | Confirmation, results, error, forwarding emails |
| **Validation** | Zod + react-hook-form | Server and client-side validation |
| **Deployment** | Vercel | Hosting, serverless functions, cron jobs |
| **Domain** | ids.online | DNS managed externally |

---

## 4. Infrastructure

### Three Environments

| Environment | URL | Git Branch | Vercel Env |
|-------------|-----|------------|------------|
| **Production** | `https://oph-ki.ids.online` | `main` | Production |
| **Staging** | `https://oph-ki-staging.ids.online` | `staging` | Preview (`staging`) |
| **Development** | `https://oph-ki-dev.ids.online` | `develop` | Preview (`develop`) |

**Git workflow:** `develop` → `staging` → `main`

### Supabase Projects

All projects are in the **ids.online** Supabase organization.

| Environment | Project ID | Dashboard URL |
|-------------|-----------|---------------|
| Production | `irmieskihipgcyhxlqlf` | `https://supabase.com/dashboard/project/irmieskihipgcyhxlqlf` |
| Staging | `ydcdimwtoyzjhbpbammb` | `https://supabase.com/dashboard/project/ydcdimwtoyzjhbpbammb` |
| Development | `ocrqzesxmalebpikutwv` | `https://supabase.com/dashboard/project/ocrqzesxmalebpikutwv` |

**Important:** Each project has `custom_access_token_hook` enabled (Authentication → Hooks). This injects `user_role` and `tenant_id` into the JWT — required for RLS to work.

### Postmark Servers

Each environment has its own Postmark server.

| Environment | Sender Email | Inbound Domain |
|-------------|-------------|----------------|
| Production | `message-from-oph@oph.ids.online` | `oph.ids.online` |
| Staging | `staging@oph.ids.online` | `oph-staging.ids.online` |
| Development | `development@oph.ids.online` | `oph-dev.ids.online` |

**Postmark dashboard:** `https://account.postmarkapp.com`
**Outbound stream:** Production uses a custom stream `oph-outbound-stream` (configured via `POSTMARK_MESSAGE_STREAM` env var).

Tenant inbound addresses follow the pattern: `{tenant-slug}@{inbound-domain}` (e.g., `meisinger@oph.ids.online`).

### Vercel

**Project:** `oph-ki` on Vercel
**Cron jobs** (defined in `vercel.json`):
- `/api/cron/cleanup-orphaned-orders` — daily at 03:00 UTC
- `/api/cron/trial-expiry-check` — daily at 08:00 UTC

Environment variables are branch-scoped in Vercel. See `docs/infrastructure.md` for the full scoping guide.

### Anthropic (Claude API)

- API key is shared across all environments
- Default extraction model: `claude-sonnet-4-6` (configurable via `EXTRACTION_MODEL`)
- Used in: `src/app/api/orders/[orderId]/extract/route.ts`

---

## 5. Access You'll Need

| Service | What to request | Who to ask |
|---------|----------------|-----------|
| **GitHub** | Collaborator access to `mycal2/oph-ki` | Michael |
| **Supabase** | Member of `ids.online` organization | Michael |
| **Vercel** | Team member on the Vercel project | Michael |
| **Postmark** | Account access or separate API tokens | Michael |
| **Anthropic** | Own API key, or shared key from Michael | Michael |

`.env.local.example` documents every required environment variable with descriptions.

---

## 6. Local Development Setup

```bash
git clone https://github.com/mycal2/oph-ki.git
cd oph-ki
npm install
cp .env.local.example .env.local
# Fill in env vars (ask Michael for dev environment values)
npm run dev
```

**Dev server:** `http://localhost:3003`

### Commands

```bash
npm run dev        # Development server
npm run build      # Production build (run before pushing to verify)
npm run lint       # ESLint
npm run start      # Start production build locally
```

### Database Migrations

Migrations live in `supabase/migrations/` (43 files, numbered sequentially). They are applied manually via the Supabase SQL Editor or CLI. There is no automated migration pipeline yet.

To set up a fresh Supabase project, see the steps in `docs/infrastructure.md` under "Adding a New Environment".

---

## 7. Development Workflow (Claude Code)

We use [Claude Code](https://docs.anthropic.com/en/docs/claude-code) with specialized skills for the full lifecycle. This is the primary development tool — not a nice-to-have.

### Feature Lifecycle

```
/requirements  →  Feature spec (features/OPH-X.md)
/architecture  →  Tech design added to spec
/frontend      →  UI components built
/backend       →  APIs, DB, RLS policies built
/qa            →  Test results added to spec
/deploy        →  Deployed to Vercel
```

### Skills Overview

| Command | What it does | Runs as |
|---------|-------------|---------|
| `/requirements` | Create feature spec from an idea | Inline (interactive) |
| `/architecture` | Design tech architecture (PM-friendly, no code) | Inline |
| `/frontend` | Build UI components (shadcn/ui first) | Sub-agent |
| `/backend` | Build APIs, database, RLS policies | Sub-agent |
| `/qa` | Test against acceptance criteria + security audit | Sub-agent |
| `/deploy` | Deploy to Vercel + production checks | Inline |
| `/dealerrule` | Generate dealer extraction hints from order samples | Inline (Sonnet) |
| `/help` | Show current status and what to do next | Inline |

### How It Works

1. **Feature specs are the source of truth.** Every feature has a spec in `features/OPH-X-name.md` with user stories, acceptance criteria, edge cases, tech design, and QA results.
2. **`features/INDEX.md` tracks all features.** Every skill reads it at start and updates it when done.
3. **Skills read files, not memory.** After context loss or a new session, the agent re-reads the spec and continues. Nothing is lost.
4. **Rules auto-apply.** Coding standards in `.claude/rules/` are loaded automatically based on which files are being edited.

### Conventions

- **Feature IDs:** Sequential — `OPH-1`, `OPH-2`, ..., `OPH-64`. Next available: `OPH-65`.
- **Commits:** `feat(OPH-X): description`, `fix(OPH-X): description`, `docs(OPH-X): ...`
- **One feature per spec file.** No combining unrelated work.
- **shadcn/ui first.** Never create custom versions of installed shadcn components. Check `src/components/ui/` before building.
- **Always read before editing.** Never assume file contents — verify by reading.

---

## 8. Project Structure (Key Directories)

```
src/
  app/
    (protected)/           # Auth-gated pages
      admin/               # Platform admin (tenants, dealers, ERP configs, dashboard)
      orders/              # Order list, upload, review
      settings/            # Tenant settings (profile, team, catalogs, email)
    api/
      admin/               # Platform admin APIs
      inbound/email/       # Postmark inbound webhook (this is where orders enter)
      orders/              # Order CRUD, extraction, export
      articles/            # Article catalog CRUD
      customers/           # Customer catalog CRUD
      cron/                # Scheduled jobs
  components/
    ui/                    # shadcn/ui primitives — NEVER recreate
    admin/                 # Admin-specific components
    orders/                # Order list, review, upload components
    article-catalog/       # Artikelstamm management
    customer-catalog/      # Kundenstamm management
    layout/                # Sidebar, navigation
  hooks/                   # Custom React hooks (auth, tenants, etc.)
  lib/                     # Core utilities
    supabase.ts            # Supabase client (server + browser)
    postmark.ts            # Postmark email sending
    types.ts               # TypeScript type definitions
    validations.ts         # Zod schemas
    extraction.ts          # AI extraction logic
features/                  # Feature specifications
dealerrules/               # Dealer extraction rule documentation
docs/                      # Product docs, infrastructure, guides
supabase/migrations/       # Database migrations (SQL)
.claude/
  skills/                  # AI development workflow skills
  rules/                   # Auto-applied coding rules
  agents/                  # Sub-agent configurations
```

---

## 9. Key Files to Understand First

If you're new to the codebase, read these files in this order:

1. **`docs/PRD.md`** — Product vision, target users, full feature roadmap
2. **`features/INDEX.md`** — Current state of all 64 features
3. **`docs/infrastructure.md`** — Three-environment setup, Supabase/Postmark/Vercel details
4. **`src/app/api/inbound/email/route.ts`** — The heart of the platform: inbound email processing, dealer recognition, extraction trigger, notifications, forwarding
5. **`src/lib/extraction.ts`** — How AI extraction works (prompt construction, dealer hints injection, chunking)
6. **`src/lib/postmark.ts`** — Email sending (confirmation, results, error notifications, forwarding)
7. **`src/lib/types.ts`** — All TypeScript types (Tenant, Order, Dealer, Article, etc.)
8. **`CLAUDE.md`** — Project context loaded into every Claude Code session

---

## 10. Important Patterns

### Row Level Security (RLS)
Every Supabase table has RLS enabled. Tenants can only see their own data. Platform admins use `adminClient` (service role) to bypass RLS when managing cross-tenant data. Never skip RLS for new tables.

### Auth Flow
Supabase Auth with a `custom_access_token_hook` that injects `user_role` (platform_admin, tenant_admin, tenant_user) and `tenant_id` into the JWT. API routes extract these from the session.

### Dealer Extraction Hints
The `extraction_hints` text field on dealer profiles is injected directly into Claude's extraction prompt. It overrides default behavior. Write hints carefully — see `/dealerrule` skill for the structured process.

### Non-Blocking Email Sending
All outbound emails (confirmation, results, forwarding) use Next.js `after()` callbacks. They run after the response is sent, so email failures never block order processing.

### Three API Layers
- `/api/...` — Tenant-facing APIs (auth via JWT, scoped to caller's tenant)
- `/api/admin/...` — Platform admin APIs (uses `requirePlatformAdmin()` + `adminClient`)
- `/api/cron/...` — Scheduled jobs (auth via `CRON_SECRET` header)

---

## 11. Immediate Priorities

The platform is stable and in production. The next features to pick up from the roadmap:

### In Progress (continue these)
- **OPH-55 / OPH-56** — Sidebar navigation redesign with collapsible groups
- **OPH-58 / OPH-59** — Split multi-file ERP export (header + lines CSV) with sample upload
- **OPH-53** — Platform admin KPI dashboard

### In Review (needs QA or final polish)
- **OPH-52** — Tenant billing model configuration
- **OPH-54** — Platform admin billing report
- **OPH-60** — Fixed value column mapping in ERP config

### Planned (ready for development)
- **OPH-61** — Configurable output filenames for split CSV export
- **OPH-64** — Admin reset Artikelstamm/Kundenstamm for tenant

Each feature has a complete spec in `features/`. Start by reading the spec, then run `/architecture` if the tech design section is empty, then `/backend` and `/frontend` to implement.

---

## 12. Questions / Support

During the transition phase, reach out to Michael for:
- Supabase/Vercel/Postmark account access
- Production environment credentials
- Domain and DNS management
- Product decisions and priority changes
- Dealer-specific extraction issues (these require domain knowledge)

**Contact:** michael.mollath@ids.online
